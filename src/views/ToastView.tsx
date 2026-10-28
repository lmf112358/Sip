import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { I18nProvider, useT } from "@/i18n";
import type { MsgKey } from "@/i18n/zh";
import { api, isTauri } from "@/lib/api";
import { DEFAULT_SETTINGS, applyTheme } from "@/lib/store";
import type { RemindPayload, Settings } from "@/lib/types";
import { taskColor } from "@/lib/tokens";
import { TaskIcon } from "@/components/icons/TaskIcon";

const qs = new URLSearchParams(location.search);
const paramTask = qs.get("task") ?? "";
const isPreview = qs.get("preview") === "1";

export function ToastView() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [taskId, setTaskId] = useState(paramTask);
  const [payload, setPayload] = useState<RemindPayload | null>(null);
  const [visible, setVisible] = useState(false);
  // 防重复：整张卡片都是「点一下就完成」，手快双击会写两条记录
  const actedRef = useRef(false);

  useEffect(() => {
    void api.diag(`toast mount task=[${taskId}] preview=${isPreview} search=[${location.search}]`);
  }, []);

  // 消息窗也支持 Esc 关闭（虽然它默认不抢焦点，抢到焦点时仍然好用）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") void dismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    api.getSettings().then((s) => {
      setSettings(s);
      applyTheme(s);
    });
  }, []);

  useEffect(() => {
    if (isPreview) {
      api.getPreviewPayload().then((p) => {
        setPayload(p ?? null);
        setVisible(!!p);
      });
      return;
    }
    if (!taskId) return;
    api.getRemindPayload(taskId).then((p) => {
      setPayload(p ?? null);
      setVisible(!!p);
    });
  }, [taskId]);

  useEffect(() => {
    if (!isTauri() || isPreview) return;
    const un = listen<string>("remind-task", (e) => setTaskId(e.payload));
    return () => {
      un.then((f) => f()).catch(() => undefined);
    };
  }, []);

  // 预览 3 秒（全屏 5 秒），正式 8 秒后自动收起
  useEffect(() => {
    if (!visible) return;
    const ms = isPreview ? 3000 : 8000;
    const id = window.setTimeout(() => dismiss(), ms);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, taskId]);

  const dismiss = async () => {
    setVisible(false);
    if (!isTauri()) {
      window.close();
      return;
    }
    if (isPreview) {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      await getCurrentWindow().close().catch(() => undefined);
      return;
    }
    await api.hideToast();
  };

  const complete = async () => {
    if (actedRef.current) return;
    actedRef.current = true;
    if (!payload || isPreview) return dismiss();
    await api.log(payload.taskId, "complete", payload.unitValue);
    dismiss();
  };

  const skip = async () => {
    if (actedRef.current) return;
    actedRef.current = true;
    if (!payload || isPreview) return dismiss();
    await api.log(payload.taskId, "skip");
    dismiss();
  };

  return (
    <I18nProvider language={settings.language}>
      <div style={{ width: "100%", height: "100%", padding: 6, background: "transparent" }}>
        {payload ? <Card payload={payload} visible={visible} onClick={complete} onSkip={skip} /> : null}
      </div>
    </I18nProvider>
  );
}

function Card({
  payload,
  visible,
  onClick,
  onSkip,
}: {
  payload: RemindPayload;
  visible: boolean;
  onClick: () => void;
  onSkip: () => void;
}) {
  const { t } = useT();
  const skin = payload.toastSkin || payload.templateId || "toast-chat";
  const accent = taskColor(payload.type);
  const title = t(`remind.${payload.type}.title` as MsgKey);
  const message = payload.messageText?.trim() || t("toast.preview");
  const sender = payload.senderName?.trim() || t("toast.sender");

  const wrap: React.CSSProperties = {
    height: "100%",
    borderRadius: 14,
    overflow: "hidden",
    cursor: "pointer",
    transform: visible ? "none" : "translateY(12px)",
    opacity: visible ? 1 : 0,
    transition: "260ms cubic-bezier(.2,.8,.2,1)",
    boxShadow: "0 14px 40px rgba(0,0,0,.42)",
    userSelect: "none",
  };

  const common = {
    onClick,
    onContextMenu: (e: React.MouseEvent) => {
      e.preventDefault();
      onSkip();
    },
  };

  if (skin === "toast-minimal") {
    return (
      <div
        {...common}
        style={{
          ...wrap,
          background: "rgba(20,24,30,.96)",
          border: "1px solid rgba(255,255,255,.1)",
          display: "flex",
          alignItems: "center",
          gap: 11,
          padding: "0 16px",
          color: "#fff",
        }}
      >
        <span style={{ color: accent, display: "flex" }}>
          <TaskIcon name={payload.icon} size={18} />
        </span>
        <span style={{ fontSize: 13, flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {title}
        </span>
        <span style={{ fontSize: 11, color: "rgba(255,255,255,.45)" }}>{t("toast.markRead")}</span>
      </div>
    );
  }

  if (skin === "toast-system") {
    return (
      <div
        {...common}
        style={{
          ...wrap,
          background: "rgba(28,28,30,.97)",
          border: "1px solid rgba(255,255,255,.09)",
          color: "#fff",
          padding: "12px 15px",
          display: "flex",
          gap: 11,
        }}
      >
        <div
          style={{
            width: 26,
            height: 26,
            borderRadius: 7,
            background: "rgba(255,255,255,.12)",
            display: "grid",
            placeItems: "center",
            flex: "none",
          }}
        >
          <TaskIcon name={payload.icon} size={14} color="#fff" />
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 500 }}>{t("toast.systemTitle")}</div>
          <div style={{ fontSize: 11.5, color: "rgba(255,255,255,.6)", marginTop: 2 }}>{title}</div>
        </div>
      </div>
    );
  }

  if (skin === "toast-mail") {
    return (
      <div
        {...common}
        style={{
          ...wrap,
          background: "#f7f8fa",
          border: "1px solid rgba(0,0,0,.08)",
          color: "#101828",
          padding: "11px 14px",
          display: "flex",
          gap: 11,
        }}
      >
        <div
          style={{
            width: 30,
            height: 30,
            borderRadius: 8,
            background: "#e8eef7",
            display: "grid",
            placeItems: "center",
            flex: "none",
            color: "#3b5bdb",
          }}
        >
          <TaskIcon name="book" size={16} />
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
            <span style={{ fontSize: 11.5, color: "#667085" }}>{t("toast.mailFrom")}</span>
            <span style={{ fontSize: 10.5, color: "#98a2b3" }}>now</span>
          </div>
          <div style={{ fontSize: 12.5, fontWeight: 500, marginTop: 1 }}>{t("toast.mailSubject")}</div>
          <div
            style={{
              fontSize: 11.5,
              color: "#667085",
              marginTop: 2,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {title} · {message}
          </div>
        </div>
      </div>
    );
  }

  // chat（默认，伪装微信）
  return (
    <div
      {...common}
      style={{
        ...wrap,
        background: "#f2f3f5",
        border: "1px solid rgba(0,0,0,.07)",
        color: "#111",
        padding: "11px 13px",
        display: "flex",
        gap: 10,
      }}
    >
      <div
        style={{
          width: 34,
          height: 34,
          borderRadius: 9,
          background: "#dfe4ec",
          display: "grid",
          placeItems: "center",
          fontSize: 13,
          fontWeight: 500,
          color: "#4b5565",
          flex: "none",
        }}
      >
        {sender.slice(0, 1)}
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
          <span
            style={{
              fontSize: 12,
              color: "#4b5565",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {sender}
          </span>
          <span style={{ fontSize: 10.5, color: "#9aa4b2", flex: "none" }}>now</span>
        </div>
        <div
          style={{
            fontSize: 12.5,
            marginTop: 2,
            lineHeight: 1.45,
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {message}
        </div>
      </div>
      <div style={{ alignSelf: "center", fontSize: 11, color: accent, flex: "none", paddingLeft: 4 }}>
        {t("toast.reply")}
      </div>
    </div>
  );
}
