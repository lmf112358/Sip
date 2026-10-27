use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

const TOAST_W: f64 = 404.0;
const TOAST_H: f64 = 152.0;
const GAP: f64 = 20.0;
const TASKBAR: f64 = 56.0;

fn monitor_metrics(m: &tauri::Monitor) -> (f64, f64, f64, f64) {
    let sf = m.scale_factor();
    let pos = m.position();
    let size = m.size();
    (
        pos.x as f64 / sf,
        pos.y as f64 / sf,
        size.width as f64 / sf,
        size.height as f64 / sf,
    )
}

fn primary_metrics(app: &AppHandle) -> Option<(f64, f64, f64, f64)> {
    app.primary_monitor().ok().flatten().map(|m| monitor_metrics(&m))
}

/// 每个显示器一个全屏提醒窗。
///
/// 每次都销毁重建：复用旧窗口会保留上一次的 `?task=` 参数与陈旧 DOM，
/// 表现就是"点了没反应"或"弹出的是上一个任务"（v1.2 实测 bug 的根因之一）。
pub fn show_reminder_all(app: &AppHandle, task_id: &str) {
    let monitors = match app.available_monitors() {
        Ok(m) => m,
        Err(_) => return,
    };
    for (i, m) in monitors.iter().enumerate() {
        let label = format!("reminder_{i}");
        if let Some(old) = app.get_webview_window(&label) {
            let _ = old.destroy();
        }
        let (x, y, w, h) = monitor_metrics(m);
        let url = format!("reminder.html?task={task_id}");
        let res = WebviewWindowBuilder::new(app, &label, WebviewUrl::App(url.into()))
            .title("")
            .decorations(false)
            .transparent(true)
            .always_on_top(true)
            .skip_taskbar(true)
            .resizable(false)
            .maximizable(false)
            .minimizable(false)
            .closable(false)
            .focused(true)
            .position(x, y)
            .inner_size(w, h)
            .build();
        match res {
            Ok(win) => {
                let _ = win.set_always_on_top(true);
                let _ = win.show();
                let _ = win.set_focus();
                eprintln!("[window] 全屏提醒已显示 {label} task={task_id}");
            }
            Err(e) => eprintln!("[window] 创建提醒窗口 {label} 失败: {e}"),
        }
    }
}

/// 预览：标签带毫秒时间戳保证唯一，页面自己 5 秒后 close
pub fn show_preview_fullscreen(app: &AppHandle) {
    let stamp = chrono::Local::now().format("%H%M%S%3f").to_string();
    let monitors = match app.available_monitors() {
        Ok(m) => m,
        Err(_) => return,
    };
    for (i, m) in monitors.iter().enumerate() {
        let label = format!("preview_fs_{stamp}_{i}");
        let (x, y, w, h) = monitor_metrics(m);
        let res = WebviewWindowBuilder::new(
            app,
            &label,
            WebviewUrl::App("reminder.html?preview=1".into()),
        )
        .title("")
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .maximizable(false)
        .minimizable(false)
        .closable(true)
        .focused(true)
        .position(x, y)
        .inner_size(w, h)
        .build();
        match res {
            Ok(win) => {
                let _ = win.set_always_on_top(true);
                let _ = win.show();
            }
            Err(e) => eprintln!("[window] 创建预览窗口 {label} 失败: {e}"),
        }
    }
}

pub fn hide_all(app: &AppHandle) {
    for (label, win) in app.webview_windows() {
        if label.starts_with("reminder_") || label.starts_with("preview_fs_") {
            let _ = win.hide();
        }
    }
}

pub fn hide_one(app: &AppHandle, label: &str) {
    if let Some(win) = app.get_webview_window(label) {
        let _ = win.hide();
    }
}

fn corner_xy(app: &AppHandle, pos: &str) -> (f64, f64) {
    let Some((mx, my, mw, mh)) = primary_metrics(app) else {
        return (200.0, 200.0);
    };
    let left = mx + GAP;
    let right = mx + mw - TOAST_W - GAP;
    let top = my + GAP;
    let bottom = my + mh - TOAST_H - TASKBAR;
    match pos {
        "tr" => (right, top),
        "tl" => (left, top),
        "bl" => (left, bottom),
        _ => (right, bottom),
    }
}

fn build_toast(app: &AppHandle, url: &str, label: &str, pos: &str) {
    if let Some(old) = app.get_webview_window(label) {
        let _ = old.destroy();
    }
    let (x, y) = corner_xy(app, pos);
    let res = WebviewWindowBuilder::new(app, label, WebviewUrl::App(url.into()))
        .title("")
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .maximizable(false)
        .minimizable(false)
        .closable(false)
        .focused(false)
        .shadow(false)
        .position(x, y)
        .inner_size(TOAST_W, TOAST_H)
        .build();
    match res {
        Ok(win) => {
            let _ = win.set_always_on_top(true);
            let _ = win.show();
            eprintln!("[window] 消息窗已显示 {label} {url}");
        }
        Err(e) => eprintln!("[window] 创建消息窗 {label} 失败: {e}"),
    }
}

/// 消息窗（不抢焦点），pos: br | tr | tl | bl
pub fn show_toast(app: &AppHandle, task_id: &str, pos: &str) {
    build_toast(app, &format!("toast.html?task={task_id}"), "toast", pos);
}

pub fn show_preview_toast(app: &AppHandle, pos: &str) {
    let stamp = chrono::Local::now().format("%H%M%S%3f").to_string();
    let label = format!("preview_toast_{stamp}");
    build_toast(app, "toast.html?preview=1", &label, pos);
}

pub fn hide_toast(app: &AppHandle) {
    for (label, win) in app.webview_windows() {
        if label == "toast" || label.starts_with("preview_toast_") {
            let _ = win.hide();
        }
    }
}

pub fn show_main(app: &AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.show();
        let _ = win.unminimize();
        let _ = win.set_focus();
    }
}
