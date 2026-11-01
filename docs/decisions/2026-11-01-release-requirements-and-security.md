# MontClip 发布需求与 Electron 审查基线

2026-11-01，Deja。范围锚点：主人指定「11/1/2026 01:19 起」；下列原话来自当前会话中可见记录。未逐条核对历史消息时间戳，不宣称这是无遗漏的逐字历史导出。JJ 的 40 项需求表是必须展开的附表，不能以本摘要替代。状态只代表本次核实的主工作区，不代表正在实施的隔离分支。

## 原话、落地项和状态

|编号|主人原话（节选）|落地与验收|当前证据/状态|
|---|---|---|---|
|R01|「根据…06-最佳KnowHow-每条需求.md…每一个需求和Know-How，重新开发一版 Electron App」|逐项展开 40 项，绑定实现、测试、许可来源、未过原因；不得静默删减|源表已交实现侧；逐项实现证据待补|
|R02|「以FableCut源代码为底座」|直接扩展 fork 的工程、项目模型、编辑与渲染路径|已建立 fork；基线 579b08ec1a789baec5cbf06d7430373460508d09|
|R03|「UI视觉风格借鉴Cindy.app的JJ-Agent」|简洁工作台；转录、预览、简时间线；高级能力可收起；不能据此复制私有代码|设计决定已写；产品未验收|
|R04|「优先适配Windows,第二版 MacOS，Linux」|首发真实 Windows Electron 便携包；其他平台后续，不冒称已支持|主工作区仍为上游 Node/Web 工程，未有新包证据|
|R05|「像Loom和OpusClip那样的，根据SRT来选取，编辑切片/语音」|整场字幕句级选择、片段编辑、撤销重做；改字幕与删除音视频分开；逐词需真实词时间|VV 稿有覆盖，产品待实现/验收|
|R06|「剪映 集成就做导出…MP4 + SRT + OTIO 或 剪映适配输出」|剪后标准 SRT；独立源/输出映射 JSON；OTIO 实际读回；剪映适配仅依据 Rea 行为 SPEC|待实现；不得把适配草稿当已经兼容|
|R07|「Fork到 good-night-oppie, 改名为MontClip」|仓库与产品命名 MontClip，保留上游历史及许可|仓库 good-night-oppie/MontClip 已建；package.json 仍为 fablecut，品牌未完成|
|R08|「不要Python侧车，即使要实现JJ-Agent的功能，也是在FableCut代码上加功能」|产品不带 Python，不调用旧 Python 引擎/ASR；Node 可调用经许可核验的 FFmpeg；听写选非 Python 实现|架构决定已记录；依赖与成品尚未验收|
|R09|「一开始就有中英文两版，中文优先。我们服务中文用户」|默认简体中文，可切英文并持久化；页面、错误、系统对话框、帮助均覆盖；不翻译用户素材|待实现及双语实际流程验证|
|R10|「11/3号就要发布」|2026-11-03 发布目标，未指定具体时刻；不以日期替代质量门槛|尚未达到可发布状态|
|R11|「把Cindy.App这样的聊天窗搬到FableCut里…直接连接Claude Codex MCP Server，这样用户体验不好」|内置剪辑聊天；不要求主播装外部 CLI、配 MCP；引用当前项目/选区，提案→预览→应用→撤销；模型真实调用独立验收|聊天架构已记；供应方式/实接证据待补|
|R12|「持续主动寻求所有可行方法，协同 VV, JJ, Rea, QQ…直到…满足…所有需求」|实现、测量、审查、返修循环；缺项有负责人和下一步；消息已发送不算工作完成|隔离持续实现任务已创建；宿主事件跟进已启用|

40 项源表：JJ workspace/documents/2026-10-31-开源剪辑项目调研/06-最佳KnowHow-每条需求.md。简报：2026-11-01-JJ-Agent重做Electron版-需求简报.md。公开工程只纳入独立整理的需求及许可允许内容；课程全文、账号水印、逆向原件不入库。

## Electron 安全基线：要求，不是已实现结论

本次只读核实主工作区：package.json main=server.js、start=node server.js，仍为上游配置。因此没有可提交审查的 MontClip Electron main/preload/IPC 实现清单，不能用旧 jj-agent 文件冒充。首个 PR 必须补实际文件路径、handler 名称、调用方、参数边界、测试与包 hash。

|审查面|必须实现和提供的证据|
|---|---|
|窗口|sandbox=true、contextIsolation=true、nodeIntegration=false、webSecurity 保持开启；发布禁 DevTools|
|preload/IPC|contextBridge 最小白名单；逐 handler 核类型/长度/范围及 senderFrame 精确来源；不提供任意命令、路径、URL 执行接口|
|导航/权限|精确可信 origin；默认拒新窗口、下载、未授权导航与权限；不能以 startsWith 校验来源|
|进程|FFmpeg 用 spawn/execFile 参数数组，shell=false；用户路径不能拼成 shell 命令；只回收本实例子进程，二开互斥|
|项目与文件|单一 revision/撤销链，冲突拒绝，保存失败与未知状态不可静默丢弃；目录 canonicalize 并校验边界|
|CSP|记录实际响应头/页面策略；不得为方便开启 unsafe-eval 或禁 webSecurity；必要例外逐条说明并审查|
|网络与密钥|默认本地；云模型外发内容明确提示并按实际范围确认；不自动发送音视频/字幕/帧；无遥测/自动更新；密钥不进URL/日志/PR|
|发布调试入口|关闭 RunAsNode、EnableNodeOptionsEnvironmentVariable、EnableNodeCliInspectArguments；拒调试参数；asar相关 fuse 取决于真实布局；对成品读取并实测|
|打包|明确 files 白名单，不带测试、私密材料、凭据、逆向原件；npm lock 锁版本，逐依赖记录来源、许可、SHA-256；保留必要许可文本|
|验证|干净 PATH 真包仍可探测导出；真实窗口验收；共享预览/导出compositor；同步≤40ms；中文/空格路径；默认网络观察与断网运行分开报告|

第一份 PR 描述首行「@QQ 请审」，request reviewer GoodNightOppie；附上述实际落实表、Windows/其他平台测试数字（没跑写没跑）、未过项。审查绑定提交，未批准不合并，不把模拟模型通过算真实 AI 可用。

## 旧栈封存决定

jj-agent Python 栈、#16–#19 和 E9 不再作为 MontClip 交付路径。原仓库、分支、提交、包 hash、日志与未过验收保留为历史证据；不删除、不重标为通过，不继续移植其 Python 运行时。复用的是独立功能需求及合成验收方法，测试数字不能迁移。任何已运行旧任务须先核状态，不因本决定擅自结束进程。MontClip 的新包、审查、许可证与行为验收全部重新绑定本仓提交。

## 本次文档验证

只读检查 git status、现有决定文件及 package.json；未改产品代码。产品测试没跑，Windows/Mac/Linux 实窗没跑。此文件不是发布批准。
