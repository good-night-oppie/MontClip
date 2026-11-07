# PR #154: background-removal export integrity

Scope: `good-night-oppie/MontClip#154`, original head
`d5be1303adfd9d373ad61c01c12d43200193562f`. Independent worktree: `bold-kepler`.
The original `sturdy-babbage` worktree was clean; no active Orca workers or KEEL runs were found.
The task explicitly reassigned this PR. No parent-worktree files were edited.
GitHub reviews and comments were empty; the two findings came from Deja's supplied triage document.
AGENTS.md, CLAUDE.md and CONTRIBUTING.md were read; no VERIFICATION.md or
`.cursor/rules/agentic-coding-steps.mdc` was present in this checkout.

#151 is merged. This branch merges `origin/main` at
`d51b27a1ef5196725d73bca2d7d96c0de8c767bc`, retaining JJ's final font wording.
Implementation commits: `1355bb13`, merge `757324b4`, and `59b4364a`.
At `9b3d4c7a656d665556b6dd5f7620bf8ceedc7cc6`, subsequent changes only added
smoke evidence capture and this report/artifacts. The full-suite/render results below
belong to that implementation and the recorded code heads, not to a new render run after copy finalization.
The PR body records the final review head; no old approval is claimed for it.

## Reproduction before the fix

- `node --test test/bgremove-consent.test.js`: 5 passed, 4 failed with the new negative controls on the original implementation.
- The synthetic browser smoke on the original implementation returned
  `status: "done", via: "headless", src: "/exports/bg.mov"` for job `x_7bq357ri`,
  despite the independent page having no consent/mask. `preflightError` was null.
- The deliberately failed first script request left `consent=true`; an explicit retry
  still returned false and the script request count stayed at 1.
- A later numeric-keyframe boundary test failed before the effective-property fix:
  10 passed, 1 failed. The file/API accepts numeric `keyframes.bgRemove` even though
  this is not an advertised animatable UI property.
- An initial smoke used an invalid profile name, then an x264 profile without a configured
  external encoder. Neither was counted as the export-integrity reproduction; ProRes was used above.

## Fix and checks

The range preflight uses rendered media (including flattened compositions), track/clip
enable state and effective background-removal properties. Fast/WebCodecs check before
audio mixing or encoder creation. Every required frame waits for a fresh nonempty mask;
missing media, failed inference or no result cannot reuse a stale mask or become success.
The existing job failure path returns `BG_REMOVE_UNAVAILABLE` with a recovery action.
Realtime recording refuses cut-outs because its asynchronous preview path cannot promise exact masks.
Composed frame/scopes calls also refuse unavailable masks.

Only an explicit user retry clears failed/loading. In-progress requests share one load.
No consent is inherited by another page, granted by an agent, persisted, or bypassed.
To retain the background the user must explicitly disable the effect first.

Windows, Node 22.15.1, headless Chrome, locally available FFmpeg/FFprobe:

```powershell
$env:MONTCLIP_FFMPEG=(Get-Command ffmpeg).Source
$env:MONTCLIP_FFPROBE=(Get-Command ffprobe).Source
node --test test/bgremove-consent.test.js test/font-consent.test.js
npm test -- --test-concurrency=4 --test-timeout=120000
$env:SMOKE_EVIDENCE_DIR=Join-Path (Get-Location) '.cache/pr154'
node real-tests/bgremove-consent-browser-smoke.cjs
node .github/scripts/release-check.js
```

| Check | Result |
| --- | --- |
| Background removal + font consent | 18 passed |
| Complete suite, bounded concurrency | 1743 tests: 1736 passed, 7 skipped, 0 failed |
| Synthetic browser smoke | 12/12 passed |
| Release readiness | Passed (27 MCP tools) |
| Diff whitespace | Passed |

An earlier unconstrained complete run had 1734 passes, 7 skips and one
`MCP FLV import shares the explicit conversion gate` timeout. Its residual MCP child
was stopped by its recorded PID 69280 only. The FLV file then passed 5/5 alone,
and the complete bounded-concurrency run above passed. An earlier run before merging
main lacked FFmpeg configuration and failed environment-dependent checks; these are
superseded by the complete passing run. The attempted README feature bullet was removed:
JJ's public copy is locked; no new schema/prop/API endpoint was introduced here.

## Render evidence

Only a program-generated 64×64 gray image/dark square was used, fitted into a
640×360, 3-second timeline. No real person's project/media was opened.
CDP intercepted requests: the first script load is failed, the second receives a fake
MediaPipe implementation. All other remote requests are intercepted; no real model
download or license acceptance occurred. The fake mask keeps the right half.

At `(220,180)`, red must be `<30`; at `(420,180)`, red must be `>150`.
Preview RGB: `[0,0,0]` / `[200,200,200]`; decoded ProRes RGB: `[0,0,0]` / `[198,198,198]`.
Both images were also visually inspected: removed left background, retained right half,
matching composition and no editing overlays. There is no audio/timing change requiring
flash/beep synchronization evidence.

- [Preview](pr154/preview.png)
- [Decoded export frame](pr154/export.png)
- [Browser/job receipt](pr154/result.json): `x_he4zarmr`, `failed`, `src:null`, actionable error;
  confirmed tab export succeeds; explicit retry makes exactly two script attempts.

## JJ three-key copy finalized (2026-11-06, via Deja)

Source: Deja's requester follow-up on task `0cda57b0-4af9-4c2d-a1dd-ce601f70a512`,
relaying JJ's complete bilingual text and confirmation of this branch's export option names.
Only the following three keys are finalized. This is copy approval, not functional approval.
The earlier pending handoff is resolved by this follow-up; font wording is not reopened.

| Key | Chinese final | English final |
| --- | --- | --- |
| `own.bgremove-net-no` | 不下载的话，AI 抠像用不了，预览会保留背景。想保留背景导出，请先关闭这些片段的 AI 抠像。 | Without the download, AI background removal can't run and the preview keeps the background. To export with the original background, turn it off on these clips first. |
| `own.bgremove-export-unavailable` | 现在不能导出：这个片段的 AI 抠像还没准备好。请回到浏览器剪辑器，按提示下载，或把这个片段的 AI 抠像关掉再开一次；准备好后在同一页导出。想保留背景，先关闭这个片段的 AI 抠像。 | This clip's AI background removal isn't ready, so it can't be exported yet. Go back to the browser editor and follow the download prompt, or turn the clip's AI background removal off and on again. When it's ready, export from that same tab. To keep the original background, turn it off on this clip first. |
| `own.bgremove-export-realtime` | 边播边录这种导出方式不支持 AI 抠像。请改用「快速（ffmpeg）」或「显卡加速编码」，或者先关闭这些片段的 AI 抠像。 | Realtime recording doesn't support AI background removal. Choose “Fast (ffmpeg)” or “WebCodecs (HW encode)”, or turn off AI background removal on these clips first. |

Follow-up verification (base `9b3d4c7a`; final copy commit is recorded in the PR):

- Read back all six strings through `MontClipView.t`: exact equality with the requester text.
- `node --test test/bgremove-copy.test.js test/bgremove-consent.test.js test/font-consent.test.js`:
  20/20 passed. The new copy/option-name assertions first failed against the draft.
- The realtime guidance matches `ui-terms.js`'s Fast label and `ui-preferences.js`'s WebCodecs label.
  Existing no-consent refusal and explicit retry tests remain passing.
- `node docs/demo/sync.js` completed with no generated changes. Its existing copy list does not
  include `ui-preferences.js`; the older demo copy has none of these keys. No unrelated demo
  synchronization changes were added in this three-key follow-up.
- No full suite, real model download, rendering, or visible-desktop tests were repeated.
  The existing screenshots/job JSON remain historical evidence with the previous wording.

`BG_REMOVE_UNAVAILABLE` is a stable technical marker carried in the existing error string,
not a new response field. Existing `own.export-failed-prefix`, `font-net-deny`,
`font-net-allow`, `font-fallback-load` and the pre-existing MediaPipe load-failure toast
are reused. The font words are JJ's merged #151 wording. Existing original PR draft copy
remains marked as draft. README and its locked public-copy fixture are unchanged.

Not run: real MediaPipe model/inference, actual network downloads, Electron/visible desktop,
Linux/macOS browser smoke, realtime capture or a real WebCodecs encode. Fast ProRes is the
actual encoded positive control; the shared strict frame-preparation path is unit tested.
No install, merge/approval, Inbox configuration change, or visible desktop use was performed.
