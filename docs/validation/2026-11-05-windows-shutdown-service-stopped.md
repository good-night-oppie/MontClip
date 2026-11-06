# 排查记录：Windows 关机 / 注销时是否误报「内部服务意外停止了」

2026-11-05 · Cindy（只读排查，未做真实关机/注销验证）

## 结论（待实机验证）

正常关机 / 注销路径上**存在误报风险**：Electron 官方文档明确写出，在 Windows 系统关机 /
重启 / 用户注销导致应用关闭时，`before-quit`、`will-quit`、`quit` 事件**都不会发出**。而
MontClip 桌面版正是靠 `before-quit` 里的 `stopping = true` 来区分「服务正常随应用退出」和
「服务意外停止」的——这条路上 `stopping` 永远是 `false`，只要 utility process（server.js）
先于（或独立于）主进程退出，`worker.on("exit")` 就会弹出
「MontClip 的内部服务意外停止了，最近的修改可能没有保存」。

**未经真实关机/注销复现**（需要主人授权后实机验证）；下面是代码与文档层的事实链。

## 提示条出处

- 文案：`desktop/native-text.js` → `serviceStopped`（中文定稿见该文件，JJ 已审过措辞）。
- 弹出点：`desktop/main.js` 的 `worker.on("exit", …)`——`stopping` 为 `false` 时
  `dialog.showMessageBox`（标题 `serviceStoppedTitle`「MontClip 出错了」）。
- `stopping` 只在 `app.on("before-quit")` 里置 `true`（并向 worker 发
  `{type:"shutdown"}`，4 秒兜底 `worker.kill()`）。

## 三条退出路径对照

| 路径 | `before-quit` | `stopping` | 结果 |
|---|---|---|---|
| 用户关窗 / Alt+F4（正常退出） | 发出 | `true` | worker 收到 shutdown 后退出，exit 处理直接 return，**不报** |
| 强杀（VV 的 timeout 场景）：外力结束 worker/进程树 | 不发（进程已死/未走 quit） | `false` | worker 先死、主进程还活着 → **弹窗**。这是设计的崩溃告警，行为正确 |
| Windows 关机 / 重启 / 注销 | **官方不发出** | `false` | 进程结束顺序不由应用控制；worker 若在主进程还活着时退出 → **误报** |

## 事实依据

1. `desktop/main.js:402-422`：`window-all-closed` → `app.quit()`；`before-quit` 里置
   `stopping = true` 并 `worker.postMessage({type:"shutdown"})`；worker 退出后 `app.quit()`。
2. `desktop/main.js:360-367`：`worker.on("exit")` 里 `if (stopping) return;` 否则弹
   `serviceStopped` 错误框（窗口在就模态压在窗口上）。
3. `server.js:1888-1893`：服务端自身监听 SIGINT/SIGTERM、父进程 `shutdown` 消息与
   `disconnect`，正常退出路径 worker 会被妥善收尾。
4. Electron 官方 app 文档（2026-11-05 读取）：`before-quit` / `will-quit` / `quit` 三个事件均注明
   “On Windows, this event will not be emitted if the app is closed due to a
   shutdown/restart of the system or a user logout.”
   （<https://electronjs.org/docs/latest/api/app>）
5. `powerMonitor` 在 Windows 上没有 shutdown 事件（shutdown 仅 Linux），无法用它兜底。
6. Windows 侧语义（Microsoft WM_QUERYENDSESSION / WM_ENDSESSION 文档）：关机/注销先问
   `WM_QUERYENDSESSION`，随后 `WM_ENDSESSION`；Vista 起约 5 秒后强杀不响应进程。会话结束期间
   弹模态框会让应用“不退出”，可能触发 Windows 的「MontClip 正在阻止注销」界面，框本身随后被强杀。

## 建议修复方向（**未实施**，待复现确认后先写测试再改）

- 在主窗口上 `hookWindowMessage` 监听 `WM_QUERYENDSESSION`（0x11）/ `WM_ENDSESSION`（0x16）：
  收到即置 `stopping = true`（或一个等价的 sessionEnding 标志），让 worker 的 exit 不再弹框，
  并尽快向 worker 发 shutdown。Windows 给的时间很短，收尾要同步、从简。
- 或更保守：会话结束标志下，worker exit 一律不弹框（关机时没人需要读这条告警，且弹框本身
  可能阻止注销）。
- 测试切入点（不需要真关机）：`close-controller` / main 的退出状态机已有 smoke 惯例
  （`--close-crash` / `--close-timeout`），可加一个「session-ending 标志置位后 worker exit
  不弹框」的单测 / smoke。

## 没跑 / 待办

- 真实 Windows 关机 / 注销复现：**未做**（按约定需先经主人授权入口取得明确同意）。
- 若实机复现确认误报，再按上文写失败测试并修复。
