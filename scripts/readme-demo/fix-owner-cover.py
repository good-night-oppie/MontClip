#!/usr/bin/env python3
"""Manual edit of the owner-supplied MontClip cover (2026-11-07). Usage: python3 -I fix_cover.py SRC OUT_FULL OUT_1280
Each step below answers one point in QQ #201 issuecomment-6703030435 (or QQ's background suggestion)."""
import sys
from PIL import Image, ImageDraw, ImageFont, ImageFilter
src,out_full,out_small=sys.argv[1:4]
im=Image.open(src).convert('RGB'); d=ImageDraw.Draw(im)
CJK='/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc'; CJKB='/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc'
MONO='/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf'
f=lambda p,s,i=2: ImageFont.truetype(p,s,index=i) if p.endswith('.ttc') else ImageFont.truetype(p,s)  # index 2 = SC
def lum(c): return 0.3*c[0]+0.59*c[1]+0.11*c[2]
def fg(box):  # brightest pixel in the box = the original text colour
    r=im.crop(box); return max(r.getdata(),key=lum)
def bg(box):  # median of the box border = the panel colour behind the text
    x0,y0,x1,y1=box; px=[im.getpixel((x,y0)) for x in range(x0,x1)]+[im.getpixel((x,y1)) for x in range(x0,x1)]
    return tuple(sorted(c[i] for c in px)[len(px)//2] for i in range(3))
def patch(box,src_dy):  # cover with the same-size empty area src_dy pixels away (keeps the faint grid)
    x0,y0,x1,y1=box; im.paste(im.crop((x0,y0+src_dy,x1,y1+src_dy)),(x0,y0))
def retext(box,text,font,anchor_x='l',color=None,pad=0):
    c=color or fg(box); b=bg(box); d.rectangle(box,fill=b)
    x0,y0,x1,y1=box; y=(y0+y1)//2
    x={'l':x0+pad,'r':x1-pad,'m':(x0+x1)//2}[anchor_x]
    d.text((x,y),text,font=font,fill=c,anchor=anchor_x+'m'); return c
log=[]
# QQ (3): garbled room title -> plain, true wording; garbled timestamp
c=retext((108,279,480,307),'SYNTHETIC LIVE ROOM · 合成直播间',f(CJK,15)); log.append('live-room title bar: garbled Chinese -> "SYNTHETIC LIVE ROOM · 合成直播间"')
retext((862,280,925,306),'1:04:12',f(CJK,15),'r',pad=8); log.append('timestamp "1:04:" -> "1:04:12"')
# QQ (4): garbled chat header and chat lines
retext((694,330,745,352),'弹幕',f(CJK,13)); log.append('chat header garbled -> "弹幕"')
retext((750,386,820,412),'晚上好',f(CJK,15)); log.append('chat "晚上歼" -> "晚上好"')
retext((750,415,840,442),'好好听',f(CJK,15)); log.append('chat "送蓍听听" -> "好好听"')
# QQ (3): URL-like line at the bottom of the chat panel
d.rectangle((692,718,800,746),fill=bg((692,718,800,746))); log.append('URL-like text in chat panel removed')
# QQ (4): garbled gift-bar prefix
retext((116,707,154,730),'礼物',f(CJK,13)); log.append('gift bar prefix garbled -> "礼物"')
# QQ (4): NICKHAME -> NICKNAME
retext((476,784,700,816),'NICKNAME VISIBLE',f(MONO,19),'m'); log.append('"NICKHAME VISIBLE" -> "NICKNAME VISIBLE"')
# QQ (4): "NCP" over the arrow; nothing true to say there, so the arrow stands alone
d.rectangle((996,480,1048,512),fill=bg((996,480,1048,512))); log.append('"NCP" above the arrow removed')
# QQ (1)+(2): right label claimed "MONTCLIP EXPORT ... + COVER"; the right side is a crop/zoom mock-up
retext((1100,786,1616,820),'CROP + ZOOM · ILLUSTRATION',f(MONO,19),'m'); log.append('"MONTCLIP EXPORT · CROP + ZOOM + COVER" -> "CROP + ZOOM · ILLUSTRATION"')
# QQ (2): "Edited by MontClip." states the picture is MontClip output; removed
d.rectangle((90,890,700,975),fill=bg((90,890,700,975))); log.append('"Edited by MontClip." headline removed')
# QQ (2)+(4): footer line: typos and "materials from real MontClip MCP calls"
d.rectangle((440,1036,2010,1080),fill=bg((440,1036,2010,1080)))
d.text((2000,1058),'合成直播间 · 非真实录像 · 观众名均为占位符  ·  synthetic live room, not a real recording, placeholder viewers',font=f(CJK,19),fill=(150,156,170),anchor='rm')
log.append('footer -> "合成直播间 · 非真实录像 · 观众名均为占位符 · synthetic live room, not a real recording, placeholder viewers" (typos fixed, MCP claim removed)')
# QQ suggestion: anime-like posters and figures in the background -> blurred in both panels
from PIL import ImageChops
soft=im.filter(ImageFilter.GaussianBlur(9)); mask=Image.new('L',im.size,0); md=ImageDraw.Draw(mask)
for box in [(516,322,592,424),(586,382,662,452),(1732,272,1820,382),(1846,312,1948,438)]: md.rounded_rectangle(box,radius=18,fill=255)
mask=mask.filter(ImageFilter.GaussianBlur(10))
for box in [(108,318,664,640),(1088,276,1948,750)]:  # keep the blur inside each picture panel
    keep=Image.new('L',im.size,0); ImageDraw.Draw(keep).rectangle(box,fill=255); m=ImageChops.multiply(mask,keep)
    im.paste(soft,(0,0),m)
log.append('anime-like posters and figures blurred (left and right panels)')
im.save(out_full,quality=95)
im.resize((1280,720),Image.LANCZOS).save(out_small,optimize=True)
print('\n'.join('- '+l for l in log))
