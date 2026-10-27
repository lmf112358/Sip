//! 平台相关能力：前台应用白名单、锁屏检测
//!
//! Windows 走 Win32 API；macOS / Linux 本期返回中性值（不阻塞调度），
//! 后续如需可接 NSWorkspace / X11，见 DESIGN.md 第 10 章。

#[cfg(windows)]
pub fn foreground_app() -> Option<String> {
    use windows_sys::Win32::Foundation::CloseHandle;
    use windows_sys::Win32::System::Threading::{
        OpenProcess, QueryFullProcessImageNameW, PROCESS_QUERY_LIMITED_INFORMATION,
    };
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        GetForegroundWindow, GetWindowThreadProcessId,
    };

    unsafe {
        let hwnd = GetForegroundWindow();
        if hwnd.is_null() {
            return None;
        }
        let mut pid: u32 = 0;
        GetWindowThreadProcessId(hwnd, &mut pid);
        if pid == 0 {
            return None;
        }
        let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
        if handle.is_null() {
            return None;
        }
        let mut buf = [0u16; 512];
        let mut size = buf.len() as u32;
        let ok = QueryFullProcessImageNameW(handle, 0, buf.as_mut_ptr(), &mut size);
        CloseHandle(handle);
        if ok == 0 {
            return None;
        }
        let path = String::from_utf16_lossy(&buf[..size as usize]);
        path.rsplit(['\\', '/']).next().map(|s| s.to_string())
    }
}

#[cfg(windows)]
pub fn screen_locked() -> bool {
    use windows_sys::Win32::System::StationsAndDesktops::{
        CloseDesktop, OpenInputDesktop, DESKTOP_READOBJECTS, DESKTOP_SWITCHDESKTOP,
    };
    unsafe {
        let h = OpenInputDesktop(0, 0, DESKTOP_READOBJECTS | DESKTOP_SWITCHDESKTOP);
        if h.is_null() {
            // 无法打开输入桌面，几乎只会在锁屏 / UAC 安全桌面时发生
            return true;
        }
        CloseDesktop(h);
        false
    }
}

#[cfg(not(windows))]
pub fn foreground_app() -> Option<String> {
    None
}

#[cfg(not(windows))]
pub fn screen_locked() -> bool {
    false
}

/// 前台应用是否命中白名单（模糊匹配，兼容进程名与中文名）
pub fn in_whitelist(whitelist: &[String]) -> bool {
    let Some(app) = foreground_app() else {
        return false;
    };
    let app_lower = app.to_lowercase();
    whitelist.iter().any(|w| {
        let w = w.trim().to_lowercase();
        if w.is_empty() {
            return false;
        }
        app_lower.contains(&w) || w.contains(&app_lower)
    })
}
