# Gap repair acceptance — 2026-11-05

Implementation tested: `3af43de8`. Machine-readable, path-free results:
[gap-acceptance-results.json](gap-acceptance-results.json).

## Real headless Chrome workflow and internal sync

Run `node scripts/gap-chrome-acceptance.cjs` with Node 22+, Chrome and an available
H.264 encoder. It creates an isolated data directory and Chrome profile, records
owned child PIDs, calls the actual editor repair handler, checks preview pixels,
and calls the real `fastExport` compositor. It closes only those owned processes.
No existing browser profile or user project is opened. Output artifacts remain
in the printed local temp directory for inspection.

The fixture has synchronized white frames and 20 ms 1 kHz beeps every half-second.
Two five-second TS segments are joined with a +300 s timestamp offset, converted
to MKV and truncated by 128 bytes. The fixture explicitly disables B frames; an
initial attempt with missing leading DTS plus reordered PTS was correctly refused
as a backward clock, and was not counted as a successful acceptance run.
Input generation uses H.264/AAC; this run used h264_nvenc. The measured internal
gap is 294.979 s. This is a separate sync fixture, not the earlier continuous-sine
FLV/MKV comparison fixture.

The measurement decodes actual frame PTS (not frame index divided by frame rate),
detects white-frame onsets and PCM beep onsets, includes the audio stream origin,
then pairs each event once. There are 20 matched pairs and no unmatched events.
Preview checks at 1.0/1.24 s and 6.0/6.24 s see black/white pixels on both sides
of the removed gap (luma 0/255), so this is not merely a successfully opened page.

| Output | Duration | Before-gap worst A/V error | After-gap worst A/V error | Limit |
|---|---:|---:|---:|---:|
| Repaired MP4 | 9.966666 s | 11.937 ms | 11.458 ms | 33.333 ms (one frame) |
| Chrome exported MP4 | 9.966667 s | 11.937 ms | 11.458 ms | 40 ms |

Both checks pass. Negative signed offsets mean the beep starts slightly before
the flash; the table gives absolute error. The source synthetic baseline was also
checked before introducing the gap. The aligned-success suffix remains off until
the remaining real-sample acceptance limitation is resolved.

## Europa real recording, in place

`scripts/gap-real-acceptance.cjs` was run on europa against the P3 recording.
Only code was transferred to europa. The original recording was read in place;
no video, audio, frame or transcript was copied out. Repair output was placed in
a newly created OS temp directory and removed in `finally`; the temporary code
directory was also removed afterward. Source hash and file identity/stat version
were unchanged. This run explicitly used europa's installed FFmpeg.

- Container header duration: unavailable.
- Packet/probed duration: **256.28 s**.
- Internal gaps over the scanner threshold: **0**, total **0 s**.
- Video streams: **1**; audio streams: **0**.
- Repaired duration: **256.28 s**, VP9 transcode.
- Strict complete output decode: passed; repaired frame at 57 s: available.
- Original unchanged: yes. Temporary output removed: yes.
- Before/after-gap A/V alignment: **not measurable / not applicable**. This real
  file has neither an audio track nor an internal gap. This is not a 0 ms result
  and cannot be claimed as a passed real-world gap-sync test.

The real-file run confirms duration recovery and editability, but cannot supply
the requested real-file A/V evidence. Keep #167 Draft unless the requester accepts
this as not applicable, or a suitable real recording with audio and a gap is
provided on europa for the same in-place procedure.

## Refusal text pending JJ approval

The current plain-language fallback is already marked DRAFT in ui-preferences.js:

- 中：有些编辑无法跨过空档对齐。工程没有改动。请先处理空档里的字幕、弹幕或切点，再试一次。
- EN: Some edits cannot be aligned across this gap. The project is unchanged. Resolve the subtitles, danmaku or cuts in the gap, then try again.

For the three intentionally unsupported cases, more specific drafts for JJ are:

| Case | Chinese draft | English draft |
|---|---|---|
| Speed ramp | 这份素材有片段用了变速曲线，暂时不能自动对齐。工程没有改动。请先去掉变速曲线，再试一次。 | Some clips using this file have speed ramps, so their timing cannot be lined up automatically yet. The project is unchanged. Remove the speed ramps, then try again. |
| Unknown caption source | 有些字幕不知道对应哪段画面，暂时不能自动对齐。工程没有改动。请先处理这些字幕，再试一次。 | Some subtitles cannot be matched to a source clip, so their timing cannot be lined up automatically yet. The project is unchanged. Resolve those subtitles, then try again. |
| Composition open | 你正在编辑合成，请先回到主时间线，再点〔帮我修好〕。工程没有改动。 | You are editing a composition. Return to the main timeline, then click “Fix it for me”. The project is unchanged. |

These specific alternatives are proposals, not silently promoted to JJ-approved
strings. Button wording must come from the existing button key when wired.
