# A/V sync after keeping sentence ranges (#36, QQ) — 2026-11-02

QQ (#36 review on 9001f793 and 52c0287): this PR changes what an edit keeps (a media sliver no longer than the
boundary tolerance is dropped instead of refused), so it needs a measured A/V sync check on a real export:
synthetic flash + beep, threshold 40 ms, with at least one range boundary where audio and video edges differ by no
more than half a frame.

## Result

| | flash ↔ beep pairs | worst offset | flashes where expected | verdict |
|---|---|---|---|---|
| this PR's edit | 7 of 7 | **0.06 ms** (all 7) | 7 of 7, 0 frames off | **pass** (≤ 40 ms) |
| negative control: sound moved 50 ms late | 7 of 7 | 50.1 ms (all 7) | 7 of 7 | **fail**, as it must |

Data: [`2026-11-02-av-sync-sentence-ranges.json`](2026-11-02-av-sync-sentence-ranges.json),
[`…-control.json`](2026-11-02-av-sync-sentence-ranges-control.json), the source's record
[`2026-11-02-av-sync-flash-beep-source.json`](2026-11-02-av-sync-flash-beep-source.json).

## What was run

- **Source:** `desktop/make-flash-beep.cjs`, made the way #46 makes `make-fixture-av.cjs` (fixed arguments,
  bitexact, never overwrites, hash recorded). It is black 320×180 at 30 fps for 10 s. Every 15 frames from frame 6
  (0.2 s, 0.7 s, …) one frame is white and a 20 ms 1 kHz beep starts at the same instant. VP9 + AAC mono 48 kHz,
  sha256 `18d9c7ec…`, 38 888 bytes.
- **ffmpeg:** #28's own LGPL build (`ffmpeg version n9.0.2-42-gd7643a0fe3-20261102`; win64 `ffmpeg.exe` sha256
  `39341362…`). The system ffmpeg was not used: the run put #28's build first on PATH and removed the WinGet entry.
  It is not copied into this worktree's `vendor/`, which git does not ignore on this branch.
- **Timeline:** picture on V1 from 0 to 10 s. The sound on A1 starts at 0.012 s and is cut at **4.010 s**, 10 ms
  away from the picture's frames, under half a frame (16.7 ms). One synthetic sentence covers each kept range.
- **Edit:** the ranges `1,2 / 4,5.5 / 7,8` are typed into the real sentence dialog, then applied and saved. The
  **4.0 s boundary** falls where the audio edge is 10 ms off the video edge. The plan drops the 10 ms audio sliver
  4.000–4.010 (within the 16.7 ms tolerance) and starts the next audio at 1.010 s in the output with `in` 4.010, so
  the sound stays where it belongs.
- **Export:** the editor's own `fastExport` (compositor + offline audio mix + ffmpeg). The H.264 encoder is
  `h264_nvenc`: the bundled LGPL build has no libx264, and graphics-card encoders come first per ADR
  2026-11-02-h264-encoder. The output is 320×180, 30 fps, 105 frames, 3.50 s, H.264, AAC 48 kHz.
- **Measure:** `desktop/av-sync-measure.cjs` decodes the export with the same ffmpeg. A flash is the first frame of
  each run of bright frames; a beep is the first sample above 0.3 after 0.1 s of quiet. Each flash is paired with
  its nearest beep, and an unpaired flash or beep fails. Each flash is also checked against where the kept ranges
  put it: 0.2, 0.7, 1.2, 1.7, 2.2, 2.7, 3.2 s.
- **Run:** `desktop/av-sync-smoke.cjs` with a fresh profile and a hidden offscreen window:
  `MONTCLIP_AV_INPUT=… MONTCLIP_AV_OUT=… MONTCLIP_AV_ENCODER=h264_nvenc electron desktop/av-sync-smoke.cjs --montclip-smoke --user-data-dir=<fresh>`.
  Add `MONTCLIP_AV_CONTROL_SHIFT=0.05` for the negative control.

## Not covered

- Other encoders: `h264_mf` (Windows' software encoder, the fallback without a graphics card) is not accepted by
  this branch's `delivery.js` (it comes with #28), and QSV / AMF were not run. One encoder was measured.
- One frame rate (30 fps) and one source. The low-fps refusal (fps 5 and 1) is covered by
  `test/range-plan-low-fps.test.js`, not by an export.
- Not a packaged build: this ran from source in Electron 45.2.1.

## Re-run on 2c06786 (after merging main, 2026-11-03)

The same source, timeline, ranges and measure as above, on this PR's head after main (#28's bundled FFmpeg, #57 …)
was merged in. Main's `delivery.js` now accepts Windows' own `h264_mf`, so both H.264 paths were measured.

| encoder | flash ↔ beep pairs | worst offset | flashes where expected | verdict |
|---|---|---|---|---|
| `h264_nvenc` | 7 of 7 | **0.1 ms** | 7 of 7 | **pass** (≤ 40 ms) |
| `h264_mf` | 7 of 7 | **0.1 ms** | 7 of 7 | **pass** |
| negative control (`h264_mf`, sound 50 ms late) | 7 of 7 | 50.1 ms | 7 of 7 | **fail**, as it must |

- Source: `node desktop/make-flash-beep.cjs <out>\flash-beep.mp4 --ffmpeg vendor\ffmpeg\win32-x64\ffmpeg.exe` → sha256
  `18d9c7ec…`, 38 888 bytes (identical to the first run).
- Run: `MONTCLIP_AV_INPUT=<…\flash-beep.mp4> MONTCLIP_AV_OUT=<folder> MONTCLIP_AV_ENCODER=h264_nvenc|h264_mf electron
  desktop/av-sync-smoke.cjs --montclip-smoke --user-data-dir=<fresh>`; the control adds `MONTCLIP_AV_CONTROL_SHIFT=0.05`.
  Fresh profile, hidden offscreen window, Electron 45.2.1, from source (not a packaged build).
- The export (h264_mf): 320×180, 30 fps, 105 frames, H.264, AAC 48 kHz, 3.50 s; beeps measured at x.2000625 s for flashes
  at x.2 s.
- Data: `2026-11-03-av-sync-sentence-ranges-2c06786-nvenc.json`, `…-mf.json`, `…-control.json`.
- Still not covered: QSV and AMF, other frame rates, a packaged build.
