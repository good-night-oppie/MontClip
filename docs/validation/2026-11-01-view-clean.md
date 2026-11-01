# Clean replacement for the view-controls part of PR4

Base: 5df54aec8b3a1b7d18a4f4f9643742327dfb3545 (squash PR2).
Tested code: a6456daafcf82f018c3d09b88b9fded4e763de94; tree f61ab6dc33ab8cb5b1f56c4cb75699723a8ad607.

Windows x64, Node22.15.1. Free before tests:42,013,069,312 bytes.
npm test:558/558 pass,0 fail/cancel/skip.
node .github/scripts/release-check.js:pass (repository checks, not a portable package).
Logs sanitized before staging; hashes below are UTF-8 worktree bytes, not raw output.
docs/validation/2026-11-01-view-clean-full.log SHA256 f7d489b3da39c15214820fcb7a8ae3bf1d8625349d4c7df2da648f45e7149af5
docs/validation/2026-11-01-view-clean-release.log SHA256 5a0e4845a4bae15d87b152750d4b1609256641d0ca3f298fe42a79199aa05b58

Only view preferences are extracted from old PR4. Same DOM/project/undo functions;
new controls default Chinese and persist mode/language. Existing editor panels
are not all translated. Assistant is explicitly disconnected; no request/reply.
Demo retains static-shim.js. No media preparation, REST/MCP/schema or save change.
Old PR4 FLV implementation is excluded, pending separate clean guarded extraction.

Not run for this new head: visible or hidden Electron, Linux/macOS, real package,
small-window/pixel/IME/accessibility acceptance. Earlier PR2 and private-stack
window passes do not approve this head. No historical FLV root cause closure.
Old PR4 remains linked at https://github.com/good-night-oppie/MontClip/pull/4; parent
will decide closure after checking the split. No old8f/private ancestor is merged.
