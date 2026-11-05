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

Next: wire the explicit choice into the shared #157 repair workflow, now merged
into this draft branch as a dependency; give that workflow the covered repair
baseline only when validating a normalized output. Validate audio alignment,
clip positions, exports, undo and existing-project migration end to end. Do not
replace the baseline alone: current remux outputs still contain the hole.

Linux and europa real-file checks: not run in this round.

## Background diagnostics

`POST /api/media-clock {src}` starts/reuses a job; `GET /api/media-clock?src=`
polls its state/result. `POST /api/media-clock/cancel {src}` cancels only this job.
Two scans run at once, at most 128 jobs are retained. Queue starts return before
scanning; duplicate file versions share work. File identity, size, mtime or ctime changes invalidate old
results both during and after a scan. Shutdown aborts owned probe processes.
This metadata key is not a content hash; an eventual destructive apply must revalidate
the source and explicit choice, rather than treating cached diagnostics as authorization.

No result is merged into project.json: keeping diagnostics separate avoids races
with pending editor changes and prevents implicit application of the new clock.
The endpoint rejects edit options. No UI action or agent repair tool may treat
starting the diagnostic scan as consent to remove a hole.

## Continuous-copy experiment after explicit choice

Run `node scripts/packet-clock-normalize-bench.js` or
`node --test test/packet-clock-normalize.test.js`. This harness applies the ranges
to both video and audio using trim/atrim and the SAME original PTS origin for
each segment, then concatenates the segments. It does not independently reset
each track to STARTPTS, which could erase their relative offset.

Windows results: FLV source gives a 9.923 s copy (coverage 9.940 s); MKV gives
9.908 s (coverage 9.907 s). Both pass finite/minimum/coverage duration checks and
strict whole-file decode. At normalized time 5.52 s, pixels match sequentially
decoded source frame 165 exactly. Video/audio packet timestamps have no large
holes; their starts and ends differ by less than 1/30 s. Source bytes are unchanged.

The harness uses lossless FFV1 video and PCM audio in MKV for exact pixel checks,
not a browser-ready output. This does not implement #157's codec selection, UI,
job consent, replacement/undo, or full editor export acceptance. Interior sound
alignment and real browser playback still need end-to-end checks. The two opt-in
repair integration TODOs remain pending. Linux/europa experiment: not run locally.

## JJ copy and annotation planning (2026-11-05)

This draft now targets `fix/repair-media` (#157), after ordinary merge `99d268e7`
of its `ffe2b38e` head. No #157 or #130 branch was edited. Retarget to main after
#157 merges. The shared repair entry exists here, but skip-gap production repair
and editor integration are still incomplete; the two executed TODOs remain.

JJ-approved gap badge, tooltip, repair explanation and separate success suffix
live in ui-preferences.js. Tests lock both languages verbatim and inject the
button name from `own.repair-button`. The success suffix is not used by the UI.
The europa JJ v3 table's gap explanation was updated in place with a backup;
its SHA-256 is `70dd0fe3abe1980a5b9cf38875dde86ba585d6520821b1a4c388b141091cce9b`.
The previously described hold-frame/silence wording is superseded for this explicit
repair choice; import still preserves the source clock.

`gap-remap.js` is a pure, not-yet-connected replacement planner. It clones the
project, maps source in-points, danmaku, song intervals/marks and transcript words,
and maps timeline captions/highlights through their uniquely identified footage
clip. Clip placement stays fixed. Constant playback speed is accounted for;
speed ramps and ambiguous layered footage are rejected without mutation.
`packet-clock.repairMap` retains format.start_time as the origin, including an
initial audio/video offset; only internal gaps disappear. DTS detects a gap,
while presentation spans determine the cut boundaries.

Synthetic FLV/MKV tests now place annotations and cuts before/after the gap and
verify the same shift within one frame, with input project and file unchanged.
This is not an editor undo test. UI apply/undo/redo must additionally capture
collections, songs, danmaku, all sequence/comp clips and transient highlight facts.
Transcript copies must get separate sidecars so undo can use the original.

Open product boundary: annotations/cuts lying entirely inside a removed gap have
no corresponding frame in the copy. The planner currently refuses the whole
replacement rather than dropping or moving them. This is a conservative guard,
not a final user-facing policy. Do not enable the aligned-success suffix until
real replacement and undo pass end-to-end acceptance.

Validation: annotation helper and origin tests failed before implementation.
Windows full suite before final boundary/origin additions: 1660 pass, 0 fail,
5 skip, 2 executed TODO (83.9 s). Final targeted copy/remap/origin/synthetic suite:
10 pass, 0 fail. Release readiness passed. Linux, europa real recording,
browser preview/export and actual undo/redo: not run this round.
