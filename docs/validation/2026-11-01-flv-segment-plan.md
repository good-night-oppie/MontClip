# Isolated FLV segment planning

Base: public main bc771db. Policy: PR13 ADR 2026-11-01-flv-gap-segmented-import.md at6b3ab9a; policy not relaxed. This independent PR contains no private ancestors.

Short synthetic timestamp fixtures only (20–100 integer millisecond ticks), no encoded media. Unique v/a unit IDs permit checking all input units survive the plan; they are not decoded frame hashes. No-hole, one/multiple holes, nonzero start, reordered presentation inputs with continuous DTS, audio/video-only holes, invalid/missing times, duplicates, overlaps, touching endpoints and unmatched starts are covered. No input mutation. Source hash in tests is synthetic identity only.

Red: node --test test/flv-segment-plan.test.js exited1 MODULE_NOT_FOUND before module creation (1 failed file; behavioral assertions not yet executed). Green: same command7/7. No fabricated behavioral red claim.

Contract: both streams use one caller-declared source presentation clock and safe integer ticks, explicit positive durations, unique per-stream IDs, max100000 units per stream. No rounding tolerance or gap threshold added. Unequal AV spans fail UNMATCHED_AV_COVERAGE rather than silently discard non-common units or cut a boundary unit. Unknown/overlapping coverage fails. Exact touching endpoints coalesce, positive holes remain. Each segment has its own planned local0 origin; no concatenated timeline or subtitle subtraction. executable=false even for valid plans: codec/keyframe dependency, audio samples, output PTS and actual identity still need media proof.

No production import, confirmation/UI, undo, filesystem or network calls. Not packaged through root *.js npm whitelist; no runtime entry references this module. Server may serve repository static files in development, but there is no API execution path for this module. Full real-frame/audio preservation, source-clock correspondence, once-only project apply/undo, failed preparation cleanup, VV/JJ interaction and QQ security review remain pending. No media/profile generation or two-hour rescan.

Actual Windows x64 Node22.15.1 commands: node --test (same command as package npm test script),569/569,0 fail/cancel/skip; node .github/scripts/release-check.js exit0. Full suite27.698s. Linux/macOS/Electron/encoded segmentation not run. C free after run41,502,453,760 bytes. Sanitized LF log/source byte hashes:
planning/flv-segment-plan.js SHA256 34210ea53c61077c6752a0deb7590e197794101cd6631edfd5f82135f9755d5c
test/flv-segment-plan.test.js SHA256 c7070d9b7960af3b45c7558c66b83c83d022be79b9f2e61c3c386771058ac2bd
docs/validation/2026-11-01-flv-segment-full.log SHA256 201cf60f3b4ea3ca4a9b733bd15e9562e4076ca4b7de2b26210db71ebab5d90e
docs/validation/2026-11-01-flv-segment-release.log SHA256 5a0e4845a4bae15d87b152750d4b1609256641d0ca3f298fe42a79199aa05b58
