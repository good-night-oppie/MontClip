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
