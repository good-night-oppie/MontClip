/* ═══════════════════════════════════════════════════════════════════════════
   Which ffmpeg / ffprobe to run.

   JJ P1 (2026-11-04): the same order in the desktop app, web / server mode and
   the Cindy plugin — the bundled build, then PATH, then the place the user
   chose. First match wins, per tool:

     1. Bundled:
        a. packaged desktop app / plugin — MONTCLIP_FFMPEG_PACKAGED=1 and
           MONTCLIP_FFMPEG_DIR (which also turns off b and c);
        b. development — MONTCLIP_FFMPEG / MONTCLIP_FFPROBE (absolute paths);
        c. development — MONTCLIP_FFMPEG_DIR (a folder holding both);
        d. development — vendor/ffmpeg/<platform>-<arch>/, filled by
           `node desktop/fetch-ffmpeg.cjs` (the same files packaging bundles).
     2. PATH — looked up here, folder by folder, so the result is an absolute
        path: nothing is ever spawned by bare name (spawn would search PATH and
        the current folder in its own way).
     3. The user's choice — the ffmpeg saved in MONTCLIP_EXTERNAL_FFMPEG_SETTINGS
        ({version:1, path}); ffprobe is looked for beside it.

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

/** Resolve one tool: bundled, then PATH, then the user's choice. Never throws; never returns a bare program name.
 *  → { ok:true, path, source } | { ok:false, path, source, error }   (source: packaged · env · env-dir · vendor · path · chosen) */
function resolveTool(name, opts = {}) {
  const first = resolveBundled(name, opts);
  if (first.ok) return first;
  const env = opts.env || process.env, platform = opts.platform || process.platform, exists = opts.exists || isFile;
  const exe = exeName(name, platform);
  const onPath = findOnPath(exe, { env, platform, exists });
  if (onPath) return { ok: true, path: onPath, source: "path" };
  const chosenFile = opts.chosenFile !== undefined ? opts.chosenFile : (env.MONTCLIP_EXTERNAL_FFMPEG_SETTINGS || null);
  const choice = (opts.readChoice || readChoiceFile)(chosenFile);
  if (choice && typeof choice.path === "string") {
    const p = platform === "win32" ? path.win32 : path.posix;
    if (p.isAbsolute(choice.path)) {
      const f = p.join(p.dirname(choice.path), exe);
      if (exists(f)) return { ok: true, path: f, source: "chosen" };
    }
  }
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
  findOnPath,
  /** Tests only: forget what was resolved. */
  _reset: () => cache.clear(),
};
