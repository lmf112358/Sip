import type { MsgKey } from "@/i18n/zh";

type Tf = (k: MsgKey, vars?: Record<string, string | number>) => string;

/** 任务显示名：用户改过名用自己的，否则按类型取词典 */
export function taskLabel(
  task: { type?: string; name?: string; nameKey?: string | null },
  t: Tf
): string {
  if (task.name && task.name.trim()) return task.name;
  const key = (task.nameKey ?? `task.${task.type ?? "custom"}`) as MsgKey;
  const v = t(key);
  return v === key ? t("task.custom") : v;
}

export function actionLabel(
  task: { type?: string; unitValue?: number; name?: string },
  t: Tf
): string {
  switch (task.type) {
    case "water":
      return t("remind.water.action", { n: Math.round(task.unitValue ?? 250) });
    case "eyes":
      return t("remind.eyes.action");
    case "kegel":
      return t("remind.kegel.action");
    case "break":
      return t("remind.break.action");
    default:
      return t("remind.custom.action");
  }
}

export function progressText(
  task: { type?: string; doneToday?: number; countToday?: number; goal?: number },
  t: Tf
): string {
  if (!task.goal || task.goal <= 0) {
    return task.type === "water"
      ? t("unit.ml", { n: Math.round(task.doneToday ?? 0) })
      : t("unit.times", { n: task.countToday ?? 0 });
  }
  if (task.type === "water") {
    return `${Math.round(task.doneToday ?? 0)} / ${Math.round(task.goal)} ml`;
  }
  return `${task.countToday ?? 0} / ${Math.round(task.goal)}`;
}
