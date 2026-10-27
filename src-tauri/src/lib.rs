mod commands;
mod db;
mod i18n;
mod models;
mod notify;
mod platform;
mod scheduler;
mod windows;

use db::Db;
use models::*;
use scheduler::ENGINE;
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Manager, WindowEvent};

static RUST_LOG_READY: AtomicBool = AtomicBool::new(false);
/// 「关闭时最小化到托盘」。用原子量而不是读 ENGINE：
/// on_window_event 跑在主线程，若此时调度线程正持锁（它在里面还要往主线程派发托盘/窗口任务），
/// 双方互等就是死锁 —— 表现正是「窗口关不掉、退出也退不掉、界面卡住」。
pub static CLOSE_TO_TRAY: AtomicBool = AtomicBool::new(true);

/// 真正的退出：先销毁所有窗口（含可能卡住的 WebView），再走正常退出；
/// 2 秒后仍未退出就强杀进程 —— 退出必须退得掉，这是底线。
pub fn request_quit(app: &AppHandle) {
    println!("[sip] 退出中…");
    windows::destroy_all(app);
    app.exit(0);
    let handle = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(2000));
        eprintln!("[sip] 正常退出超时，强制结束进程");
        let _ = &handle;
        std::process::exit(0);
    });
}

fn tray_menu(app: &AppHandle) -> tauri::Result<Menu<tauri::Wry>> {
    let (lang, has_session) = {
        let e = ENGINE.lock();
        (e.resolved_lang.clone(), e.session.is_some())
    };
    let none: Option<&str> = None;

    let water = MenuItem::with_id(app, "quick:water", i18n::tray(&lang, "water"), true, none)?;
    let eyes = MenuItem::with_id(app, "quick:eyes", i18n::tray(&lang, "eyes_done"), true, none)?;
    let sep1 = PredefinedMenuItem::separator(app)?;

    let sub = if has_session {
        Submenu::with_items(
            app,
            i18n::tray(&lang, "meeting_end"),
            true,
            &[&MenuItem::with_id(app, "meeting:end", i18n::tray(&lang, "meeting_end"), true, none)?],
        )?
    } else {
        let mut items: Vec<MenuItem<tauri::Wry>> = Vec::new();
        items.push(MenuItem::with_id(app, "meeting:15", i18n::tray(&lang, "m15"), true, none)?);
        items.push(MenuItem::with_id(app, "meeting:30", i18n::tray(&lang, "m30"), true, none)?);
        items.push(MenuItem::with_id(app, "meeting:60", i18n::tray(&lang, "m60"), true, none)?);
        items.push(MenuItem::with_id(app, "meeting:0", i18n::tray(&lang, "unlimited"), true, none)?);
        let refs: Vec<&dyn tauri::menu::IsMenuItem<tauri::Wry>> =
            items.iter().map(|i| i as &dyn tauri::menu::IsMenuItem<tauri::Wry>).collect();
        Submenu::with_items(app, i18n::tray(&lang, "meeting"), true, &refs)?
    };

    let paused = ENGINE.lock().paused_manual;
    let pause_item = if paused {
        MenuItem::with_id(app, "resume", i18n::tray(&lang, "resume"), true, none)?
    } else {
        MenuItem::with_id(app, "pause", i18n::tray(&lang, "pause"), true, none)?
    };
    let focus = MenuItem::with_id(app, "focus", i18n::tray(&lang, "focus"), true, none)?;
    let sep2 = PredefinedMenuItem::separator(app)?;
    let show = MenuItem::with_id(app, "show", i18n::tray(&lang, "show"), true, none)?;
    let quit = MenuItem::with_id(app, "quit", i18n::tray(&lang, "quit"), true, none)?;

    Menu::with_items(
        app,
        &[
            &water,
            &eyes,
            &sep1,
            &sub,
            &pause_item,
            &focus,
            &sep2,
            &show,
            &quit,
        ],
    )
}

pub fn rebuild_tray(app: &AppHandle) -> tauri::Result<()> {
    let menu = tray_menu(app)?;
    if let Some(tray) = app.tray_by_id("main-tray") {
        tray.set_menu(Some(menu))?;
        return Ok(());
    }
    let icon = tauri::image::Image::from_bytes(include_bytes!("../icons/icon-tray.png"))?;
    TrayIconBuilder::with_id("main-tray")
        .icon(icon)
        .icon_as_template(true)
        .tooltip("小满 Sip")
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(|app, ev| on_menu(app, ev.id().as_ref()))
        .on_tray_icon_event(|tray, event| {
            if let tauri::tray::TrayIconEvent::DoubleClick { .. } = event {
                windows::show_main(tray.app_handle());
            }
        })
        .build(app)?;
    Ok(())
}

fn on_menu(app: &AppHandle, id: &str) {
    match id {
        "meeting:end" => {
            scheduler::end_session(app, "manual");
        }
        "pause" => {
            let mut e = ENGINE.lock();
            e.paused_manual = true;
            e.queue.clear();
            e.pending = None;
            drop(e);
            windows::hide_all(app);
            windows::hide_toast(app);
            let _ = rebuild_tray(app);
        }
        "resume" => {
            ENGINE.lock().paused_manual = false;
            let _ = rebuild_tray(app);
        }
        "focus" => {
            scheduler::start_session(app, "focus", 30);
        }
        "show" => windows::show_main(app),
        "quit" => crate::request_quit(app),
        "quick:water" | "quick:eyes" => {
            let kind = if id == "quick:water" { T_WATER } else { T_EYES };
            let db = app.state::<Db>();
            if let Some(t) = db.load_tasks().into_iter().find(|t| t.task_type == kind) {
                scheduler::log_action(app, &t.id, "complete", None);
            }
        }
        other if other.starts_with("meeting:") => {
            let minutes: i64 = other[8..].parse().unwrap_or(30);
            scheduler::start_session(app, "meeting", minutes);
        }
        _ => {}
    }
}

fn register_shortcuts(app: &AppHandle) {
    use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

    #[cfg(target_os = "macos")]
    let mods = Modifiers::SUPER | Modifiers::SHIFT;
    #[cfg(not(target_os = "macos"))]
    let mods = Modifiers::CONTROL | Modifiers::SHIFT;

    let m = Shortcut::new(Some(mods), Code::KeyM);
    let h = Shortcut::new(Some(mods), Code::KeyH);

    let res = app.global_shortcut().on_shortcut(m, |app, _sc, event| {
        if event.state() != ShortcutState::Pressed {
            return;
        }
        let has = ENGINE.lock().session.is_some();
        if has {
            scheduler::end_session(app, "manual");
        } else {
            let minutes = ENGINE.lock().settings.meeting_default_min;
            scheduler::start_session(app, "meeting", minutes);
        }
    });
    if let Err(e) = res {
        eprintln!("[shortcut] Ctrl+Shift+M 注册失败: {e}");
    }

    let res2 = app.global_shortcut().on_shortcut(h, |app, _sc, event| {
        if event.state() == ShortcutState::Pressed {
            windows::show_main(app);
        }
    });
    if let Err(e) = res2 {
        eprintln!("[shortcut] Ctrl+Shift+H 注册失败: {e}");
    }

    // 逃生键：万一提醒窗的网页没渲染出来（白屏/黑屏），Esc 就没机会响应，
    // 这里给一个系统级兜底，随手把提醒关掉。
    let x = Shortcut::new(Some(mods), Code::KeyX);
    let res3 = app.global_shortcut().on_shortcut(x, |app, _sc, event| {
        if event.state() != ShortcutState::Pressed {
            return;
        }
        windows::destroy_reminders(app);
        windows::destroy_toasts(app);
        ENGINE.lock().pending = None;
        eprintln!("[shortcut] 已强制关闭所有提醒");
    });
    if let Err(e) = res3 {
        eprintln!("[shortcut] Ctrl+Shift+X 注册失败: {e}");
    }
}

/// 主线程看门狗：每 2 秒测一次「往主线程派发任务再回来」的耗时。
/// 这个数字突然飙到秒级，就说明主线程被卡住（窗口操作、WebView 合成、死锁都会这样），
/// 日志里能直接看到，不用再靠猜。
fn start_watchdog(app: AppHandle) {
    std::thread::spawn(move || loop {
        std::thread::sleep(std::time::Duration::from_secs(2));
        let t0 = std::time::Instant::now();
        let (tx, rx) = std::sync::mpsc::channel();
        if app
            .run_on_main_thread(move || {
                let _ = tx.send(());
            })
            .is_err()
        {
            return;
        }
        match rx.recv_timeout(std::time::Duration::from_secs(5)) {
            Ok(()) => {
                let ms = t0.elapsed().as_millis();
                if ms >= 500 {
                    eprintln!("[watchdog] 主线程响应耗时 {ms}ms");
                }
            }
            Err(_) => eprintln!("[watchdog] 主线程 5 秒无响应，疑似卡死"),
        }
    });
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--silent"]),
        ))
        .setup(|app| {
            let handle = app.handle().clone();

            let db = Db::init(&handle).expect("数据库初始化失败");
            app.manage(db);

            scheduler::boot(&handle);
            CLOSE_TO_TRAY.store(
                ENGINE.lock().settings.close_to_tray,
                Ordering::Relaxed,
            );
            rebuild_tray(&handle)?;
            register_shortcuts(&handle);
            scheduler::start_loop(handle.clone());

            start_watchdog(handle.clone());

            // 测试钩子：SIP_QUIT_AFTER_SEC=5 时 5 秒后走正常退出流程（用来验证「退出到底退不退得掉」）
            if let Ok(v) = std::env::var("SIP_QUIT_AFTER_SEC") {
                if let Ok(sec) = v.parse::<u64>() {
                    let h = handle.clone();
                    std::thread::spawn(move || {
                        std::thread::sleep(std::time::Duration::from_secs(sec));
                        eprintln!("[sip] 测试钩子触发退出");
                        crate::request_quit(&h);
                    });
                }
            }

            RUST_LOG_READY.store(true, Ordering::SeqCst);
            println!("[sip] 启动完成");
            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() == "main" {
                if let WindowEvent::CloseRequested { api, .. } = event {
                    if CLOSE_TO_TRAY.load(Ordering::Relaxed) {
                        api.prevent_close();
                        let _ = window.hide();
                    } else {
                        crate::request_quit(window.app_handle());
                    }
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::snapshot,
            commands::get_settings,
            commands::save_settings,
            commands::save_task,
            commands::delete_task,
            commands::set_task_enabled,
            commands::reorder_tasks,
            commands::log,
            commands::snooze,
            commands::preview_reminder,
            commands::get_preview_payload,
            commands::delete_record,
            commands::set_paused,
            commands::start_session,
            commands::end_session,
            commands::extend_session,
            commands::stats,
            commands::export_csv,
            commands::import_media,
            commands::media_path,
            commands::open_data_dir,
            commands::get_remind_payload,
            commands::hide_reminder,
            commands::hide_toast,
            commands::show_main,
            commands::hide_main,
            commands::sync_language,
            commands::diag,
            commands::quit
        ])
        .run(tauri::generate_context!())
        .expect("Tauri 启动失败");
}
