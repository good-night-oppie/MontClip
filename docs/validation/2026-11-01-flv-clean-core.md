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
