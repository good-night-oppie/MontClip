# PR 175 review follow-up — 2026-11-06

The original author explicitly handed off local tip f55095c6 and its three unpushed commits (fb2692fb, a56635ad, f55095c6). All are preserved; no history was rewritten. PR 172 is integrated by ordinary merges.

Negative controls failed before the fix and passed afterward: adding a clip during asynchronous frame reading must invalidate the old plan; reaching 64 sequences must return SEQUENCE_LIMIT before any frame reading. The real runAgentReframe implementation is exercised by test/agent-reframe-race.test.js, including cancellation, a newer revision, and one successful undo (5/5). JJ approved the additional sequence-limit wording on 2026-11-06.

- npm test with explicit development MONTCLIP_FFMPEG and MONTCLIP_FFPROBE: 1754 tests, 1747 pass, 0 fail, 7 skipped.
- node .github/scripts/release-check.js: passed.
- desktop/agent-reframe-review-smoke.cjs --montclip-smoke --user-data-dir=<fresh> with bundled LGPL FFmpeg and offscreen Electron: REFRAME_REVIEW_PASS. A synthetic six-second landscape clip becomes a 108 x 192 cover sequence, exports 180 frames with 12 flash/beep pairs, and one undo returns to the original sequence and linked clips. Maximum A/V deviation 0.0834 ms, threshold 40 ms.

The first smoke attempt exported successfully but its raw undo equality compared normalized linkGroup identifiers. The corrected assertion checks unchanged clip contents plus preserved shared linkage; both attempts remain in local evidence. This is a fixture correction, not a suppressed production failure.

No private footage, model request, visible desktop, installation, or human acceptance was used. The smoke invokes the real reframe operation directly; it does not exercise a human clicking the assistant approval UI. The historical eleven PR 172 failures remain documented in agent-review-172.md.
