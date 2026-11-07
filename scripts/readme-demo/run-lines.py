#!/usr/bin/env python3
"""Turn the MCP replies saved by montclip-materials.py (pass 1) into page/run-lines.js for demo.html.

Usage: run-lines.py PASS1_DIR OUT_JS

demo.html shows a few "terminal" lines in acts 2 and 4. They are not typed in by hand: this script reads
m1.out.txt (import + contact sheet), m2.out.txt (fablecut_get_project), m3.json / m3.out.txt (fablecut_export)
from this run and writes `window.RUN = {...}` with the exact text MontClip returned. Only file names are kept,
never directories, and the "Served at http://..." line is dropped. Exits non-zero if anything is missing or if
a path, URL or address would get into the page. Refuses to overwrite OUT_JS.
"""
import json, os, pathlib, re, sys

if len(sys.argv) != 3:
    sys.exit(__doc__)
p1, out = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
if out.exists():
    sys.exit(f"refusing to overwrite {out}")
m1, m2, m3 = ((p1 / f"m{i}.out.txt").read_text() for i in (1, 2, 3))
m3_call = json.load(open(p1 / "m3.json"))[0]


def need(rx, text, what, flags=0):
    m = re.search(rx, text, flags)
    if not m:
        sys.exit(f"run-lines: cannot find {what}")
    return m


# m1: the import reply carries the media facts as JSON.
media = json.loads(need(r"Imported → (\{.*\})", m1, "import reply").group(1))
sheet = need(r"Contact sheet — (\d+) moments across .*?, left→right then top→bottom, at (.*?)\.\n", m1, "contact sheet", re.S)
moments = [s.strip() for s in sheet.group(2).split(",")]
frame_at = need(r"Frame at ([\d.]+s) of ", m1, "frame at t").group(1)

# m2: the compact project view, verbatim lines.
proj = need(r"## fablecut_get_project ok\n(\"[^\n]*\")\s+(\d+x\d+@\d+)\s+(rev:\d+)", m2, "project header")
media_line = need(r"^  m_\w+ (video \"[^\"]+\" .*?)(?: uses:\d+)?$", m2, "media line", re.M).group(1)
n_clips = need(r"^CLIPS \((\d+)\)", m2, "clip count", re.M).group(1)

# m3: the export reply.
d = m3_call["arguments"]["delivery"]
done = need(r"done → (\S+) \(([\d.]+ [KMG]B)\)", m3, "export done")
fmt_line = need(r"^(\d+×\d+ · \d+ fps · [^\n]*)$", m3, "export format line", re.M).group(1)
checks = need(r"^Checks passed: ([^\n]*)$", m3, "export checks", re.M).group(1)

RUN = {
    "media": {"name": media["name"], "duration": media["duration"], "width": media["width"], "height": media["height"],
              "fps": media["fps"], "codec": media["codec"]},
    "sheet": {"frames": int(sheet.group(1)), "first": moments[0], "second": moments[1], "last": moments[-1]},
    "frame_at": frame_at,
    "project": {"name": proj.group(1), "size": proj.group(2), "rev": proj.group(3), "media_line": media_line, "clips": n_clips},
    "export": {"preset": m3_call["arguments"]["preset"], "codec": d["video"]["codec"], "fps": d["fps"], "filename": d["filename"],
               "file": os.path.basename(done.group(1)), "size": done.group(2), "format": fmt_line, "checks": checks},
}
js = "window.RUN = " + json.dumps(RUN, ensure_ascii=False, indent=1) + ";\n"
leak = re.search(r"/(?:home|Users|root|tmp|var|etc|mnt|opt)/|[A-Za-z]:\\|https?://|localhost|\d+\.\d+\.\d+\.\d+", js)
if leak:
    sys.exit(f"run-lines: refusing to write a path or address into the page: {leak.group(0)!r}")
out.write_text(js)
print(f"run-lines: {out} ({len(RUN)} sections) from {p1}")
