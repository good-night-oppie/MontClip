# Desktop FLV import: in-place check, hash, stream copy, cleanup (2026-11-02)

This replaces #7. It is a clean change from `main`.

## Behaviour checked

- **Picking a file.** When the user picks an FLV in the desktop app, the main process checks it where it is
  (`ffprobe` and the readable-range scan) and computes its sha256. Nothing is copied yet.
- **Gap in the timeline.** A timeline gap is refused at this step.
- **Asking first.** If the file needs re-encoding, or its ending can't be confirmed, MontClip asks before doing
  anything. Cancel has the focus.
- **Copying.** Only after the user agrees is the file copied into `media/`:
  - into a new file, opened exclusively (`wx`);
  - as a stream, never held whole in memory.
- **Hash checks after the copy:**
  - the bytes read during the copy must match the hash taken at inspection; otherwise the error is
    `FLV_SOURCE_CHANGED`;
  - the copy, read back, must match too; otherwise the error is `FLV_COPY_MISMATCH`.
- **The compatible MP4** is then made from the copy, not from the original.
- **Cleanup.** On cancel, on failure, when the page can't load the result, when the project changes, or when the
  app quits, only the files this import made are removed. Nothing else in `media/` is looked at.

## Unit tests: `test/desktop-flv-import.test.js`

8 tests. The ffmpeg steps are injected, so they run without ffmpeg. Every path is Chinese.

| test | result |
|---|---|
| the check happens in place and nothing is copied before the answer | pass |
| the copy's sha256 equals the original's; the compatible copy is made from the copy; `finish` keeps the files; the original is unchanged | pass |
| re-encode and readable-range consent are both required before any copy | pass |
| a timeline gap is refused at inspection | pass |
| a source that changes after inspection is refused (`FLV_SOURCE_CHANGED`) and its copy is removed | pass |
| cancel after inspection, during the copy (48 MB file), during preparation, and after preparation: only this import's files are removed | pass |
| a failed preparation removes the copy; shutdown removes unfinished imports and keeps finished ones | pass |
| only regular `.flv` files are accepted | pass |

## Real editor: `desktop/flv-native-smoke.cjs`

**Setup**
- Fresh profile, hidden offscreen window.
- The file is picked through the editor's own `#fileInput`, set via the DevTools protocol.
- MontClip's own ffmpeg (`ffmpeg-lgpl-n9.0.2-montclip1`, `ffmpeg.exe` sha256 `393413629e4c…`) is first on PATH.
  The system ffmpeg is not used.

**Fixtures**
- A compatible FLV: H.264 (`h264_mf`, yuv420p) + AAC, 320×180 at 30 fps, 10 s. One frame turns white every
  15 frames from 0.2 s, and a 20 ms 1 kHz beep starts at the same moment.
- A 2 s FLV in Sorenson flv1 + AAC, which needs re-encoding.
- Both sit in a Chinese folder.

**Results**

- **Compatible file**
  - Imported without a question (`remux`).
  - `media/` gained two files: a copy whose sha256 equals the original's
    (`7295f2ae1118e5d474e922acbfbf8a08e4ba68dbfb8c89e1accc73d04c756aa0`, 54,518 bytes), and `compat-….mp4`.
  - The original's hash and modification time are unchanged.
- **File that needs re-encoding**
  - The question appears with Cancel focused, and nothing is copied yet.
  - For this synthetic file, main's readable-range check also reports an unconfirmed ending, so both questions are
    shown.
  - Cancel leaves `media/` exactly as it was, and the project still has one file.

**A/V sync** (`desktop/av-sync-measure.cjs`, the same tool as #36). Each white flash is paired with its beep; the
limit is 40 ms.

| file | pairs | worst offset | unpaired |
|---|---|---|---|
| original FLV | 20 / 20 | 0.4 ms | none |
| imported MP4 | 20 / 20 | 0.4 ms | none |

In the imported MP4, every flash is at the same time as in the original (largest shift 0 ms; 300 frames in both).
The raw measurements are in `2026-11-02-desktop-flv-import-av-sync.json`.

## Not run

- **Real visible window: not run.** That is for VV.
- **The re-encode path through to the end:** not run with MontClip's own ffmpeg. `prepareMedia` on `main`
  re-encodes with libx264, which the LGPL build doesn't have, so the result would be `FLV_COMPONENT_MISSING`.
  #28's encoder selection fixes this. Here only the question, Cancel, and the cleanup were checked.
- **Cancel during a real copy in the editor:** not run. A 10 s file is copied too fast to cancel mid-copy. It is
  covered by the unit test with a 48 MB file.
- **Real recordings:** not run. Synthetic files only.
