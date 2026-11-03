# 自动出切片 review cards: JJ's v11 visual review (evidence)

Code at `e7ea9fb`. Windows, fresh profile, hidden offscreen window, synthetic sound only (test/songs-synth.js); the pictures
are `capturePage` of the smoke's own window, no desktop capture.

    MONTCLIP_SHOTS_OUT=<this folder> electron desktop/slice-cards-smoke.cjs --montclip-smoke --user-data-dir=<fresh>

- `smoke-output.txt` — SLICE_CARDS_PASS and what it measured.
- `slice-cards-1280x800-top.png` — the review page: the 估的 note once above the cards, the name hint on the first card.
- `slice-cards-1280x800-card.png` — two cards after 不要这条 and 〔撤销〕: the second card has no name hint, 不要这条 at the right.
- `slice-cards-630x460.png` — the narrow window.
