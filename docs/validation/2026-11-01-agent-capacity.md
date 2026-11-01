# Agent capacity feedback and scope recovery — 2026-11-01

Additive delta after PR20 a0d58d6; PR16–20 heads remain unchanged. JJ approval of PR16 does not approve these new strings.

The old controller retained scopes at capacity, but mount.sync kept the previous context key when entering the blocked scope. Returning directly to that previous context skipped rebinding and showed the blocked empty session. The fix records the blocked context key, so returning to an existing project selects its retained scope. No cross-project reuse, deletion or restart advice.

Separate stable locale keys: paneSessionCapacity (50 total sessions), paneScopeCapacity (no session can be created for this project), paneTextLimit (16000 JavaScript string units, matching maxlength), paneReferenceLimit (20), paneActionFailed (unexpected action). At exactly maxlength the input handler shows shortening/splitting advice; oversized programmatic input is rejected without replacing the controller draft. References and new-session mutations reject a blocked scope. Capacity feedback directs users to existing sessions/projects and copying drafts they want to retain. No new model/tool ability.

Production controller and mounted-handler red: 9 tests, 7 pass/2 fail (generic LIMIT and missing dedicated locale status). Green focused pane/storage:20/20. Added assertions cover blank blocked draft/references, forbidden mutation, return to existing scope, unchanged retained text after overlong input, and actual mounted return path. Full suite/release results in adjacent logs. No new media/profile or Electron visual run for this delta; physical maxlength/IME behavior remains subject to VV verification. No claim that old scopes were deleted. B/C/E broader wording and duplicate unconfigured-status presentation deferred rather than guessing unspecified copy.

Request JJ review of new keys and trigger conditions, QQ of context-key fix; old approvals do not transfer.

Actual Windows Node result: node --test 586 pass, 0 fail/cancel/skip; node .github/scripts/release-check.js passed. Logs sanitized before staging.

## JJ final copy integration (current follow-up, not the original PR21 result)

Replaced paneSessionCapacity/paneTextLimit with requested paneLimitSessions/paneLimitChars and the supplied bilingual final text. SESSION_CAPACITY uses the session text; SCOPE_CAPACITY keeps its separate project-return action. The window count includes restored persisted sessions; reopening is not a capacity reset and is not recommended. TEXT_LIMIT uses the too-long text only above16000 UTF-16 units, matching the actual rejection. Exactly16000 is accepted and does not claim it is too long; native maxlength usually prevents further typing. Unconfigured send still reports its independent actual no-provider result.

Mounted boundary regression red:9/10, previously exactly16000 displayed a limit status. After the trigger correction pane+storage21/21. Tests also enter16001 programmatically and then a valid draft, verifying the correct error and independent unconfigured send with preserved draft/language switch. No new full-suite or physical input run. JJ review requested only for changed keys/triggers at the follow-up commit; original approval does not cover this delta.

## PR21 final capacity wording delivery

Normal fast-forward follow-up directly on public6dfa20a329ff63940190672aa3aa2f82dc386a09; no later layout, persistence or unrelated locale changes extracted. Parent is exactly that public head; author/committer use GitHub noreply. PR20 dependency remains unchanged. PR22/23 remain on their existing public heads; the equivalent capacity text already present there is not a new approval and their dependency merge must be reconciled without force.

Supersedes the earlier key/trigger paragraph: SESSION_CAPACITY now maps to paneLimitSessions and TEXT_LIMIT to paneLimitChars, using JJ final Chinese/English verbatim. paneScopeCapacity, paneReferenceLimit and paneActionFailed retain their distinct meaning. No restart recommendation. Exactly16000 UTF-16 units is accepted without an error status; only rejected oversized input displays the shortening/splitting text. Unconfigured send remains separate and retains the draft. No new service or transport.

New production mounted-handler regression covers both locales, exact boundary, rejected16001, valid edit clearing error, unconfigured send and51st-session rejection. Before fix1/1 failed on exactly16000 showing the old limit status; after fix1/1 passed. Existing21/21 evidence is retained, not rerun as a separate subset. Because the input handler changed, run the full candidate suite and release-check once; actual totals recorded below and in capacity-final logs. No new Electron/profile/media/physical IME validation.

Final candidate on Windows Node22.15.1: `node --test` (npm test script)587/587,0 fail/cancel/skip; `node .github/scripts/release-check.js` passed. Logs use <repo>/<user> for local paths. No old-head approval inherited; JJ reviews changed keys only, QQ the boundary-handler increment.
