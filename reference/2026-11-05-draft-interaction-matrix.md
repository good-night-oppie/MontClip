# 截图群聊草稿交互：现状与接入边界

状态：调查交接，尚未实现截图中的完整流程。2026-11-05（America/Los_Angeles）。

## 检查基线与来源

- 独立分支 `cindy/vigilant-wozniak`；fetch 后快进到 `origin/main`：`d51b27a1ef5196725d73bca2d7d96c0de8c767bc`。初始工作树无未提交改动。没有修改父工作树。
- 已读当前 AGENTS、CLAUDE、CONTRIBUTING，以及 jj-agent `727c89e56ad7b4629c562dc6bf1e1c05662fb909` 的 Review Inbox 说明。当前工作树未找到 VERIFICATION 文件或 `.cursor/rules/agentic-coding-steps.mdc`；未声称已执行缺失的流程脚本。
- 需求来源为任务转述的截图要求；本轮未取得截图原图，也未收到 Rea SPEC。下述边界是代码调查建议，不是 VV/JJ 定稿，不含外部竞品源码或逆向材料。
- 通过 GitHub 插件读取当前全部 41 个 open PR。未发现标题/正文描述参考镜头草稿落轨的 PR；这不证明没有未推送的并行实现。任务明确说 Cindy 正在负责 analyze_reference → 落轨，应先对齐其接口。

## 现状矩阵

下表行号均对应上述 main。代码存在与实窗验收分开记录。

| 截图要求 | 当前文件 / 函数 / 已有入口 | 已核实与限制 | 建议边界 / 关联 PR |
|---|---|---|---|
| 缺镜头说明类型，预览和时间线显示状态 | `CLAUDE.md:2227` blueprint 只有 shots/cuts/energy 等；`mcp-server.js:1695` analyze_reference 返回分析和重建配方；`app.js:1821` serializeClip、`:1852` projectJSONHere 列举保存字段 | 未找到参考草稿 slot、required shot type、unresolved 状态模型。普通 input placeholder 与 logo-placeholder 不是缺镜头 UI。不能直接加临时字段，UI 保存可能丢弃 | 等落轨实现方提供可持久化的唯一模型；本任务只接显示和操作，不另建草稿存储 |
| 缺镜头不能只是黑屏 | `app.js:15183` drawOfflineSlate；`:15207` drawClipPicture；`:5734` 时间线 offline class | 已有“已登记文件丢失”的提示画面、文件名和时间线状态。不是“尚无合适镜头”的语义。本轮仅静态核实，未运行浏览器 | #137 正在改 offline 中文与找回流程，不复制该工作；不能把未匹配镜头伪造成文件丢失 |
| 选择素材 / 删除这段 | 既有素材替换、relink 与普通片段删除；`project-ops.js:129` 等编辑分派 | 这些针对已存在 clip/media。没有 slotId → clip 的受校验替换接口，无法证明替换后会清除缺镜头状态。全局 media 替换会影响多个片段，不能直接充当单槽替换 | 先约定落轨 slot 对应 clip、替换范围、linked audio 与锁定行为，再复用现有编辑事务 |
| 选中接缝，播放切点前后 | `app.js:11658` showSentenceSelection 的 `[data-preview]`；` :11510` autoPreview；`:11499` autoListen；`:6406` startTrimToolGesture | 范围草稿可按选区顺序播放；自动切片可看整段/听头尾；拖拽修剪有读数。未找到选中接缝的专用前后播放动作 | 可复用 transport 和范围播放，但接缝选中对象、前后窗口与两侧关系需要 VV/JJ 先审 |
| 开头/结尾提前或延后一帧 | `edit-ops.js:784` rippleTrim、`:820` rollEdit；`project-ops.js:129`；`index.html:181,183` Back/Forward；`app.js:21859–21869` 键盘步进 | 编辑引擎接受秒，支持边界、联动和锁定。已有左右键用 `1 / projectFps()`，包括 Source 模式；这不是 VFR 源帧步进。未找到专用头尾 ±1 源帧按钮 | 不把 fps×秒当源帧号；先明确修剪还是 roll，再接真实 PTS 邻帧服务 |
| VFR 真实源帧与操作数 | `mp4-demux.js:240` frameAt、`:248` presentationOrder；`app.js:19697` ExportFrameSource；`media-lib.js:182,229` 平均帧率 | MP4 导出有真实 PTS 样本；还没有覆盖所有导入格式的源帧邻接 API。平均 FPS 不能确定上一/下一实际帧。未找到切点纠正专用操作计数 | 建议记录原/新源 PTS、源帧序号与单次用户动作事件；不要把多个内部写入当多次操作。这里只提契约，不实现新系统 |
| 加入后可继续调整、一步撤销加入 | `app.js:11531` placeAutoSlices、`:11559` undoAutoSlices、`:11565` autoPlace；`:11645` commitRangePlan；`range-plan.js:21` create | 已有自动切片放到时间线、选中首段、一个 undo snapshot；范围草稿应用为普通可编辑项目。59 项相关现有测试通过；其中 UI 测试部分为源码断言，不是实窗验收 | 优先复用此事务/事件机制；不要再造第二个 undo 栈。参考草稿仍缺上述 slot 映射 |
| 剩余缺镜头数量、定位第一处 | `app.js:2424` 文件 offline 数量；`:2739` relink 入口；`:20965` btnNextGap | 有“丢文件数量”和“下个空档”，没找到“未填镜头数量/首个未填槽”。这三种情况不等价 | #167 是包时间戳覆盖/跳空档，不承接缺镜头功能 |
| 锁定 / revision / 保存重开 / undo redo / agent parity | `edit-ops.js:787,823`；`project-ops.js:184–190`；`mcp-server.js:1519–1533` baseRevision；`server.js:958,963` identity/revision；`app.js:4317,4322,4440,4450`；`server.js:849,869` UI commands/undo-stack | 有可复用基础；不代表尚不存在的草稿模型已经通过这些约束。`chat-proposal.js` 只接受 keep_sentences / keep_ranges，未知 shape 拒绝 | 所有未来 slot 动作走同一 edit/patch transaction；保存与重开必须实际检查新增字段，批操作失败不能部分落轨 |

## 并行工作快照

| PR | 本轮观察到的 head | 与本任务关系 |
|---|---|---|
| [#137](https://github.com/good-night-oppie/MontClip/pull/137) | `13687bc1b0a346c5071713386d69ec67074328b8` | 丢文件提示与找回，不能重复做或误算作缺镜头完成 |
| [#167](https://github.com/good-night-oppie/MontClip/pull/167) | `c66bd0e2370141efbc91748426660cd55ed5d32d` | 包时间戳覆盖；不是缺镜头草稿 |
| [#172](https://github.com/good-night-oppie/MontClip/pull/172) | `91f764762c130993be0c14ea91aea48a18289d64` | 助手空计划过滤，不提供镜头 slot |
| [#186](https://github.com/good-night-oppie/MontClip/pull/186) | `6b746827df3e414ebd75585bda82e35d5ae4d9fe` | 隐私配方，完全排除本任务；未运行或复制其启动脚本 |

PR 状态仅为调查时快照，不代替实施前再次 fetch 和核对 head。

## 推荐下一步（交 Deja 与落轨实现方评审）

当前满足任务规定的“没有所需草稿模型、可能与正在实现的草稿重叠”条件。本轮停在有证据的边界交接，不创建一整套并行草稿系统，也不为尚未实现的功能开名义上的功能 PR。

1. 由 analyze_reference → 落轨实现方给出其分支/head、草稿 schema、slot 与 clip 关系、未匹配原因，以及 apply/replace/delete 的事务接口；明确是谁持有唯一持久化模型。
2. VV 提供依托现有时间线/预览的最小接缝与缺镜头状态设计，先交 JJ 审；新增中英文再由 JJ 定稿。不要把本表中的描述当产品文案。
3. 本任务后续只接入该模型的状态显示、计数定位和现有编辑操作。源帧服务若没有，单独界定格式支持与失败行为；没有真实 PTS 就不展示“源帧精确”的承诺。
4. 有确定接口后，每项行为先失败测试，再实现，再按同一合成工程验证 preview/export、锁定拒绝、revision 冲突、保存重开及 undo/redo，最后开 Draft PR 并请求 GoodNightOppie。

## 已运行与未运行

Windows，Node `v22.15.1`，现有单元/静态 UI 测试：

```text
node --test test/chat-proposal.test.js test/range-plan.test.js test/range-plan-boundary.test.js test/range-plan-low-fps.test.js test/sentence-selection.test.js test/official-proposal-undo.test.js test/auto-slices.test.js test/auto-slices-ui.test.js test/proposal-event.test.js
tests 59; pass 59; fail 0; skipped 0
```

原始测试记录：`docs/validation/2026-11-05-draft-interaction-tests.txt`。本轮没有功能改动、失败先行测试或新增运行依赖。未跑全量 npm test / release-check，未开 PR。

没有启动服务或浏览器，没有连接用户工程。合成素材、CFR/VFR PTS 验收、实际预览导出、操作录像、操作计数、素材/截图/视频 hash、Linux/macOS、人工体验全部未运行/未产生。不能把 59 项测试说成截图任务验收；没有可比基线，不报告提速、30 秒骨架或 90% 准确率。

后续测试必须自建数据目录、HOST=127.0.0.1、PORT=0，通过 IPC montclip-ready 确认自己启动的服务，并使用独占浏览器 profile/管道；仅清理自己记录的 PID。使用程序生成素材；人为缺镜头标 simulated。检查初始黑屏前先确认首片段 start 是否为 3 秒。记录真实源 PTS/帧序号、机器/人工/争议来源，固定录制和计时设置，保留完整原始记录；不使用真人账号、密钥或个人路径作为演示。

## 交接自检

按 agent-self-evaluation 检查这份调查交接：准确性 4/5（静态证据和测试可复查，未取得截图原图）；完整性 3/5（交接条件满足，整个实现/导出目标尚未交付）；清晰性 4/5（区分缺镜头、丢文件、空档，仍需接口方确认）；可执行性 4/5（具体接入点已列，依赖落轨 schema/head）；简洁性 4/5（矩阵保留必要文件定位，但尚可在接口确定后缩短）。平均 3.8/5。

优先改进：取得唯一草稿接口及设计定稿后继续有界实现；补合成实窗和导出证据。用户应能同意这是调查交接，不应把它理解为完整任务已完成。
