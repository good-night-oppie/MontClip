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

## PR8 real-window blockers follow-up

Tested code 8d42c6bf5161344bae72c98829fbca2773e7c73a; tree a29055466bcb19a0e901e01b5aeda30ef26fc8e5. Windows x64 / Node 22.15.1 / Electron 45.2.1. Before testing C: free 41,873,166,336 bytes (10 GiB reserve retained).

VV original f643999 report reproduced loss across random-port origins and toolbar overlap. New production store tests first failed 0/3 because the module did not exist; after implementation targeted settings/adapter tests passed 6/6. Full npm test passed 562/562, 0 fail/cancel/skip; node .github/scripts/release-check.js passed. These are repository checks, not package acceptance.

Desktop settings now use a fixed userData/view-settings.json, two enum fields only. Main authenticates sender/top frame/exact random origin. Preload has only get/set; no renderer path, generic file or channel access. Atomic rename must succeed before set returns success. Read failures/defaults, write failure and invalid requests are covered in injected tests; OS disk-full/ACL failure was not induced. Browser storage remains localStorage. No project schema/save or undo operation was added.

Hidden real Electron processes using the same new task-owned profile exited completely in sequence. Origin changed from port10801 to43886; first startup was simple/zh-CN, second startup was advanced/en. Actual UI click/change handlers persisted the preferences. Project JSON, runtime undo/redo, playhead and selection were unchanged across the UI setting operation. This uses an empty synthetic editor project, not a claim about all populated project states. Both processes exited0 with explicit MONTCLIP_VIEW and successful MONTCLIP_SMOKE markers and empty stderr.

CSS fix gives the wrapped topbar normal-flow auto height with sufficient specificity against the later flex shorthand. Real Chromium elementFromPoint checks for Export/Undo/Redo at CSS widths804,630,1100 all passed in both processes (18/18 hits). Viewports were set through Electron DevTools emulation; native BrowserWindow width conversion produced807 for requested804 and remains a separate VV native resize verification. No global input or visible desktop was used. Red records remain red; the second red also verifies assertion failure now exits1 instead of0. No save timeout/production minimum-size change was made.

Reproduce the Electron check with the existing desktop/node_modules/.bin/electron desktop --montclip-smoke --view-check --user-data-dir=<new-own-profile>, then after complete exit run the same command/profile with --view-reopen. Require exit0, both explicit markers and no assertion/error; do not infer success from exit alone. desktop/view-smoke.js runs only in unpackaged explicit smoke mode.

Remaining: QQ/VV re-review of the new head; actual visible native resize and OS failure injection; Linux/macOS; preview0x0/assistantEsc (separate existing issues); full bilingual/simple-mode/chat/product package completion. Prior approval is not transferred. PR9 FLV and PR10 packager heads were not changed.

Evidence hashes below use sanitized UTF-8 git blob bytes (LF), not unsanitized process output:

- docs/validation/2026-11-01-pr8-fix-full.log: 14a1f319ba72750e21142c129f17c71bf628171c0ba239882cc9dec5432a2f68
- docs/validation/2026-11-01-pr8-view-restart.json: 5d7e4287fca32954514f06b309322d2ea08fb56ee094dbe9f77e60448113f9ba
- docs/validation/2026-11-01-pr8-view-width-red.json: d40796e241b31f16e26c61879b8d3ad8334401db848a8452cbea551983f04d0d
- docs/validation/2026-11-01-pr8-view-width-exit-red.json: f1165b0e678b99c09a6652aa4076706a5e08e1122aef69332793c38fdd543010
- docs/validation/2026-11-01-pr8-native-resize-red.json: ce5fe42fa4ea5dff7f0aa787e37c60a9e3ee4e7d2567d74ca3391b358db3091f

### Public source binding

GitHub rejected the first push with GH007; no rejected commit was published. The five new local commits were recreated with the public noreply identity, preserving every tree and the existing public parent f643999. Local backup is retained; remote was updated by normal fast-forward, not force. Tested code 8d42c6bf5161344bae72c98829fbca2773e7c73a has public equivalent 02255064a6ce9c8e67b8d90712500e47f3df8d74, identical tree a29055466bcb19a0e901e01b5aeda30ef26fc8e5. The evidence source IDs remain the actual original local run IDs, not fabricated reruns. Red equivalents:7e8e958→3f83609, a04ac64→8eab450, 494d5ba→923f357. Evidence commit a2e35ad→7a59872 has identical tree07c0910670fc89057091df1e2699ff4192907624. Tests were not repeated for identity-only recreation or this documentation addition.
