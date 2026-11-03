# FLV transcode path: A/V sync with the new H.264 encoders (2026-11-02)

QQ asked for this in the #28 review of 5c986adf. The FLV transcode path now encodes H.264 with the graphics card or
Windows' `h264_mf` instead of libx264. A change of import or export encoder needs the flash + beep check, with a
limit of 40 ms. The export path was already checked (`docs/validation/2026-11-02-h264/`); this record covers
the transcode path.

## How

- **Command:** `node desktop/flv-transcode-av-sync.cjs --seconds 90 --json docs/validation/2026-11-02-flv-transcode-av-sync.json`
- **ffmpeg:** MontClip's own build, `ffmpeg-lgpl-n9.0.2-montclip1` (`ffmpeg.exe` sha256 `393413629e4c…`), resolved
  through `ffmpeg-path.js`, never from PATH.
- **Source:**
  - Format: a 90 s FLV in **Sorenson Spark (flv1)** with AAC 48 kHz mono, 320×180 at 30 fps. This format needs a
    transcode.
  - Content: black, with one white frame every 15 frames from frame 6. A 20 ms 1 kHz beep starts at the same instant
    as each flash, which makes 180 flash–beep pairs.
  - Location: a folder whose name has Chinese characters and a space.
- **Transcode:** `prepareMedia(file, {allowTranscode: true, acceptReadable: true})`, run twice:
  - **in its own order**: the first encoder that works here, which is `h264_nvenc` on this machine (an RTX laptop GPU);
  - **with `h264_mf` only**: the encoder every Windows machine has.
- **Measure:** `desktop/av-sync-measure.cjs`, the same tool as #36. Each flash is paired with its beep. The limit is
  40 ms, and each flash must still be within one frame of where it was in the source.

## Results (this Windows 11 machine, i7-11800H)

| file | encoder | pairs | worst offset | mean | flash shift against the source | time |
|---|---|---|---|---|---|---|
| source FLV | — | 180 / 180 | 0.42 ms | — | — | — |
| MP4, own order | h264_nvenc | 180 / 180 | **11.94 ms** | 11.94 ms | 12.33 ms | 4.9 s |
| MP4, h264_mf only | h264_mf | 180 / 180 | **11.94 ms** | 11.94 ms | 12.33 ms | 1.1 s |

- **Within the limit:** both transcodes are within the 40 ms limit, with no flash or beep left unpaired. Both
  outputs are H.264 yuv420p + AAC, 2700 frames, 90.03 s.
- **The offset is constant:**
  - The sound is about 12 ms ahead of the picture throughout, −11.92 to −11.94 ms on all 180 pairs.
  - It is the same with both encoders, and the flashes moved later by the same amount. So the transcoded video
    starts about 12 ms later than the audio; nothing drifts over the 90 s.
  - That is a third of a frame, under the limit, and was not chased further here.
- **Raw numbers:** every offset is in `2026-11-02-flv-transcode-av-sync.json`.

## Not run

- **Linux:** not run. The bundled Linux build has no H.264 encoder without a graphics card, so the transcode is
  refused there with `FLV_ENCODER_MISSING`.
- **`h264_qsv` and `h264_amf`:** not run on their own. `prepareMedia` reaches them only when NVENC fails.
- **Other machines:** not run, and neither are real recorder FLVs or recordings longer than 90 s.
