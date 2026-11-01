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
5. PR 描述首行「@QQ 请审」，request reviewer GoodNightOppie；附具体 head、改动、复现、分平台测试、安全基线、依赖许可/hash、风险与未过项。
6. QQ 按具体提交给结论，VV 验交互/实窗，JJ 核需求与中英文文案，Deja 最后拍板；未通过不自行合并或发布。

JJ 继续需求覆盖和文案，不再为旧工程规则文件等待选择。Cindy 无需继续排查该规则来源；消息投递等其他真实阻塞单独处理。

本次只新增决策文档，未改产品；产品测试未跑。
