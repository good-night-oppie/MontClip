# Agent Pane SPEC increment

Public base PR16 8bb9357 unchanged. Sole behavior handoff SPEC hash verified4b9f69d97d9bad7c5b7fd3ca37af7e2f8c097ef8521970ade9ba7f842bc68436; no implementation materials read. See decisions/2026-11-01-agent-pane-spec.md for evidence/P conflict resolution and deferred scope.

Actual UI buttons invoke referenceChips with the current project identity, selected caption clips and work-area in/out. Output whitelist drops paths, media, accounts; no attachment picker. Caption current text/current clip/sourceCaptionId/timeline bounds are distinct from original source time mapping. Absent provenance is not a new source-time proof.20chips maximum. References stay in session memory, not persistent or sent. Project-only chip is identity, not the project JSON. Current revision/gen are recorded but stale-reference revalidation and immutable payload approval remain transport prerequisites, not implemented guarantees. There is no network send channel.

Input Enter invokes existing unconfigured handling only when nonempty and not composing; Shift+Enter does not. Composition state and keyCode229 block send. Escape defers to an open dialog; settings close before pane; hide action restores launcher focus. Other application menus/global key handling and physical IME require real-window validation; no claim that Node adapter covers them. Same DOM remains across mode/language.

New tests execute actual reference builder and mounted handler using minimal DOM adapter:8/8 focused including prior foundation tests, chip whitelist/removal/session separation, IME/Shift+Enter/unconfigured draft retention, dialog/settings/pane Escape order. No editor project mutation/undo path or provider call added. No real Electron, narrow-window coordinate, physical IME or screen-reader acceptance this batch.

Still mandatory: local session save/restore, tool status cards with safe collapsible details, actual selected provider/credential settings, categorized unavailable tool permissions, approved payload protocol and proposal lifecycle, whole narrow-window workflow QQ/VV/JJ. This is not complete first delivery.

Actual Windows x64 Node22.15.1: node --test (npm test script)571/571,0 fail/cancel/skip; release-check exit0. Syntax app.js/agent-pane.js and diff whitespace checks pass. Sanitized final logs included; no tests claimed for other platforms or real windows.
