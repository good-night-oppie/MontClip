# Steps a plan can really do: find the songs, find the highlights, export

Date: 2026-11-03. Asked by Deja: wire 「找歌 / 找高光 / 导出」 into the plan (P4's list) so that
「把我唱歌的部分一首一个切片剪出来」 runs from start to end, export through the system's Save window only. Stacked on
feat/agent-plan-list (#84); no PR before #83 / #84 merge.

## The steps

| capability | risk | what it does |
|---|---|---|
| `find_songs` | read | each recording on the timeline (or `args.mediaIds`) through `/api/songs` (songs.js); nothing in the project changes |
| `find_highlights` | read | each recording's loudness (`/api/signals/loudness`) and danmaku through highlight-candidates.js; the best `args.count` (1–20, default 5) |
| `keep_ranges` / `keep_sentences` | undoable | as before (CAS, one undo step of the plan's run) |
| `export_files` | sensitive | renders what this plan queued (else the whole timeline) through the export queue, then saves each file through the system's Save window |

- They are **host capabilities** in `capabilities.js`, not the MCP tools: `fablecut_highlights` cuts a new sequence and
  `fablecut_export` writes to `exports/`; the approval box shows the capability's own plain sentence, so a step that only
  finds must not be shown as one that cuts. The main process decides each step like any other (mode × risk), with the
  step's args (read only for a risk that depends on them, `Capabilities.riskOf`).
- `{"$step": n}` in a step's args stands for step n's ranges — the plan's own data, kept in the page for this run; only an
  earlier step, only an object with that one key, only ranges. An earlier step that found nothing stops the plan
  (「前面那一步什么都没找到」); any other reference is refused like a stale step.
- Names: the 「自动出切片」 dialog's (auto-slices.js `title`): 「第 n 首歌」 only once songs.js passes Deja's gate, until then
  「{time} 那段」. plan-steps.js has no names of its own.
- Clips that show the file with a speed ramp are left out (their sound doesn't sit on the timeline at one speed).

## One clip per range inside a plan

Outside a plan, `keep_ranges` with `per_range` opens the dialog for the streamer's own 〔应用〕, because it adds exports.
Inside a plan it is applied like the other edits (one undo step, CAS) and its clips are **queued**, not rendered; the export
is the plan's `export_files` step, which is sensitive: asked every time in 手动, until 「都批准」 in 自动, and in every mode
each file goes through the Save window, where the streamer picks the place (or cancels). The streamer's own waiting
items in the queue are held back while the plan exports and put back afterwards. Nothing is written by a path of its own:
`saveDownload(…, {exportFile:true})` → `will-download` → the native dialog (`desktop/export-downloads.js`); a saved file's
session copy goes, as for the queue's own 〔保存〕.

If every Save window is closed, the step stops the plan (「你关掉了保存窗口，什么都没保存。」); the exported videos stay in
the queue with 〔保存〕.

## Not covered

- Cancelling a running find from the plan (the 「自动出切片」 dialog's Stop): a find runs to its end.
- The format note tells the model the new steps; a real model's plans are not measured (mock transport in the smoke).
- New words for JJ: `own.pl-empty`, `own.pl-nothing-found`, `own.pl-find-failed`, `own.pl-export-failed`,
  `own.pl-save-cancelled`, and the three capabilities' plain sentences.
