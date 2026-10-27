use tauri::window::Color;
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

const TOAST_W: f64 = 404.0;
const TOAST_H: f64 = 152.0;
const GAP: f64 = 20.0;
const TASKBAR: f64 = 56.0;
/// 全屏提醒窗底色：与渐变最暗处接近，避免白闪
const REMINDER_BG: Color = Color(8, 11, 16, 255);

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

/// 当前所有窗口 label，仅用于诊断日志
pub fn window_labels(app: &AppHandle) -> Vec<String> {
    let mut v: Vec<String> = app.webview_windows().keys().cloned().collect();
    v.sort();
    v
}

/// 销毁所有全屏提醒窗（含预览）。
///
/// 用 destroy 而不是 hide：hide 只是把窗口藏起来，里面的 WebView 仍在跑
/// 每秒倒计时和 CSS 动画，几个窗口叠着就会明显抢占 CPU/GPU（表现为「提醒很卡」）。
pub fn destroy_reminders(app: &AppHandle) {
    for (label, win) in app.webview_windows() {
        if label.starts_with("reminder_") || label.starts_with("preview_fs_") {
            let _ = win.destroy();
        }
    }
}

/// 当前是否有任何提醒窗还开着（不依赖具体 label 编号）
pub fn has_reminder(app: &AppHandle) -> bool {
    app.webview_windows()
        .keys()
        .any(|l| l.starts_with("reminder_") || l.starts_with("preview_fs_"))
}

/// 当前是否有任何消息窗还开着
pub fn has_toast(app: &AppHandle) -> bool {
    app.webview_windows()
        .keys()
        .any(|l| l == "toast" || l.starts_with("preview_toast_"))
}

/// 销毁所有消息窗（含预览）
pub fn destroy_toasts(app: &AppHandle) {
    for (label, win) in app.webview_windows() {
        if label == "toast" || label.starts_with("preview_toast_") {
            let _ = win.destroy();
        }
    }
}

/// 每个显示器一个全屏提醒窗。
///
/// 每次都销毁重建：复用旧窗口会保留上一次的 `?task=` 参数与陈旧 DOM，
/// 表现就是"点了没反应"或"弹出的是上一个任务"。
pub fn show_reminder_all(app: &AppHandle, task_id: &str) {
    // 同一时刻只允许一个提醒：先把旧的（含残留消息窗）清干净，避免叠窗
    destroy_reminders(app);
    destroy_toasts(app);

    let monitors = match app.available_monitors() {
        Ok(m) => m,
        Err(e) => {
            eprintln!("[window] 枚举显示器失败: {e}");
            return;
        }
    };
    // destroy 是异步派发到主线程的，紧接着建同名窗口会撞上 "already exists"，
    // 所以先等旧窗真正消失（最多 600ms），再开新窗。
    for _ in 0..30 {
        if !has_reminder(app) {
            break;
        }
        std::thread::sleep(std::time::Duration::from_millis(20));
    }

    for (i, m) in monitors.iter().enumerate() {
        let label = format!("reminder_{i}");
        let (x, y, w, h) = monitor_metrics(m);
        let t0 = std::time::Instant::now();
        let url = format!("reminder.html?task={task_id}");
        let res = WebviewWindowBuilder::new(app, &label, WebviewUrl::App(url.into()))
            .title("")
            .decorations(false)
            // 不透明窗口：整屏透明分层窗口在 Windows 上走软件合成，2560×1440 会明显掉帧
            .transparent(false)
            .background_color(REMINDER_BG)
            .always_on_top(true)
            .skip_taskbar(true)
            .resizable(false)
            .maximizable(false)
            .minimizable(false)
            // 允许关闭：万一面板卡住，Alt+F4 仍能逃生（关闭后由调度器自愈 pending）
            .closable(true)
            .focused(i == 0)
            .position(x, y)
            .inner_size(w, h)
            .build();
        match res {
            Ok(win) => {
                let _ = win.set_always_on_top(true);
                let _ = win.show();
                if i == 0 {
                    let _ = win.set_focus();
                }
                let shown_url = win
                    .url()
                    .map(|u| u.to_string())
                    .unwrap_or_else(|_| "<unknown>".into());
                eprintln!(
                    "[window] 全屏提醒已显示 {label} task={task_id} 用时{}ms url={shown_url}",
                    t0.elapsed().as_millis()
                );
                // 探针：建窗那一瞬间 url() 常常还是 about:blank，1.5 秒后再看一次，
                // 才能判断页面到底有没有真的开始加载（加载失败＝用户看到一块空屏，
                // 而且页面里的倒计时不会跑，只能靠调度器超时兜底）
                let probe = win.clone();
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_millis(1500));
                    let u = probe.url().map(|x| x.to_string()).unwrap_or_default();
                    let t = probe.title().unwrap_or_default();
                    let vis = probe.is_visible().unwrap_or(false);
                    eprintln!("[window] 提醒窗 {label} 1.5s 后 url={u} title=[{t}] visible={vis}");
                });
            }
            Err(e) => eprintln!("[window] 创建提醒窗口 {label} 失败: {e}"),
        }
    }
}

/// 预览：标签带毫秒时间戳保证唯一，页面自己 5 秒后 close
pub fn show_preview_fullscreen(app: &AppHandle) {
    destroy_reminders(app);
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
        .transparent(false)
        .background_color(REMINDER_BG)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .maximizable(false)
        .minimizable(false)
        .closable(true)
        .focused(i == 0)
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

/// 关闭提醒（保留旧名字，内部改为销毁）
pub fn hide_all(app: &AppHandle) {
    destroy_reminders(app);
}

pub fn hide_one(app: &AppHandle, label: &str) {
    if let Some(win) = app.get_webview_window(label) {
        let _ = win.destroy();
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
    destroy_toasts(app);
    let (x, y) = corner_xy(app, pos);
    let res = WebviewWindowBuilder::new(app, label, WebviewUrl::App(url.into()))
        .title("")
        .decorations(false)
        // 消息窗要保持透明（圆角 + 投影），但面积只有 404×152，开销可接受
        .transparent(true)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .maximizable(false)
        .minimizable(false)
        .closable(true)
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
    // 同一个提醒只出现一次：先清掉可能残留的全屏窗
    destroy_reminders(app);
    build_toast(app, &format!("toast.html?task={task_id}"), "toast", pos);
}

pub fn show_preview_toast(app: &AppHandle, pos: &str) {
    let stamp = chrono::Local::now().format("%H%M%S%3f").to_string();
    let label = format!("preview_toast_{stamp}");
    build_toast(app, "toast.html?preview=1", &label, pos);
}

pub fn hide_toast(app: &AppHandle) {
    destroy_toasts(app);
}

pub fn show_main(app: &AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.show();
        let _ = win.unminimize();
        let _ = win.set_focus();
    }
}

/// 退出前把所有窗口关掉，防止有窗口（或卡死的 WebView）拖住事件循环
pub fn destroy_all(app: &AppHandle) {
    for (label, win) in app.webview_windows() {
        if label != "main" {
            let _ = win.destroy();
        }
    }
}
