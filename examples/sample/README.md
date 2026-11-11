# Synthetic sample: try MontClip without your own recording

`montclip-sample-synthetic-live-room.mp4` is a **synthetic** 12-second clip, made by a script. It is not a real stream recording: the streamer is a placeholder shape, the viewers are placeholders (观众A/B/C), and the top bar says "SYNTHETIC LIVE ROOM · 合成直播间 · 非真实录像". There are no real people, accounts or chat messages in it.

**It has no sound.** The moving level bars in the picture are decoration only, so an exported clip from it has no sound either.

It is only enough to try importing a video and exporting an MP4. It cannot show keeping parts by sentence, subtitles, or anything about long recordings.

| | |
|---|---|
| File | `montclip-sample-synthetic-live-room.mp4` |
| Size | 131,932 bytes |
| SHA-256 | `5e40714c532480948c180e096d26e5feccc0df5eb8dc815d92df375f8b81583f` |
| Video | H.264, 1280×720, 30 fps, 360 frames, 12.000 s; no audio track |
| Made by | [scripts/readme-demo/make-synthetic-source.py](../../scripts/readme-demo/make-synthetic-source.py), no prompt or AI model |
| Command | `python3 -I scripts/readme-demo/make-synthetic-source.py examples/sample/montclip-sample-synthetic-live-room.mp4` |
| Built on | Debian 12; Pillow 12.2.0; ffmpeg 5.1.9-0+deb12u1 (libx264, crf 16); fonts-noto-cjk 1:20220127+repack1-1 |
| License | The clip is part of this repository (MIT). The font only drew pixels; see "Used at build time, not shipped" in [LICENSES.md](../../LICENSES.md). |

Running the script twice on the same machine gives a byte-identical file. With other Pillow, ffmpeg or font versions the pixels can differ, so the SHA-256 will not match.

---

# 合成样片：没有自己的录像也能试 MontClip

`montclip-sample-synthetic-live-room.mp4` 是用脚本生成的**合成**样片，12 秒，不是真实直播录像。主播是占位图形，观众是占位名（观众A/B/C），画面顶栏写着「SYNTHETIC LIVE ROOM · 合成直播间 · 非真实录像」。里面没有真人、账号或真实弹幕。

**样片是合成的，12 秒，没有声音；画面里会动的音量条只是装饰。** 用它导出的成品也没有声音。

它只够试一下导入视频和导出 MP4，演示不了按句选段、字幕，也说明不了长录像的情况。

文件大小、SHA-256、生成命令和版本见上方表格。
