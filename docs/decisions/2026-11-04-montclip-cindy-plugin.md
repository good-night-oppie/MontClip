# MontClip 的 Cindy 插件版：一份引擎，两层壳

状态：已定（布局 B），分 7 个 PR 实施。日期：2026-11-04。
依据：可行性验证 `spike/cindy-plugin`（head `383bf1a3`）的 `docs/decisions/2026-11-04-montclip-cindy-plugin-spike.md`。spike 分支不合进 main，代码按需挑出来，每个 PR 自带测试。

## 决定

1. **独立 Windows 版和 Cindy 插件版都要。** 剪辑引擎（`server.js`、`mcp-server.js`、`app.js` 和各模块）只有一份，在仓库根；外面两层壳：
   - 壳 1：`desktop/`（Electron），内置聊天面板。
   - 壳 2：`plugins/montclip-cindy/`，插件的 Node worker 在进程内运行引擎；聊天就是 Cindy 本身，工具经 `list_tools` / `call_tool` 调 `mcp-server.js` 的同一份 `callTool`。
2. **布局 B**：剪辑器放在任务页签（`taskView`）里，跟聊天同屏，能最大化，每个任务对应自己的项目。右侧栏 `panel` 放「文稿」「属性」。`mainView` 整页看不到聊天，只做跨任务的项目总览。
3. **撤销只有一条**：在剪辑器页（`app.js`）里。外面的 Agent 经 `POST /api/ui/command` 请剪辑器执行撤销 / 重做 / 跳转。撤销栈按项目存到引擎（`/api/ui/undo-stack`），页签被 Cindy 重载后取回。
4. **一个数据目录只有一个写入方**：先启动的引擎持有 `<数据目录>/.montclip-writer.lock`，第二个指向同一目录的引擎拒绝启动并报出第一个。插件版默认用自己的数据目录。

## 拆分计划

| # | PR | 内容 |
|---|---|---|
| ① | 引擎和通信层 | `mcp-server.js` 可被 require；`/api/ui/command`；撤销栈按项目持久化；单写入方锁；`fablecut_import_media {link:true}` 硬链接导入（可选，缺省仍复制） |
| ② | 插件骨架 | `plugins/montclip-cindy/`：taskView + node worker + 本地 frame；随机 token 只放行插件页面；worker 补 `PROGRAMFILES` 等环境变量；首次打开不重复建项目 |
| ③ | 嵌入模式界面 | `?host=cindy` 隐藏自带聊天，跟随 Cindy 明暗主题，适配窄宽度 |
| ④ | 右侧栏面板 | 「文稿」做完整，再加「属性」 |
| ⑤ | ffmpeg 首次下载 | `cindy.downloads`、进度、LGPL 校验、首次引导 |
| ⑥ | 导出落盘 | 用户自选目录，进度到 Cindy 卡片 |
| ⑦ | 入口 | `montclip_open_task_view`、聊天卡片按钮、mainView 总览、引导固定到左侧导航 |

## 风险

- **回环嵌入是 Cindy 手册没写的能力。** 插件页面能用 iframe 套 `http://127.0.0.1:<端口>/`，靠的是源码里的 `ghostPanelLoopbackEmbedAllowed(manifest)`：声明了 `panel` / `mainView` / `taskView` 之一、声明了 `node`、`preview.hosts` 含 `127.0.0.1` 或 `localhost` 时，页面 CSP 追加 `frame-src http://127.0.0.1:* http://localhost:*`，子帧回到同一 host:port 的请求放行。
  - 依据：`apps/desktop/src/shared/ghost.ts` L1355 @ `v0.1.122-beta`（commit `49fbcc4d07a737d72c18c2abcedf51fe62fa5ee6`）；同目录 `electronSandboxAdapter.ts` L419–422、L441、L510–524。spike 时已在本机 Cindy 0.1.122 的 `app.asar` 里核对到同样的逻辑。
  - 随包手册（`ghost_forge_guide`）里没有这条规则，Cindy 以后的版本可能改掉。要请 Cindy 方确认是公开契约；在那之前，插件启动时若嵌入失败，要给出明白的提示，而不是空白页。
- **本机端口**：引擎只听 127.0.0.1 并查 Host / Origin，但同机其他程序也能访问。独立版用会话 token（请求头）；插件版 iframe 不能加请求头，改为 URL 里带一次随机 token、换成 cookie（PR ②）。
- **Node worker 环境变量被裁剪**：Cindy 0.1.122 的 worker 只拿到 17 个变量，没有 `PROGRAMFILES`，无头导出找不到浏览器（PR ② 修）。
- **切任务重载页签**：撤销栈靠 ① 的持久化保住；打开着的合成（comp）里的撤销、其他序列的撤销不保存。
- **两份引擎同一目录**：① 的锁拒绝第二个；锁只认进程号，进程号被复用的极少情况下会误判为占用，删掉锁文件即可。
