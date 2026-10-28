//! 运行日志落盘。
//!
//! Windows 上 release 构建是 GUI 子系统（`windows_subsystem = "windows"`），
//! `stderr` 没有控制台句柄，`eprintln!` 会被直接丢掉 —— 于是「装完打不开 / 点了没反应」
//! 这类问题在用户机器上完全拿不到线索。这里把所有日志同时写进
//!
//!   `%LOCALAPPDATA%\com.sip.desktop\logs\sip.log`
//!
//! 方便装上之后直接让用户把文件发回来。可通过 `SIP_LOG_DIR` 覆盖目录。

use std::fs::{File, OpenOptions};
use std::io::Write;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};

static LOG_FILE: OnceLock<Mutex<Option<File>>> = OnceLock::new();
static LOG_PATH: OnceLock<PathBuf> = OnceLock::new();

/// 单个日志文件上限，超过就滚一个 `.1`
const MAX_BYTES: u64 = 2 * 1024 * 1024;

fn log_dir() -> PathBuf {
    if let Some(dir) = std::env::var_os("SIP_LOG_DIR") {
        return PathBuf::from(dir);
    }
    if let Some(base) = std::env::var_os("LOCALAPPDATA").or_else(|| std::env::var_os("APPDATA")) {
        return PathBuf::from(base).join("com.sip.desktop").join("logs");
    }
    std::env::temp_dir().join("sip-logs")
}

/// 日志文件路径（初始化后才有值，初始化失败时返回候选路径）
pub fn log_path() -> PathBuf {
    LOG_PATH
        .get()
        .cloned()
        .unwrap_or_else(|| log_dir().join("sip.log"))
}

pub fn init() {
    let dir = log_dir();
    let _ = std::fs::create_dir_all(&dir);
    let path = dir.join("sip.log");
    let _ = LOG_PATH.set(path.clone());

    // 简单轮转：超过上限就把当前文件挪成 .1（覆盖旧的 .1）
    if let Ok(meta) = std::fs::metadata(&path) {
        if meta.len() > MAX_BYTES {
            let _ = std::fs::rename(&path, dir.join("sip.log.1"));
        }
    }

    let file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .ok();

    let _ = LOG_FILE.set(Mutex::new(file));

    write_line(&format!(
        "\n===== Sip v{} 启动 {} =====",
        env!("CARGO_PKG_VERSION"),
        timestamp()
    ));
    write_line(&format!(
        "[log] 日志文件 {} exe={:?}",
        path.display(),
        std::env::current_exe().ok()
    ));
}

fn timestamp() -> String {
    // 不引入 chrono：用 SystemTime 转本地时间格式（精度到秒足够）
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    // 本地时区偏移（东八区 +8h）。这里只做展示，不做严格时区换算。
    let local = secs + 8 * 3600;
    let (h, m, s) = ((local / 3600) % 24, (local / 60) % 60, local % 60);
    let days = local / 86400;
    format!("D{days} {h:02}:{m:02}:{s:02}")
}

pub fn write_line(line: &str) {
    let slot = LOG_FILE.get_or_init(|| Mutex::new(None));
    // 注意：即便锁「中毒」也必须照写。之前有线程在持锁期间 panic，
    // 结果之后所有日志被静默丢弃，反倒把真正的问题藏了起来。
    let mut guard = match slot.lock() {
        Ok(g) => g,
        Err(poisoned) => poisoned.into_inner(),
    };
    if let Some(file) = guard.as_mut() {
        let _ = writeln!(file, "{}", line);
        let _ = file.flush();
    }
}

/// 同时写日志文件 + 控制台（debug 下才打控制台）
#[macro_export]
macro_rules! logln {
    ($($arg:tt)*) => {{
        let __line = format!($($arg)*);
        $crate::logging::write_line(&__line);
        if cfg!(debug_assertions) {
            eprintln!("{}", __line);
        }
    }};
}
