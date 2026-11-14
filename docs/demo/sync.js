/* Refresh the playground copy of the editor from the repo root.
   Run:  node docs/demo/sync.js
   The playground is the REAL editor (same index.html / app.js / style.css),
   with one extra script (static-shim.js) loaded first: it answers the /api
   calls from memory so the whole thing runs on GitHub Pages with no server. */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");
const OUT = __dirname;

/* index.html: same markup, plus the shim ahead of app.js */
let html = fs.readFileSync(path.join(ROOT, "app", "index.html"), "utf8");   // the page lives in app/ (#281 stage 3)
html = html
  .replace(/<title>[^<]*<\/title>/, "<title>MontClip playground</title>")
  .replace('<script src="app/app.js"></script>',
    '<script src="static-shim.js"></script>\n<script src="app/app.js"></script>');
if (!html.includes("static-shim.js")) {
  console.error("! could not inject the shim - app.js script tag not found");
  process.exit(1);
}
fs.writeFileSync(path.join(OUT, "index.html"), html);
fs.mkdirSync(path.join(OUT, "shared"), { recursive: true });
fs.copyFileSync(path.join(ROOT, "shared", "range-plan.js"), path.join(OUT, "shared", "range-plan.js"));

/* app.js and style.css are copied verbatim. Some of these only exist on
   branches that add them, so a missing one is skipped rather than fatal. */
for (const f of ["app/app.js", "shared/host-embed.js", "app/bgremove-assets.js", "app/narrow-layout.js", "shared/loudness.js", "shared/ducking.js", "shared/silence.js", "shared/beats.js", "shared/transcribe.js", "shared/captions.js", "shared/audio-fx.js", "shared/mask.js", "shared/tracker.js", "shared/reframe.js", "shared/highlights.js", "app/highlight-candidates.js", "app/caption-quick.js", "shared/lyrics-align.js", "shared/lyrics-track.js", "shared/songs.js", "shared/auto-slices.js", "shared/corrections.js", "app/segment-edits.js", "shared/danmaku.js", "shared/motion.js", "shared/color.js", "shared/edit-ops.js", "shared/comp.js", "shared/sequences.js", "shared/templates.js", "app/mp4-demux.js", "shared/media-lib.js", "shared/delivery.js", "app/bg-export.js", "app/fx-worklet.js", "app/style.css", "app/favicon.svg", "app/ruler-worker.js", "app/meter-worklet.js", "svg-sanitize.js", "credits.js", "shared/ui-preferences.js", "shared/ui-terms.js", "shared/problem-redact.js", "app/ffmpeg-card.js"]) {
  const from = path.join(ROOT, f);
  if (!fs.existsSync(from)) continue;
  fs.mkdirSync(path.dirname(path.join(OUT, f)), { recursive: true });   // page code in app/, scripts it shares with the server in shared/ (#281 stages 2-3)
  fs.copyFileSync(from, path.join(OUT, f));
}

/* The library files the built-in templates use (the placeholder logo) and the
   title fonts the demo edits draw with (static-shim.js lists them). The
   shim serves /library/… from this folder. */
for (const rel of ["elements/logo-placeholder.svg", "fonts/Anton.woff2", "fonts/Playfair Display.woff2", "fonts/Bebas Neue.woff2", "fonts/Roboto.woff2", "fonts/LICENSES.md"]) {
  const to = path.join(OUT, "library", rel);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(path.join(ROOT, "library", rel), to);
}

/* Footage is generated, not borrowed: see make-media.js. It is left alone
   here so a sync never overwrites it. */
const mediaDir = path.join(OUT, "media");
const have = fs.existsSync(mediaDir) ? fs.readdirSync(mediaDir) : [];
if (!have.length) console.log("! docs/demo/media is empty - run: node docs/demo/make-media.js");

console.log("playground synced. media files present:", have.length);
