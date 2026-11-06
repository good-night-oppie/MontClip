# readme-demo

Scripts that rebuild the files in `docs/assets/`. Only scripts live here; every intermediate
file (frames, MontClip data, logs) goes into the work directory you pass in.

## Demo video

```bash
NODE_PATH=/path/to/node_modules_with_playwright \
MONTCLIP_FFMPEG=/usr/bin/ffmpeg MONTCLIP_FFPROBE=/usr/bin/ffprobe \
CHROME=/usr/bin/google-chrome \
scripts/readme-demo/build.sh /tmp/readme-demo-work
```

`MONTCLIP_FFMPEG`/`MONTCLIP_FFPROBE` are only needed if the bundled FFmpeg is not installed
(`node desktop/fetch-ffmpeg.cjs`). `CHROME` is only needed if playwright has no browser of its own.

Three passes:

1. `montclip-materials.py` starts MontClip against an isolated `FABLECUT_DATA_DIR`, imports the
   synthetic live room made by `make-synthetic-source.py` (needs Pillow and `fonts-noto-cjk`), asks `fablecut_frame` for a 12-frame
   contact sheet and the frame at 3 s, then builds a crop + keyframed zoom shot with an opaque cover over the gift bar (`redact_shot.py`)
   and exports it with `fablecut_export`.
2. `page/demo.html` lays out those outputs; `render.cjs` seeks it to each of the 1320 frames
   (22 s at 60 fps) and screenshots them; `build.sh` encodes the frames into the motion layer.
   (Runtime JavaScript in this repository never runs ffmpeg by name; the shell script does.)
3. `montclip-final.py` imports the motion layer into MontClip and exports the final MP4 with
   `fablecut_export`. `build.sh` then makes the VP9 WebM.

`mcp-call.cjs` drives `mcp-server.js` over stdio. Each MCP call is saved next to its output in the work
directory; a failed call stops the build.

Limits shown in the video itself: the live room is synthetic (placeholder streamer and viewer
names) and no stream repair is demonstrated.

## The gift-bar cover

The demo hides the gift bar with an **opaque, hard-edged cover**: a shape layer on the track above the
video with one black rectangle, normal blend, opacity 1, no feather, no corner radius and no stroke. It
covers the whole bar plus a 12 px margin, is on screen for the whole shot, and has the same scale
keyframes as the video so it follows the zoom (`redact_shot.py`). This is the approach investigated in
#186 (a draft, not merged yet); it changes nothing in the engine.

`verify-cover.py WORK` checks this exact shot. Two synthetic sources that differ only in the gift text
(lossless VP9) go through it. Every frame is exported (H.264, 1280×720, decoded back) and also rendered as
a timeline preview in the script's own editor tab; the preview `fablecut_frame` returns is a downscaled,
lossy JPEG (960×540). The two sources are compared on every pixel of every frame of both. With the cover no
frame may differ; without it (positive control) every frame must differ. It exits 0 only if both hold. The
full-size result is the export comparison; the preview comparison only shows the 960×540 JPEG previews
are identical, not that the 1280×720 canvas is pixel for pixel identical.

Each MontClip server runs inside a private user + network namespace that the script creates
(`montclip_session.py`), so nothing outside it can send the server a request; the script also proves the
listening socket is the server's and that the server serves a proof file from this run's data directory,
and it stops the run (killing a running batch) as soon as the server exits, the port changes hands, or a
process outside its tree shows up in the namespace. A same-user process that deliberately joins the
namespace is looked for but cannot be ruled out by polling.

That shows the covered text does not reach a single pixel of the export (and of the preview images)
**in this synthetic shot with these settings**. The check uses lossless VP9 sources; the demo itself is built from an H.264 source with the
same shot definition, so the demo video is covered by the same recipe, not checked pixel by pixel itself. It is not a guarantee for other footage, motion, crops or settings: check your own export
frame by frame, and publishing real footage still needs per-frame review and the subjects' consent.

> **Not recommended (kept as a record of the problem):** an earlier version of this demo blurred the bar
> with MontClip's documented recipe (a blurred copy of the clip on the track above, masked to the region,
> the sharp clip left whole underneath), and then added a matching `subtract` hole in the sharp clip. The
> blur recipe on its own lets the sharp original show through: in our test on this synthetic clip the
> nickname was readable at `blur: 32` and `blur: 64`. Do not use a masked blur to hide private
> information.

## Banners and diagrams

```bash
OPENROUTER_API_KEY=... python3 scripts/readme-demo/generate-assets.py --out /tmp/assets --list-models
OPENROUTER_API_KEY=... python3 scripts/readme-demo/generate-assets.py --out /tmp/assets --generate --model anthropic/claude-opus-5.5
```

Without `--generate` or `--list-models` it only writes `prompts.json` and makes no network call.
Generated SVGs are checked against an element/attribute allowlist (no scripts, links or embedded
data). Model output differs between runs; `docs/assets/provenance.json` records the run that made
the committed files.
