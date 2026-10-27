use crate::i18n;
use crate::models::RemindPayload;
use crate::scheduler::ENGINE;
use tauri::AppHandle;
use tauri_plugin_notification::NotificationExt;

pub fn send(app: &AppHandle, p: &RemindPayload) {
    let lang = ENGINE.lock().resolved_lang.clone();
    let title = i18n::remind_title(&lang, &p.task_type);
    let body = i18n::remind_body(&lang, &p.task_type, 0);
    if let Err(e) = app
        .notification()
        .builder()
        .title(title)
        .body(body)
        .show()
    {
        eprintln!("[notify] 发送失败: {e}");
    }
}

/// 纯文本通知（会议预告 / 防遗忘提醒）
pub fn send_text(app: &AppHandle, title: &str, body: &str) {
    if let Err(e) = app
        .notification()
        .builder()
        .title(title)
        .body(body)
        .show()
    {
        eprintln!("[notify] 发送失败: {e}");
    }
}
