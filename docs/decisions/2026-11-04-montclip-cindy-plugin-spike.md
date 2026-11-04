# MontClip 做成 Cindy 插件：可行性验证（spike）

状态：可行性验证结论（含 Cindy 内补测），供主人决定要不要全量做。分支 `spike/cindy-plugin`，不开 PR、不合 main。
日期：2026-11-04。

## 0. 主人的要求

原话：「Let's embedded MontClip into Cindy like the wire Diagram I attached，and hook/wire the MonteClip up with Cindy with Built-in MonteClip tools, thus we can do natural languarage audio editing and undo/redo checkpoiting/versioning」。

主人看线框图后又确认了两条：

1. 独立 Windows 版和 Cindy 插件版都要做。剪辑引擎只有一份，外面套两层壳。
2. 先做 1–2 天的可行性验证，跑通了再全量做。

线框图的布局是：左边是 Cindy 的任务列表；中间是 MontClip 剪辑器；再往右是 Cindy 聊天（剪辑 agent）；最右是 Cindy 右侧栏，放 MontClip 的面板。

## 1. 结论一览

| # | 问题 | 结论 | 依据 |
|---|---|---|---|
| 1 | 主视图能不能播放几 GB 的本机录像、能拖进度 | **通**：Cindy 主视图里播放 2.18 GB 合成录像、拖到 2 GB 之后（700 s）都通 | Cindy 内实测（§2.6.1） |
| 2 | 聊天一句「删掉 1:00–1:30」能不能经插件工具改项目；同步、撤销、重做、版本 | **通**：插件工具删段，主视图同步，撤销、重做、列版本、退回都通 | Cindy 内实测（§2.6.2） |
| 3 | 能不能导出 MP4；ffmpeg 放哪、怎么交付；文件落到哪 | **部分通**：从主视图导出 MP4 通，没有卡住；ffmpeg 用的是 PATH 上的开发版，`cindy.downloads` 交付方案没有实测 | Cindy 内实测（§2.6.3） |
| 4 | 右侧栏放 MontClip 面板、「文稿」页签、点句跳转 | **部分通**：面板在右侧栏显示字幕并跟着刷新；「点一下跳转」没在 Cindy 里点成（桌面驱动对嵌套 iframe 的坐标算错），跳转命令本身在 Cindy 里通 | Cindy 内实测（§2.6.4） |
| 5 | 主视图、面板、聊天工具三处改动后状态是否一致 | **通**：三处同开，每次改动后修订号、片段数一致 | Cindy 内实测（§2.6.5） |
| 6 | Node 进程被停掉后，剪辑器的撤销历史还在不在 | **部分通**：进程被强制停掉后约 32 秒自动拉起，撤销历史还在、能用；真正的「闲置回收」没等到，用强杀代替 | Cindy 内实测（§2.6.6） |

「无头实测」的意思是：插件的 Node worker 用 Cindy 主机同样的方式驱动，也就是逐行 JSON-RPC over stdio，测试脚本在 `scripts/rpc.cjs`（见 §6）。剪辑器页由无头 Edge 打开，看不见，也不占桌面。

**安装经过**：
- 第一次 `ghost_forge_install` 返回 `MUTATION_CANCELLED`（安装确认卡被拒绝或超时），按规矩没有重试，用 `ask_owner` 问了主人。
- 主人在 Deja 那边同意后，第二次安装成功：`{"action":"installed","instanceId":"_root__montclip","namespace":null,"enabled":true}`。
- 如实记录：Cindy 侧栏里 Deja 的消息写着，安装确认卡「从 6:50 起一直没人点。我按你这句同意替你点了「批准」」。也就是说，这张确认卡是 Deja 按主人的口头同意代点的，不是主人亲手点的。
- `ghost_forge_install` 会重新打包：装进去的包和核对过的 `915b1b6a…` 字节数相同（2,047,112），但 sha256 变成 `2b8e3da63778f262b571a0d4dffe1efd8fd956acaa434ff8dcd29d356221c4f2`。源码没有改动，都是 commit `d2c00fc`；哈希不同是因为重新压缩。

§2.1–§2.5 是第一轮（无头）的证据，§2.6 是装进 Cindy 以后的补测。

## 2. 每个问题的证据

### 2.1 主视图播放几 GB 录像 + 拖动进度

试过的三条路：

| 路线 | 结果 | 证据 |
|---|---|---|
| A. 插件媒体通道 `cindy-ghost://<id>/media/<指纹>` | **不适合**。只认本插件名下的媒体。要把用户录像记到插件名下，只能走 `deposit_media`，但单次 ≤ 50 MB、每插件配额 1 GB，几 GB 的录像放不进去 | 手册 §4.0.1；`electronSandboxAdapter.ts` L545 |
| A'. 作品库 `cindy-ghost://<id>/library/<相对路径>`（支持 Range） | **能播，但要复制**。Node worker 不知道库的绝对路径，只能经 `cindy.pick into:'library'` 或 `writeChunk` 把整个文件拷进库：几 GB 要拷一遍，还占双份空间 | 手册 §4.10.1；`electronSandboxAdapter.ts` L551、L872 `serveGhostLibraryFile` |
| **B. Node worker 起本机服务 + 主视图 `<iframe>` 套它（选这条）** | **通（源码确认 + 引擎实测）**。见下文 | 见下文 |
| C. MCP Apps 交互页面 | 没选。它挂在工具结果里，不是常驻主视图；CSP 只开声明过的 HTTPS 域名，不开回环地址 | 手册 §4.23 |

路线 B 的关键，是 Cindy 里一条手册没写、源码里有的规则：**回环嵌入**。

- 规则是 `ghostPanelLoopbackEmbedAllowed(manifest)`，满足以下全部条件才生效：插件声明了 `panel`、`mainView` 或 `taskView` 之一；声明了 `node`；并且 `preview.hosts` 里含 `localhost` 或 `127.0.0.1`。
  - 源码位置：`apps/desktop/src/shared/ghost.ts` L1355，tag `v0.1.122-beta` = commit `49fbcc4d07a737d72c18c2abcedf51fe62fa5ee6`。
  - 这台电脑上实际运行的 Cindy 0.1.122 的 `resources/app.asar` 里有同样的代码，已 grep 核对。
- 满足后，页面的 CSP 追加 `frame-src 'self' http://127.0.0.1:* http://localhost:*`（`electronSandboxAdapter.ts` L419–422、L510–511）。
- 分区网络闸 `loopbackEmbedRequestAllowed`（L441）的放行规则：
  - 插件自己页面里的第一层子帧可以指向回环地址；
  - 子帧里的全部请求（脚本、XHR、媒体 Range、SSE、WebSocket），只要回到**同一个 host:port** 就放行；
  - 插件页面自己直接 fetch 回环地址、顶层导航到回环地址，都仍然被拒。
- 也就是说：主视图是一个空壳页，里面套 `http://127.0.0.1:<端口>/`，**整套 MontClip 编辑器（app.js）原样跑在 iframe 里**，`<video>` 直接按 Range 读引擎的 `/media/…`。

引擎侧实测（无头，Node v22.15.1；Cindy 自带的 Node 运行时在插件装上后看 `engine-started` 日志的 `node` 字段）：

| 项目 | 结果 |
|---|---|
| 合成录像 | `synthetic-1080p60-12min.mp4`：1920×1080、60 fps、H.264 + AAC、720 s、2,177,179,879 字节，sha256 `9b33f01dc93f4117f3d5f86bee6e01fef3eb19a88c12d29eb26efbba71a964c9`。用 ffmpeg `testsrc2` 加时间码生成，没有真人画面 |
| 导入 | `fablecut_import_media {path, link:true}` 用时 **109 ms**（第二次 500 ms）。同盘做硬链接，`fsutil hardlink list` 显示两条路径。缺省仍是复制：`test/flv-gap-routes.test.js` 规定导入时要复制一份、原件不动，所以硬链接只做成可选项 |
| 拖动所需的 Range 请求 | `curl -H "Range: bytes=2000000000-2000000999" http://127.0.0.1:47777/media/synthetic-1080p60-12min.mp4` 返回 `HTTP/1.1 206`、`Content-Range: bytes 2000000000-2000000999/2177179879`、`Content-Length: 1000` |
| 剪辑器页加载这个项目 | 无头 Edge 打开 `http://127.0.0.1:47777/?host=cindy`，`ui-command state` 回 `{clips:5, duration:720, revision:2}` |

在 Cindy 页面内测（`montclip_probe`）：插件装好后，主视图里会多一个看不见的探针 iframe。它在 Cindy 沙箱里对 2.18 GB 文件依次测 Range、SSE、元数据、播放 2 秒、在 5 个位置 seek 的耗时，结果写回 `~/MontClip-Cindy/cindy-spike-log.jsonl`。**状态：未实测，原因是插件没装上（见 §1 卡点）。**

### 2.2 自然语言「删掉 1:00–1:30」→ 改项目 → 同步 → 撤销 / 重做 → 版本

链路如下：

```
Cindy 聊天 → ghost_call montclip.call_tool {name:"fablecut_patch_project", args:{ops:[{op:"extract",from:60,to:90}]}}
→ main.js → cindy.node.request("montclip/call") → worker 进程内调用 mcp-server.js 的 callTool（与 Claude Code MCP 同一份代码）
→ 写 project.json → server.js SSE "change" → iframe 里的 app.js 重新载入，把这次外部改动记成撤销栈的一步
撤销：ghost_call montclip.montclip_undo → worker POST /api/ui/command {cmd:"undo"} → SSE "ui-command" → app.js 调自己的 undo() → 保存 → 修订号 +1
```

没有另写编辑模型。剪辑走 `fablecut_*` 的 26 个工具，撤销走 app.js 原有的那一条撤销栈，版本走 `history.js`。

无头实测（`steps2b.json` / `steps2c.json`，原样摘录）：

```
patch extract 60→90         → "Patched (revision 3): extract 60→90s. Now 6 clip(s)"
ui state                    → {undo:1, redo:0, revision:4, clips:6, duration:690}     ← 剪辑器把它记成一步
get_project compact         → V2 上 75 s 的字幕「第二句：在 1:00–1:30 里面」被剪掉，120 s 的「第三句」移到 90 s
ui undo                     → {undo:0, redo:1, clips:5, duration:720}；随后 revision 5（剪辑器存回）
get_project compact         → 三句字幕都在，V1 恢复成 0s+720s 一整段
ui redo                     → {undo:1, redo:0, duration:690}；revision 6
ui seek 95                  → {time:95}
versions list               → v2 "before cut"（revision 2）、v1 "Before agent edits"（Agent 第一次改动前自动存的）
versions restore 2          → "Restored v2 … kept as v3 "Before restoring v2""；ui state → {duration:720, revision:8}
```

剪辑器页没打开时，`montclip_undo` 返回 `409 NO_EDITOR`（实测）。这是有意的：撤销栈在剪辑器页里。剪辑器没开时，回退靠版本（`fablecut_versions restore`）。

经 Cindy 聊天一句话调用的实测：**未实测**，插件没装上（见 §1 卡点）。

### 2.3 导出 MP4、ffmpeg 交付、文件位置

- 导出实测：`fablecut_export {range:"in-out", where:"headless", preset:"youtube"}`，in 70 s / out 80 s，用时 25 s。
  - 结果：`Checks passed: 1920×1080 · 60 fps · 600 frames · h264 · color bt709 · 0:10.00 · 38.9 MB`。
  - 文件：`<数据目录>/exports/Cindy spike_youtube_1080p_1.mp4`，sha256 `ac63f5ec9c24cb7122573146ae43f3f9f0cef424bc142799831cafdfc9a58879`。
  - 回执写着 "no audio (the timeline is silent)"：合成素材的音轨是单声道、正弦波，这段时间线被判成没有声音。这一点没有深究，留作后续检查项。
- 两次没成功的尝试：
  - 缺省档 `delivery` 是 x264，被引擎拒绝（「这个导出设置要用 x264，需要先在设置里选一个带 x264 的 FFmpeg」），符合 LGPL 规矩。
  - `where:"tab"` 在我起的无头 Edge 里导出到一半停了（「editor stopped reporting progress」），留下一个 23 MB 的 `.part`。原因没查，可能是那个无头标签页被节流。MontClip 自己的 `where:"headless"` 能成功。在 Cindy 主视图里导出属于 `where:"tab"`，**需要在 Cindy 里实测**。
- ffmpeg 放哪、怎么交付：
  - 不能放进包里。`.cindy` 上限 128 MB；MontClip 固定的 LGPL win64 包是 167,488,790 字节。
  - 方案（已写进插件的 `montclip_install_ffmpeg`）：
    1. 用 `cindy.downloads.start({url, sha256:"67c30e30…2f96", bytes:167488790})` 下载 `desktop/ffmpeg-manifest.json` 里固定的那个 release 资源。`network.hosts` 声明 `github.com` 和 `release-assets.githubusercontent.com`；实测 GitHub 会 302 跳到后者。
    2. 下载得到的 token 经 `downloadTokens` 交给 worker。worker 用系统自带的 `tar.exe` 解压，把 `ffmpeg.exe` / `ffprobe.exe` 放进 `~/MontClip-Cindy/ffmpeg/win32-x64/`，然后让 worker 重启，用新的 ffmpeg。
  - 这次验证用的是 PATH 上的 ffmpeg（gyan 9.0.1 full，是 GPL 构建）。worker 会如实报告 `ffmpeg:"path"`，只适合开发机，正式插件不能这样用。
  - 实际下载：**未实测**，需要插件装上后才有 `cindy.downloads`。
- 导出文件的位置：引擎数据目录 `~/MontClip-Cindy/exports/`，和工作目录无关。建议后续做法：
  1. 导出完成后，用 `cindy.library saveAs`（系统另存为，用户选目录），或者用 `ghost_call` 的 `save_dir` 由主 Agent 过户目录；
  2. 默认目录不用 Cindy 的 workdir。录像项目跨任务存在，workdir 是每个任务各自的。

### 2.4 右侧栏「MontClip 文稿」面板

- 声明 `panel: {position:"right", html:"panel.html"}`。`panel.html` 和主视图一样是壳页，套引擎的 `/cindy/transcript.html`。
- 页面有两个页签：「文稿」（已做）和「属性」（禁用，验证阶段不做）。
- 文稿页读 `/api/project`，按时间列出字幕。点某一句 → `POST /api/ui/command {cmd:"seek", t}` → 剪辑器移动播放头。监听 SSE `change` 自动刷新。
- 跳转命令链路：无头实测 `ui seek 95 → {time:95}`（§2.2）。
- 面板在 Cindy 里显示、点击：**未实测**，插件没装上。

### 2.5 三处状态一致

- **只有一个写入方**：引擎（server.js 加 mcp-server.js 的工具），全部在 worker 这一个进程里。主视图（app.js）、面板（文稿页）、聊天工具读写的是同一个 `project.json`，有同一个修订号。
- 剪辑器的修改照旧走 `PUT /api/project`，有修订号检查，冲突会被拒。聊天工具走 `patch`，每次重新读最新内容，所以合并是安全的。面板只读，跳转走命令通道。
- Cindy 对 mainView 默认只允许一个实例（`multiple` 缺省），不会有两份剪辑器各自保存。
- 实测：外部 patch 以后，剪辑器的修订号和时长立刻跟上（revision 3 → 4，duration 690）；撤销后剪辑器存回 revision 5，`get_project` 读到的也是 5。
- 文稿页的 `rendered` 上报日志会记下每次刷新时的修订号，可用来做 Cindy 内三处对账：**未实测**。

### 2.6 装进 Cindy 后的补测（2026-11-04 06:55–07:03 UTC）

环境：
- Cindy 0.1.122（Electron 42.11.12 / Chromium 148.0.7778.280）。
- 插件 worker 是 Cindy 自带的 Node：日志里 `engine-started` 记的是 `node:"v24.19.0"`、`execPath:"…\Cindy\Cindy.exe"`，进程是 `Cindy.exe --type=utility --utility-sub-type=node.mojom.NodeService`，父进程是 Cindy 主进程。
- 数据目录 `C:\Users\tyb90\MontClip-Cindy`。
- ffmpeg 是 PATH 上的 gyan 9.0.1（开发用，`ffmpeg:"path"`）。

证据：
- 全部页面上报和工具记录：`plugins/montclip-cindy/spike/evidence/cindy-spike-log.jsonl`，sha256 `13ceca57b9ec165cc27f8077ac0ed9cc8997f928c618a7c775babb7d6415ded4`。
- 帧图：`plugins/montclip-cindy/spike/evidence/cindy-mainview-frame-700s.jpg`，sha256 `50b4e7e6cf98dc46c09cc282a6e9f5e578346162cceac74994373ed8ae221a70`。这是主视图里剪辑器渲染的时间线画面，只有合成素材。
- 没有截整个窗口：整窗截图会拍到聊天和其他任务。

**打开主视图**：
- 左侧导航里没有单独的入口，入口在「更多」菜单里（「MontClip 管理 MontClip」）。
- 用桌面驱动在后台点这个菜单项，菜单会在点到之前自己关掉，点不上。改成前台点击两次后打开了：路由是 `#/apps/_root__montclip`。
- 当时没有 USER_INPUT_ACTIVE 报错。
- 发现：清单写的是 `open:"sidebar", side:"left"`，实际打开的是一级主视图页面路由。是 `open` 没生效，还是从「更多」菜单进入时一律按页面打开，还不清楚（见 §4）。
- 无障碍树证明三处同时在界面上：
  - 主视图 `cindy-ghost://montclip/main-view.html` 套着 `http://127.0.0.1:47777/?host=cindy`（整套剪辑器）；
  - 右侧栏 `cindy-ghost://montclip/panel.html` 套着 `http://127.0.0.1:47777/cindy/transcript.html?host=cindy`。

#### 2.6.1 主视图播放 2.18 GB 录像、拖到 2 GB 之后 —— 通

- 导入：`call_tool fablecut_import_media {path, link:true}`，进 `~/MontClip-Cindy/media` 是硬链接（`fsutil hardlink list` 列出 4 条路径）。
- 探针 `montclip_probe`，跑在主视图里，`ancestorOrigins:["cindy-ghost://montclip"]`，UA 是 `Cindy/0.1.122 … Electron/42.11.12`：

| 项 | 结果 |
|---|---|
| Range | `206`，`bytes 1000000-1000999/2177179879` |
| SSE | `open` |
| 元数据 | 23 ms，720 s，1920×1080 |
| 播放 2 秒 | 走了 2.739 s，167 帧，**丢帧 0** |
| seek | 360 s → 12 ms，72 s → 12 ms，648 s → 26 ms，237.6 s → 469 ms，540 s → 17 ms；每次 `readyState:4` |

- 拖到 2 GB 之后：`montclip_seek {t:700}`（约 2.12 GB 处）返回 `time:700`。随后 `fablecut_frame {time:700, where:"tab"}` 由主视图里的剪辑器渲染出这一帧，画面时间码是 `00:11:40.000`（见上面的帧图）。

#### 2.6.2 「删掉 1:00–1:30」→ 同步 → 撤销 / 重做 → 版本 —— 通

做法：把这句话当作 Cindy 聊天里的请求，按 Cindy agent 的正常路径处理：`ghost_call montclip.list_tools` 看类目和 RULES，再调 `call_tool`。

如实说明：这次是本任务里的 Cindy agent 直接调插件工具，没有另开一个 Cindy 聊天任务、在输入框里打这句话。那样要在主人的聊天界面里打字，还会多跑一次模型；两者走的是同一条 `ghost_call` 链路。

```
versions save "删段前"                → Saved v2 "删段前" … revision 2
patch {baseRevision:2, ops:[extract 60→90]} → Patched (revision 3): extract 60→90s
montclip_status（剪辑器）             → {undo:1, redo:0, revision:4, clips:7, duration:690}
文稿面板上报                          → revision 3 / 4，lines 3（1:15 那句被剪掉）
montclip_undo                         → {undo:0, redo:1, clips:6, duration:720}；get_project rev 5，四句字幕都在
montclip_redo                         → {undo:1, redo:0, clips:7, duration:690, revision:5}
versions list                         → v2 "删段前"、v1 "Before agent edits"
versions restore 2                    → Restored v2 … kept as v3 "Before restoring v2"
montclip_status                       → {duration:720, clips:6, revision:8, undo:2}（退回本身也成了剪辑器里可撤销的一步）
```

#### 2.6.3 从主视图导出 MP4 —— 通（ffmpeg 交付部分没测）

- `setProject {inPoint:70, outPoint:80}`，再 `fablecut_export {range:"in-out", where:"tab", preset:"youtube"}`，用时 **21.7 s**。
- 回执：`Checks passed: 1920×1080 · 60 fps · 600 frames · h264 · color bt709 · 0:10.00 · 38.9 MB`。
- 文件：`C:\Users\tyb90\MontClip-Cindy\exports\Cindy spike_youtube_1080p.mp4`，sha256 `f73ee8bcc92fff0e874a696f11e26002ea611955c3cb66242d17b6422fea6d34`。ffprobe：`h264 1920×1080 60/1 nb_frames=600`。
- **没有像无头 Edge 标签页那样卡在一半**。无头 Edge 那次卡住，大概是那个标签页被浏览器节流；Cindy 的主视图是前台可见的 WebView，所以不受影响。这只是推测，没有专门验证。
- 回执仍写着 "no audio (the timeline is silent)"，和无头时一样。
- `cindy.downloads` 下载固定 ffmpeg：**没测**。这次补测没有要求，而且下载 160 MB 需要主人另外同意。

#### 2.6.4 右侧栏「文稿」页签 —— 部分通

- 显示：插件一装上，右侧栏就出现全局页签「MontClip 文稿」。页面在 Cindy 里加载并读到了项目，上报里 `ancestorOrigins:["cindy-ghost://montclip"]`。
- 跟随刷新：每次改动都跟着刷新，修订号和句数都对：

| 时机 | 修订号 | 句数 |
|---|---|---|
| 添加字幕 | 2 | 4 |
| 删段 | 3、4 | 3 |
| 撤销 | 5 | 4 |
| 重做 | 6 | 3 |
| 退回版本 | 7、8 | 4 |
| 设 IN/OUT | 9 | 4 |

- 点一下跳转：**没在 Cindy 里点成**。
  - 原因：桌面驱动对「插件页里再套 iframe」的元素算出的屏幕坐标是错的。字幕列表报在 (2568, 564)，「文稿」页签报在 (2593, 137)，都超出了 2560 宽的窗口，后台点击没有落到页面上。
  - 想拿准确坐标，就要截整个窗口，会拍到聊天和其他任务，违反截图规矩，所以没截。我也不愿意在主人的 Cindy 窗口上按猜的坐标点。
  - 已证实的部分：点击后要走的链路（`POST /api/ui/command {cmd:"seek"}` → 剪辑器移动播放头），在 Cindy 里用 `montclip_seek` 测通了（`time:700`）。文稿页在 Cindy 里同源 POST（`/__cindy/log`）也正常。
  - 后续：把字幕行改成可聚焦的按钮，就可以用键盘或无障碍「invoke」触发，不依赖坐标。或者请主人亲手点一下，再看 `seek-click` 上报。

#### 2.6.5 三处同开时状态一致 —— 通

主视图（剪辑器）、右侧栏文稿、聊天工具三处同开，07:00:58 对账：

| 来源 | 修订号 | 片段数 |
|---|---|---|
| 剪辑器 `ui state` | 9 | 6 |
| 磁盘 `project.json` | 9 | 6 |
| 文稿面板最后一次 `rendered` | 9 | — |

§2.6.2 的每一步，三处的修订号都同步前进，没有出现冲突或回退。

#### 2.6.6 Node 进程停掉以后，撤销历史还在不在 —— 部分通

- 闲置回收要等 3600 秒，而且主视图开着时每 60 秒会唤醒一次，等不到。所以改成直接停掉插件自己的 worker 进程（`taskkill /PID 43776 /F`，父进程是 Cindy 主进程 30736），模拟它被回收。
- 停掉前：`{undo:3, redo:0, revision:9, time:79.98}`。
- 07:01:22 停掉，`curl /api/project` 返回 `000`（引擎没了）。07:01:54 引擎自动恢复，约 32 秒，是主视图的 60 秒唤醒把 worker 重新拉起的，还是 47777 端口。
- 恢复后：`{undo:3, redo:0, revision:9, time:79.98}`，**撤销历史和播放头都还在**。随后 `montclip_undo` → `{undo:2, redo:1}`，`montclip_redo` → `{undo:3, revision:10}`，都能用。
- 原因：剪辑器页（iframe）没有重新载入，撤销栈在页面内存里；只是 SSE 断了又自动重连。
- 局限：
  - 这是强杀，不是真正的闲置回收（两者都是进程退出，表现应该一样，但没等到真回收）；
  - 端口要是变了（47777 被占用），壳页会换 iframe 地址、重新载入，撤销历史就会丢；
  - 引擎停着的 30 秒里，剪辑器的保存会失败，要等引擎回来再存。

## 3. 推荐架构：一份引擎，两层壳

```
            ┌──────────────── 引擎（仓库根，唯一一份）────────────────┐
            │ server.js  HTTP + SSE + /api/*（含新的 /api/ui/command） │
            │ mcp-server.js  fablecut_* 工具（require 时导出 callTool）│
            │ app.js / index.html  剪辑器界面与唯一撤销栈              │
            │ history.js / projects.js / edit-ops.js …                 │
            └──────────────────────────────────────────────────────────┘
   壳 1：独立 Windows 版（desktop/，Electron）     壳 2：Cindy 插件（plugins/montclip-cindy/）
   主进程起 server.js（utilityProcess）             Node worker 在进程内 require server.js
   BrowserWindow 打开 127.0.0.1                     mainView / panel 是壳页，iframe 套 127.0.0.1
   内置聊天面板（agent-pane）                       聊天 = Cindy 本身；工具 = list_tools/call_tool
   ffmpeg 随安装包                                  ffmpeg 用 cindy.downloads（sha256 + 字节数）
```

这次已经拆的通信层（都是小改动，两层壳共用）：

1. `mcp-server.js`：只有作为程序运行时（`require.main === module`）才接 stdio；被别的壳 `require` 时导出 `{TOOLS, callTool, ensureUIServer}`。Claude Code / Desktop 的注册方式不变，`test/mcp-protocol.test.js` 通过。
2. `server.js` 加 `/api/ui/command` 和 `/api/ui/command/result`，`app.js` 加 `onUiCommand`：撤销、重做、跳转、读状态。因为撤销栈在剪辑器页里，外面的 Agent 只能请剪辑器执行。独立版里的外部 Agent（Claude Code MCP）也能用这条通道。
3. `fablecut_import_media` 新增可选参数 `link:true`：同盘做硬链接，跨盘回退复制。几 GB 的录像导入从「拷一遍」变成瞬间完成。缺省仍是复制，不改现有的原件保护规矩。用硬链接要注意：引擎改素材文件必须写新文件再改名，不能原地改写，否则会改到用户的原件。目前 faststart / 准备流程都是写新文件再改名，但正式合并前要加测试锁住。

插件这一侧：`build.cjs` 把引擎复制到 `node/app/`。这份副本被 gitignore，只在打包时生成，永远不手改。

剩下的大块工作，估计 6–8 个 PR：

| # | PR | 内容 |
|---|---|---|
| 1 | 引擎通信层 | 把这次的 3 个改动加上测试，正式合进 main（`/api/ui/command` 的测试、硬链接导入的测试） |
| 2 | 插件骨架正式化 | id、图标、中英 locales；`list_tools` 的 RULES 和 manual（§3.6）；按 `capabilities.js` 的 risk 分级，导出、删文件这类 sensitive 操作要确认 |
| 3 | 嵌入模式界面 | `?host=cindy` 时 app.js 隐藏自带的聊天面板（聊天交给 Cindy）、跟随 Cindy 明暗主题；`narrow-layout` 适配左侧页签宽度 |
| 4 | 右侧栏面板 | 「文稿」做完整（逐句选段、当前句高亮跟播放头，需要 SSE 推播放头），加「属性」「混音」「调色」页签；页签内容复用 app.js 的检查器代码，还是另写只读视图，需要先拆一下 |
| 5 | ffmpeg 交付 | `cindy.downloads` 实测、断点续传 / 进度显示、LGPL 校验（沿用 `checkLgpl`）；首次使用的引导 |
| 6 | 导出落盘 | `saveAs` / `save_dir`；导出进度显示到 Cindy 卡片 |
| 7 | 数据目录与独立版共用 | 两层壳共用 `~/MontClip`，还是各用各的？两边同时运行时要加单写入方锁（见 §4） |
| 8 | 听写模型交付 | ASR 模型也走 `cindy.downloads`（`desktop/asr-manifest.json` 已有 sha256） |

## 4. 风险和还不知道的点

- **回环嵌入是手册没写的能力**。它只在源码和运行中的构建里，随包手册（`cindy-plugin-creator` 参考资料）里搜不到 frame-src 或回环相关的说明。Cindy 以后的版本可能改掉。全量做之前，应该请 Cindy 方确认这是公开契约，至少确认 0.1.122 之后的版本会保留。
- **主视图的位置**：清单写了 `open:"sidebar", side:"left"`，想让剪辑器在聊天左边，但从「更多」菜单打开的是一级页面（`#/apps/_root__montclip`）。这个页面里看得到右侧栏的文稿面板；聊天区是否同时可见，没有核实（没截整窗）。要做到线框图那样「剪辑器 + 聊天 + 右侧栏」并排，需要查 Cindy 的 `open` 什么时候生效，或者问 Cindy 方。
- **入口位置**：插件主视图在左侧导航的「更多」菜单里，不是一级按钮。用户可能找不到。
- **桌面驱动点不到嵌套 iframe**：影响自动化测试，不影响真人使用。
- **Node worker 的生命周期**：
  - `on-demand` 的空闲回收只看 RPC，不看 HTTP 访问，剪辑器开着也可能被回收。我让壳页每 60 秒唤醒一次，把空闲时间设成 3600 秒，并且尽量用固定端口 47777，换端口时 iframe 跟着换。
  - 更稳的做法是 `lifecycle:"resident"`，但详情页会把它单列为高风险项。
  - 实测（§2.6.6）：worker 重启后端口不变、剪辑器页不重新载入，撤销栈还在。只有端口变了、iframe 重新载入时才会丢；引擎停着期间保存会失败。
- **Cindy 自带的 Node 运行时**：实测是 v24.19.0（`Cindy.exe` 的 NodeService utility 进程），server.js 和 mcp-server.js 原样能跑。
- **端口与本机安全**：引擎只监听 127.0.0.1，并且检查 Host / Origin（`requestAllowed`）。但同一台电脑上的其他程序也能访问这个端口。独立版用 `MONTCLIP_SESSION_TOKEN` 做了会话校验；插件版目前没有，因为 iframe 不能加请求头。可以改成在 URL 里带一次性 token，再换成 cookie，作为后续 PR。
- **两份引擎同时开**（独立版和插件版指向同一个数据目录）时，两个 server.js 会同时写 `project.json`。这次插件版默认用单独的 `~/MontClip-Cindy`，避开了这个问题。
- **导出**：在 Cindy 主视图里导出（`where:"tab"`）实测通过；无头 Edge 标签页导出卡住的原因没查。导出音轨被判成「静音」，原因也没查。
- 包大小目前 2.0 MB（`.cindy`），引擎副本 307 个文件、4.9 MB，离 2048 个文件 / 256 MB 的上限很远。听写模型和 ffmpeg 都不进包。
- 这次没有处理插件图标：用的是 scaffold 生成的占位图。

## 5. 用到的 Cindy 代码和接口

- 宿主版本：`check_app_update` 返回 `currentVersion: 0.1.122`。构建资源 `cindy-source.json` 里的 `sourceCommit` 是 `26ab251dcec24f05a361d9fbdf770a1b2ddbba51`，但公开仓库里取不到这个 commit（`upload-pack: not our ref`），所以对照的是最近的公开 tag `v0.1.122-beta` = `49fbcc4d07a737d72c18c2abcedf51fe62fa5ee6`。其中关键的 `ghostPanelLoopbackEmbedAllowed` 已在本机 `app.asar` 里核对一致。Cindy 是 Electron 42.11.12、Chromium 148.0.7778.280。
- `apps/desktop/src/main/cindy-brain/runtime/electronSandboxAdapter.ts`（@49fbcc4d）：
  - L419 `GHOST_HTML_CSP`
  - L422 `GHOST_LOOPBACK_FRAME_CSP`
  - L441 `loopbackEmbedRequestAllowed`
  - L510–524 分区网络闸
  - L545 `/media/`
  - L551 / L872 `/library/` 加 Range
- `apps/desktop/src/shared/ghost.ts`（@49fbcc4d）：L1333 `ghostLoopbackOrigin`、L1355 `ghostPanelLoopbackEmbedAllowed`。
- 手册（随宿主发布的 `cindy-plugin-creator`）：§4.12 node worker / `cindy.downloads` / `downloadTokens`；§4.20 mainView；§4.22 taskView；§5 panel；§6 沙箱；§4.15 preview；§4.10.1 library；§4.0.1 `deposit_media`；§3.5 两段式目录；§7 打包。
- 插件用到的接口：`cindy.node.request`、`cindy.downloads.start`、`BroadcastChannel`、`/wake`、`ghost_forge_scaffold`、`ghost_forge_pack`、`ghost_forge_install`。

## 6. 交付物与测试记录

- 插件源码：`plugins/montclip-cindy/`。包含 `ghost.json`、`main.js`、`frame.js`（壳页）、`node/worker.cjs`、`embed/`（引擎侧页面：文稿、探针）和 `build.cjs`。
- 包：`plugins/montclip-cindy/montclip-0.0.1.cindy`（被 gitignore），2,047,112 字节。
  - `ghost_forge_pack` 打出、核对过的是 sha256 `915b1b6a3cfa2da511a4f9dc038f5ad0384c508ac178d77cb10fdc137f687506`；
  - `ghost_forge_install` 重新打包后，装进 Cindy 的是 sha256 `2b8e3da63778f262b571a0d4dffe1efd8fd956acaa434ff8dcd29d356221c4f2`。
  - 两者源码相同（commit `d2c00fc`），只是重新压缩。
- 测试脚本：附在 `plugins/montclip-cindy/spike/`（`rpc.cjs` 和各 `steps*.json`），按 Cindy 主机的方式驱动 worker。

| 项 | 跑没跑 | 说明 |
|---|---|---|
| worker 启动、导出 26 个工具、stdout 只写协议消息 | 跑了 | `non-protocol stdout lines: 0` |
| 2.18 GB 导入（硬链接）、Range 206 | 跑了 | §2.1 |
| 删 1:00–1:30、剪辑器记成一步、撤销、重做、跳转 | 跑了 | 剪辑器是无头 Edge（临时 profile、没有调试端口、测完删除） |
| 版本 list / save / restore | 跑了 | §2.2 |
| 导出 MP4（headless） | 跑了 | §2.3；`where:"tab"` 那次失败，已如实记录 |
| 全量 `node --test` | 跑了 | 本分支 1382 过、9 失败、51 跳过；干净的 origin/main 同样是 1382 过 / 9 失败，失败的 9 项完全相同（听写分段、导出停止、faststart，是本机环境问题）。中途一版把导入缺省改成硬链接，多挂了 1 项（flv-gap-routes），已改成可选参数并复测 |
| `ghost_forge_pack` | 跑了 | 通过 |
| `ghost_forge_install` 第一次 | 跑了，**被拒** | `MUTATION_CANCELLED` |
| `ghost_forge_install` 第二次（个人范围） | 跑了，**装上** | 确认卡由 Deja 按主人同意代点（见 §1） |
| Cindy 主视图里播放、拖到 2 GB 之后 | 跑了，**通** | §2.6.1 |
| Cindy 里删段、同步、撤销、重做、版本、退回 | 跑了，**通** | §2.6.2；由本任务的 Cindy agent 调插件工具，没有另开聊天任务打字 |
| Cindy 主视图导出 MP4（YouTube 档） | 跑了，**通** | §2.6.3；21.7 s，没卡住 |
| 右侧栏文稿：显示、跟随刷新 | 跑了，**通** | §2.6.4 |
| 右侧栏文稿：点一下跳转 | **没点成** | 桌面驱动对嵌套 iframe 坐标算错；要拿准确坐标得截整窗，违反截图规矩 |
| 三处同开对账 | 跑了，**通** | §2.6.5 |
| worker 停掉后撤销历史 | 跑了，**部分通** | §2.6.6；用强杀代替闲置回收 |
| `cindy.downloads` 下载 ffmpeg | **没跑** | 这次补测没有要求；下载 160 MB 需要主人另外同意 |
| 截图 | 只截了合成画面 | 唯一的图是主视图剪辑器渲染出的时间线帧（合成素材，`spike/evidence/cindy-mainview-frame-700s.jpg`）；没截整窗，因为会拍到聊天和其他任务 |
