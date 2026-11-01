# FLV clean core review scope

Base main5df54aec (PR2 squash). PR8 unchanged. This replaces the shared
preparation/REST/MCP part of old PR4 and the shared gap guard from later local
work, without their ancestors. Native IPC/close/harness is explicitly deferred.

Memory production-route tests exercise gap rejection, no encode before permission,
REST stored-original retention and MCP no-registration on refusal. Browser VM
tests use actual importFiles/projectJSONHere/normalizeMediaEntry, including late
metadata after project switch. Real tiny synthetic FFmpeg fixtures cover native
Node REST/MCP, source bytes and remux frame hashes; no Electron/profile/window.
Readable permission regression initially6pass/1fail: expected
FLV_READABLE_CONSENT_REQUIRED but got no rejection with allowTranscode:true.
Then10/10 gap/scanner passed,5/5 real fixtures,3/3 browser VM passed.
Not a full real browser save/reopen proof or historical diskrev1 root-cause fix.
No claim of Linux/macOS/package verification. Full candidate results appended below.

Tested source 5a77d2a608ce029a65ab9e4f83606ed736f2ee8d tree 7ef6c5061f73905c17d3fc5eaaae60990c59f1d0
Windows x64 / Node22.15.1 / development system FFmpeg9.0.1.
npm test:574/574,0 failed/cancelled/skipped.
node .github/scripts/release-check.js:pass.
docs/validation/2026-11-01-flv-clean-full.log UTF-8 sanitized worktree SHA256 e6c75e0979c0d0c7f629bc03612d99a2741227485df9893a921ef5f06bcc39a7
docs/validation/2026-11-01-flv-clean-release.log UTF-8 sanitized worktree SHA256 4876ddd7f469df9a52ff350e8f351e0408ea02dbe45c9cef202b022e7d8b889d
No visible desktop/global input used; no original native scenario repeated.

## QQ receipt and owned-upload follow-up (2026-11-01)

Deja relayed QQ formal approval of PR9 at19377acd:574/574 plus release-check, not release approval. Frame scanning uses full decode and a15-minute timeout. QQ's two-minute1080p30 synthetic measurement was4230ms show_frames versus222ms show_packets; the three-hour/~six-minute estimate is extrapolation only. Long-recording target-hardware tests remain open; use program-generated inputs, never private user recordings without authorization. Packet scanning must not replace decoded-frame gap protection without equivalence/red-green evidence. Future assistant requests cannot set either consent on behalf of a user.

Reading the owned cleanup path found an independent concurrent-upload collision: target selection happened before awaiting request body. A controlled production REST route test with two pending same-name bodies failed first: second !== first. The minimal fix creates the file exclusively (wx) after receiving the body and retries EEXIST with a suffix; other write errors propagate. Eight focused tests passed (upload ownership and seven existing gap route tests). This is memory-fs/VM production-route evidence on Windows, not real OS race or browser-reopen acceptance. No scan policy, consent or timeout changed.

Rejected FLV original copies remain intentionally retained by the current API (needed for explicit reprepare). This fix does NOT claim orphan cleanup: per-upload lifecycle/registration ownership and safe abandonment remain open. Do not delete by filename or elapsed time, or delete a retained source referenced by a later successful request. No existing files were deleted in this task. Historical browser rev1 cause remains unresolved.

Related QQ receipt: PR10 at5b14ffd0 formally approved559/559 plus release-check, build dependency only. Its5moderate advisories are accepted only if user input is not assembled into glob patterns; do not downgrade to18.4.4. Future Electron distribution archive must have pinned version and checksum in the manifest. Tool license, ASR selection/quality and actual package acceptance remain open. Approved PR9/10 heads are unchanged; this is a separate follow-up branch.
