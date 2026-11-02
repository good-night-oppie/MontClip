/* Fetch the LGPL FFmpeg build that MontClip bundles into vendor/ffmpeg/<platform>-<arch>/.

   node desktop/fetch-ffmpeg.cjs [--platform win32-x64] [--archive <already downloaded file>]

   The archive must match the SHA-256 pinned in desktop/ffmpeg-manifest.json, and the
   extracted ffmpeg must report an LGPL configuration (no --enable-gpl, no
   --enable-nonfree) — a GPL build is refused even if its checksum were pinned by
   mistake. Packaging copies the resulting folder to <resources>/ffmpeg. */
"use strict";
const crypto = require("node:crypto");
const fs = require("node:fs");
const https = require("node:https");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const manifest = require("./ffmpeg-manifest.json");

function arg(name) { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : null; }

// Rejects on any network trouble: redirect loops, non-HTTPS hops, HTTP errors, a
// response that breaks off ("aborted"/"error"), or no data for timeoutMs.
function download(url, file, { get = https.get, timeoutMs = 120000 } = {}, hops = 0) {
  return new Promise((resolve, reject) => {
    if (hops > 5) return reject(new Error("too many redirects"));
    if (!url.startsWith("https://")) return reject(new Error("refusing non-HTTPS URL " + url));
    let done = false, out = null, response = null, req = null;
    // a failure also closes the half-written file and the response, so nothing stays open
    const fail = (e) => { if (!done) { done = true; out?.destroy(); response?.destroy?.(); req?.destroy(); reject(e); } };
    req = get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume(); done = true;
        return resolve(download(new URL(res.headers.location, url).href, file, { get, timeoutMs }, hops + 1));
      }
      if (res.statusCode !== 200) { res.resume(); return fail(new Error(`download failed: HTTP ${res.statusCode}`)); }
      response = res;
      res.on("aborted", () => fail(new Error("download interrupted (connection aborted)")));
      res.on("error", fail);
      out = fs.createWriteStream(file);
      res.pipe(out);
      out.on("finish", () => out.close(() => { if (!done) { done = true; resolve(); } }));
      out.on("error", fail);
    });
    req.on("error", fail);
    req.setTimeout(timeoutMs, () => fail(new Error(`download timed out after ${timeoutMs} ms without data`)));
  });
}

/** Copy ffmpeg/ffprobe/LICENSE into a staging folder beside dest, self-check the staged
 *  ffmpeg, and only then swap it into dest (rename). A failure at any step leaves dest as
 *  it was and removes the staging folder. Returns what check() returned. */
function installTree({ src, dest, win, check, source }) {
  const exe = (n) => (win ? n + ".exe" : n);
  const parent = path.dirname(dest);
  fs.mkdirSync(parent, { recursive: true });
  const stage = fs.mkdtempSync(path.join(parent, ".staging-"));
  const old = dest + ".old-" + path.basename(stage);
  try {
    for (const n of ["ffmpeg", "ffprobe"]) {
      fs.copyFileSync(path.join(src, "bin", exe(n)), path.join(stage, exe(n)));
      if (!win) fs.chmodSync(path.join(stage, exe(n)), 0o755);
    }
    fs.copyFileSync(path.join(src, "LICENSE.txt"), path.join(stage, "LICENSE.txt"));
    const version = check(path.join(stage, exe("ffmpeg")));
    fs.writeFileSync(path.join(stage, "SOURCE.json"), JSON.stringify({ ...(source || {}), checked: version || null }, null, 2) + "\n");
    if (fs.existsSync(dest)) fs.renameSync(dest, old);
    try { fs.renameSync(stage, dest); }
    catch (e) { if (fs.existsSync(old)) fs.renameSync(old, dest); throw e; }
    fs.rmSync(old, { recursive: true, force: true });
    return version;
  } finally {
    fs.rmSync(stage, { recursive: true, force: true });
  }
}

function sha256(file) {
  const h = crypto.createHash("sha256");
  const fd = fs.openSync(file, "r");
  const buf = Buffer.alloc(1 << 20);
  try { for (let n; (n = fs.readSync(fd, buf, 0, buf.length, null)) > 0;) h.update(buf.subarray(0, n)); }
  finally { fs.closeSync(fd); }
  return h.digest("hex");
}

/** Reject anything that is not an LGPL build. Returns the version line. */
function checkLgpl(ffmpeg) {
  const v = spawnSync(ffmpeg, ["-hide_banner", "-version"], { encoding: "utf8" });
  if (v.status !== 0) throw new Error(`${ffmpeg} -version failed: ${v.error || v.stderr}`);
  if (/--enable-gpl\b|--enable-nonfree\b/.test(v.stdout)) throw new Error(`${ffmpeg} is a GPL or non-free build; MontClip bundles LGPL only`);
  const l = spawnSync(ffmpeg, ["-hide_banner", "-L"], { encoding: "utf8" });
  if (!/GNU Lesser General Public License/.test(l.stdout)) throw new Error(`${ffmpeg} does not report the LGPL license`);
  return v.stdout.split(/\r?\n/)[0];
}

async function main() {
  const plat = arg("--platform") || `${process.platform}-${process.arch}`;
  const build = manifest.builds[plat];
  if (!build) throw new Error(`no pinned FFmpeg build for ${plat} (have: ${Object.keys(manifest.builds).join(", ")})`);
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "montclip-ffmpeg-"));
  try {
    let archive = arg("--archive");
    if (!archive) {
      archive = path.join(work, path.basename(new URL(build.url).pathname));
      console.log("downloading " + build.url);
      await download(build.url, archive);
    }
    const got = sha256(archive);
    if (got !== build.sha256) throw new Error(`SHA-256 mismatch for ${archive}: got ${got}, pinned ${build.sha256}`);
    const ex = path.join(work, "x");
    fs.mkdirSync(ex);
    const tar = process.platform === "win32" ? path.join(process.env.SystemRoot || "C:\\Windows", "System32", "tar.exe") : "/usr/bin/tar";
    const t = spawnSync(tar, ["-xf", archive, "-C", ex], { stdio: "inherit" });
    if (t.status !== 0) throw new Error("extracting the archive failed");
    const src = path.join(ex, build.root);
    const win = plat.startsWith("win32");
    const dest = path.join(ROOT, "vendor", "ffmpeg", plat);
    const runnable = plat === `${process.platform}-${process.arch}`;
    const version = installTree({ src, dest, win, check: (file) => (runnable ? checkLgpl(file) : null),
      source: { version: manifest.version, license: manifest.license, builder: manifest.builder, source: manifest.source, url: build.url, sha256: build.sha256 } });
    console.log(`installed ${plat} into ${dest}` + (version ? ` (${version})` : " (not runnable here; LGPL check skipped)"));
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

if (require.main === module) main().catch((e) => { console.error(e.message); process.exit(1); });
module.exports = { checkLgpl, sha256, download, installTree };
