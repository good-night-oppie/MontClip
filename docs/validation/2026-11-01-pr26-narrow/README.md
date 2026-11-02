# PR26 narrow-window and first-run project fixes (VV real-window findings)

Runner: `node desktop/run-narrow-pane.cjs <label>` (manual; fresh temporary profile,
visible always-on-top window resized with `setContentSize`, injected provider only,
no clipboard, no OS-level input). Clicks are `webContents.sendInputEvent` at the
real window coordinates of each control after checking `elementFromPoint` hits it.
`*.page.png` is `capturePage` (the app's own page); the results below go by these.
The `*.screen.png` OS screenshots of the window area were removed on 2026-11-02:
screen captures can take in other programs, and the repository keeps none (#47).

- `red/` — before the fix, default project of a fresh profile: `projectId:null`,
  Send shows 「请先打开或创建项目，再发送。」 and no review opens.
- `green/` — after the fix, 630×452, 804×535, 1270×800 (zh-CN, simple mode): the
  default project gets its id through the existing `pjLoad` adoption (no dialog),
  review opens, one injected reply; the whole reply is inside the message area
  without user scrolling, 「查看剪辑提案」 and the three reference buttons are
  fully visible and hit at their centres, page overflow 0, reply shows
  「成片约 00:03」 (mm:ss).
- `official-pane-regression.txt` — existing official-pane smoke (hidden,
  16 emulated layouts, IME, Escape, copy, stale reask) rerun after the change;
  the harness now opens “More” before picking a session on a short pane.

Not covered: physical mouse/keyboard, IME hardware, screen readers, real provider.
- `adopt-only/` — after QQ's review of a432149: the assistant adopts the id without
  `pjLoad` / `syncFromServer` (no reload path at all). Same visible-window run, fresh
  profile, default project: id adopted, review opens, 3 sizes pass.
- `more-red/` / `more-green/` — VV 2026-11-02: at 630×452 with More open, referencing
  two subtitles pushed the composer below the pane (red: draft centre y=270, not hit).
  Green: More and the reference chips shrink and scroll instead, the composer and Send
  stay visible and hit (`p630-more-refs`); the first Esc folds More, the second hides
  the pane, and the pane reopens with More folded (`p630-reopen`).
- `flake-runs.txt` — 12 full test runs looking for VV's intermittent failure; none
  reproduced.
