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
        "quit" => app.exit(0),
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
            rebuild_tray(&handle)?;
            register_shortcuts(&handle);
            scheduler::start_loop(handle.clone());

            RUST_LOG_READY.store(true, Ordering::SeqCst);
            println!("[sip] 启动完成");
            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() == "main" {
                if let WindowEvent::CloseRequested { api, .. } = event {
                    let close_to_tray = ENGINE.lock().settings.close_to_tray;
                    if close_to_tray {
                        api.prevent_close();
                        let _ = window.hide();
                    } else {
                        let _ = window.app_handle().exit(0);
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
            commands::quit
        ])
        .run(tauri::generate_context!())
        .expect("Tauri 启动失败");
}
