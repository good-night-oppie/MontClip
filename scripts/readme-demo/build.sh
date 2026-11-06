#!/usr/bin/env bash
# Rebuild docs/assets/demo/montclip-demo-22s.{mp4,webm} from scratch.
# usage: scripts/readme-demo/build.sh WORK_DIR
# Everything is written under WORK_DIR, which must be new or empty (outside the repository is best).
# Nothing is deleted or overwritten, here or there.
# Needs: node >= 18, python3, ffmpeg (with libx264 + libvpx-vp9), playwright with a Chromium/Chrome
#        (install playwright anywhere; set NODE_PATH to its node_modules; CHROME=path to use a system Chrome).
# MontClip uses its bundled ffmpeg (node desktop/fetch-ffmpeg.cjs) unless MONTCLIP_FFMPEG / MONTCLIP_FFPROBE
# point at other binaries. H.264 export goes through the external-FFmpeg setting (path: $EXTERNAL_FFMPEG,
# default /usr/bin/ffmpeg) because the bundled LGPL build has no libx264.
set -euo pipefail
export PYTHONDONTWRITEBYTECODE=1  # never leave __pycache__ in the repository
here="$(cd "$(dirname "$0")" && pwd)"
repo="$(cd "$here/../.." && pwd)"
[ $# -eq 1 ] || { echo "usage: $0 WORK_DIR (new or empty)" >&2; exit 64; }
# WORK_DIR must be new or an empty real directory: this script never deletes or overwrites anything.
if [ -L "$1" ]; then echo "refusing $1: it is a symlink" >&2; exit 65; fi
if [ -e "$1" ] && { [ ! -d "$1" ] || [ -n "$(ls -A "$1")" ]; }; then
  echo "refusing $1: it exists and is not an empty directory (nothing was changed)" >&2; exit 65
fi
mkdir -p "$1"; work="$(cd "$1" && pwd -P)"
export MONTCLIP_SRC="${MONTCLIP_SRC:-$repo}"

# Pass 1: MontClip makes the materials over MCP (its own server and data directory inside WORK_DIR).
python3 "$here/montclip-materials.py" "$work/pass1"

# Pass 2: lay out those outputs in a deterministic page and render it frame by frame.
page="$work/page"; mkdir "$page" "$page/fonts" "$page/f" "$page/f/src" "$page/f/rz"
cp -n "$here/page/demo.html" "$page/"
cp -n "$repo/library/fonts/Inter.woff2" "$page/fonts/"
cp -n "$work/pass1/contact-sheet.jpg" "$work/pass1/detail-t3.jpg" "$page/"
ffmpeg -v error -n -i "$work/pass1/synthetic-source.mp4" -q:v 3 "$page/f/src/%04d.jpg"
ffmpeg -v error -n -i "$work/pass1/data/exports/redact-zoom.mp4" -q:v 3 "$page/f/rz/%04d.jpg"
node "$here/render.cjs" "$page/demo.html" "$work/frames" --duration=22 --fps=60 ${CHROME:+--chrome=$CHROME}
ffmpeg -v error -n -framerate 60 -i "$work/frames/%05d.png" -c:v libx264 -crf 16 -pix_fmt yuv420p -r 60 "$work/motion-layer.mp4"

# Pass 3: MontClip imports the motion layer and exports the final MP4.
python3 "$here/montclip-final.py" "$work/pass3" "$work/motion-layer.mp4"
mp4="$work/pass3/data/exports/montclip-demo-22s.mp4"
ffmpeg -v error -n -i "$mp4" -c:v libvpx-vp9 -b:v 0 -crf 34 -row-mt 1 -an "$work/montclip-demo-22s.webm"
cp -n "$mp4" "$work/montclip-demo-22s.mp4"
echo "done: $work/montclip-demo-22s.mp4 and .webm"
