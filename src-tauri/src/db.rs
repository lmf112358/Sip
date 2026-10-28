use crate::models::*;
use chrono::{Datelike, Duration, Local, NaiveTime};
use parking_lot::Mutex;
use rusqlite::{params, Connection, OptionalExtension};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use tauri::Manager;

pub struct Db {
    pub conn: Mutex<Connection>,
    pub media_dir: PathBuf,
}

const TS_FMT: &str = "%Y-%m-%d %H:%M:%S";

fn parse_weekdays(s: &str) -> Vec<u8> {
    s.split(',')
        .filter_map(|x| x.trim().parse::<u8>().ok())
        .collect()
}

fn join_weekdays(v: &[u8]) -> String {
    v.iter()
        .map(|x| x.to_string())
        .collect::<Vec<_>>()
        .join(",")
}

/// v1.3 → v1.4 改名（Ticker → 小满 Sip）：数据目录跟着 identifier 变，
/// 首次启动时把旧库和自定义背景搬过来，否则老用户会以为「记录全丢了」。
fn migrate_from_legacy(new_dir: &Path) {
    let Some(parent) = new_dir.parent() else { return };
    // 只搬一次：搬完写标记文件。
    // 否则用户主动删掉 sip.db（想重置数据 / 卸载重装）后，下次启动又会把
    // 旧版 ticker.db 原样搬回来 —— 数据「复活」，看起来像删不掉。
    let marker = new_dir.join(".legacy_migrated");
    if marker.exists() {
        return;
    }
    let legacy = parent.join("com.ticker.desktop");
    let mark_done = |dir: &Path| {
        let _ = std::fs::write(dir.join(".legacy_migrated"), "1");
    };
    if !legacy.is_dir() || new_dir.join("sip.db").exists() {
        mark_done(new_dir);
        return;
    }
    let old_db = legacy.join("ticker.db");
    if !old_db.is_file() {
        mark_done(new_dir);
        return;
    }
    if let Err(e) = std::fs::copy(&old_db, new_dir.join("sip.db")) {
        eprintln!("[sip] 旧数据迁移失败（改用空库）：{e}");
        return;
    }
    // WAL 尾部一起带过来，避免丢掉最后一次写入。
    // -shm 是共享内存索引，由 SQLite 自己重建，不复制。
    let src = legacy.join("ticker.db-wal");
    if src.is_file() {
        let _ = std::fs::copy(&src, new_dir.join("sip.db-wal"));
    }
    // 自定义背景图 / GIF
    let old_media = legacy.join("media");
    if old_media.is_dir() {
        let media_dir = new_dir.join("media");
        let _ = std::fs::create_dir_all(&media_dir);
        if let Ok(rd) = std::fs::read_dir(&old_media) {
            for entry in rd.flatten() {
                if entry.path().is_file() {
                    let _ = std::fs::copy(entry.path(), media_dir.join(entry.file_name()));
                }
            }
        }
    }
    println!("[sip] 已从旧版本目录迁移数据：{}", legacy.display());
    mark_done(new_dir);
}

impl Db {
    pub fn init(app: &tauri::AppHandle) -> Result<Db, String> {
        let dir = app
            .path()
            .app_data_dir()
            .map_err(|e| format!("无法获取数据目录: {e}"))?;
        std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        migrate_from_legacy(&dir);
        let media_dir = dir.join("media");
        std::fs::create_dir_all(&media_dir).map_err(|e| e.to_string())?;

        let conn = Connection::open(dir.join("sip.db")).map_err(|e| e.to_string())?;
        // 写锁等待：默认 busy_timeout=0，一旦有第二个连接（另一个实例 / 外部工具）
        // 正在写，本连接立刻返回 SQLITE_BUSY，而写记录的调用点又吞掉了错误 ——
        // 表现就是「记录莫名其妙少了几条」。给 5 秒重试窗口。
        conn.busy_timeout(std::time::Duration::from_secs(5))
            .map_err(|e| e.to_string())?;
        conn.execute_batch(
            r#"
            PRAGMA journal_mode = WAL;
            PRAGMA synchronous = NORMAL;

            CREATE TABLE IF NOT EXISTS tasks (
              id TEXT PRIMARY KEY,
              name TEXT NOT NULL DEFAULT '',
              name_key TEXT,
              type TEXT NOT NULL,
              icon TEXT NOT NULL DEFAULT 'water',
              enabled INTEGER NOT NULL DEFAULT 1,
              interval_min INTEGER NOT NULL DEFAULT 45,
              active_start TEXT NOT NULL DEFAULT '09:00',
              active_end TEXT NOT NULL DEFAULT '18:00',
              weekdays TEXT NOT NULL DEFAULT '1,2,3,4,5',
              remind_style TEXT NOT NULL DEFAULT 'fullscreen',
              template_id TEXT,
              sound TEXT NOT NULL DEFAULT 'default',
              snooze_min INTEGER NOT NULL DEFAULT 5,
              goal REAL NOT NULL DEFAULT 0,
              unit_value REAL NOT NULL DEFAULT 0,
              daily_cap INTEGER NOT NULL DEFAULT 0,
              sort INTEGER NOT NULL DEFAULT 0,
              remind_override INTEGER NOT NULL DEFAULT 0,
              created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS records (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              task_id TEXT NOT NULL,
              task_type TEXT NOT NULL,
              task_name TEXT NOT NULL,
              action TEXT NOT NULL,
              value REAL NOT NULL DEFAULT 0,
              day TEXT NOT NULL,
              ts TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_records_day ON records(day);
            CREATE INDEX IF NOT EXISTS idx_records_type ON records(task_type, day);

            CREATE TABLE IF NOT EXISTS settings (
              key TEXT PRIMARY KEY,
              value TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS sessions (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              kind TEXT NOT NULL,
              planned_min INTEGER NOT NULL,
              started_at TEXT NOT NULL,
              ended_at TEXT,
              end_reason TEXT
            );
            CREATE INDEX IF NOT EXISTS idx_sessions_start ON sessions(started_at);
            "#,
        )
        .map_err(|e| e.to_string())?;

        let db = Db {
            conn: Mutex::new(conn),
            media_dir,
        };
        db.migrate()?;
        db.seed_if_empty()?;
        Ok(db)
    }

    /// 轻量迁移：给老库补列 / 补默认设置，只做幂等的 ADD COLUMN
    fn migrate(&self) -> Result<(), String> {
        let conn = self.conn.lock();
        // v1.3：任务级提醒覆盖开关
        let _ = conn.execute(
            "ALTER TABLE tasks ADD COLUMN remind_override INTEGER NOT NULL DEFAULT 0",
            [],
        );
        Ok(())
    }

    fn seed_if_empty(&self) -> Result<(), String> {
        let count: i64 = self
            .conn
            .lock()
            .query_row("SELECT COUNT(*) FROM tasks", [], |r| r.get(0))
            .map_err(|e| e.to_string())?;
        if count > 0 {
            return Ok(());
        }
        let seeds = vec![
            Task::new_seed(T_WATER, "task.water", "water", 45, 2000.0, 250.0, STYLE_FULLSCREEN, "fs-water", 5, 0),
            Task::new_seed(T_EYES, "task.eyes", "eyes", 60, 6.0, 120.0, STYLE_FULLSCREEN, "fs-eyes", 5, 1),
            Task::new_seed(T_KEGEL, "task.kegel", "kegel", 90, 8.0, 1.0, STYLE_TOAST, "toast-chat", 10, 2),
            Task::new_seed(T_BREAK, "task.break", "break", 50, 4.0, 300.0, STYLE_TOAST, "toast-minimal", 10, 3),
        ];
        for t in seeds {
            self.save_task(&t)?;
        }
        Ok(())
    }

    pub fn save_task(&self, t: &Task) -> Result<(), String> {
        let now = Local::now().format(TS_FMT).to_string();
        self.conn
            .lock()
            .execute(
                r#"INSERT INTO tasks
                (id, name, name_key, type, icon, enabled, interval_min, active_start, active_end,
                 weekdays, remind_style, template_id, sound, snooze_min, goal, unit_value,
                 daily_cap, sort, remind_override, created_at)
                VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20)
                ON CONFLICT(id) DO UPDATE SET
                  name=excluded.name, name_key=excluded.name_key, type=excluded.type,
                  icon=excluded.icon, enabled=excluded.enabled, interval_min=excluded.interval_min,
                  active_start=excluded.active_start, active_end=excluded.active_end,
                  weekdays=excluded.weekdays, remind_style=excluded.remind_style,
                  template_id=excluded.template_id, sound=excluded.sound,
                  snooze_min=excluded.snooze_min, goal=excluded.goal,
                  unit_value=excluded.unit_value, daily_cap=excluded.daily_cap, sort=excluded.sort,
                  remind_override=excluded.remind_override"#,
                params![
                    t.id,
                    t.name,
                    t.name_key,
                    t.task_type,
                    t.icon,
                    t.enabled as i32,
                    t.interval_min,
                    t.active_start,
                    t.active_end,
                    join_weekdays(&t.weekdays),
                    t.remind_style,
                    t.template_id,
                    t.sound,
                    t.snooze_min,
                    t.goal,
                    t.unit_value,
                    t.daily_cap,
                    t.sort,
                    t.remind_override as i32,
                    now
                ],
            )
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn delete_task(&self, id: &str) -> Result<(), String> {
        self.conn
            .lock()
            .execute("DELETE FROM tasks WHERE id = ?1", params![id])
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn reorder(&self, ids: &[String]) -> Result<(), String> {
        let conn = self.conn.lock();
        for (i, id) in ids.iter().enumerate() {
            conn.execute(
                "UPDATE tasks SET sort = ?1 WHERE id = ?2",
                params![i as i64, id],
            )
            .map_err(|e| e.to_string())?;
        }
        Ok(())
    }

    pub fn load_tasks(&self) -> Vec<Task> {
        let conn = self.conn.lock();
        let mut stmt = match conn.prepare(
            "SELECT id,name,name_key,type,icon,enabled,interval_min,active_start,active_end,
                    weekdays,remind_style,template_id,sound,snooze_min,goal,unit_value,daily_cap,sort,
                    remind_override
             FROM tasks ORDER BY sort ASC, created_at ASC",
        ) {
            Ok(s) => s,
            Err(_) => return vec![],
        };
        let rows = stmt.query_map([], |r| {
            Ok(Task {
                id: r.get(0)?,
                name: r.get(1)?,
                name_key: r.get(2)?,
                task_type: r.get(3)?,
                icon: r.get(4)?,
                enabled: r.get::<_, i32>(5)? != 0,
                interval_min: r.get(6)?,
                active_start: r.get(7)?,
                active_end: r.get(8)?,
                weekdays: parse_weekdays(&r.get::<_, String>(9)?),
                remind_style: r.get(10)?,
                template_id: r.get(11)?,
                sound: r.get(12)?,
                snooze_min: r.get(13)?,
                goal: r.get(14)?,
                unit_value: r.get(15)?,
                daily_cap: r.get(16)?,
                sort: r.get(17)?,
                remind_override: r.get::<_, i32>(18).unwrap_or(0) != 0,
            })
        });
        match rows {
            Ok(iter) => iter.filter_map(|r| r.ok()).collect(),
            Err(_) => vec![],
        }
    }

    pub fn insert_record(
        &self,
        task: &Task,
        action: &str,
        value: f64,
    ) -> Result<(), String> {
        let now = Local::now();
        let display_name = if task.name.trim().is_empty() {
            task.name_key.clone().unwrap_or_else(|| task.task_type.clone())
        } else {
            task.name.clone()
        };
        self.conn
            .lock()
            .execute(
                "INSERT INTO records (task_id, task_type, task_name, action, value, day, ts)
                 VALUES (?1,?2,?3,?4,?5,?6,?7)",
                params![
                    task.id,
                    task.task_type,
                    display_name,
                    action,
                    value,
                    now.format("%Y-%m-%d").to_string(),
                    now.format(TS_FMT).to_string()
                ],
            )
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    /// 今日各任务汇总：(类型, 次数, 累计值, 跳过数)
    pub fn today_by_type(&self) -> HashMap<String, (i64, f64, i64)> {
        let day = Local::now().format("%Y-%m-%d").to_string();
        let conn = self.conn.lock();
        let mut out: HashMap<String, (i64, f64, i64)> = HashMap::new();
        let mut stmt = match conn.prepare(
            "SELECT task_type,
                    SUM(CASE WHEN action='complete' THEN 1 ELSE 0 END),
                    SUM(CASE WHEN action='complete' THEN value ELSE 0 END),
                    SUM(CASE WHEN action='skip' THEN 1 ELSE 0 END)
             FROM records WHERE day = ?1 GROUP BY task_type",
        ) {
            Ok(s) => s,
            Err(_) => return out,
        };
        if let Ok(rows) = stmt.query_map(params![day], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, i64>(1).unwrap_or(0),
                r.get::<_, f64>(2).unwrap_or(0.0),
                r.get::<_, i64>(3).unwrap_or(0),
            ))
        }) {
            for row in rows.flatten() {
                out.insert(row.0, (row.1, row.2, row.3));
            }
        }
        out
    }

    /// 今日记录流水（最新在前）
    pub fn today_records(&self, limit: i64) -> Vec<RecordRow> {
        let day = Local::now().format("%Y-%m-%d").to_string();
        let conn = self.conn.lock();
        let mut stmt = match conn.prepare(
            "SELECT id, task_id, task_type, task_name, action, value, day, ts
             FROM records WHERE day = ?1 ORDER BY id DESC LIMIT ?2",
        ) {
            Ok(s) => s,
            Err(_) => return vec![],
        };
        let rows = stmt.query_map(params![day, limit], |r| {
            let ts: String = r.get(7)?;
            Ok(RecordRow {
                id: r.get(0)?,
                task_id: r.get(1)?,
                task_type: r.get(2)?,
                task_name: r.get(3)?,
                action: r.get(4)?,
                value: r.get(5)?,
                day: r.get(6)?,
                ts,
            })
        });
        match rows {
            Ok(iter) => iter
                .filter_map(|r| r.ok())
                .map(|mut row| {
                    // ts 只保留 HH:MM
                    if let Some(t) = row.ts.split(' ').nth(1) {
                        row.ts = t.chars().take(5).collect();
                    }
                    row
                })
                .collect(),
            Err(_) => vec![],
        }
    }

    /// 删除单条记录（补录纠错）
    pub fn delete_record(&self, id: i64) -> Result<(), String> {
        self.conn
            .lock()
            .execute("DELETE FROM records WHERE id = ?1", params![id])
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn settings(&self) -> Settings {
        let raw: Option<String> = self
            .conn
            .lock()
            .query_row("SELECT value FROM settings WHERE key='app'", [], |r| r.get(0))
            .optional()
            .ok()
            .flatten();
        raw.and_then(|s| serde_json::from_str::<Settings>(&s).ok())
            .unwrap_or_default()
    }

    pub fn save_settings(&self, s: &Settings) -> Result<(), String> {
        let json = serde_json::to_string(s).map_err(|e| e.to_string())?;
        self.conn
            .lock()
            .execute(
                "INSERT INTO settings (key, value) VALUES ('app', ?1)
                 ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                params![json],
            )
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    /// 应用重启时关闭上一次未结束的会话，返回是否存在残留会话
    pub fn close_stale_sessions(&self) -> bool {
        let now = Local::now().format(TS_FMT).to_string();
        let n = self
            .conn
            .lock()
            .execute(
                "UPDATE sessions SET ended_at = ?1, end_reason = 'restart' WHERE ended_at IS NULL",
                params![now],
            )
            .unwrap_or(0);
        n > 0
    }

    pub fn start_session(&self, kind: &str, planned_min: i64) -> i64 {
        let now = Local::now().format(TS_FMT).to_string();
        let conn = self.conn.lock();
        let _ = conn.execute(
            "UPDATE sessions SET ended_at = ?1, end_reason = 'replaced' WHERE ended_at IS NULL",
            params![now],
        );
        conn.execute(
            "INSERT INTO sessions (kind, planned_min, started_at) VALUES (?1, ?2, ?3)",
            params![kind, planned_min, now],
        )
        .ok();
        conn.last_insert_rowid()
    }

    pub fn end_session(&self, id: i64, reason: &str) {
        let now = Local::now().format(TS_FMT).to_string();
        let _ = self.conn.lock().execute(
            "UPDATE sessions SET ended_at = ?1, end_reason = ?2 WHERE id = ?3",
            params![now, reason, id],
        );
    }

    pub fn stats(&self, days: u32) -> StatsPayload {
        let today = Local::now().date_naive();
        let from = today - Duration::days(days as i64 - 1);
        let from_s = from.format("%Y-%m-%d").to_string();

        let conn = self.conn.lock();
        let mut by_day: HashMap<String, HashMap<String, TypeDay>> = HashMap::new();
        if let Ok(mut stmt) = conn.prepare(
            "SELECT day, task_type,
                    SUM(CASE WHEN action='complete' THEN value ELSE 0 END),
                    SUM(CASE WHEN action='complete' THEN 1 ELSE 0 END),
                    SUM(CASE WHEN action='skip' THEN 1 ELSE 0 END)
             FROM records WHERE day >= ?1 GROUP BY day, task_type",
        ) {
            if let Ok(rows) = stmt.query_map(params![from_s], |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, f64>(2).unwrap_or(0.0),
                    r.get::<_, i64>(3).unwrap_or(0),
                    r.get::<_, i64>(4).unwrap_or(0),
                ))
            }) {
                for (day, ty, value, times, skips) in rows.flatten() {
                    by_day.entry(day).or_default().insert(
                        ty,
                        TypeDay {
                            value,
                            times,
                            skips,
                        },
                    );
                }
            }
        }

        let mut out_days = Vec::new();
        for i in 0..days {
            let d = from + Duration::days(i as i64);
            let key = d.format("%Y-%m-%d").to_string();
            out_days.push(DayStat {
                day: key.clone(),
                by_type: by_day.remove(&key).unwrap_or_default(),
            });
        }

        // 24 小时分布 + 跳过率 + 会议时长
        let mut hourly = vec![0i64; 24];
        let mut total_times = 0i64;
        let mut total_skips = 0i64;
        if let Ok(mut stmt) = conn.prepare(
            "SELECT ts, action FROM records WHERE day >= ?1",
        ) {
            if let Ok(rows) = stmt.query_map(params![from_s], |r| {
                Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?))
            }) {
                for (ts, action) in rows.flatten() {
                    if action == "complete" {
                        total_times += 1;
                        if let Ok(dt) = chrono::NaiveDateTime::parse_from_str(&ts, TS_FMT) {
                            use chrono::Timelike;
                            hourly[dt.hour() as usize] += 1;
                        }
                    } else if action == "skip" {
                        total_skips += 1;
                    }
                }
            }
        }

        let meeting_minutes: i64 = conn
            .query_row(
                "SELECT COALESCE(SUM(
                    CASE WHEN ended_at IS NULL THEN 0
                    ELSE (strftime('%s', ended_at) - strftime('%s', started_at)) / 60 END), 0)
                 FROM sessions WHERE started_at >= ?1",
                params![format!("{from_s} 00:00:00")],
                |r| r.get(0),
            )
            .unwrap_or(0);

        // streak：从今天（或昨天）往前数连续有完成记录的天数
        let mut streak = 0;
        let mut cursor = today;
        let mut first = true;
        loop {
            let key = cursor.format("%Y-%m-%d").to_string();
            let has: i64 = conn
                .query_row(
                    "SELECT COUNT(*) FROM records WHERE day = ?1 AND action='complete'",
                    params![key],
                    |r| r.get(0),
                )
                .unwrap_or(0);
            if has > 0 {
                streak += 1;
                cursor -= Duration::days(1);
            } else if first {
                // 今天还没完成任何事，不算断，继续看昨天
                first = false;
                cursor -= Duration::days(1);
            } else {
                break;
            }
            if streak > 400 {
                break;
            }
        }

        let week_total: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM records WHERE day >= ?1 AND action='complete'",
                params![format!(
                    "{}",
                    (today - Duration::days(6)).format("%Y-%m-%d")
                )],
                |r| r.get(0),
            )
            .unwrap_or(0);

        let skip_rate = if total_times + total_skips > 0 {
            total_skips as f64 / (total_times + total_skips) as f64 * 100.0
        } else {
            0.0
        };

        StatsPayload {
            days: out_days,
            hourly,
            streak,
            week_total,
            skip_rate,
            meeting_minutes,
        }
    }

    pub fn export_csv(&self) -> Result<String, String> {
        let dir = dirs_download().unwrap_or_else(|| self.media_dir.clone());
        let file = dir.join(format!(
            "sip-{}.csv",
            Local::now().format("%Y%m%d-%H%M%S")
        ));
        let conn = self.conn.lock();
        let mut stmt = conn
            .prepare("SELECT day, ts, task_type, task_name, action, value FROM records ORDER BY id")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, String>(2)?,
                    r.get::<_, String>(3)?,
                    r.get::<_, String>(4)?,
                    r.get::<_, f64>(5)?,
                ))
            })
            .map_err(|e| e.to_string())?;
        let mut out = String::from("date,time,type,name,action,value\n");
        for row in rows.flatten() {
            out.push_str(&format!(
                "{},{},\"{}\",\"{}\",{},{}\n",
                row.0,
                row.1.split(' ').nth(1).unwrap_or(""),
                row.2,
                row.3.replace('"', "'"),
                row.4,
                row.5
            ));
        }
        std::fs::write(&file, out).map_err(|e| e.to_string())?;
        Ok(file.to_string_lossy().to_string())
    }
}

fn dirs_download() -> Option<PathBuf> {
    #[cfg(target_os = "windows")]
    {
        let profile = std::env::var("USERPROFILE").ok()?;
        let p = PathBuf::from(profile).join("Downloads");
        if p.exists() {
            return Some(p);
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        if let Ok(home) = std::env::var("HOME") {
            let p = PathBuf::from(home).join("Downloads");
            if p.exists() {
                return Some(p);
            }
        }
    }
    None
}

/// 判断当前时间是否落在 [start, end) 区间，支持跨天
pub fn in_time_range(start: &str, end: &str, now: NaiveTime) -> bool {
    let parse = |s: &str| NaiveTime::parse_from_str(s, "%H:%M").ok();
    let (s, e) = match (parse(start), parse(end)) {
        (Some(s), Some(e)) => (s, e),
        _ => return true,
    };
    if s <= e {
        now >= s && now <= e
    } else {
        now >= s || now <= e
    }
}

pub fn weekday_index() -> u8 {
    Local::now().weekday().num_days_from_sunday() as u8
}

pub fn today_str() -> String {
    Local::now().format("%Y-%m-%d").to_string()
}
