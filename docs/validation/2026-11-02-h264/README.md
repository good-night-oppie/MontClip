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

## 2026-11-02, second round (VV's quality review): Media Foundation

Three scripts, all on MontClip's bundled ffmpeg and synthetic sources, rerunnable:
`measure-mf.cjs` (quality by region), `maxrate-mf.cjs` (does a cap hold), `sync-mf.cjs` (A/V sync through
the export API). VV's own report and script were not on this machine, so the regions and the source are this
setup's; compare rows within a table, not with VV's absolute numbers.

### Quality by region: software MFT and hardware MFT at quality 65 and 75 (`mf-quality.md`)

Source: testsrc2 1920×1080 30 fps 10 s, a 640×480 skin-tone patch with moving grain, and a 1920×200
subtitle band (white Chinese text, black outline, dark bar). PSNR ("average" of Y U V, and Y alone for the
subtitles) against the source, frames paired by number.

| condition | MFT | Mb/s | encode fps | PSNR whole | skin | subtitle | subtitle Y |
|---|---|---|---|---|---|---|---|
| software MFT, quality 65 (old CRF 18) | H264 Encoder MFT | 9.39 | 205 | 44.2 | 41.9 | 43.9 | 42.5 |
| software MFT, quality 75 (new CRF 18) | H264 Encoder MFT | 13.13 | 203 | 46.2 | 42.2 | 46.6 | 45.1 |
| hardware MFT, quality 65 | NVIDIA H.264 Encoder MFT | 8.34 | 159 | 45.0 | 41.9 | 44.3 | 42.9 |
| hardware MFT, quality 75 | NVIDIA H.264 Encoder MFT | 10.9 | 166 | 46.7 | 42.1 | 47.0 | 45.6 |

- The software MFT is what MontClip uses (`-hw_encoding` unset): **CRF 18 now maps to quality 75**
  (`delivery.js`, `MF_SOFTWARE_BOOST`, tested). Against 65 it costs about 40 % more bitrate, buys about
  2 dB on the whole frame and 2.7 dB on the subtitles, and no speed.
- The hardware MFT here is NVIDIA's (`MFT name` in the log). At 65 its subtitle band reads 44.3
  (Y 42.9, close to VV's 42.6); at 75, 47.0 (Y 45.6), for 10.9 instead of 8.3 Mb/s. MontClip does not
  use it today; whether to add steps is Deja's call.
- Skin barely moves (41.9 → 42.2): both encoders smooth the fine grain at either setting
  (`samples/*-skin.png`).

### maxrate in quality mode (`maxrate.md`)

| source | preset | output | cap | average | highest 1 s | cap held? | video args |
|---|---|---|---|---|---|---|---|
| grain | tiktok | 1080×1920 | 20 Mb/s | 34.72 Mb/s | 36.08 Mb/s | **no** | `-c:v h264_mf -rate_control quality -quality 73 -maxrate 20000k -bufsize 40000k -g 30 -pix_fmt nv12` |
| grain | instagram-reels | 1080×1920 | 25 Mb/s | 34.72 Mb/s | 36.08 Mb/s | **no** | `-c:v h264_mf -rate_control quality -quality 73 -maxrate 25000k -bufsize 50000k -g 30 -pix_fmt nv12` |
| grain | youtube (no cap) | 1920×1080 | — | 47.97 Mb/s | 48.72 Mb/s | — | `-c:v h264_mf -rate_control quality -quality 75 -g 15 -pix_fmt nv12` |
| grain | custom CRF 18, cap 3 Mb/s | 1920×1080 | 3 Mb/s | 47.6 Mb/s | 48.44 Mb/s | **no** | `-c:v h264_mf -rate_control quality -quality 75 -maxrate 3000k -bufsize 6000k -g 60 -pix_fmt nv12` |
| extreme | tiktok | 1080×1920 | 20 Mb/s | 136.3 Mb/s | 137.03 Mb/s | **no** | `-c:v h264_mf -rate_control quality -quality 73 -maxrate 20000k -bufsize 40000k -g 30 -pix_fmt nv12` |
| extreme | instagram-reels | 1080×1920 | 25 Mb/s | 136.3 Mb/s | 137.03 Mb/s | **no** | `-c:v h264_mf -rate_control quality -quality 73 -maxrate 25000k -bufsize 50000k -g 30 -pix_fmt nv12` |
| extreme | youtube (no cap) | 1920×1080 | — | 220.23 Mb/s | 221.41 Mb/s | — | `-c:v h264_mf -rate_control quality -quality 75 -g 15 -pix_fmt nv12` |
| extreme | custom CRF 18, cap 3 Mb/s | 1920×1080 | 3 Mb/s | 219.97 Mb/s | 221.2 Mb/s | **no** | `-c:v h264_mf -rate_control quality -quality 75 -maxrate 3000k -bufsize 6000k -g 60 -pix_fmt nv12` |

**h264_mf ignores `-maxrate` / `-bufsize` in quality mode.** A preset's cap (TikTok 20 Mb/s,
Reels 25 Mb/s) does not hold: with camera-like grain the vertical exports came out at 35 Mb/s; with
extreme grain, 136 Mb/s. A 3 Mb/s cap changes nothing. A side check on the extreme source: `u_vbr` / `pc_vbr`
with `-maxrate 20M` and even `cbr 20M` also peak at 140–200 Mb/s over 1 s, so MF does not hold
a cap on such footage in any mode. MontClip has no Bilibili or Douyin preset yet; TikTok and Reels are
the capped vertical ones.

### A/V sync over 10 minutes through the export API (`sync.md`)

10 min, 1280×720 30 fps, h264_mf through /api/export (render 44 s).

| events expected | flashes found | beeps found | max abs offset | mean offset | first three | last three | ≤ 40 ms |
|---|---|---|---|---|---|---|---|
| 300 | 300 | 300 | 0.1 ms | 0.1 ms | 0.1 / 0.1 / 0.1 ms | 0.1 / 0.1 / 0.1 ms | yes |

Streams: video start 0.000000 s, 600.000 s; audio start 0.000000 s, 600.000 s.

The same requests the editor sends (`/api/export/begin` with h264_mf, the WAV mix, JPEG frames, end),
then the file decoded: every white frame against its beep. This covers the encoder and the muxer; it does
not cover the browser's own rendering of a timeline.

### Samples (`samples/`, small files only)

- `sw-q65-1s.mp4`, `sw-q75-1s.mp4`: one second of the real software-MFT output, stream-copied.
- `*-subtitle.png`, `*-skin.png`: the same frame (3.5 s), subtitle band and skin patch, with the source's beside them.
- `sync-first-6s.mp4`, `sync-last-6s.mp4`: the start and the end of the 10-minute sync export.
