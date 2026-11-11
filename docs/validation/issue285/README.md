# #285 — original sound across a replaced-picture roll

Owner: Cindy. Baseline: `7e793990a9ca1c1449edd6688c4cdbb026857c4a`.

This is implementation evidence, not approval, deployment, or Cindy-window acceptance.
The final GitHub head is recorded by the Issue's append-only `RSI-EVIDENCE v1`
entry; runtime file hashes in `roll-av.json` identify exactly what the export run loaded.

**Publication blocker:** the installed Cindy App integration sends the whole
base64 file through a Node channel limited to 256 KB of parameters. `CLAUDE.md`
needs 347,836 base64 characters. Its upload failed; remote readback confirmed
the old blob remained. The integration has no supported patch/file-handoff/git
push operation. No shared-account write or credential workaround was used.
The exact [pending manual and generated-page patch](pending-manual.patch) is
included for reviewability and later application through a supported Cindy App
channel. Those two local changes are not yet applied on the draft branch.
The draft must not be sent for initial review until this and the real-window
gate below are resolved. The numeric JSON receipt is compacted without removing
any measurements so its supported upload fits the channel.

Correction (2026-11-11, BB's installed-byte check): the plugin's own
`node/runtime.cjs:66` caps a JSON line at **262,144 JavaScript characters**,
while `node/core.cjs:94` accepts up to 700,000 base64 characters and
`main.js:17` forwards the whole parameter object. This is not a uniform 256 KB
byte limit. A 260,876-byte file yields 347,836 base64 characters and a 348,063
character request; BB's offline test dispatched zero operations. The exact
mapping to the outer `INTERNAL` error was not independently established.
Follow-up: [oppie-github #11](https://github.com/good-night-oppie/oppie-github/issues/11).
Earlier Issue records are retained unchanged.

## Requirement and ownership

- [Deja's assignment](https://github.com/good-night-oppie/MontClip/issues/285#issuecomment-6781251214).
- [Cindy's acceptance](https://github.com/good-night-oppie/MontClip/issues/285#issuecomment-6782212039).
- [JJ specification](https://github.com/good-night-oppie/MontClip/issues/285#issuecomment-6779084567), unchanged body SHA-256:
  `79d3b537e6a80bed34735e4920fd1e268f67564cd4cf85eab49835f25bd283ea`.
- [PG P1 adoption](https://github.com/good-night-oppie/MontClip/issues/285#issuecomment-6779297212), binding Issue body SHA-256:
  `78648d737d8894f553c4c9a592a2308969b094c29c98efc3612a85a1ff07d438`.

Both requirement hashes were read back during implementation.

## Change and limits

`updateClip` records the original AV relationship before changing a picture's
media. Reload/patch relinking retains recorded mixed-source groups only when
there is exactly one picture, unique tracks, and matching start/In/duration.
It does not infer mixed-source links from overlapping tracks.

A mixed-source roll checks both sides' channels, source continuity, constant
matching rates, locks and source handles before changing either side. Insufficient
handles refuse the whole operation instead of clamping. Same-source edits retain
their existing clamping behavior. The refusal uses JJ's proposed Chinese wording;
JJ's final wording approval is still separate.

Explicit `unlinked:true` remains an opt-out. Unknown source lengths, ramps,
incompatible speeds, incomplete channel pairs and broken source continuity refuse.
Old files whose mixed-source relationship was already erased cannot be safely
reconstructed from overlap alone: recognizable aligned orphan channels cause an
atomic refusal. This does not repair gaps/overlaps already saved by the old bug.

## Red first

Before product changes, `node --test test/roll-replaced-picture.test.js` ran
129 cases: **32 passed, 97 failed**. The 32 controls use the original source;
96 mixed-source cases and the link-free older-document replacement case fail.

- Exact original test: [red-source.txt](red-source.txt), SHA-256
  `44c8cebe736dff822329a6e6da62ae73112d129885aa17a752637d59173d24fa`.
- Raw local TAP SHA-256:
  `d30a5fc0c42af7e6352ec86a722281d3254e26fbacc59a7a7e60716859d5b171`.
- The complete sanitized red TAP replaced only the absolute checkout path with
  `<worktree>`; its SHA-256 is
  `b5064bccab3c31cc57451785e4b126d26e7928ee36a5230197678d199ecc592e`.
  At QQ's request, [red.tap](red.tap) now contains a labeled summary and key
  failure excerpt, not the complete TAP. The complete sanitized file remains
  at `.artifacts/issue285/full-public-red.tap` in this task checkout; the original
  raw file remains at `.artifacts/issue285/red.tap`. Cindy/QQ can retrieve those
  exact files and verify their hashes without publishing thousands of log lines.

To reproduce the red result, use the baseline commit in a disposable checkout,
copy `red-source.txt` to `test/roll-replaced-picture.test.js`, then run the command
above. The archived source is named `.txt` so ordinary `npm test` does not run it.

## Verification commands

All generated media and editor state belong to fresh test directories. No live
MontClip-Cindy project, installation, account configuration or user recording is used.

```text
node --test test/roll-replaced-picture.test.js test/trim-tools.test.js test/timeline-controls.test.js
npm test -- --test-concurrency=2
node .github/scripts/release-check.js
```

On this Windows host, `npm.ps1` consumes the argument separator. The verified
full-suite invocation uses Node to launch the installed `npm-cli.js` with the
literal arguments `test -- --test-concurrency=2`; npm prints
`node --test --test-concurrency=2`. No test threshold or CI configuration changed.

Set `MONTCLIP_FFMPEG_DIR` to an already installed build before the full suite.
The focused result is **192 passed, 0 failed**. It includes MCP disk readback
after refusal, explicit unlink/lock protection and unrelated-track invariance.
The final full suite completed with **2,644 tests: 2,627 passed, 0 failed,
17 skipped**, 3 suites, exit 0. [Test receipt and skip reasons](test-results.json)
records the raw log hashes; [focused green summary](green.tap) reports the 192
focused cases and the full log's hash/location. It is not the full TAP; that
remains at `.artifacts/issue285/full-public-green.tap`. Release readiness also passed. Earlier failures and reruns are
disclosed in the receipt; public README wording stays unchanged as JJ's approved
copy, with the behavior note in the technical reference instead.

Synthetic compositor run (existing Electron and FFmpeg, no downloads):

```text
MONTCLIP_ROLL_OUT=<new absolute evidence directory>
MONTCLIP_FFMPEG_DIR=<existing ffmpeg/ffprobe directory>
electron desktop/roll-av-smoke.cjs --montclip-smoke --user-data-dir=<new absolute profile>
```

The script generates two 60-second, 320×180, 25 fps sources. Each frame carries
its number; a white frame every second at `.2 s` coincides with a 20 ms 1000 Hz
beep over continuous 440 Hz sound. A supplies the original stereo sound; B has
a different background. Generation arguments and source SHA-256 are in the
receipt. One frame is `.04 s`; geometry tolerance is `1e-6 s`.

Each case calls the real editor's roll, undo, redo, save and disk readback, then
the real `fastExport()` compositor over the moved cut ±3 seconds. Each channel
is independently checked with `silencedetect=noise=-60dB:d=0.02`, beep placement
within one frame, one-second beep intervals within one sample, and flash/beep
alignment within one frame. Mixed-source decoded PCM hashes must equal their
same-source control at the identical range and delta. The script checks 150
exported frames and visible flash positions; it does not OCR the printed frame
numbers. Hidden Electron is not a Win11 Cindy real-window test.

**64/64 exports passed**, including 128 independent channel checks and all 48
mixed-source PCM comparisons. [Complete numeric receipt](roll-av.json) includes
each geometry, undo/redo readback, source command/hash, output hash and timing.
Worst flash/beep offset: **19.896 ms** (limit 40 ms). Worst beep placement error:
**0.104 ms**. Maximum interval error: **4.44e-16 s**. Silence detections: **0**.
Runtime: Electron 45.2.1, FFmpeg n9.0.2-42-gd7643a0fe3, encoder `h264_mf`.

An exported frame was also opened and inspected: the `before/out/-2` export at
output 1 s (source 26 s) shows B's dark blue background, frame number **650**,
and no editing overlays. [Inspected synthetic frame](replaced-frame.png).

## Acceptance layers and remaining gate

| JJ item | Evidence |
|---|---|
| 1: out +0.1, unchanged length and continuous original sound | Unit/MCP plus real export for each replacement position; `before`/`after` geometry in receipt |
| 2: out −0.1 and in ±0.1 | Same matrix and checks |
| 3: ±one frame, ±0.5, ±2; insufficient handles refuse | 25 fps `.04 s` cases plus atomic source-limit test |
| 4: both pictures replaced | 16 real exports plus both patch entries |
| 5: unchanged-source controls | 32 pre-fix unit controls passed; 16 current real exports, used for exact PCM comparisons |
| 6: undo/redo, each read back | 64 real editor cases; undo and redo each saved and read from `/api/project` |
| 7: exported cut ±3 s, no silence, beep position | 64 six-second exports, 128 channel checks; worst beep placement 0.104 ms |
| 8: no skipped/repeated sound | All 48 mixed outputs equal corresponding control PCM per channel; beep intervals remain one second |
| 9: independent L/R results | `measured.channels` has separate L/R readings in every case |
| 10: no new network/dependency/outbound feature | No runtime dependency, model or network changes; only authorized GitHub code/evidence publication |
| 11: flash/beep synchronization | All cases within 40 ms; worst 19.896 ms |
| 12: red before fix | Archived exact test/hash and 32-pass/97-fail TAP above |

| Layer | Status |
|---|---|
| Unit/MCP geometry and atomic refusal | 192/192 passed |
| Full suite / release check | 2,627 passed, 0 failed, 17 skipped; release readiness passed |
| Synthetic real compositor export | 64/64 passed; 128 channel checks, 48 exact PCM control comparisons |
| Win11 Cindy real window | Not run: candidate engine is not installed in an isolated Cindy plugin |
| europa actual package | Not run in this task; remains a separate platform gate |

No initial/final review is requested before the Cindy real-window gate. A draft
PR can hold these changes and evidence without claiming that gate is satisfied.

The proposed Cindy test installation must use a separate plugin id, a separate
`MONTCLIP_CINDY_DATA` directory and a private ephemeral port. Changing the plugin
id alone is insufficient: the wrapper defaults to `~/MontClip-Cindy`. Its engine
must be copied from the exact candidate head; its FFmpeg must be an already
available verified copy. The existing `local/montclip` stays installed and
unchanged. QQ must review the candidate package/hash and authorize the isolated
installation through Cindy's plugin installation flow before this test runs.

Public outbound material is limited to code, synthetic fixture commands and
sanitized numeric evidence on the authorized GitHub repository. The original
plugin project receipts and private media references are not uploaded. No new
product networking, dependencies, models or CI changes are introduced.
