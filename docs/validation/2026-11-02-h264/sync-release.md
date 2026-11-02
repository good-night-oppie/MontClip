Rerun 2026-11-02 with the build **installed from the published pre-release** [`ffmpeg-lgpl-n9.0.2-montclip1`](https://github.com/good-night-oppie/MontClip/releases/tag/ffmpeg-lgpl-n9.0.2-montclip1): `node desktop/fetch-ffmpeg.cjs --force` downloaded the win64 archive from the release URL in `desktop/ffmpeg-manifest.json`, checked its SHA-256 (`67c30e30…`) and installed it (`ffmpeg.exe` `39341362…`). No ffmpeg on PATH during the run (`which ffmpeg` found none). Same script and settings as `sync.md`: `node docs/validation/2026-11-02-h264/sync-mf.cjs 10`.

10 min, 1280×720 30 fps, h264_mf through /api/export (render 40 s).

| events expected | flashes found | beeps found | max abs offset | mean offset | first three | last three | ≤ 40 ms |
|---|---|---|---|---|---|---|---|
| 300 | 300 | 300 | 0.1 ms | 0.1 ms | 0.1 / 0.1 / 0.1 ms | 0.1 / 0.1 / 0.1 ms | yes |

Streams: video start 0.000000 s, 600.000 s; audio start 0.000000 s, 600.000 s.
