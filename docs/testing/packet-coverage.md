# Timestamp coverage experiment (draft)

This is an internal diagnostic module, not a change to imported media clocks.
`packet-clock.js` is deliberately not called by the editor or `media-probe` yet.
Existing projects, clip lengths and source seeking keep their current behavior.

## Reproduce

Run `node scripts/packet-timestamps-bench.js` and
`node --test test/packet-clock.test.js test/packet-coverage-regression.test.js`.
The H.264/AAC fixture copied from #157 contains a synthetic test pattern and sine
tone. Two five-second TS parts, the second offset by 300 seconds, are concatenated.
FLV and Matroska are written with `-copyts` to pipes, then truncated by 2048 bytes.
The Matroska muxer rejects the TS AAC extradata in this build; the script explicitly
records its AAC re-encode fallback. No real recording is used.

Windows bundled FFmpeg results, 2026-11-05:

| Output | Bare remux | With genpts | Strict output decode |
| --- | ---: | ---: | --- |
| FLV to MP4 | 304.920 s | 304.920 s | Both fail |
| MKV to MP4 | 304.903 s | 304.903 s | Both pass, hole remains |

Primary-video coverage is 9.940 s (FLV), 9.907 s (MKV). Both have a DTS hole
of 294.959 s. This measures packet timestamps, not proof of complete decoding.
The truncated FLV has a damaged final packet: coverage alone cannot authorize
repair success. Keep the strict decode check.

## Clock contract

- Choose one default video track, excluding attached pictures; otherwise choose
  one default audio track. Do not add overlapping audio/video lengths.
- Stream compact packet records; do not buffer the entire packet list. Detect
  discontinuities from DTS, falling back to PTS only when DTS is absent. PTS
  bounds each presentation span, preserving B-frame ordering within a span.
- A forward gap greater than 2 seconds starts a new span. Smaller holes remain
  inside their span: this is not a strict union of every packet's interval.
- Reject backward DTS, overlapping presentation spans, unknown packet lengths,
  excessive discontinuities, timed-out and failed scans rather than inventing
  a source clock. No partial scan is published as a complete answer.
- `coverage(scan)` returns separate `coveredDuration`, `sourceDuration`, ranges
  and gaps. It does not modify the project's `duration`.
- `toSource` maps covered seconds to absolute source PTS. `fromSource` returns
  null for time in a hole. The seam selects the following span. EOF is a valid
  trim boundary, not a frame. `sourceRanges` splits a clip crossing a hole.
- FFmpeg `-ss` uses time relative to `format.start_time`: subtract that origin
  from the absolute PTS before seeking. The real test compares the frame after
  the seam with a sequential frame-number decode; pixels match exactly.

## Remaining integration and product decision

The helper maps clocks; it is not yet a working timeline feature. The two
registered-duration regression assertions remain executed TODO failures. Browser
preview, WebCodecs export, source monitor, offline audio, analyze.frame and
background metadata writes must all consume the same agreed clock before those
TODOs can be removed. Existing clip In/Out values must not be silently reinterpreted.

A forward packet hole alone cannot distinguish a timestamp discontinuity from
real lost recording time. #130 proposes keeping lost time as a held picture and
silence; automatically compressing every hole conflicts with that behavior.
Decision requested: automatically compress flagged new imports, or require an
explicit choice to remove a hole while preserving the existing clock by default.
Recommendation: explicit choice, with old projects unchanged. Both behaviors can
reuse this scan, but application, audio silence and clip migration depend on it.

After that decision: wire preview/export/audio and MCP seeking together; add
background scan scheduling and server/editor merge; give #157 the covered repair
baseline only when validating a normalized output. Validate audio alignment,
clip positions, exports, undo and existing-project migration end to end. Do not
replace the baseline alone: current remux outputs still contain the hole.

Linux and europa real-file checks: not run in this round.
