/* ═══════════════════════════════════════════════════════════════════════════
   An optional FFmpeg of the user's own, for H.264 export with libx264.

   MontClip ships only an LGPL FFmpeg (ffmpeg-path.js), which has no libx264.
   A user who wants x264 quality can pick an FFmpeg already on their computer in
   Settings (desktop: a file dialog in the main process, desktop/main.js). That
   choice is stored by the main process as {version:1, path} in a JSON file
   whose location reaches the server as MONTCLIP_EXTERNAL_FFMPEG_SETTINGS.

   Rules (ADR docs/decisions/2026-11-02-h264-encoder.md):
     · only the absolute path the user picked; never PATH, never a guess;
     · checked before use (-version and -encoders, argument arrays, no shell)
       and it must list libx264;
     · used only to encode an H.264 export (libx264). Preview, decoding,
       probing, proxies and every other export keep the bundled FFmpeg;
     · gone or failing → exports fall back to the bundled encoders and say why.
   ═══════════════════════════════════════════════════════════════════════════ */
"use strict";
const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");

function defaultRun(file, args) {
  return new Promise((resolve) => {
    execFile(file, args, { timeout: 15000, maxBuffer: 8 * 1024 * 1024, windowsHide: true },
      (err, stdout) => resolve({ code: err ? (typeof err.code === "number" ? err.code : 1) : 0, stdout: String(stdout || ""), error: err ? String(err.code || err.message) : null }));
  });
}

/** Check one file. → {ok:true, path, version} | {ok:false, path, reason} */
async function check(file, { run = defaultRun } = {}) {
  if (typeof file !== "string" || !file || !path.isAbsolute(file))
    return { ok: false, path: file || null, reason: "Choose the FFmpeg program file itself (a full path)." };
  let st = null;
  try { st = fs.statSync(file); } catch { }
  if (!st || !st.isFile()) return { ok: false, path: file, reason: `There is no file at ${file} any more.` };
  const v = await run(file, ["-hide_banner", "-version"]);
  if (v.code !== 0 || !/ffmpeg version/i.test(v.stdout)) return { ok: false, path: file, reason: `The chosen program could not be started or did not run as FFmpeg (${file}).` };
  const e = await run(file, ["-hide_banner", "-encoders"]);
  if (e.code !== 0 || !/^\s*V\S*\s+libx264\b/m.test(e.stdout)) return { ok: false, path: file, reason: "The chosen FFmpeg has no libx264 encoder, so it cannot improve H.264 export." };
  return { ok: true, path: file, version: v.stdout.split(/\r?\n/)[0] };
}

function readSetting(settingsFile) {
  if (!settingsFile) return null;
  let raw;
  try { raw = fs.readFileSync(settingsFile, "utf8"); } catch (e) { return e.code === "ENOENT" ? null : { bad: true }; }
  try {
    const v = JSON.parse(raw);
    return v && v.version === 1 && typeof v.path === "string" ? { path: v.path } : { bad: true };
  } catch { return { bad: true }; }
}

/** The server's view of the setting. Re-checked when the setting or the file changes. */
function createExternal({ settingsFile = process.env.MONTCLIP_EXTERNAL_FFMPEG_SETTINGS || null, run = defaultRun } = {}) {
  let memo = null;
  const stamp = (f) => { try { const s = fs.statSync(f); return `${s.size}:${s.mtimeMs}`; } catch { return "gone"; } };
  async function current() {
    const s = readSetting(settingsFile);
    if (!s) return { ok: false, reason: "none" };
    if (s.bad) return { ok: false, reason: "The saved local FFmpeg setting could not be read. Choose the program again in Settings." };
    const key = `${s.path}|${stamp(s.path)}|${stamp(settingsFile)}`;
    if (memo && memo.key === key) return memo.value;
    const value = await check(s.path, { run });
    memo = { key, value };
    return value;
  }
  return {
    current,
    /** The bundled encoder set, plus libx264 while the local FFmpeg checks out. */
    async available(bundled) {
      const set = new Set([...bundled].filter((e) => e !== "libx264"));
      if ((await current()).ok) set.add("libx264");
      return set;
    },
  };
}

/** Does this delivery spec encode with libx264 (so with the local FFmpeg)? */
const isExternalJob = (spec) => !!spec && !!spec.video && spec.video.encoder === "libx264";
/** Do these raw encoding-profile args encode with libx264? */
function argsUseX264(args) {
  for (let i = 0; i < args.length - 1; i++) if ((args[i] === "-c:v" || args[i] === "-vcodec" || args[i] === "-codec:v") && args[i + 1] === "libx264") return true;
  return false;
}

/** Why there is no H.264 encoder, in plain words. */
function noH264Reason({ platform = process.platform, mediaFoundation = true } = {}) {
  let s = "This computer has no H.264 encoder MontClip can use: no graphics-card encoder answered";
  if (platform === "win32") {
    s += " and Windows' own H.264 encoder is not available.";
    if (!mediaFoundation) s += " This looks like a Windows \"N\" edition without media components: install the Media Feature Pack from Windows Settings (Optional features), then restart MontClip.";
  } else s += ".";
  return s + " You can choose your own FFmpeg with libx264 in Settings, or export in another format (for example Archive).";
}

module.exports = { check, createExternal, isExternalJob, argsUseX264, noH264Reason, readSetting };
