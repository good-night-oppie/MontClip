# ADR-004：PR SOP 检查的工作流同名伪造残余风险与防线

日期：2026-11-07。状态：候选，待 QQ 审查、Deja 定序；未上线、未设必过。

适用仓库：good-night-oppie/MontClip、good-night-oppie/MontClip-Cindy。

## 背景

sop-pr-lint 用 `pull_request_target` 读取 PR 元数据，只读权限，不 checkout、不执行 PR 代码。它仍有两个无法靠事件类型单独消除的残余风险：

1. PR 可以新增一个 `on: pull_request` 的工作流，job 也取名叫 `sop-pr-lint`，让它永远成功。分支保护按 check 名称匹配，可能把同名成功当成我们的检查结果。
2. `pull_request_review` 事件运行时，`GITHUB_SHA` 是 PR 的最后 merge commit，用的是 PR 可修改的工作流；启用它会让作者在 QQ 提交 review 时触发出一个同名「通过」，重新打开 PR 自改检查的入口。依据：https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows

## 决定

1. 不启用 `pull_request_review`（submitted、dismissed）。QQ 提交例外 review 后，用 GoodNightOppie 执行 `gh run rerun <run-id>`，重跑最近一次 sop-pr-lint；先核对 run 的完整 head、事件和工作流哈希，不重跑旧 `pull_request` 运行。这一步是人工操作，脚本不代为触发。
2. 改动文件里出现 `.github/workflows/**` 或 `.github/actions/**`（含重命名前路径）时，状态为 `needs_qq`，运行返回 1；摘要只列出这些文件名，不打印文件内容。正控覆盖 workflows、actions、重命名前路径；负控确认普通文档改动仍可通过。
3. 根治方向是仓库规则集的「Require workflows to pass before merging」：指定默认分支上的 `.github/workflows/pr-sop.yml`，合并时校验的是 main 的那一份，而不是 PR 里的同名 job。该设置由 QQ 向主人申请后执行，BB 不改规则集。

## 规则集能力核查（2026-11-07）

事实：

- 本仓库现有 repository ruleset `main protection`（id 26587479），规则为 deletion、non_fast_forward、pull_request、required_status_checks；必过状态是 Tests（Node 18/20/22、Windows Node 22）、Syntax & sanity、Release readiness，尚不含 sop-pr-lint。
- 组织 `good-night-oppie` 的 plan 为 `free`（`GET /orgs/good-night-oppie` 返回 `plan.name: free`）。
- 官方文档把「Require workflows to pass before merging」写在 organization/enterprise 级规则集，并说明组织规则集面向 GitHub Team 与 Enterprise；官方博客写明该能力面向 GitHub Enterprise Cloud 客户。
- REST 规则集 schema 列出 `workflows` 规则及 `path`、`ref`、`repository_id`、`sha` 参数，但这只能证明 API 形状，不能证明当前组织/计划可用。
- 当前 token 可读仓库级 ruleset，但读组织级 ruleset 需要 `admin:org`，未能读取，因此无法确认该组织是否已有可用入口。

推断：按当前 Free 计划与官方口径，本组织大概率不能直接启用该规则；需要在规则集 UI 中由管理员确认。

未知：该组织是否已获得该能力的灰度或计划变更；规则集 UI 是否对组织管理员显示此规则。

## 防线

- 工作流或动作文件改动一律升级为 QQ 人工核验，不因模板齐全而机器放行。
- QQ 必审，wf 改动按高风险人工审；核对具体 run 的 event、完整 head、工作流文件哈希，不接受同名 job 的成功结果。
- 分支保护把 sop-pr-lint 设为必过之前，先完成首次 main 启用和一次真实 target 运行核验。

## 未做

- 未修改任何规则集、未创建或编辑 ruleset、未设置必过检查。
- 未在 main 真实运行 target 工作流；两仓 main 尚无 pr-sop.yml。
- 未验证合并队列的真实事件。
