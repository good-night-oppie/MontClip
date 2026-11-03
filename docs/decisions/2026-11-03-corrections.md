# The streamer's corrections, kept on this computer (backend)

Date: 2026-11-03. Asked by the owner: 「补上三样：卡片加『这段不是唱歌』、弹窗加『补一段』、主播的修改记在本机用来让下次更准
（不外发）。」 Spec: Deja's ADR 补记 (sha fb2e6964…), which takes precedence over the first message. Backend only; the
interface (设置 › 自动出切片 › 「记住我的修改，下次找得更准」: the switch, how many are kept, 〔清空〕) waits for v12.

## Two card edits (`segment-edits.js`)

- `set_segment_kind {id, kind}` — a 「自动出切片」 card's kind: `song` 唱歌 / `moment` 普通高光 / `other` 其他. Only the kind
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
- Kept by the main process under `<userData>/corrections/`, newest last, at most 5000. Five fixed channels
  (`montclip:corrections:status|records|append|setEnabled|clear`), behind the same guard as the other settings; the page
  passes no path. Never in the project file; the server and the MCP server never read them.
- **Never sent.** The AI assistant, the song-name lookup and cloud transcription do not read them (the earlier
  「a numbers-only summary when the streamer agrees」 is void). Locked by `test/corrections-private.test.js`: no code outside
  their own files names them, and a request built as the assistant builds it holds none of their fields.
- Off: nothing is kept and nothing is used. 〔清空〕 deletes the record files (tested: only the on/off switch is left).
  `status()` says how many.
- One streamer's file: MontClip has no streamer identity and the page does not know where a recording came from, so for
  now there is one scope, `default`, per MontClip profile; the store takes a scope (a short id or a hex digest, never a
  path) for when streamers can be told apart. **Deja to decide.**

## The rules (fixed, no model)

Constants: `MAX_SHIFT` 5 s, `HABIT_WINDOW` 5, `HABIT_MIN` 4, `BAR_BASE` 0.12 (songs.js `DEFAULTS.PAUSE`), `BAR_RANGE`
[0.06, 0.18]. A rule is a habit: the same kind, the same direction, 4 of the last 5.

- `shift` — a kind's start (or end) moved the same way 4 of the last 5 times: cards of that kind move by the mean of
  those moves, at most ±5 s.
- `bar` — 「不是唱歌」 (a song made another kind) 4 of the last 5 kind changes involving 唱歌: the singing bar goes up (songs.js
  PAUSE down to the median pause of those parts); 「是唱歌」 4 of 5: it goes down (PAUSE up). Never past half of 0.12 either
  way. The search gets it through `songOptions(rules)`.
- Every card lists the rules that touched it (`card.rules`: `shift-start:song`, `shift-end:song`, `song-bar`).
- No rules (off, or nothing kept): exactly the cards and the search the app had (tested: the same JSON, the same songs).

## The evaluation stays clean

`real-tests/songs-golden.cjs` runs with corrections off; `--corrections <records.json>` (a file given by hand, never what
the app kept) turns them on. They come from the same streamer as the golden recordings, so using them by default would
leak the answers into hit_rate. `real-tests/corrections-loso.cjs` is the leave-one-streamer-out check below.

## STATUS (2026-11-03, local golden set, numbers only)

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

- The end error cannot be scored: the golden labels have an end for 4 of 226 parts, none of them matched.
- The start shift (about −4 s in every fold) helps: starts a second closer, recall a little up.
- The bar went to its floor (0.06) in every fold: most simulated corrections are 「不是唱歌」 (precision is 0.12), so the
  habit always forms; it buys a little precision for a large loss of recall. **For Deja: keep the bar as specified, narrow
  its range, or leave it off until real corrections exist.**
