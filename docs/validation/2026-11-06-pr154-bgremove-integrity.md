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
Subsequent changes only add smoke evidence capture and this report/artifacts.
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

## Copy handoff for JJ (pending, via Deja)

The task's current host surface does not expose messaging to JJ. This is a handoff,
not a claim that JJ approved the new wording. `ui-preferences.js` contains English/Chinese drafts:

| Key | Chinese draft |
| --- | --- |
| `own.bgremove-net-no` | 不下载的话，预览会保留背景。要保留背景导出，请先关闭这些片段的 AI 抠像。 |
| `own.bgremove-export-unavailable` | 这个片段的 AI 抠像未准备好。请在浏览器剪辑器里开启抠像，确认下载或重试，再从同一页面导出。要保留背景，请先关闭片段的 AI 抠像。 |
| `own.bgremove-export-realtime` | AI 抠像需要逐帧导出。请选快速导出或浏览器编码导出，或先关闭这些片段的 AI 抠像。 |

`BG_REMOVE_UNAVAILABLE` is a stable technical marker carried in the existing error string,
not a new response field. Existing `own.export-failed-prefix`, `font-net-deny`,
`font-net-allow`, `font-fallback-load` and the pre-existing MediaPipe load-failure toast
are reused. The font words are JJ's merged #151 wording. Existing original PR draft copy
remains marked as draft. README and its locked public-copy fixture are unchanged.

Not run: real MediaPipe model/inference, actual network downloads, Electron/visible desktop,
Linux/macOS browser smoke, realtime capture or a real WebCodecs encode. Fast ProRes is the
actual encoded positive control; the shared strict frame-preparation path is unit tested.
No install, merge/approval, Inbox configuration change, or visible desktop use was performed.
