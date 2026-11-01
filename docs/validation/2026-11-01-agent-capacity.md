# Agent capacity feedback and scope recovery — 2026-11-01

Additive delta after PR20 a0d58d6; PR16–20 heads remain unchanged. JJ approval of PR16 does not approve these new strings.

The old controller retained scopes at capacity, but mount.sync kept the previous context key when entering the blocked scope. Returning directly to that previous context skipped rebinding and showed the blocked empty session. The fix records the blocked context key, so returning to an existing project selects its retained scope. No cross-project reuse, deletion or restart advice.

Separate stable locale keys: paneSessionCapacity (50 total sessions), paneScopeCapacity (no session can be created for this project), paneTextLimit (16000 JavaScript string units, matching maxlength), paneReferenceLimit (20), paneActionFailed (unexpected action). At exactly maxlength the input handler shows shortening/splitting advice; oversized programmatic input is rejected without replacing the controller draft. References and new-session mutations reject a blocked scope. Capacity feedback directs users to existing sessions/projects and copying drafts they want to retain. No new model/tool ability.

Production controller and mounted-handler red: 9 tests, 7 pass/2 fail (generic LIMIT and missing dedicated locale status). Green focused pane/storage:20/20. Added assertions cover blank blocked draft/references, forbidden mutation, return to existing scope, unchanged retained text after overlong input, and actual mounted return path. Full suite/release results in adjacent logs. No new media/profile or Electron visual run for this delta; physical maxlength/IME behavior remains subject to VV verification. No claim that old scopes were deleted. B/C/E broader wording and duplicate unconfigured-status presentation deferred rather than guessing unspecified copy.

Request JJ review of new keys and trigger conditions, QQ of context-key fix; old approvals do not transfer.

Actual Windows Node result: node --test 586 pass, 0 fail/cancel/skip; node .github/scripts/release-check.js passed. Logs sanitized before staging.
