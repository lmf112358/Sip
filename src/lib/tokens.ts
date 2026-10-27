import type { TaskType } from "./types";

export const TASK_VAR: Record<string, string> = {
  water: "var(--water)",
  eyes: "var(--eyes)",
  kegel: "var(--kegel)",
  break: "var(--break)",
  custom: "var(--accent)",
};

export const TYPE_ORDER: TaskType[] = ["water", "eyes", "kegel", "break", "custom"];

export const ICON_KEYS = [
  "water", "eyes", "kegel", "break",
  "walk", "stretch", "coffee", "pill",
  "book", "phone", "sun", "moon",
];

export function taskColor(type?: string) {
  return TASK_VAR[type ?? "custom"] ?? "var(--accent)";
}

export const DEFAULT_TEMPLATES = [
  { id: "fs-water", name: "深海渐变", style: "fullscreen", type: "water" },
  { id: "fs-eyes", name: "闭眼休息", style: "fullscreen", type: "eyes" },
  { id: "fs-kegel", name: "静谧夜色", style: "fullscreen", type: "kegel" },
  { id: "fs-break", name: "暖阳小憩", style: "fullscreen", type: "break" },
  { id: "toast-chat", name: "聊天消息", style: "toast", type: "kegel" },
  { id: "toast-mail", name: "新邮件", style: "toast", type: "custom" },
  { id: "toast-system", name: "系统提示", style: "toast", type: "custom" },
  { id: "toast-minimal", name: "极简胶囊", style: "toast", type: "break" },
  { id: "sys-default", name: "系统通知", style: "system", type: "custom" },
];
