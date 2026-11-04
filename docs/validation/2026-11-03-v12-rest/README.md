# 自动出切片 v12, what was left (evidence)

Windows, fresh profile, hidden offscreen window, synthetic sound only; pictures are `capturePage` of the smoke's own
window, no desktop capture. The test window is allowed narrower than the app's minimum (640 wide, about 644 px inside),
so 630×460 and a phone-wide 390×844 are what they say.

    MONTCLIP_SHOTS_OUT=<this folder> electron desktop/first-screen-smoke.cjs --montclip-smoke --user-data-dir=<fresh>

- `smoke-output.txt` — FIRST_SCREEN_PASS and what it measured.
- `first-screen-1280x800.png` — the first card down to its 为什么选 above the footer; the title on one line.
- `first-screen-630x460.png` — 整场一览 folded, 够好的只有 one line: the first card's name above the footer.
- `first-screen-390x844.png` — the footer one line: 「放到时间线上（2）」 / 「导出 2 条」, no summary.

## VV on e31d808 (Deja, 2026-11-03)

- 「找到 N 条」 and 「圈出 N 段」 count every card the search found, the ones taken out included (a part added by hand with 补一段 is not something the search found, and is not counted). Taking one out, or taking all out and putting one back with Ctrl+Z, keeps N; the fold says how many are left under 拿掉的. Checked in Chinese and English: `test/auto-slices-ui.test.js` and `SLICE_CARDS_PASS` (`counts`).
- `all-out-1280x800.png`: the line under 全拿掉 at 1280 ends with 「新找。」 (`text-wrap: pretty`; the smoke checks the last line holds more than one character).
- `settings-learn-state.png`: 设置 › 自动出切片, 〔记住我的剪辑习惯〕 and 开着 level (middles within 1 px, checked in `FIRST_SCREEN_PASS`).
- `none-found-1280x800.png`: a recording silent all through, no danmaku — the real search finds nothing; the title is 「没有找到够好的段落」 as before. Seen, not changed here: under it the box still says 「够好的只有 0 条，没有凑满 5 条。」.
