# P2: highlight candidate cards from local signals (2026-11-02)

Status: implemented in this PR, for review. Follows the phase plan in
`docs/decisions/2026-11-02-agent-architecture-gemini-capcut.md` (#35), where P2 was "highlight candidate cards,
local signals only".

## Clean-room exception

- **The owner's words (2026-11-02, relayed by Deja):** 「先做P2，参考FunClip， Bili Shadow Replay和 Rea的逆向分析记录，可以打破clean room 的规矩，l我们只看不照抄。」
- **Date:** 2026-11-02. It applies from this date to P2 and to the architecture ADR (#35), which carries the same section.
- **Material that may be consulted:**
  - FunClip (`modelscope/FunClip`, MIT);
  - Bili Shadow Replay (`Xinrea/bili-shadowreplay`, MIT);
  - Rea's reverse-engineering research records, including the research-side files marked "not for
    implementation" (`RESEARCH-SIDE-routing-notes-NOT-FOR-IMPLEMENTATION.md`, sha256 `3bce8e42…`, whose earlier
    version was `8c69bdee…`).
- **Rule: look, don't copy.**
  - No code is copied from any of them.
  - No decompiled fragment and no internal address is copied.
  - No data format is reproduced verbatim.
  - Ideas may inform the design, and the design is written in MontClip's own terms and code.
- **What was looked at for P2:**
  - FunClip's README: its features — ASR, text- and speaker-based clipping, LLM clipping, multi-segment clipping,
    SRT for the whole video and for the segments.
  - Bili Shadow Replay's README and three of its docs pages (`docs/usage/features/clip.md`, `danmaku.md`,
    `docs/development/frontend/agent.md`).
  - No source file of either project was opened.
  - Rea's research records were not needed for P2 and were not used.
- **Ideas taken:**
  - candidates follow whole sentences (FunClip's subtitle-based ranges);
  - a burst of danmaku marks a highlight, and a click jumps there (Bili Shadow Replay: a danmaku-density chart,
    「高峰区域通常对应精彩片段」, click to jump; its 「智能推荐」 adds selections);
  - the person picks the ranges, and several can be kept at once (both).
- **Confirmed:** no code, decompiled fragment or data format from these sources is in this PR. The scoring,
  thresholds, reasons and interface are MontClip's own.

## What it does

The Transcript tab gets **高光候选 / Highlight candidates**. It opens a dialog. First it reads the signals, which
takes a few seconds per minute of timeline, then it shows up to 12 cards, best first.

- **Signals (local only; nothing is sent; no model runs):**
  - **Sentences:** the caption clips on the timeline (enabled, on enabled lanes).
  - **Loudness:** each sounding clip's file, read once by the server (`signals.js`,
    `GET /api/signals/loudness?src=`). ffmpeg decodes it as a stream to 8 kHz mono, one dBFS value per 0.5 s, and the
    result is cached in `analysis/signals/` per file version. The page maps it onto the timeline through each clip's
    start, in point, speed, volume and gain, adding the clips that sound at once in power. Effects, faders and volume
    keyframes are not applied: it shows where the timeline is louder, not the export mix. Without a server (the web
    demo), or when the server cannot read a file, the timeline's own mix is rendered in 60 s pieces instead.
  - **Beats:** the existing beat analysis (`beats.js`) on the mix, only for timelines up to 10 minutes.
  - **Danmaku:** imported danmaku (`project.danmaku`, one entry per recording, in the recording's seconds — see
    `danmaku.js` and "Danmaku (Bilibili recordings)" in CLAUDE.md), mapped onto the timeline through each clip that
    plays the recording.
- **Candidates** (`highlight-candidates.js`, pure, tested):
  - With sentences, consecutive sentences are grouped, a pause of 1.2 s or more starts a new group, and groups run
    4–45 s, splitting longer runs at a sentence. Without sentences, the spans of sound between silences are used
    (quieter than −45 dBFS for at least 1 s), cut into pieces of at most 45 s.
- **Reasons**, each with its signal, the value, what it was compared with, and the window it was measured on.
  A card appears only with at least one reason:
  - **loudness:** the group's mean (power) at least 4 dB above the timeline's median, or its peak at least 8 dB above;
  - **danmaku:** at least 1.8× the timeline's average rate, and at least 3 danmaku;
  - **speech:** characters per second at least 1.35× the median sentence;
  - **beat:** a steady beat inside the window. It only adds to a card that already has another reason; a music
    bed alone is not a highlight.
- **Score:** loudness weighs most (up to 0.55), then danmaku (0.45), speech (0.15) and beat (0.05). Ties go to
  the earlier card.
- **Empty states**, each with its own text:
  - nothing on the timeline;
  - no sentences and no sound to read;
  - nothing stands out.
- **Go to:** pauses and moves the playhead to the card's start. The project, its revision and undo are untouched.
- **Keep the ticked ones:** the ticked ranges, in timeline order, go through the range engine
  (`FableCutRangePlan.create`, the one the sentence dialog uses). The result is one undo step, with IN/OUT and
  caption provenance as the sentence dialog keeps them. If the project changed while the dialog was open, it
  refuses and asks to reopen.

## Measured on a recording of real length (Deja, #52)

A synthetic 2-hour clip (160×90, 10 fps, VP9 + AAC mono, made with MontClip's own ffmpeg; a loud 8 s every
10 minutes) on the timeline with 1200 synthetic sentences. It was measured with `desktop/highlights-perf.cjs`
(fresh profile, hidden window) on an i7-11800H with 16 threads.

| | read signals | renderer peak | app total peak | cards |
|---|---|---|---|---|
| first version (the page renders the mix) | 705 s | 3.1 GB | 3.8 GB | 0 — the 2-hour sound could not be decoded in the page |
| now (server stream + mapping) | **3.0 s**, uncached | **213 MB** | 907 MB | **12**, one per loud stretch |

ffmpeg's own memory is not in the app's process metrics. The temporary clip and profile were deleted after the run.

## Relation to P1

P1 (the local media index, built in the background and stored by content hash) is not built yet. P2 therefore
computes the minimal subset it needs on demand: loudness, silences, beats, sentences and danmaku. The per-file
loudness cache (`analysis/signals/`, keyed by the file's name, size and modification time) is the first piece of
that index. P1 takes it over, moves it to content hashes and runs it in the background; the candidate logic stays
as it is.

## Not covered (stated, not claimed)

- Real (not synthetic) long recordings, and machines slower than the one measured.
- Danmaku: the reason is checked in the real editor with synthetic XML only (`desktop/danmaku-smoke.cjs`), not with
  a real stream's danmaku.
- Shot changes and motion (which `highlights.js` uses for `fablecut_highlights`) are not signals here.
- No model ranks or describes the cards; P3 brings the cards into the chat.
- Wording is for JJ, and the real window is for VV.
