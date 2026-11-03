Our own build without openh264 (ffmpeg version n9.0.2-42-gd7643a0fe3-20261102 Copyright (c) 2000-2026 the FFmpeg developers; archive sha256 67c30e30…, Actions run 41397853139), installed with fetch-ffmpeg.cjs --archive.

10 min, 1280×720 30 fps, h264_mf through /api/export (render 42 s).

| events expected | flashes found | beeps found | max abs offset | mean offset | first three | last three | ≤ 40 ms |
|---|---|---|---|---|---|---|---|
| 300 | 300 | 300 | 0.1 ms | 0.1 ms | 0.1 / 0.1 / 0.1 ms | 0.1 / 0.1 / 0.1 ms | yes |

Streams: video start 0.000000 s, 600.000 s; audio start 0.000000 s, 600.000 s.
