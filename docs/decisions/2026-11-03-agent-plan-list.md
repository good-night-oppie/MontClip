# The AI's plan list (P4, second half)

Date: 2026-11-03. Spec: Deja's architecture draft (sha256 cccbc16f…), 「AI 拆任务、排计划、执行」 and 「每一步都是编辑器事件」.
Builds on the permission modes (`docs/decisions/2026-11-03-agent-permission-modes.md`).

- A reply `{"type":"plan","steps":[{"capability","args"}]}` (1–30 steps) is a plan. `agent-plan.js` checks it as data: exact
  keys, each capability in the table; one blocked or unknown capability refuses the whole plan (nothing of it runs). The fixed
  format note tells the model the shape (three lines; outgoing text, for QQ).
- The assistant shows it as a list: each step's `Capabilities.label` and its state — 没开始 / 正在做 / 做完了 / 失败 — and, for
  a step that stopped the plan, why. Before 〔开始〕 the streamer can delete steps or drop the plan (〔整个不要〕).
- 〔开始〕 is the streamer's: a plan never starts by itself, in any mode. In 计划 mode it is off.
- Steps run in order, one 正在做 at a time. Each step: the main process decides (mode × risk, as for any AI step) → the step's
  own check against the project as it is now (`chat-proposal.js`) → the box where the mode asks → a CAS → one undo step, one
  event of the plan's run (`runId`). After a step the project is saved, so the next is checked against it.
- A step that fails (no longer fits, busy, refused), is declined, or is only listed stops the plan there; the rest stay 没开始.
- 〔撤销整个计划〕 undoes every applied step of the run at once (`undoRun`), or says why it can't (something changed after it).
- The agent version is kept before the first step.
- Only `keep_sentences` and `keep_ranges` can be done by the assistant yet; any other step stops the plan with
  「助手现在还做不了这一步」. `keep_ranges` with `per_range` (exports) opens the dialog for the streamer's own 〔应用〕.
- `capabilities-page.js` reads the tool list (names and schemas) from the main process once, before `capabilities.js`, so the
  page's table can name every step in plain words. Risks still come from `capabilities.js`; decisions stay in the main process.
