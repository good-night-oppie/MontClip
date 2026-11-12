#!/usr/bin/env python3
"""Pass 3: MontClip imports the rendered motion layer and exports the final demo, in its own server.
Usage: montclip-final.py WORK MOTION.mp4 [SECONDS]   (WORK must be new or empty)   MONTCLIP_SRC defaults to this repository.
SECONDS is the motion layer's length: 22 (default, the full film) or 15 (the first-screen cut)."""
import sys; sys.dont_write_bytecode = True  # never leave __pycache__ in the repository
import json, os, pathlib, re, sys
from montclip_session import Session, fresh_dir

here = pathlib.Path(__file__).resolve().parent
work = fresh_dir(sys.argv[1])
motion = pathlib.Path(sys.argv[2]).resolve()
dur = int(sys.argv[3]) if len(sys.argv) > 3 else 22
if dur not in (15, 22):
    raise SystemExit(f"montclip-final: SECONDS must be 15 or 22, not {dur}")
name = f"montclip-demo-{dur}s"
src = pathlib.Path(os.environ.get("MONTCLIP_SRC", str(here.parent.parent))).resolve()

with Session(work, src, "final") as mc:
    o = mc.call([{"name": "fablecut_import_media", "arguments": {"path": str(motion)}}], "f1")
    M = json.loads(re.search(r"Imported → (\{.*?\})\n", o).group(1))["id"]
    ops = [{"op": "setProject", "set": {"name": f"MontClip {dur}-second demo", "width": 1280, "height": 720, "fps": 60, "background": "#090D16"}},
           {"op": "addClip", "clip": {"id": "main", "kind": "video", "track": "V1", "start": 0, "in": 0, "duration": dur, "mediaId": M, "props": {"fit": "contain"}}}]
    calls = [{"name": "fablecut_patch_project", "arguments": {"ops": ops}}, {"name": "fablecut_get_project", "arguments": {"compact": True}}]
    calls += [{"name": "fablecut_frame", "arguments": {"time": t, "where": "headless"}, "saveImage": str(work / f"chk{t:02d}.jpg")} for t in ((2, 7, 14, 21) if dur == 22 else (2, 7, 12, 14))]
    mc.call(calls, "f2")
    mc.call([{"name": "fablecut_export", "arguments": {"range": "entire", "preset": "custom", "where": "headless", "timeout": 1200,
              "delivery": {"width": 1280, "height": 720, "fps": 60, "container": "mp4", "video": {"codec": "h264"}, "audio": {"codec": "none"}, "filename": name}}}], "f3")
