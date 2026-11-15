# PR154 pinned MediaPipe assets — verification and integration handoff

Task source: Deja, SOP v2, task `0cda57b0-4af9-4c2d-a1dd-ce601f70a512`.
Base local/remote head verified: `b783bd36cc38adbdf67333786d2f3c09ea38c287`.
No active Orca workers; this task alone edits `bold-kepler`. No candidate installation,
other worktree or user project was modified.

Review source: [QQ PR13 review at e5193751](https://github.com/good-night-oppie/MontClip-Cindy/pull/13#pullrequestreview-5797240147),
engine `fa9cd139`. The scope here is the main repository's floating remote dependency,
not a parallel candidate-package implementation.

## Evidence so far

- New negative control on the old loader failed:
  `node --test --test-name-pattern='floating MediaPipe' test/bgremove-consent.test.js`.
  Actual URL: `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/selfie_segmentation.js`.
- New loader pins all nine runtime files to `0.1.1675465747`, exact sizes and SHA-256.
  It checks consent before all fetches, uses SRI plus WebCrypto, rejects redirects and
  unknown names, bounds streamed byte counts, and constructs local Blob URLs only
  after every file passes. The third-party code/model bytes are not bundled or persisted.
- `node --test test/bgremove-assets.test.js test/bgremove-consent.test.js test/bgremove-copy.test.js test/font-consent.test.js`:
  27/27 passed. Successful complete-file loading in these unit tests uses a clearly
  labeled synthetic transport/digest oracle. Real WebCrypto checks the pinned empty
  `.data` and rejects changed/shortened synthetic content against real pins.
- `node dev/real-tests/bgremove-consent-browser-smoke.cjs`: 13/13 passed with local
  `MONTCLIP_FFMPEG`/`MONTCLIP_FFPROBE` overrides. CDP substitutes an explicitly synthetic
  inventory, with actual browser SRI/WebCrypto over synthetic bytes. A corrupted WASM
  response stops before entry JS executes; a subsequent explicit retry succeeds.
  The preview/export still uses synthetic input and fake segmentation. No external
  model, third-party executable script or WASM was executed or downloaded.
- `node docs/demo/sync.js` synchronized the new loader and script include. The existing
  demo copy-list omission of `ui-preferences.js` has not been expanded in this fix.

## Authorized real-byte audit (2026-11-06)

The user replied “agree” to the concrete download request. Only this exact official
package was fetched for byte verification and static inspection in `.cache/pr154-mediapipe/`:

`https://registry.npmjs.org/@mediapipe/selfie_segmentation/-/selfie_segmentation-0.1.1675465747.tgz`

See [sources and license evidence](../../licenses/mediapipe/README.md): exact npm SHA-512,
unpacked size 12,382,948 bytes, 12 files; downloaded compressed size 4,049,373 bytes.
The exact npm package declares Apache-2.0, lacks LICENSE/NOTICE and lacks source-commit
mapping. The official project LICENSE is retained as a reference, not a claim of exact
binary build provenance. Tarball SHA-512 and every runtime size/SHA-256 matched.

`node dev/real-tests/bgremove-assets-byte-audit.cjs .cache/pr154-mediapipe`: PASS.
Actual WebCrypto accepted all nine files; local Blob resolution preserved every byte.
Corruption of each resource was rejected before any Blob existed (empty data: add one byte).
This audit is offline and does not execute package JS, WASM or models.

Static inspection of actual ASCII JS (zero-based byte offsets): entry @34314/@34383
injects locateFile into WASM/PackedAssets; @34754 resolves child scripts through it;
@37936 resolves graph/model fetch through it. SIMD glue @1889 prefers Module.locateFile;
@18756 resolves its fixed WASM name; @19153/@21203 fetch that resolved value. Non-SIMD
paths are equivalent (WASM offsets five bytes earlier). Blob scriptDirectory becomes
empty but does not bypass the supplied resolver. All referenced runtime names are in
the allowlist; the empty data file is not referenced by these three JS files.
Generic exported FS lazy/preload helpers accept arbitrary URLs, but static inspection
found no initialization invocation. This is integrity control, not a network sandbox.
Real initialization/inference and live CDN delivery remain untested and unauthorized.

## JJ and integration handoff

### Two-key final copy, source bound to 3bf4f508

Deja relayed JJ's exact bilingual text from
`europa ~/montclip-labels/jj/2026-11-06-PR154-抠像文案定稿-JJ.md` on 2026-11-06.
Only `own.bgremove-assets-failed` and `own.bgremove-net-what` are now finalized;
the draft text below is retained as history and superseded for these two keys.
The other keys and the prior three finalized messages are unchanged. Exact four
sentences are locked in test/bgremove-copy.test.js and read through the translation API.

Behavior basis: Inspector's checkbox input calls requestBgRemove when bgRemove turns
true. Turning false does not clear consent or initiate a request; a subsequent true
calls requestBgRemove, which clears failed/loading only on this explicit path.
The existing synthetic retry test verifies a second download after failure and no
automatic preview retry. bgSeg and the loader's verified bytes/Blob maps are page-local,
with no persistence of resources/consent. The new recreated-page test verifies consent
and seg reset, zero requests before approval, and nine new resource requests after it.
This conclusion uses initialization and resource ownership, not cache:no-store alone.
Returning to a still-live tab is not a recreated page; browser history restoration or
host-specific reopen behavior has not been tested. No contradiction was found in the
normal fresh-page path; real-window truncation/retry and real-model execution remain unverified.

`node --test test/bgremove-copy.test.js` first failed on the old draft (1 pass, 1 fail).
After exact replacement, `node --test test/bgremove-copy.test.js test/bgremove-consent.test.js
test/bgremove-assets.test.js test/font-consent.test.js` passed 28/28. Demo sync ran with
no generated change (existing copy list does not include ui-preferences.js). No real
download/model/desktop or full-media rerun. Prior full and CI results remain bound to
their recorded heads; QQ must assess safety coverage incrementally on the new head.

Local checks on the integrity change based on b783bd36 (scope corrected below):
- `npm test -- --test-concurrency=4 --test-timeout=120000`: 1752 tests, 1745 pass,
  7 skip, 0 fail, using installed local FFmpeg/FFprobe via MONTCLIP_FFMPEG/MONTCLIP_FFPROBE.
- `node .github/scripts/release-check.js`: passed, 27 MCP tools.
- `node docs/docs/build.js`, `node docs/demo/sync.js`, `git diff --check`: passed.
- No redundant real render rerun after the already recorded 13/13 synthetic browser run;
  subsequent changes were offline byte audit, documentation and license packaging entries.
- Not run: real MediaPipe execution/inference, visible desktop, installation, cross-platform
  browser smoke or live CDN runtime delivery. No merge/approval, no license acceptance on behalf
  of the user. New CI results must be read against the new head, not inherited.

### CI correction after add981df

Run https://github.com/good-night-oppie/MontClip/actions/runs/42187166174 failed in all
four test jobs: Linux Node 18 (127790148926), Node 20 (127790148937), Node 22
(127790148896), Windows Node 22 (127790148922). Each failed only the same
`test/public-copy.test.js` case: `README (English) and README.zh-CN are JJ's text,
word for word`. Syntax and release jobs passed. Read with
`gh run view 42187166174 -R good-night-oppie/MontClip --log-failed`.

Cause: the author appended a README paragraph after the local full test run completed.
The 1745-pass result above therefore does NOT validate the final add981df tree. The
previous PR receipt's claim that it did was incorrect. No CI failure is waived by it.
The regression reproduces locally with `node --test test/public-copy.test.js` (one
failure). Minimal correction removes only the added README paragraph, restoring JJ's
approved public copy; the fixture and runtime implementation remain unchanged. This
integrity fix does not add a schema/prop/API/MCP surface requiring new README content.
Technical details remain in this document, CLAUDE.md and licenses/mediapipe/README.md.
After correction the same public-copy test passes. New CI and SHA are in the PR receipt.

The three finalized `bgremove-net-no`, `bgremove-export-unavailable`,
`bgremove-export-realtime` strings are unchanged. One new draft key:

- `own.bgremove-assets-failed` Chinese: AI 抠像文件未能完成下载和校验，已停止加载。请关闭再开启 AI 抠像重试。
- English: AI background removal files could not be loaded and verified. Loading stopped. Turn AI background removal off and on again to retry.

Deja should relay only this new draft to JJ. Existing download consent details remain
drafts as QQ noted; this change does not claim JJ approved them or real model behavior.

Integration must transplant the eventual reviewed commits, including `bgremove-assets.js`,
its `index.html` include before `app.js`, the app loader change, any new message, license
reference files, and tests. Packaging must include the new loader and license references.
Do not copy only app.js or recreate a CDN resolver. The candidate task is not to rewrite
this fix in parallel. package.json and desktop/package-win.cjs also include the license
references. The final commit and command results are recorded in the PR receipt;
prior full/render evidence in the earlier validation document retains its original head.
