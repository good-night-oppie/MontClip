# 最小缺镜头契约提案 v1（待 Deja 审核）

基线：main `d51b27a1`；关联现状矩阵 `2026-11-05-draft-interaction-matrix.md`。本提案尚未实施，不是已支持 schema/API，产品文字均待 JJ；VV 已定稿的纯色卡规范直接复用。收到 Cindy 的在制接口后优先统一，禁止同时落两种模型。

## 建议决策

只在现有 sequence 的普通 clip 上增加一个可选 `shotSlot` 元数据字段。`clip.id` 就是槽标识；`clip.start/duration` 就是左闭右开时间范围，不重复维护一份槽列表、时间范围、存储或 undo 栈。其他 clip 无字段时行为不变。只覆盖当前序列中独立、非嵌套、恒速的画面槽；复杂合成/父子/变速曲线先明确拒绝，不自动拆解。

```json
{
  "id": "slot_hand_1",
  "start": 8,
  "duration": 2,
  "shotSlot": {
    "v": 1,
    "need": "手部近景，完整保留落拍动作",
    "state": "unfilled",
    "audioIds": ["original_audio_1"],
    "restore": {"versionId": "before_draft", "clipId": "original_video_1"}
  }
}
```

- `need` 是所需画面说明，非机器判定的镜头类型真值；非空纯文本，最多 500 字符。`state` 仅 `unfilled|filled`，由专用事务写入，不能根据文件是否存在、画面是否黑色或时间戳空档自动推导。
- `audioIds` 为槽区间所保留的独立声音 clip ID；无声音为 `[]`。不依赖加载时可能重建的 linkGroup 名称。首版只支持边界与槽一致的音频片段；跨越槽的声音须先在同一事务候选文档中按边界拆分，任一被锁定则整次失败。
- `restore` 可为 `null`（从来没有原实拍），有原实拍则必须引用已成功保存的现有项目版本和原画面 clip。版本包含其 linked audio/参数/完整工程；不复制原始文件、不把原片嵌入 metadata。界面不得把“版本存在”写成“恢复已实测”。
- `filled` 的画面直接使用普通 video/image clip 的 mediaId、in、props 等，不再存第二份 boundMedia。丢文件时仍为 filled 且另有 offline 状态，不能重新计入待补镜头。
- unfilled 使用普通 `comp` clip，内部仅现有 shape 纯色底和 text，尺寸与项目一致、持续时间匹配槽；经过同一 compositor 在预览及导出实际画出 VV 的卡。外层 clip.id 不变。不得依赖编辑器覆盖层或透明文字假装导出有卡。该小 composition 是渲染内容，不是第二套草稿存储。

## 导出与恢复

建议默认拒绝“完整成片”导出，返回未填数量和槽 ID；明确选择审片输出时允许生成含真实文字卡的审片版，UI/agent 使用同一选项，收据必须标 `review` 和 unresolved IDs。不得偷偷跳过卡、导出黑屏后称完成。导出前锁定快照与 revision，不能在渲染中途改变状态。新增选项和文案要 JJ/VV 审，不沿用已有普通导出成功提示冒充完整。

原实拍版本需在依赖存在时禁止删除，或先明确解除恢复承诺；首版选择禁止删除被 shotSlot 引用的版本。版本丢失/原文件 offline 时恢复拒绝且说明原因，不改工程。恢复动作在当前范围/音轨仍符合记录时还原源引用、in/out、速度、裁切、音频和关联参数；范围或 audioIds 已被其他编辑改动则报告冲突，不覆盖后续工作。恢复后移除 shotSlot；无原实拍时不能提供恢复动作。

## 事务语义（名称仅提案，不是已暴露工具）

所有调用带 projectId、sequenceId、baseRevision；UI 和 agent 进入同一纯数据操作，再由现有保存入口提交。先在完整克隆文档中校验和执行，成功才交换文档、增加一次 revision、登记一个 undo/event。无变化不记纠正次数；失败不更改 clips/comps/media/revision/undo。`applyPatch` 目前会原地变更候选文档，调用方必须丢弃失败候选，不能把它当内部自动回滚。

| 动作 | 成功结果 | 拒绝条件 / 不允许的隐式行为 |
|---|---|---|
| 加入草稿槽（批量） | 一个批次一个 undo；独立 ID、明确范围、卡与恢复引用一起保存 | 任何槽无效、重叠/遮挡无法保证卡可见、目标/关联音轨锁定、版本保存失败则不落轨；不从时间戳 gap 自动造槽 |
| 单槽 replace | 按 slot clip.id 替换该区间的画面；保持 start/duration/id/need/restore/audioIds，state→filled；使用已登记素材和显式 source in，保持原声、不自动加入新素材音轨 | 素材余量不足/未知、素材 offline、任一关联声音或画面锁定、不能安全处理的字幕/遮挡/父子关联则拒绝；不循环、不冻帧、不改变速度来凑长；不调用全局 replaceMedia |
| 单槽 delete（推荐明确为 ripple 删除这段） | 删除槽及该段保留音频，并在全部受影响轨道提取同一区间；区间后内容整体前移；删除的是审片内容，不是文件 | 受影响锁定/不支持的嵌套或变速、跨边界关联无法安全处理则整次失败；不能只删卡留下黑洞，也不能悄悄删除字幕/打码而无时间映射。这个产品语义须 Deja/VV/JJ 明确接受后实施 |
| 恢复原实拍 | 按上述 restore 前提还原；一次 undo 可返回恢复前的卡/补充画面 | 不依赖一次性 undo 栈；不能把撤销 replace 回到卡称作恢复原实拍 |
| 普通移动/修剪/拆分 | 首版移动/修剪通过 slot-aware 同一事务重建卡区间和校验声音；split/跨序列复制槽先拒绝 | 不能让 generic updateClip 静默制造陈旧 audioIds/卡时长/恢复承诺；所有写入口（含 set_project）同样验证 |

计数是当前序列 `shotSlot.state===unfilled` 的派生值，不保存缓存。第一处按 start、track 顺序、clip.id 稳定排序。定位只改变选择/播放头，不改 revision/undo。禁用或隐藏槽仍算未解决，不能借隐藏状态把计数归零；导出判定按目标序列与导出范围收集，完整性收据区分范围与整片。

锁定包含 clip、track、linked group 和受影响音轨。新槽事务首版不开放 force 绕过。保存重开需在 serializeClip、checkProject、序列/版本复制、compact view、undoSnapshot/恢复和外部变更同步中一致保存/验证；存量工程无字段不迁移。审片卡的 comp 清理只删除无引用的专用 comp，不碰共享 comp。

## 切点精调：可独立推进

- 复用 rippleTrim（改时长并移动后续）与 rollEdit（两侧交换时长、总长度不变），不能把两种动作混称“提前一帧”。接缝建议使用 roll；孤立头尾需单独注明 trim 行为。项目帧 delta=±1/project.fps，文案必须明示项目帧。
- 现有引擎把结果四舍五入到 0.0001 秒，并可能因源余量/MIN_DUR 夹紧。按钮若承诺“一帧”应在候选执行后比对实际 delta；不足整帧就拒绝且不登记操作，不能当成功。当前 24/30/29.97 项目帧允许引擎现有 0.0001 秒数值误差，但不能容忍实际少一部分帧。
- VFR 真源帧另外需要 `adjacentSourceFrame(mediaId, sourcePts, direction)`，返回 source identity、presentation ordinal、PTS+time_base、前后间隔及非零起点映射；无 PTS 明确 unavailable。不能从 avg fps 或本次项目步长推出真实源帧号。接口未实施，不在本次项目帧小步中顺带伪造。
- 接缝播放可复用 transport/setTime 与有界停止，但现有 showSentenceSelection 的选区跳播不等于已经有接缝按钮。未来播放以选中切点前后约2秒裁到实际头尾，播放期间 revision 改变就停止；VV/JJ 定稿后做真实按钮验收。

## 审核需确认的三点与测试顺序

建议 Deja 确认：① clip 上单字段 + unfilled 普通 comp 卡（不另建槽表）；② delete 是全轨 ripple 提取，不是移除提示卡；③未填默认挡完整导出、显式允许带卡审片版。另请同步 Cindy 当前实现，若已有模型，优先映射/修改本提案而不是另立接口。

审核前只写既有 trim/roll 的数据级特性测试，不写新模型实现。审核后先失败测试覆盖：序列化重开字段不丢；单槽替换不影响共享媒体其他片段；锁定/短素材/过期 revision/批次中途失败零写入；加入一次 undo；replace undo 回卡、放卡 undo 回原片；清空 undo 后版本恢复；导出卡实际像素及未解决收据；移剪后 metadata 不漂移。数据测试不能冒充实窗与导出验收。

## 本轮独立验证结果（契约未批准，不实施新模型）

新增 `test/cut-frame-contract.test.js` 16 项，实际运行 edit-ops 的 trim/roll、app.js 的 undo/redo 函数与事件日志；不是对函数名字/按钮源码的正则断言。测试驱动负责候选编辑与 snapshot 边界，DOM、保存网络是 stub，因此不证明按钮接线、revision 持久化、保存重开或实窗播放。

- 4 项：trim/roll × in/out，一次项目帧调整、linked audio 同步、一次事件和一次 undo，undo/redo 恢复完整 clip 数据；roll 保持相邻边界及总体时长。
- 6 项：画面、轨道和 linked audio 锁定，各使 trim/roll 拒绝且数据/undo 不变。
- 2 项：源头无余量/零变化不增加 undo、不耗掉 redo；仅剩 0.01 秒余量却请求 0.04 秒时，当前 roll 确实夹紧为 0.01 秒。后者是现有行为描述，未来完整一帧按钮必须增加候选拒绝层。
- 2 项：纯合成 CFR/VFR PTS 数组，证明项目步进与源帧序号不同。此组不是解码输出。
- 2 项：FFmpeg testsrc2 程序生成实际 MPEG-4 文件，ffprobe 解码读取每帧 PTS；CFR 测得 125 帧、固定间隔 0.04 秒；VFR 测得 120 帧、含 0.04/0.12/0.16 秒间隔。两者 time_base=1/12800；项目 25 fps 从源 0.04→0.08 秒时，CFR 帧序号 1→2，VFR 1→1。调用的是现有按 PTS 选择函数，不是新的 VFR 邻帧编辑接口。

素材 SHA-256（临时程序生成文件测试后清理，不含真人内容）：CFR `cc05fab61cd58105c78f7864e0d0d105b97d70f46764f88f599ae47492477bc3`；VFR `709a7d66f1ba1cc1ba86eca885a4cad75864a73ef61e8370fc46e329d0621a67`。日志保留前 12 帧的真实 PTS/time_base/序号与总帧数；不是完整逐帧 UI/导出验收证据包。来源均为机器核对，无人工听看结论或争议边界真值。

Windows / Node v22.15.1 / FFmpeg 9.0.1 gyan.dev full（非 bundled），显式设置 MONTCLIP_FFMPEG / MONTCLIP_FFPROBE 后执行：

```text
node --test test/cut-frame-contract.test.js test/trim-tools.test.js test/undo-outside.test.js test/mp4-demux.test.js
tests 58; pass 58; fail 0; skipped 0
```

完整成功日志：`docs/validation/2026-11-05-cut-frame-regression.txt`。首次未配置工具的回归为 55 通过、1 跳过；增加实际生成测试后的首次 VFR 生成因 FFmpeg select 表达式转义失败（57 通过、1 失败），修正测试表达式后全量重跑得到上述 58/58。这不是产品功能先红后绿；新槽功能仍须契约审核后另写失败测试。

没有新运行依赖。未跑全量 npm test/release-check、Linux/macOS、浏览器接缝播放按钮、实际 MontClip 导出、保存重开或人类操作计时；没有开 Draft PR。本轮仅推进契约与现有能力测试，不报截图任务完成。
