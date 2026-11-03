# The streamer's corrections, kept on this computer (backend)

Date: 2026-11-03. Asked by the owner: 「补上三样：卡片加『这段不是唱歌』、弹窗加『补一段』、主播的修改记在本机用来让下次更准
（不外发）。」 Deja's spec of the same day. This is the backend only; the interface waits for VV's v11 and JJ's review.

## Two card edits (`segment-edits.js`)

- `set_segment_kind {id, kind}` — a 「自动出切片」 card's kind: `song` 唱歌 / `moment` 普通高光 / `other` 其他.
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
  passes no path. Never in the project file, never read by the server or the MCP server.
- Off: nothing is kept and nothing is used. Emptied in one go. `status()` says how many.
- A numbers-only `summary()` exists for the assistant; it is sent only when the streamer opens the assistant and agrees.
  Not wired here.
- One streamer's file: MontClip has no streamer identity, and the page does not know where a recording came from, so for
  now there is one scope, `default`, per MontClip profile. The store takes a scope (a short id or a hex digest, never a
  path) for when streamers can be told apart. **Deja to decide.**

## The rules (fixed, no model)

- `shift` — per kind, the mean start / end shift of three or more trims of that kind, each at most ±10 s.
- `songBar` — three or more parts marked 「不是唱歌」: a song that pauses at least as often as the upper quartile of them
  becomes a 普通高光.
- Every card lists the rules that changed it (`card.rules`: `shift-start:song`, `shift-end:song`, `song-bar`).
- No rules (off, or nothing kept): exactly the cards the search gave (tested: the same JSON).

## Measured on the golden set (local only, numbers only)

There are no real corrections yet. Records were simulated from the golden set's **train** part only (a found song with no
labelled start within 15 s → 「不是唱歌」; a matched one → trimmed to its labelled start; 335 records) and the rules scored
on the **held-out** part (4 recordings, other streamers):

| held-out | found | recall@10 | precision@15 | median start offset (likely) |
|---|---|---|---|---|
| corrections off | 134 | 0.38 | 0.04 | 4.0 s |
| on (shift + upper-quartile bar) | 111 | 0.31 | 0.05 | 1.4 s |

The bar at the least rejected part (as first written) or at the median dropped held-out recall@10 to 0.23; the upper
quartile cost nothing over the shift alone. The shift brings the starts much closer but moved one of the 13 labelled
starts past the 10 s cut. This is across streamers; the corrections are meant for the same streamer, which the golden
set cannot score without the leak below.

## The evaluation stays clean

`real-tests/songs-golden.cjs` runs with corrections off; `--corrections <records.json>` (a file given by hand, never
what the app kept) turns them on, and the script prints only how many records it used. They come from the same streamer
as the golden recordings, so using them by default would leak the answers into hit_rate.
