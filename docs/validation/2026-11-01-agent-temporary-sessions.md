# Initial session read failure — temporary-mode repair

QQ reproduced PR19 read failure followed by edits marking persistence dirty, while a missing token made every save/retry fail. That blocked ordinary close indefinitely unless forced. New behavior follows the requester decision: failed initialization uses window-only state, never schedules persistent writes or marks persistence dirty, does not show saved/retry, and warns users to copy anything to keep before closing. No deletion/reset/overwrite of the existing file. Invalid token is treated as an initialization failure too.

Successful initial loading remains a separate persistent mode. Subsequent write/conflict/unknown failures keep dirty state and close protection. No automatic downgrade. Existing main-project flushSaveForClose remains unchanged: assistant flush permits entry to the real project transaction, and its result still determines closure.

Production tests: corrupt JSON, invalid schema, EACCES, thrown bridge read, missing token; draft/new/select/references/retry and project switch; unchanged memory-fs evidence and zero writes; actual mounted temporary notice/hidden retry; actual extracted production flushSaveForClose with both project-save success and failure. Initial red storage17 tests:11 pass/6 fail; final focused pane/storage28/28. No real damaged user file, Electron profile or new media used for focused tests. Full suite/release results recorded separately. Physical native close prompt and real disk fault injection not newly run.

Integration: additive after public PR21 6dfa20a (which depends on20→19→18→17→16). Includes previously local VV v2 attribution and JJ six-key/capacity-final-copy commits without changing any prior public head. This PR must be reviewed as part of the dependency chain before integration; it does not retroactively approve PR19 or20. No force push or blind changes to multiple branches. JJ review only of changed keys/triggers, especially paneLocalTemporary and paneLimitSessions/paneLimitChars; prior approvals not inherited.

Pending release disclosure: session file agent-sessions-v1.json is plaintext under desktop-owned data directory; references/history can contain user text. No clear-session UI in this batch and no secure-erasure claim. A future user-facing location/clear/retention workflow remains required. Transport must still verify timeline seconds and project/sequence/revision/generation and treat subtitle text as untrusted. No network/model/permission expansion.

Additional receipt guard: a success response without a nonempty string token is unknown, not saved, and cannot switch a previously loaded session to temporary mode. Focused tests now29/29. First full run594/594 and release passed; after adding this guard/regression a separate final full/release run is recorded rather than overwriting the earlier logs.

Final Windows Node result: node --test 595 pass, 0 fail/cancel/skip; node .github/scripts/release-check.js passed. Final code (including receipt validation) tested. No Electron fault-injection run or model/transport claim.

## JJ follow-up: storage policy is not a save receipt

Parent a455d6d925ce7d069e8ce11cd7c08bbc0bec3dea, same PR22 normal fast-forward. Initialization failure protection already existed: temporary mode does not show the retry/write-failure prompt, does not write or block the main project close transaction. No repeat implementation of that fix.

Changed paneLocalSaved to paneLocalPolicy, in both locales and its actual renderer selection. It now describes eligible storage scope and explicitly does not confirm the current content was saved. Chinese eligibility is project ID, not project name. Temporary mode retains its own window-only/copy-before-close notice; loaded-session write failure retains its separate unconfirmed-save/retry notice and dirty protection. No product persistence, permission, network, schema or close logic changed.

Production mounted renderer checks both locales before/after a loaded-session EACCES response: policy remains separate from actual failure status, retry becomes available, draft survives and flush rejects. Existing bad JSON/schema/read tests remain. node --test test/agent-pane.test.js test/agent-session-storage.test.js:31/31. Full node --test:597/597,0 failed/cancelled/skipped; release-check passed. Full/release evidence: 2026-11-01-session-policy-full.log and session-policy-release.log. No new Electron/media/profile run for this string-only correction; prior close observations are not new same-head acceptance. JJ must review this exact new copy, not inherit the earlier19 approval.

Dependency note: PR21 cda46345 and PR23 89b158f6 remain untouched. This PR22 follows its own public a455d6d, not a rewritten ancestry; chain integration must include PR21's separate final copy/handler delta and this policy delta before final review. #17 timeline-clock/transport stale checks, complete i18n/simple-mode and release gates remain open.
