/* CI source check — the ci.yml steps that depend on the code being flat at the
   repo root, moved here (MontClip #281 prep PR) so later phases only change
   this script, never the workflow.

     node .github/scripts/ci-check.js            # source checks: syntax, JSON, data-dir split
     node .github/scripts/ci-check.js --release  # release readiness: release-check.js + npm-pack list

   AP.2: lists every tracked .js with `git ls-files`; zero files, or fewer than
   the explicit baseline, is a failure (a file was lost). AP.4: the "Check the
   data-dir split" assertions are carried over word for word. Zero dependencies,
   like the rest of the repo. */
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..", "..");

/* AP.3: the number of tracked .js files at the prep commit. The old `for f in
   *.js` saw only the 99 files flat at the root; `git ls-files '*.js'` sees all
   of them across the repo (a superset that keeps working as code moves into
   subdirectories). This floor fails the check if a file is later dropped. */
const BASELINE_JS = 496;

const run = (cmd, args, opts) => {
  const r = spawnSync(cmd, args, { cwd: ROOT, encoding: "utf8", ...opts });
  if (r.status !== 0) {
    const detail = r.error ? `${r.error.code}: ${r.error.message}` : (r.stderr || r.stdout || "").trim();
    throw new Error(`${cmd} ${args.join(" ")} failed (${r.status}):\n${detail}`);
  }
  return r;
};

/* npm is a .cmd shim on Windows, which needs a shell; on the Linux runner it is
   directly executable. */
const NPM_SHELL = process.platform === "win32";

/* All tracked .js files, independent of the working directory. */
function listTrackedJs() {
  const r = run("git", ["ls-files", "-z", "--", "*.js"]);
  return r.stdout.split("\0").filter(Boolean);
}

/* AP.2: an empty list, or one below the baseline, must fail. */
function assertEnoughJs(files, baseline) {
  if (files.length === 0) {
    throw new Error("git ls-files listed 0 .js files — nothing to check (refusing a weak check)");
  }
  if (files.length < baseline) {
    throw new Error(`only ${files.length} .js files tracked, below the baseline of ${baseline} — a file was lost`);
  }
}

/* node --check every listed file. */
function syntaxCheck(files) {
  for (const f of files) {
    const r = spawnSync(process.execPath, ["--check", path.join(ROOT, f)], { encoding: "utf8" });
    if (r.status !== 0) {
      throw new Error(`${f} does not parse:\n${r.stderr}`);
    }
  }
  return files.length;
}

/* The source checks that used to be three inline ci.yml steps. */
function checkSource(files, baseline) {
  assertEnoughJs(files, baseline);
  return syntaxCheck(files);
}

/* Named JSON files must parse (the old "Validate JSON files" step). */
const JSON_FILES = [
  "package.json",
  "manifest.json",
  ".mcp.json",
  ".claude-plugin/plugin.json",
  ".claude-plugin/marketplace.json",
];
function validateJson() {
  for (const f of JSON_FILES) {
    try {
      JSON.parse(fs.readFileSync(path.join(ROOT, f), "utf8"));
      console.log(`${f} OK`);
    } catch (e) {
      throw new Error(`${f}: ${e.message}`);
    }
  }
}

/* AP.4: the "Check the data-dir split" assertions, word for word. Under
   `node -e`, `require('./paths')` resolves against process.cwd(), so both run
   with cwd = ROOT. The second carries FABLECUT_DATA_DIR, as in ci.yml. */
const SPLIT_DEFAULT = `const p = require('./paths');
if (p.SPLIT) { console.error('expected SPLIT=false with no env'); process.exit(1); }
if (p.PROJECT_FILE !== require('path').join(process.cwd(), 'project.json')) {
  console.error('default project path moved:', p.PROJECT_FILE); process.exit(1);
}
console.log('default layout OK');
`;

const SPLIT_ENV = `const path = require('path');
const fs = require('fs');
const p = require('./paths');
const want = path.resolve(process.env.FABLECUT_DATA_DIR);
if (!p.SPLIT) { console.error('expected SPLIT=true'); process.exit(1); }
for (const [k, v] of Object.entries({
  PROJECT_FILE: 'project.json', MEDIA_DIR: 'media',
  EXPORTS_DIR: 'exports', ANALYSIS_DIR: 'analysis', LIBRARY_DIR: 'library',
})) {
  if (p[k] !== path.join(want, v)) {
    console.error(k, 'did not move:', p[k]); process.exit(1);
  }
}
if (p.APP_DIR !== process.cwd()) { console.error('APP_DIR moved:', p.APP_DIR); process.exit(1); }
p.ensureDirs();
if (!fs.existsSync(path.join(want, 'library/svg/sparkles.svg'))) {
  console.error('library was not seeded'); process.exit(1);
}
console.log('split layout OK');
`;

function dataDirSplit() {
  const env = {};
  run(process.execPath, ["-e", SPLIT_DEFAULT], { env: { ...process.env, ...env }, stdio: "inherit" });
  run(process.execPath, ["-e", SPLIT_ENV], {
    env: { ...process.env, FABLECUT_DATA_DIR: "/tmp/fc-data" },
    stdio: "inherit",
  });
}

/* --release: the "Versions, metadata, syntax, MCP tools" check and the
   "Pack and install the npm package, then check what it ships" list check. */
function releaseCheck() {
  run(process.execPath, [path.join(ROOT, ".github", "scripts", "release-check.js")], { stdio: "inherit" });
}

function npmPackCheck() {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "montclip-pack-"));
  try {
    const app = path.join(out, "app");
    fs.mkdirSync(app);
    run("npm", ["pack", "--pack-destination", out], { shell: NPM_SHELL, stdio: "inherit" });
    const tgz = fs.readdirSync(out).find((f) => f.endsWith(".tgz"));
    if (!tgz) throw new Error("npm pack produced no tarball");
    run("npm", ["init", "-y"], { cwd: app, shell: NPM_SHELL, stdio: "ignore" });
    run("npm", ["install", "--no-audit", "--no-fund", path.join(out, tgz)], { cwd: app, shell: NPM_SHELL, stdio: "inherit" });
    run(process.execPath, [path.join(ROOT, ".github", "scripts", "release-check.js"), "--installed", path.join(app, "node_modules", "montclip")], { stdio: "inherit" });
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
}

function main() {
  try {
    if (process.argv.includes("--release")) {
      releaseCheck();
      npmPackCheck();
      return;
    }
    const files = listTrackedJs();
    checkSource(files, BASELINE_JS);
    console.log(`syntax-checked ${files.length} tracked .js files (baseline ${BASELINE_JS})`);
    validateJson();
    dataDirSplit();
  } catch (e) {
    console.error("::error::" + e.message);
    process.exit(1);
  }
}

module.exports = { listTrackedJs, assertEnoughJs, syntaxCheck, checkSource, BASELINE_JS };

if (require.main === module) main();
