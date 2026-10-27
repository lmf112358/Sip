export type TaskType = "water" | "eyes" | "kegel" | "break" | "custom";
export type RemindStyle = "fullscreen" | "toast" | "system";
export type TaskStatus = "running" | "paused" | "done" | "inactive" | "meeting";

export interface Task {
  id: string;
  name: string;
  nameKey?: string | null;
  type: TaskType;
  icon: string;
  enabled: boolean;
  intervalMin: number;
  activeStart: string;
  activeEnd: string;
  weekdays: number[];
  remindStyle: RemindStyle;
  templateId?: string | null;
  sound: string;
  snoozeMin: number;
  goal: number;
  unitValue: number;
  dailyCap: number;
  sort: number;
  /** true = 用任务自身的提醒方式；false = 跟随设置里该类型的默认值 */
  remindOverride?: boolean;
}

export interface TaskView extends Task {
  remainingSec: number;
  doneToday: number;
  countToday: number;
  skipToday: number;
  goalRatio: number;
  status: TaskStatus;
  nextDue?: string | null;
}

export interface TypeSummary {
  type: TaskType;
  name: string;
  nameKey?: string | null;
  icon: string;
  count: number;
  value: number;
  goal: number;
  skips: number;
}

export interface SessionView {
  kind: "meeting" | "focus";
  startedAt: string;
  plannedMin: number;
  remainingSec: number;
}

/** 单条今日记录 */
export interface RecordRow {
  id: number;
  taskId: string;
  taskType: TaskType;
  taskName: string;
  action: "complete" | "skip" | "snooze" | "note";
  value: number;
  day: string;
  /** HH:MM */
  ts: string;
}

export interface Snapshot {
  now: string;
  paused: boolean;
  pauseReason?: string | null;
  session?: SessionView | null;
  softLandingSec: number;
  sessionEndedByRestart: boolean;
  tasks: TaskView[];
  today: TypeSummary[];
  nextTaskId?: string | null;
  todayWaterMl: number;
  todayWaterGoal: number;
  /** 当前处于安静时段（午休等） */
  quietNow: boolean;
  quietEnd?: string | null;
  records: RecordRow[];
}

export interface RemindPayload {
  taskId: string;
  name: string;
  nameKey?: string | null;
  type: TaskType;
  icon: string;
  style: RemindStyle;
  templateId?: string | null;
  unitValue: number;
  doneToday: number;
  goal: number;
  snoozeMin: number;
  autoCloseSec: number;
  durationSec: number;
  accent: string;
  intervalMin: number;
  // v1.3 个性化
  bgPreset: string;
  bgImage: string;
  dim: number;
  blur: number;
  showCountdown: boolean;
  toastSkin: string;
  toastPos: "br" | "tr" | "tl" | "bl";
  senderName: string;
  messageText: string;
  preview: boolean;
}

/** 作息安静时段 */
export interface QuietHour {
  start: string;
  end: string;
  days: number[];
  /** 结束后缓冲秒数，0 = 立刻恢复 */
  graceSec: number;
}

/** 按任务类型的提醒默认值 */
export interface RemindProfile {
  style: RemindStyle;
  templateId: string;
  durationSec: number;
  toastSkin: string;
  toastPos: "br" | "tr" | "tl" | "bl";
  sound: string;
  volume: number;
  bgImage: string;
  bgPreset: string;
  dim: number;
  blur: number;
  showCountdown: boolean;
  senderName: string;
  messageText: string;
}

export interface Settings {
  theme: "dark" | "light" | "system";
  accent: "ocean" | "violet" | "emerald" | "amber";
  language: "zh" | "en" | "system";
  scale: number;
  autoStart: boolean;
  closeToTray: boolean;
  trayCountdown: boolean;
  sound: string;
  volume: number;
  quietHours: QuietHour[];
  whitelist: string[];
  autoCloseSec: number;
  meetingDefaultMin: number;
  userName: string;
  weightKg: number;
  fullscreenImage?: string | null;
  reminder: Record<string, RemindProfile>;
}

export interface TypeDay {
  value: number;
  times: number;
  skips: number;
}

export interface DayStat {
  day: string;
  byType: Partial<Record<TaskType, TypeDay>>;
}

export interface StatsPayload {
  days: DayStat[];
  hourly: number[];
  streak: number;
  weekTotal: number;
  skipRate: number;
  meetingMinutes: number;
}
