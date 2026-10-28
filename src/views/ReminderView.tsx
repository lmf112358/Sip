import { useEffect, useMemo, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { convertFileSrc } from "@tauri-apps/api/core";
import { I18nProvider, useT } from "@/i18n";
import type { MsgKey } from "@/i18n/zh";
import { api, isTauri } from "@/lib/api";
import { DEFAULT_SETTINGS, applyTheme } from "@/lib/store";
import type { RemindPayload, Settings } from "@/lib/types";
import { fmtClock } from "@/lib/format";
import { actionLabel, taskLabel } from "@/lib/labels";
import { taskColor } from "@/lib/tokens";
import { TaskIcon } from "@/components/icons/TaskIcon";

const qs = new URLSearchParams(location.search);
const paramTask = qs.get("task") ?? "";
const isPreview = qs.get("preview") === "1";

export const BG_GRADIENT: Record<string, string> = {
  dawn: "radial-gradient(circle at 30% 18%, #123a5a 0%, #0a1b2c 55%, #05090e 100%)",
  mint: "radial-gradient(circle at 30% 18%, #0b3a2f 0%, #061d18 55%, #040b09 100%)",
  dusk: "radial-gradient(circle at 30% 18%, #2b1d4a 0%, #150e26 55%, #08050f 100%)",
  amber: "radial-gradient(circle at 30% 18%, #3a2a0d 0%, #1c1408 55%, #0b0804 100%)",
  night: "radial-gradient(circle at 30% 18%, #141b24 0%, #0b0f14 60%, #05080b 100%)",
  paper: "radial-gradient(circle at 30% 18%, #eef2f7 0%, #d7dfe9 60%, #b9c6d6 100%)",
  water: "radial-gradient(circle at 30% 18%, #0b3350 0%, #061c2c 55%, #04090e 100%)",
};

export function ReminderView() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [taskId, setTaskId] = useState(paramTask);
  const [payload, setPayload] = useState<RemindPayload | null>(null);
  const [bgUrl, setBgUrl] = useState<string>("");
  const [left, setLeft] = useState(0);
  // 倒计时是否已初始化。没有这个标记时，payload 到达的那一次提交里
  // left 还是初始 0，"归零即关闭"的 effect 会立刻把提醒完成/关掉。
  const [armed, setArmed] = useState(false);
  const [closing, setClosing] = useState(false);
  // 防重复提交：点一次「完成」后，onClick 还会冒泡到根节点触发「点任意处关闭」，
  // 手快双击也会走两遍 —— 前者会让窗口在写记录途中被销毁，后者直接写两条记录。
  const actedRef = useRef(false);
  const closingRef = useRef(false);

  useEffect(() => {
    api.getSettings().then((s) => {
      setSettings(s);
      applyTheme(s);
    });
  }, []);

  useEffect(() => {
    if (!payload?.bgImage) {
      setBgUrl("");
      return;
    }
    if (!isTauri()) return;
    api
      .mediaPath(payload.bgImage)
      .then((p) => {
        if (p) setBgUrl(convertFileSrc(p));
      })
      .catch(() => undefined);
  }, [payload?.bgImage]);

  // 预览模式：内容来自 engine 里的 preview payload
  useEffect(() => {
    if (!isPreview) return;
    api.getPreviewPayload().then((p) => setPayload(p ?? null));
  }, []);

  useEffect(() => {
    void api.diag(
      `reminder mount task=[${taskId}] preview=${isPreview} search=[${location.search}]`
    );
    if (isPreview || !taskId) return;
    api
      .getRemindPayload(taskId)
      .then((p) => {
        void api.diag(`reminder payload ${p ? `${p.type}/${p.style}` : "null"}`);
        setPayload(p ?? null);
      })
      .catch((e) => {
        void api.diag(`reminder payload error ${String(e)}`);
        setPayload(null);
      });
  }, [taskId]);

  // 拿不到数据就把窗口关掉，别把用户晾在一个没内容的黑屏上
  useEffect(() => {
    if (isPreview) return;
    const id = window.setTimeout(() => {
      if (!payload) {
        void api.diag("reminder payload timeout，自动关闭");
        void closeSelf();
      }
    }, 6000);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payload]);

  useEffect(() => {
    if (!isTauri() || isPreview) return;
    const un = listen<string>("remind-task", (e) => {
      setTaskId(e.payload);
      api.getRemindPayload(e.payload).then((p) => setPayload(p ?? null));
    });
    return () => {
      un.then((f) => f()).catch(() => undefined);
    };
  }, []);

  const duration = payload?.durationSec ?? 0;
  const autoClose = payload?.autoCloseSec ?? 30;

  useEffect(() => {
    if (!payload) return;
    const start = duration > 0 ? duration : autoClose;
    void api.diag(`reminder timer dur=${duration} auto=${autoClose} start=${start}`);
    setLeft(start);
    setArmed(true);
  }, [payload, duration, autoClose]);

  useEffect(() => {
    if (!payload || !armed || left <= 0) return;
    const id = window.setTimeout(() => {
      if (left % 5 === 0) void api.diag(`reminder tick left=${left}`);
      setLeft((v) => v - 1);
    }, 1000);
    return () => window.clearTimeout(id);
  }, [left, payload, armed]);

  const closeSelf = async () => {
    if (closingRef.current) return;
    closingRef.current = true;
    void api.diag(`reminder close preview=${isPreview}`);
    setClosing(true);
    await new Promise((r) => setTimeout(r, 200));
    if (!isTauri()) {
      window.close();
      return;
    }
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    const win = getCurrentWindow();
    if (isPreview) {
      await win.close().catch(() => undefined);
      return;
    }
    // 关键：必须传自己的真实 label，之前传空串导致窗口永远关不掉
    await api.hideReminder(win.label);
  };

  const complete = async () => {
    if (actedRef.current) return;
    actedRef.current = true;
    if (!payload || isPreview) return closeSelf();
    await api.log(payload.taskId, "complete", payload.unitValue);
    await closeSelf();
  };

  const snooze = async () => {
    if (actedRef.current) return;
    actedRef.current = true;
    if (!payload || isPreview) return closeSelf();
    await api.snooze(payload.taskId, payload.snoozeMin);
    await closeSelf();
  };

  const skip = async () => {
    if (actedRef.current) return;
    actedRef.current = true;
    if (!payload || isPreview) return closeSelf();
    await api.log(payload.taskId, "skip");
    await closeSelf();
  };

  // 倒计时归零：持续型任务自动完成，其余自动关闭
  useEffect(() => {
    if (!payload || !armed || left > 0) return;
    if (isPreview) {
      void closeSelf();
      return;
    }
    if (duration > 0) void complete();
    else void closeSelf();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [left, payload, armed]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") void closeSelf();
      if (e.key === "Enter") void complete();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payload]);

  return (
    <I18nProvider language={settings.language}>
      <ReminderBody
        payload={payload}
        bgUrl={bgUrl}
        left={left}
        duration={duration}
        closing={closing}
        preview={isPreview}
        onComplete={complete}
        onSnooze={snooze}
        onSkip={skip}
        onClose={closeSelf}
      />
    </I18nProvider>
  );
}

function ReminderBody({
  payload,
  bgUrl,
  left,
  duration,
  closing,
  preview,
  onComplete,
  onSnooze,
  onSkip,
  onClose,
}: {
  payload: RemindPayload | null;
  bgUrl: string;
  left: number;
  duration: number;
  closing: boolean;
  preview: boolean;
  onComplete: () => void;
  onSnooze: () => void;
  onSkip: () => void;
  onClose: () => void;
}) {
  const { t } = useT();
  const accent = payload ? taskColor(payload.type) : "var(--accent)";
  const gradient = useMemo(
    () => BG_GRADIENT[payload?.bgPreset ?? "dawn"] ?? BG_GRADIENT.dawn,
    [payload?.bgPreset]
  );
  const dim = payload?.dim ?? 0.55;
  const blur = payload?.blur ?? 0;

  const titleKey = `remind.${payload?.type ?? "custom"}.title` as MsgKey;
  const bodyKey = `remind.${payload?.type ?? "custom"}.body` as MsgKey;
  const title = payload ? t(titleKey, { name: taskLabel(payload, t) }) : "";
  const body =
    payload?.messageText?.trim() ? payload.messageText : payload ? t(bodyKey, { n: payload.intervalMin ?? 45 }) : "";

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: bgUrl ? "#000" : gradient,
        cursor: "pointer",
        opacity: closing ? 0 : 1,
        transition: "opacity 200ms ease",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {bgUrl ? (
        <img
          src={bgUrl}
          alt=""
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            filter: blur > 0 ? `blur(${blur}px)` : undefined,
            transform: blur > 0 ? "scale(1.06)" : undefined,
          }}
        />
      ) : null}
      <div style={{ position: "absolute", inset: 0, background: `rgba(0,0,0,${dim})` }} />

      <div
        style={{
          position: "relative",
          zIndex: 2,
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 18,
          padding: "0 24px",
          color: "#fff",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 24,
            right: 32,
            display: "flex",
            gap: 10,
            alignItems: "center",
          }}
        >
          {preview ? (
            <span
              style={{
                fontSize: 11,
                padding: "3px 9px",
                borderRadius: 999,
                background: "rgba(255,255,255,.14)",
                color: "rgba(255,255,255,.8)",
              }}
            >
              {t("today.preview")}
            </span>
          ) : null}
          {payload?.showCountdown !== false ? (
            <span style={{ fontSize: 11.5, color: "rgba(255,255,255,.55)" }}>
              {duration > 0 ? t("remind.finish") : t("remind.autoClose", { n: left })}
            </span>
          ) : null}
        </div>

        <div
          style={{
            width: 76,
            height: 76,
            borderRadius: 24,
            display: "grid",
            placeItems: "center",
            background: `color-mix(in srgb, ${accent} 22%, transparent)`,
            border: `1px solid color-mix(in srgb, ${accent} 40%, transparent)`,
            color: accent,
          }}
        >
          <TaskIcon name={payload?.icon} size={36} color={accent} strokeWidth={1.7} />
        </div>

        <div style={{ textAlign: "center", maxWidth: 720 }}>
          <div style={{ fontSize: 40, fontWeight: 500, letterSpacing: "-0.02em" }}>{title}</div>
          <div style={{ fontSize: 14.5, color: "rgba(255,255,255,.62)", marginTop: 10, lineHeight: 1.6 }}>
            {body}
          </div>
        </div>

        {duration > 0 ? (
          <div style={{ position: "relative", width: 158, height: 158, marginTop: 2 }}>
            <svg width="158" height="158" viewBox="0 0 158 158">
              <circle cx="79" cy="79" r="70" fill="none" stroke="rgba(255,255,255,.12)" strokeWidth="6" />
              <circle
                cx="79"
                cy="79"
                r="70"
                fill="none"
                stroke={accent}
                strokeWidth="6"
                strokeLinecap="round"
                strokeDasharray={`${(left / Math.max(1, duration)) * 440} 440`}
                transform="rotate(-90 79 79)"
                style={{ transition: "stroke-dasharray 1s linear" }}
              />
            </svg>
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <span className="num" style={{ fontSize: 38, fontWeight: 500 }}>
                {fmtClock(left)}
              </span>
            </div>
          </div>
        ) : null}

        <button
          onClick={(e) => {
            e.stopPropagation();
            onComplete();
          }}
          style={{
            marginTop: 6,
            height: 62,
            padding: "0 40px",
            borderRadius: 16,
            background: accent,
            color: "var(--on-task)",
            fontSize: 17,
            fontWeight: 500,
            transition: "160ms",
          }}
          onMouseDown={(e) => (e.currentTarget.style.transform = "scale(.98)")}
          onMouseUp={(e) => (e.currentTarget.style.transform = "none")}
        >
          {preview ? t("common.close") : payload ? actionLabel(payload, t) : ""}
        </button>

        <div style={{ display: "flex", gap: 26, marginTop: 4 }}>
          {!preview && payload && payload.snoozeMin > 0 ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onSnooze();
              }}
              style={{ fontSize: 12.5, color: "rgba(255,255,255,.55)" }}
            >
              {t("remind.snooze", { n: payload.snoozeMin })}
            </button>
          ) : null}
          {!preview ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onSkip();
              }}
              style={{ fontSize: 12.5, color: "rgba(255,255,255,.55)" }}
            >
              {t("remind.skip")}
            </button>
          ) : null}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            style={{ fontSize: 12.5, color: "rgba(255,255,255,.55)" }}
          >
            {t("common.close")} · Esc
          </button>
        </div>
      </div>
    </div>
  );
}
