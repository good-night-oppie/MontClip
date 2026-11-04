# 记住我的剪辑习惯: the v12 interface (evidence)

Code at `525dc9d` (VV's review of 12f4f21 and JJ's 〔打开〕; first taken at `3e3b324`). Windows, fresh profile, hidden offscreen window, synthetic sound only; the pictures are
`capturePage` of the smoke's own window, no desktop capture.

    MONTCLIP_SHOTS_OUT=<this folder> electron desktop/corrections-ui-smoke.cjs --montclip-smoke --user-data-dir=<fresh>

- `smoke-output.txt` — CORRECTIONS_UI_PASS and what it read.
- `corrections-add-dialog.png` — 补一段 from IN–OUT, before a kind is picked.
- `corrections-habit.png` — the next search after five song starts moved 4 s earlier: the habit line and the evidence.
- `corrections-learn-page.png` — the page 记住我的剪辑习惯 opened from 去设置.
- `corrections-not-song-back.png` — the same recording searched again: the part marked 不是唱歌 back as 热闹的一段, 你改的, with the reason.
- `corrections-added-back.png` — after 〔换一场 / 改设置〕 and searching again: the card added with 补一段 back, 你补的, with its name.

The smoke also checks: 〔撤销〕 and Ctrl+Z redraw the card and the footer (and Ctrl+Z never reaches the timeline); every disabled
`.btn` in the dialogs and on the settings page is faded with no hand cursor; 补一段's name box is the Export dialog's text box.
