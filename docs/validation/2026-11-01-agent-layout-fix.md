# PR16 layout and default identity repair — 2026-11-01

Base PR19 5a36b849. New normal branch review/agent-pane-layout-fix, no changes to public16–19 heads. Intended integration is additive after19 (and its bases), or a parent-coordinated combined review of the same final tree; do not merge this delta onto main without its declared ancestors. No private ancestry. VV PR16 report was read in full; JJ candidate text read then deferred by priority correction, not represented as approved.

Production changes: assistant moves into existing right-side tab page, replaces inspector content instead of adding a second body rail. Preview and timeline retain their layout allocation; timeline remains full width and height is constrained by available viewport. Narrow Media button exposes existing media bin in the right page region; ordinary properties/mixer/color/transcript tabs remain reachable. Composer/actions are pinned while secondary content scrolls inside the pane; body does not scroll. Buttons/input use theme variables. Hidden controls stay hidden despite .btn display styling.

Default identity: pjLoad already checks server active ID/header against shown document. Added snapshot+generation check before adopting the anonymous same-sequence chat scope into its confirmed project ID. Preserve both session IDs/drafts and active selection; existing identified scope can merge without resetting drafts. Never infer identity solely from the next non-null ID. New controller test failed before identify existed, then passed. Real default null project: two UI-created drafts → normal pjLoad assigns ID → create/open different project → open original → both drafts selectable and correct. No fake generation or project initialization change.

Normal session write failure still returns false to the existing close controller; default choice restores/keeps window, explicit force closes. Memory controller regression covers both outcomes. Force-close/crash can discard unconfirmed session edits, not advertised durable. Native failure prompt itself not newly induced.

Evidence progression, all retained:
- first.json: identity passes, narrow send/cancel not visible; pin composer fix.
- second.json: native content sizes subject to Windows DPI rounding (1272/1101/807/632),16 hit cases pass; not claimed exact requested widths.
- exact.json: added title caused autosave revision snapshot race; harness now awaits actual flushSave before comparison (no product timing change).
- verified.json: CDP exact CSS widths1270/1100/804/630,16 measurement cases pass; then moved history into header to enlarge630 preview and styled dynamically-created session buttons.
- click.json/delivery.json/observe.json: export click received, initial arbitrary2s harness wait insufficient for asynchronous codec/profiles lookup; retained failures. Final action check uses bounded10s and records completion through actual behavior, no altered production codec/timeout policy or mock response. A diagnostic wrapper records started/settled async stages only in development harness.
- actions.json: actual coordinate play/pause, export dialog, send/cancel and hide/show pass for8 open combinations. Screenshot inspection found hidden Retry rendered because .btn overrode hidden; one CSS rule fixes this.
- finalproof.json: final source-byte hashes and exact16 measurements +8 coordinate action combinations, two-draft identity proof, explicit markers and exit. New task-owned profiles retained, no deletion.

Commands: `node --test test/agent-session-storage.test.js test/agent-pane.test.js` (18 then19 tests as close-choice regression added); `node --test` (npm test script):585/585,0 fail/cancel/skip; `node .github/scripts/release-check.js`:passed. Full suite preceded only the final hidden-control CSS rule; final Electron validates that rule. No unrelated older-head full reruns.

Actual Windows Electron45.2.1, hidden independent window; OS-scaled native sizes first, then CDP Emulation sets exact CSS viewport with native window resized. CDP coordinate events, not physical mouse/keyboard. Program title is synthetic, no video/audio generation. Final preview approximately606×341 /511×287 /443×249 /264×148. All16 center-hit checks include play/export/undo/redo; open cases additionally draft/send/cancel/hide. All cases no body scroll and full-width timeline. Existing smoke verifies save and isolation. No MP4 export run. Source snapshot/undo unchanged across layout/action traversal (intentional title creation stabilized before baseline).

Remaining: VV visible-window/same-head approval, physical input/IME/readers, light theme, real footage/aspect extremes, complete simple-mode and unified locale, tool/model connection/payload/proposal protocol, Linux/macOS, packaged release. Passing CSS dimensions/center-hit is not a blanket UX approval. Top-right width preference is clamped by available room; no new persistence namespace introduced.

## VV baseline attribution supplement (read 2026-11-01)

Read the same VV PR16 report's full-page comparison supplement, head8bb93571 vs basebc771db. These are VV observations, not a new implementation-side rerun or approval of PR20. Actual supplement viewports1281×750/1100×638/804×535/630×452 differ from the earlier1270 test. Exclude the two explicitly invalid rounds and first export timing rows as VV states.

Assistant closed: four widths × two modes match base; open→close restores layout. Export/project masks and sequence menu remain usable (24/24); do not attribute a mask/menu regression to PR16. Existing base issues: preview0×0 at<=1100,630 horizontal overflow28px, body vertical overflow1px. New assistant-open regressions:1281 preview136×76→0×0, covered playback and timeline right edge1275→935; narrow pane offscreen and body scroll317–367 moves editor controls out of view.

PR20 intentionally addresses both the assistant-open regression and the existing narrow-workbench preview/overflow defects because both fail the requested workspace acceptance. It does not reclassify old base defects as PR16-introduced. Prior valid findings remain valid; no baseline/media rerun requested or performed. PR20 same-head visible VV acceptance remains pending.

## Content-track correction after VV PR20 (2026-11-01)

Base is public PR22 `a455d6d925ce7d069e8ce11cd7c08bbc0bec3dea`, tree `1c477d6d6dc6a1da16f386e29497a8b81cf628f3`. New branch `review/timeline-content-visibility`; PR16–22 heads unchanged. This incremental fix requires the whole dependency chain, not just PR20's single-increment approval. No merge/release.

VV's new report supersedes any implication that the earlier button-only checks accepted the timeline: at all four sizes default V1/A1 were hidden below empty V3/V2. Existing null-identity and overlay successes are retained without rerunning their scenarios. The prior native minimum-window artifact only checks title/buttons, not content lanes.

Reproduction `2026-11-01-timeline-red.log`: real importFiles → metadata → addClipFromMedia of a task-owned 4-second 320×180/30fps testsrc2 + mono 440Hz sine MP4. At native CSS1272×738, V1 visible3.55/58px, A1 0/42px. Assertion failed and Electron exited1. No user media.

Fix: simple mode hides only empty non-main row/header DOM; keeps all project tracks and V1/A1. Advanced retains all rows and scrolls to first occupied track on project/sequence/mode/occupied-track changes. No per-render reset; changing a clip time alone preserves scroll. Timeline now reserves180px minimum with an upper32vh cap, leaving the preview upper region flexible. Narrow transport uses two rows and does not reserve space for unset IN/OUT; no playback controls removed. Local session status is no longer CSS-hidden on small windows, including temporary-session warnings (reachable inside pane scrolling).

Failure progression retained: first fix reached advanced but the harness checked scroll before the pending post-undo redraw; it now settles the redraw before deliberately scrolling. The second run exposed too-small630 preview, not waived. Third and observation runs measured a78px transport including invisible idle IN/OUT space. Final compact transport removed that reserved space. No timeout or assertion relaxed.

Final Windows Electron45.2.1:
- `timeline-green-native.log`:16 cases, actual native-DPI CSS1272/1101/807/632 (not exact requested breakpoints), process0 and both COMPLETE/SMOKE markers.
- `timeline-exact.log`: CDP exact CSS1270×737/1100×638/804×535/630×452, simple/advanced × closed/open =16 cases. All default V1/A1 rows visible within1px fractional-DPI rounding; entire clip bodies visible. In EACH case both tracks receive coordinate selection, Split, Undo (32 split/undo operations per run). Advanced manual scroll remains0 after ordinary rebuild. Core play/export/undo/redo and chat controls center-hit; body overflow0 and full-width timeline. These are CDP events, not physical input.
- Smallest final preview162.7×91.5, timeline180px, V1~58px/A1~42px. Coarse-editing size only; not precision/full-UI acceptance. Input hash `1c4e4a41621932a3a0af00edd23a93575ff95abcb52f9d243621e17f2fc30789`.

Commands (Windows PowerShell, fresh task-owned `$profile`, `$input`):
```powershell
ffmpeg -v error -f lavfi -i testsrc2=size=320x180:rate=30 -f lavfi -i sine=frequency=440:sample_rate=48000 -t 4 -c:v libx264 -preset ultrafast -c:a aac -ac 1 -n $input
$env:MONTCLIP_TIMELINE_INPUT = $input
desktop/node_modules/electron/dist/electron.exe desktop/timeline-content-smoke.cjs --montclip-smoke --exact-viewports --user-data-dir=$profile
node --test test/timeline-content-view.test.js
node --test
node .github/scripts/release-check.js
```
Targeted3/3; full598/598,0 failures/cancel/skip; release-check passed. Source byte hashes in `timeline-source-hashes.json` explicitly refer to worktree bytes, not Git's LF blobs. Full output logs sanitized `<repo>/<user>`; no raw-copy addition. Head is bound by the eventual PR commit, which contains these exact code files. Free space before43.57GB, after43.17GB; retained synthetic profiles/fixture stay local, below512MiB aggregate budget and above10GiB reserve. No deletion or runtime copy.

### PR22 close-fault completion in the same stack

`desktop/agent-close-fault-smoke.cjs` is an explicit standalone development entry, not loaded by main/package production entry. Five fresh own profiles: bad JSON, bad schema, filesystem read error (directory at the session-file path), project PUT503 injection, and session temp-open EACCES injection after successful missing-file read. Real main session store/IPC, renderer mutations/flush and native close controller execute. Dialog choices are harness-controlled responses to actual prompt options; no claim of physical dialog clicks.

`agent-close-fault-checked.json`:5/5 child exit0 with complete markers. First three preserve damaged input and close with no prompt; identified drafts survive new/select/reference actions. Project failure and normal-loaded session write failure each prompt twice: default wait keeps window, then explicit force closes. Original file/directory preserved, no overwrite/reset. Actual project protection was not bypassed.

Earlier `agent-close-fault-native.json` has4pass/1fail: unassigned project did not persist, so write-failure assertion had no write to intercept. `agent-close-fault-identified.json` preserves the failed harness identity synchronization attempt. Final harness calls real pjLoad then pane render before interaction, rather than writing runtime IDs; all five now exercise the intended scope. These are harness precondition corrections, not product data-loss claims. Command: set `MONTCLIP_SESSION_FAULT` to json/schema/read/project/write and run Electron `desktop/agent-close-fault-smoke.cjs --montclip-smoke --user-data-dir=$profile` once per fresh profile.

Not tested: physical input, light theme, screen readers, Color/source-monitor/marked IN–OUT narrow geometry, non-default widely separated occupied tracks/aspect ratios, Linux/macOS, packaged output, actual AI. Public demo still lacks the stacked desktop Agent modules; no demo publication/sync claimed in this focused correction. Full simple-mode/i18n and packaging gates remain open. QQ/VV/JJ approval must bind the new head.

Self-evaluation (agent-self-evaluation skill; not independent review): accuracy4/5 (raw failures and DPI differences retained); completeness3/5 (same-head visible review and non-default layouts outstanding); clarity4/5 (exact/native separated); actionability4/5 (commands and isolated entry points supplied); conciseness3/5 (multi-run evidence necessary but long). Average3.6. Next improvements: same-head VV physical interaction, then separate occupied-track/aspect extremes; do not call this whole-workbench completion.

Final harness strengthening: `timeline-final.log` repeats the exact16 cases with assertions that both controller mode and rendered body mode equal the requested mode (not merely a test label); all16 pass, exit0. Product code unchanged. Working-source hash manifest refreshed for this final harness. Before this last profile,23 retained task profiles/fixture measured364520245 bytes (347.63MiB), not inferred from free-space delta. FFmpeg executable SHA25657c56e369d5b4873b4d93fc1a1d833cb7cd8bc9325c14b05c34ce60b22842d8a; development-only system tool, no redistribution claim.

## PR23 review correction: stable lanes throughout a clip gesture

Base/head before correction: 182615905b684de749d57478ad225ce0a18edfc1, tree57f08eeff7f953013f013f4979cc7afdf4b88bb0; same public branch/base, normal fast-forward only. QQ found that occupancy-based focus/filtering changed the lane under a stationary pointer. Production-function regression initially passed3/failed3 (timeline-drag-red.log); the three new cases failed on scroll, source-row disappearance and missing cancellation listener respectively.

syncTimelineTrackView now defers both visibility and content focus while state.gesture is true. The animation loop drains pending layout after *any* existing gesture end, including end paths that do not mark dirty. Clip move/trim uses one finalizer for pointerup, pointercancel, Escape and blur: success records one undo/save, cancellation restores its clip snapshot and preserves redo without saving; both clean listeners and mark timeline dirty. Other gesture algorithms remain unchanged. Track-height changes no longer alter the content-focus key. No project schema, IPC or UI text changed.

Validation on Windows/Node22.15.1/Electron45.2.1:
- node --test test/timeline-content-view.test.js:6/6 after correction. Actual production startClipGesture/trackAtEvent/filter functions execute in a controlled VM, not a replacement drag algorithm. Includes repeated moves across an empty upper lane, simple sole-source-row retention until release, and pointercancel/Escape/blur restoring project clips with no undo/save and preserving redo.
- node --test (the npm test script):601/601,0 failed/cancelled/skipped; timeline-drag-full.log.
- node .github/scripts/release-check.js:passed; timeline-drag-release.log.
- Actual Electron offscreen renderer, CDP coordinate input, three scenarios: advanced V1→V2 with3 moves; simple soleV2→V1 with3 moves; Escape cancellation after3 moves. Every move waits two real animation frames and checks actual track/scroll/gesture/visibility. Success adds exactly one undo record; cancellation restores the complete clips JSON and adds none. Final layout pending/dirty false, process0, DRAG_COMPLETE and original SMOKE markers. timeline-drag-native.log includes exact working-byte source hashes and input hash.

The first hidden-window run passed advanced moves but could not observe the final simple-row fold; the next frame-observer run and background-throttling-only attempt each failed FRAME_TIMEOUT. These are preserved as timeline-drag-native-red.log, timeline-drag-frame-red.log and timeline-drag-throttle-red.log. Hidden windows did not paint animation frames. The development entry now constructs an offscreen BrowserWindow with backgroundThrottling:false; no production BrowserWindow settings changed. This is actual renderer/event/layout execution, **not visible-window or physical-mouse acceptance**. VV still needs ordinary visible-window verification of this exact head. The previous hidden timing-based results must not be used as evidence that all intermediate animation frames ran.

Reproduce on Windows using existing task-owned synthetic input:
`$env:MONTCLIP_TIMELINE_INPUT='<synthetic.mp4>'; & desktop/node_modules/electron/dist/electron.exe desktop/timeline-drag-smoke.cjs --montclip-smoke --user-data-dir='<new-task-profile>'`.
Input SHA2561c4e4a41621932a3a0af00edd23a93575ff95abcb52f9d243621e17f2fc30789; reused4s320×180/30fps/AAC synthetic fixture, no new media generation. Free bytes before runs43096465408, above10GiB. Four fresh task profiles retained; no old evidence deleted. Development-only harness is not loaded by main or the package entry. Production app SHA25663bd788ede212e0000b9e7aad3e0f839501f60ad67e68101a8f62dda9c3d442e; harness SHA2568c9efa958c9ec4412b7d084d97b66adfbeb4eec00cbb5177ed623f624ceb0dd9 (working-file bytes, not git-blob hash).

Not rerun: the earlier16-case viewport matrix, #22 close faults, media export/sync, packaged build, Linux/macOS, physical input or assistive technology. No model/network capability added. #21 later capacity copy commit is a separate dependency increment, not silently imported here. QQ/VV must review this new head; prior approvals do not transfer.
