# Ordered ranges: development validation, not release acceptance

Independent fixture SPEC SHA-256:
`03eec2be769e0d5b60737a35889315d02b1043593585ec3c9bec1bf682ed2ea2`.
Input video SHA-256 before and after both runs:
`7685c3328327badf78781cccfb9ab55e364e67234d8954c374de38b428828366`.
Only synthetic inputs were read; reference-reordered.mp4 was not used as output.

## Passed

- Unit/API suite: 555/555, including independent exact eight-cue SRT truth,
  reverse source order, half-open intersections, repeated source intervals,
  rounded-empty caption omission, revision conflicts and unchanged source input.
- Release-check passed; editor playground scripts synchronized.
- Real Electron 45.2.1, fresh Chinese/space-containing userData, system FFmpeg:
  `MONTCLIP_M0_INPUT=<synthetic bilingual-source.mp4> node desktop/smoke.js --m0`.
  First run called the shared plan; second run used actual sentence-dialog DOM
  input (`9,12` then `1,4`), preview and apply click handlers. Preview did not
  change the project. Undo restored the 16-second source; redo restored user
  order. Save plus server readback retained that order.
- Original fastExport compositor produced MP4, with separate SRT and mapping.
  These are actual product outputs. Full FFmpeg decode passed; ffprobe found
  180 video frames, 30fps and 6 seconds. The SRT has all eight expected intervals,
  including 0–200ms and 5800–6000ms whole-text boundary captions.
- Test artifacts retained outside the repository:
  `%TEMP%/MontClip 中文 smoke XZJTbp/workspace/exports/`
  and `%TEMP%/MontClip 中文 smoke UBOsSw/workspace/exports/`.
  Each contains M0 reordered.mp4, M0.srt, M0.mapping.json and M0.receipt.json.
- Final closeout run also passed with existing Limit/2x preview settings and
  IN/OUT: preview temporarily used unlimited 1x and restored settings; undo
  restored old IN/OUT and redo cleared it. Artifacts:
  `%TEMP%/MontClip 中文 smoke 2IjCmG/workspace/exports/`.

## Not passed or not tested

- Frame count is not proof of exact frame identity/order or A/V synchronization.
  Rea independent 270..359 → 30..119 and <=40ms measurements are pending.
- Save/readback is not yet a full quit/relaunch verification. The script uses
  local upload and parsed fixture SRT, not an OS file-picker interaction.
- Hidden Electron DOM exercise is not VV visible-window usability acceptance.
- No portable package, bundled-FFmpeg-only PATH, offline ASR, simple/advanced UI,
  chat integration, disk-full/unwritable destination or same-name export acceptance.
- Source mapping describes the current edit; it does not certify encoded timing.
- Arbitrary later caption timing edits invalidate current provenance; mapping
  export and further ordered plans explicitly refuse stale provenance. Automatic
  provenance maintenance across all native trims/splits is not implemented.
- This batch stays separate from the b937d2b review repair head until coordinated.
