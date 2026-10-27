import { invoke } from "@tauri-apps/api/core";
import { isTauri, mockCall } from "./mock";
import type {
  RemindPayload,
  Settings,
  Snapshot,
  StatsPayload,
  Task,
} from "./types";

async function call<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauri()) return mockCall<T>(cmd, args);
  return invoke<T>(cmd, args);
}

export const api = {
  /** 前端诊断日志：只在桌面端发，浏览器里直接丢掉 */
  diag: (msg: string) => (isTauri() ? call<void>("diag", { msg }).catch(() => undefined) : Promise.resolve()),
  snapshot: () => call<Snapshot>("snapshot"),
  getSettings: () => call<Settings>("get_settings"),
  saveSettings: (settings: Settings) => call<Settings>("save_settings", { settings }),

  saveTask: (task: Task) => call<Snapshot>("save_task", { task }),
  deleteTask: (id: string) => call<Snapshot>("delete_task", { id }),
  setTaskEnabled: (id: string, enabled: boolean) =>
    call<Snapshot>("set_task_enabled", { id, enabled }),
  reorderTasks: (ids: string[]) => call<void>("reorder_tasks", { ids }),

  log: (taskId: string, action: string, value?: number) =>
    call<Snapshot>("log", { taskId, action, value }),
  snooze: (taskId: string, minutes?: number) =>
    call<Snapshot>("snooze", { taskId, minutes }),
  /** 预览提醒：不动计时、不写记录 */
  previewReminder: (taskType: string, style?: string) =>
    call<void>("preview_reminder", { taskType, style }),
  getPreviewPayload: () => call<RemindPayload | null>("get_preview_payload"),
  deleteRecord: (id: number) => call<Snapshot>("delete_record", { id }),

  setPaused: (paused: boolean) => call<Snapshot>("set_paused", { paused }),
  startSession: (kind: "meeting" | "focus", minutes: number) =>
    call<Snapshot>("start_session", { kind, minutes }),
  endSession: () => call<Snapshot>("end_session"),
  extendSession: (minutes: number) => call<Snapshot>("extend_session", { minutes }),

  stats: (days: number) => call<StatsPayload>("stats", { days }),
  exportCsv: () => call<string>("export_csv"),
  importMedia: (path: string) => call<string>("import_media", { path }),
  mediaPath: (file: string) => call<string>("media_path", { file }),
  openDataDir: () => call<void>("open_data_dir"),

  getRemindPayload: (taskId: string) =>
    call<RemindPayload | null>("get_remind_payload", { taskId }),
  hideReminder: (label: string) => call<void>("hide_reminder", { label }),
  hideToast: () => call<void>("hide_toast"),

  showMain: () => call<void>("show_main"),
  hideMain: () => call<void>("hide_main"),
  syncLanguage: (lang: string) => call<void>("sync_language", { lang }),
  quit: () => call<void>("quit"),
};

export { isTauri };
