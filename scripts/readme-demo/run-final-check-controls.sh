#!/usr/bin/env bash
# Synthetic negative controls for final-check.py: a clean baseline must pass (exit 0); each control breaks one thing
# and the named gate must fail with a non-zero exit. Needs ffmpeg (libx264, libvpx-vp9). Writes only to a temp dir.
set -uo pipefail
FC="$(cd "$(dirname "$0")" && pwd)/final-check.py"; T="$(mktemp -d)"; cd "$T"
pass=0; fail=0; ok(){ echo "PASS $*"; pass=$((pass+1)); }; bad(){ echo "FAIL $*"; fail=$((fail+1)); }
N=30; FF="ffmpeg -v error -y"
mkvid(){ # dir [extra filter] [extra args]
  mkdir -p "$1"; $FF -f lavfi -i "testsrc2=s=1280x720:r=60:d=1${2:+,$2}" ${3:-} -frames:v $N -c:v libx264 -pix_fmt yuv420p "$1/montclip-demo-22s.mp4"
  $FF -f lavfi -i "testsrc2=s=1280x720:r=60:d=1${2:+,$2}" ${3:-} -frames:v $N -c:v libvpx-vp9 -deadline realtime -cpu-used 8 "$1/montclip-demo-22s.webm"; }
mkdir -p repo/scripts/readme-demo/page; echo '<p>Edited by MontClip.</p>' > repo/scripts/readme-demo/page/demo.html
mkdir -p badrepo/scripts/readme-demo/page; echo '<p>saved to /home/alice/clip.mp4</p>' > badrepo/scripts/readme-demo/page/demo.html
printf '#!/bin/sh\necho "MONTCLIP clean caption"\n' > ocr-ok; printf '#!/bin/sh\necho "engine missing" >&2; exit 1\n' > ocr-fail
cat > ocr-win <<'X'
#!/bin/sh
cat <<'Y'
saved C:\Users\synthetic\file.txt
Y
X
 printf '#!/bin/sh\necho "see /home/someone/notes.txt"\n' > ocr-unix
chmod +x ocr-*; grep -q 'C:\\Users' ocr-win || { echo "fixture ocr-win wrong"; exit 2; }
mkvid good
run(){ # name work repo ocr  -> prints exit and failing gates
  python3 -B "$FC" "$2" "out-$1" "$3" --frames $N --ocr "$T/$4" > "log-$1.txt" 2>&1; echo $? > "rc-$1"; }
gate_failed(){ python3 -c "import json,sys;r=json.load(open('out-$1/report.json'));sys.exit(0 if not r['gates']['$2']['ok'] else 1)"; }
others_ok(){ python3 -c "import json,sys;r=json.load(open('out-$1/report.json'));bad=[k for k,v in r['gates'].items() if not v['ok'] and k not in '$2'.split(',')];sys.exit(1 if bad else 0)"; }
run base good repo ocr-ok;   [ "$(cat rc-base)" = 0 ] && ok "0 baseline: clean synthetic videos pass all gates (exit 0)" || { bad "0 baseline"; cat log-base.txt; }
run ocrfail good repo ocr-fail; [ "$(cat rc-ocrfail)" != 0 ] && gate_failed ocrfail "G5 OCR ran" && ok "1 OCR program fails -> G5 fails, exit $(cat rc-ocrfail)" || bad "1 OCR fail"
run win good repo ocr-win;   [ "$(cat rc-win)" != 0 ] && gate_failed win "G6 sensitive" && python3 -c "import json,sys;h=json.load(open('out-win/report.json'))['sensitive_hits']['ocr']['windows_path'];sys.exit(0 if any(x.startswith('C:'+chr(92)+'Users'+chr(92)+'synthetic') for x in h) else 1)" && ok "2 OCR text C:\\Users\\synthetic\\file.txt -> G6 windows_path" || bad "2 windows path"
run unix good repo ocr-unix; [ "$(cat rc-unix)" != 0 ] && gate_failed unix "G6 sensitive" && ok "3 OCR text /home/someone/... -> G6 unix_path" || bad "3 unix path"
run page good badrepo ocr-ok; [ "$(cat rc-page)" != 0 ] && gate_failed page "G6 sensitive" && ok "4 demo.html with /home/alice/... -> G6" || bad "4 page"
mkdir -p short; $FF -f lavfi -i testsrc2=s=1280x720:r=60:d=1 -frames:v $((N-1)) -c:v libx264 -pix_fmt yuv420p short/montclip-demo-22s.mp4; cp good/montclip-demo-22s.webm short/
run short short repo ocr-ok; [ "$(cat rc-short)" != 0 ] && gate_failed short "G1 frames" && gate_failed short "G3 timestamps" && ok "5 one frame short -> G1 and G3" || bad "5 short"
mkdir -p audio; $FF -f lavfi -i testsrc2=s=1280x720:r=60:d=1 -f lavfi -i sine=d=1 -frames:v $N -c:v libx264 -pix_fmt yuv420p -c:a aac -shortest audio/montclip-demo-22s.mp4; cp good/montclip-demo-22s.webm audio/
run audio audio repo ocr-ok; [ "$(cat rc-audio)" != 0 ] && gate_failed audio "G2 streams" && others_ok audio "G2 streams" && ok "6 audio stream present -> G2 only" || bad "6 audio"
mkdir -p gap; $FF -f lavfi -i testsrc2=s=1280x720:r=60:d=2 -vf "select='not(eq(n\,10))'" -fps_mode passthrough -frames:v $N -c:v libx264 -pix_fmt yuv420p gap/montclip-demo-22s.mp4; cp good/montclip-demo-22s.webm gap/
run gap gap repo ocr-ok;     [ "$(cat rc-gap)" != 0 ] && gate_failed gap "G3 timestamps" && others_ok gap "G3 timestamps" && ok "7 frame 10 dropped, count still $N -> G3 only" || { bad "7 gap"; grep -E "FAIL|PASS" log-gap.txt; }
mkdir -p blank; $FF -f lavfi -i color=c=black:s=1280x720:r=60:d=1 -frames:v $N -c:v libx264 -pix_fmt yuv420p blank/montclip-demo-22s.mp4; cp good/montclip-demo-22s.webm blank/
run blank blank repo ocr-ok; [ "$(cat rc-blank)" != 0 ] && gate_failed blank "G4 not blank" && ok "8 black frames -> G4" || bad "8 blank"
printf 'synthetic\nviewer[ABC]\n' > names.txt; printf '#!/bin/sh\necho "gift from viewerB"\n' > ocr-name; chmod +x ocr-name
python3 -B "$FC" good out-names repo --frames $N --ocr "$T/ocr-name" --names "$T/names.txt" > log-names.txt 2>&1; echo $? > rc-names
[ "$(cat rc-names)" != 0 ] && gate_failed names "G6 sensitive" && others_ok names "G6 sensitive" && ! grep -q "viewer\[ABC\]" out-names/report.json && ok "9 --names pattern matched in OCR text -> G6 only; patterns not written to report.json" || bad "9 names"
python3 -B "$FC" good out-names-ok repo --frames $N --ocr "$T/ocr-ok" --names "$T/names.txt" > log-names-ok.txt 2>&1; [ $? = 0 ] && ok "10 --names with clean OCR text -> exit 0" || bad "10 names clean"
echo "passed $pass, failed $fail  (temp dir $T)"; [ $fail = 0 ]
