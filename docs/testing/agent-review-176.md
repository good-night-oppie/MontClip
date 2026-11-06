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

## PR 175 final wording integrated — 2026-11-06

This increment applies PR 175 commit 64ef89f5d3ba37b68d04be7e23ce828b1713d313 on top of d219d74f, retaining the earlier evidence above. Only the final sequence-limit wording, its shared SeqLib.MAX value, the corresponding test, generated demo and evidence/changelog are added; source-frame algorithms are unchanged. The changelog context conflict was resolved by retaining both the existing source-PTS entry and the updated limit entry.

node --test test/agent-reframe-words.test.js test/agent-reframe-race.test.js: 11 pass / 0 fail / 0 skipped. Includes exact bilingual text at 64, dynamic limit 17, 64-sequence refusal without reading frames, cancellation, revision changes and normal one-step undo. node .github/scripts/release-check.js: passed. The before-fix negative control belongs to PR 175 at de31439d (10 pass / 1 fail), recorded in agent-review-175.md; it was not rerun or relabeled as new PR 176 evidence.

No full suite, frame-algorithm test or export rerun for this increment. Earlier full-suite and synthetic A/V evidence belongs to d219d74f. GUI language switching/layout and human acceptance remain pending. PR 175's earlier note that PR 176 lacked the increment is historical; this appended commit integrates it. No merge or installation performed.
