# Bound JPEG ProRes export by the selected project range

Status: proposed in this independent fix; requires QQ/Rea review. No new runtime dependencies or UI copy.

Base: fetched origin/main `d51b27a1ef5196725d73bca2d7d96c0de8c767bc`. Open PRs and export branches were checked; #149's audio-window work is already in main and concerns source decoding, not this output cutoff. #161 timestamps, #167 coverage, #186 privacy and #189 draft evidence are separate. This branch does not cherry-pick #189's draft model or evidence package.

## Evidence and decision

The synthetic last-100ms tone in #189 reaches the browser mix and FFmpeg input in full. On the available Windows FFmpeg 9.0.1 build, `-shortest` stops before PCM's final partial packet: 573440 samples instead of the 576000-source-sample range. The mix has 576001 samples because `renderAudioMix` adds one. Identical captured JPEG/WAV inputs without `-shortest` preserve that complete mix. The diagnosis alone is not a global profile fix.

Fast export already quantizes its selected range to an integer frame count. Pass this `frames` value to raw `/api/export/begin`. Only JPEG `prores422` with an explicit valid frame count uses the new bound:

- Video end is **frames / fps**, not the last frame's presentation timestamp.
- Audio end is **round(frames / fps × 48000)** samples (nearest sample). Resample before trimming so direct WAV callers have a defined clock too.
- For this invocation only, replace shortest-stream termination with `-t` at the video end and `atrim=end_sample` at the audio end. Do not impose `-frames:v`, which could terminate before the audio tail is submitted.
- A short uploaded WAV stays short; a long one is trimmed. There is no added silence. In the browser, a short source clip already produces silence outside that clip inside the full-range OfflineAudioContext; that existing semantic does not change.
- Audio-free timelines remain audio-free. The last video frame occupies its full project-frame interval.

Reject invalid explicit frame counts before allocating an export directory. Count frames, not HTTP requests: one frame upload can contain several JPEGs. Existing `discard=1`, EOF and owned encoder cleanup remain in use. Finite output duration does not replace the existing idle-client timeout when a client never sends EOF.

## Compatibility and limits

Old REST callers omitting `frames` keep their prior profile behavior, including the old tail risk. RGBA, Annex-B, delivery presets, MP4 and other profiles are untouched. This is deliberately not a global removal of `-shortest`. Both user and agent fast exports share `fastExport`, so no separate agent-only command or timeline schema is introduced.

VFR source footage is rendered by the existing compositor onto the project clock. This change does not interpret average source fps as source frame timestamps. The browser acceptance records decoded source PTS and output PTS separately.

The raw profile remains customizable. Existing color/video and audio filters are preserved; the bounded trim follows the last effective `-af`/`-filter:a`/`-filter:a:0` chain. The bounded path explicitly sets the output rate to 48 kHz, overriding a custom `-ar` so the published sample boundary and encoded clock cannot disagree. The explicit duration bound is appended after profile arguments. Complex custom filter graphs are not an acceptance claim. Cancellation must still leave no completed file or temporary mix for that session.

## Verification

`test/prores-end.test.js` first failed against main with 573440 != 576000 decoded samples. It now checks actual ProRes output: source tail waveform, exact sample boundary, 30000/1001 and 29.97 nonintegral boundaries, short/long/no audio. A portable MPEG-4/AAC MP4 comparison verifies that supplying the new field does not change existing packets, decoded PCM, negative AAC priming PTS or skip-sample metadata. It does not claim AAC padding equals audible duration.

`test/prores-export-api.test.js` exercises the real isolated service (PORT=0 + authenticated IPC): rejected bounds, a five-second WAV limited to a one-second project, batched JPEGs, discard and cleanup. The first version caught temporary directories allocated before invalid-bound rejection; validation was moved ahead of allocation.

`real-tests/prores-end-browser.cjs` uses only generated materials, an isolated data directory, private Chrome profile/CDP pipes and its own service. It exports through the actual compositor for CFR and VFR-source cases, measures output frames/samples, and compares the real last tone with the source at zero offset. A first MPEG-4 browser fixture timed out while waiting for a presented frame; it was replaced with browser-decodable synthetic H.264, without bypassing the app's x264 export settings gate. Fixture generation needs an external tool with libx264; unit tests do not.

Platform/tool results and content hashes are recorded separately in the validation report. No downloading of missing tools, installation, deployment, human listening score or cross-platform result is implied.
