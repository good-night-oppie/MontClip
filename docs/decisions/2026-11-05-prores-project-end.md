# Bound JPEG ProRes export by the selected project range

Status: proposed in this independent fix; requires QQ/Rea review. No new runtime dependencies or UI copy.

Base: fetched origin/main `d51b27a1ef5196725d73bca2d7d96c0de8c767bc`. Open PRs and export branches were checked; #149's audio-window work is already in main and concerns source decoding, not this output cutoff. #161 timestamps, #167 coverage, #186 privacy and #189 draft evidence are separate. This branch does not cherry-pick #189's draft model or evidence package.

## Evidence and decision

The synthetic last-100ms tone in #189 reaches the browser mix and FFmpeg input in full. On the available Windows FFmpeg 9.0.1 build, `-shortest` stops before PCM's final partial packet: 573440 samples instead of the 576000-source-sample range. The mix has 576001 samples because `renderAudioMix` adds one. Identical captured JPEG/WAV inputs without `-shortest` preserve that complete mix. The diagnosis alone is not a global profile fix.

Fast export already quantizes its selected range to an integer frame count. Pass this `frames` value to raw `/api/export/begin`. Only JPEG `prores422` with an explicit valid frame count uses the new bound:

- Video end is **frames / fps**, not the last frame's presentation timestamp.
- The audio trim target is **round(frames / fps × 48000)** samples (nearest sample). Resample before trimming so direct WAV callers have a defined clock too. This is a trim target, not a universal exact decoded-sample guarantee: FFmpeg also applies the duration bound below, and the observed microsecond-quantization boundary can yield one sample fewer.
- For this invocation only, replace shortest-stream termination with `-t` at the video end and `atrim=end_sample` at the audio end. Do not impose `-frames:v`, which could terminate before the audio tail is submitted.
- A short uploaded WAV stays short; a long one is trimmed. There is no added silence. In the browser, a short source clip already produces silence outside that clip inside the full-range OfflineAudioContext; that existing semantic does not change.
- Audio-free timelines remain audio-free. The last video frame occupies its full project-frame interval.

Reject invalid explicit frame counts before allocating an export directory. Count frames, not HTTP requests: one frame upload can contain several JPEGs. Existing `discard=1`, EOF and owned encoder cleanup remain in use. Finite output duration does not replace the existing idle-client timeout when a client never sends EOF.

## Compatibility and limits

Old REST callers omitting `frames` keep their prior profile behavior, including the old tail risk. RGBA, Annex-B, delivery presets, MP4 and other profiles are untouched. This is deliberately not a global removal of `-shortest`. Both user and agent fast exports share `fastExport`, so no separate agent-only command or timeline schema is introduced.

VFR source footage is rendered by the existing compositor onto the project clock. This change does not interpret average source fps as source frame timestamps. The browser acceptance records decoded source PTS and output PTS separately.

The raw profile remains customizable within an explicitly bounded mapping contract. Default selection is pinned to `-map 0:v:0` and, when audio is present and not disabled, `-map 1:a:0`. Explicit maps accept `0:v`, `0:v:0`, `0:0`, `1:a`, `1:a:0`, in either order, with one video and at most one audio output. The numeric input form `1:0` is not inferred to be audio: an arbitrary upload has not been probed here. Optional/negative maps, complex labels/graphs, repeated output streams and unsupported selectors refuse with HTTP400 `PROFILE_FILTER_MAPPING_UNSUPPORTED` before allocating a session directory.

Filter matching uses those actual output indices, not a fixed assumption that audio is stream1. `-af`, `-filter:a`, `-filter:a:0` and numeric `-filter:N` participate in their original argument order; the last matching audio chain receives the trim. Known video selectors are left unchanged, including their ordering and existing color-filter behavior. An unqualified filter matching both video and audio is refused. With no audio output or `-an`, no new audio filter or rate is added; known type-only audio filters remain unmatched. Script filters, unknown stream specifiers and additional inputs are refused rather than silently overridden. This is not arbitrary FFmpeg argument compatibility.

The bounded parser has an explicit option/arity table. Ordinary codec/color/rate/metadata/progress option values are consumed, so a file named `-an` is not misread as a disable flag. Unknown options, indirect `-/option` files, reverse boolean `-noan`, and additional bare output filenames refuse rather than guessing their argument boundaries. This restriction applies only to the bounded JPEG ProRes path. Friendly new refusal text remains pending JJ; the structured technical error code is retained and this PR remains Draft.

The bounded path explicitly sets the output rate to 48 kHz, overriding a custom `-ar` so the published sample boundary and encoded clock cannot disagree. The explicit duration bound is appended after profile arguments. Cancellation must still leave no completed file or temporary mix for that session. `frames` is an output upper bound, not verification of the number of decoded JPEGs uploaded. Safe numeric bounds do not impose a business maximum duration or a new encoder/EOF timeout; existing idle cleanup remains unchanged.

## Verification

`test/prores-end.test.js` first failed against main with 573440 != 576000 decoded samples. It now checks actual ProRes output: source tail waveform, exact sample counts for the tested fixtures, 30000/1001 and 29.97 nonintegral boundaries, short/long/no audio. A portable MPEG-4/AAC MP4 comparison verifies that supplying the new field does not change existing packets, decoded PCM, negative AAC priming PTS or skip-sample metadata. It does not claim AAC padding equals audible duration.

`test/prores-export-api.test.js` exercises the real isolated service (PORT=0 + authenticated IPC): rejected bounds, a five-second WAV limited to a one-second project, batched JPEGs, discard and cleanup. The first version caught temporary directories allocated before invalid-bound rejection; validation was moved ahead of allocation.

`real-tests/prores-end-browser.cjs` uses only generated materials, an isolated data directory, private Chrome profile/CDP pipes and its own service. It exports through the actual compositor for CFR and VFR-source cases, measures output frames/samples, and compares the real last tone with the source at zero offset. A first MPEG-4 browser fixture timed out while waiting for a presented frame; it was replaced with browser-decodable synthetic H.264, without bypassing the app's x264 export settings gate. Fixture generation needs an external tool with libx264; unit tests do not.

Platform/tool results and content hashes are recorded separately in the validation report. No downloading of missing tools, installation, deployment, human listening score or cross-platform result is implied.

## Reported duration-quantization edge (Rea, 2026-11-06)

Rea independently tested head `9dd795afb64835dc3640287c72d199372adb1c41` on europa (Node 18.20.4, vendor FFmpeg `n9.0.2-42-gd7643a0fe3`). At 23.976 fps and 2248 frames, the mathematical sample count is 4500500.5005 and the trim target is 4500501, but the decoded output contains 4500500 samples (one fewer, about 21 microseconds). The reported arguments include `aresample=48000,atrim=end_sample=4500501` and `-t 93.760427094`. Microsecond rounding of `-t` is the reported explanation, not an independently isolated root cause in this follow-up.

Accept this documented non-blocking boundary for this scoped fix; do not increase `-t` to chase the nearest sample, since excess uploaded video frames could then enter the output. Preserve the existing strict assertions for fixtures where the exact target is observed; do not relax the full-length tail waveform checks globally. This finding does not restore the old missing-PCM-packet behavior. It does mean that an exact nearest-sample guarantee for every duration is not established.

Source: Rea task handoff, reproduction script on europa `/tmp/rea-pr190-9dd795a-90gb/edge-round.cjs` (only abbreviated SHA256 `9de902ec…dd44` supplied; full hash and script not fetched here). Rea reports 40/40 targeted tests, five flash/tone AV scenarios with correct frame counts and nonzero tail, and 108 unchanged legacy argv combinations across nine profiles. These are Rea results on that head, not author reruns or approval of a later head. QQ owns the review conclusion. Windows/full-suite/release/browser and MP4/FLV AV were not run by Rea in that review.
