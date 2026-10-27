# 小满 · Sip

<p>
  <img alt="version" src="https://img.shields.io/badge/version-1.4.2-2ea44f">
  <img alt="platform" src="https://img.shields.io/badge/platform-Windows%2010%2F11%20%C2%B7%20macOS%2012%2B-blue">
  <img alt="tauri" src="https://img.shields.io/badge/Tauri-2-24C8DB">
  <img alt="license" src="https://img.shields.io/badge/license-Apache--2.0-green">
</p>

**久坐自救提醒**：把「喝水、眼保健操、提肛、起来摸鱼」拆成每次只要几十秒的小动作，到点提醒你一下，不打断手上的事。

> 小满是节气——麦粒渐满，未熟。不必一次装满，每次一小口刚好。
> 英文名 `Sip` 就是小口喝水。

## 界面

<table>
  <tr>
    <td width="50%"><img src="docs/screenshots/today.png" alt="首页"><br><sub><b>首页</b>：大号倒计时 + 完成按钮，右侧是今日流水，底部四个任务的独立计时</sub></td>
    <td width="50%"><img src="docs/screenshots/stats.png" alt="统计"><br><sub><b>统计</b>：7 / 30 天柱状图、时段分布、连续达标与跳过率</sub></td>
  </tr>
  <tr>
    <td width="50%"><img src="docs/screenshots/tasks.png" alt="任务"><br><sub><b>任务</b>：整行可点进详情，「跟随默认 / 单独设置」提醒方式</sub></td>
    <td width="50%"><img src="docs/screenshots/settings.png" alt="设置"><br><sub><b>设置</b>：主题 × 强调色 × 缩放、中英双语、安静时段</sub></td>
  </tr>
  <tr>
    <td width="50%"><img src="docs/screenshots/reminder.png" alt="全屏提醒"><br><sub><b>全屏提醒</b>：可换背景图 / GIF，8 套渐变预设，按 Esc 关闭</sub></td>
    <td width="50%"><img src="docs/screenshots/toast.png" alt="消息窗"><br><sub><b>消息窗</b>：伪装成微信 / 邮件 / 系统通知，同事路过看不出端倪</sub></td>
  </tr>
</table>

## 功能

- **多任务独立计时**：喝水（按 ml 计量目标）、眼保健操、提肛、休息，外加自定义任务；每类独立统计，互不干扰。
- **三种提醒形态**：全屏（支持自定义图片 / GIF）、消息窗（4 套皮肤，可改发送人与正文）、系统原生通知。按任务类型分别配置。
- **安静时段**：全局最多 3 条作息（默认午休 12:00–13:30），命中时冻结计时、不提醒、不计漏做；离开时段后留 60 秒缓冲，避免刚回工位就被轰炸。
- **会议模式**：一键（或 `Ctrl/Cmd+Shift+M`）屏蔽所有提醒，常驻直到手动关闭，托盘显示 `●` 角标。
- **今日记录**：流水时间轴，可删除单条纠错；首页同时给出「今日 N 次」和「下次 HH:MM」。
- **提醒预览**：在设置或首页随时预览提醒长什么样，**不写记录、不动计时**。
- **主题与语言**：深色 / 浅色 / 跟随系统 × 4 种强调色 × 3 档缩放；中文 / English / 跟随系统。

## 几个刻意为之的设计

| 取舍 | 做法 | 为什么 |
| --- | --- | --- |
| 提醒被跳过时 | **冻结不重置**（`next_due += 1s`），不是「重新数 45 分钟」 | 否则连续几次跳过就永远等不到下一次提醒 |
| 同时到点 | 优先级队列 喝水 > 眼保健操 > 提肛 > 休息，间隔 3 秒串行弹出 | 四个任务一起弹会糊满屏幕 |
| 会议中 | 一律屏蔽，**不给「喝水放行」开关** | 会议里弹什么都尴尬，多一个开关只是多一次决策 |
| 提醒配置 | 设置里按类型定默认值，任务可选「跟随默认 / 单独覆盖」 | 两处都能配，必须明确谁说了算 |
| 提醒入口 | 「立即提醒」改为「预览提醒」 | 它的语义是「看看长什么样」，不是「提前完成」；提前完成请点主按钮 |

## 技术栈

| 层 | 选型 |
| --- | --- |
| 桌面壳 | Tauri 2（Rust）+ WebView2 / WKWebView |
| 前端 | React 19 · TypeScript strict · Tailwind v4 · Vite 7（多入口：主窗 / 提醒 / 消息窗各自独立 HTML） |
| 存储 | SQLite（`rusqlite` bundled，WAL），无服务端、无网络请求 |
| 调度 | Rust 后台线程，1 秒 tick；`parking_lot::Mutex<Engine>` |
| 平台能力 | 托盘、全局快捷键、开机自启、系统通知、多显示器全屏窗、锁屏 / 前台进程检测（`windows-sys`） |

```
src/                    前端
  app/pages/            今日 / 任务 / 任务详情 / 统计 / 设置 / 提醒个性化
  views/                全屏提醒页、消息窗页（独立 HTML 入口）
  components/           任务卡、表单、图表、SVG 图标
  lib/                  store、api、mock（浏览器调试用）、类型、设计 token
  i18n/                 zh / en 词典，缺键编译期报错
src-tauri/src/
  models.rs             Task / Settings / RemindProfile / Snapshot
  db.rs                 建表、迁移、统计、记录
  scheduler.rs          调度引擎（冻结 / 队列 / 优先级 / 安静时段 / 会议）
  windows.rs            全屏窗、消息窗、预览窗
  platform.rs           Windows 前台进程 / 锁屏检测
docs/                   PRD、技术设计、需求评审、截图
```

## 开发

```bash
npm install

npm run tauri dev   # 桌面端热重载
npm run dev         # 只跑前端：http://localhost:1420（用 mock 数据，方便调 UI）
```

前端有一套 mock 层，浏览器里也能跑完整界面（`src/lib/mock.ts`），不依赖 Rust 端。

## 构建

```bash
npm run tauri build
```

| 平台 | 产物 |
| --- | --- |
| Windows | `src-tauri/target/release/bundle/nsis/Sip_<version>_x64-setup.exe`、`.../msi/*.msi` |
| macOS | `src-tauri/target/release/bundle/dmg/*.dmg`（需在 macOS 上执行，无法交叉编译） |
| 免安装 | `src-tauri/target/release/sip.exe` |

## 数据与隐私

全部本地，不上传任何东西。

| 平台 | 路径 |
| --- | --- |
| Windows | `%APPDATA%\com.sip.desktop\sip.db` |
| macOS | `~/Library/Application Support/com.sip.desktop/sip.db` |

自定义背景图复制到同目录的 `media/`；设置页有「打开数据目录」按钮。

> **从旧版 Ticker（≤ v1.3）升级**：标识符变了，首次启动会自动把
> `com.ticker.desktop/ticker.db` 与 `media/` 复制到新目录（只复制不删除），
> 看到日志 `[sip] 已从旧版本目录迁移数据` 即成功，确认后可手动删掉旧目录。

## 快捷键

| 快捷键 | 作用 |
| --- | --- |
| `Ctrl/Cmd + Shift + M` | 开关会议模式 |
| `Ctrl/Cmd + Shift + H` | 唤起主窗口 |
| `Ctrl/Cmd + Shift + X` | 强制关闭当前提醒（逃生键，任何时候都能用） |
| `Esc` / `Enter` | 全屏提醒中关闭 / 确认完成 |
| 鼠标左键 | 全屏提醒中点击任意位置关闭 |

## 已修复的问题（v1.4.2）

这一版集中修了「全屏提醒卡、部分任务不提醒 / 互相打架、窗口关不掉 / 退不掉」三组问题：

| 症状 | 根因 | 修法 |
| --- | --- | --- |
| **打包后的程序提醒页是空屏，倒计时不跑也不自动关** | `Cargo.toml` 缺 `custom-protocol` 特性，`WebviewUrl::App` 被解析成 `http://localhost:1420`（Vite 开发服务器）。装到没有 dev server 的机器上，提醒页永远加载不出来 —— 于是「卡住 + 其它提醒全被压住」 | 补上 `custom-protocol = ["tauri/custom-protocol"]`；统一用 `npm run tauri:build` 出包。日志里 `[window] 提醒窗 … url=http://tauri.localhost/…` 才是对的 |
| 全屏提醒卡顿 | 提醒窗用了 `transparent(true)`，整屏透明分层窗口在 Windows 上走软件合成，每帧都贵 | 改成不透明窗 + 深色底；消息窗只有 404×152 才保留透明 |
| 提醒窗关掉后仍占资源 | 关闭时调的是 `hide()`，WebView 被藏起来但每秒倒计时和动画还在跑 | 全部改为 `destroy()`，用完即销 |
| 只有第一个任务会提醒，其它任务等不到 | ①`pending` 在窗口还没建好时就写进去了，下一秒被误判「窗口已消失」；②回收超时只按提醒配置算，眼睛（120s）、远眺（300s）这种任务的动作时长被忽略 | `pending` 改为**建窗成功后**再登记；上限取 `max(提醒配置, 任务动作时长, 自动关闭秒数) + 40s` |
| 眼保健操还开着，喝水又盖上来 | 出队时给了 60 秒宽限，上一个没关也能弹下一个 | 改成严格的单提醒串行：`pending` 有人就绝不弹第二个；关掉后留 3 秒静默期 |
| 连续弹出两个提醒 | 销毁是异步派发，紧接着建同名窗口会撞 `already exists` | 建窗前轮询等待旧窗消失（≤600ms） |
| 界面卡住 / 关不掉 / 退不掉 | `on_window_event`（主线程）里抢 `ENGINE` 锁，与调度线程互等死锁；且前端根本没有「退出」入口，只能靠托盘 | 改为原子变量；退出先销毁所有窗口再 `exit(0)`，2 秒没退干净强制结束进程；设置页新增「退出小满」按钮 |
| 某些机器一直不提醒 | 锁屏检测单次失败就判定锁屏，把所有提醒冻结 | 连续 3 秒才判锁屏；可用 `SIP_IGNORE_LOCK=1` 绕过排查 |
| 全屏提醒关不掉（无按钮可用） | 窗口 `closable(false)`，页面数据没到位时只剩背景 | `Esc`、点击任意位置、`Alt+F4`、`Ctrl/Cmd+Shift+X` 四种方式都能关 |
| 提醒一闪就记录完成 | 倒计时初值 0 与「归零即完成」的 effect 同批执行 | 加 `armed` 标志，倒计时初始化后才允许触发归零逻辑 |

## 排查手段

程序把关键状态都写进标准错误日志，出问题先看日志：

```bash
# Windows：从命令行启动即可看到日志
sip.exe
```

| 日志 | 含义 |
| --- | --- |
| `[sip] 诊断 locked=… whitelist_hit=…` | 启动时的锁屏 / 前台白名单判定 |
| `[scheduler] 弹出提醒 <id> type=… style=…` | 这一次该弹谁、用什么形态 |
| `[window] 全屏提醒已显示 reminder_0 … 用时…ms` | 窗口建成功及耗时（>500ms 就要留意） |
| `[window] 提醒窗 reminder_0 1.5s 后 url=…` | **页面是否真的加载了**。`url=http://tauri.localhost/…` 才是正常；出现 `localhost:1420` 或一直是 `about:blank` 就是打包特性没开对 |
| `[scheduler] pending 回收 pid=… reason=窗口已消失/超时` | 自愈生效，回收了残留窗口 |
| `[scheduler] 暂停状态 -> locked/quiet/whitelist/session` | 为什么没提醒 |
| `[watchdog] 主线程响应耗时 …ms` | 主线程被卡住（= 会表现为界面卡顿） |
| `[ui] …` | 提醒页/消息窗自己的状态（挂载、拿到数据、倒计时、关闭） |

环境变量（仅排查用）：`SIP_IGNORE_LOCK=1` 忽略锁屏判定；`SIP_QUIT_AFTER_SEC=N` N 秒后自动退出（验证退出是否可靠）。

## 已知限制

- macOS 版需在 macOS 上自行构建；Linux 未适配。
- 会议模式是手动开关，没有做「检测到腾讯会议 / 摄像头占用就自动进入」。
- 开机自启从旧版升级后，注册表 `Run` 里可能残留旧的 `ticker` 项，去设置里把自启关一次再开一次即可覆盖。

## 文档

- [产品需求文档（PRD）](docs/PRD.md)
- [技术设计文档](docs/DESIGN.md)
- [需求评审记录 v1.3](docs/需求评审-v1.3.md)

## 致谢与许可

基于 [rock-zhang/Shui](https://github.com/rock-zhang/Shui)（Apache-2.0）二次开发：托盘、多屏全屏窗与锁屏检测的实现思路来自该项目，前端与调度引擎为本项目重写。详见 [NOTICE](NOTICE)。

本项目采用 [Apache License 2.0](LICENSE)。

---

<details>
<summary>English</summary>

**Sip** is a tiny desktop companion for people who sit too long. It reminds you — every 45 minutes, or whatever you set — to drink water, rest your eyes, do a Kegel set, or just slack off for a minute.

- Multiple independent timers, each with its own stats
- Three reminder styles: fullscreen (custom image / GIF), disguised message popup (WeChat / mail / system skins), native notification
- Quiet hours (lunch break by default) that freeze timers instead of resetting them, with a 60-second grace period after you're back
- Meeting mode: one switch mutes everything
- Fully local: SQLite, no network, no telemetry
- Chinese / English UI, dark / light themes

Built with Tauri 2 + React 19 + Vite 7.

```bash
npm install && npm run tauri dev    # develop
npm run tauri build                 # package
```

</details>
