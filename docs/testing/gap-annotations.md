# Synthetic gap acceptance: annotations and undo/redo

Implementation: 77c51373 (no production behavior changed in this follow-up).
The original Chrome run proved A/V sync but had no captions, danmaku, source
cuts, or browser undo/redo. The earlier gap-undo unit test used browser stubs.
This follow-up fills that evidence gap rather than repeating real-file scans.

## Reproduce

Windows, Node 22+ and installed Chrome, using the existing bundled FFmpeg:

    node scripts/gap-chrome-acceptance.cjs --annotations

Linux, Node 24 and installed Chrome/FFmpeg, without installing anything:

    MONTCLIP_FFMPEG=/usr/bin/ffmpeg MONTCLIP_FFPROBE=/usr/bin/ffprobe node scripts/gap-chrome-acceptance.cjs --annotations --software

Software mode uses installed libx264 only to generate the synthetic input.
The real product repair still selects its normal available encoder; the export
uses the real Archive (FFV1/PCM) delivery. It does not change external-encoder
settings or assert that Linux H.264 hardware encoding works.

## Method and scope

Two five-second flash/beep TS segments have a +300 s timestamp offset, then are
remuxed to MKV and truncated. The observed removed gap is 294.979 s. Before-gap
annotations at 2 s stay at 2 s; after-gap annotations at 301.979 s become 7 s.
The same fixture contains captions, imported danmaku metadata, highlight cards,
and a separate sequence with audio/video cuts from each side of the gap.

The script drives the actual repair handler in an isolated headless Chrome,
checks the mapped timestamps (finite and within 1/30 s), then invokes the real
undo and redo functions. Canonical full repair snapshots must match before/after,
including media references, all sequences, annotations and highlight cards.

It checks black/white preview pixels on both sides of the repaired gap, green
caption visibility before/during/after each cue, and exports with fastExport.
Every exported frame is decoded and matched to its actual PTS; green caption
onset/end must be within one frame of the expected cue. It opens the source-cut
sequence, checks its preview, and exports those cuts too. The two expected flash
PTS are 0.233333 and 1.233333 s (tolerance one frame). PCM beep onset is compared
with each actual flash PTS, including the audio stream origin.

Imported danmaku is analysis metadata, not a burned-in overlay. Its source-time
and toTimeline mappings are checked in the real browser, and its data is included
in undo/redo equality. There is no claim of rendered danmaku pixels.

## Windows result

Receipt: [gap-annotations-windows.json](gap-annotations-windows.json). SHA-256
values for generated source, gapped input, repaired output, full export and cut
export are in that receipt. Artifacts remain in the printed synthetic temp folder.
Container metadata can make regenerated input hashes differ; hashes identify
this exact run, not a byte-for-byte deterministic fixture generator.

- Captions, danmaku source and timeline times, highlights and cut source in:
  [2, 7] s; numeric mapping error 0 s. Browser undo and redo: pass.
- 299 exported video frames; captions exactly [2, 2.4] and [7, 7.4] s:
  worst boundary error 0 ms.
- Repaired duration 9.966666 s; full Chrome export 9.966667 s. Both have
  20 matched flash/beep pairs and zero unmatched events. Worst A/V error before
  the gap 11.937 ms, after 11.458 ms (repair limit 33.333 ms; export 40 ms).
- Source-cut export 1.4 s, two matched pairs, no unmatched events; flash PTS
  0.233333 / 1.233333 s, within one frame. A/V errors 11.937 / 11.458 ms.
- Six caption preview and six export visibility samples pass; four main preview
  and four source-cut preview black/white markers pass.

## Linux internal audio result

Receipt: [gap-internal-linux.json](gap-internal-linux.json). Node v24.16.0,
installed system FFmpeg selected by the documented development environment
variables; no install or persistent setting change. The synthetic source was
generated with libx264, and production repair used its available software path.
The repaired file is 9.967 s with 20 pairs and no unmatched events. Worst error:
9.742 ms before / 10.200 ms after, below the one-frame 33.333 ms limit.
This receipt measures only the repaired file, not a browser export.

To remeasure an already produced synthetic repaired file without rerunning the
browser, with the same FFmpeg environment variables:

    node -e "console.log(JSON.stringify(require('./scripts/gap-chrome-acceptance.cjs').measured(process.argv[1],1/30)))" /path/to/synthetic-repaired.mp4

## Linux browser result

Receipt: [gap-annotations-linux.json](gap-annotations-linux.json), including all
five artifact SHA-256 values. Actual production repair used VP9; the fixture
encoder field names libx264 because it describes input generation, not repair.
Chrome export used Archive FFV1/PCM rather than Windows H.264/AAC.

- All five timestamp arrays [2, 7] s; mapping error 0. Browser undo/redo: pass.
- Main preview (4 markers), source-cut preview (4 markers), caption preview (6)
  and caption export visibility (6): pass.
- 299 exported frames; caption boundaries [2, 2.4] / [7, 7.4] s, error 0 ms.
- Repaired and exported length 9.967 s; each has 20 matched pairs, zero unmatched.
  Internal A/V error before/after: 9.742 / 10.200 ms. Full export: 9.750 / 10.208 ms.
- Cut export length 1.4 s; two matched pairs. Flash PTS 0.233 / 1.233 s (0.333 ms
  from expected), audio errors 9.729 / 10.187 ms. All below 40 ms.

Failed attempts were not counted: a remote reboot removed the first temporary
workspace; an initial Archive request lacked its explicit video codec; Chrome
sometimes needed longer than the old 20-second ready timeout. The harness now
supplies Archive FFV1 explicitly and allows 60 seconds for scripts to load, with
page and exception diagnostics on failure. Final run passed; original footage
was never involved. Each server/Chrome PID belongs to the isolated run and is
closed by its finally handler; the harness also writes owned-processes.json.

## Checks

- Windows targeted tests: 2 passed, 0 failed (gap-copy and gap-undo).
- Release readiness and script syntax: passed. Full CI results are recorded in PR.
- Existing old acceptance results were read first, not overwritten; Windows
  caption boundary measurement reused the newly exported artifact rather than
  rerunning repair. Synthetic artifacts remain in their printed temp directories.

## Remaining gate

Keep PR #167 Draft. The success-alignment suffix stays disabled. The real P3
recording has no audio or internal gap. DD and the reporter have no confirmed
qualifying real recording, so real before/after-gap A/V acceptance remains
unmeasured. No real footage was copied, rescanned, or modified in this follow-up.
No application installation or publication was performed.
