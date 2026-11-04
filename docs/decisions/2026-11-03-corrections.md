# The streamer's corrections, kept on this computer (backend)

Date: 2026-11-03. Asked by the owner: 「补上三样：卡片加『这段不是唱歌』、弹窗加『补一段』、主播的修改记在本机用来让下次更准
（不外发）。」 Spec: Deja's ADR 补记 (sha fb2e6964…, then 39a05471…), which takes precedence over the first message. Backend only; the interface follows
the frozen v12 (原型-v12.html d289ff06…, 交互说明-v12.md d59748f7…; v11 is void) and comes after this backend: the setting
is 「记住我的剪辑习惯」 in 设置 › 自动出切片 (the switch, how many of each kind of change, 〔清空记录〕); a card a habit moved says
「↺ 按你以前的习惯…· 这次不用 · 去设置」.

## Deja's decisions (2026-11-03)

- **Kinds: 聊天 (`chat`) and 整活 (`stunt`) are added.** From v12: 补一段 offers 唱歌、互动、聊天、整活、别的, and habits are
  counted per kind. Both capability schemas, the records and the LOSO's per-kind scoring carry them; no rule finds a chat
  or stunt part — like 互动, only the streamer's own moves shift their start and end.
- **「不要这条」 twice → not ticked by default: not done.** v12 does not have it, and the search has no kind fine enough to
  tell the parts apart (e.g. a countdown before a lottery). What stays is the same-recording rule below. The interface and
  this record make no promise that a taken-out kind is left unticked next time; decided again once real 「不要这条」 records
  exist.
- **Danmaku density in the records: deferred.** v12's frozen wording says only a few numbers about the sound are kept
  (「只存几个声音统计数字」); danmaku numbers would not match it, and nothing shows yet that they make the search closer.
  Decided again, with the wording, once real data and the LOSO show it helps (QQ to review then).
- **The singing bar: off** (below), **the shift: on**, **the same recording: a part marked 不是唱歌 does not come back**,
  **one file per MontClip profile** (`default`).

## Two card edits (`segment-edits.js`)

- `set_segment_kind {id, kind}` — a 「自动出切片」 card's kind: `song` 唱歌 / `interaction` 互动 / `chat` 聊天 / `stunt` 整活 /
  `moment` 普通高光 / `other` 其他, in that order (互动 right after 唱歌, ADR 39a05471, the interface shows 〔互动〕: 连麦、PK、读
  SC; 聊天 and 整活 from v12). Only the kind changes; made 唱歌, the card keeps its start and end. 补一段 offers
  `ADD_ORDER`: 唱歌、互动、聊天、整活、别的 (v12).
- `add_segment {mediaId, from, to, kind}` — a new card from IN–OUT, inside its recording, at least 5 s, after the other
  cards (their best-first order is not touched).
- Both are host capabilities in `capabilities.js`, `undoable`, with argument schemas; the streamer's buttons and the AI
  call the same functions. Each gives the cards after it, the event (capability + args) for `agent-events.js`, how to undo
  it, and the correction it teaches.

## The corrections (`corrections.js`, `desktop/corrections-store.js`)

- A record holds numbers and fixed words only: the kind changed (from, to), a part added (kind), a start / end moved
  (seconds), a card taken out (kind); the recording's length; the part's length, usual level and how often it pauses.
  A 「不是唱歌」 may also carry which recording (its 16-hex `recordingKey`) and the part's start and end, in seconds.
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
- `bar` — **off** (`BAR_ON` false; Deja, 2026-11-03, from the numbers below: 0.19 of recall for 0.02 of precision is not
  worth it). With it off the search keeps songs.js PAUSE 0.12. Its code and tests stay (`rules(records, {bar: true})`),
  and it is decided again once JJ's and VV's real use has left real corrections to run the LOSO on. What it does when on:
  「不是唱歌」 (a song made another kind) 4 of the last 5 kind changes involving 唱歌: the singing bar goes up (songs.js
  PAUSE down to the median pause of those parts); 「是唱歌」 4 of 5: it goes down (PAUSE up). Never past half of 0.12 either
  way. The search gets it through `songOptions(rules)`.
- **The same recording** (not a habit: one mark is enough, the bar off or on): a part marked 「不是唱歌」 is not a song card
  again when the same recording is searched again — a song card more than half of whose length lies inside the marked
  part becomes that part again, as the kind the streamer gave it (`apply(cards, rules, {recKey})`; see below). **Measured against the card's own length** (Deja, decided), and
  exactly half does not count: a long card is not taken out whole because a short marked part lies inside it. The 「不是唱歌」 record carries the recording's key and the part's
  start and end (seconds); the key is `recordingKey(duration, loudness)` — the length and the loudness bins (0.1 dB),
  hashed (FNV-1a, 64 bits, 16 hex digits). No path, no file name. 「是唱歌」 marks nothing away.
  **Changed after VV's real-window review of 12f4f21 (Deja, 2026-11-03):** 「不是唱歌」 says the part is not a song, not that
  the streamer does not want it. So the part is not dropped: the same recording searched again shows one card for it, as
  the kind it was given (热闹, 互动 …), at the start and end the streamer had, marked 你改的 (`changedFrom: "song"`, rule
  `not-song`, not moved by a habit), with the reason 「上次你标了这段不是唱歌，这次照你改的出，开头结尾和上次一样。」
  (wording for JJ). Only a part also taken out (不要这条) stays away: a taking-out record now carries the recording's key
  and the part too (`rules().gone`); a plain taking-out still changes nothing on the next search. Not handled yet: 「是唱歌」
  on that card afterwards does not cancel the mark (only a song made another kind carries the part).
  The card is not cut down to a 1-minute clip with the other cards: it has no danmaku peak to centre one on, so it keeps
  the part as marked (Deja: intended).
- 互动, 聊天 and 整活 have their own habits like every kind; no rule finds their parts — only the streamer's own moves
  shift their start and end. A song made one of them counts as 「不是唱歌」; between them and 普通高光 the singing bar is not
  touched.
- Every card lists the rules that touched it (`card.rules`: `shift-start:song`, `shift-end:song`, `song-bar`); a habit
  says how many of how many (`of`, `n`: 「你以前 5 首歌里有 4 首…」). A moved card keeps where it was (`was`), and
  `revert(card)` is 〔这次不用〕 for that card.
- No rules (off, or nothing kept): exactly the cards and the search the app had (tested: the same JSON, the same songs).

## The evaluation stays clean

`real-tests/songs-golden.cjs` runs with corrections off; `--corrections <records.json>` (a file given by hand, never what
the app kept) turns them on. They come from the same streamer as the golden recordings, so using them by default would
leak the answers into hit_rate. `real-tests/corrections-loso.cjs` is the leave-one-streamer-out check below.

## STATUS (2026-11-03, local golden set, numbers only)

There are no real corrections yet. `real-tests/corrections-loso.cjs` leaves one streamer out at a time (13 streamers: the
recordings sharing a video id) and simulates corrections from every other streamer's recordings — a found song near a
labelled start trimmed to it, a found song with none 「不是唱歌」, a labelled song nothing was found for 「是唱歌」 — then
scores the left-out streamer with corrections off and on. The corrected spec (±5 s, 4 of the last 5, both directions):

| | found | recall@10 | precision@15 | median start error |
|---|---|---|---|---|
| off | 482 | 0.65 | 0.12 | 4.0 s (60 matched) |
| the shift and the bar | 355 | 0.55 | 0.14 | 4.1 s (51 matched) |
| the shift alone | 482 | 0.67 | 0.12 | 3.0 s (60 matched) |
| the bar alone | 355 | 0.48 | 0.14 | 4.5 s (49 matched) |

**Final configuration** (Deja, 2026-11-03: the shift on, the bar off, the same-recording mark on), re-run with the code as
it ships:

| | found | recall@10 | precision@15 | median start error |
|---|---|---|---|---|
| off | 482 | 0.65 | 0.12 | 4.0 s (60 matched) |
| **on, as shipped** | 482 | **0.67** | 0.12 | **3.0 s** (60 matched) |
| the same recording searched again, with its own 不是唱歌 marks only | 61 | 0.65 | 0.98 | 4.0 s (60 matched) |

- As shipped equals the shift alone: no left-out streamer shares a recording with the others, so the same-recording mark
  cannot act across folds. It is scored apart on the last line: each recording searched a second time with the
  不是唱歌 marks simulated from its own first search. That is the upper bound of what a streamer who marks every wrong card
  sees: the search is deterministic, so every marked card goes (482 → 61 found, precision 0.12 → 0.98) and no labelled
  song is lost (recall 0.65 both times). **This is an upper bound, not the effect to expect**: the simulation marks every
  wrong card, which a streamer will not do; real marks cover only some of them.

- 互动, 聊天 and 整活, each scored apart (a label in both 整活 and 互动 counts as 互动):

  | kind | labels | matched to a highlight candidate within 15 s | folds with a habit | median start error off / on |
  |---|---|---|---|---|
  | 互动 | 16 (all in one recording) | 0 | 0 of 13 | – |
  | 聊天 | 0 | 0 | 0 of 13 | – |
  | 整活 | 26 | 2 | 0 of 13 | 14.0 s / 14.0 s |

  Too few to form a habit (4 of the last 5 are needed): nothing to measure yet. The script prints these lines, so it
  measures once there is data.
- **The end error cannot be scored**: only 4 parts in the golden set have a labelled end time (4 of 226), and none of them
  was matched.
- The start shift (about −4 s in every fold) helps: starts a second closer, recall a little up (0.65 → 0.67).
- **The ±5 s cap does not cost recall.** The mean shift a habit asks for is −4 s in 11 folds and −4.4 / −4.62 s in the
  other two, so the cap never bites on this data: the shift alone keeps all 482 found songs and lifts recall. The drop
  with both rules on (0.65 → 0.55) is the bar's, not the cap's (the bar alone: 0.48).
- The bar went to its floor (0.06) in every fold: most simulated corrections are 「不是唱歌」 (precision is 0.12), so the
  habit always forms; it buys a little precision for a large loss of recall. **Decided (Deja): off until real corrections
  exist.**
