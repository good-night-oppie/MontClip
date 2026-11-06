#!/usr/bin/env python3
"""Pass 1: MontClip makes the real materials for the demo, in its own server and data directory.
Usage: montclip-materials.py WORK   (WORK must be new or empty)   MONTCLIP_SRC defaults to this repository.
Writes in WORK: synthetic-source.mp4 (synthetic live room), contact-sheet.jpg, detail-t3.jpg, and
data/exports/redact-zoom.mp4 (crop + keyframed zoom + blurred gift bar, rendered and exported by MontClip)."""
import sys; sys.dont_write_bytecode = True  # never leave __pycache__ in the repository
import json, os, pathlib, re, subprocess, sys
from montclip_session import Session, fresh_dir

here = pathlib.Path(__file__).resolve().parent
work = fresh_dir(sys.argv[1])
src = pathlib.Path(os.environ.get("MONTCLIP_SRC", str(here.parent.parent))).resolve()

with Session(work, src, "materials") as mc:
    mk = work / "synthetic-source.mp4"
    subprocess.run([sys.executable, str(here / "make-synthetic-source.py"), str(mk)], check=True)
    o = mc.call([{"name": "fablecut_import_media", "arguments": {"path": str(mk)}},
                 {"name": "fablecut_frame", "arguments": {"path": str(mk), "frames": 12, "cols": 4, "from": 0, "to": 12, "width": 320}, "saveImage": str(work / "contact-sheet.jpg")},
                 {"name": "fablecut_frame", "arguments": {"path": str(mk), "t": 3, "width": 1280}, "saveImage": str(work / "detail-t3.jpg")}], "m1")
    SRC = json.loads(re.search(r"Imported → (\{.*?\})\n", o).group(1))["id"]
    # Crop to the stage (drop the top bar and the chat panel), zoom in, and blur the gift bar with a blurred
    # copy on the track above, masked to the region (the recipe in CLAUDE.md). In testing that recipe alone let
    # the sharp nickname show through, so this demo also cuts a matching hole in the sharp clip underneath.
    # That hole is an experiment for this synthetic demo, not a verified redaction method.
    crop = dict(fit="contain", cropL=0, cropR=33, cropT=8, cropB=0)
    zoom = {"scale": [{"t": 0, "v": 0.6}, {"t": 4.5, "v": 1.0, "ease": "easeInOut"}]}
    region = {"shape": "rect", "x": 0.501, "y": 0.925, "w": 0.97, "h": 0.11}
    gift = [{"name": "gift bar nickname", "mode": "add", **region}]
    hole = [{"name": "gift bar hole", "mode": "subtract", **region}]
    ops = [{"op": "setProject", "set": {"name": "redact-zoom shot", "width": 1280, "height": 720, "fps": 60, "background": "#090D16"}},
           {"op": "addClip", "clip": {"id": "rz", "kind": "video", "track": "V1", "start": 0, "in": 2.6, "duration": 6, "mediaId": SRC,
            "props": {**crop, "scale": 0.6, "masks": hole}, "keyframes": zoom}},
           {"op": "addClip", "clip": {"id": "rz_blur", "kind": "video", "track": "V2", "start": 0, "in": 2.6, "duration": 6, "mediaId": SRC,
            "props": {**crop, "scale": 0.6, "blur": 32, "masks": gift}, "keyframes": zoom}}]
    mc.call([{"name": "fablecut_patch_project", "arguments": {"ops": ops}}, {"name": "fablecut_get_project", "arguments": {"compact": True}}], "m2")
    mc.call([{"name": "fablecut_export", "arguments": {"range": "entire", "preset": "custom", "where": "headless", "timeout": 1200,
              "delivery": {"width": 1280, "height": 720, "fps": 60, "container": "mp4", "video": {"codec": "h264"}, "audio": {"codec": "none"}, "filename": "redact-zoom"}}}], "m3")
