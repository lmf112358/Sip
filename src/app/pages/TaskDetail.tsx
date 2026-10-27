import { useEffect, useMemo, useState } from "react";
import { useT } from "@/i18n";
import type { MsgKey } from "@/i18n/zh";
import { api } from "@/lib/api";
import { useStore } from "@/lib/store";
import type { StatsPayload, Task } from "@/lib/types";
import { fmtDayShort } from "@/lib/format";
import { taskColor } from "@/lib/tokens";
import { taskLabel } from "@/lib/labels";
import { TaskForm } from "@/components/TaskForm";
import { TaskIcon } from "@/components/icons/TaskIcon";
import { Button, Card, Modal } from "@/components/ui";

export function TaskDetailPage({ taskId, onBack }: { taskId: string; onBack: () => void }) {
  const { t, lang } = useT();
  const { snapshot, settings, setSnapshot, deleteRecord, preview } = useStore();
  const [draft, setDraft] = useState<Task | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [stats, setStats] = useState<StatsPayload | null>(null);

  const view = snapshot?.tasks.find((x) => x.id === taskId) ?? null;

  // 只在切换任务时初始化草稿，避免 tick 每秒覆盖用户输入
  useEffect(() => {
    if (!view) return;
    setDraft((prev) => (prev && prev.id === view.id ? prev : stripView(view)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view?.id]);

  useEffect(() => {
    api.stats(7).then(setStats).catch(() => undefined);
  }, [taskId]);

  const color = taskColor(view?.type);
  const records = useMemo(
    () => (snapshot?.records ?? []).filter((r) => r.taskId === taskId),
    [snapshot?.records, taskId]
  );

  const last7 = useMemo(() => {
    if (!stats || !view) return [];
    return stats.days.map((d) => {
      const cell = d.byType[view.type];
      return {
        day: d.day,
        times: cell?.times ?? 0,
        value: cell?.value ?? 0,
      };
    });
  }, [stats, view]);

  if (!view || !draft) {
    return (
      <div style={{ maxWidth: 820, margin: "0 auto" }}>
        <Button onClick={onBack}>‹ {t("task.back")}</Button>
        <Card style={{ padding: 32, marginTop: 12, color: "var(--text-mute)", fontSize: 13 }}>
          {t("task.empty")}
        </Card>
      </div>
    );
  }

  const set = (patch: Partial<Task>) => setDraft({ ...draft, ...patch });

  const save = async () => {
    setSaving(true);
    try {
      const payload: Task = {
        ...draft,
        name: draft.name?.trim() ?? "",
        intervalMin: Math.max(1, Number(draft.intervalMin) || 1),
        goal: Math.max(0, Number(draft.goal) || 0),
        unitValue: Math.max(0, Number(draft.unitValue) || 0),
        snoozeMin: Math.max(0, Number(draft.snoozeMin) || 0),
        dailyCap: Math.max(0, Number(draft.dailyCap) || 0),
      };
      const s = await api.saveTask(payload);
      setSnapshot(s);
      onBack();
    } finally {
      setSaving(false);
    }
  };

  const defProfile = settings.reminder?.[view.type];
  const maxTimes = Math.max(1, ...last7.map((d) => d.times));

  return (
    <div style={{ maxWidth: 820, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
        <Button variant="plain" onClick={onBack}>
          ‹ {t("task.back")}
        </Button>
        <div style={{ flex: 1 }} />
        <Button variant="ghost" onClick={() => preview(view.type)}>
          {t("today.preview")}
        </Button>
        <Button variant="ghost" onClick={() => setConfirmDel(true)} style={{ color: "var(--danger)" }}>
          {t("task.delete")}
        </Button>
        <Button variant="primary" onClick={save} disabled={saving}>
          {t("common.save")}
        </Button>
      </div>

      {/* 概要 */}
      <Card style={{ padding: "16px 18px", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            style={{
              width: 46,
              height: 46,
              borderRadius: 13,
              display: "grid",
              placeItems: "center",
              background: `color-mix(in srgb, ${color} 15%, transparent)`,
              color,
              flex: "none",
            }}
          >
            <TaskIcon name={view.icon} size={22} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 500 }}>{taskLabel(view, t)}</div>
            <div style={{ fontSize: 11.5, color: "var(--text-mute)", marginTop: 3 }}>
              {t("today.count", { n: view.countToday })} · {t("unit.min", { n: view.intervalMin })} ·{" "}
              {view.remindOverride ? t("task.overrideOn") : t("task.followDefault")}
              {!view.remindOverride && defProfile
                ? ` (${t(`task.style.${defProfile.style}` as MsgKey)})`
                : ""}
            </div>
          </div>
        </div>
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "1.25fr 1fr", gap: 12, alignItems: "start" }}>
        <Card style={{ padding: "18px 20px" }}>
          <TaskForm draft={draft} set={set} />
        </Card>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* 最近 7 天 */}
          <Card style={{ padding: "16px 18px" }}>
            <div style={{ fontSize: 11, color: "var(--text-dim)", letterSpacing: "0.04em", marginBottom: 12 }}>
              {t("task.last7").toUpperCase()}
            </div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 64 }}>
              {last7.map((d) => (
                <div key={d.day} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>
                  <div style={{ flex: 1, display: "flex", alignItems: "flex-end", width: "100%" }}>
                    <div
                      style={{
                        width: "100%",
                        height: `${Math.max(4, (d.times / maxTimes) * 100)}%`,
                        borderRadius: 4,
                        background: d.times > 0 ? color : "var(--border)",
                        opacity: d.times > 0 ? 0.85 : 1,
                      }}
                    />
                  </div>
                  <span style={{ fontSize: 9.5, color: "var(--text-mute)" }}>{fmtDayShort(lang, d.day)}</span>
                </div>
              ))}
            </div>
          </Card>

          {/* 今日记录 */}
          <Card style={{ padding: "16px 18px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ fontSize: 11, color: "var(--text-dim)", letterSpacing: "0.04em" }}>
                {t("task.todayRecords").toUpperCase()}
              </span>
              <span className="num" style={{ fontSize: 11, color: "var(--text-mute)" }}>
                {records.length}
              </span>
            </div>
            {records.length === 0 ? (
              <div style={{ fontSize: 12, color: "var(--text-mute)", padding: "8px 0" }}>
                {t("today.recordsEmpty")}
              </div>
            ) : (
              records.map((r) => (
                <div
                  key={r.id}
                  className="rec-row"
                  style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 4px", borderRadius: 7 }}
                >
                  <span className="num" style={{ fontSize: 11, color: "var(--text-mute)", width: 34 }}>
                    {r.ts}
                  </span>
                  <span style={{ fontSize: 11.5, color: "var(--text-dim)", flex: 1 }}>
                    {t(`record.${r.action}` as MsgKey)}
                    {r.action === "complete" && r.taskType === "water" ? ` ${Math.round(r.value)} ml` : ""}
                  </span>
                  <button
                    className="rec-del"
                    onClick={() => deleteRecord(r.id)}
                    title={t("record.delete")}
                    style={{ fontSize: 11, color: "var(--text-mute)", opacity: 0 }}
                  >
                    ✕
                  </button>
                </div>
              ))
            )}
          </Card>
        </div>
      </div>

      <Modal
        open={confirmDel}
        onClose={() => setConfirmDel(false)}
        title={t("task.delete")}
        width={400}
        footer={
          <>
            <Button onClick={() => setConfirmDel(false)}>{t("common.cancel")}</Button>
            <Button
              variant="danger"
              onClick={async () => {
                const s = await api.deleteTask(view.id);
                setSnapshot(s);
                setConfirmDel(false);
                onBack();
              }}
            >
              {t("common.delete")}
            </Button>
          </>
        }
      >
        <div style={{ fontSize: 13, color: "var(--text-dim)" }}>{t("task.deleteConfirm")}</div>
      </Modal>
    </div>
  );
}

function stripView(v: Task): Task {
  return {
    id: v.id,
    name: v.name,
    nameKey: v.nameKey ?? null,
    type: v.type,
    icon: v.icon,
    enabled: v.enabled,
    intervalMin: v.intervalMin,
    activeStart: v.activeStart,
    activeEnd: v.activeEnd,
    weekdays: [...v.weekdays],
    remindStyle: v.remindStyle,
    templateId: v.templateId ?? null,
    sound: v.sound,
    snoozeMin: v.snoozeMin,
    goal: v.goal,
    unitValue: v.unitValue,
    dailyCap: v.dailyCap,
    sort: v.sort,
    remindOverride: !!v.remindOverride,
  };
}
