use crate::models::*;
use crate::scheduler::{self, ENGINE};
use crate::{db::Db, windows};
use tauri::{AppHandle, Manager};

#[tauri::command]
pub fn snapshot(app: AppHandle) -> Snapshot {
    scheduler::snapshot_now(&app)
}

#[tauri::command]
pub fn get_settings(app: AppHandle) -> Settings {
    let _ = &app;
    ENGINE.lock().settings.clone()
}

#[tauri::command]
pub fn save_settings(app: AppHandle, settings: Settings) -> Result<Settings, String> {
    let db = app.state::<Db>();
    db.save_settings(&settings)?;
    {
        let mut e = ENGINE.lock();
        e.settings = settings.clone();
    }
    crate::CLOSE_TO_TRAY.store(settings.close_to_tray, std::sync::atomic::Ordering::Relaxed);
    let _ = app.emit_all_settings(&settings);
    Ok(settings)
}

trait EmitSettings {
    fn emit_all_settings(&self, s: &Settings) -> Result<(), String>;
}
impl EmitSettings for AppHandle {
    fn emit_all_settings(&self, s: &Settings) -> Result<(), String> {
        use tauri::Emitter;
        self.emit("settings-changed", s.clone()).map_err(|e| e.to_string())
    }
}

#[tauri::command]
pub fn save_task(app: AppHandle, mut task: Task) -> Result<Snapshot, String> {
    let db = app.state::<Db>();
    if task.id.trim().is_empty() {
        task.id = uuid::Uuid::new_v4().to_string();
    }
    if task.interval_min < 1 {
        task.interval_min = 1;
    }
    if task.weekdays.is_empty() {
        task.weekdays = vec![0, 1, 2, 3, 4, 5, 6];
    }
    db.save_task(&task)?;
    {
        let mut e = ENGINE.lock();
        e.reload_tasks(&db);
    }
    Ok(scheduler::snapshot_now(&app))
}

#[tauri::command]
pub fn delete_task(app: AppHandle, id: String) -> Result<Snapshot, String> {
    let db = app.state::<Db>();
    db.delete_task(&id)?;
    {
        let mut e = ENGINE.lock();
        e.reload_tasks(&db);
    }
    Ok(scheduler::snapshot_now(&app))
}

#[tauri::command]
pub fn set_task_enabled(app: AppHandle, id: String, enabled: bool) -> Result<Snapshot, String> {
    let db = app.state::<Db>();
    let mut tasks = db.load_tasks();
    if let Some(t) = tasks.iter_mut().find(|t| t.id == id) {
        t.enabled = enabled;
        db.save_task(t)?;
    }
    {
        let mut e = ENGINE.lock();
        e.reload_tasks(&db);
    }
    Ok(scheduler::snapshot_now(&app))
}

#[tauri::command]
pub fn reorder_tasks(app: AppHandle, ids: Vec<String>) -> Result<(), String> {
    let db = app.state::<Db>();
    db.reorder(&ids)
}

#[tauri::command]
pub fn log(app: AppHandle, task_id: String, action: String, value: Option<f64>) -> Snapshot {
    scheduler::log_action(&app, &task_id, &action, value)
}

#[tauri::command]
pub fn snooze(app: AppHandle, task_id: String, minutes: Option<i64>) -> Snapshot {
    scheduler::log_action(&app, &task_id, "snooze", minutes.map(|m| m as f64))
}

/// 预览提醒（不动计时、不写记录）。style 为空则用该类型的默认形态
#[tauri::command]
pub fn preview_reminder(app: AppHandle, task_type: String, style: Option<String>) {
    let db = app.state::<Db>();
    let task = db
        .load_tasks()
        .into_iter()
        .find(|t| t.task_type == task_type)
        .unwrap_or_else(|| synthetic_task(&task_type));

    let mut payload = scheduler::build_payload(&app, &task);
    if let Some(s) = style {
        if matches!(s.as_str(), STYLE_FULLSCREEN | STYLE_TOAST | STYLE_SYSTEM) {
            payload.style = s;
        }
    }
    payload.preview = true;
    payload.auto_close_sec = if payload.style == STYLE_SYSTEM { 3 } else { 5 };
    {
        let mut e = ENGINE.lock();
        e.preview = Some(payload.clone());
    }
    match payload.style.as_str() {
        STYLE_TOAST => windows::show_preview_toast(&app, &payload.toast_pos),
        STYLE_SYSTEM => crate::notify::send(&app, &payload),
        _ => windows::show_preview_fullscreen(&app),
    }
}

#[tauri::command]
pub fn get_preview_payload() -> Option<RemindPayload> {
    ENGINE.lock().preview.clone()
}

/// 任务不存在时用内置默认构造一个，保证预览不缺数据
fn synthetic_task(task_type: &str) -> Task {
    let (icon, unit, goal) = match task_type {
        T_WATER => ("water", 250.0, 2000.0),
        T_EYES => ("eyes", 120.0, 6.0),
        T_KEGEL => ("kegel", 1.0, 8.0),
        T_BREAK => ("break", 300.0, 4.0),
        _ => ("bell", 1.0, 3.0),
    };
    let mut t = Task::new_seed(task_type, "", icon, 45, goal, unit, STYLE_FULLSCREEN, "", 5, 0);
    t.name = String::new();
    t.name_key = Some(format!("task.{task_type}"));
    t
}

#[tauri::command]
pub fn delete_record(app: AppHandle, id: i64) -> Result<Snapshot, String> {
    let db = app.state::<Db>();
    db.delete_record(id)?;
    {
        let mut e = ENGINE.lock();
        e.refresh_today(&db);
    }
    Ok(scheduler::snapshot_now(&app))
}

#[tauri::command]
pub fn set_paused(app: AppHandle, paused: bool) -> Snapshot {
    {
        let mut e = ENGINE.lock();
        e.paused_manual = paused;
        if paused {
            e.queue.clear();
            e.pending = None;
        }
    }
    if paused {
        windows::hide_all(&app);
        windows::hide_toast(&app);
    }
    scheduler::snapshot_now(&app)
}

#[tauri::command]
pub fn start_session(app: AppHandle, kind: String, minutes: i64) -> Snapshot {
    scheduler::start_session(&app, &kind, minutes)
}

#[tauri::command]
pub fn end_session(app: AppHandle) -> Snapshot {
    scheduler::end_session(&app, "manual")
}

#[tauri::command]
pub fn extend_session(app: AppHandle, minutes: i64) -> Snapshot {
    scheduler::extend_session(&app, minutes)
}

#[tauri::command]
pub fn stats(app: AppHandle, days: Option<u32>) -> StatsPayload {
    let db = app.state::<Db>();
    db.stats(days.unwrap_or(7).clamp(1, 365))
}

#[tauri::command]
pub fn export_csv(app: AppHandle) -> Result<String, String> {
    let db = app.state::<Db>();
    db.export_csv()
}

#[tauri::command]
pub fn import_media(app: AppHandle, path: String) -> Result<String, String> {
    let db = app.state::<Db>();
    let src = std::path::Path::new(&path);
    if !src.exists() {
        return Err("file not found".into());
    }
    let ext = src
        .extension()
        .map(|e| e.to_string_lossy().to_lowercase())
        .unwrap_or_else(|| "png".into());
    let name = format!("{}.{}", uuid::Uuid::new_v4(), ext);
    let dst = db.media_dir.join(&name);
    std::fs::copy(src, &dst).map_err(|e| e.to_string())?;
    Ok(name)
}

#[tauri::command]
pub fn media_path(app: AppHandle, file: String) -> String {
    let db = app.state::<Db>();
    db.media_dir.join(file).to_string_lossy().to_string()
}

#[tauri::command]
pub fn open_data_dir(app: AppHandle) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    let db = app.state::<Db>();
    let dir = db.media_dir.parent().unwrap_or(&db.media_dir);
    app.opener()
        .open_path(dir.to_string_lossy().to_string(), None::<&str>)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_remind_payload(app: AppHandle, task_id: String) -> Option<RemindPayload> {
    let db = app.state::<Db>();
    db.load_tasks()
        .into_iter()
        .find(|t| t.id == task_id)
        .map(|t| scheduler::build_payload(&app, &t))
}

#[tauri::command]
pub fn hide_reminder(app: AppHandle, label: String) {
    windows::hide_one(&app, &label);
    // 一次提醒可能在多个显示器各开一个窗口，其余的一并关掉
    windows::destroy_reminders(&app);
    windows::destroy_toasts(&app);
    let mut e = ENGINE.lock();
    e.pending = None;
    // 关掉之后留出 3 秒静默期（gap_ok 就是拿 last_pop 算的），
    // 否则队列里积压的下一条会瞬间盖上来，看起来像「两个提醒打架」
    e.last_pop = Some(std::time::Instant::now());
}

#[tauri::command]
pub fn hide_toast(app: AppHandle) {
    windows::hide_toast(&app);
    windows::destroy_reminders(&app);
    let mut e = ENGINE.lock();
    e.pending = None;
    e.last_pop = Some(std::time::Instant::now());
}

#[tauri::command]
pub fn show_main(app: AppHandle) {
    windows::show_main(&app);
}

#[tauri::command]
pub fn hide_main(app: AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.hide();
    }
}

#[tauri::command]
pub fn sync_language(app: AppHandle, lang: String) -> Result<(), String> {
    {
        let mut e = ENGINE.lock();
        e.resolved_lang = if lang.starts_with("en") { "en".into() } else { "zh".into() };
    }
    crate::rebuild_tray(&app).map_err(|e| e.to_string())
}

/// 前端诊断日志：提醒窗/消息窗到底有没有渲染出来，直接看后台日志即可
#[tauri::command]
pub fn diag(msg: String) {
    eprintln!("[ui] {msg}");
}

#[tauri::command]
pub fn quit(app: AppHandle) {
    crate::request_quit(&app);
}
