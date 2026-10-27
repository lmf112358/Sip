import { getCurrentWindow } from "@tauri-apps/api/window";
import { isTauri } from "./api";

export const isMaximized = async () => {
  if (!isTauri()) return false;
  try {
    return await getCurrentWindow().isMaximized();
  } catch {
    return false;
  }
};

export async function minimizeWindow() {
  if (!isTauri()) return;
  try {
    await getCurrentWindow().minimize();
  } catch {
    /* ignore */
  }
}

export async function toggleMaximize() {
  if (!isTauri()) return;
  try {
    await getCurrentWindow().toggleMaximize();
  } catch {
    /* ignore */
  }
}

export async function closeWindow() {
  if (!isTauri()) return;
  try {
    await getCurrentWindow().close();
  } catch {
    /* ignore */
  }
}
