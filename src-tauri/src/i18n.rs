use crate::models::*;

pub fn remind_title(lang: &str, task_type: &str) -> String {
    let en = lang == "en";
    match task_type {
        T_WATER => if en { "Time for water" } else { "该喝水了" }.to_string(),
        T_EYES => if en { "Eye exercise time" } else { "该做眼保健操了" }.to_string(),
        T_KEGEL => if en { "New message" } else { "新消息" }.to_string(),
        T_BREAK => if en { "Take a short break" } else { "该休息一下了" }.to_string(),
        _ => if en { "Reminder" } else { "提醒" }.to_string(),
    }
}

pub fn remind_body(lang: &str, task_type: &str, interval: i64) -> String {
    let en = lang == "en";
    match task_type {
        T_WATER => if en {
            format!("You haven't had water for {interval} min.")
        } else {
            format!("已经 {interval} 分钟没喝水啦，来一杯吧。")
        },
        T_EYES => if en {
            "Look 20 feet away for 20 seconds, then do the exercise.".to_string()
        } else {
            "看向 20 英尺外 20 秒，然后做一组眼保健操。".to_string()
        },
        T_KEGEL => if en { "1 new message".to_string() } else { "1 条新消息".to_string() },
        T_BREAK => if en {
            "Stand up, stretch, and rest your eyes.".to_string()
        } else {
            "起身活动一下，让眼睛离开屏幕。".to_string()
        },
        _ => if en { "Time to check in.".to_string() } else { "到点了，去看一眼。".to_string() },
    }
}

/// 会话提示文案：(标题, 正文)。key 见调用方
pub fn session_text(lang: &str, key: &str, min: i64) -> (String, String) {
    let en = lang == "en";
    match key {
        // 会议剩 3 分钟
        "soon" => {
            if en {
                (
                    "Meeting ending soon".to_string(),
                    format!("About {min} min left. Reminders resume afterwards."),
                )
            } else {
                (
                    "会议即将结束".to_string(),
                    format!("还剩约 {min} 分钟，结束后提醒会自动恢复。"),
                )
            }
        }
        // 不限时长已开 2 小时
        "long" => {
            if en {
                (
                    "Still in meeting mode?".to_string(),
                    "Meeting mode has run 2 hours. End it to bring reminders back.".to_string(),
                )
            } else {
                (
                    "还在会议中？".to_string(),
                    "会议模式已持续 2 小时，结束一下，提醒就会回来。".to_string(),
                )
            }
        }
        _ => (String::new(), String::new()),
    }
}

pub fn tray(lang: &str, key: &str) -> &'static str {
    let en = lang == "en";
    match key {
        "meeting" => if en { "Start meeting mode" } else { "开启会议模式" },
        "meeting_end" => if en { "End meeting mode" } else { "结束会议" },
        "m15" => if en { "15 minutes" } else { "15 分钟" },
        "m30" => if en { "30 minutes" } else { "30 分钟" },
        "m60" => if en { "60 minutes" } else { "60 分钟" },
        "unlimited" => if en { "Until I stop" } else { "不限时长" },
        "pause" => if en { "Pause all" } else { "暂停全部提醒" },
        "resume" => if en { "Resume" } else { "恢复提醒" },
        "focus" => if en { "Focus 30 min" } else { "专注 30 分钟" },
        "show" => if en { "Open window" } else { "打开主窗口" },
        "quit" => if en { "Quit" } else { "退出" },
        "water" => if en { "Water +250 ml" } else { "喝水 +250 ml" },
        "eyes_done" => if en { "Eye exercise done" } else { "眼保健操完成" },
        _ => "",
    }
}
