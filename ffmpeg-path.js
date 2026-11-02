/* ═══════════════════════════════════════════════════════════════════════════
   Which ffmpeg / ffprobe to run.

   MontClip runs the FFmpeg it ships with, never whatever happens to be on PATH:
   a PATH build may be GPL, may be missing, or may differ from the one the app
   was tested with. Resolution order, first match wins:

     1. Packaged desktop app — desktop/main.js sets MONTCLIP_FFMPEG_DIR to
        <process.resourcesPath>/ffmpeg and sets MONTCLIP_FFMPEG_PACKAGED=1, which
        also turns off the per-tool overrides below.
     2. Development — MONTCLIP_FFMPEG / MONTCLIP_FFPROBE: an absolute path to
        one program each.
     3. Development — MONTCLIP_FFMPEG_DIR: a folder holding both.
     4. Development — vendor/ffmpeg/<platform>-<arch>/ in the checkout, filled by
        `node desktop/fetch-ffmpeg.cjs` (the same files packaging bundles).

   When none of these names an existing file the tool is reported missing, with
   a plain-language reason. There is no fallback to PATH: callers get the
   absolute path the bundled program should have, so spawning it fails with
   ENOENT instead of quietly running a different build.
   ═══════════════════════════════════════════════════════════════════════════ */
"use strict";
const fs = require("fs");
const path = require("path");

const TOOLS = ["ffmpeg", "ffprobe"];

function exeName(name, platform) { return platform === "win32" ? name + ".exe" : name; }

function isFile(p) { try { return fs.statSync(p).isFile(); } catch { return false; } }

/** Resolve one tool. Never throws; never returns a bare program name.
 *  → { ok:true, path, source } | { ok:false, path, source, error } */
function resolveTool(name, opts = {}) {
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
  /** Where the tool was looked for: packaged · env · env-dir · vendor. */
  source: (name) => cached(name).source,
  /** The code the page shows: the packaged app says "ffmpegMissing" in its language; the env /
      vendor reasons only exist in a development setup and stay English ("ffmpegDev"). */
  missingCode: ({ source }) => (source === "packaged" ? "ffmpegMissing" : "ffmpegDev"),
  /** Plain-language reason the tool is missing, or "" when it is there. */
  reason: (name) => cached(name).error || "",
  /** The error to report when running the tool failed: why, and what needed it. */
  why: (name, need) => (cached(name).error || `MontClip's bundled ${name} could not be started (${cached(name).path}).`) + ` It is needed ${need}.`,
  status: () => Object.fromEntries(TOOLS.map((t) => [t, cached(t)])),
  /** Tests only: forget what was resolved. */
  _reset: () => cache.clear(),
};
