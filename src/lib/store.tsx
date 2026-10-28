import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { listen } from "@tauri-apps/api/event";
import { api, isTauri } from "./api";
import type { Settings, Snapshot } from "./types";

export const DEFAULT_SETTINGS: Settings = {
  theme: "system",
  accent: "ocean",
  language: "system",
  scale: 1,
  autoStart: false,
  closeToTray: true,
  trayCountdown: true,
  sound: "default",
  volume: 0.6,
  quietHours: [{ start: "12:00", end: "13:30", days: [1, 2, 3, 4, 5], graceSec: 60 }],
  whitelist: [],
  autoCloseSec: 30,
  meetingDefaultMin: 30,
  userName: "",
  weightKg: 65,
  fullscreenImage: null,
  reminder: {
    water: {
      style: "fullscreen", templateId: "fs-water", durationSec: 20, toastSkin: "toast-chat",
      toastPos: "br", sound: "default", volume: 0.6, bgImage: "", bgPreset: "water",
      dim: 0.30, blur: 0, showCountdown: true, senderName: "", messageText: "",
    },
    eyes: {
      style: "fullscreen", templateId: "fs-eyes", durationSec: 0, toastSkin: "toast-chat",
      toastPos: "br", sound: "default", volume: 0.6, bgImage: "", bgPreset: "mint",
      dim: 0.45, blur: 0, showCountdown: true, senderName: "", messageText: "",
    },
    kegel: {
      style: "toast", templateId: "toast-chat", durationSec: 12, toastSkin: "toast-chat",
      toastPos: "br", sound: "none", volume: 0.6, bgImage: "", bgPreset: "dusk",
      dim: 0.30, blur: 0, showCountdown: true, senderName: "", messageText: "",
    },
    break: {
      style: "toast", templateId: "toast-minimal", durationSec: 15, toastSkin: "toast-minimal",
      toastPos: "br", sound: "default", volume: 0.6, bgImage: "", bgPreset: "amber",
      dim: 0.30, blur: 0, showCountdown: true, senderName: "", messageText: "",
    },
    custom: {
      style: "toast", templateId: "toast-minimal", durationSec: 15, toastSkin: "toast-minimal",
      toastPos: "br", sound: "default", volume: 0.6, bgImage: "", bgPreset: "night",
      dim: 0.30, blur: 0, showCountdown: true, senderName: "", messageText: "",
    },
  },
};

const THEME_CACHE_KEY = "sip.appearance";

export function applyTheme(s: Settings) {
  const root = document.documentElement;
  const sysDark =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;
  const dark = s.theme === "dark" || (s.theme === "system" && sysDark);
  root.dataset.theme = dark ? "dark" : "light";
  root.dataset.accent = s.accent;
  root.style.setProperty("--scale", String(s.scale ?? 1));
  try {
    localStorage.setItem(
      THEME_CACHE_KEY,
      JSON.stringify({ theme: s.theme, accent: s.accent, scale: s.scale })
    );
  } catch {
    /* ignore */
  }
}

interface StoreCtx {
  settings: Settings;
  snapshot: Snapshot | null;
  update: (patch: Partial<Settings>) => Promise<void>;
  log: (taskId: string, action: string, value?: number) => Promise<void>;
  snooze: (taskId: string, minutes?: number) => Promise<void>;
  setPaused: (paused: boolean) => Promise<void>;
  startSession: (kind: "meeting" | "focus", minutes: number) => Promise<void>;
  endSession: () => Promise<void>;
  extendSession: (minutes: number) => Promise<void>;
  preview: (taskType: string, style?: string) => Promise<void>;
  deleteRecord: (id: number) => Promise<void>;
  refresh: () => Promise<void>;
  setSnapshot: (s: Snapshot) => void;
  playChime: () => void;
}

const Ctx = createContext<StoreCtx | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const playChime = useCallback(() => {
    const s = settingsRef.current;
    if (s.sound === "none") return;
    try {
      const AC: typeof AudioContext =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      const ctx = new AC();
      const now = ctx.currentTime;
      const peak = Math.max(0, Math.min(1, s.volume ?? 0.6)) * 0.22;
      // 双音柔和提示，1.4s 渐入，避免突然的大音量
      [880, 1174.66].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.linearRampToValueAtTime(peak, now + 1.4);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 2.4 + i * 0.1);
        osc.connect(gain).connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 2.6);
      });
      window.setTimeout(() => ctx.close().catch(() => undefined), 3200);
    } catch {
      /* 静默降级 */
    }
  }, []);

  // 初始加载
  useEffect(() => {
    api.getSettings().then((s) => {
      setSettings(s);
      applyTheme(s);
      api.syncLanguage(s.language);
    });
    api.snapshot().then(setSnapshot).catch(() => undefined);
  }, []);

  // 主题跟随系统
  useEffect(() => {
    if (settings.theme !== "system") {
      applyTheme(settings);
      return;
    }
    applyTheme(settings);
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme(settingsRef.current);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [settings]);

  // 事件订阅
  useEffect(() => {
    if (!isTauri()) {
      const id = window.setInterval(() => {
        api.snapshot().then(setSnapshot).catch(() => undefined);
      }, 1000);
      return () => window.clearInterval(id);
    }
    const disposers: Array<Promise<() => void>> = [
      listen<Snapshot>("tick", (e) => setSnapshot(e.payload)),
      listen<Settings>("settings-changed", (e) => setSettings(e.payload)),
      listen("session-ended", () => {
        api.snapshot().then(setSnapshot).catch(() => undefined);
      }),
      listen("reminder-closed", () => {
        api.snapshot().then(setSnapshot).catch(() => undefined);
      }),
    ];
    return () => {
      disposers.forEach((p) => p.then((f) => f()).catch(() => undefined));
    };
  }, []);

  const update = useCallback(async (patch: Partial<Settings>) => {
    const prev = settingsRef.current;
    const next = { ...prev, ...patch };
    setSettings(next);
    await api.saveSettings(next).catch(() => undefined);
    // 只有语言真的变了才重建托盘菜单：之前每次改音量/主题都重建一次，
    // 拖滑杆会连着重建几十次菜单（主线程开销）
    if (patch.language !== undefined && patch.language !== prev.language) {
      api.syncLanguage(next.language).catch(() => undefined);
    }
  }, []);

  // 同一个任务同一个动作 800ms 内只写一次：双击 / 两个窗口同时回调都不会重复记账
  const lastLog = useRef<{ key: string; at: number }>({ key: "", at: 0 });
  const log = useCallback(async (taskId: string, action: string, value?: number) => {
    const now = Date.now();
    const key = `${taskId}|${action}`;
    if (lastLog.current.key === key && now - lastLog.current.at < 800) return;
    lastLog.current = { key, at: now };
    const s = await api.log(taskId, action, value);
    setSnapshot(s);
  }, []);

  const snooze = useCallback(async (taskId: string, minutes?: number) => {
    const s = await api.snooze(taskId, minutes);
    setSnapshot(s);
  }, []);

  const setPaused = useCallback(async (paused: boolean) => {
    const s = await api.setPaused(paused);
    setSnapshot(s);
  }, []);

  const startSession = useCallback(
    async (kind: "meeting" | "focus", minutes: number) => {
      const s = await api.startSession(kind, minutes);
      setSnapshot(s);
    },
    []
  );

  const endSession = useCallback(async () => {
    const s = await api.endSession();
    setSnapshot(s);
  }, []);

  const extendSession = useCallback(async (minutes: number) => {
    const s = await api.extendSession(minutes);
    setSnapshot(s);
  }, []);

  const preview = useCallback(async (taskType: string, style?: string) => {
    if (!isTauri()) {
      // 浏览器预览：直接开小窗展示（无桌面窗口系统时用 alert 兜底说明）
      await api.previewReminder(taskType, style);
      const p = await api.getPreviewPayload();
      const w = 460;
      const h = 620;
      const left = window.screenX + Math.max(0, (window.outerWidth - w) / 2);
      const top = window.screenY + Math.max(0, (window.outerHeight - h) / 2);
      const url = `${
        p?.style === "toast" ? "/toast.html?preview=1" : "/reminder.html?preview=1"
      }`;
      window.open(url, "sip-preview", `width=${w},height=${h},left=${left},top=${top}`);
      return;
    }
    await api.previewReminder(taskType, style);
  }, []);

  const deleteRecord = useCallback(async (id: number) => {
    const s = await api.deleteRecord(id);
    setSnapshot(s);
  }, []);

  const refresh = useCallback(async () => {
    const s = await api.snapshot();
    setSnapshot(s);
  }, []);

  const value = useMemo<StoreCtx>(
    () => ({
      settings,
      snapshot,
      update,
      log,
      snooze,
      setPaused,
      startSession,
      endSession,
      extendSession,
      preview,
      deleteRecord,
      refresh,
      setSnapshot,
      playChime,
    }),
    [
      settings,
      snapshot,
      update,
      log,
      snooze,
      setPaused,
      startSession,
      endSession,
      extendSession,
      preview,
      deleteRecord,
      refresh,
      playChime,
    ]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): StoreCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("StoreProvider missing");
  return v;
}
