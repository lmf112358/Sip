import type {
  RecordRow,
  RemindPayload,
  RemindProfile,
  Settings,
  Snapshot,
  TaskView,
  TaskType,
  TypeSummary,
} from "./types";

const now = () => new Date();
const pad = (n: number) => String(n).padStart(2, "0");
const hhmm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

interface MockTask {
  id: string;
  name: string;
  nameKey: string;
  type: TaskType;
  icon: string;
  enabled: boolean;
  intervalMin: number;
  activeStart: string;
  activeEnd: string;
  weekdays: number[];
  remindStyle: "fullscreen" | "toast" | "system";
  templateId: string;
  sound: string;
  snoozeMin: number;
  goal: number;
  unitValue: number;
  dailyCap: number;
  sort: number;
  remindOverride: boolean;
  done: number;
  count: number;
  skips: number;
  due: number;
}

const defaultProfile = (t: TaskType): RemindProfile => ({
  style: t === "kegel" || t === "break" ? "toast" : "fullscreen",
  templateId: t === "kegel" ? "toast-chat" : t === "break" ? "toast-minimal" : `fs-${t}`,
  durationSec: t === "eyes" ? 0 : 20,
  toastSkin: t === "kegel" ? "toast-chat" : "toast-minimal",
  toastPos: "br",
  sound: t === "kegel" ? "none" : "default",
  volume: 0.6,
  bgImage: "",
  bgPreset: t === "water" ? "water" : t === "eyes" ? "mint" : t === "kegel" ? "dusk" : "amber",
  dim: 0.55,
  blur: 0,
  showCountdown: true,
  senderName: "",
  messageText: "",
});

const state: {
  tasks: MockTask[];
  settings: Settings;
  session: { kind: "meeting" | "focus"; startedAt: number; plannedMin: number } | null;
  paused: boolean;
  records: RecordRow[];
  preview: RemindPayload | null;
} = {
  tasks: [
    {
      id: "t-water", name: "", nameKey: "task.water", type: "water", icon: "water",
      enabled: true, intervalMin: 45, activeStart: "09:00", activeEnd: "18:00",
      weekdays: [1, 2, 3, 4, 5], remindStyle: "fullscreen", templateId: "fs-water",
      sound: "default", snoozeMin: 5, goal: 2000, unitValue: 250, dailyCap: 0, sort: 0,
      remindOverride: false, done: 750, count: 3, skips: 0, due: Date.now() + 12 * 60_000 + 34_000,
    },
    {
      id: "t-eyes", name: "", nameKey: "task.eyes", type: "eyes", icon: "eyes",
      enabled: true, intervalMin: 60, activeStart: "09:00", activeEnd: "18:00",
      weekdays: [1, 2, 3, 4, 5], remindStyle: "fullscreen", templateId: "fs-eyes",
      sound: "default", snoozeMin: 5, goal: 6, unitValue: 120, dailyCap: 0, sort: 1,
      remindOverride: false, done: 240, count: 2, skips: 1, due: Date.now() + 42 * 60_000 + 10_000,
    },
    {
      id: "t-kegel", name: "", nameKey: "task.kegel", type: "kegel", icon: "kegel",
      enabled: true, intervalMin: 90, activeStart: "09:00", activeEnd: "18:00",
      weekdays: [1, 2, 3, 4, 5], remindStyle: "toast", templateId: "toast-chat",
      sound: "none", snoozeMin: 10, goal: 8, unitValue: 1, dailyCap: 0, sort: 2,
      remindOverride: false, done: 1, count: 1, skips: 0, due: Date.now() + 68 * 60_000 + 22_000,
    },
    {
      id: "t-break", name: "", nameKey: "task.break", type: "break", icon: "break",
      enabled: true, intervalMin: 50, activeStart: "09:00", activeEnd: "18:00",
      weekdays: [1, 2, 3, 4, 5], remindStyle: "toast", templateId: "toast-minimal",
      sound: "default", snoozeMin: 10, goal: 4, unitValue: 300, dailyCap: 0, sort: 3,
      remindOverride: false, done: 900, count: 3, skips: 0, due: Date.now() + 28 * 60_000,
    },
  ],
  settings: {
    theme: "system", accent: "ocean", language: "system", scale: 1,
    autoStart: false, closeToTray: true, trayCountdown: true, sound: "default",
    volume: 0.6,
    quietHours: [{ start: "12:00", end: "13:30", days: [1, 2, 3, 4, 5], graceSec: 60 }],
    whitelist: ["腾讯会议", "Zoom", "Teams"], autoCloseSec: 30,
    meetingDefaultMin: 30, userName: "", weightKg: 65,
    fullscreenImage: null,
    reminder: {
      water: defaultProfile("water"),
      eyes: defaultProfile("eyes"),
      kegel: defaultProfile("kegel"),
      break: defaultProfile("break"),
      custom: defaultProfile("custom"),
    },
  },
  session: null,
  paused: false,
  records: [
    { id: 4, taskId: "t-water", taskType: "water", taskName: "task.water", action: "complete", value: 250, day: "", ts: "13:42" },
    { id: 3, taskId: "t-eyes", taskType: "eyes", taskName: "task.eyes", action: "complete", value: 120, day: "", ts: "13:10" },
    { id: 2, taskId: "t-water", taskType: "water", taskName: "task.water", action: "complete", value: 250, day: "", ts: "12:58" },
    { id: 1, taskId: "t-eyes", taskType: "eyes", taskName: "task.eyes", action: "skip", value: 0, day: "", ts: "11:50" },
  ],
  preview: null,
};

function inRange(start: string, end: string, d = now()) {
  const cur = d.getHours() * 60 + d.getMinutes();
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const s = sh * 60 + sm;
  const e = eh * 60 + em;
  return s <= e ? cur >= s && cur <= e : cur >= s || cur <= e;
}

function quietNow() {
  const q = state.settings.quietHours ?? [];
  const wd = now().getDay();
  return q.find((x) => x.days.includes(wd) && inRange(x.start, x.end));
}

function toView(t: MockTask) {
  const remaining = Math.max(0, Math.round((t.due - Date.now()) / 1000));
  const goalRatio =
    t.goal <= 0 ? 0 : Math.min(1, (t.type === "water" ? t.done : t.count) / t.goal);
  const reached = t.goal > 0 && (t.type === "water" ? t.done >= t.goal : t.count >= t.goal);
  return {
    ...t,
    remainingSec: remaining,
    doneToday: t.done,
    countToday: t.count,
    skipToday: t.skips,
    goalRatio,
    status: state.session
      ? "meeting"
      : state.paused
        ? "paused"
        : quietNow()
          ? "paused"
          : reached
            ? "done"
            : "running",
    nextDue: hhmm(new Date(t.due)),
  } as unknown as TaskView;
}

export function mockSnapshot(): Snapshot {
  const tasks = state.tasks.map(toView);
  const next = [...tasks]
    .filter((t) => t.status === "running")
    .sort((a, b) => a.remainingSec - b.remainingSec)[0];
  const today: TypeSummary[] = state.tasks.map((t) => ({
    type: t.type,
    name: t.name,
    nameKey: t.nameKey,
    icon: t.icon,
    count: t.count,
    value: t.done,
    goal: t.goal,
    skips: t.skips,
  }));
  const water = today.find((t) => t.type === "water");
  const q = quietNow();
  return {
    now: `${pad(now().getHours())}:${pad(now().getMinutes())}:${pad(now().getSeconds())}`,
    paused: !!state.session || state.paused || !!q,
    pauseReason: state.session ? "session" : state.paused ? "manual" : q ? "quiet" : null,
    session: state.session
      ? {
          kind: state.session.kind,
          startedAt: new Date(state.session.startedAt).toTimeString().slice(0, 5),
          plannedMin: state.session.plannedMin,
          remainingSec: state.session.plannedMin
            ? Math.max(
                0,
                Math.round(
                  (state.session.startedAt + state.session.plannedMin * 60_000 - Date.now()) / 1000
                )
              )
            : -1,
        }
      : null,
    softLandingSec: 0,
    sessionEndedByRestart: false,
    tasks,
    today,
    nextTaskId: next?.id ?? null,
    todayWaterMl: water?.value ?? 0,
    todayWaterGoal: water?.goal ?? 0,
    quietNow: !!q,
    quietEnd: q?.end ?? null,
    records: state.records,
  };
}

const statsDays = (n: number) =>
  Array.from({ length: n }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (n - 1 - i));
    const day = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const base = 1 + ((i * 7) % 4);
    return {
      day,
      byType: {
        water: { value: 750 + base * 250, times: 3 + (i % 3), skips: i % 2 },
        eyes: { value: base * 120, times: base, skips: 0 },
        kegel: { value: 2 + (i % 3), times: 2 + (i % 3), skips: 0 },
        break: { value: 300 * (1 + (i % 3)), times: 1 + (i % 3), skips: 0 },
      },
    };
  });

function profileOf(t: TaskType): RemindProfile {
  return state.settings.reminder?.[t] ?? defaultProfile(t);
}

function buildPayload(t: MockTask, preview = false): RemindPayload {
  const p = profileOf(t.type);
  const override = t.remindOverride;
  return {
    taskId: t.id,
    name: t.name,
    nameKey: t.nameKey,
    type: t.type,
    icon: t.icon,
    style: override ? t.remindStyle : p.style,
    templateId: override ? t.templateId : p.templateId,
    unitValue: t.unitValue,
    doneToday: t.done,
    goal: t.goal,
    snoozeMin: t.snoozeMin,
    autoCloseSec: p.durationSec > 0 ? p.durationSec : 30,
    durationSec: t.type === "eyes" || t.type === "break" ? t.unitValue : 0,
    accent: state.settings.accent,
    intervalMin: t.intervalMin,
    bgPreset: p.bgPreset,
    bgImage: p.bgImage,
    dim: p.dim,
    blur: p.blur,
    showCountdown: p.showCountdown,
    toastSkin: p.toastSkin,
    toastPos: p.toastPos,
    senderName: p.senderName,
    messageText: p.messageText,
    preview,
  };
}

let recId = 100;

export async function mockCall<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  switch (cmd) {
    case "snapshot":
      return mockSnapshot() as T;
    case "get_settings":
      return { ...state.settings } as T;
    case "save_settings":
      state.settings = { ...(args?.settings as Settings) };
      return { ...state.settings } as T;
    case "log":
    case "snooze": {
      const id = args?.taskId as string;
      const action = cmd === "snooze" ? "snooze" : (args?.action as string);
      const t = state.tasks.find((x) => x.id === id);
      if (t) {
        const value = Number(args?.value ?? (action === "complete" ? t.unitValue : 5)) || 0;
        if (action === "complete") {
          t.done += t.unitValue;
          t.count += 1;
          t.due = Date.now() + t.intervalMin * 60_000;
        } else if (action === "skip") {
          t.skips += 1;
          t.due = Date.now() + t.intervalMin * 60_000;
        } else {
          t.due = Date.now() + (value || 5) * 60_000;
        }
        state.records = [
          {
            id: ++recId,
            taskId: t.id,
            taskType: t.type,
            taskName: t.nameKey,
            action: action as RecordRow["action"],
            value: action === "complete" ? t.unitValue : value,
            day: "",
            ts: hhmm(now()),
          },
          ...state.records,
        ];
      }
      return mockSnapshot() as T;
    }
    case "delete_record": {
      const id = Number(args?.id);
      state.records = state.records.filter((r) => r.id !== id);
      return mockSnapshot() as T;
    }
    case "preview_reminder": {
      const ty = String(args?.taskType ?? "water") as TaskType;
      const t = state.tasks.find((x) => x.type === ty) ?? state.tasks[0];
      const payload = buildPayload(t, true);
      const style = args?.style as string | undefined;
      if (style) payload.style = style as RemindPayload["style"];
      payload.autoCloseSec = payload.style === "system" ? 3 : 5;
      state.preview = payload;
      return undefined as T;
    }
    case "get_preview_payload": {
      // 浏览器里直接打开 reminder.html?preview=1 时没有前置调用，兜底造一份
      if (!state.preview) {
        const hint =
          typeof location !== "undefined"
            ? new URLSearchParams(location.search).get("task")
            : null;
        const t =
          state.tasks.find((x) => x.id === hint || x.type === hint) ?? state.tasks[0];
        const p = buildPayload(t, true);
        p.autoCloseSec = p.style === "system" ? 3 : 5;
        state.preview = p;
      }
      return state.preview as T;
    }
    case "save_task": {
      const task = args?.task as MockTask;
      const idx = state.tasks.findIndex((t) => t.id === task.id);
      if (idx >= 0) state.tasks[idx] = { ...state.tasks[idx], ...task };
      else
        state.tasks.push({
          ...task,
          done: 0,
          count: 0,
          skips: 0,
          due: Date.now() + task.intervalMin * 60_000,
        } as MockTask);
      return mockSnapshot() as T;
    }
    case "delete_task":
      state.tasks = state.tasks.filter((t) => t.id !== args?.id);
      return mockSnapshot() as T;
    case "set_task_enabled": {
      const t = state.tasks.find((x) => x.id === args?.id);
      if (t) t.enabled = !!args?.enabled;
      return mockSnapshot() as T;
    }
    case "reorder_tasks":
      return undefined as T;
    case "set_paused":
      state.paused = !!args?.paused;
      return mockSnapshot() as T;
    case "start_session":
      state.session = {
        kind: (args?.kind as "meeting" | "focus") ?? "meeting",
        startedAt: Date.now(),
        plannedMin: Number(args?.minutes ?? 0),
      };
      return mockSnapshot() as T;
    case "end_session":
      state.session = null;
      return mockSnapshot() as T;
    case "extend_session":
      if (state.session) state.session.plannedMin += Number(args?.minutes ?? 15);
      return mockSnapshot() as T;
    case "stats":
      return {
        days: statsDays(Number(args?.days ?? 7)),
        hourly: [0, 0, 1, 0, 0, 0, 1, 2, 3, 4, 2, 3, 5, 2, 4, 3, 2, 1, 0, 0, 0, 0, 0, 0],
        streak: 6,
        weekTotal: 27,
        skipRate: 8,
        meetingMinutes: 390,
      } as T;
    case "get_remind_payload": {
      const t = state.tasks.find((x) => x.id === args?.taskId) ?? state.tasks[0];
      return buildPayload(t) as T;
    }
    case "export_csv":
      return "/mock/sip.csv" as T;
    case "import_media":
      return "mock-media.gif" as T;
    case "media_path":
      return "" as T;
    case "hide_reminder":
    case "hide_toast":
    case "sync_language":
    case "show_main":
    case "hide_main":
    case "open_data_dir":
      return undefined as T;
    default:
      return undefined as T;
  }
}

export const isTauri = () =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
