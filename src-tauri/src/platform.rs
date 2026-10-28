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
    // 排查用：某些环境（远程桌面、切换用户、安全桌面）下 OpenInputDesktop 会一直失败，
    // 导致调度器误以为一直锁屏、所有提醒都不弹。设 SIP_IGNORE_LOCK=1 可绕过。
    if std::env::var_os("SIP_IGNORE_LOCK").is_some() {
        return false;
    }
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
        if app_lower.contains(&w) || w.contains(&app_lower) {
            return true;
        }
        // 中文应用名匹配不到进程名（腾讯会议的进程叫 wemeetapp.exe），
        // 必须靠别名表，否则默认白名单里的「腾讯会议」永远不生效
        exe_aliases(&w).iter().any(|a| app_lower.contains(a))
    })
}

/// 白名单项 → 真实进程名片段
fn exe_aliases(w: &str) -> &'static [&'static str] {
    match w {
        "腾讯会议" | "tencent meeting" | "wemeet" | "voov" => &["wemeetapp", "wemeet", "voov"],
        "钉钉" | "dingtalk" => &["dingtalk"],
        "飞书" | "feishu" | "lark" => &["feishu", "lark"],
        "企业微信" | "wecom" => &["wxwork"],
        "微信" | "wechat" => &["wechat", "weixin"],
        "zoom" => &["zoom"],
        "teams" | "microsoft teams" => &["teams"],
        _ => &[],
    }
}

/// 启动失败时的原生弹窗：windows_subsystem="windows" 没有控制台，
/// 只 eprintln 等于什么都没说，用户只会觉得「点了没反应」。
#[cfg(windows)]
pub fn fatal_dialog(msg: &str) {
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        MessageBoxW, MB_ICONERROR, MB_OK, MB_SETFOREGROUND,
    };
    fn wide(s: &str) -> Vec<u16> {
        s.encode_utf16().chain(std::iter::once(0)).collect()
    }
    let text = wide(msg);
    let cap = wide("小满 Sip");
    unsafe {
        MessageBoxW(
            std::ptr::null_mut(),
            text.as_ptr(),
            cap.as_ptr(),
            MB_OK | MB_ICONERROR | MB_SETFOREGROUND,
        );
    }
}

#[cfg(not(windows))]
pub fn fatal_dialog(msg: &str) {
    eprintln!("[sip] {msg}");
}
