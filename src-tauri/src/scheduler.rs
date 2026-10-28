use crate::db::{in_time_range, today_str, weekday_index, Db};
use crate::models::*;
use crate::platform;
use crate::windows;
use chrono::{DateTime, Duration, Local};
use parking_lot::Mutex;
use std::collections::HashMap;
use std::sync::LazyLock;
use std::time::{Duration as StdDuration, Instant};
use tauri::{AppHandle, Emitter, Manager};

pub struct RuntimeTask {
    pub task: Task,
    pub next_due: Option<DateTime<Local>>,
    pub done_today: f64,
    pub count_today: i64,
    pub skip_today: i64,
    pub snoozed: bool,
}

impl RuntimeTask {
    fn new(task: Task) -> Self {
        RuntimeTask {
            task,
            next_due: None,
            done_today: 0.0,
            count_today: 0,
            skip_today: 0,
            snoozed: false,
        }
    }

    /// 目标是否达成（water 比 ml，其余比次数）
    fn goal_reached(&self) -> bool {
        if self.task.goal <= 0.0 {
            return false;
        }
        if self.task.task_type == T_WATER {
            self.done_today >= self.task.goal
        } else {
            self.count_today as f64 >= self.task.goal
        }
    }

    fn cap_reached(&self) -> bool {
        self.task.daily_cap > 0 && self.count_today >= self.task.daily_cap
    }

    fn goal_ratio(&self) -> f64 {
        if self.task.goal <= 0.0 {
            return 0.0;
        }
        let v = if self.task.task_type == T_WATER {
            self.done_today / self.task.goal
        } else {
            self.count_today as f64 / self.task.goal
        };
        v.clamp(0.0, 1.0)
    }
}

pub struct SessionState {
    pub id: i64,
    pub kind: String,
    pub started_at: DateTime<Local>,
    pub planned_min: i64,
    pub ends_at: Option<DateTime<Local>>,
    pub warned: bool,
}

pub struct Engine {
    pub tasks: Vec<RuntimeTask>,
    pub settings: Settings,
    /// 前端解析后的实际语言："zh" | "en"，供托盘与系统通知使用
    pub resolved_lang: String,
    pub session: Option<SessionState>,
    pub paused_manual: bool,
    pub queue: Vec<String>,
    pub pending: Option<(String, Instant)>,
    pub last_pop: Option<Instant>,
    pub soft_land_until: Option<DateTime<Local>>,
    pub today: String,
    pub ended_by_restart: bool,
    /// 上一 tick 是否处于安静时段（用于检测"刚离开安静时段"）
    pub quiet_prev: bool,
    /// 当前命中的安静时段的回座缓冲秒数
    pub quiet_grace: i64,
    /// 预览用的 payload（预览窗启动后自取）
    pub preview: Option<RemindPayload>,
    /// 上一次的暂停原因，仅用于状态变化时打日志
    pub last_reason: Option<String>,
    /// 今日记录缓存：每秒 tick 不再查库，只在记录变化或每 5 秒刷新
    pub records: Vec<RecordRow>,
    /// tick 计数，用于节流
    pub tick_n: u64,
    /// 当前这次提醒允许占屏的秒数（= 停留时长 + 余量），超过就回收
    pub pending_limit: i64,
    /// 连续判定为「锁屏」的秒数：OpenInputDesktop 偶尔会瞬时失败，
    /// 去抖之后才不会因为一次误判就把所有提醒冻结掉
    pub locked_secs: u8,
}

impl Engine {
    fn new() -> Self {
        Engine {
            tasks: vec![],
            settings: Settings::default(),
            resolved_lang: "zh".into(),
            session: None,
            paused_manual: false,
            queue: vec![],
            pending: None,
            last_pop: None,
            soft_land_until: None,
            today: today_str(),
            ended_by_restart: false,
            quiet_prev: false,
            quiet_grace: 60,
            preview: None,
            last_reason: None,
            records: vec![],
            tick_n: 0,
            pending_limit: 90,
            locked_secs: 0,
        }
    }

    /// 当前命中的安静时段
    pub fn active_quiet(&self) -> Option<&QuietHour> {
        let now = Local::now();
        quiet_at(&self.settings.quiet_hours, weekday_index(), now.time())
    }

    pub fn reload_tasks(&mut self, db: &Db) {
        let old: HashMap<String, (Option<DateTime<Local>>, bool)> = self
            .tasks
            .iter()
            .map(|t| (t.task.id.clone(), (t.next_due, t.snoozed)))
            .collect();
        let loaded = db.load_tasks();
        self.tasks = loaded
            .into_iter()
            .map(|task| {
                let mut rt = RuntimeTask::new(task);
                if let Some((due, snooze)) = old.get(&rt.task.id) {
                    rt.next_due = *due;
                    rt.snoozed = *snooze;
                }
                rt
            })
            .collect();
        self.refresh_today(db);
    }

    pub fn refresh_today(&mut self, db: &Db) {
        let map = db.today_by_type();
        for rt in &mut self.tasks {
            let (count, value, skips) = map
                .get(&rt.task.task_type)
                .copied()
                .unwrap_or((0, 0.0, 0));
            rt.count_today = count;
            rt.done_today = value;
            rt.skip_today = skips;
        }
    }

    fn roll_day(&mut self, db: &Db) {
        self.today = today_str();
        self.queue.clear();
        for rt in &mut self.tasks {
            rt.next_due = Some(Local::now() + Duration::minutes(rt.task.interval_min));
        }
        self.refresh_today(db);
    }

    /// 全局暂停原因：manual > session > locked > whitelist > quiet
    fn pause_reason(&self) -> Option<&'static str> {
        if self.paused_manual {
            return Some("manual");
        }
        if self.session.is_some() {
            return Some("session");
        }
        // 连续 3 秒都判为锁屏才算锁屏，避免 OpenInputDesktop 偶发失败把提醒冻住
        if self.locked_secs >= 3 {
            return Some("locked");
        }
        if !self.settings.whitelist.is_empty() && platform::in_whitelist(&self.settings.whitelist) {
            return Some("whitelist");
        }
        if self.active_quiet().is_some() {
            return Some("quiet");
        }
        None
    }

    pub fn snapshot(&self, reason: Option<&str>) -> Snapshot {
        let now = Local::now();
        let mut views = Vec::with_capacity(self.tasks.len());
        let mut next_id: Option<String> = None;
        let mut next_remaining = i64::MAX;

        for rt in &self.tasks {
            let active = is_active_task(rt, now);
            let done = rt.goal_reached() || rt.cap_reached();
            let remaining = rt
                .next_due
                .map(|d| (d - now).num_seconds().max(0))
                .unwrap_or(-1);

            let status = if self.session.is_some() {
                "meeting"
            } else if self.paused_manual {
                "paused"
            } else if !rt.task.enabled || !active {
                "inactive"
            } else if done {
                "done"
            } else {
                "running"
            };

            if status == "running" && remaining >= 0 && remaining < next_remaining {
                next_remaining = remaining;
                next_id = Some(rt.task.id.clone());
            }

            views.push(TaskView {
                task: rt.task.clone(),
                remaining_sec: if status == "running" || status == "inactive" {
                    remaining
                } else {
                    remaining
                },
                done_today: rt.done_today,
                count_today: rt.count_today,
                skip_today: rt.skip_today,
                goal_ratio: rt.goal_ratio(),
                status: status.into(),
                next_due: rt
                    .next_due
                    .map(|d| d.format("%H:%M").to_string()),
            });
        }

        let session = self.session.as_ref().map(|s| SessionView {
            kind: s.kind.clone(),
            started_at: s.started_at.format("%H:%M").to_string(),
            planned_min: s.planned_min,
            remaining_sec: s
                .ends_at
                .map(|e| (e - now).num_seconds().max(0))
                .unwrap_or(-1),
        });

        let soft = self
            .soft_land_until
            .map(|t| (t - now).num_seconds().max(0))
            .unwrap_or(0);

        let quiet_end = self.active_quiet().map(|q| q.end.clone());

        // 今日汇总：按类型聚合
        let mut by_type: HashMap<String, TypeSummary> = HashMap::new();
        for rt in &self.tasks {
            let e = by_type
                .entry(rt.task.task_type.clone())
                .or_insert_with(|| TypeSummary {
                    task_type: rt.task.task_type.clone(),
                    name: rt.task.name.clone(),
                    name_key: rt.task.name_key.clone(),
                    icon: rt.task.icon.clone(),
                    count: 0,
                    value: 0.0,
                    goal: rt.task.goal,
                    skips: 0,
                });
            e.count += rt.count_today;
            e.value += rt.done_today;
            e.skips += rt.skip_today;
        }
        let mut today: Vec<TypeSummary> = by_type.into_values().collect();
        today.sort_by_key(|s| type_priority(&s.task_type));

        let water_ml = today
            .iter()
            .find(|t| t.task_type == T_WATER)
            .map(|w| w.value)
            .unwrap_or(0.0);
        let water_goal = today
            .iter()
            .find(|t| t.task_type == T_WATER)
            .map(|w| w.goal)
            .unwrap_or(0.0);

        Snapshot {
            now: now.format("%H:%M:%S").to_string(),
            paused: reason.is_some(),
            pause_reason: reason.map(|s| s.to_string()),
            session,
            soft_landing_sec: soft,
            session_ended_by_restart: self.ended_by_restart,
            tasks: views,
            today,
            next_task_id: next_id,
            today_water_ml: water_ml,
            today_water_goal: water_goal,
            quiet_now: quiet_end.is_some(),
            quiet_end,
            records: self.records.clone(),
        }
    }
}

/// 任务当前是否处于可提醒状态（时间窗 + 星期 + 启用）
fn is_active_task(rt: &RuntimeTask, now: DateTime<Local>) -> bool {
    if !rt.task.enabled {
        return false;
    }
    if !rt.task.weekdays.contains(&weekday_index()) {
        return false;
    }
    in_time_range(&rt.task.active_start, &rt.task.active_end, now.time())
}

/// 命中哪一条安静时段（纯函数，便于测试）
pub fn quiet_at(
    hours: &[QuietHour],
    weekday: u8,
    now: chrono::NaiveTime,
) -> Option<&QuietHour> {
    hours
        .iter()
        .find(|q| q.days.contains(&weekday) && in_time_range(&q.start, &q.end, now))
}

pub static ENGINE: LazyLock<Mutex<Engine>> = LazyLock::new(|| Mutex::new(Engine::new()));

pub fn boot(app: &AppHandle) {
    let db = app.state::<Db>();
    let stale = db.close_stale_sessions();
    let mut e = ENGINE.lock();
    e.settings = db.settings();
    e.reload_tasks(&db);
    e.ended_by_restart = stale;
    let now = Local::now();
    for rt in &mut e.tasks {
        rt.next_due = Some(now + Duration::minutes(rt.task.interval_min.max(1)));
    }
    e.records = db.today_records(40);
    drop(e);
    println!(
        "[sip] 诊断 locked={} whitelist_hit={}",
        platform::screen_locked(),
        platform::in_whitelist(&db.settings().whitelist)
    );
}

/// 组装快照并附带今日记录（tick / 各命令共用）
pub fn snapshot_now(app: &AppHandle) -> Snapshot {
    let db = app.state::<Db>();
    let mut snap = {
        let e = ENGINE.lock();
        let reason = e.pause_reason().map(|s| s.to_string());
        e.snapshot(reason.as_deref())
    };
    snap.records = db.today_records(40);
    ENGINE.lock().records = snap.records.clone();
    snap
}

pub fn start_loop(app: AppHandle) {
    std::thread::Builder::new()
        .name("sip-scheduler".into())
        .spawn(move || loop {
            std::thread::sleep(StdDuration::from_millis(1000));
            if let Err(err) = tick(&app) {
                eprintln!("[scheduler] tick error: {err}");
            }
        })
        .expect("无法启动调度线程");
}

/// 待弹出的提醒。`limit` 是这次占屏的时间上限（停留时长 + 余量），
/// 用于 pending 超时回收。之所以不在这里就把 pending 写进 Engine，
/// 是因为窗口要到锁外才真正创建 —— 提前写会让下一个 tick 看到
/// 「pending 有值但窗口不存在」，误判成「提醒已被关掉」。
struct PendingShow {
    task: Task,
    limit: i64,
}

fn tick(app: &AppHandle) -> Result<(), String> {
    let db = app.state::<Db>();
    let mut to_show: Vec<PendingShow> = Vec::new();
    let mut stale_pending = false;
    // 会话提示（会议剩 3 分钟 / 不限时长满 2 小时），出锁后再发通知
    let mut warn: Option<(&'static str, i64)> = None;
    let snapshot: Snapshot;

    {
        let mut e = ENGINE.lock();
        let now = Local::now();

        if e.today != today_str() {
            e.roll_day(&db);
        }

        // 1.2 安静时段（午休等）进出：离开时按 grace_sec 给回座缓冲
        let is_quiet = e.active_quiet().is_some();
        if is_quiet {
            let g = e.active_quiet().map(|q| q.grace_sec).unwrap_or(60);
            e.quiet_grace = g;
        }
        if e.quiet_prev && !is_quiet && e.quiet_grace > 0 {
            e.soft_land_until = Some(now + Duration::seconds(e.quiet_grace));
        }
        e.quiet_prev = is_quiet;

        // 0. 锁屏去抖：每秒采样一次，连续 3 秒才认为真的锁屏
        if platform::screen_locked() {
            e.locked_secs = (e.locked_secs + 1).min(10);
        } else {
            e.locked_secs = 0;
        }

        // 0.5 pending 自愈：提醒窗已经不在（用户关了 / Alt+F4 / WebView 崩了），
        //    或者已经挂了太久没动静，就清掉，否则后面所有提醒都会被压住 ——
        //    表现就是「只有第一个任务会提醒，其它任务永远等不到」。
        if let Some((pid, at)) = e.pending.as_ref() {
            let rem = windows::has_reminder(app);
            let tos = windows::has_toast(app);
            let alive = rem || tos;
            // 窗口没了，或超过这次提醒该有的停留时长（+余量）就回收
            let limit = e.pending_limit.max(30) as u64;
            let el = at.elapsed().as_secs();
            if !alive || el >= limit {
                eprintln!(
                    "[scheduler] pending 回收 pid={pid} reason={} elapsed={el}s limit={limit}s \
                     reminder={rem} toast={tos} labels={:?}",
                    if alive { "超时" } else { "窗口已消失" },
                    windows::window_labels(app)
                );
                stale_pending = true;
                e.pending = None;
            }
        }

        // 1. 会话到期结束
        if let Some(s) = &e.session {
            let due = s.ends_at.map(|x| now >= x).unwrap_or(false);
            if due {
                let sid = s.id;
                let kind = s.kind.clone();
                drop(e);
                end_session_inner(app, sid, "auto", Some(kind));
                e = ENGINE.lock();
            }
        }

        // 1.5 会议剩余 3 分钟预告（常驻会议不弹任何窗口，只靠托盘角标与首页横幅提示）
        if let Some(s) = e.session.as_mut() {
            if let Some(ends) = s.ends_at {
                let left = (ends - now).num_seconds();
                if left > 0 && left <= 180 && !s.warned {
                    s.warned = true;
                    let mins = ((left + 30) / 60).max(1);
                    warn = Some(("soon", mins));
                }
            }
        }

        // 软着陆清理
        if let Some(t) = e.soft_land_until {
            if now >= t {
                e.soft_land_until = None;
            }
        }

        let reason = e.pause_reason().map(|s| s.to_string());
        let frozen = reason.is_some();

        if frozen {
            // 冻结：所有 next_due 顺延 1 秒，剩余时间不变
            for rt in &mut e.tasks {
                if let Some(d) = rt.next_due {
                    rt.next_due = Some(d + Duration::seconds(1));
                }
            }
        } else {
            // 2. 更新各任务剩余与入队（先收集，避免同时借用 tasks 与 queue）
            let mut due_ids: Vec<String> = Vec::new();
            for rt in &mut e.tasks {
                if !is_active_task(rt, now) {
                    // 不在活跃时段：倒计时清零，等进入时段后从 now + interval 重新起算。
                    // 之前这里直接 continue，next_due 会一直停在「过去的某一刻」，
                    // 一旦进入活跃时段四条任务同时到期 → 早上一进工位就连弹四个提醒。
                    rt.next_due = None;
                    continue;
                }
                if rt.goal_reached() || rt.cap_reached() {
                    continue;
                }
                match rt.next_due {
                    None => {
                        rt.next_due = Some(now + Duration::minutes(rt.task.interval_min.max(1)));
                    }
                    Some(d) => {
                        if now >= d {
                            due_ids.push(rt.task.id.clone());
                        }
                    }
                }
            }
            for id in due_ids {
                if e.queue.contains(&id) {
                    continue;
                }
                e.queue.push(id.clone());
                if let Some(rt) = e.tasks.iter_mut().find(|t| t.task.id == id) {
                    rt.next_due = Some(now + Duration::minutes(rt.task.interval_min.max(1)));
                }
            }

            // 3. 出队（串行：距上次弹出 ≥3s，且无未关闭窗口）
            let soft_ok = e
                .soft_land_until
                .map(|t| now >= t)
                .unwrap_or(true);
            let gap_ok = e
                .last_pop
                .map(|i| i.elapsed() >= StdDuration::from_secs(3))
                .unwrap_or(true);
            // 一次只弹一个提醒：上一个还没关就绝不弹下一个。
            // 之前这里给了 60 秒宽限，结果会出现「眼保健操还开着，喝水又盖上来」的叠窗。
            // 窗口死掉的情况由上面的 pending 自愈兜底。
            let pending_ok = e.pending.is_none();

            if soft_ok && gap_ok && pending_ok && !e.queue.is_empty() {
                // 优先级排序（先快照优先级，避免同时借用）
                let prio: Vec<(String, u8)> = e
                    .tasks
                    .iter()
                    .map(|t| (t.task.id.clone(), type_priority(&t.task.task_type)))
                    .collect();
                e.queue.sort_by_key(|id| {
                    prio.iter()
                        .find(|(tid, _)| tid == id)
                        .map(|(_, p)| *p)
                        .unwrap_or(9)
                });

                let id = e.queue.remove(0);
                let found = e.tasks.iter().find(|t| t.task.id == id).map(|rt| {
                    let prof = effective_remind(&e.settings, &rt.task);
                    // 占屏时长要取三者最大：提醒配置里的停留时长、任务自身的
                    // 动作时长（眼保健操 120s / 远眺 300s）、全局自动关闭秒数。
                    // 只按提醒配置算是错的 —— 眼睛的 profile durationSec 通常是 0，
                    // 算出来只有 70s，120s 的倒计时还没走完就被当成超时回收，
                    // 于是下一个提醒直接盖上来（用户看到的「提醒互相冲突」）。
                    let stay = prof
                        .duration_sec
                        .max(rt.task.duration_sec())
                        .max(e.settings.auto_close_sec)
                        .max(20);
                    let limit = stay + 40;
                    (rt.task.clone(), rt.task.enabled, limit)
                });
                if let Some((task, enabled, limit)) = found {
                    if enabled {
                        // pending 留到窗口真正建好之后再写，见下方 to_show 循环
                        to_show.push(PendingShow { task, limit });
                        e.last_pop = Some(Instant::now());
                    }
                }
            }
        }

        let reason_str = e.pause_reason().map(|s| s.to_string());
        if e.last_reason != reason_str {
            eprintln!(
                "[scheduler] 暂停状态 -> {}",
                reason_str.clone().unwrap_or_else(|| "running".into())
            );
            e.last_reason = reason_str.clone();
        }
        e.tick_n = e.tick_n.wrapping_add(1);
        if e.tick_n % 5 == 1 {
            e.records = db.today_records(40);
        }
        snapshot = e.snapshot(reason_str.as_deref());
        if e.queue.len() > 8 {
            // 防止无限堆积
            e.queue.truncate(8);
        }
    }

    let snapshot = snapshot;

    if stale_pending {
        eprintln!("[scheduler] 提醒窗口已消失，清空 pending 并回收残留窗口");
        windows::destroy_reminders(app);
        windows::destroy_toasts(app);
    }

    update_tray(app, &snapshot);
    // 只推给主窗口：提醒窗/消息窗不需要快照，广播只会让它们白刷新
    let _ = app.emit_to("main", "tick", &snapshot);

    if let Some((key, mins)) = warn {
        let lang = ENGINE.lock().resolved_lang.clone();
        let (title, body) = crate::i18n::session_text(&lang, key, mins);
        crate::notify::send_text(app, &title, &body);
    }

    for item in to_show {
        let task = &item.task;
        let payload = build_payload(app, task);
        eprintln!(
            "[scheduler] 弹出提醒 {} type={} style={}",
            task.id, task.task_type, payload.style
        );
        let mut shown = true;
        match payload.style.as_str() {
            STYLE_FULLSCREEN => {
                windows::show_reminder_all(app, &task.id);
                // 建窗可能失败（显示器枚举失败等），失败了就别登记 pending，
                // 否则会把后续提醒全压住
                shown = windows::has_reminder(app);
                if !shown {
                    eprintln!("[scheduler] 全屏窗未创建成功，不登记 pending");
                }
            }
            STYLE_TOAST => {
                windows::show_toast(app, &task.id, &payload.toast_pos);
                shown = windows::has_toast(app);
                if !shown {
                    eprintln!("[scheduler] 消息窗未创建成功，不登记 pending");
                }
            }
            _ => {
                crate::notify::send(app, &payload);
            }
        }

        // 只有真的占了屏才登记 pending（系统通知不需要用户关窗）
        if payload.style != STYLE_SYSTEM {
            let mut e = ENGINE.lock();
            if shown && e.pending.is_none() {
                e.pending = Some((task.id.clone(), Instant::now()));
                e.pending_limit = item.limit;
            }
            drop(e);
        }

        let _ = app.emit("remind", &payload);
    }

    Ok(())
}

/// 任务的最终提醒配置：默认跟随设置里该类型的 Profile，开启覆盖时用任务自身字段
pub fn effective_remind(s: &Settings, t: &Task) -> RemindProfile {
    let mut p = s.profile(&t.task_type);
    if t.remind_override {
        p.style = t.remind_style.clone();
        if let Some(tid) = &t.template_id {
            if !tid.is_empty() {
                p.template_id = tid.clone();
            }
        }
        if !t.sound.is_empty() {
            p.sound = t.sound.clone();
        }
    }
    p
}

pub fn build_payload(app: &AppHandle, task: &Task) -> RemindPayload {
    let _ = app;
    let e = ENGINE.lock();
    let rt = e.tasks.iter().find(|t| t.task.id == task.id);
    let prof = effective_remind(&e.settings, task);
    RemindPayload {
        task_id: task.id.clone(),
        name: task.name.clone(),
        name_key: task.name_key.clone(),
        task_type: task.task_type.clone(),
        icon: task.icon.clone(),
        style: prof.style.clone(),
        template_id: Some(prof.template_id.clone()),
        unit_value: task.unit_value,
        done_today: rt.map(|r| r.done_today).unwrap_or(0.0),
        goal: task.goal,
        snooze_min: task.snooze_min,
        auto_close_sec: if prof.duration_sec > 0 {
            prof.duration_sec
        } else {
            e.settings.auto_close_sec
        },
        duration_sec: if task.task_type == T_KEGEL {
            0
        } else {
            task.duration_sec()
        },
        accent: e.settings.accent.clone(),
        interval_min: task.interval_min,
        bg_preset: prof.bg_preset.clone(),
        bg_image: prof.bg_image.clone(),
        dim: prof.dim,
        blur: prof.blur,
        show_countdown: prof.show_countdown,
        toast_skin: prof.toast_skin.clone(),
        toast_pos: prof.toast_pos.clone(),
        sender_name: prof.sender_name.clone(),
        message_text: prof.message_text.clone(),
        preview: false,
    }
}

/// 上一次写入托盘的 "标题|提示"，相同就不再调用，避免每秒向主线程派发
static TRAY_CACHE: LazyLock<Mutex<String>> = LazyLock::new(|| Mutex::new(String::new()));

fn set_tray(tray: &tauri::tray::TrayIcon, title: Option<&str>, tip: &str) {
    let key = format!("{}|{}", title.unwrap_or(""), tip);
    {
        let mut cache = TRAY_CACHE.lock();
        if *cache == key {
            return;
        }
        *cache = key;
    }
    let _ = tray.set_title(title);
    let _ = tray.set_tooltip(Some(tip));
}

fn update_tray(app: &AppHandle, snap: &Snapshot) {
    let Some(tray) = app.tray_by_id("main-tray") else {
        return;
    };
    let settings = ENGINE.lock().settings.clone();
    if !settings.tray_countdown {
        set_tray(&tray, None, "小满 Sip");
        return;
    }
    if let Some(s) = &snap.session {
        let label = if s.remaining_sec < 0 {
            "● 会议中".to_string()
        } else {
            format!("● {}:{:02}", s.remaining_sec / 60, s.remaining_sec % 60)
        };
        set_tray(&tray, Some(&label), &format!("会议模式进行中 · {label}"));
        return;
    }
    if snap.quiet_now {
        let end = snap.quiet_end.clone().unwrap_or_default();
        set_tray(&tray, Some("·"), &format!("休息时段 · {end} 后恢复"));
        return;
    }
    if let Some(id) = &snap.next_task_id {
        if let Some(t) = snap.tasks.iter().find(|t| t.task.id.as_str() == id.as_str()) {
            let r = t.remaining_sec.max(0);
            let label = format!("{}:{:02}", r / 60, r % 60);
            set_tray(&tray, Some(&label), &format!("下次提醒 {label}"));
            return;
        }
    }
    set_tray(&tray, None, "小满 Sip");
}

// ---------------- 会话（会议 / 专注） ----------------

fn fill_records(db: &Db, mut s: Snapshot) -> Snapshot {
    s.records = db.today_records(40);
    ENGINE.lock().records = s.records.clone();
    s
}

pub fn start_session(app: &AppHandle, kind: &str, minutes: i64) -> Snapshot {
    let db = app.state::<Db>();
    let id = db.start_session(kind, minutes);
    {
        let mut e = ENGINE.lock();
        let now = Local::now();
        e.session = Some(SessionState {
            id,
            kind: kind.to_string(),
            started_at: now,
            planned_min: minutes,
            ends_at: if minutes > 0 {
                Some(now + Duration::minutes(minutes))
            } else {
                None
            },
            warned: false,
        });
        e.queue.clear();
        e.pending = None;
        e.soft_land_until = None;
    }
    windows::hide_all(app);
    windows::hide_toast(app);
    let _ = crate::rebuild_tray(app);
    let snap = {
        let e = ENGINE.lock();
        e.snapshot(Some("session"))
    };
    fill_records(&db, snap)
}

pub fn end_session(app: &AppHandle, reason: &str) -> Snapshot {
    let db = app.state::<Db>();
    let (id, kind) = {
        let e = ENGINE.lock();
        match &e.session {
            Some(s) => (s.id, s.kind.clone()),
            None => (0, "meeting".to_string()),
        }
    };
    if id > 0 {
        end_session_inner(app, id, reason, Some(kind));
    }
    let snap = {
        let e = ENGINE.lock();
        e.snapshot(None)
    };
    fill_records(&db, snap)
}

pub fn end_session_inner(app: &AppHandle, id: i64, reason: &str, kind: Option<String>) {
    let db = app.state::<Db>();
    db.end_session(id, reason);
    {
        let mut e = ENGINE.lock();
        e.session = None;
        e.soft_land_until = Some(Local::now() + Duration::seconds(60));
        e.queue.clear();
    }
    let _ = app.emit("session-ended", kind.unwrap_or_default());
    let _ = crate::rebuild_tray(app);
}

pub fn extend_session(app: &AppHandle, minutes: i64) -> Snapshot {
    let db = app.state::<Db>();
    {
        let mut e = ENGINE.lock();
        if let Some(s) = &mut e.session {
            s.planned_min += minutes;
            s.ends_at = s.ends_at.map(|d| d + Duration::minutes(minutes));
            s.warned = false;
        }
    }
    let snap = {
        let e = ENGINE.lock();
        e.snapshot(Some("session"))
    };
    fill_records(&db, snap)
}

/// 写记录：失败必须发声。静默失败会让「今日统计」凭空少几条，
/// 而用户只会觉得软件算错了。数据库已配 busy_timeout=5s，
/// 走到这里基本就是磁盘/权限级别的真错误了。
fn record(db: &Db, task: &Task, action: &str, value: f64) {
    if let Err(e) = db.insert_record(task, action, value) {
        eprintln!(
            "[scheduler] 写入记录失败 task={} action={action} value={value} err={e}",
            task.id
        );
    }
}

/// 用户完成 / 跳过 / 延后
pub fn log_action(app: &AppHandle, task_id: &str, action: &str, value: Option<f64>) -> Snapshot {
    let db = app.state::<Db>();
    let mut e = ENGINE.lock();
    let now = Local::now();

    let Some(idx) = e.tasks.iter().position(|t| t.task.id == task_id) else {
        let snap = e.snapshot(None);
        drop(e);
        return fill_records(&db, snap);
    };

    // 会议中不写 skip，避免污染统计
    let in_session = e.session.is_some();
    let task = e.tasks[idx].task.clone();

    match action {
        "snooze" => {
            let mins = value.unwrap_or(task.snooze_min as f64).max(1.0) as i64;
            e.tasks[idx].next_due = Some(now + Duration::minutes(mins));
            e.tasks[idx].snoozed = true;
            if !in_session {
                record(&db, &task, "snooze", mins as f64);
            }
        }
        "skip" => {
            if !in_session {
                record(&db, &task, "skip", 0.0);
                e.tasks[idx].skip_today += 1;
            }
            e.tasks[idx].next_due = Some(now + Duration::minutes(task.interval_min.max(1)));
            e.tasks[idx].snoozed = false;
        }
        _ => {
            // complete
            let v = value.unwrap_or(task.unit_value);
            record(&db, &task, "complete", v);
            if task.task_type == T_WATER {
                e.tasks[idx].done_today += v;
            } else {
                e.tasks[idx].done_today += v;
                e.tasks[idx].count_today += 1;
            }
            e.tasks[idx].next_due = Some(now + Duration::minutes(task.interval_min.max(1)));
            e.tasks[idx].snoozed = false;
        }
    }

    e.queue.retain(|x| x != task_id);
    if let Some((pid, _)) = &e.pending {
        if pid == task_id {
            e.pending = None;
            // 用户点了「完成/跳过」，窗口还要做 200ms 淡出；
            // 这里同步刷新 last_pop，下一条提醒会等满 3 秒再来，
            // 不至于把正在消失的窗口直接拽掉
            e.last_pop = Some(Instant::now());
        }
    }
    let snap = e.snapshot(if in_session { Some("session") } else { None });
    drop(e);

    windows::hide_all(app);
    windows::hide_toast(app);
    let _ = app.emit("reminder-closed", task_id.to_string());
    fill_records(&db, snap)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn t(s: &str) -> chrono::NaiveTime {
        chrono::NaiveTime::parse_from_str(s, "%H:%M").unwrap()
    }

    fn lunch() -> QuietHour {
        QuietHour {
            start: "12:00".into(),
            end: "13:30".into(),
            days: vec![1, 2, 3, 4, 5],
            grace_sec: 60,
        }
    }

    fn night() -> QuietHour {
        QuietHour {
            start: "22:30".into(),
            end: "08:00".into(),
            days: vec![0, 1, 2, 3, 4, 5, 6],
            grace_sec: 0,
        }
    }

    #[test]
    fn lunch_hits_inside_window() {
        let q = vec![lunch()];
        assert!(quiet_at(&q, 1, t("12:30")).is_some());
    }

    #[test]
    fn lunch_boundaries_are_inclusive() {
        let q = vec![lunch()];
        assert!(quiet_at(&q, 1, t("12:00")).is_some());
        assert!(quiet_at(&q, 1, t("13:30")).is_some());
        assert!(quiet_at(&q, 1, t("13:31")).is_none());
        assert!(quiet_at(&q, 1, t("11:59")).is_none());
    }

    #[test]
    fn lunch_skipped_on_weekend() {
        let q = vec![lunch()];
        // 0=周日, 6=周六
        assert!(quiet_at(&q, 6, t("12:30")).is_none());
        assert!(quiet_at(&q, 0, t("12:30")).is_none());
    }

    #[test]
    fn cross_midnight_works() {
        let q = vec![night()];
        assert!(quiet_at(&q, 2, t("23:10")).is_some());
        assert!(quiet_at(&q, 2, t("02:00")).is_some());
        assert!(quiet_at(&q, 2, t("07:59")).is_some());
        assert!(quiet_at(&q, 2, t("08:01")).is_none());
        assert!(quiet_at(&q, 2, t("22:29")).is_none());
    }

    #[test]
    fn first_match_wins_and_empty_is_never_quiet() {
        let q = vec![lunch(), night()];
        assert_eq!(quiet_at(&q, 1, t("12:10")).map(|x| x.grace_sec), Some(60));
        assert_eq!(quiet_at(&q, 1, t("23:00")).map(|x| x.grace_sec), Some(0));
        assert!(quiet_at(&[], 1, t("12:10")).is_none());
    }

    #[test]
    fn default_settings_include_lunch_once() {
        let s = Settings::default();
        assert_eq!(s.quiet_hours.len(), 1);
        assert_eq!(s.quiet_hours[0].start, "12:00");
        assert_eq!(s.quiet_hours[0].end, "13:30");
        assert_eq!(s.quiet_hours[0].grace_sec, 60);
    }

    #[test]
    fn reminder_profile_defaults_match_seed_style() {
        let s = Settings::default();
        assert_eq!(s.profile(T_WATER).style, STYLE_FULLSCREEN);
        assert_eq!(s.profile(T_KEGEL).style, STYLE_TOAST);
        assert_eq!(s.profile(T_KEGEL).toast_skin, "toast-chat");
        // 眼保健操必须手动关闭（不自动跳过动作）
        assert_eq!(s.profile(T_EYES).duration_sec, 0);
    }

    #[test]
    fn settings_partial_json_falls_back_per_field() {
        // 老版本存下的 JSON 少字段时，绝不能整体解析失败 ——
        // 一旦失败，db.settings() 会回落成 Settings::default()，
        // 用户的主题/音量/白名单会全部被静默重置。
        let partial = r#"{"theme":"light","volume":0.4}"#;
        let s: Settings = serde_json::from_str(partial).expect("缺字段不应导致解析失败");
        assert_eq!(s.theme, "light");
        assert_eq!(s.volume, 0.4);
        assert_eq!(s.auto_close_sec, 30);
        assert!(!s.reminder.is_empty());
    }

    #[test]
    fn legacy_settings_json_migrates_to_lunch() {
        // v1.2 的旧 JSON 没有 quietHours / reminder 字段
        let legacy = r#"{
            "theme":"dark","accent":"ocean","language":"zh","scale":1.0,
            "autoStart":false,"closeToTray":true,"trayCountdown":true,
            "sound":"default","volume":0.6,
            "dndEnabled":true,"dndStart":"22:00","dndEnd":"08:00",
            "whitelist":[],"autoCloseSec":30,"meetingDefaultMin":30,
            "userName":"","weightKg":65.0
        }"#;
        let s: Settings = serde_json::from_str(legacy).unwrap();
        assert_eq!(s.quiet_hours.len(), 1);
        assert_eq!(s.quiet_hours[0].end, "13:30");
        assert!(!s.reminder.is_empty());
        assert_eq!(s.profile(T_WATER).style, STYLE_FULLSCREEN);
    }
}
