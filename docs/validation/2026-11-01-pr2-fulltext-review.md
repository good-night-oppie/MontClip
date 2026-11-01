# PR2 caption parser correction — clean review delta

Base: public PR2 head 8f461b9fe248af4f0bbf9066befa6fbf8c522e50. This branch is constructed directly on that head; no unpublished intermediate commits were cherry-picked. It does not include later UI/MCP fit, sentence selection, chat, ASR, FLV, packaging or saved-state features.

Bug: C.parse silently truncated normalized SRT/VTT cue bodies to 500 UTF-16 code units, losing tail text and potentially splitting Unicode. Minimal production change removes only that substring operation in captions.js and its docs/demo mirror. Existing tags are still normalized; start/end and sentence counts remain unchanged. Existing file/request limits unchanged. No schema/API, dependency or network change.

Added production parser → C.clip → JSON serialization → C.fromClips → standard SRT/VTT roundtrip regression using synthetic long Chinese/newline/emoji text and tail marker. Also asserts unchanged time and no fabricated word timing. This is not a claim that UI/MCP import fitting or long-text screen layout is corrected; those are separate deltas, deliberately excluded.

Red: `node --test test/captions.test.js` — 13 pass / 1 fail / 0 skip on the public base plus regression. Green: `node --test test/captions.test.js test/range-plan.test.js` — 17 pass / 0 fail / 0 skip. Both existing tests were inspected: in-memory modules and small existing synthetic fixture reads only. Logs pr2-fulltext-red/green retain the date prefix and have repository paths sanitized before write. No profile/media/network/FFmpeg/real export.

Platform: Windows Node tests only. Linux/macOS and Windows real editor/preview/burn-in not run. Full npm test and release-check remain required before push/PR acceptance, deferred under the active disk restriction; these 17 tests are not a substitute. No claim of PR approval, integration into main or package availability. Historical local stack is retained separately and must not be pushed, because its ancestors contain personal paths.
