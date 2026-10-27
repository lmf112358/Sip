import { useT } from "@/i18n";
import type { MsgKey } from "@/i18n/zh";
import type { RemindStyle, Task, TaskType } from "@/lib/types";
import { ICON_KEYS, TASK_VAR } from "@/lib/tokens";
import { TaskIcon } from "./icons/TaskIcon";
import { Field, Segmented, TextInput } from "./ui";

export const blankTask = (): Task => ({
  id: "",
  name: "",
  nameKey: null,
  type: "custom",
  icon: "custom",
  enabled: true,
  intervalMin: 60,
  activeStart: "09:00",
  activeEnd: "18:00",
  weekdays: [1, 2, 3, 4, 5],
  remindStyle: "toast",
  templateId: "toast-minimal",
  sound: "default",
  snoozeMin: 5,
  goal: 0,
  unitValue: 1,
  dailyCap: 0,
  sort: 99,
  remindOverride: false,
});

export const TYPE_PRESET: Record<TaskType, Partial<Task>> = {
  water: { icon: "water", templateId: "fs-water", remindStyle: "fullscreen", unitValue: 250, goal: 2000, intervalMin: 45 },
  eyes: { icon: "eyes", templateId: "fs-eyes", remindStyle: "fullscreen", unitValue: 120, goal: 6, intervalMin: 60 },
  kegel: { icon: "kegel", templateId: "toast-chat", remindStyle: "toast", unitValue: 1, goal: 8, intervalMin: 90 },
  break: { icon: "break", templateId: "toast-minimal", remindStyle: "toast", unitValue: 300, goal: 4, intervalMin: 50 },
  custom: { icon: "custom", templateId: "toast-minimal", remindStyle: "toast", unitValue: 1, goal: 0, intervalMin: 60 },
};

/** 任务编辑表单（详情页与新建弹窗共用） */
export function TaskForm({
  draft,
  set,
}: {
  draft: Task;
  set: (patch: Partial<Task>) => void;
}) {
  const { t } = useT();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Field label={t("task.name")}>
        <TextInput
          value={draft.name}
          placeholder={t("task.namePlaceholder")}
          onChange={(v) => set({ name: v })}
        />
      </Field>

      <Field label={t("task.type")}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {(["water", "eyes", "kegel", "break", "custom"] as TaskType[]).map((ty) => {
            const active = draft.type === ty;
            return (
              <button
                key={ty}
                onClick={() =>
                  set({
                    type: ty,
                    icon: TYPE_PRESET[ty].icon ?? draft.icon,
                    templateId: TYPE_PRESET[ty].templateId ?? draft.templateId,
                    remindStyle: (TYPE_PRESET[ty].remindStyle ?? draft.remindStyle) as RemindStyle,
                    unitValue: TYPE_PRESET[ty].unitValue ?? draft.unitValue,
                    goal: TYPE_PRESET[ty].goal ?? draft.goal,
                    intervalMin: TYPE_PRESET[ty].intervalMin ?? draft.intervalMin,
                    nameKey: draft.id ? draft.nameKey : null,
                  })
                }
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 7,
                  padding: "8px 13px",
                  borderRadius: 10,
                  fontSize: 13,
                  color: active ? "var(--text)" : "var(--text-dim)",
                  border: `1px solid ${active ? TASK_VAR[ty] : "var(--border)"}`,
                  background: active ? `color-mix(in srgb, ${TASK_VAR[ty]} 12%, transparent)` : "transparent",
                  transition: "150ms",
                }}
              >
                <TaskIcon name={TYPE_PRESET[ty].icon} size={16} color={TASK_VAR[ty]} />
                {t(`task.${ty}` as MsgKey)}
              </button>
            );
          })}
        </div>
      </Field>

      <Field label={t("task.icon")}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {ICON_KEYS.map((k) => (
            <button
              key={k}
              onClick={() => set({ icon: k })}
              style={{
                width: 36,
                height: 36,
                borderRadius: 9,
                display: "grid",
                placeItems: "center",
                color: draft.icon === k ? TASK_VAR[draft.type] : "var(--text-mute)",
                border: `1px solid ${draft.icon === k ? TASK_VAR[draft.type] : "var(--border)"}`,
                background: draft.icon === k ? "var(--surface-2)" : "transparent",
              }}
            >
              <TaskIcon name={k} size={17} />
            </button>
          ))}
        </div>
      </Field>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <Field label={t("task.interval")}>
          <TextInput type="number" min={1} value={draft.intervalMin} onChange={(v) => set({ intervalMin: Number(v) })} />
        </Field>
        <Field label={t("task.snooze")}>
          <TextInput type="number" min={0} value={draft.snoozeMin} onChange={(v) => set({ snoozeMin: Number(v) })} />
        </Field>
        <Field label={t("task.goal")}>
          <TextInput type="number" min={0} value={draft.goal} onChange={(v) => set({ goal: Number(v) })} />
        </Field>
        <Field label={t("task.unitValue")}>
          <TextInput type="number" min={0} value={draft.unitValue} onChange={(v) => set({ unitValue: Number(v) })} />
        </Field>
        <Field label={t("task.activeTime")}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <TextInput type="time" value={draft.activeStart} onChange={(v) => set({ activeStart: v })} />
            <span style={{ color: "var(--text-mute)" }}>–</span>
            <TextInput type="time" value={draft.activeEnd} onChange={(v) => set({ activeEnd: v })} />
          </div>
        </Field>
        <Field label={t("task.cap")}>
          <TextInput type="number" min={0} value={draft.dailyCap} onChange={(v) => set({ dailyCap: Number(v) })} />
        </Field>
      </div>

      <Field label={t("task.weekdays")}>
        <div style={{ display: "flex", gap: 6 }}>
          {[1, 2, 3, 4, 5, 6, 0].map((d) => {
            const on = draft.weekdays.includes(d);
            return (
              <button
                key={d}
                onClick={() =>
                  set({
                    weekdays: on
                      ? draft.weekdays.filter((x) => x !== d)
                      : [...draft.weekdays, d].sort((a, b) => a - b),
                  })
                }
                style={{
                  width: 38,
                  height: 34,
                  borderRadius: 9,
                  fontSize: 12.5,
                  color: on ? "var(--text)" : "var(--text-mute)",
                  border: `1px solid ${on ? "var(--accent)" : "var(--border)"}`,
                  background: on ? "var(--accent-soft)" : "transparent",
                }}
              >
                {t(`weekday.${d}` as MsgKey)}
              </button>
            );
          })}
        </div>
      </Field>

      <Field label={t("task.style")} hint={t("task.followDefault.desc")}>
        <div style={{ marginBottom: 10 }}>
          <Segmented
            size="sm"
            value={draft.remindOverride ? "custom" : "default"}
            onChange={(v) => set({ remindOverride: v === "custom" })}
            options={[
              { value: "default", label: t("task.followDefault") },
              { value: "custom", label: t("task.overrideOn") },
            ]}
          />
        </div>
        {draft.remindOverride ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {(["fullscreen", "toast", "system"] as RemindStyle[]).map((st) => {
              const active = draft.remindStyle === st;
              return (
                <button
                  key={st}
                  onClick={() => set({ remindStyle: st })}
                  style={{
                    textAlign: "left",
                    padding: "10px 13px",
                    borderRadius: 11,
                    border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
                    background: active ? "var(--accent-soft)" : "transparent",
                    transition: "150ms",
                  }}
                >
                  <div style={{ fontSize: 13, color: "var(--text)" }}>{t(`task.style.${st}` as MsgKey)}</div>
                  <div style={{ fontSize: 11.5, color: "var(--text-mute)", marginTop: 2 }}>
                    {t(`task.style.${st}.desc` as MsgKey)}
                  </div>
                </button>
              );
            })}
          </div>
        ) : null}
      </Field>
    </div>
  );
}
