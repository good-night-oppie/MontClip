# Timestamp coverage experiment (draft)

This is a read-only diagnostic API, not a change to imported media clocks.
`packet-clock.js` is used by background scan jobs but not by editor clock conversion or `media-probe`.
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
explicit skip-gap repair assertions remain executed TODO failures. Browser
preview, WebCodecs export, source monitor, offline audio, analyze.frame and
background metadata writes must all consume the same agreed clock before those
TODOs can be removed. Existing clip In/Out values must not be silently reinterpreted.

A forward packet hole alone cannot distinguish a timestamp discontinuity from
real lost recording time. #130 proposes keeping lost time as a held picture and
silence; automatically compressing every hole conflicts with that behavior.
Decision confirmed by the user on 2026-11-05: require an explicit choice to remove
a hole. Scanning reports coverage separately; existing project clocks stay intact.
The old TODO assertions expecting inspection to shorten duration were replaced by
passing non-mutation tests and executed TODOs for an explicit skip-gap repair.

Next: wire the explicit choice into the shared #157 repair workflow, which is not
on this branch's main base yet; give that workflow the covered repair
baseline only when validating a normalized output. Validate audio alignment,
clip positions, exports, undo and existing-project migration end to end. Do not
replace the baseline alone: current remux outputs still contain the hole.

Linux and europa real-file checks: not run in this round.

## Background diagnostics

`POST /api/media-clock {src}` starts/reuses a job; `GET /api/media-clock?src=`
polls its state/result. `POST /api/media-clock/cancel {src}` cancels only this job.
Two scans run at once, at most 128 jobs are retained. Queue starts return before
scanning; duplicate file versions share work. Size/mtime changes invalidate old
results both during and after a scan. Shutdown aborts owned probe processes.

No result is merged into project.json: keeping diagnostics separate avoids races
with pending editor changes and prevents implicit application of the new clock.
The endpoint rejects edit options. No UI action or agent repair tool may treat
starting the diagnostic scan as consent to remove a hole.
