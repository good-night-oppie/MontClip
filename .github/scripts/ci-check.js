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
   `node -e`, `require('./server/paths')` resolves against process.cwd(), so both run
   with cwd = ROOT. The second carries FABLECUT_DATA_DIR, as in ci.yml. */
const SPLIT_DEFAULT = `const p = require('./server/paths');
if (p.SPLIT) { console.error('expected SPLIT=false with no env'); process.exit(1); }
if (p.PROJECT_FILE !== require('path').join(process.cwd(), 'project.json')) {
  console.error('default project path moved:', p.PROJECT_FILE); process.exit(1);
}
console.log('default layout OK');
`;

const SPLIT_ENV = `const path = require('path');
const fs = require('fs');
const p = require('./server/paths');
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
    run("npm", ["pack", "--pack-destination", NPM_SHELL ? `"${out}"` : out], { shell: NPM_SHELL, stdio: "inherit" });
    const tgz = fs.readdirSync(out).find((f) => f.endsWith(".tgz"));
    if (!tgz) throw new Error("npm pack produced no tarball");
    run("npm", ["init", "-y"], { cwd: app, shell: NPM_SHELL, stdio: "ignore" });
    run("npm", ["install", "--no-audit", "--no-fund", NPM_SHELL ? `"${path.join(out, tgz)}"` : path.join(out, tgz)], { cwd: app, shell: NPM_SHELL, stdio: "inherit" });
    run(process.execPath, [path.join(ROOT, ".github", "scripts", "release-check.js"), "--installed", path.join(app, "node_modules", "montclip")], { stdio: "inherit" });
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
}

/* Commit identity gate: GitHub links a commit to an account by its author
   email. A bare "<handle>@users.noreply.github.com" binds to whoever owns
   that handle (bb@... once bound a real stranger), and a [bot] address whose
   numeric prefix is not that bot real user id stays unattributed. Only the
   12 team bot user ids pass; fake local addresses are refused too. */
const TEAM_BOT_IDS = new Set([
  "354007710", "354008066", "354008095", "354008109", "354008129", "354008172",
  "354008194", "354008211", "354008275", "354008299", "354008317", "354633415",
]);

function identityProblems(emails) {
  const bad = [];
  for (const raw of emails) {
    const email = String(raw || "").trim();
    if (!email) { bad.push("(empty email)"); continue; }
    if (/@localhost$/i.test(email) || /\.local$/i.test(email)) { bad.push(email + " (fake local address)"); continue; }
    const m = /^([^@\s]*)@users\.noreply\.github\.com$/i.exec(email);
    if (!m) continue;
    const local = m[1];
    const id = /^(\d+)\+/.exec(local);
    if (!id) { bad.push(email + " (bare handle binds a real person)"); continue; }
    if (/\[bot\]$/.test(local) && !TEAM_BOT_IDS.has(id[1])) bad.push(email + " (unknown bot id " + id[1] + ")");
  }
  return bad;
}

function gitQuiet(args) {
  const r = spawnSync("git", args, { cwd: ROOT, encoding: "utf8" });
  return r.status === 0 ? r.stdout : null;
}

function commitIdentityEmails() {
  const base = process.env.GITHUB_BASE_REF;
  if (base && gitQuiet(["rev-parse", "--verify", "--quiet", "origin/" + base]) !== null) {
    const out = gitQuiet(["log", "--format=%ae%n%ce", "origin/" + base + "..HEAD"]);
    if (out !== null) return out.split(/\r?\n/).filter(Boolean);
  }
  /* GitHub Actions checks out shallow (fetch-depth 1); for pull_request HEAD is
     a synthetic merge commit whose committer is GitHub itself. HEAD^2 is the PR
     head when it was fetched, otherwise checking HEAD is all we can do. */
  const targets = gitQuiet(["rev-parse", "--verify", "--quiet", "HEAD^2"]) ? ["HEAD^2", "HEAD"] : ["HEAD"];
  const emails = [];
  for (const t of targets) {
    const out = gitQuiet(["log", "-1", "--format=%ae%n%ce", t]);
    if (out) emails.push(...out.split(/\r?\n/).filter(Boolean));
  }
  return emails;
}

function checkCommitIdentity(emails) {
  const bad = identityProblems(emails === undefined ? commitIdentityEmails() : emails);
  if (bad.length) throw new Error("commit author/committer identity is not a team bot: " + bad.join("; "));
}

function main() {
  try {
    if (process.argv.includes("--release")) {
      releaseCheck();
      npmPackCheck();
      return;
    }
    checkCommitIdentity();
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

module.exports = { listTrackedJs, assertEnoughJs, syntaxCheck, checkSource, identityProblems, checkCommitIdentity, TEAM_BOT_IDS, BASELINE_JS };

if (require.main === module) main();
