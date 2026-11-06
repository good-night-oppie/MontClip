#!/usr/bin/env python3
"""Acceptance gates for the built 22 s demo. Exit 0 only if every gate holds.

Usage: final-check.py BUILD_WORK OUT_DIR REPO [--frames N] [--fps F] [--ocr CMD] [--jobs J] [--names FILE]
  BUILD_WORK holds montclip-demo-22s.mp4 and .webm; REPO holds scripts/readme-demo/page/demo.html.
  --ocr: the OCR program (default "tesseract"); it is called as CMD IMAGE - -l eng+chi_sim --psm 11.
  --names: a file with one regular expression per line (case-insensitive) for names that must not appear:
           your account names, machine names, viewer nicknames. Keep this file outside the repository.

Gates (each recorded in report.json; any failure -> exit 1):
  G1 frames      : both videos decode to exactly N frames of 1280x720, ffmpeg exits 0 with empty stderr, no partial frame
  G2 streams     : exactly one video stream and no audio stream in each file
  G3 timestamps  : frame k has pts == k/F quantised to the stream's time base (mp4: exact to 1e-6 s; webm: 1 ms grid)
                   -> no frame is missing, duplicated or moved
  G4 not blank   : no frame is >98% one flat colour
  G5 OCR ran     : the OCR program exits 0 for every image it is given (a failing OCR cannot turn into "0 hits")
  G6 sensitive   : no match, in the OCR text or in demo.html (visible text and source), for local paths (Unix and
                   Windows), e-mail addresses, key/token words, IPv4 addresses, localhost:port, or any --names pattern
OCR covers every distinct frame of the mp4 by exact content (SHA-1 of the decoded RGB), not a sample. OCR can
misread or miss text, so G6 supports, and does not replace, looking at the video.
Visual review material (not a gate): contact sheets of every 6th frame of the mp4.
"""
import argparse, hashlib, html, json, os, pathlib, re, subprocess, sys
from concurrent.futures import ThreadPoolExecutor
import numpy as np
from PIL import Image, ImageDraw

ap = argparse.ArgumentParser()
ap.add_argument("work"); ap.add_argument("out"); ap.add_argument("repo")
ap.add_argument("--frames", type=int, default=1320); ap.add_argument("--fps", type=int, default=60)
ap.add_argument("--ocr", default="tesseract")
ap.add_argument("--jobs", type=int, default=os.cpu_count() or 4)
ap.add_argument("--names", help="file of regular expressions (one per line) that must not appear")
a = ap.parse_args()
work, out, repo = pathlib.Path(a.work), pathlib.Path(a.out), pathlib.Path(a.repo)
out.mkdir(parents=True, exist_ok=False)
(out / "sheets").mkdir(); (out / "distinct").mkdir()
W, H, FPS, N = 1280, 720, a.fps, a.frames
gates = {}


def gate(name, ok, detail):
    gates.setdefault(name, {"ok": True, "detail": []})
    gates[name]["ok"] &= bool(ok)
    gates[name]["detail"].append(detail)


def sha(p):
    return hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()


def frames(p):
    # passthrough: count the frames stored in the file; never let the decoder fill or drop frames to a constant rate
    proc = subprocess.Popen(["ffmpeg", "-v", "error", "-i", str(p), "-fps_mode", "passthrough", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
                            stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    n = W * H * 3
    while True:
        b = proc.stdout.read(n)
        if len(b) < n:
            err = proc.stderr.read().decode(errors="replace"); proc.wait()
            yield ("end", len(b), proc.returncode, err.strip())
            return
        yield np.frombuffer(b, np.uint8).reshape(H, W, 3)


report = {"repo_head": subprocess.run(["git", "-C", str(repo), "rev-parse", "HEAD"], capture_output=True, text=True).stdout.strip(),
          "repo_clean": subprocess.run(["git", "-C", str(repo), "status", "--short"], capture_output=True, text=True).stdout == "",
          "expected": {"frames": N, "fps": FPS, "size": [W, H]}, "videos": {}}
mp4 = work / "montclip-demo-22s.mp4"
distinct = {}   # sha1 -> first frame index (mp4)
thumbs = {}
for vid in (mp4, work / "montclip-demo-22s.webm"):
    name = vid.name
    if not vid.exists():
        gate("G1 frames", False, f"{name}: missing"); continue
    info = json.loads(subprocess.run(["ffprobe", "-v", "error", "-show_streams", "-of", "json", str(vid)], capture_output=True, text=True).stdout)
    kinds = [s["codec_type"] for s in info["streams"]]
    gate("G2 streams", kinds.count("video") == 1 and kinds.count("audio") == 0, f"{name}: streams {kinds}")
    v = next((s for s in info["streams"] if s["codec_type"] == "video"), {})
    tb = v.get("time_base", "1/1000"); num, den = map(int, tb.split("/")); tick = num / den
    pts = [float(x.split(",")[0]) for x in subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "frame=pts_time",
                                             "-of", "csv=p=0", str(vid)], capture_output=True, text=True).stdout.split() if x.split(",")[0] not in ("", "N/A")]
    # expected pts of frame k: k/FPS rounded to the stream's time base grid; tolerance: half a tick (at least 1e-6 s)
    tol = max(tick / 2, 1e-6)
    bad_pts = [k for k, t in enumerate(pts) if abs(t - round(round(k / FPS / tick) * tick, 9)) > tol]
    gate("G3 timestamps", len(pts) == N and not bad_pts,
         f"{name}: time_base {tb}, {len(pts)} pts, off-grid frames {bad_pts[:10]}")
    per, prev, tail = [], None, None
    for i, f in enumerate(frames(vid)):
        if isinstance(f, tuple):
            tail = {"partial_bytes": f[1], "ffmpeg_rc": f[2], "ffmpeg_stderr": f[3]}
            break
        g = f.astype(np.int16)
        flat = float((np.abs(g - g.reshape(-1, 3).mean(0)).sum(2) < 12).mean())
        h1 = hashlib.sha1(f.tobytes()).hexdigest()
        per.append({"i": i, "sha1": h1, "flat_share": round(flat, 4),
                    "diff_prev": None if prev is None else round(float(np.abs(g - prev).mean()), 3)})
        if vid == mp4:
            if h1 not in distinct:
                distinct[h1] = i; Image.fromarray(f).save(out / "distinct" / f"{i:04d}.png")
            if i % 6 == 0:
                thumbs[i] = Image.fromarray(f).resize((320, 180))
        prev = g
    gate("G1 frames", len(per) == N and tail == {"partial_bytes": 0, "ffmpeg_rc": 0, "ffmpeg_stderr": ""},
         f"{name}: {len(per)} frames decoded, end {tail}")
    blank = [p["i"] for p in per if p["flat_share"] > 0.98]
    gate("G4 not blank", not blank, f"{name}: blank frames {blank[:10]}")
    report["videos"][name] = {"sha256": sha(vid), "time_base": tb, "streams": kinds, "frames_decoded": len(per), "decode_end": tail,
                              "pts_first": pts[:4], "pts_last": pts[-2:], "per_frame": per}

# contact sheets (visual review material)
keys = sorted(thumbs)
for s in range(0, len(keys), 20):
    sheet = Image.new("RGB", (5 * 324, 4 * 204), "white"); d = ImageDraw.Draw(sheet)
    for k, idx in enumerate(keys[s:s + 20]):
        x, y = (k % 5) * 324, (k // 5) * 204
        sheet.paste(thumbs[idx], (x + 2, y + 2)); d.text((x + 4, y + 184), f"#{idx}  {idx / FPS:.2f}s", fill="black")
    sheet.save(out / "sheets" / f"sheet-{s // 20:02d}.jpg", quality=90)


def ocr_one(p):
    r = subprocess.run([a.ocr, str(p), "-", "-l", "eng+chi_sim", "--psm", "11"], capture_output=True, text=True,
                       env={**os.environ, "OMP_THREAD_LIMIT": "1"})  # one thread per OCR; --jobs of them in parallel
    return p.stem, r.returncode, r.stdout, r.stderr.strip()[-300:]


with ThreadPoolExecutor(a.jobs) as ex:
    results = list(ex.map(ocr_one, sorted((out / "distinct").glob("*.png"))))
failed = [(n, rc, err) for n, rc, _, err in results if rc != 0]
gate("G5 OCR ran", results and not failed, f"{len(results)} distinct frames OCR'd, {len(failed)} failed: {failed[:3]}")
ocr_text = "\n".join(f"=== frame {n}\n{t.strip()}\n" for n, _, t, _ in results)
(out / "ocr.txt").write_text(ocr_text)

page_path = repo / "scripts/readme-demo/page/demo.html"
page = page_path.read_text() if page_path.exists() else ""
gate("G6 sensitive", page_path.exists(), f"demo.html present: {page_path.exists()}")
visible = html.unescape(re.sub(r"<[^>]+>", " ", re.sub(r"(?s)<style.*?</style>", " ", page)))
PAT = {"unix_path": r"/(?:home|Users|root|tmp|var|etc|mnt|opt)/[\w.-]+",
       "windows_path": r"\b[A-Za-z]:[\\/][^\s\"'<>|]+",
       "email": r"[\w.+-]+@[\w-]+\.[A-Za-z][\w.]*",
       "key_like": r"sk-[A-Za-z0-9]{8,}|OPENROUTER|API[_ ]?KEY|\btoken\b|\bsecret\b|password|Bearer\s",
       "ipv4": r"\b(?:\d{1,3}\.){3}\d{1,3}\b",
       "localhost_port": r"localhost:\d+|127\.0\.0\.1:\d+"}
if a.names:
    names = [l.strip() for l in pathlib.Path(a.names).read_text().splitlines() if l.strip() and not l.startswith("#")]
    if not names:
        sys.exit(f"--names {a.names}: no patterns")
    PAT["names"] = "|".join(f"(?:{n})" for n in names)
hits = {}
for src, text in (("ocr", ocr_text), ("demo.html visible text", visible), ("demo.html source", page)):
    for k, rx in PAT.items():
        found = sorted({m.group(0) for m in re.finditer(rx, text, flags=re.I)})
        if found:
            hits.setdefault(src, {})[k] = found[:20]
gate("G6 sensitive", not hits, f"hits: {json.dumps(hits, ensure_ascii=False)[:500]}")

inputs = {n: work / n for n in ("pass1/synthetic-source.mp4", "pass1/data/exports/redact-zoom.mp4", "motion-layer.mp4",
                                "montclip-demo-22s.mp4", "montclip-demo-22s.webm")}
report.update({"distinct_frames_by_sha1": len(distinct), "sensitive_patterns": {k: v for k, v in PAT.items() if k != "names"}, "names_file": a.names, "sensitive_hits": hits,
               "ocr_program": a.ocr, "gates": gates, "ok": all(g["ok"] for g in gates.values()),
               "hashes": {n: sha(p) for n, p in inputs.items() if p.exists()},
               "visual_review": {"sheet_frames_every_6th": keys}})
(out / "hashes.sha256").write_text("".join(f"{h}  {n}\n" for n, h in report["hashes"].items()))
(out / "report.json").write_text(json.dumps(report, indent=1, ensure_ascii=False))
for n, g in gates.items():
    print("PASS" if g["ok"] else "FAIL", n, "|", " ; ".join(g["detail"])[:400])
print("OK" if report["ok"] else "FAIL", f"(distinct frames OCR'd: {len(distinct)})")
sys.exit(0 if report["ok"] else 1)
