# H.264 encoders on the LGPL build: quality and speed

Synthetic source only (no user media): testsrc2 1920x1080 30 fps 10 s + moving mandelbrot overlay (synthetic). Machine: 11th Gen Intel(R) Core(TM) i7-11800H @ 2.30GHz, win32 10.0.26300 (NVIDIA + Intel graphics; no AMD).
Script: `node docs/validation/2026-11-02-h264/compare.cjs [local ffmpeg with libx264]`; raw numbers in `results.json`.
SSIM / PSNR against the source with the bundled ffmpeg, frames paired by index. Speed = 300 frames / wall-clock seconds.

| Encoder | Mode | Result | Speed (fps) | Bitrate (kb/s) | SSIM | PSNR (dB) |
|---|---|---|---|---|---|---|
| NVIDIA NVENC | quality | ok | 189.3 | 12785 | 0.9967 | 46.51 |
| NVIDIA NVENC | 6 Mb/s | ok | 203 | 6139 | 0.9882 | 39.97 |
| Intel Quick Sync | quality | ok | 69.1 | 10259 | 0.9950 | 43.80 |
| Intel Quick Sync | 6 Mb/s | ok | 69.9 | 6271 | 0.9888 | 40.21 |
| AMD AMF | quality | failed | — | — | — | — |
| AMD AMF | 6 Mb/s | failed | — | — | — | — |
| Windows Media Foundation (software MFT) | quality | ok | 237.5 | 11006 | 0.9843 | 41.74 |
| Windows Media Foundation (software MFT) | 6 Mb/s | ok | 235.1 | 6425 | 0.9731 | 37.75 |
| Windows Media Foundation (hw_encoding) | quality | ok | 178 | 9871 | 0.9938 | 43.34 |
| Windows Media Foundation (hw_encoding) | 6 Mb/s | ok | 174.4 | 6270 | 0.9878 | 40.11 |
| x264 via your local FFmpeg (reference) | quality | ok | 96.3 | 8426 | 0.9941 | 43.06 |
| x264 via your local FFmpeg (reference) | 6 Mb/s | ok | 96.2 | 6240 | 0.9900 | 40.60 |

Reading it:

- At the same 6 Mb/s, NVENC, Quick Sync and Media Foundation with hw_encoding are within about 0.7 dB PSNR of x264; Media Foundation's software encoder (what a computer without a usable graphics-card encoder gets) is about 2.8 dB PSNR / 0.017 SSIM below x264 — visibly a little softer on fine detail, as expected.
- "Quality" mode is not comparable across encoders in size: each maps quality differently (NVENC chose 12.8 Mb/s, x264 8.4 Mb/s).
- AMD AMF failed here (no AMD hardware); the export probe skips it the same way.
- MontClip's order picks NVENC on this machine; h264_mf (software MFT) is the fallback; x264 only with a local FFmpeg the user chose.
- Not measured: an older computer without any graphics-card encoder, real camera footage, audio/video sync of finished exports. VV is asked to look at exports from each encoder.
