#!/usr/bin/env python3
"""Pass 1: MontClip makes the real materials for the demo, in its own server and data directory.
Usage: montclip-materials.py WORK   (WORK must be new or empty)   MONTCLIP_SRC defaults to this repository.
Writes in WORK: synthetic-source.mp4 (synthetic live room), contact-sheet.jpg, detail-t3.jpg, and
data/exports/redact-zoom.mp4 (crop + keyframed zoom + an opaque cover over the gift bar, rendered and exported
by MontClip). The shot itself is defined in redact_shot.py, which verify-cover.py checks frame by frame."""
import sys; sys.dont_write_bytecode = True  # never leave __pycache__ in the repository
import json, os, pathlib, re, subprocess, sys
from montclip_session import Session, fresh_dir
import redact_shot

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
    ops = redact_shot.ops(SRC)  # crop + zoom + opaque gift-bar cover (see redact_shot.py)
    mc.call([{"name": "fablecut_patch_project", "arguments": {"ops": ops}}, {"name": "fablecut_get_project", "arguments": {"compact": True}}], "m2")
    mc.call([{"name": "fablecut_export", "arguments": {"range": "entire", "preset": "custom", "where": "headless", "timeout": 1200,
              "delivery": {"width": 1280, "height": 720, "fps": 60, "container": "mp4", "video": {"codec": "h264"}, "audio": {"codec": "none"}, "filename": "redact-zoom"}}}], "m3")
