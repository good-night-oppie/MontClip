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
   contact sheet and the frame at 3 s, then builds a crop + keyframed zoom shot with the gift-bar nickname blurred and exports
   it with `fablecut_export`.
2. `page/demo.html` lays out those outputs; `render.cjs` seeks it to each of the 1320 frames
   (22 s at 60 fps) and screenshots them; `build.sh` encodes the frames into the motion layer.
   (Runtime JavaScript in this repository never runs ffmpeg by name; the shell script does.)
3. `montclip-final.py` imports the motion layer into MontClip and exports the final MP4 with
   `fablecut_export`. `build.sh` then makes the VP9 WebM.

`mcp-call.cjs` drives `mcp-server.js` over stdio. Each MCP call is saved next to its output in the work
directory; a failed call stops the build.

Limits shown in the video itself: the live room is synthetic (placeholder streamer and viewer
names), no stream repair is demonstrated, and the blur mask is placed relative to the cropped picture.

> **Warning:** MontClip's documented blur recipe (a blurred copy of the clip on the track above, masked
> to the region, with the sharp clip left whole underneath) can leak the original. In our test on this
> synthetic clip, the sharp nickname showed through and was fully readable at `blur: 64`.

As a workaround for this demo only, the sharp clip underneath also gets a matching `subtract` hole with
the same crop, scale keyframes and mask geometry as the blurred copy. In that test it removed the
visible leak. This is not a general privacy guarantee: it was checked only on this clip, with these
transforms, at these settings. Other footage, moving regions, feathered masks or different transforms
need their own frame-by-frame check, and publishing real footage still needs per-frame review and the
subjects' consent.

## Banners and diagrams

```bash
OPENROUTER_API_KEY=... python3 scripts/readme-demo/generate-assets.py --out /tmp/assets --list-models
OPENROUTER_API_KEY=... python3 scripts/readme-demo/generate-assets.py --out /tmp/assets --generate --model anthropic/claude-opus-5.5
```

Without `--generate` or `--list-models` it only writes `prompts.json` and makes no network call.
Generated SVGs are checked against an element/attribute allowlist (no scripts, links or embedded
data). Model output differs between runs; `docs/assets/provenance.json` records the run that made
the committed files.
