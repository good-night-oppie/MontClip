# The AI's plan list (P4, second half)

Date: 2026-11-03. Spec: Deja's architecture draft (sha256 cccbc16f…), 「AI 拆任务、排计划、执行」 and 「每一步都是编辑器事件」.
Builds on the permission modes (`docs/decisions/2026-11-03-agent-permission-modes.md`).

- A reply `{"type":"plan","steps":[{"capability","args"}]}` (1–30 steps) is a plan. `agent-plan.js` checks it as data: exact
  keys, each capability in the table; one blocked or unknown capability refuses the whole plan (nothing of it runs). The fixed
  format note tells the model the shape (three lines; outgoing text, for QQ).
- The assistant shows it as a list: what the step changes (`stepDetail`, e.g. 「保留 0:00–1:55」; VV on 53f641d: two steps of one kind looked the same),
  `Capabilities.label` under it, and its state — ○ 待做 / 进行中 (a spinner) / ✓ 完成 (struck through) / ✕ 没做成, in English To do /
  In progress / Done / Not done (Deja, 2026-11-04: v7.2's names, 助手面板改版说明 v7.2 line 39) — and, for
  a step that stopped the plan, why. Before 〔开始〕 the streamer can delete steps or drop the plan (〔整个不要〕).
- 〔开始〕 is the streamer's: a plan never starts by itself, in any mode. In 计划 mode it is off.
- Steps run in order, one 进行中 at a time. Each step: the main process decides (mode × risk, as for any AI step) → the step's
  own check against the project as it is now (`chat-proposal.js`) → the box where the mode asks → a CAS → one undo step, one
  event of the plan's run (`runId`). After a step the project is saved, so the next is checked against it.
- A step that fails (no longer fits, busy, refused), is declined, or is only listed stops the plan there; the rest stay 待做.
- 〔撤销整个计划〕 undoes every applied step of the run at once (`undoRun`), or says why it can't (something changed after it).
- The agent version is kept before the first step.
- Only `keep_sentences` and `keep_ranges` can be done by the assistant yet; any other step stops the plan with
  「助手现在还做不了这一步」. `keep_ranges` with `per_range` (exports) opens the dialog for the streamer's own 〔应用〕.
- `capabilities-page.js` reads the tool list (names and schemas) from the main process once, before `capabilities.js`, so the
  page's table can name every step in plain words. Risks still come from `capabilities.js`; decisions stay in the main process.

## After VV's offscreen review of 53f641d (2026-11-04)

- 630×460: the assistant had 242×144 px (the plan a step and a half, no conversation; with Yolo on, its bar took the rest). In a
  window narrower than 760 px the assistant column now lies over the editor under the top bar (`--mc-topbar-h`, measured by
  app.js), 〔收起〕 puts it away; the Yolo bar is one line (cut with …, the whole sentence as its tooltip); each step one line
  (the capability's sentence as its tooltip). `desktop/agent-narrow-smoke.cjs` checks at 630×460: the conversation at least
  3 lines, the 3 steps whole, the input box whole, with and without Yolo; at 1280×820 the pane beside the editor and
  〔开始〕 in sight without scrolling (the steps scroll inside the card; its buttons stay at its bottom).
- The approval box has one main button, 〔只批准这次〕. (Since 2026-11-04 it is a card in the message stream, under the plan:
  docs/decisions/2026-11-04-approval-card-in-stream.md.)
- Yolo is said one way, v7.2's: the bar 「Yolo 开着：AI 每一步都直接做，不问你；往外发的内容照样先给你看。」
- The four modes' tips are JJ's final words, copied from the frozen prototype c604fd65 (MODES), full stops included (Deja,
  2026-11-04): 「只出计划，不改项目。」「改项目前先问你；撤不回的每次都问。默认是这个。」「能撤销的直接做，撤不回的先问你。」
  「每一步都直接做，不问你；往外发的内容照样先给你看。打开前会再确认一次。」; English as there. The assistant's mode capsule
  (#107) says the same four.
