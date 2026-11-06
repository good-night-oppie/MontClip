# PR 176 review follow-up — 2026-11-06

The actual review concerns MCP accurate seek selecting the next decoded frame, not a request to infer VFR frame indices from FPS. Three production-function negative controls failed at b213541a before the repair: 24 fps footage in a 30 fps project dropped the tail, a cut at six seconds sampled the next red shot, and a VFR gap sampled that next shot too.

The tail now decodes from the preceding keyframe and uses actual integer source PTS and time_base. The selected frame is at or before the final timeline sample instant, inside the source window; its actual relative timestamp is passed to tracking. No FPS-derived source-frame index is used. Empty/invalid output explicitly fails; a very short source window containing no decoded PTS is deliberately refused rather than extended into the next shot.

Validation:

- test/reframe-source-tail.test.js: 7/7 with bundled LGPL FFmpeg, covering the three negative controls plus source in / slow playback, empty output, a short window, and a nonzero container start timestamp. Synthetic sources only.
- npm test with explicit development MONTCLIP_FFMPEG and MONTCLIP_FFPROBE: 1762 tests, 1755 pass, 0 fail, 0 cancelled, 7 skipped.
- node .github/scripts/release-check.js: passed.
- Offscreen Electron desktop/agent-reframe-review-smoke.cjs --montclip-smoke --user-data-dir=<fresh>, bundled LGPL FFmpeg: passed. Six seconds, 180 frames, 12 flash/beep pairs; maximum deviation 0.0834 ms against a 40 ms threshold. New portrait sequence, cover fit, export and one undo verified.

The first integrated run cancelled five inherited race tests: the VM fixture lacked clipSpeed, newly called by PR 176, and waited forever for frame reading. The fixture now supplies that dependency and reports early returns immediately; the failed run is retained locally. No production failure was hidden by dropping tests.

PR 175 is integrated by ordinary merge, with its author commits preserved. No force push. The historical PR 172 eleven failures remain documented in agent-review-172.md. No human acceptance, real footage, full approval-button interaction, installation, or merge was performed. The browser smoke tests CFR footage; VFR evidence above exercises the real MCP sampling function.
