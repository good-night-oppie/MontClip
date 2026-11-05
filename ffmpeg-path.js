/* ═══════════════════════════════════════════════════════════════════════════
   Which ffmpeg / ffprobe to run.

   The same in the desktop app, web / server mode and the Cindy plugin. The
   bundled build runs everything — preview, probing, decoding, analysis,
   loudness (ADR 2026-11-02, kept by the 2026-11-05 supplement). Another FFmpeg
   (chosen, MONTCLIP_EXTERNAL_FFMPEG, PATH) only encodes H.264, through
   external-ffmpeg.js. Only when there is no bundled build at all does this
   file fall back to PATH, then the user's choice, for everything — and only to
   a program that passes the gate (it runs the ebur128 options MontClip
   measures with; Debian's 5.1 does not). First match wins, per tool:

     1. Bundled:
        a. packaged desktop app / plugin — MONTCLIP_FFMPEG_PACKAGED=1 and
           MONTCLIP_FFMPEG_DIR (which also turns off b and c);
        b. development — MONTCLIP_FFMPEG / MONTCLIP_FFPROBE (absolute paths);
        c. development — MONTCLIP_FFMPEG_DIR (a folder holding both);
        d. development — vendor/ffmpeg/<platform>-<arch>/, filled by
           `node desktop/fetch-ffmpeg.cjs` (the same files packaging bundles).
     2. No bundled build: PATH — looked up here, folder by folder, so the result
        is an absolute path: nothing is ever spawned by bare name.
     3. No bundled build: the user's choice — the ffmpeg saved in
        MONTCLIP_EXTERNAL_FFMPEG_SETTINGS ({version:1, path}); ffprobe beside it.

   Nothing in a folder the server writes is ever started (setPlaces /
   placeAllowed: media, library, uploads, analysis, exports …, QQ 2026-11-05),
   except the plugin's download folder; on POSIX the file must be executable.

   When none names an existing file the tool is reported missing, with the
   first source's plain-language reason, and `path` stays absolute.
   refresh() forgets what was found, for 「重新检测」 without a restart.
   ═══════════════════════════════════════════════════════════════════════════ */
"use strict";
const fs = require("fs");
const path = require("path");

const TOOLS = ["ffmpeg", "ffprobe"];

function exeName(name, platform) { return platform === "win32" ? name + ".exe" : name; }

function isFile(p) { try { return fs.statSync(p).isFile(); } catch { return false; } }

/* Folders the server writes (and so a page could put a file in): nothing there is ever started. `allow` wins (the
   plugin's own download folder). Paths are compared after realpath, case-insensitively on Windows. */
let places = { deny: [], allow: [] };
const norm = (p) => {
  let r = path.resolve(p);
  try { r = fs.realpathSync.native(r); } catch { }
  return process.platform === "win32" ? r.toLowerCase() : r;
};
const inside = (file, dir) => file === dir || file.startsWith(dir.endsWith(path.sep) ? dir : dir + path.sep);
function setPlaces({ deny = [], allow = [] } = {}) { places = { deny: deny.filter(Boolean).map(norm), allow: allow.filter(Boolean).map(norm) }; }
/** May this program be started? Not inside a folder the server writes (unless allowed); on POSIX, executable. */
function placeAllowed(file) {
  if (typeof file !== "string" || !path.isAbsolute(file)) return false;
  const f = norm(file);
  if (!places.allow.some((d) => inside(f, d)) && places.deny.some((d) => inside(f, d))) return false;
  if (process.platform !== "win32") { try { if (!(fs.statSync(f).mode & 0o111)) return false; } catch { return false; } }
  return true;
}
/* The gate for an FFmpeg used for everything (no bundled build): it must run the loudness measurement's own options. */
const GATE_ARGS = ["-hide_banner", "-v", "error", "-f", "lavfi", "-i", "sine=d=0.3", "-af", "ebur128=peak=true:framelog=quiet", "-f", "null", "-"];
const gateMemo = new Map();
function passesGate(bin) {
  let key = bin;
  try { const st = fs.statSync(bin); key += `|${st.size}|${st.mtimeMs}`; } catch { return false; }
  if (!gateMemo.has(key)) {
    let ok = false;
    try { ok = require("child_process").spawnSync(bin, GATE_ARGS, { stdio: "ignore", timeout: 15000, windowsHide: true }).status === 0; } catch { }
    gateMemo.set(key, ok);
  }
  return gateMemo.get(key);
}

/** The first PATH folder holding `exe`, as an absolute path; null when none. Relative and empty entries are skipped
 *  (they mean the current folder, which is not where an installed program lives). */
function findOnPath(exe, { env = process.env, platform = process.platform, exists = isFile } = {}) {
  const p = platform === "win32" ? path.win32 : path.posix;
  const raw = env.PATH !== undefined ? env.PATH : (env.Path !== undefined ? env.Path : "");
  const list = platform === "win32" && env.PATH !== undefined && env.Path !== undefined && env.Path !== env.PATH ? env.PATH + ";" + env.Path : raw;
  for (const dir of String(list || "").split(platform === "win32" ? ";" : ":")) {
    const d = dir.trim().replace(/^"(.*)"$/, "$1");
    if (!d || !p.isAbsolute(d)) continue;
    const f = p.join(d, exe);
    if (exists(f)) return f;
  }
  return null;
}
/** The ffmpeg path saved as the user's choice, or null. */
function readChoiceFile(file) {
  if (!file) return null;
  try { const v = JSON.parse(fs.readFileSync(file, "utf8")); return v && v.version === 1 && typeof v.path === "string" ? { path: v.path } : null; } catch { return null; }
}

/** Resolve one tool: the bundled build; with none, PATH, then the user's choice (ffmpeg must pass the gate).
 *  Never throws; never returns a bare program name.
 *  → { ok:true, path, source } | { ok:false, path, source, error, tooOld? }   (source: packaged · env · env-dir · vendor · path · chosen) */
function resolveTool(name, opts = {}) {
  const first = resolveBundled(name, opts);
  if (first.ok) return first;
  const env = opts.env || process.env, platform = opts.platform || process.platform, exists = opts.exists || isFile;
  const usable = name === "ffmpeg" ? (opts.usable || passesGate) : () => true;
  const allowed = opts.exists ? () => true : placeAllowed;   // tests that fake the file system fake its places too
  const exe = exeName(name, platform), p = platform === "win32" ? path.win32 : path.posix;
  const found = [];
  const onPath = findOnPath(exe, { env, platform, exists });
  if (onPath) found.push({ path: onPath, source: "path" });
  const chosenFile = opts.chosenFile !== undefined ? opts.chosenFile : (env.MONTCLIP_EXTERNAL_FFMPEG_SETTINGS || null);
  const choice = (opts.readChoice || readChoiceFile)(chosenFile);
  if (choice && typeof choice.path === "string" && p.isAbsolute(choice.path)) {
    const f = p.join(p.dirname(choice.path), exe);
    if (exists(f)) found.push({ path: f, source: "chosen" });
  }
  let old = null;
  for (const c of found) {
    if (!allowed(c.path)) continue;
    if (usable(c.path)) return { ok: true, ...c };
    old = old || c;
  }
  if (old) return { ok: false, ...old, tooOld: true,
    error: `The ${name} found at ${old.path} is too old for MontClip: it cannot run the loudness measurement's options (ebur128 framelog).` };
  return first;
}
function resolveBundled(name, opts = {}) {
  if (!TOOLS.includes(name)) throw new Error(`unknown tool ${name}`);
  const env = opts.env || process.env;
  const platform = opts.platform || process.platform;
  const arch = opts.arch || process.arch;
  const exists = opts.exists || isFile;
  const appDir = opts.appDir || __dirname;
  const exe = exeName(name, platform);
  const packaged = env.MONTCLIP_FFMPEG_PACKAGED === "1";
  const missing = (p, source, why) => ({ ok: false, path: p, source, error: why });

  if (packaged) {
    const dir = env.MONTCLIP_FFMPEG_DIR;
    if (!dir || !path.isAbsolute(dir)) return missing(path.join(appDir, "ffmpeg", exe), "packaged",
      `MontClip could not find its bundled ${name}. Reinstall MontClip to restore it.`);
    const p = path.join(dir, exe);
    return exists(p) ? { ok: true, path: p, source: "packaged" }
      : missing(p, "packaged", `MontClip's bundled ${name} is missing (${p}). Reinstall MontClip to restore it.`);
  }

  const override = env[name === "ffmpeg" ? "MONTCLIP_FFMPEG" : "MONTCLIP_FFPROBE"];
  if (override) {
    const key = name === "ffmpeg" ? "MONTCLIP_FFMPEG" : "MONTCLIP_FFPROBE";
    if (!path.isAbsolute(override)) return missing(path.resolve(appDir, override), "env",
      `${key} must be the full path to the ${name} program, not "${override}".`);
    return exists(override) ? { ok: true, path: override, source: "env" }
      : missing(override, "env", `${key} points to ${override}, but there is no file there.`);
  }

  if (env.MONTCLIP_FFMPEG_DIR) {
    const dir = env.MONTCLIP_FFMPEG_DIR;
    const p = path.join(path.resolve(dir), exe);
    return exists(p) ? { ok: true, path: p, source: "env-dir" }
      : missing(p, "env-dir", `MONTCLIP_FFMPEG_DIR is set to ${dir}, but ${exe} is not in it.`);
  }

  const p = path.join(appDir, "vendor", "ffmpeg", `${platform}-${arch}`, exe);
  return exists(p) ? { ok: true, path: p, source: "vendor" }
    : missing(p, "vendor", `The bundled ${name} is not installed (${p}). Run "node desktop/fetch-ffmpeg.cjs", ` +
      `or set MONTCLIP_FFMPEG and MONTCLIP_FFPROBE to the full paths of the programs.`);
}

const cache = new Map();
function cached(name) {
  if (!cache.has(name)) cache.set(name, resolveTool(name));
  return cache.get(name);
}

module.exports = {
  TOOLS, resolveTool,
  /** Absolute path to spawn (it may not exist — see `available`). */
  path: (name) => cached(name).path,
  available: (name) => cached(name).ok,
  /** Where the tool was found (or first looked for): packaged · env · env-dir · vendor · path · chosen. */
  source: (name) => cached(name).source,
  /** The code the page shows: the packaged app says "ffmpegMissing" in its language; the env /
      vendor reasons only exist in a development setup and stay English ("ffmpegDev"). */
  missingCode: ({ source }) => (source === "packaged" ? "ffmpegMissing" : "ffmpegDev"),
  /** Plain-language reason the tool is missing, or "" when it is there. */
  reason: (name) => cached(name).error || "",
  /** The error to report when running the tool failed: why, and what needed it. */
  why: (name, need) => (cached(name).error || `MontClip's bundled ${name} could not be started (${cached(name).path}).`) + ` It is needed ${need}.`,
  status: () => Object.fromEntries(TOOLS.map((t) => [t, cached(t)])),
  /** Forget what was found: the next call looks again (「重新检测」). */
  refresh: () => cache.clear(),
  findOnPath, setPlaces, placeAllowed, passesGate, GATE_ARGS,
  /** Tests only: forget what was resolved. */
  _reset: () => cache.clear(),
};
