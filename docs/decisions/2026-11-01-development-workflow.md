# MontClip 开发与审查流程

2026-11-01，主人明确裁决：「这个按照QQ的 Review Inbox 流程，走 FableCut的开发规范好了」。

## 决定

- MontClip 以本仓 AGENTS.md → CLAUDE.md 和 CONTRIBUTING.md 为开发规范，以 QQ 的 Review Inbox 为审查流程。
- 不再等待或选择三份旧 Oppie `agentic-coding-steps.mdc`，不复制它们到 MontClip；该文件缺失不再是本项目阻塞。
- 保持既定产品要求：FableCut 原生扩展、无 Python、Electron 便携交付、中文优先双语及内置聊天。本次是流程裁决，不撤销功能要求。上游零运行依赖原则与 Electron/本地模型打包需要的差异须显式记录，逐件许可和安全审查，不借此随意引入框架。

## 执行

1. 先读相关手册；小步改动，保留单一预览/导出 compositor 与原生项目语义。
2. 功能对应测试、保存重开、撤销重做；涉及视觉行为必须验证实际预览与导出。
3. schema/API/工具改动同步 CLAUDE.md、README、生成文档与 changelog，按上游 shipping checklist 检查 agent parity。
4. 提交/推送前按本仓要求跑 npm test，提 PR 前跑 node .github/scripts/release-check.js；额外 Electron 和发布验收按实际改动补齐。未跑写未跑。
5. 正式送审的PR描述第一物理行写「QQ 请审」（不带@），第二物理行写「负责人：<伙伴名>」，指实际实现伙伴，不写共用账号；request reviewer GoodNightOppie，或已有其历史review视为已送审，历史review不等于当前head批准。正文依次提供非空「改动：」「复现：」「测试：」「依赖：」；测试每个非空行有结果数字，或「没跑」加具体原因；依赖写「无」或「#编号（硬依赖，类型：代码）」。按改动文件提供「音画同步：」及「外发：内容：…；接收方：…；能否关闭：…」。需要例外时另写「SOP 例外：<项目> — <原因> — 证据：<HTTPS链接或消息号>」，格式正确仍须QQ在当前完整head的review逐项核验；按主人本轮选择，仅用pull_request_target，核验后由QQ人工重跑与当前head/正文/规则版本匹配的最新可信检查，变化后触发新target，不启用PR可改的pull_request_review同名检查。附完整head、分平台测试、安全基线、依赖许可/hash、风险与未过项；缺项不能冒充证据齐全，见[共享规则](../../scripts/pr-sop/README.md)。
6. QQ 按具体提交给结论，VV 验交互/实窗，JJ 核需求与中英文文案，Deja 最后拍板；未通过不自行合并或发布。

JJ 继续需求覆盖和文案，不再为旧工程规则文件等待选择。Cindy 无需继续排查该规则来源；消息投递等其他真实阻塞单独处理。

## 2026-11-06 送审格式与草稿边界更正

本节承接已关闭#188（docs/review-request-marker，head 7c21b11177970394e8026cae97966f8600be69c6）的送审标记及Draft预审说明，并与sop-pr-lint在同一PR更新。首行不使用GitHub @提及，避免通知同名无关账号；既有正文也须改成当前格式，没有旧正文免改例外。正文标记给人看，不单独作为Inbox入箱条件；实际送审沿用请求审查人或已有其历史review的口径。

Draft可入箱，但不自动进入Review Inbox agent审查；受指派的人工或伙伴预审可进行，不代表满足批准或合并门槛。不能将“未开始自动审查”写成“未入箱”。Draft仍须登记第二行负责人并按SOP进行4/12/24小时跟进，不因尚未正式送审而停止跟进，也不要求为登记先加审查人。

sop-pr-lint的失败状态不会因宽限期自动变绿；由QQ在审过、Deja确定合并及生效时间后设置为main必过检查并读回，BB不改规则集。当前head复审、CI、各角色验收及正式批准分别记录，不修改Inbox配置。

原始决策记录：当时只新增决策文档，未改产品；当时产品测试未跑。本轮文档验证和实际CI证据以同PR的验证说明为准。
