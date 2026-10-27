# 小满 Sip · 技术设计文档

| 项目 | 内容 |
| --- | --- |
| 版本 | **v1.2**（新增主题系统 / 中英双语 / SVG 图标规范） |
| 对应 PRD | `docs/PRD.md` v1.2 |
| 基线代码 | Shui（Tauri 2 + Next.js 15），本版重写为 **Tauri 2 + Vite + React 19** |
| 目录 | `Desktop/定时活动/定时everything` |

> v1.1 变更：会议模式不新增线程与状态机，而是在既有 `Engine` 上增加一个 **`Session`（免打扰会话）** 维度，`meeting / focus` 共用同一实现；新增 `sessions` 表用于统计会议时长；全屏提醒页支持"持续型任务"的倒计时模式。
>
> v1.2 变更：主题用 **CSS 变量 + `data-theme`** 单一真源（不依赖 Tailwind `dark:` 变体，避免多主题受限）；i18n **自研轻量字典**（不引 i18next，约 60 行）；任务图标从 emoji 改为**自绘单色 SVG + 任务色**（emoji 跨平台渲染不一致，会破坏整体质感）。

---

## 1. 技术选型与决策记录（ADR）

### ADR-1 保留 Tauri，去掉 Next.js

**决策**：Tauri 2 保留，前端从 Next.js 换成 Vite + React SPA。

**理由**
- 桌面应用不需要 SSR/ISR，Next.js 的 `next build` + `dist` 静态导出反而是负担（原项目 `frontendDist: ../dist`）。
- Vite 支持**多入口 HTML**（主窗口 / 全屏提醒 / 消息窗），天然适配 Tauri 多窗口，构建 3 秒 vs 30 秒。
- 原项目 Rust 侧能力（多屏窗口、托盘、锁屏监听、白名单）可直接复用，这是最大的沉没成本保护。

**代价**：失去 Next 的文件路由 → 用自研 20 行状态路由替代（4 个页面，不需要 router 库）。

### ADR-2 调度逻辑放 Rust，不放前端

**决策**：任务计时、到期判定、暂停判定全部在 Rust 后台线程；前端只做渲染与命令调用。

**理由**
- 原项目把计时放 Rust、把"到期后干什么"放前端 `listen('timer-complete')`，导致窗口被销毁/前端报错时提醒丢失。
- 多任务下前端定时器会被浏览器节流（窗口隐藏时 `setTimeout` 降频到 1s+），Rust 线程不受影响。
- 统计写入也应在 Rust 侧完成，避免"前端写了一半崩了"的数据不一致。

**实现**：独立线程 `scheduler-thread`，1s tick，`Mutex<Engine>` 持有全部运行态，`app_handle.emit("tick", ...)` 推送快照。

### ADR-3 SQLite（rusqlite bundled）而非 store.json

**决策**：`rusqlite`（`bundled` 特性，自带 sqlite3，无需系统依赖）。

**理由**
- 需要区间查询（7/30 天趋势、按时段聚合、按类型聚合），KV store 要全量读入内存手写聚合。
- 记录粒度是"每次交互一条"，一年约 2–3 万行，SQL 聚合是正确工具。
- `bundled` 避免 Windows 无 sqlite3.dll 的部署问题。

**位置**：`{app_data_dir}/ticker.db`，与旧版 JSON 隔离，互不影响。

### ADR-4 前端零 UI 框架依赖（除 Tailwind）

**决策**：不引入 shadcn/Radix/AntD，手写组件 + Tailwind v4。

**理由**
- 本产品 UI 高度定制（环形进度、超大按钮、伪装窗），通用组件库反而要大量覆写。
- 首版体积与构建稳定性优先；图表也自绘 SVG（环形 / 柱状 / 折线 / 热力），零依赖、样式统一、可精确适配深色。

### ADR-5 主题用 CSS 变量，不用 Tailwind `dark:` 变体

**决策**：所有颜色定义为 `:root[data-theme="dark|light"]` 下的 CSS 变量，Tailwind 通过 `@theme inline` 映射为语义类（`bg-surface` / `text-fg`）。

**理由**
- `dark:` 变体要求每个类名都写两遍（`bg-white dark:bg-slate-900`），200 个元素就是 400 处硬编码，改一次配色要全局搜索。
- CSS 变量让"换肤"变成切换一个 `data-theme` 属性，一个函数搞定，且不会漏。
- 后续加"高对比度""护眼绿"主题只需再加一组变量，组件零改动。

**代价**：Tailwind IntelliSense 对自定义语义类提示较弱。可接受。

### ADR-6 i18n 自研字典，不引 i18next

**决策**：`src/i18n/{zh,en}.ts` + `useT()` hook，约 60 行。

**理由**
- 需求只有 2 种语言、约 180 个文案键、无复数规则（中文无复数，英文的复数场景可写成 `{n} times` 规避）。
- i18next 引入 ~40KB 与一套配置概念，对本项目是负资产。

**代价**：插值与复数需手写。已确认英文文案不依赖复杂复数规则。

### ADR-7 任务图标改自绘 SVG（修正 v1.0 的 emoji 方案）

**决策**：`tasks.icon` 存图标 key（`water|eyes|kegel|break|custom:xxx`），前端 `<TaskIcon name={key} color={taskColor} />` 渲染内联 SVG。

**理由**
- emoji 在不同平台是不同字体：Windows 走 Segoe UI Emoji（扁平彩色），macOS 走 Apple Color Emoji（拟物立体）。同一个 `💧` 在两端视觉重量差一倍，且无法随主题改变深浅。
- SVG 可用 `currentColor` 跟随任务色，线条粗细与圆角与界面其余部分一致。
- 用户自定义任务可从 12 个内置图标里选，颜色自动跟随类型。

**代价**：需要画 12 个图标（每个约 3–6 行 path），一次性成本。

---

## 2. 总体架构

```
┌──────────────────────── Windows / macOS ────────────────────────┐
│  Tauri Process                                                  │
│                                                                  │
│  ┌──────────────── Rust Core ────────────────┐                   │
│  │ db.rs        SQLite（tasks/records/settings）│                  │
│  │ models.rs    Task / Record / Snapshot      │                   │
│  │ scheduler.rs 调度线程（1s tick）            │                   │
│  │   ├─ Engine { tasks: Vec<RuntimeTask> }    │                   │
│  │   ├─ 暂停判定（锁屏/白名单/专注/免打扰/时段）│                   │
│  │   ├─ 到期队列（优先级 + 3s 串行）           │                   │
│  │   └─ emit("tick") / emit("remind")         │                   │
│  │ windows.rs   全屏窗 × N 屏 / 消息窗         │                   │
│  │ commands.rs  20+ invoke 命令               │                   │
│  └───────────────┬───────────────────────────┘                   │
│                  │ emit / invoke                                 │
│  ┌───────────────▼───────────────────────────┐                   │
│  │ WebView（Vite 多入口）                     │                   │
│  │  index.html    → 主窗口（今日/任务/统计/设置）│                  │
│  │  reminder.html → 全屏提醒（每屏一实例）     │                   │
│  │  toast.html    → 消息窗（伪装皮肤）         │                   │
│  └───────────────────────────────────────────┘                   │
└──────────────────────────────────────────────────────────────────┘
        Tray（托盘倒计时 / 快捷菜单）· GlobalShortcut · Autostart
```

---

## 3. 目录结构

```
定时everything/
├── docs/
│   ├── PRD.md
│   └── DESIGN.md
├── index.html                # 主窗口入口
├── reminder.html             # 全屏提醒入口
├── toast.html                # 消息窗入口
├── vite.config.ts
├── tsconfig.json
├── package.json
├── src/
│   ├── entries/
│   │   ├── main-entry.tsx
│   │   ├── reminder-entry.tsx
│   │   └── toast-entry.tsx
│   ├── app/
│   │   ├── App.tsx           # 主窗口外壳（自绘标题栏 + 侧边导航 + 路由）
│   │   ├── pages/Today.tsx
│   │   ├── pages/Tasks.tsx
│   │   ├── pages/Stats.tsx
│   │   ├── pages/Settings.tsx
│   │   └── pages/TaskEditor.tsx  # 弹层
│   ├── views/
│   │   ├── ReminderView.tsx  # 全屏提醒
│   │   └── ToastView.tsx     # 消息窗
│   ├── components/
│   │   ├── ui/               # Button / Card / Switch / Slider / Modal / Input / Tabs
│   │   ├── icons/            # TaskIcon（12 个自绘 SVG）+ NavIcon + StatusIcon
│   │   ├── charts/           # RingProgress / BarChart / LineChart / Heatmap
│   │   └── TaskCard.tsx / StatBadge.tsx / Section.tsx
│   ├── i18n/                 # v1.2
│   │   ├── index.tsx         # I18nProvider + useT() + 语言解析（含 system 跟随）
│   │   ├── zh.ts             # 中文词典（基准，键的唯一来源）
│   │   ├── en.ts             # 英文词典
│   │   └── types.ts          # type Dict = Record<MsgKey, string>
│   ├── lib/
│   │   ├── api.ts            # invoke 封装（唯一与 Rust 通信出口）
│   │   ├── types.ts          # 与 Rust serde 结构一一对应
│   │   ├── store.tsx         # AppProvider：snapshot 订阅 + 乐观更新
│   │   ├── templates.ts      # 内置提醒模板（文案存 key，运行时 t() 展开）
│   │   ├── theme.tsx         # ThemeProvider：dark/light/system + accent + scale
│   │   ├── tokens.ts         # 任务类型 → 颜色变量名 / 图标 key
│   │   └── format.ts         # mm:ss、ml、按 locale 的日期格式
│   └── styles/global.css     # Tailwind + 两套主题的 CSS 变量
└── src-tauri/
    ├── tauri.conf.json
    ├── capabilities/default.json
    ├── icons/
    └── src/
        ├── main.rs
        ├── lib.rs
        ├── db.rs
        ├── models.rs
        ├── scheduler.rs
        ├── windows.rs
        ├── platform.rs
        └── commands.rs
```

---

## 4. 数据模型

### 4.1 表结构

```sql
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS tasks (
  id           TEXT PRIMARY KEY,        -- uuid v4
  name         TEXT NOT NULL,           -- 用户改名后的值；等于空串时按 name_key 取词典
  name_key     TEXT,                     -- v1.2：内置任务默认名 key（task.water 等），切换语言用
  type         TEXT NOT NULL,           -- water|eyes|kegel|break|custom
  icon         TEXT NOT NULL DEFAULT 'water',  -- v1.2：图标 key，不再用 emoji
  enabled      INTEGER NOT NULL DEFAULT 1,
  interval_min INTEGER NOT NULL DEFAULT 45,
  active_start TEXT NOT NULL DEFAULT '09:00',
  active_end   TEXT NOT NULL DEFAULT '18:00',
  weekdays     TEXT NOT NULL DEFAULT '1,2,3,4,5',  -- 0=周日
  remind_style TEXT NOT NULL DEFAULT 'fullscreen', -- fullscreen|toast|system
  template_id  TEXT,
  sound        TEXT NOT NULL DEFAULT 'default',    -- default|none|<abs path>
  snooze_min   INTEGER NOT NULL DEFAULT 5,         -- 0 = 不显示稍后
  goal         REAL NOT NULL DEFAULT 0,            -- water: ml；其他: 次数
  unit_value   REAL NOT NULL DEFAULT 0,            -- water: ml/次；eyes/break: 秒；kegel: 组
  daily_cap    INTEGER NOT NULL DEFAULT 0,         -- 0 = 不限
  sort         INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS records (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id   TEXT NOT NULL,
  task_type TEXT NOT NULL,
  task_name TEXT NOT NULL,             -- 冗余，任务删除后统计仍可读
  action    TEXT NOT NULL,             -- complete|skip|snooze
  value     REAL NOT NULL DEFAULT 0,   -- complete 时：ml / 次 / 秒
  day       TEXT NOT NULL,             -- 'YYYY-MM-DD'（本地时区）
  ts        TEXT NOT NULL              -- RFC3339
);
CREATE INDEX IF NOT EXISTS idx_records_day  ON records(day);
CREATE INDEX IF NOT EXISTS idx_records_type ON records(task_type, day);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL          -- JSON 编码
);

-- v1.1：免打扰会话（会议 / 专注），用于冻结判定与时长统计
CREATE TABLE IF NOT EXISTS sessions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  kind        TEXT NOT NULL,     -- meeting | focus
  planned_min INTEGER NOT NULL,  -- 0 = 不限时长
  started_at  TEXT NOT NULL,     -- RFC3339
  ended_at    TEXT,              -- NULL = 进行中（重启时按"已结束"处理）
  end_reason  TEXT               -- auto | manual | restart
);
CREATE INDEX IF NOT EXISTS idx_sessions_start ON sessions(started_at);
```

### 4.2 运行态（仅内存，重启重置）

```rust
struct RuntimeTask {
    task: Task,
    next_due: Option<DateTime<Local>>,  // None = 尚未开始（等活跃时段）
    remaining_sec: i64,                 // 供前端直接渲染
    done_today: f64,                    // 已累计值（ml / 次 / 秒）
    count_today: i64,                   // 完成次数
    skip_today: i64,
    snoozed_until: Option<DateTime<Local>>,
}

// v1.1：免打扰会话（会议 / 专注共用）
struct Session {
    kind: SessionKind,                  // Meeting | Focus
    started_at: DateTime<Local>,
    planned_min: i64,                   // 0 = 不限
    ends_at: Option<DateTime<Local>>,   // planned=0 时为 None
    soft_landing_until: Option<Instant>,// 会话结束后的 60s 静默窗口
    warned: bool,                       // "剩 3 分钟"是否已提示
}

struct Engine {
    tasks: Vec<RuntimeTask>,
    session: Option<Session>,
    pending_remind: Option<RemindPayload>,
}
```

**重启策略**：启动时把 `next_due` 设为 `now + interval`（不补弹），并把当天的 `records` 汇总回填到 `done_today`。

### 4.3 统计查询（关键 SQL）

```sql
-- 近 N 天按类型聚合
SELECT day, task_type,
       SUM(CASE WHEN action='complete' THEN value ELSE 0 END) AS value,
       SUM(CASE WHEN action='complete' THEN 1 ELSE 0 END)     AS times,
       SUM(CASE WHEN action='skip' THEN 1 ELSE 0 END)         AS skips
FROM records
WHERE day >= ?1
GROUP BY day, task_type
ORDER BY day;
```

---

## 5. 调度引擎设计

### 5.1 线程模型

```
main thread ── spawn ──► scheduler-thread（std::thread，1s 循环）
                            │
                            ├─ 持锁 tick（<1ms，纯算术 + 到期判断）
                            ├─ 到期待弹窗口时：开线程/异步任务建窗，不阻塞 tick
                            └─ emit("tick", Snapshot)

emit("remind", RemindPayload) ──► 各 WebView 负责展示
```

`Engine` 由 `Arc<Mutex<Engine>>`（`parking_lot`）持有，commands 与 scheduler 共享。

### 5.2 tick 伪代码

```rust
loop {
  sleep(1s);
  let now = Local::now();
  let settings = load_settings();
  let mut engine = ENGINE.lock();

  // v1.1：会话到期 → 结束会话（写 sessions.ended_at）+ 进入 60s 软着陆
  if engine.session_due(now) {
      engine.end_session(EndReason::Auto, now);   // planned_min = 0 的会话永不自动到期
  }

  let pause = engine.pause_reason(&settings, now);   // 见 5.3
  if pause.is_some() {
      engine.freeze(now);                            // 全部 next_due 后移 1s
      emit("tick", engine.snapshot(pause));
      continue;
  }

  for t in &mut engine.tasks {
      if !t.task.enabled || !t.is_active_today(now) { continue; }
      if t.next_due.none() { t.next_due = Some(now + interval); continue; }
      if now >= t.next_due && !engine.queue.contains(t) && t.under_cap() {
          engine.queue.push(t);                      // 优先级排序
      }
  }

  if engine.can_pop(now) {                           // 串行：距上次弹窗 ≥3s 且无窗口未关闭
      let t = engine.queue.pop_highest();
      t.next_due = Some(now + interval);             // 先推进，避免重复入队
      drop(engine);
      windows::show_for_task(&app, &t);              // 决定 fullscreen / toast / system
      emit("remind", ...);
      engine.last_pop = now;
  } else {
      emit("tick", engine.snapshot(None));
  }
}
```

### 5.3 暂停判定优先级

| 优先级 | 条件 | 托盘文案 |
| --- | --- | --- |
| **0** | **会议模式会期中（v1.1）** | **`会议中 12:34`** |
| 1 | 用户手动暂停 | `已暂停` |
| 2 | 专注模式计时中 | `专注 12:00` |
| 3 | 系统锁屏 / 睡眠（`platform::is_screen_locked`） | `已锁屏` |
| 4 | 前台应用命中白名单 | `疑似会议` |
| 5 | 全局免打扰时段 | `免打扰` |
| 6 | 非活跃时段 / 非生效星期 | 空（`--:--`） |

**冻结语义**：暂停期间 `next_due += tick_delta`，恢复后剩余时间不变（不补弹、不加速）。

> 会议模式与"专注"在代码上同属 `Session`，只是 `kind` 不同、默认时长不同、UI 文案不同。白名单从"会议中"改名为"疑似会议"，因为白名单是**自动猜测**，而会议模式是**用户确认**，两者必须可区分，否则用户会以为是 bug。

### 5.4 免打扰会话引擎（v1.1 新增）

```rust
impl Engine {
    fn start_session(&mut self, kind: SessionKind, minutes: i64, now: DateTime<Local>) {
        // 1. 若已有会话，先结束旧的（不重复写库）
        // 2. 写 sessions 行（ended_at = NULL），拿到 id
        // 3. 关闭所有已弹出的提醒窗（windows::hide_all_reminders）
        // 4. 清空到期队列 + pending_remind
        // 5. 托盘加静音角标（set_icon + set_title）
    }

    fn end_session(&mut self, reason: EndReason, now: DateTime<Local>) {
        // 1. UPDATE sessions SET ended_at=?, end_reason=? WHERE id=?
        // 2. 解除冻结：所有 next_due 从当前值继续（freeze 已在 tick 中累加，无需重算）
        // 3. soft_landing_until = now + 60s  ← 软着陆
        // 4. 托盘恢复图标；emit("session-ended")
    }
}
```

**关键实现约束**

1. **冻结不丢精度**：暂停期间用 `next_due += 1s` 累加（与 PRD "剩余时间完全一致"验收对应），而不是记录暂停起点再统一平移 —— 后者在跨 tick 抖动时会产生 ±1s 误差。
2. **会议中不写 skip**：`log(skip)` 在 `session.is_some()` 时直接返回当前快照、不落库。
3. **允许手动 complete**：`log(complete)` 不受会话影响（用户真喝了），但仍不重置 `next_due` 的冻结状态 —— 冻结的是计时推进，不是记录。
4. **重启语义**：启动时执行 `UPDATE sessions SET ended_at=now, end_reason='restart' WHERE ended_at IS NULL`，**不恢复会话状态**（PRD F8 防永久静音）。主窗通过 `lastSessionEndedByRestart` 标记做一次轻提示。
5. **2 小时气泡**：不限时长会话在 `elapsed % 120min == 0` 时触发一次托盘气泡（`Engine.session_warned_at` 去重）。
6. **剩 3 分钟预告**：`ends_at - now <= 180s && !warned` → 更新 tooltip 一次，置 `warned = true`。

### 5.5 并发到期排队

- 队列按 `type 优先级`（water 0 > eyes 1 > kegel 2 > break 3 > custom 4）+ 首次到期时间排序。
- 串行约束：上一次弹窗最小间隔 3s；若上次窗口仍未关闭（用户没操作），新任务入队等待，最多等 60s 后直接弹出（避免饿死）。
- 全屏窗未关闭时，消息窗任务排队；消息窗任务不阻塞全屏任务。

---

## 6. Rust ↔ 前端契约

### 6.1 结构体（serde，`camelCase` 对齐 TS）

```rust
#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Task {
    pub id: String, pub name: String, pub r#type: String, pub icon: String,
    pub enabled: bool, pub interval_min: i64,
    pub active_start: String, pub active_end: String, pub weekdays: Vec<u8>,
    pub remind_style: String, pub template_id: Option<String>,
    pub sound: String, pub snooze_min: i64,
    pub goal: f64, pub unit_value: f64, pub daily_cap: i64, pub sort: i64,
}

#[serde(rename_all = "camelCase")]
pub struct TaskView {            // Task + 运行态，前端渲染只需这个
    #[serde(flatten)] pub task: Task,
    pub remaining_sec: i64,      // -1 表示暂停/未开始
    pub done_today: f64,
    pub count_today: i64,
    pub skip_today: i64,
    pub goal_ratio: f64,         // 0..=1
    pub status: String,          // running|paused|done|inactive|snoozed
}

#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub now: String,
    pub paused: bool,
    pub pause_reason: Option<String>,
    pub tasks: Vec<TaskView>,
    pub today: TodaySummary,     // 各类次数 / 喝水 ml
    pub next_task: Option<TaskView>,
    // ---- v1.1 ----
    pub session: Option<SessionView>,   // { kind, startedAt, plannedMin, remainingSec }
    pub soft_landing_sec: i64,          // >0 表示会话刚结束的软着陆窗口
    pub session_ended_by_restart: bool, // 首帧为 true，前端提示一次后置 false
}

#[serde(rename_all = "camelCase")]
pub struct RemindPayload {
    pub task_id: String, pub name: String, pub r#type: String, pub icon: String,
    pub style: String, pub template_id: Option<String>,
    pub unit_value: f64, pub done_today: f64, pub goal: f64,
    pub snooze_min: i64, pub auto_close_sec: i64,
    // ---- v1.1：持续型任务（眼保健操/摸鱼/提肛）的全屏倒计时 ----
    pub duration_sec: i64,      // >0 时全屏页进入倒计时模式，归零自动 complete
}
```

### 6.2 命令列表

| 命令 | 入参 | 返回 | 说明 |
| --- | --- | --- | --- |
| `snapshot` | — | `Snapshot` | 首屏与手动刷新 |
| `list_tasks` | — | `Vec<Task>` | 任务页 |
| `save_task` | `task: Task` | `Task` | 新增/更新（id 为空则新建） |
| `delete_task` | `id` | `()` | |
| `set_task_enabled` | `id, enabled` | `()` | |
| `reorder_tasks` | `ids: Vec<String>` | `()` | |
| `log` | `taskId, action, value?` | `Snapshot` | complete/skip/snooze，写库 + 重置计时 |
| `snooze` | `taskId, minutes` | `Snapshot` | |
| `trigger_now` | `taskId` | `()` | 测试提醒 |
| `set_paused` | `paused` | `Snapshot` | |
| `start_focus` | `minutes` | `Snapshot` | 专注模式 |
| **`start_session`** | `kind: "meeting"\|"focus", minutes: i64` | `Snapshot` | v1.1 统一入口，`minutes=0` = 不限时长 |
| **`end_session`** | — | `Snapshot` | 手动结束，写 `ended_at` + `manual` |
| **`extend_session`** | `minutes` | `Snapshot` | 会议延长（横幅上的 "+15 分钟"） |
| `get_settings` | — | `Settings` | |
| `save_settings` | `s: Settings` | `Settings` | |
| `stats` | `days: u32` | `StatsPayload` | 趋势 / 热力 / streak |
| `export_csv` | — | `String`(路径) | 导出到下载目录 |
| `pick_media` | — | `Option<String>` | 选图片/GIF → 复制进媒体目录 |
| `media_url` | `file: String` | `String` | 转 asset URL 供 `<img>` |
| `open_data_dir` | — | `()` | |
| `hide_reminder` | `label` | `()` | 关全屏窗 |
| `hide_toast` | — | `()` | |
| `quit` | — | `()` | |

### 6.3 事件

| 事件 | 负载 | 发送方 | 订阅方 |
| --- | --- | --- | --- |
| `tick` | `Snapshot` | scheduler | 主窗口 |
| `remind` | `RemindPayload` | scheduler | reminder / toast 窗 |
| `reminder-closed` | `taskId` | reminder 窗关闭时 | 主窗口（刷新） |
| **`settings-changed`** | `Settings` | 任一窗口 `save_settings` 后 | 全部窗口（主题 / 语言 / 缩放同步） |

---

## 7. 窗口系统

### 7.1 主窗口

```jsonc
{ "label": "main", "url": "index.html", "width": 1080, "height": 720,
  "minWidth": 900, "minHeight": 620, "decorations": false,
  "transparent": false, "visible": true, "center": true }
```

- 自绘标题栏（`data-tauri-drag-region`）+ 自定义最小化/关闭按钮（关闭 = 隐藏到托盘）。
- 背景使用固定深色渐变，避免白闪（`html { background:#0E1116 }`）。

### 7.2 全屏提醒窗（每显示器一个）

```rust
WebviewWindowBuilder::new(app, &format!("reminder_{i}"), WebviewUrl::App("reminder.html".into()))
    .decorations(false).transparent(true).always_on_top(true)
    .fullscreen(true).skip_taskbar(true).focused(true)
    .position(monitor.position()).inner_size(monitor.size())
```

- 复用 Shui 的 `calculate_window_metrics`（含 scale_factor 换算）。
- 关闭：`Esc` / 点击按钮 / 自动倒计时 → `hide_reminder(label)`；全关后 `emit("reminder-closed")` 让调度器解锁队列。

### 7.3 消息窗

```rust
WebviewWindowBuilder::new(app, "toast", WebviewUrl::App("toast.html".into()))
    .decorations(false).transparent(true).always_on_top(true)
    .resizable(false).skip_taskbar(true).focused(false)
    .inner_size(400.0, 132.0).position(x, y)   // 右下角，留 24px 边距
```

- **不抢焦点**：`focused(false)`，保证用户打字时弹窗不打断输入（PRD F3.2 验收项）。
- 颜色与透明度由 toast 页面内部 CSS 控制（`transparent` 让圆角外透明）。
- 若已有 toast 正在显示，排队 4 秒后再显示下一个。

### 7.4 托盘

- `tray_icon.set_title(...)`：显示下一个任务的 `mm:ss`（macOS 生效；Windows 无 title，改为 tooltip）。
- 右键菜单结构（v1.1）：

```
今日 750/2000ml · 3 次          ← disabled 文本
──────────────────────────
💧 喝水 +250ml                  ← 快速记录（不打开主窗口）
✅ 眼保健操完成
──────────────────────────
🎧 开启会议模式 ▸  15 / 30 / 45 / 60 / 不限 / 到明天 09:00
   会议中时变为：🎧 结束会议（剩 12:34）
⏸ 暂停全部提醒 / ▶ 恢复
──────────────────────────
显示主窗口
退出
```

- 会议中：`set_icon()` 切换为带静音角标的图标变体（`icons/icon-tray-mute.ico`），标题改为 `🎧 12:34`。
- 菜单项文本每秒刷新（Tauri `MenuItem::set_text`），只在秒数变化时更新，避免高频 IPC。

### 7.5 全局快捷键

| 快捷键 | 行为 | 备注 |
| --- | --- | --- |
| `Ctrl/Cmd + Shift + M` | 开启会议模式（用上次时长）/ 会议中再按 = 结束 | 与系统输入法冲突风险低，冲突时注册失败静默降级 |
| `Ctrl/Cmd + Shift + H` | 显示 / 隐藏主窗口 | 沿用 Shui 的 `use-tray` 思路 |
| `Esc` | 关闭当前全屏提醒 | 仅提醒窗内注册，窗口隐藏即注销（同 Shui `unregisterAll` 逻辑） |

注册失败（被其他应用占用）**不阻塞启动**，设置页显示"快捷键被占用，可重新设置"。

---

## 8. 前端设计

### 8.1 路由

自研状态路由（20 行）：`type Page = 'today' | 'tasks' | 'stats' | 'settings'`，`App.tsx` 用 `useState` 切换，侧边导航同步高亮。窗口尺寸小、页面少，不需要 URL 同步。

### 8.2 状态管理

```tsx
// lib/store.tsx
AppProvider
 ├─ snapshot: Snapshot | null
 ├─ refresh(): Promise<void>          // 调 snapshot 命令
 ├─ patch(partial)                    // 乐观更新（点完成先 +1，再等 tick 校正）
 ├─ listen('tick') → setSnapshot      // 每秒一次，1 个事件驱动全部 UI
 └─ 封装 log / snooze / saveTask ...  // 调 api 后 refresh
```

**渲染成本控制**：`tick` 每秒触发一次全量 setState。任务数 ≤ 8，节点 ≤ 300，实测无压力；图表页不订阅 tick（只在进入页面时拉 `stats`）。

### 8.3 设计规范（Design Tokens）

```css
/* ---- 语义 token：组件只引用这些变量，不写死颜色 ---- */
:root[data-theme="dark"] {
  --bg:        #0B0F14;
  --surface:   #131A22;
  --surface-2: #1B242E;
  --border:    rgba(255,255,255,.08);
  --text:      #EDF2F7;
  --text-dim:  #8C9AAB;
  --text-mute: #64748B;
  --water: #38BDF8;  --eyes: #34D399;  --kegel: #A78BFA;  --break: #FBBF24;
  --danger: #F87171; --on-task: #05121B;
  --radius-lg: 20px; --radius-md: 14px; --radius-sm: 10px;
}
:root[data-theme="light"] {
  --bg:        #F5F7FA;
  --surface:   #FFFFFF;
  --surface-2: #EEF2F7;
  --border:    rgba(15,23,42,.09);
  --text:      #0F172A;
  --text-dim:  #55657A;
  --text-mute: #8595A8;
  /* 浅色下任务色整体加深一级，保证 4.5:1 对比度 */
  --water: #0284C7;  --eyes: #059669;  --kegel: #7C3AED;  --break: #D97706;
  --danger: #DC2626; --on-task: #FFFFFF;
}

/* ---- accent 只影响非任务类元素（导航选中、聚焦环、会议按钮） ---- */
:root[data-accent="ocean"]   { --accent: #38BDF8; --accent-soft: rgba(56,189,248,.14); }
:root[data-accent="violet"]  { --accent: #A78BFA; --accent-soft: rgba(167,139,250,.14); }
:root[data-accent="emerald"] { --accent: #34D399; --accent-soft: rgba(52,211,153,.14); }
:root[data-accent="amber"]   { --accent: #FBBF24; --accent-soft: rgba(251,191,36,.14); }

/* ---- Tailwind v4：映射成语义类（bg-surface / text-fg / border-line …） ---- */
@theme inline {
  --color-bg: var(--bg);
  --color-surface: var(--surface);
  --color-surface-2: var(--surface-2);
  --color-line: var(--border);
  --color-fg: var(--text);
  --color-fg-dim: var(--text-dim);
  --color-water: var(--water);
  --color-eyes: var(--eyes);
  --color-kegel: var(--kegel);
  --color-break: var(--break);
  --color-accent: var(--accent);
}
```

| 元素 | 规格 |
| --- | --- |
| 基准字号 | 15px（设置可调 90% / 100% / 110%，用 `--scale` 统一缩放） |
| 页面标题 | 26px / 500 |
| 倒计时数字 | `clamp(44px, 6vw, 72px)`，`font-variant-numeric: tabular-nums` |
| 主按钮 | 高 **72px**，圆角 16px，19px / 500，**实心任务色（不用渐变）**，`active:scale(.98)` |
| 次按钮 | 高 44px，1px 描边，悬停 `--surface-2` |
| 卡片 | `--surface` + 1px `--border` + `--radius-lg`，内边距 22px |
| 间距 | 4 的倍数；页面外边距 28px |
| 动效 | 200ms `cubic-bezier(.2,.8,.2,1)`；进度环 400ms；**禁止循环/漂浮类装饰动画** |
| 字重 | 仅 400 / 500 两档（600+ 会让深色界面发糊） |

### 8.3.1 主题实现（v1.2）

```
ThemeProvider（每个窗口一个实例，共享同一配置源）
 ├─ 读 settings.theme: dark | light | system
 ├─ system → matchMedia('(prefers-color-scheme: dark)')，addEventListener('change') 实时跟随
 ├─ 写入 document.documentElement.dataset.theme / dataset.accent / style.setProperty('--scale', n)
 ├─ localStorage 缓存 {theme, accent, scale}  ← 首帧前内联脚本读取，避免闪白
 └─ 变更时 emit 到 Rust（save_settings），由 Rust broadcast 给其它窗口
```

**首帧防闪白**（关键）：在 `index.html` / `reminder.html` / `toast.html` 的 `<head>` 内联一段同步脚本，先从 `localStorage` 读出 `theme` 写到 `<html data-theme>`，再由 React 接管。否则深色用户会看到约 150ms 的白屏。

**跨窗口同步**：主窗口改主题 → `save_settings` → Rust `emit("settings-changed")` → 全屏窗/消息窗收到后更新自身 `data-theme`。禁止各窗口自己读数据库轮询。

**全屏提醒页的特殊处理**：背景由模板决定（用户图片/渐变），不跟随主题；但页面内所有文字恒为白色 + 暗色蒙层（`rgba(0,0,0,.55)`），按钮恒为实心白底黑字。理由：无法预测用户上传的图片亮度，恒用暗色蒙层是唯一稳解。

### 8.3.2 多语言实现（v1.2）

```ts
// i18n/types.ts
export type MsgKey = keyof typeof zh;          // 中文是键的唯一来源

// 词典形态（扁平 key，不用嵌套，便于 grep）
{
  "nav.today": "今日",
  "task.water": "喝水",
  "task.water.cta": "我喝了 {ml} ml",
  "unit.times": "{n} 次",
  "stats.title": "统计",
}
```

```tsx
const { t, lang, setLang } = useT();
t("task.water.cta", { ml: 250 });   // → "我喝了 250 ml" / "I drank 250 ml"
```

| 规则 | 说明 |
| --- | --- |
| 语言解析 | `system` → `navigator.language` 以 `zh` 开头取 `zh`，否则 `en` |
| 词典完整性 | `en.ts` 用 `satisfies Record<MsgKey, string>` 约束，**缺键编译报错**（这是不用 i18next 也能保证不漏译的关键） |
| 插值 | 只支持 `{name}` 形式，不支持复数规则；英文文案统一写成 `{n} times` |
| 内置任务名 | 数据库 `name` 为空 → `t("task."+type)`；用户改过名 → 用库里的字面值 |
| 内置模板文案 | 模板只存 key（`tpl.water.title`），渲染时 `t()`，不存中文 |
| 日期 | `Intl.DateTimeFormat(lang === 'zh' ? 'zh-CN' : 'en-US', {...})`，不在代码里拼 `月/日` |
| Rust 侧文案 | `src-tauri/src/i18n.rs` 存同样两份表，供托盘菜单 / 系统通知使用；语言从 settings 读，切换时 `tray.rebuild()` |
| 语言切换响应 | 只重渲染 React 树，不重载窗口；托盘菜单重建 + 菜单文本刷新 |

**英文布局约束（落到 CSS）**
- 主按钮：`white-space: normal`（允许 2 行），`min-height: 72px`，不做 `text-overflow: ellipsis`；
- 侧边导航：`min-width: 132px`（中文 108px 即可，取英文值）；
- 卡片文字：`overflow-wrap: anywhere`，宁可换行也不截断动作词；
- 所有固定宽度容器改为 `minmax(0, 1fr)`，防英文撑破 grid。

### 8.4 页面线框

> 线框内的 emoji 仅示意图标位置，实际渲染为自绘 SVG（见 ADR-7）。文案为中文基准，英文以词典替换。

**今日（Today）**
```
┌──────────────────────────────────────────────────────────────┐
│  ●  ▏今日  ▏任务  ▏统计  ▏设置                    — □ ×      │  ← 自绘标题栏 + 侧栏
├──────────────────────────────────────────────────────────────┤
│  早上好，名沨            周三 10月27日  [🎧 会议模式 ▾] [专注 30m] │
│                                                              │
│  ┌────────────────────────────┐  ┌──────────────────────────┐│
│  │  💧 下一次：喝水            │  │ 今日概览                  ││
│  │                            │  │  💧 3 次 · 750ml         ││
│  │      12:34                 │  │  👁 2 次                 ││
│  │   ╭───────────╮            │  │  🧘 1 组                 ││
│  │   │  环形进度  │            │  │  ☕ 15 分钟              ││
│  │   ╰───────────╯            │  └──────────────────────────┘│
│  │  今日 750 / 2000 ml         │                              │
│  │  ┌──────────────────────┐  │                              │
│  │  │   我喝了 250ml        │  │  ← 72px 大按钮                │
│  │  └──────────────────────┘  │                              │
│  │   跳过     稍后 5 分钟      │                              │
│  └────────────────────────────┘                              │
│                                                              │
│  ── 全部任务 ─────────────────────────────────────────────    │
│  [💧 喝水 12:34 · 3/8] [👁 眼保健操 42:10 · 2/6] [🧘 提肛 …]  │
└──────────────────────────────────────────────────────────────┘
```

**全屏提醒（reminder.html）**
```
┌──────────────────────────────────────────────────────────────┐
│ [自定义 GIF 背景 + 60% 暗色遮罩]                    30s 后关闭 │
│                                                              │
│                          💧                                  │
│                     该喝水了                                   │
│              已经 45 分钟没喝水啦，来一杯吧                    │
│                                                              │
│          ┌────────────┐  ┌────────────┐                      │
│          │  250 ml    │  │  500 ml    │                      │
│          └────────────┘  └────────────┘                      │
│                                                              │
│                   稍后提醒 · 跳过  (Esc)                       │
└──────────────────────────────────────────────────────────────┘
```

**消息窗（toast.html，chat 皮肤）**
```
                        ┌───────────────────────────────┐
                        │ (头) 工作群 · 小李        now  │
                        │  你上次说的方案我看了，         │
                        │  有空一起过一下？              │
                        └───────────────────────────────┘
```

### 8.5 会议模式的三态 UI（v1.1）

**态 A · 常态**：顶部工具条右侧一个描边按钮 `🎧 会议模式`，点击展开气泡菜单：

```
              ┌────────────────────────┐
              │  开启后不弹任何提醒     │
              │  ○ 15 分钟             │
              │  ● 30 分钟（上次）      │
              │  ○ 45 分钟             │
              │  ○ 60 分钟             │
              │  ○ 不限时长             │
              │  ○ 到明天 09:00         │
              │  ⌨ Ctrl+Shift+M         │
              └────────────────────────┘
```

**态 B · 会议中**：整条变成红色横幅，占据工具条位置，视觉权重高于一切：

```
┌──────────────────────────────────────────────────────────────┐
│ 🎧 会议中 · 还有 12:34          [+15 分钟]  [结束会议]        │  ← --danger 背景 12% 透明
└──────────────────────────────────────────────────────────────┘
```

- 任务卡整体降饱和（`opacity: .55`）+ 倒计时数字变灰，但主按钮保持可点。
- 顶部大卡替换为"会议中，计时已冻结"的说明卡，不再显示倒计时（避免误导用户以为还在计时）。

**态 C · 软着陆（会话结束后 60s）**：横幅消失，顶部大卡显示 `会议结束，60 秒后恢复提醒`，倒计时数字继续走。

### 8.6 持续型任务的全屏倒计时（v1.1）

`durationSec > 0` 时全屏页进入倒计时模式（眼保健操 120s、摸鱼 300s、提肛 60s）：

```
              ╭───────────────╮
              │               │
              │     01:47     │   ← 环形进度从满到空，字号 72px
              │               │
              ╰───────────────╯
                闭上眼睛，转转眼球
              [ 我提前做完了 ]  [ 稍后 ]
```

- 倒计时归零 → 自动 `log(complete)` → 关闭窗口（无需用户再点一次，减少一次点击）。
- 页面内 `setInterval` 只做展示，权威时间来自 `durationSec` + `performance.now()` 起点，避免标签被节流后误差累积。
- 用户提前点完成 → 记录实际用时作为 `value`（统计"平均坚持时长"）。

---

## 9. 提醒模板系统

```ts
// lib/templates.ts
export interface RemindTemplate {
  id: string;
  name: string;
  style: 'fullscreen' | 'toast' | 'system';
  skin?: 'chat' | 'mail' | 'system' | 'minimal';  // toast 专用
  title: string;              // 支持变量 {task} {done} {goal} {time}
  subtitle?: string;
  image?: string;             // 内置渐变 key 或用户图片绝对路径
  overlay?: number;           // 0-90
  actions?: { label: string; value: number }[];  // fullscreen 专用
  accent?: string;            // 主色
}
```

变量替换：`{task}` 任务名、`{done}` 今日已完成、`{goal}` 目标、`{time}` 当前时间、`{interval}` 间隔分钟、`{name}` 用户名。

**内置模板**

| id | 名称 | 风格 | 关键内容 |
| --- | --- | --- | --- |
| `fs-water-ocean` | 深海渐变 | fullscreen | 蓝紫渐变 + "该喝水了" + 250/500ml |
| `fs-eyes-rest` | 闭眼休息 | fullscreen | 深绿渐变 + 20-20-20 文案 + 完成按钮 |
| `fs-custom` | 我的图片 | fullscreen | 用户图片/GIF + 自定义文案 |
| `toast-wechat` | 聊天消息 | toast/chat | 头像 + 昵称 + 一句话 + "回复" |
| `toast-mail` | 新邮件 | toast/mail | 发件人 + 主题 + 摘要 |
| `toast-system` | 系统提示 | toast/system | "系统通知" + 小字 |
| `toast-minimal` | 极简胶囊 | toast/minimal | 图标 + 一行字 |
| `sys-default` | 系统通知 | system | 原生 title/body |

**媒体处理**：`pick_media` 用 `tauri-plugin-dialog` 选文件 → 复制到 `{app_data}/media/<uuid>.<ext>` → 设置存**相对文件名** → 前端 `media_url(name)` 转 `convertFileSrc` 绝对 URL。文件缺失时前端降级到渐变背景并 toast 提示。

---

## 10. 平台差异与打包

| 项 | Windows | macOS |
| --- | --- | --- |
| 全屏窗 | `fullscreen(true)` + `always_on_top` | 需 `macOSPrivateApi: true`；保留 `nspanel` 依赖位（v1 用普通 window + `set_visible_on_all_workspaces`） |
| 托盘倒计时 | 无 title → 只用 tooltip + 菜单文本 | `tray.set_title()` 显示 `mm:ss` |
| 锁屏检测 | `WTSRegisterSessionNotification`（复用 Shui `util/windows.rs`） | CGEventSource 判定（复用） |
| 白名单前台应用 | `GetForegroundWindow` + 进程名（复用） | NSWorkspace frontmost（复用） |
| 打包 | `tauri build` → `.msi/.exe` | `tauri build` → `.dmg`，需自签或用户 `xattr` 解除隔离 |

**v1 构建目标**：Windows 本机跑通 dev + build；macOS 只保证代码特性开关正确（CI 上另行构建）。

---

## 11. 测试与验收方法

1. **单元级**：`cargo test` 覆盖 `Engine` 的到期判定、暂停冻结、跨天归属、上限截断（纯函数，不依赖 Tauri）。
2. **接口级**：手动 `invoke` 校验（dev 控制台）。
3. **端到端手测清单**
   - 建 4 个任务、间隔都设 1 分钟 → 观察串行弹出、互不干扰；
   - 点"我喝了 250ml" → 今日数字 +1、环形进度前进、倒计时重置；
   - 锁屏 2 分钟再解锁 → 不补弹、剩余时间不变；
   - 上传 GIF → 重启后仍生效；删除文件 → 降级不崩；
   - 7/30 天切换、CSV 导出内容与界面一致；
   - 关闭主窗口 → 驻留托盘、提醒照常；
   - **v1.1 会议模式**：
     - 全屏提醒正弹着时按 `Ctrl+Shift+M` → 全屏窗 300ms 内消失，无声音；
     - 会议 1 分钟（测试用最短预设）→ 期间任一任务剩余时间与开启前一致；
     - 会话结束 → 60 秒内静默，第 61 秒起正常提醒；
     - 会议中重启应用 → 提醒正常，`sessions.ended_at` 被写成 `restart`；
     - 会议中点"我喝了"→ 记录成功但计时仍冻结；
     - 不限时长会议开满 2 小时 → 弹出一次提醒气泡（且仅一次）。
   - **v1.2 主题与多语言**：
     - 切到"跟随系统"，在 OS 里切换深/浅色 → 三个窗口同时跟随，无闪白；
     - 冷启动（深色用户）→ 主窗口首帧即为深色，无白闪；
     - 切到 English → 主窗、托盘菜单、系统通知、全屏提醒页均无中文残留；
     - English 下逐页检查：主按钮不截断、侧栏不挤压、任务卡不溢出；
     - 切换语言后，未改名的内置任务显示英文名，已改名的保持原名；
     - `en.ts` 删除一个键 → `tsc` 必须报错（词典完整性守卫生效）。

---

## 12. 与基线代码的复用清单

| Shui 文件 | 复用方式 |
| --- | --- |
| `core/window/windows.rs` | 多屏 `calculate_window_metrics` + 建窗逻辑，改造为参数化 label/url |
| `core/setup/mod.rs` | 托盘倒计时线程思路、锁屏监听线程结构；本版改为单 scheduler 线程统一管理 |
| `core/util/windows.rs` | 前台窗口白名单、锁屏检测（直接搬） |
| `core/util/macos.rs` | frontmost app 检测（搬） |
| `utils/notification.ts` | 系统通知封装（搬） |
| `core/store/settings.rs` | 仅作参考，本版改为 SQLite + 多任务模型 |

**不复用**：全部 React 页面、`components/ui/*`（shadcn）、`store.json` 数据结构。

---

## 附录 A v1.3 设计增补（2026-10-27 评审后）

> 只写**与 v1.2 设计不同的部分**，未提及的章节继续有效。需求依据见 `PRD.md` 附录 B。
> 四条已确认决策：安静时段全局最多 3 条 / 回座 60 秒缓冲 / 「立即提醒」改「预览提醒」/ 会议中一律屏蔽。

### A.1 数据模型变更

`settings` 表继续用 KV（JSON 值），新增三个键，**不用改表结构**：

| key | 类型 | 说明 |
| --- | --- | --- |
| `quietHours` | `QuietHour[]` | 最多 3 条；替代原 `dndEnabled/dndStart/dndEnd`（读取时自动迁移，见 A.2） |
| `reminder` | `Record<TaskType, RemindProfile>` | 按类型的提醒默认值，替代 `fullscreenImage` |
| `meetingOngoingSince` | `string?` | 非空 = 会议进行中（ISO 时间），用于重启后判定 |

```rust
#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct QuietHour {
    pub start: String,      // "12:00"
    pub end: String,        // "13:30"，支持跨零点（start > end）
    pub days: Vec<u8>,      // 1=周一..7=周日
    pub grace_sec: i64,     // 回座缓冲：0=立刻提醒，60=默认
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RemindProfile {
    pub style: String,        // fullscreen | toast | system
    pub template_id: String,
    pub duration_sec: i64,    // 0 = 必须交互才关闭
    pub toast_skin: String,   // toast-chat | toast-mail | toast-system | toast-minimal
    pub toast_pos: String,    // br | tr | tl | bl
    pub sound: String,        // none | chime | bell | drop
    pub volume: f64,
    pub bg_image: String,     // 空 = 用渐变预设
    pub bg_preset: String,    // 预设 id，见 A.5
    pub dim: f64,             // 遮罩浓度 0~0.8
    pub blur: f64,            // 背景模糊 px
    pub show_countdown: bool,
    pub sender_name: String,  // 微信皮肤发送人
    pub message_text: String, // 微信皮肤正文（空 = 用模板）
}
```

**任务级覆盖**：`Task` 保留 `remind_style` / `template_id`，新增 `remind_override: bool`。
`false` = 跟随 `settings.reminder[type]`；`true` = 用任务自身字段。**默认 `false`**（这正是当前实现的反面，需在 `db::seed_if_empty` 里一并调整）。

### A.2 迁移

`db::init()` 之后加 `migrate_v13()`：

```
若 settings 无 quietHours：
    若旧 dndEnabled 存在 → quietHours = [{ start: dndStart, end: dndEnd, days: 1..7, graceSec: 60 }]
    否则 → quietHours = [{ "12:00","13:30",[1..5],60 }]   // 默认午休
若 settings 无 reminder：
    用现有 fullscreenImage + 各任务 style 拼出 4 个类型的默认 Profile
migrate 只跑一次，用一个 kv 标记 settingsVersion = "1.3" 防重跑
```

### A.3 引擎变更

**`pause_reason()`**（v1.2 §5.3 的第 5 级由"免打扰"改为"安静时段"）：

```rust
// 5 级：安静时段（原 dnd）
if let Some(q) = engine.active_quiet_hour() {
    return Some("quiet");
}
```

```rust
fn active_quiet_hour(&self) -> Option<&QuietHour> {
    let now = Local::now();
    let wd = weekday_index();
    self.settings.quiet_hours.iter().find(|q| {
        q.days.contains(&wd) && in_time_range(&q.start, &q.end, now.time())
    })
}
```

**回座缓冲**：安静时段从"命中"变为"不命中"的那一个 tick 里，若 `grace_sec > 0`：

```rust
// tick 开头，在 roll_day 之后
let was_quiet = self.quiet_prev;          // 上一 tick 是否处于安静时段
let is_quiet  = self.active_quiet_hour().is_some();
if was_quiet && !is_quiet {
    let g = self.last_quiet_grace;        // 记下命中时那条的 grace_sec
    if g > 0 { self.soft_land_until = Some(now + Duration::seconds(g)); }
}
self.quiet_prev = is_quiet;
```

`soft_land_until` 已能阻止出队（非空且未到点），**不需要新机制**。
注意：会议结束用的是同一字段（60 秒），两者不会同时发生（会议优先级更高，会议中恒冻结）。

**会议常驻**：`start_session(kind, minutes)` 的 `minutes` 允许 `0`（已有的 `ends_at: None` 分支）。首页开关调用 `minutes = 0`。

### A.4 命令契约变更

| 命令 | 变更 |
| --- | --- |
| `trigger_now(taskId)` | **删除**（语义废弃） |
| `preview_reminder(style, taskType)` | **新增**：开预览窗，`?preview=1`，5 秒/3 秒后自动 `hide`，不写记录、不动计时 |
| `today_records(limit)` | **新增**：`Vec<RecordRow>`（含 `id / at("14:02") / type / action / value / name_key`） |
| `delete_record(id)` | **新增**：删单条记录并 `refresh_today()` |
| `start_session(kind, minutes)` | `minutes = 0` 成为首页默认；托盘 15/30/60 仍传具体值 |
| `snapshot()` | 不变，但 `TaskView` 增 `recordCountToday`（= 已有 `count_today`，语义对齐即可），`Snapshot` 增 `quietNow: bool`、`quietEndsAt: string?` |

### A.5 全屏背景预设（8 套）

沿用任务色系，两两配对，避免用户自己调色：

| id | 渐变 | 适用 |
| --- | --- | --- |
| `dawn` | `#0EA5E9 → #6366F1` | 通用 |
| `mint` | `#059669 → #0D9488` | 眼操 |
| `dusk` | `#7C3AED → #DB2777` | 提肛（更像聊天软件背景） |
| `amber` | `#D97706 → #B45309` | 休息 |
| `night` | `#0B0F14 → #1E293B` | 极简暗 |
| `paper` | `#F8FAFC → #E2E8F0` | 极简亮 |
| `water` | `#38BDF8 → #0284C7` | 喝水 |
| `custom` | 用户图片 / GIF | — |

### A.6 前端路由与组件

```
pages/Today.tsx      重构：会议常驻开关 + 今日记录卡 + 预览提醒
pages/Tasks.tsx      改：整行可点 → TaskDetail
pages/TaskDetail.tsx 新增：详情页（含最近 7 天迷你柱 + 今日记录 + 删除）
pages/Settings.tsx   改：新增「提醒」分区入口，移除原 templates 卡
pages/Reminder.tsx   新增：设置里的提醒个性化（4 子块，折叠式）
views/PreviewView    复用 ReminderView / ToastView，加 ?preview=1 分支：
                     禁用"完成/跳过"写入，仅显示 5s/3s 倒计时自动关闭
```

**折叠规则**：`Reminder.tsx` 默认只渲染 4 行摘要，点「更多」展开该子块的细项。首屏不出现超过 12 个可交互控件。

### A.7 验收补充

| # | 场景 | 期望 |
| --- | --- | --- |
| 1 | 12:00 时水任务剩 3 分钟，午休到 13:30 | 13:31:00 起提醒（60 秒缓冲），剩余时间未重置 |
| 2 | 安静时段内点「完成一次」 | 允许，且正常写记录（用户主动行为不受冻结影响） |
| 3 | 首页点「预览提醒」 | 出现预览窗，5 秒自动消失，今日记录数不变 |
| 4 | 会议常驻 2 小时 | 托盘 `●` 前缀 + 首页横幅显示时长，**不弹任何窗口** |
| 5 | 会议常驻时点「完成一次」 | 允许（现状如此），但不产生任何提醒 |
| 6 | 任务列表点行任意位置 | 进入详情页；点 Switch 不跳页 |
| 7 | 设置里把「喝水」默认形态改为消息窗，任务设为跟随默认 | 喝水提醒变为消息窗；眼操仍是全屏 |
