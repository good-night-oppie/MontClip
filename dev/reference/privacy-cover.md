# Privacy covers: independent investigation and decision

**Review follow-up:** the original harness had service-ownership and tool-path
defects (QQ review of #186). The harness in this repository already contains the
fixes: `PORT=0` + IPC readiness + a random workspace proof, a private CDP pipe
with an exclusive browser profile, and one resolved FFmpeg/FFprobe pair
(`dev/real-tests/privacy-runtime.cjs`, covered by `test/privacy-runtime.test.js`).
The full review record follows in a separate PR split out of #186.
Raw evidence is kept outside the repository (see "Evidence" below).

Date: 2026-11-05. Base: `origin/main` fetched as
`d51b27a1ef5196725d73bca2d7d96c0de8c767bc` in the isolated
`bold-goodall` worktree. The parent worktree was not edited.
Sources: this repository's compositor/manual and generated synthetic video only.
No reverse-engineering material was read. No `VERIFICATION.md` or
`.cursor/rules/agentic-coding-steps.mdc` was present in this checkout.

## Root cause and decision

`drawFrame` renders V1 before V2. `drawClipCut` routes a clip with masks into
`drawMaskedClip`, which clears an RGBA offscreen layer and calls
`drawClipPicture(..., true)`. That function applies `buildFilter(p)` (including
Canvas `blur`) while drawing the source into the transparent layer. It then
resets the filter. `cutByMasks` multiplies the resulting alpha with the mask
using `destination-in`; `drawMaskedClip` composites this onto the main canvas
with the clip's opacity/blend.

Blur spreads both colour and alpha across the picture boundary. Near a scaled
picture's boundary, the blurred layer is partly transparent even when the
original source is opaque, mask opacity is 1 and feather is 0. The sharp lower
copy contributes `sharp * (1 - blurredAlpha * maskAlpha * clipOpacity)` under
normal source-over. More blur can increase that contribution. Mask feather
adds another partial-alpha boundary. This explains why increasing blur is not
a monotonic improvement in privacy.

This is a **privacy recipe error**, not evidence that artistic source-over or
mask composition is incorrect. Preserve the renderer. Do not globally punch
holes in lower tracks or silently alter blur alpha. Withdraw blur-over-copy
and adjustment-layer blur as privacy recommendations. Recommend an opaque,
hard-edged cover above all relevant layers, with margin and full time coverage,
then inspect the actual export. The paired-source test below verifies this
specific cover configuration; it is not a guarantee for arbitrary projects.

## Reproduction and regression

Windows PowerShell (Node 22+, installed Chrome/Edge, FFmpeg with libx264):

```powershell
$env:MONTCLIP_FFMPEG=(Get-Command ffmpeg).Source
$env:MONTCLIP_FFPROBE=(Get-Command ffprobe).Source
node dev/real-tests/privacy-cover.cjs out/privacy-cover
node dev/real-tests/privacy-cover-check.cjs out/privacy-cover/results.json blur
# Expected exit 1: old recipe fails privacy acceptance.
node dev/real-tests/privacy-cover-check.cjs out/privacy-cover/results.json cover
# Expected exit 0: replacement cover passes this fixture.
```

The standard-library harness makes two opaque 320×180, 12 fps H.264 videos,
one with bitmap digits `0123` and one without. No real names/accounts are used.
It drives the real application in a separate headless browser profile and
temporary data directory; only its recorded browser/server processes are stopped.
It leaves the temporary workspace for inspection. The output directory contains
source videos, projects, all 12 preview PNGs and a real `fastExport` MP4 for
each source/case, per-frame results, and a SHA-256 manifest.

Five scenarios: scale 0.6; linear movement plus scale 0.6→1; right/bottom crop;
picture at the output edge; and a 12 px feathered blur mask. The blur recipe
uses V1 clear + V2 same source with blur 64 and an add rectangle. The replacement
uses a black shape on V3, normal blend and opacity 1, with margin covering the
full sensitive rectangle and matching movement/scale. Crop geometry is explicitly
mapped into the fitted picture. The feather scenario deliberately replaces the
feathered effect with a hard-edged cover.

Acceptance compares every RGB channel of every frame between the two sources,
separately for preview PNGs and decoded exported MP4s. Missing frames fail.
Any changed pixel fails the recipe's privacy criterion. Blur is a positive
control: it must still expose differences. This is a source-dependence test,
**not an OCR or image-correlation score**. It does not claim that every nonzero
difference is readable text, or that low correlation proves privacy.

First Windows run: Chrome 156.0.8078.80, Node 22.15.1. Blur failed 60/60 preview
and 60/60 export frames (acceptance exit 1); opaque cover passed 60/60 preview
and 60/60 export frames (exit 0). The static blur frame was visually inspected:
the synthetic digits `0123` were readable. This is an observation about that
frame, not a claim that all frames were human-reviewed.

Final paused-preview rerun adds a direct alpha probe: at canvas (88,47) inside
the zero-feather static blur mask, the offscreen layer alpha is **83/255** on
all 12 frames. This is independent evidence for the source-over explanation;
the mask is not the only source of transparency. No compositor code changed.

The runner now refuses an existing output directory, and the checker requires
a completed run, all five named scenarios and every ordered frame index. This
prevents an interrupted rerun from accepting stale evidence. Independent review
also questioned the cover geometry; that concern was rejected by checking the
centre-based shape convention: at scale 0.6 the cover is x=64…121.6,
y=36…61.2, while the secret is x=68.8…112, y=42…51. It has margin, not a gap.

## Evidence

Raw evidence (per-frame PNGs, projects, source videos, real exports, logs) is
not committed. Originals are kept on Europa; only summaries and SHA-256 are here.

| run | location | file | SHA-256 |
|---|---|---|---|
| first run (original harness) | `europa:/home/admin/montclip-review/pr186-privacy/2026-11-05-privacy-cover/` | `results.json` | `73fa5a4d5af125efc68146861ad42a8d5b39eb085381779c21bc865d56875301` |
| | | `evidence.zip` | `91cabc7411b38228dfd6096db2289a42bbace81af007f1b18e0aa708b31c398a` |
| owned-runtime rerun | `europa:/home/admin/montclip-review/pr186-privacy/2026-11-05-privacy-owned/` | `results.json` (public, redacted paths) | `ba198e072090ec2f0c586e09251b9fe0986a5b9ca9fd9218a370ba59e1a620b8` |
| | | `evidence.zip` | `43c2b3c04f26833880563b17bb3cf4011c781adfd90557452508386a86810b8a` |

Both runs: blur exposed a difference in 60/60 preview and 60/60 export frames
(checker exit 1); the opaque cover had no difference in 60/60 preview and 60/60
export frames (checker exit 0). Raw initial environment-failure logs remain
local, not published with personal paths. Anyone can regenerate fresh evidence
with the commands above.

Checks on Windows: `npm test` with explicit FFmpeg/FFprobe paths: 1732 tests,
1725 passed, 7 skipped, 0 failed. Skips: two missing ASR models, missing bundled
FFmpeg, pinned-build fixture mismatch, three POSIX permission/owner checks.
FFmpeg: 9.0.1 full build (gyan.dev), not the bundled release binary.
`node .github/scripts/release-check.js`: all release checks passed.
`git diff --check`: passed. Initial unconfigured `npm test`: 1627 passed,
9 failed, 96 skipped (missing bundled FFmpeg); configuring the installed tools
resolved all failures without changing implementation. An intermediate preview
probe timed out (`presented frame timeout`) and was not counted; the harness
now uses paused `seekFrame` for preview and the real `fastExport` for export.

## Separate Linux evidence supplied by GG

Read-only retrieval through Cindy SSH from Europa:
`/home/admin/montclip-review/round3/blur-leak/`.
No Linux test was rerun by this task. GG reports 360/360 decoded frames in each
of nine videos. For blur 64, correlation >0.5 in 360 frames, mean 0.942, max
0.983; blur 32 mean 0.750, blur 24 mean 0.477. These are GG's high-pass Pearson
scores, not the Windows paired-source metric above. His preview was not scored.
The old pink-pixel detector is withdrawn and is not used here. The subtract-mask
variant is only his fixture result, not our default recommendation.

Retrieved SHA-256:

- `FINDINGS.md`: `0eaf4dba9ce8d1196838be12164d3cfa180aa98de610b3bd80c08e447497a5a2`
- `work/detect-results.json`: `4a1d909aba2bb7dec07ba709cef83c4f1785d93870aeb2728c8c37f1cdc20547`
- `work/compare-frame30-unredacted-doc-blur24-doc-blur32-doc-blur64-hole-blur24-hole-blur32-hole-blur64.png`:
  `05f265e1703e3b773cf3f03a223c20b0a5c985ea3e82354488518f39285abf36`

## PR #163 review at the requested head

Read PR body and repository code at
`23e88368886f921bf8ce483523fe6b22d090fb12` (depends on #155).
No changes to that branch. Its `drawCovers` runs on `clip.props.redactions`
inside the source's transform, downsamples the selected source rectangle and
draws it back. It is **not** the two-track recipe reproduced here.

Delete or narrow the PR-body sentence “强度 60 时，每个马赛克块至少有画面宽度的约
1.4%，字认不出来”. Suggested replacement for JJ: “强度控制格子大小；不能保证文字
无法辨认。敏感内容优先用不透明色块完整覆盖，并逐帧检查最终成片。”
Large glyphs, small redaction regions, low strength, changing crop/scale,
incomplete time windows, and clip alpha/blend can retain information. Its
stripe-flattening tests establish rendering behaviour, not unreadability of
arbitrary names/faces. No mosaic/strength configuration is certified by this task.

## Review boundary and pending acceptance

- No engine/schema/API change or runtime dependency; README locked wording untouched.
- Generated docs are rebuilt; unrelated generated page diffs only update source
  line anchors after the manual insertion. Demo sync is run.
- New Chinese prose in `skills/montclip-clip/SKILL.md` §4/§5.1 and the suggested
  #163 sentence above are pending JJ wording review.
- QQ/Rea code and safety review, VV interaction review, JJ wording approval and
  Deja's engineering decision remain required. This task does not approve,
  merge, deploy or install anything.
- Not run: Linux re-execution, Cindy visible-window acceptance, real streamer
  footage, arbitrary rotations/track mattes/transitions, OCR/reconstruction
  attacks, all blur strengths, or #163 runtime acceptance.
- Users must still inspect coverage throughout their own exports, including
  cuts, timing, movement, scaling, cropping, upper layers and antialiased edges.
