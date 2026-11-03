# The streamer's corrections, kept on this computer (backend)

Date: 2026-11-03. Asked by the owner: 「补上三样：卡片加『这段不是唱歌』、弹窗加『补一段』、主播的修改记在本机用来让下次更准
（不外发）。」 Spec: Deja's ADR 补记 (sha fb2e6964…, then 39a05471…), which takes precedence over the first message. Backend only; the interface follows
the frozen v11 (原型-v11.html 11b0ce34…, 交互说明-v11.md 6e564931…) and comes after this backend: the setting is
「记住我的剪辑习惯」 (the switch, how many of each kind of change, 〔清空〕); a card a habit moved says 「按你以前的习惯调过 ·
去设置」 and offers 〔这次不用〕.

## Two card edits (`segment-edits.js`)

- `set_segment_kind {id, kind}` — a 「自动出切片」 card's kind: `song` 唱歌 / `interaction` 互动 / `moment` 普通高光 / `other`
  其他, in that order (互动 right after 唱歌, ADR 39a05471; the interface shows 〔互动〕: 连麦、PK、读 SC). Only the kind
  changes; made 唱歌, the card keeps its start and end.
- `add_segment {mediaId, from, to, kind}` — a new card from IN–OUT, inside its recording, at least 5 s, after the other
  cards (their best-first order is not touched).
- Both are host capabilities in `capabilities.js`, `undoable`, with argument schemas; the streamer's buttons and the AI
  call the same functions. Each gives the cards after it, the event (capability + args) for `agent-events.js`, how to undo
  it, and the correction it teaches.

## The corrections (`corrections.js`, `desktop/corrections-store.js`)

- A record holds numbers and fixed words only: the kind changed (from, to), a part added (kind), a start / end moved
  (seconds), a card taken out (kind); the recording's length; the part's length, usual level and how often it pauses.
  Anything else — a file name, a path, text, another key — is refused, not trimmed.
- Kept by the main process under `<userData>/corrections/`, newest last, at most 5000. Six fixed channels
  (`montclip:corrections:status|records|append|undo|setEnabled|clear`), behind the same guard as the other settings; the page
  passes no path. Never in the project file; the server and the MCP server never read them.
- **Never sent.** The AI assistant, the song-name lookup and cloud transcription do not read them (the earlier
  「a numbers-only summary when the streamer agrees」 is void). Locked by `test/corrections-private.test.js`: no code outside
  their own files names them, a request built as the assistant builds it holds none of their fields, and the outgoing
  preview (the review box, its bundle, the pane) never names them.
- Each record has the store's id; undoing an edit takes its record back (`undo(id)`) — an undone change
  is not a habit (v11). `status()` also counts each kind of change for the settings page (挪开头结尾 · 不要这条 · 改类型 ·
  补一段).
- Off: nothing is kept and nothing is used. 〔清空〕 deletes the record files (tested: only the on/off switch is left).
  `status()` says how many.
- **One file per MontClip profile** (Deja, 2026-11-03): a MontClip on a computer is one streamer's, so the corrections are
  `<userData>/corrections/default.json`, not split by folder, recording or anything else. The store takes no scope (a
  scope option is refused, tested). Two streamers sharing one computer would use two MontClip profiles.

## The rules (fixed, no model)

Constants: `MAX_SHIFT` 5 s, `HABIT_WINDOW` 5, `HABIT_MIN` 4, `BAR_BASE` 0.12 (songs.js `DEFAULTS.PAUSE`), `BAR_RANGE`
[0.06, 0.18]. A rule is a habit: the same kind, the same direction, 4 of the last 5.

- `shift` — a kind's start (or end) moved the same way 4 of the last 5 times: cards of that kind move by the mean of
  those moves, at most ±5 s.
- `bar` — 「不是唱歌」 (a song made another kind) 4 of the last 5 kind changes involving 唱歌: the singing bar goes up (songs.js
  PAUSE down to the median pause of those parts); 「是唱歌」 4 of 5: it goes down (PAUSE up). Never past half of 0.12 either
  way. The search gets it through `songOptions(rules)`.
- 互动 has its own habits like every kind; no rule finds 互动 parts — only the streamer's own moves shift their start and
  end. A song made 互动 counts as 「不是唱歌」; 互动 ↔ 普通高光 does not touch the singing bar.
- Every card lists the rules that touched it (`card.rules`: `shift-start:song`, `shift-end:song`, `song-bar`); a habit
  says how many of how many (`of`, `n`: 「你以前 5 首歌里有 4 首…」). A moved card keeps where it was (`was`), and
  `revert(card)` is 〔这次不用〕 for that card.
- No rules (off, or nothing kept): exactly the cards and the search the app had (tested: the same JSON, the same songs).

## The evaluation stays clean

`real-tests/songs-golden.cjs` runs with corrections off; `--corrections <records.json>` (a file given by hand, never what
the app kept) turns them on. They come from the same streamer as the golden recordings, so using them by default would
leak the answers into hit_rate. `real-tests/corrections-loso.cjs` is the leave-one-streamer-out check below.

## STATUS (2026-11-03, local golden set, numbers only; re-run on 3e19498 (corrections.js as it is now) with the corrected spec: ±5 s, 4 of the last 5, both directions)

There are no real corrections yet. `real-tests/corrections-loso.cjs` leaves one streamer out at a time (13 streamers: the
recordings sharing a video id) and simulates corrections from every other streamer's recordings — a found song near a
labelled start trimmed to it, a found song with none 「不是唱歌」, a labelled song nothing was found for 「是唱歌」 — then
scores the left-out streamer with corrections off and on:

| | found | recall@10 | precision@15 | median start error |
|---|---|---|---|---|
| off | 482 | 0.65 | 0.12 | 4.0 s (60 matched) |
| on (both rules) | 355 | 0.55 | 0.14 | 4.1 s (51 matched) |
| the shift alone | 482 | 0.67 | 0.12 | 3.0 s (60 matched) |
| the bar alone | 355 | 0.48 | 0.14 | 4.5 s (49 matched) |

- 互动, scored apart: the golden set has 16 互动 labels, all in one recording (so no fold ever gets 互动 corrections from
  another streamer: a 互动 habit formed in 0 of 13 folds), none with an end, and none has a highlight candidate within
  15 s of its start to stand for the streamer's card — nothing to score yet. The script prints the line, so it measures
  once there is data.
- The end error cannot be scored: the golden labels have an end for 4 of 226 parts, none of them matched.
- The start shift (about −4 s in every fold) helps: starts a second closer, recall a little up (0.65 → 0.67).
- **The ±5 s cap does not cost recall.** The mean shift a habit asks for is −4 s in 11 folds and −4.4 / −4.62 s in the
  other two, so the cap never bites on this data: the shift alone keeps all 482 found songs and lifts recall. The drop
  with both rules on (0.65 → 0.55) is the bar's, not the cap's (the bar alone: 0.48).
- The bar went to its floor (0.06) in every fold: most simulated corrections are 「不是唱歌」 (precision is 0.12), so the
  habit always forms; it buys a little precision for a large loss of recall. **For Deja: keep the bar as specified, narrow
  its range, or leave it off until real corrections exist.**
