import { useState } from "react";
import { useT } from "@/i18n";
import type { MsgKey } from "@/i18n/zh";
import { api, isTauri } from "@/lib/api";
import { useStore } from "@/lib/store";
import type { RemindProfile, RemindStyle, TaskType } from "@/lib/types";
import { TASK_VAR } from "@/lib/tokens";
import { Button, Card, Field, Segmented, Slider, Switch } from "@/components/ui";
import { TaskIcon } from "@/components/icons/TaskIcon";

const TYPES: TaskType[] = ["water", "eyes", "kegel", "break", "custom"];

export const BG_PRESETS: Record<string, string> = {
  dawn: "linear-gradient(140deg,#0ea5e9,#6366f1)",
  mint: "linear-gradient(140deg,#059669,#0d9488)",
  dusk: "linear-gradient(140deg,#7c3aed,#db2777)",
  amber: "linear-gradient(140deg,#d97706,#b45309)",
  night: "linear-gradient(140deg,#0b0f14,#1e293b)",
  paper: "linear-gradient(140deg,#f8fafc,#e2e8f0)",
  water: "linear-gradient(140deg,#38bdf8,#0284c7)",
};

export function ReminderSettingsPage() {
  const { t } = useT();
  const { settings, update, preview } = useStore();
  const [ty, setTy] = useState<TaskType>("water");
  const [openBlock, setOpenBlock] = useState<string | null>(null);

  const profile: RemindProfile = settings.reminder?.[ty] ?? {
    style: "fullscreen",
    templateId: "fs-water",
    durationSec: 20,
    toastSkin: "toast-chat",
    toastPos: "br",
    sound: "default",
    volume: 0.6,
    bgImage: "",
    bgPreset: "dawn",
    dim: 0.55,
    blur: 0,
    showCountdown: true,
    senderName: "",
    messageText: "",
  };

  const setP = (patch: Partial<RemindProfile>) =>
    update({ reminder: { ...settings.reminder, [ty]: { ...profile, ...patch } } });

  const pickImage = async () => {
    if (!isTauri()) {
      alert("仅桌面端可用 / desktop only");
      return;
    }
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const file = await open({
        multiple: false,
        filters: [{ name: "Image", extensions: ["png", "jpg", "jpeg", "gif", "webp"] }],
      });
      if (typeof file === "string") {
        const name = await api.importMedia(file);
        setP({ bgImage: name });
      }
    } catch {
      /* 用户取消 */
    }
  };

  const durationLabel =
    profile.durationSec > 0 ? t("unit.sec", { n: profile.durationSec }) : t("rem.summary.interactive");

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div>
          <div style={{ fontSize: 21, fontWeight: 500 }}>{t("rem.title")}</div>
          <div style={{ fontSize: 11.5, color: "var(--text-mute)", marginTop: 3 }}>{t("rem.desc")}</div>
        </div>
        <Button variant="ghost" onClick={() => preview(ty, profile.style)}>
          {t("rem.previewNow")}
        </Button>
      </div>

      {/* 类型选择 */}
      <Card style={{ padding: "12px 14px" }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {TYPES.map((x) => {
            const active = x === ty;
            return (
              <button
                key={x}
                onClick={() => setTy(x)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 7,
                  padding: "7px 13px",
                  borderRadius: 10,
                  fontSize: 12.5,
                  color: active ? "var(--text)" : "var(--text-dim)",
                  border: `1px solid ${active ? TASK_VAR[x] : "var(--border)"}`,
                  background: active ? `color-mix(in srgb, ${TASK_VAR[x]} 12%, transparent)` : "transparent",
                }}
              >
                <TaskIcon name={x} size={15} color={TASK_VAR[x]} />
                {t(`task.${x}` as MsgKey)}
              </button>
            );
          })}
        </div>
      </Card>

      {/* ① 形态与节奏 */}
      <Card style={{ padding: "4px 20px 10px" }}>
        <BlockHead
          title={t("rem.block1")}
          summary={`${t(`task.style.${profile.style}` as MsgKey)} · ${durationLabel}`}
        />
        <Field label={t("rem.style")}>
          <Segmented
            value={profile.style}
            onChange={(v) => setP({ style: v as RemindStyle })}
            options={[
              { value: "fullscreen", label: t("task.style.fullscreen") },
              { value: "toast", label: t("task.style.toast") },
              { value: "system", label: t("task.style.system") },
            ]}
          />
        </Field>
        <Field label={t("rem.duration")}>
          <Segmented
            size="sm"
            value={profile.durationSec}
            onChange={(v) => setP({ durationSec: Number(v) })}
            options={[
              { value: 0, label: t("rem.duration.interactive") },
              { value: 10, label: "10s" },
              { value: 20, label: "20s" },
              { value: 30, label: "30s" },
            ]}
          />
        </Field>
      </Card>

      {/* ② 外观 */}
      <Card style={{ padding: "4px 20px 10px" }}>
        <BlockHead
          title={t("rem.block2")}
          summary={`${t(`rem.preset.${profile.bgPreset}` as MsgKey)} · ${t(`rem.pos.${profile.toastPos}` as MsgKey)}`}
          open={openBlock === "look"}
          onToggle={() => setOpenBlock(openBlock === "look" ? null : "look")}
        />
        {openBlock === "look" ? (
          <>
            <Field label={t("rem.bg")} hint={t("rem.bg.custom")}>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {Object.entries(BG_PRESETS).map(([k, v]) => (
                  <button
                    key={k}
                    onClick={() => setP({ bgPreset: k, bgImage: "" })}
                    title={t(`rem.preset.${k}` as MsgKey)}
                    style={{
                      width: 54,
                      height: 36,
                      borderRadius: 9,
                      background: v,
                      border:
                        profile.bgPreset === k && !profile.bgImage
                          ? "2px solid var(--text)"
                          : "1px solid var(--border)",
                    }}
                  />
                ))}
                <button
                  onClick={pickImage}
                  title={t("rem.bg.upload")}
                  style={{
                    width: 54,
                    height: 36,
                    borderRadius: 9,
                    border: `1px dashed ${profile.bgImage ? "var(--text)" : "var(--border-strong)"}`,
                    color: "var(--text-mute)",
                    fontSize: 15,
                  }}
                >
                  +
                </button>
                {profile.bgImage ? (
                  <Button variant="plain" onClick={() => setP({ bgImage: "" })}>
                    {t("rem.bg.clear")}
                  </Button>
                ) : null}
              </div>
            </Field>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <Field label={`${t("rem.dim")} · ${Math.round(profile.dim * 100)}%`}>
                <Slider value={profile.dim} min={0} max={0.85} step={0.05} onChange={(v) => setP({ dim: v })} />
              </Field>
              <Field label={`${t("rem.blur")} · ${Math.round(profile.blur)}px`}>
                <Slider value={profile.blur} min={0} max={24} step={2} onChange={(v) => setP({ blur: v })} />
              </Field>
            </div>

            <Field label={t("rem.countdown")}>
              <Switch checked={profile.showCountdown} onChange={(v) => setP({ showCountdown: v })} />
            </Field>

            <Field label={t("rem.skin")}>
              <Segmented
                size="sm"
                value={profile.toastSkin}
                onChange={(v) => setP({ toastSkin: String(v) })}
                options={[
                  { value: "toast-chat", label: "微信" },
                  { value: "toast-mail", label: "邮件" },
                  { value: "toast-system", label: "系统" },
                  { value: "toast-minimal", label: "极简" },
                ]}
              />
            </Field>

            <Field label={t("rem.pos")}>
              <Segmented
                size="sm"
                value={profile.toastPos}
                onChange={(v) => setP({ toastPos: v as RemindProfile["toastPos"] })}
                options={[
                  { value: "br", label: t("rem.pos.br") },
                  { value: "tr", label: t("rem.pos.tr") },
                  { value: "tl", label: t("rem.pos.tl") },
                  { value: "bl", label: t("rem.pos.bl") },
                ]}
              />
            </Field>

            {profile.toastSkin === "toast-chat" ? (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <Field label={t("rem.sender")}>
                  <input
                    value={profile.senderName}
                    placeholder={t("rem.sender.ph")}
                    onChange={(e) => setP({ senderName: e.target.value })}
                    style={inputStyle}
                  />
                </Field>
                <Field label={t("rem.message")}>
                  <input
                    value={profile.messageText}
                    placeholder={t("rem.message.ph")}
                    onChange={(e) => setP({ messageText: e.target.value })}
                    style={inputStyle}
                  />
                </Field>
              </div>
            ) : null}
          </>
        ) : null}
      </Card>

      {/* ③ 声音 */}
      <Card style={{ padding: "4px 20px 10px" }}>
        <BlockHead
          title={t("rem.block3")}
          summary={profile.sound === "none" ? t("common.off") : `${t("common.on")} · ${Math.round(profile.volume * 100)}%`}
          open={openBlock === "sound"}
          onToggle={() => setOpenBlock(openBlock === "sound" ? null : "sound")}
        />
        {openBlock === "sound" ? (
          <>
            <Field label={t("rem.sound")}>
              <Segmented
                size="sm"
                value={profile.sound}
                onChange={(v) => setP({ sound: String(v) })}
                options={[
                  { value: "default", label: t("common.on") },
                  { value: "none", label: t("common.off") },
                ]}
              />
            </Field>
            <Field label={`${t("rem.volume")} · ${Math.round(profile.volume * 100)}%`}>
              <Slider value={profile.volume} min={0} max={1} step={0.05} onChange={(v) => setP({ volume: v })} />
            </Field>
          </>
        ) : null}
      </Card>

      {/* ④ 预览 */}
      <Card style={{ padding: "16px 20px", display: "flex", gap: 10, flexWrap: "wrap" }}>
        <Button variant="primary" onClick={() => preview(ty, profile.style)}>
          {t("rem.previewNow")}
        </Button>
        <Button variant="ghost" onClick={() => preview(ty, "fullscreen")}>
          {t("task.style.fullscreen")}
        </Button>
        <Button variant="ghost" onClick={() => preview(ty, "toast")}>
          {t("task.style.toast")}
        </Button>
      </Card>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  height: 34,
  padding: "0 10px",
  borderRadius: 9,
  background: "var(--surface-2)",
  border: "1px solid var(--border)",
  color: "var(--text)",
  fontSize: 12.5,
};

function BlockHead({
  title,
  summary,
  open,
  onToggle,
}: {
  title: string;
  summary?: string;
  open?: boolean;
  onToggle?: () => void;
}) {
  const { t } = useT();
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
        padding: "13px 0 6px",
      }}
    >
      <span style={{ fontSize: 11, color: "var(--text-mute)", letterSpacing: "0.05em" }}>
        {title.toUpperCase()}
      </span>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {summary ? <span style={{ fontSize: 11.5, color: "var(--text-mute)" }}>{summary}</span> : null}
        {onToggle ? (
          <button onClick={onToggle} style={{ fontSize: 11.5, color: "var(--accent)" }}>
            {open ? t("rem.less") : t("rem.more")}
          </button>
        ) : null}
      </div>
    </div>
  );
}
