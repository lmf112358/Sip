use serde::{Deserialize, Serialize};
use std::collections::HashMap;

pub const T_WATER: &str = "water";
pub const T_EYES: &str = "eyes";
pub const T_KEGEL: &str = "kegel";
pub const T_BREAK: &str = "break";
pub const T_CUSTOM: &str = "custom";

pub const STYLE_FULLSCREEN: &str = "fullscreen";
pub const STYLE_TOAST: &str = "toast";
pub const STYLE_SYSTEM: &str = "system";

/// 任务到期弹窗的优先级，数字越小越优先
pub fn type_priority(t: &str) -> u8 {
    match t {
        T_WATER => 0,
        T_EYES => 1,
        T_KEGEL => 2,
        T_BREAK => 3,
        _ => 4,
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Task {
    pub id: String,
    /// 用户自定义名；空串表示使用 name_key 对应词典文案
    #[serde(default)]
    pub name: String,
    /// 内置任务默认名 key，如 "task.water"
    #[serde(default)]
    pub name_key: Option<String>,
    #[serde(rename = "type")]
    pub task_type: String,
    pub icon: String,
    pub enabled: bool,
    pub interval_min: i64,
    pub active_start: String,
    pub active_end: String,
    pub weekdays: Vec<u8>,
    pub remind_style: String,
    #[serde(default)]
    pub template_id: Option<String>,
    pub sound: String,
    pub snooze_min: i64,
    pub goal: f64,
    pub unit_value: f64,
    pub daily_cap: i64,
    pub sort: i64,
    /// true = 使用任务自身的 remind_style/template_id；false = 跟随设置里该类型的默认提醒
    #[serde(default)]
    pub remind_override: bool,
}

impl Task {
    pub fn new_seed(
        task_type: &str,
        name_key: &str,
        icon: &str,
        interval: i64,
        goal: f64,
        unit: f64,
        style: &str,
        template: &str,
        snooze: i64,
        sort: i64,
    ) -> Task {
        Task {
            id: uuid::Uuid::new_v4().to_string(),
            name: String::new(),
            name_key: Some(name_key.to_string()),
            task_type: task_type.to_string(),
            icon: icon.to_string(),
            enabled: true,
            interval_min: interval,
            active_start: "09:00".into(),
            active_end: "18:00".into(),
            weekdays: vec![1, 2, 3, 4, 5],
            remind_style: style.to_string(),
            template_id: Some(template.to_string()),
            sound: "default".into(),
            snooze_min: snooze,
            goal,
            unit_value: unit,
            daily_cap: 0,
            sort,
            remind_override: false,
        }
    }

    /// 是否为持续型任务（有单次时长，全屏页要显示倒计时）
    pub fn duration_sec(&self) -> i64 {
        match self.task_type.as_str() {
            T_EYES | T_BREAK => self.unit_value as i64,
            T_KEGEL => {
                // 提肛按"单组秒数"计：unit_value 存组数时可忽略时长
                0
            }
            _ => 0,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskView {
    #[serde(flatten)]
    pub task: Task,
    /// 剩余秒数；-1 表示未运行（暂停 / 非活跃时段 / 已完成）
    pub remaining_sec: i64,
    pub done_today: f64,
    pub count_today: i64,
    pub skip_today: i64,
    pub goal_ratio: f64,
    /// running | paused | done | inactive | meeting
    pub status: String,
    pub next_due: Option<String>,
}

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct TypeSummary {
    #[serde(rename = "type")]
    pub task_type: String,
    pub name: String,
    pub name_key: Option<String>,
    pub icon: String,
    pub count: i64,
    pub value: f64,
    pub goal: f64,
    pub skips: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionView {
    pub kind: String,
    pub started_at: String,
    pub planned_min: i64,
    /// <0 表示不限时长
    pub remaining_sec: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub now: String,
    pub paused: bool,
    pub pause_reason: Option<String>,
    pub session: Option<SessionView>,
    pub soft_landing_sec: i64,
    pub session_ended_by_restart: bool,
    pub tasks: Vec<TaskView>,
    pub today: Vec<TypeSummary>,
    pub next_task_id: Option<String>,
    pub today_water_ml: f64,
    pub today_water_goal: f64,
    /// 当前是否处于安静时段（午休等）
    pub quiet_now: bool,
    pub quiet_end: Option<String>,
    /// 今日记录流水（最新在前，最多 40 条）
    #[serde(default)]
    pub records: Vec<RecordRow>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RemindPayload {
    pub task_id: String,
    pub name: String,
    pub name_key: Option<String>,
    #[serde(rename = "type")]
    pub task_type: String,
    pub icon: String,
    pub style: String,
    pub template_id: Option<String>,
    pub unit_value: f64,
    pub done_today: f64,
    pub goal: f64,
    pub snooze_min: i64,
    pub auto_close_sec: i64,
    pub duration_sec: i64,
    pub accent: String,
    pub interval_min: i64,
    // ---- v1.3 提醒个性化 ----
    pub bg_preset: String,
    pub bg_image: String,
    pub dim: f64,
    pub blur: f64,
    pub show_countdown: bool,
    pub toast_skin: String,
    pub toast_pos: String,
    pub sender_name: String,
    pub message_text: String,
    /// true = 预览（不写记录、自动关闭）
    pub preview: bool,
}

/// 作息中的安静时段（午休 / 夜间）。命中时冻结计时、不提醒、不记 skip
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct QuietHour {
    pub start: String,
    pub end: String,
    /// 1=周一 … 7=周日（沿用 weekday_index：0=周日）
    pub days: Vec<u8>,
    /// 结束后缓冲秒数：0=立刻恢复提醒
    pub grace_sec: i64,
}

impl QuietHour {
    pub fn lunch() -> QuietHour {
        QuietHour {
            start: "12:00".into(),
            end: "13:30".into(),
            days: vec![1, 2, 3, 4, 5],
            grace_sec: 60,
        }
    }
}

pub fn default_quiet_hours() -> Vec<QuietHour> {
    vec![QuietHour::lunch()]
}

/// 按任务类型的提醒默认值
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct RemindProfile {
    pub style: String,
    pub template_id: String,
    /// 提示停留秒数，0 = 必须交互才关闭
    pub duration_sec: i64,
    pub toast_skin: String,
    /// br | tr | tl | bl
    pub toast_pos: String,
    pub sound: String,
    pub volume: f64,
    /// 自定义背景（media 目录文件名），空则用 bg_preset
    pub bg_image: String,
    /// dawn | mint | dusk | amber | night | paper | water | custom
    pub bg_preset: String,
    pub dim: f64,
    pub blur: f64,
    pub show_countdown: bool,
    pub sender_name: String,
    pub message_text: String,
}

impl Default for QuietHour {
    fn default() -> Self {
        QuietHour {
            start: "12:00".into(),
            end: "13:30".into(),
            days: vec![1, 2, 3, 4, 5],
            grace_sec: 60,
        }
    }
}

impl Default for RemindProfile {
    fn default() -> Self {
        RemindProfile {
            style: STYLE_FULLSCREEN.into(),
            template_id: String::new(),
            duration_sec: 20,
            toast_skin: "toast-chat".into(),
            toast_pos: "br".into(),
            sound: "default".into(),
            volume: 0.6,
            bg_image: String::new(),
            bg_preset: "dawn".into(),
            dim: 0.30,
            blur: 0.0,
            show_countdown: true,
            sender_name: String::new(),
            message_text: String::new(),
        }
    }
}

impl RemindProfile {
    fn of(task_type: &str) -> RemindProfile {
        let mut p = RemindProfile::default();
        match task_type {
            T_WATER => {
                p.style = STYLE_FULLSCREEN.into();
                p.template_id = "fs-water".into();
                p.bg_preset = "water".into();
                p.duration_sec = 20;
            }
            T_EYES => {
                p.style = STYLE_FULLSCREEN.into();
                p.template_id = "fs-eyes".into();
                p.bg_preset = "mint".into();
                p.duration_sec = 0;
                p.dim = 0.45;
            }
            T_KEGEL => {
                p.style = STYLE_TOAST.into();
                p.template_id = "toast-chat".into();
                p.toast_skin = "toast-chat".into();
                p.bg_preset = "dusk".into();
                p.duration_sec = 12;
                p.sound = "none".into();
            }
            T_BREAK => {
                p.style = STYLE_TOAST.into();
                p.template_id = "toast-minimal".into();
                p.toast_skin = "toast-minimal".into();
                p.bg_preset = "amber".into();
                p.duration_sec = 15;
            }
            _ => {
                p.style = STYLE_TOAST.into();
                p.toast_skin = "toast-minimal".into();
                p.bg_preset = "night".into();
                p.duration_sec = 15;
            }
        }
        p
    }
}

pub fn default_reminders() -> HashMap<String, RemindProfile> {
    let mut m = HashMap::new();
    for t in [T_WATER, T_EYES, T_KEGEL, T_BREAK, T_CUSTOM] {
        m.insert(t.to_string(), RemindProfile::of(t));
    }
    m
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    pub theme: String,
    pub accent: String,
    pub language: String,
    pub scale: f64,
    pub auto_start: bool,
    pub close_to_tray: bool,
    pub tray_countdown: bool,
    pub sound: String,
    pub volume: f64,
    /// 作息安静时段（替代旧的单条免打扰）
    #[serde(default = "default_quiet_hours")]
    pub quiet_hours: Vec<QuietHour>,
    #[serde(default)]
    pub whitelist: Vec<String>,
    pub auto_close_sec: i64,
    pub meeting_default_min: i64,
    pub user_name: String,
    pub weight_kg: f64,
    /// 兼容旧版本，读取时已被 reminder 取代
    #[serde(default)]
    pub fullscreen_image: Option<String>,
    /// 按任务类型的提醒默认值
    #[serde(default = "default_reminders")]
    pub reminder: HashMap<String, RemindProfile>,
    /// 设置结构版本，用于一次性迁移（v2 起提亮了全屏提醒底色、降低了压黑比例）
    #[serde(default = "default_settings_v")]
    pub v: u32,
}

fn default_settings_v() -> u32 {
    1
}

impl Default for Settings {
    fn default() -> Self {
        Settings {
            theme: "system".into(),
            accent: "ocean".into(),
            language: "system".into(),
            scale: 1.0,
            auto_start: false,
            close_to_tray: true,
            tray_countdown: true,
            sound: "default".into(),
            volume: 0.6,
            quiet_hours: default_quiet_hours(),
            whitelist: vec![
                "腾讯会议".into(),
                "Zoom".into(),
                "Teams".into(),
                "DingTalk".into(),
            ],
            auto_close_sec: 30,
            meeting_default_min: 30,
            user_name: String::new(),
            weight_kg: 65.0,
            fullscreen_image: None,
            reminder: default_reminders(),
            v: 2,
        }
    }
}

impl Settings {
    /// 取某类型的提醒配置（缺失时回落到内置默认）
    pub fn profile(&self, task_type: &str) -> RemindProfile {
        self.reminder
            .get(task_type)
            .cloned()
            .unwrap_or_else(|| RemindProfile::of(task_type))
    }
}

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct TypeDay {
    pub value: f64,
    pub times: i64,
    pub skips: i64,
}

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct DayStat {
    pub day: String,
    #[serde(rename = "byType")]
    pub by_type: HashMap<String, TypeDay>,
}

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct StatsPayload {
    pub days: Vec<DayStat>,
    pub hourly: Vec<i64>,
    pub streak: i64,
    pub week_total: i64,
    pub skip_rate: f64,
    pub meeting_minutes: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecordRow {
    pub id: i64,
    pub task_id: String,
    pub task_type: String,
    pub task_name: String,
    pub action: String,
    pub value: f64,
    pub day: String,
    pub ts: String,
}
