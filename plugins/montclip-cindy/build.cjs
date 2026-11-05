#!/usr/bin/env node
/* Copy the MontClip engine (the repo root: server.js, app.js, mcp-server.js and what they load)
   into node/app/, where the plugin's Node worker runs it. There is one engine: this copy is made
   for packing and never edited (node/app/ is gitignored). Run before ghost_forge_pack:
     node plugins/montclip-cindy/build.cjs */
"use strict";
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..", "..");
const OUT = path.join(__dirname, "node", "app");
// the engine and the editor page; dev tooling, tests, docs and the Electron shell stay out
const SKIP_FILES = new Set(["cli.js", "glama.json", "server.json", "package-lock.json"]);
const FILE_EXT = new Set([".js", ".html", ".css", ".json", ".svg", ".md"]);
const SKIP_MD = new Set(["CHANGELOG.md", "CODE_OF_CONDUCT.md", "CONTRIBUTING.md", "DEVELOPMENT.md", "SECURITY.md", "AGENTS.md", "README.md", "LICENSES.md"]);
const DIRS = ["icons", "library", "licenses"];

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
let files = 0, bytes = 0;
const copy = (from, to) => { fs.mkdirSync(path.dirname(to), { recursive: true }); fs.copyFileSync(from, to); files++; bytes += fs.statSync(to).size; };
for (const e of fs.readdirSync(ROOT, { withFileTypes: true })) {
  if (!e.isFile() || SKIP_FILES.has(e.name) || SKIP_MD.has(e.name) || e.name === "project.json") continue;
  if (!FILE_EXT.has(path.extname(e.name))) continue;
  copy(path.join(ROOT, e.name), path.join(OUT, e.name));
}
copy(path.join(ROOT, "LICENSE"), path.join(OUT, "LICENSE"));
const walk = (rel) => {
  const dir = path.join(ROOT, rel);
  if (!fs.existsSync(dir)) return;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith(".")) continue;
    const r = path.join(rel, e.name);
    if (e.isDirectory()) walk(r); else copy(path.join(ROOT, r), path.join(OUT, r));
  }
};
for (const d of DIRS) walk(d);
// the Windows app's pinned LGPL ffmpeg: its manifest and installer (the plugin downloads the same build)
for (const f of ["ffmpeg-manifest.json", "fetch-ffmpeg.cjs"]) copy(path.join(ROOT, "desktop", f), path.join(OUT, "desktop", f));
// the pages the plugin's own views frame (served by the engine's static route, same origin as the editor)
const EMBED = path.join(__dirname, "embed");
if (fs.existsSync(EMBED)) for (const f of fs.readdirSync(EMBED)) copy(path.join(EMBED, f), path.join(OUT, "cindy", f));
for (const d of ["media", "exports"]) fs.mkdirSync(path.join(OUT, d), { recursive: true });
console.log(`node/app: ${files} files, ${(bytes / 1e6).toFixed(1)} MB from ${ROOT}`);
