export const pad2 = (n: number) => String(n).padStart(2, "0");

/** 秒 → mm:ss / h:mm:ss */
export function fmtClock(sec: number): string {
  if (sec < 0) return "--:--";
  const s = Math.floor(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rest = s % 60;
  return h > 0 ? `${h}:${pad2(m)}:${pad2(rest)}` : `${pad2(m)}:${pad2(rest)}`;
}

/** 秒 → "3 分钟" 这类人类可读 */
export function humanMin(sec: number): number {
  return Math.max(1, Math.round(sec / 60));
}

export function fmtDate(lang: string, d = new Date()): string {
  return new Intl.DateTimeFormat(lang === "zh" ? "zh-CN" : "en-US", {
    month: "short",
    day: "numeric",
    weekday: "short",
  }).format(d);
}

export function fmtDayShort(lang: string, iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return new Intl.DateTimeFormat(lang === "zh" ? "zh-CN" : "en-US", {
    month: "numeric",
    day: "numeric",
  }).format(d);
}

export function greeting(hour: number): "morning" | "afternoon" | "evening" {
  if (hour < 12) return "morning";
  if (hour < 18) return "afternoon";
  return "evening";
}
