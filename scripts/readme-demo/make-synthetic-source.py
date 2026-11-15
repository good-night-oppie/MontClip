#!/usr/bin/env python3
"""Synthetic live room (NOT a real stream recording): a placeholder streamer, a chat panel with
placeholder viewers (观众A/B/C) and a gift bar that shows a viewer nickname. Nothing here is a real
person, account or recording. Every frame depends only on its time, so the output is reproducible.
Usage: make-synthetic-source.py OUT.mp4    Needs: Pillow, ffmpeg, Noto Sans CJK (fonts-noto-cjk).
Only run on Linux so far (Debian 12): the font path below is the Debian/Ubuntu fonts-noto-cjk location.
For verify-cover.py only: NO_GIFT_TEXT=1 leaves the gift text out (everything else identical), and
LOSSLESS=1 writes lossless VP9 (OUT should end in .webm), so two outputs differ only where the text is."""
import math, os, subprocess, sys
from PIL import Image, ImageDraw, ImageFont

W, H, FPS, DUR = 1280, 720, 30, 12
CJK = "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"  # index 2 = Simplified Chinese
if not os.path.isfile(CJK):
    sys.exit(f"make-synthetic-source.py: font not found: {CJK}\n"
             "Install Noto Sans CJK first, e.g. on Debian/Ubuntu: sudo apt install fonts-noto-cjk")
font = lambda size: ImageFont.truetype(CJK, size, index=2)
F14, F18, F22, F26 = font(14), font(18), font(22), font(26)

STAGE = (0, 56, 860, 720)          # where the streamer is; the demo crops to this
GIFT = (20, 640, 840, 700)         # gift bar inside the stage; the demo blurs it
CHAT = (880, 76, 1260, 700)
MESSAGES = [(0.5, "观众A", "来了来了"), (1.5, "观众B", "晚上好"), (3.5, "观众A", "这首好听"),
            (5.0, "观众C", "打卡"), (7.0, "观众B", "再来一首"), (9.0, "观众A", "下播见")]
GIFT_AT, GIFT_TEXT = 2.4, ("观众B", " 送出 小火箭 ×1")
NO_GIFT_TEXT = os.environ.get("NO_GIFT_TEXT") == "1"
LOSSLESS = os.environ.get("LOSSLESS") == "1"


def frame(t):
    im = Image.new("RGB", (W, H), "#0B1220")
    d = ImageDraw.Draw(im)
    # top bar: says what this is, and a plain time counter
    d.rectangle((0, 0, W, 56), fill="#1E293B")
    d.text((24, 14), "SYNTHETIC LIVE ROOM · 合成直播间 · 非真实录像", font=F22, fill="#F59E0B")
    d.text((1150, 14), f"t={int(t):02d}s", font=F22, fill="#93C5FD")
    # stage with a placeholder streamer (shapes only)
    d.rectangle(STAGE, fill="#111A2E")
    bob = 4 * math.sin(t * 2.1)
    d.ellipse((360, 170 + bob, 500, 310 + bob), fill="#475569")                 # head
    d.rounded_rectangle((290, 330 + bob, 570, 560), radius=60, fill="#334155")  # shoulders
    d.text((380, 575), "主播（占位）", font=F22, fill="#CBD5E1")
    for i in range(12):                                                          # voice level
        h = 10 + 26 * abs(math.sin(t * 5.3 + i * 0.9))
        d.rectangle((620 + i * 14, 470 - h, 628 + i * 14, 470), fill="#3B82F6")
    # gift bar with a viewer nickname (the thing the demo redacts)
    d.rounded_rectangle(GIFT, radius=10, fill="#1E293B", outline="#F59E0B", width=2)
    d.text((GIFT[0] + 18, GIFT[1] + 16), "礼物", font=F18, fill="#94A3B8")
    if t >= GIFT_AT and not NO_GIFT_TEXT:
        x = GIFT[0] + 80
        d.text((x, GIFT[1] + 14), GIFT_TEXT[0], font=F22, fill="#F9A8D4")
        d.text((x + d.textlength(GIFT_TEXT[0], font=F22), GIFT[1] + 14), GIFT_TEXT[1], font=F22, fill="#E2E8F0")
    # chat panel with placeholder viewer names
    d.rounded_rectangle(CHAT, radius=10, fill="#0F172A", outline="#1E293B", width=2)
    d.text((CHAT[0] + 16, CHAT[1] + 12), "弹幕", font=F18, fill="#94A3B8")
    y = CHAT[1] + 52
    for at, who, text in MESSAGES:
        if t >= at:
            d.text((CHAT[0] + 16, y), who + "：", font=F22, fill="#F9A8D4")
            d.text((CHAT[0] + 16 + d.textlength(who + "：", font=F22), y), text, font=F22, fill="#E2E8F0")
            y += 44
    d.text((CHAT[0] + 16, CHAT[3] - 30), "观众名均为占位符", font=F14, fill="#64748B")
    return im


ff = subprocess.Popen(["ffmpeg", "-n", "-v", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}",
                       "-r", str(FPS), "-i", "-", *(["-c:v", "libvpx-vp9", "-lossless", "1", "-pix_fmt", "yuv420p", "-row-mt", "1"] if LOSSLESS else
                         ["-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "16"]), sys.argv[1]],
                      stdin=subprocess.PIPE)
for n in range(FPS * DUR):
    ff.stdin.write(frame(n / FPS).tobytes())
ff.stdin.close()
sys.exit(ff.wait())
