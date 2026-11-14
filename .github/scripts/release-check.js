/* Release readiness — what a release (and, once published, npm and the MCP registry) will see, checked on
   every pull request instead of after a release.

     node .github/scripts/release-check.js                 # the repo checkout
     node .github/scripts/release-check.js --installed DIR # + an installed copy of the npm package

   Checks: one version everywhere it is written · registry / Glama metadata ·
   every root script parses · the MCP server starts over stdio and its tool list
   matches manifest.json · the installed package holds every file the editor
   page and the server load, and its MCP server answers too.
   Zero dependencies, like the rest of the repo. */
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn, spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..", "..");
const arg = (name) => {
  const i = process.argv.indexOf(name);
  if (i < 0) return null;
  const v = process.argv[i + 1];
  if (!v || v.startsWith("--")) { console.error(`${name} needs a folder`); process.exit(2); }
  return v;
};
const INSTALLED = arg("--installed");

let failed = 0;
const ok = (msg) => console.log("  ok  " + msg);
const fail = (msg) => { failed++; console.log("::error::" + msg); };
const check = (cond, good, bad) => (cond ? ok(good) : fail(bad));
const readJSON = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), "utf8"));
const section = (s) => console.log("\n" + s);

/* ── One version everywhere ── */
section("Versions");
const pkg = readJSON("package.json");
const V = pkg.version;
const mcpSrc = fs.readFileSync(path.join(ROOT, "server", "mcp-server.js"), "utf8");
const serverInfo = /serverInfo:\s*\{\s*name:\s*"[^"]*",\s*version:\s*"([^"]+)"/.exec(mcpSrc);
const versions = {
  "package.json": V,
  "manifest.json": readJSON("manifest.json").version,
  ".claude-plugin/plugin.json": readJSON(".claude-plugin/plugin.json").version,
  "mcp-server.js serverInfo": serverInfo && serverInfo[1],
};
for (const [where, v] of Object.entries(versions)) check(v === V, `${where} = ${V}`, `${where} is ${v}, package.json is ${V} — bump every version place together`);

/* ── Not published (docs/decisions/2026-11-02-brand-montclip.md) ──
   MontClip goes to neither npm nor the MCP registry until the owner registers
   `montclip` and `io.github.good-night-oppie/montclip`; then the registry
   manifest and these checks come back together. */
section("Not published");
check(pkg.private === true, "package.json private: true (npm refuses to publish it)", "package.json must be private until the owner registers the npm name");
check(pkg.mcpName === undefined, "package.json has no mcpName", `package.json mcpName ${pkg.mcpName} names a registry entry nobody registered`);
check(!fs.existsSync(path.join(ROOT, "server.json")), "no MCP registry manifest", "the MCP registry manifest is back without a registered name");

/* ── Metadata ── */
section("Metadata");
const glama = readJSON("glama.json");
check(typeof glama.$schema === "string" && Array.isArray(glama.maintainers) && glama.maintainers.length > 0, "glama.json has $schema and maintainers", "glama.json needs $schema and a non-empty maintainers list");
check(fs.existsSync(path.join(ROOT, "LICENSE")) && pkg.license, `LICENSE present (${pkg.license})`, "LICENSE file or package.json license missing");
check(pkg.bin && pkg.bin.fablecut && fs.existsSync(path.join(ROOT, pkg.bin.fablecut)), "package.json bin exists", "package.json bin points at a missing file");
for (const f of ["package.json", "manifest.json", "glama.json", ".mcp.json", ".claude-plugin/plugin.json", ".claude-plugin/marketplace.json"]) {
  try { readJSON(f); ok(`${f} parses`); } catch (e) { fail(`${f}: ${e.message}`); }
}

/* ── Bundled FFmpeg: pinned LGPL builds, packaged with their license ── */
section("Bundled FFmpeg");
{
  const man = readJSON("desktop/ffmpeg-manifest.json");
  const lic = fs.existsSync(path.join(ROOT, "LICENSES.md")) ? fs.readFileSync(path.join(ROOT, "LICENSES.md"), "utf8") : "";
  check(/^LGPL/.test(man.license || ""), `FFmpeg manifest license ${man.license}`, "desktop/ffmpeg-manifest.json must pin an LGPL build");
  for (const plat of ["win32-x64", "linux-x64"]) {
    const b = (man.builds || {})[plat] || {};
    check(/^https:\/\//.test(b.url || "") && /lgpl/.test(b.url) && !/-gpl/.test(b.url) && /^[0-9a-f]{64}$/.test(b.sha256 || ""),
      `${plat}: LGPL archive pinned by SHA-256`, `${plat}: needs an https LGPL archive URL and a SHA-256 in desktop/ffmpeg-manifest.json`);
    check(lic.includes(b.sha256 || "-") && lic.includes(b.url || "-"), `${plat}: LICENSES.md lists its source and SHA-256`, `${plat}: LICENSES.md must list the archive URL and SHA-256`);
  }
  const res = (readJSON("desktop/package.json").build || {}).extraResources || [];
  check(res.some((r) => r && r.to === "ffmpeg" && /vendor\/ffmpeg\/\$\{platform\}-\$\{arch\}/.test(r.from || "")),
    "desktop packaging copies vendor/ffmpeg/<platform>-<arch> to resources/ffmpeg", "desktop/package.json build.extraResources must copy vendor/ffmpeg/${platform}-${arch} to ffmpeg");
}

/* ── The bundled FFmpeg itself: no GPL or non-free code in the package ── */
section("Bundled FFmpeg build (no GPL)");
{
  // GPL / non-free and libopenh264 are release blockers (Deja 2026-11-02); the rules live in one module
  const { auditBuild, auditManifest, auditLicenses } = require("../../desktop/ffmpeg-audit");
  const manProblems = auditManifest(readJSON("desktop/ffmpeg-manifest.json"));
  check(!manProblems.length, "FFmpeg manifest: our own build without libopenh264 (openh264: false)",
    "FFmpeg manifest: " + manProblems.map((p) => p.detail).join("; "));
  // every library in the build: its licence text at the pinned ref, classified (LICENSES.md)
  const licProblems = auditLicenses(readJSON("licenses/ffmpeg/inventory.json"));
  check(!licProblems.length, "FFmpeg libraries: every licence text collected and classified",
    "FFmpeg libraries: " + licProblems.map((p) => p.detail).join("; "));
  const plat = `${process.platform}-${process.arch}`;
  const vendor = path.join(ROOT, "vendor", "ffmpeg", plat), exe = path.join(vendor, process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg");
  if (!fs.existsSync(exe)) ok(`vendor/ffmpeg/${plat} not fetched here — run node desktop/fetch-ffmpeg.cjs to check the build itself`);
  else {
    const v = spawnSync(exe, ["-hide_banner", "-version"], { encoding: "utf8", timeout: 60000 });
    const e = spawnSync(exe, ["-hide_banner", "-encoders"], { encoding: "utf8", timeout: 60000 });
    const configuration = (v.stdout || "").split(/\r?\n/).find((l) => l.startsWith("configuration:")) || "";
    const problems = v.status === 0 ? auditBuild({ configuration, encoders: e.stdout || "" }) : [{ detail: "could not run it" }];
    check(!problems.length, `${plat}: bundled ffmpeg is LGPL with no GPL, non-free or libopenh264 component`,
      `${plat}: bundled ffmpeg: ${problems.map((p) => p.detail).join("; ")}`);
  }
  const res = (readJSON("desktop/package.json").build || {}).extraResources || [];
  const ffRes = res.find((r) => r && r.to === "ffmpeg") || {};
  check(Array.isArray(ffRes.filter) && ffRes.filter.every((f) => /^(ffmpeg|ffprobe)(\.exe)?$|^LICENSE\.txt$|^SOURCE\.json$/.test(f)),
    "packaging copies only the bundled ffmpeg/ffprobe, its license and its source record", "desktop/package.json ffmpeg extraResources must copy only ffmpeg, ffprobe, LICENSE.txt and SOURCE.json");
}

/* ── Every root script parses ── */
section("Syntax");
// the root's scripts, the editor page's own (app/, #281 stage 2) and the ones page and server share (shared/, stage 3),
// so moving them does not shrink this check
const rootJs = ["", "app", "shared"].flatMap((d) => fs.readdirSync(path.join(ROOT, d)).filter((f) => f.endsWith(".js")).map((f) => (d ? d + "/" : "") + f));
for (const f of rootJs) {
  const r = spawnSync(process.execPath, ["--check", path.join(ROOT, f)], { encoding: "utf8" });
  check(r.status === 0, `${f}`, `${f} does not parse:\n${r.stderr}`);
}

/* ── MCP server over stdio, the way Glama and clients inspect it ── */
function mcpTools(dir) {
  return new Promise((resolve, reject) => {
    const data = fs.mkdtempSync(path.join(os.tmpdir(), "fablecut-check-"));
    const child = spawn(process.execPath, [path.join(dir, "server", "mcp-server.js")], {
      cwd: dir, env: { ...process.env, FABLECUT_DATA_DIR: data, FABLECUT_NO_FS_WATCH: "1" }, stdio: ["pipe", "pipe", "pipe"],
    });
    let buf = "", err = "";
    const done = (fn, v) => { clearTimeout(timer); child.kill(); try { fs.rmSync(data, { recursive: true, force: true }); } catch { } fn(v); };
    const timer = setTimeout(() => done(reject, new Error("no answer within 20 s\n" + err)), 20000);
    child.stderr.on("data", (c) => { err += c; });
    child.on("exit", (code) => done(reject, new Error(`exited with ${code}\n${err}`)));
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      buf += chunk;
      let nl;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
        if (!line) continue;
        let msg;
        try { msg = JSON.parse(line); } catch { return done(reject, new Error("stdout carried a non-JSON line: " + line.slice(0, 120))); }
        if (msg.id === 1) {
          if (!msg.result || !msg.result.serverInfo) return done(reject, new Error("initialize failed: " + line));
          child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");
          child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }) + "\n");
        } else if (msg.id === 2) {
          if (!msg.result || !Array.isArray(msg.result.tools)) return done(reject, new Error("tools/list failed: " + line));
          done(resolve, msg.result.tools);
        }
      }
    });
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize",
      params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "release-check", version: "1" } } }) + "\n");
  });
}
function checkTools(label, tools) {
  const manifest = readJSON("manifest.json").tools.map((t) => t.name).sort();
  const names = tools.map((t) => t.name).sort();
  check(names.length > 0, `${label}: ${names.length} tools`, `${label}: no tools listed`);
  const missing = names.filter((n) => !manifest.includes(n)), stale = manifest.filter((n) => !names.includes(n));
  check(!missing.length && !stale.length, `${label}: tools match manifest.json`,
    `${label}: manifest.json tools out of date — add [${missing.join(", ")}], remove [${stale.join(", ")}]`);
  for (const t of tools) {
    if (!t.description || !t.inputSchema || t.inputSchema.type !== "object") fail(`${label}: tool ${t.name} needs a description and an object inputSchema`);
  }
}

/* ── The installed npm package ships what it runs ── */
function checkInstalled(dir) {
  const html = fs.readFileSync(path.join(dir, "app", "index.html"), "utf8");   // served at "/" (#281 stage 3)
  const want = new Set(["server/server.js", "server/mcp-server.js", "server/cli.js", "CLAUDE.md", "encoding-profiles.json"]);
  for (const [, f] of html.matchAll(/(?:src|href)="\/?([^"#:?]+)"/g)) if (!/^https?:/.test(f)) want.add(f);
  for (const d of ["", "app", "shared"]) for (const f of fs.readdirSync(path.join(dir, d)).filter((x) => x.endsWith(".js"))) {
    const src = fs.readFileSync(path.join(dir, d, f), "utf8");
    // a require is relative to the file's own folder: app/ and shared/ (#281 stages 2 and 3) reach other folders with ../
    for (const [, m] of src.matchAll(/require\(\s*["'](\.\.?\/[^"']+)["']\s*\)/g)) {
      const r = path.posix.join(d || ".", m);
      if (!r.startsWith("..")) want.add(/\.\w+$/.test(r) ? r : r + ".js");
    }
    for (const [, m] of src.matchAll(/(?:addModule|new Worker)\(\s*["']\/?([^"']+\.js)["']/g)) want.add(m);
  }
  const missing = [...want].filter((f) => !fs.existsSync(path.join(dir, f)));
  check(!missing.length, `installed package ships the ${want.size} files the page and server load`,
    `installed package is missing: ${missing.join(", ")} — add them to package.json "files"`);
  const v = spawnSync(process.execPath, [path.join(dir, "server", "cli.js"), "-v"], { encoding: "utf8" });
  check(v.status === 0 && v.stdout.trim() === V, `fablecut -v → ${V}`, `fablecut -v printed "${(v.stdout || v.stderr).trim()}"`);
}

(async () => {
  section("MCP server (repo)");
  try { checkTools("repo", await mcpTools(ROOT)); } catch (e) { fail("repo MCP server: " + e.message); }
  if (INSTALLED) {
    const dir = path.resolve(INSTALLED);
    section(`Installed package (${dir})`);
    checkInstalled(dir);
    try { checkTools("installed", await mcpTools(dir)); } catch (e) { fail("installed MCP server: " + e.message); }
  }
  console.log(failed ? `\n${failed} check(s) failed` : "\nall release checks passed");
  process.exit(failed ? 1 : 0);
})();
