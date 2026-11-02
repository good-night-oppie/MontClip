# Workspace persistence and mode transition

Base PR17 85b3cda unchanged. Fixed-schema independent workspace namespace, exact sender/frame/origin validation reused, no arbitrary renderer file/key access. Only version1 edit/color accepted. Explicit one-time migration from accessible legacy localStorage when file missing; corrupt/read-failed file is not overwritten by migration. Missing old origins are unrecoverable, not silently claimed migrated. Write failure keeps current UI choice and gives localized warning. Main settings API's two keys unchanged.

Actual Windows hidden Electron baseline, same own profile and separate processes:22906 color/advanced→27595 edit/advanced. Actual origin-local loss confirmed, project/undo identical during observed actions. Baseline JSON retained.

First fixed run reopened Color but failed project equality because initial asynchronous GET completed between snapshots (tracks:null became loaded track definitions); retained fixed.json, not counted pass. Harness now waits for real state.connected within original15s before snapshot, no new writes or added time allowance. Second own profile:53823 set color/advanced; complete process exit;57285 reopen initial color/advanced. Then simple transition→edit, matte/qualifier off, project/undo/redo serialized equal. Both process exits0, MONTCLIP_WORKSPACE and existing smoke markers present. No media/visible desktop/global input or unrelated process actions. This empty-project smoke does not prove graded footage appearance, real nested/export scenarios or narrow layout. Own test profiles retained, no deletion.

Memory tests: different origin storage reproduces loss; independent store recreation restores Color, migration cannot overwrite existing Edit; invalid fields/version/value rejected; read/write failure explicit. Keyboard/pane state unchanged by this diff. Full simple-mode implementation (Program/tool V/transcript/tab layout) still incomplete.

Commands: node --test test/workspace-preferences.test.js; Electron desktop --montclip-smoke --workspace-check [--workspace-reopen] --user-data-dir=<own-profile>. Baseline adds --workspace-baseline (pre-fix observed behavior only); cannot use that flag to change production preference policy. Harness development-only through existing smoke guard. No release/profile input included in logs.

Post-check concrete issue: initial setWorkspace UI restore could write over a failed/unknown preference read. Extracted production function test red1write vs expected0, fixed explicit persist=false only on initialization. User transitions still persist. Focused3/3; previous hidden restart evidence predates this initialization-only hardening, exact final source receives fresh Node checks, not falsely claimed re-run Electron.

Final-code Windows hidden Electron verification after the initialization hardening: independent processes sharing task-owned profile, port13130→18514. Initial reopen was color/advanced; switching to simple yielded edit/simple. Both exits0 and both WORKSPACE/projectUnchanged plus existing SMOKE markers passed. See workspace-final.json; freeBefore43994542080 bytes. This supersedes the earlier no-rerun statement for final-code execution, without changing prior red evidence.

Final commands: `node --test` (the npm test script):574 pass,0 fail,0 cancelled,0 skip; `node .github/scripts/release-check.js`:passed. Focused3/3. Logs are sanitized before committing. Linux/macOS, physical keyboard/readers, graded media, full simple/advanced layout, error injection in real OS and packaged runtime remain untested. This PR does not approve the Agent Pane or release.

Evidence binding: Git index blob IDs (Git object bytes, not worktree CRLF SHA256).
- app.js : 33941f7442d9fad980ca3f65003b113e68ece2af
- desktop/main.js : 8852696a2246e3e350a6862d9ef2ee7ee7a14372
- desktop/workspace-settings.js : ec3c285b711afb1ea7f71ad636fabc6507ab27d1
- workspace-preferences.js : 1385e79a61426f4bad424a6b20664d56e98a076c
- desktop/workspace-smoke.js : c9d98dfef2e68f0f42e399ce377637e118e8746b
- docs/validation/2026-11-01-workspace-final.json : dc3fcd5bc898c87261493248c433d10569990414
- docs/validation/2026-11-01-workspace-full-final.log : 6ef7831c0e3f3987fd988e1a8129a39fd4ab658b
- docs/validation/2026-11-01-workspace-release-final.log : 287388ae3633e951ddb9df019253c8f8a0eaee61
