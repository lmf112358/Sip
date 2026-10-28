import { useEffect, useState } from "react";
import { useT } from "@/i18n";
import type { MsgKey } from "@/i18n/zh";
import { useStore } from "@/lib/store";
import { api, isTauri } from "@/lib/api";
import type { QuietHour } from "@/lib/types";
import { Button, Card, Field, Row, Segmented, Slider, Switch, TextInput, Tag } from "@/components/ui";

const ACCENTS = [
  { key: "ocean" as const, color: "#38BDF8" },
  { key: "violet" as const, color: "#A78BFA" },
  { key: "emerald" as const, color: "#34D399" },
  { key: "amber" as const, color: "#FBBF24" },
];

export function SettingsPage({ onOpenReminder }: { onOpenReminder: () => void }) {
  const { t } = useT();
  const { settings, update } = useStore();
  const [autoStart, setAutoStart] = useState(settings.autoStart);
  const [newApp, setNewApp] = useState("");
  const [version] = useState("1.4.3");

  useEffect(() => {
    if (!isTauri()) return;
    import("@tauri-apps/plugin-autostart")
      .then((m) => m.isEnabled())
      .then(setAutoStart)
      .catch(() => undefined);
  }, []);

  const toggleAutoStart = async (v: boolean) => {
    setAutoStart(v);
    await update({ autoStart: v });
    if (!isTauri()) return;
    try {
      const m = await import("@tauri-apps/plugin-autostart");
      if (v) await m.enable();
      else await m.disable();
    } catch {
      /* ignore */
    }
  };

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ fontSize: 21, fontWeight: 500, marginBottom: 4 }}>{t("settings.title")}</div>

      {/* 外观 */}
      <Card style={{ padding: "4px 20px 8px" }}>
        <GroupTitle>{t("settings.appearance")}</GroupTitle>
        <Row label={t("settings.theme")}>
          <Segmented
            value={settings.theme}
            onChange={(v) => update({ theme: v })}
            options={[
              { value: "dark", label: t("settings.theme.dark") },
              { value: "light", label: t("settings.theme.light") },
              { value: "system", label: t("settings.theme.system") },
            ]}
          />
        </Row>
        <Row label={t("settings.accent")}>
          <div style={{ display: "flex", gap: 8 }}>
            {ACCENTS.map((a) => (
              <button
                key={a.key}
                aria-label={a.key}
                onClick={() => update({ accent: a.key })}
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 999,
                  background: a.color,
                  border:
                    settings.accent === a.key
                      ? "2px solid var(--text)"
                      : "2px solid transparent",
                  outline: "1px solid var(--border)",
                  outlineOffset: 1,
                }}
              />
            ))}
          </div>
        </Row>
        <Row label={t("settings.scale")} last>
          <Segmented
            size="sm"
            value={settings.scale}
            onChange={(v) => update({ scale: v })}
            options={[
              { value: 0.9, label: "90%" },
              { value: 1, label: "100%" },
              { value: 1.1, label: "110%" },
            ]}
          />
        </Row>
      </Card>

      {/* 语言 */}
      <Card style={{ padding: "4px 20px 8px" }}>
        <GroupTitle>{t("settings.language")}</GroupTitle>
        <Row label={t("settings.language")} last>
          <Segmented
            value={settings.language}
            onChange={(v) => update({ language: v })}
            options={[
              { value: "zh", label: t("settings.language.zh") },
              { value: "en", label: t("settings.language.en") },
              { value: "system", label: t("settings.language.system") },
            ]}
          />
        </Row>
      </Card>

      {/* 通用 */}
      <Card style={{ padding: "4px 20px 8px" }}>
        <GroupTitle>{t("settings.general")}</GroupTitle>
        <Row label={t("settings.autoStart")} desc={t("settings.autoStart.desc")}>
          <Switch checked={autoStart} onChange={toggleAutoStart} />
        </Row>
        <Row label={t("settings.closeToTray")} desc={t("settings.closeToTray.desc")}>
          <Switch
            checked={settings.closeToTray}
            onChange={(v) => update({ closeToTray: v })}
          />
        </Row>
        <Row label={t("settings.trayCountdown")}>
          <Switch
            checked={settings.trayCountdown}
            onChange={(v) => update({ trayCountdown: v })}
          />
        </Row>
        <Row label={t("settings.sound")} desc={t("settings.sound.desc")}>
          <Switch
            checked={settings.sound !== "none"}
            onChange={(v) => update({ sound: v ? "default" : "none" })}
          />
        </Row>
        <div style={{ padding: "4px 0 14px" }}>
          <Field label={`${t("settings.volume")} · ${Math.round(settings.volume * 100)}%`}>
            <Slider
              value={settings.volume}
              min={0}
              max={1}
              step={0.05}
              onChange={(v) => update({ volume: v })}
            />
          </Field>
        </div>
      </Card>

      {/* 提醒入口 */}
      <Card style={{ padding: "4px 20px 8px" }}>
        <GroupTitle>{t("settings.reminderSection")}</GroupTitle>
        <Row label={t("rem.title")} desc={t("settings.reminderSection.desc")} last>
          <Button variant="ghost" onClick={onOpenReminder}>
            {t("rem.title")} ›
          </Button>
        </Row>
      </Card>

      {/* 作息 · 安静时段 */}
      <Card style={{ padding: "4px 20px 8px" }}>
        <GroupTitle>{t("settings.quiet")}</GroupTitle>
        <div style={{ fontSize: 11.5, color: "var(--text-mute)", padding: "2px 0 10px", lineHeight: 1.5 }}>
          {t("settings.quiet.desc")}
        </div>
        <QuietHourEditor
          items={settings.quietHours}
          onChange={(items) => update({ quietHours: items })}
        />
        <div style={{ padding: "10px 0 14px" }}>
          <Field label={t("settings.whitelist")} hint={t("settings.whitelist.desc")}>
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <TextInput value={newApp} placeholder={t("settings.whitelist.add")} onChange={setNewApp} />
              <Button
                variant="ghost"
                onClick={() => {
                  const v = newApp.trim();
                  if (!v) return;
                  update({ whitelist: [...settings.whitelist, v] });
                  setNewApp("");
                }}
              >
                {t("common.add")}
              </Button>
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {settings.whitelist.map((w) => (
                <button
                  key={w}
                  onClick={() => update({ whitelist: settings.whitelist.filter((x) => x !== w) })}
                  title={t("common.delete")}
                >
                  <Tag>{w} ×</Tag>
                </button>
              ))}
            </div>
          </Field>
        </div>
      </Card>

      {/* 数据 */}
      <Card style={{ padding: "4px 20px 8px" }}>
        <GroupTitle>{t("settings.data")}</GroupTitle>
        <Row label={t("settings.export")}>
          <Button
            variant="ghost"
            onClick={async () => {
              const path = await api.exportCsv();
              alert(t("stats.exported", { path }));
            }}
          >
            {t("stats.export")}
          </Button>
        </Row>
        <Row label={t("settings.openDir")} last>
          <Button variant="ghost" onClick={() => api.openDataDir()}>
            {t("settings.openDir")}
          </Button>
        </Row>
      </Card>

      {/* 关于 + 退出 */}
      <Card style={{ padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 13.5 }}>{t("app.name")}</div>
          <div style={{ fontSize: 11.5, color: "var(--text-mute)", marginTop: 3 }}>
            {t("settings.version")} {version}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <span style={{ fontSize: 11, color: "var(--text-mute)" }}>Tauri · React</span>
          {/* 托盘菜单之外再给一个明确的退出入口：
              之前只剩托盘一条路，托盘一卡用户就完全退不出去 */}
          <Button
            variant="ghost"
            onClick={() => {
              if (!confirm(t("settings.quitConfirm"))) return;
              void api.quit();
            }}
          >
            {t("settings.quit")}
          </Button>
        </div>
      </Card>
    </div>
  );
}

function GroupTitle({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 11,
        color: "var(--text-mute)",
        letterSpacing: "0.05em",
        padding: "14px 0 4px",
      }}
    >
      {String(children).toUpperCase()}
    </div>
  );
}

function QuietHourEditor({
  items,
  onChange,
}: {
  items: QuietHour[];
  onChange: (v: QuietHour[]) => void;
}) {
  const { t } = useT();
  const patch = (i: number, p: Partial<QuietHour>) =>
    onChange(items.map((x, idx) => (idx === i ? { ...x, ...p } : x)));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {items.length === 0 ? (
        <div style={{ fontSize: 12, color: "var(--text-mute)" }}>{t("settings.quiet.empty")}</div>
      ) : null}

      {items.map((q, i) => (
        <div
          key={i}
          style={{
            padding: "11px 12px",
            borderRadius: 11,
            border: "1px solid var(--border)",
            background: "var(--surface-2)",
            display: "flex",
            flexDirection: "column",
            gap: 9,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 104, flex: "none" }}>
              <TextInput type="time" value={q.start} onChange={(v) => patch(i, { start: v })} />
            </div>
            <span style={{ color: "var(--text-mute)" }}>–</span>
            <div style={{ width: 104, flex: "none" }}>
              <TextInput type="time" value={q.end} onChange={(v) => patch(i, { end: v })} />
            </div>
            <div style={{ flex: 1 }} />
            <button
              onClick={() => onChange(items.filter((_, idx) => idx !== i))}
              title={t("common.delete")}
              style={{ fontSize: 13, color: "var(--text-mute)", padding: "0 4px" }}
            >
              ✕
            </button>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
            {[1, 2, 3, 4, 5, 6, 0].map((d) => {
              const on = q.days.includes(d);
              return (
                <button
                  key={d}
                  onClick={() =>
                    patch(i, {
                      days: on ? q.days.filter((x) => x !== d) : [...q.days, d].sort((a, b) => a - b),
                    })
                  }
                  style={{
                    width: 28,
                    height: 26,
                    borderRadius: 7,
                    fontSize: 11.5,
                    color: on ? "var(--text)" : "var(--text-mute)",
                    border: `1px solid ${on ? "var(--accent)" : "var(--border)"}`,
                    background: on ? "var(--accent-soft)" : "transparent",
                  }}
                >
                  {t(`weekday.${d}` as MsgKey)}
                </button>
              );
            })}
            <div style={{ flex: 1 }} />
            <span style={{ fontSize: 11, color: "var(--text-mute)" }}>{t("settings.quiet.grace")}</span>
            <Segmented
              size="sm"
              value={q.graceSec}
              onChange={(v) => patch(i, { graceSec: Number(v) })}
              options={[
                { value: 0, label: t("settings.quiet.grace0") },
                { value: 60, label: t("settings.quiet.grace60") },
              ]}
            />
          </div>
        </div>
      ))}

      {items.length < 3 ? (
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Button
            variant="ghost"
            onClick={() =>
              onChange([
                ...items,
                { start: "12:00", end: "13:30", days: [1, 2, 3, 4, 5], graceSec: 60 },
              ])
            }
          >
            + {t("settings.quiet.add")}
          </Button>
          <span style={{ fontSize: 11, color: "var(--text-mute)" }}>{t("settings.quiet.max")}</span>
        </div>
      ) : null}
    </div>
  );
}
