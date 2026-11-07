#!/usr/bin/env python3
"""Check the demo's opaque gift-bar cover (redact_shot.py) frame by frame, in preview and in the export.

Two synthetic sources that differ only in the gift text (make-synthetic-source.py, lossless VP9, with and
without NO_GIFT_TEXT) go through the very same shot. For each source MontClip renders every frame of the
shot as a timeline preview (fablecut_frame, in this run's own editor tab: a headless Chrome started by this
script with a new profile; taken mid-frame, at (i + 0.5) / fps; what the tool returns is a downscaled,
lossy JPEG, 960x540) and exports it (fablecut_export, in a headless browser our server starts, H.264);
the export is decoded back to frames. Then the two sources are compared frame by frame, every RGB channel:

  cover    (the demo's shot)  : no frame may differ, in preview or in the export   -> the text has no effect
  no-cover (positive control) : every frame must differ, in preview and in export  -> the comparison can see it

The preview comparison is of those 960x540 JPEG preview images, not of the 1280x720 canvas; the export
comparison (1280x720, the decoded H.264 export) is the one at full size.

Missing or extra frames fail. Each source runs in its own MontClip server inside this process's private
network namespace (montclip_session.py: nothing outside can reach it; the server is authenticated by a proof
file; the run stops if it exits, loses its port or a stranger joins the namespace). Browsers are recorded.
The sources are lossless VP9; the demo is built from an H.264 source with the same shot definition, so this
checks the recipe, not the demo video's own pixels.

This is a source-dependence test, not OCR and not an image-similarity score. It shows that, for this
synthetic shot with these settings, the covered text does not reach a single output pixel. It is not a
guarantee for other footage, motion, crops or settings.

Usage: verify-cover.py WORK        (WORK must be new or empty)   MONTCLIP_SRC defaults to this repository.
Writes WORK/results.json and WORK/manifest.sha256; exit 0 only when both checks hold on every frame.
"""
import sys; sys.dont_write_bytecode = True  # never leave __pycache__ in the repository
import hashlib, json, os, pathlib, platform, re, subprocess
import montclip_session
montclip_session.isolate()  # first, while the process has one thread (numpy may start some on import)
import numpy as np
from PIL import Image
from montclip_session import Session, fresh_dir
import redact_shot

here = pathlib.Path(__file__).resolve().parent
work = fresh_dir(sys.argv[1])
src = pathlib.Path(os.environ.get("MONTCLIP_SRC", str(here.parent.parent))).resolve()
W, H, FPS = redact_shot.CANVAS
N = round(redact_shot.DURATION * FPS)
FFMPEG = os.environ.get("MONTCLIP_FFMPEG", "ffmpeg")


def sha(p):
    return hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()


def decode(path):
    """All frames of a video as RGB arrays; fails on a decode error or a partial frame."""
    r = subprocess.run([FFMPEG, "-v", "error", "-i", str(path), "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], capture_output=True)
    if r.returncode or r.stderr.strip():
        raise SystemExit(f"decode failed for {path}: {r.stderr.decode(errors='replace')[:400]}")
    n, rest = divmod(len(r.stdout), W * H * 3)
    if rest:
        raise SystemExit(f"{path}: partial frame at the end")
    return np.frombuffer(r.stdout, np.uint8).reshape(n, H, W, 3)


sources = {}
for secret in ("text", "notext"):
    p = work / f"source-{secret}.webm"
    env = {**os.environ, "LOSSLESS": "1", **({"NO_GIFT_TEXT": "1"} if secret == "notext" else {})}
    subprocess.run([sys.executable, "-B", str(here / "make-synthetic-source.py"), str(p)], check=True, env=env)
    sources[secret] = p

runs = {}
for case in ("cover", "nocover"):
    for secret in ("text", "notext"):
        label = f"{case}-{secret}"
        d = fresh_dir(work / label)
        (d / "preview").mkdir()
        with Session(d, src, label) as mc:
            o = mc.call([{"name": "fablecut_import_media", "arguments": {"path": str(sources[secret])}}], "1-import")
            mid = json.loads(re.search(r"Imported → (\{.*?\})\n", o).group(1))["id"]
            mc.open_editor()  # our own tab; every client of the server is checked again before the project is written
            mc.call([{"name": "fablecut_patch_project", "arguments": {"ops": redact_shot.ops(mid, cover=case == "cover", name=label)}},
                     {"name": "fablecut_get_project", "arguments": {}}], "2-project")
            # previews are taken mid-frame: at i/FPS the playhead can sit exactly on a source-frame boundary
            # (30 fps source, 60 fps timeline), and a preview may then show either neighbour; two runs could
            # differ for that reason alone (seen once, frame 68, outside the gift bar)
            mc.call([{"name": "fablecut_frame", "arguments": {"time": round((i + 0.5) / FPS, 6), "where": "tab", "timeout": 120},
                      "saveImage": str(d / "preview" / f"{i:04d}.jpg")} for i in range(N)], "3-preview")
            mc.call([{"name": "fablecut_export", "arguments": {"range": "entire", "preset": "custom", "where": "headless", "timeout": 1200,
                      "delivery": {"width": W, "height": H, "fps": FPS, "container": "mp4", "video": {"codec": "h264"},
                                   "audio": {"codec": "none"}, "filename": label}}}], "4-export")
        runs[label] = {"dir": d, "export": next((d / "data" / "exports").glob(f"{label}.mp4")),
                       "ownership": json.loads((d / "ownership.json").read_text())}


# fablecut_frame returns the timeline preview as a JPEG (quality 0.85) at most 960 px wide (the editor's scopes
# job: app.js runScopesJob, Math.min(960, ...) and toDataURL("image/jpeg", 0.85)), so previews are saved as .jpg
# and checked as 960x540 JPEGs; they are downscaled, lossy images of the canvas. The export is checked at W x H.
PREVIEW_SIZE = (min(960, W), round(min(960, W) * H / W))


def preview_frames(d):
    """Exactly 0000.jpg ... {N-1}.jpg, each a JPEG of PREVIEW_SIZE; anything missing, extra, of another type or size
    stops the check."""
    names = sorted(p.name for p in (d / "preview").iterdir())
    want = [f"{i:04d}.jpg" for i in range(N)]
    if names != want:
        raise SystemExit(f"{d.name}: preview frames are not exactly 0000..{N - 1:04d} "
                         f"(missing {sorted(set(want) - set(names))[:5]}, extra {sorted(set(names) - set(want))[:5]})")
    frames = []
    for n in want:
        im = Image.open(d / "preview" / n)
        if im.format != "JPEG" or im.size != PREVIEW_SIZE:
            raise SystemExit(f"{d.name}/{n}: preview is {im.format} {im.size}, expected JPEG {PREVIEW_SIZE}")
        frames.append(np.asarray(im.convert("RGB")))
    return want, frames


res = {"method": __doc__.split("Usage:")[0].strip(), "frames_expected": N, "preview_size": list(PREVIEW_SIZE),
       "preview_format": "image/jpeg (as returned by fablecut_frame; downscaled, lossy)",
       "export_size": [W, H], "cover_rect_px_at_scale_1": redact_shot.cover_rect(),
       "sources": {k: {"file": v.name, "sha256": sha(v)} for k, v in sources.items()}, "cases": {},
       "environment": {"python": platform.python_version(), "node": subprocess.run(["node", "-v"], capture_output=True, text=True).stdout.strip(),
                       "ffmpeg": subprocess.run([FFMPEG, "-version"], capture_output=True, text=True).stdout.splitlines()[0],
                       "montclip_head": subprocess.run(["git", "-C", str(src), "rev-parse", "HEAD"], capture_output=True, text=True).stdout.strip()}}
ok = True
for case in ("cover", "nocover"):
    a, b = runs[f"{case}-text"], runs[f"{case}-notext"]
    entry = {}
    for kind in ("preview", "export"):
        if kind == "preview":
            (fa, xa), (fb, xb) = preview_frames(a["dir"]), preview_frames(b["dir"])
        else:
            xa, xb = list(decode(a["export"])), list(decode(b["export"]))  # decode() fixes W x H and refuses partial frames
        changed = [int((np.abs(p.astype(int) - q.astype(int)).sum(2) > 0).sum()) if p.shape == q.shape else -1
                   for p, q in zip(xa, xb)]
        counts_ok = len(xa) == len(xb) == N
        frames_changed = sum(c != 0 for c in changed)
        passed = counts_ok and (frames_changed == 0 if case == "cover" else frames_changed == N and -1 not in changed)
        ok &= passed
        entry[kind] = {"frames": [len(xa), len(xb)], "frame_size": list(xa[0].shape[:2][::-1]) if xa else None,
                       "frames_with_any_changed_pixel": frames_changed, "max_changed_pixels_in_a_frame": max(changed) if changed else None,
                       "changed_pixels_per_frame": changed, "pass": passed}
    entry["required"] = ("no frame may differ (preview and export)" if case == "cover"
                         else "positive control: every frame must differ (preview and export)")
    entry["exports"] = {k: {"file": r["export"].name, "sha256": sha(r["export"])} for k, r in (("text", a), ("notext", b))}
    entry["ownership"] = {k: {"foreign": len(r["ownership"]["foreign"]), "dead": r["ownership"]["dead"],
                              "isolated": r["ownership"]["isolation"]["netns"] != r["ownership"]["isolation"]["host_netns"],
                              "authenticated": bool(r["ownership"]["authenticated"]),
                              "unattributed_client_sockets": r["ownership"]["unattributed_client_sockets"],
                              "editor_tab": {x: r["ownership"]["editor_tab"][x] for x in ("pid", "parent")},
                              "headless_browsers": [{"pid": int(p), "profile": v["profile"], "parent_chain_to_server": v["parent_chain_to_server"]}
                                                    for p, v in r["ownership"]["headless_browsers"].items()]}
                          for k, r in (("text", a), ("notext", b))}
    ok &= all(v["foreign"] == 0 and v["dead"] is None and v["authenticated"] and v["isolated"]
              and v["headless_browsers"] and v["editor_tab"]["pid"] for v in entry["ownership"].values())
    res["cases"][case] = entry
res["ok"] = bool(ok)
(work / "results.json").write_text(json.dumps(res, indent=1, ensure_ascii=False))
files = sorted(p for p in work.rglob("*") if p.is_file() and p.name != "manifest.sha256" and "/data/" not in str(p.relative_to(work)) + "/")
files += sorted(r["export"] for r in runs.values())
(work / "manifest.sha256").write_text("".join(f"{sha(p)}  {p.relative_to(work)}\n" for p in files))
for case, e in res["cases"].items():
    print(case, {k: (e[k]["frames"], e[k]["frames_with_any_changed_pixel"], e[k]["pass"]) for k in ("preview", "export")},
          {k: (v["foreign"], v["dead"], len(v["headless_browsers"])) for k, v in e["ownership"].items()})
print("OK" if ok else "FAIL", "→", work / "results.json")
sys.exit(0 if ok else 1)
