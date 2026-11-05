/* ═══════════════════════════════════════════════════════════════════════════
   An optional FFmpeg of the user's own, for H.264 export with libx264.

   MontClip ships only an LGPL FFmpeg (ffmpeg-path.js), which has no libx264.
   A user who wants x264 quality can pick an FFmpeg already on their computer in
   Settings (desktop: a file dialog in the main process, desktop/main.js). That
   choice is stored by the main process as {version:1, path} in a JSON file
   whose location reaches the server as MONTCLIP_EXTERNAL_FFMPEG_SETTINGS.

   Web / server mode (node server.js, no desktop app) has no such dialog. There the person
   who starts the server may name one in MONTCLIP_EXTERNAL_FFMPEG: an absolute path, checked
   the same way. A choice saved in Settings goes first; the variable only counts without one.

   Without either, an FFmpeg with libx264 on PATH counts too — only when the bundled build has no H.264 encoder
   (JJ P1, 2026-11-04).

   Rules (ADR docs/decisions/2026-11-02-h264-encoder.md, and its 2026-11-05 supplement):
     · an absolute path only; PATH is looked up by ffmpeg-path.js to an absolute path, never by name;
     · never a program in a folder the server writes (media, uploads, analysis …): ffmpeg-path.js placeAllowed,
       checked before anything is started (QQ 2026-11-05); on POSIX it must be executable;
     · checked before use (-version and -encoders, argument arrays, no shell) and it must list libx264;
     · used only to encode H.264: exports, and proxies when the bundled build has no H.264 encoder. Preview,
       decoding, probing, analysis and loudness keep the bundled FFmpeg;
     · gone or failing → exports fall back to the bundled encoders and say why.
   ═══════════════════════════════════════════════════════════════════════════ */
"use strict";
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFile } = require("child_process");

/* A path can carry the user's name (C:\Users\<name>\…). What reaches the page, an export note
   or a log says %USERPROFILE% (Windows) or ~ instead; only the main process keeps the real path. */
const SHARED_PROFILES = /^(public|default|default user|all users)$/i;
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function maskUserPath(s) {
  if (typeof s !== "string") return s;
  let out = s;
  const home = os.homedir();
  if (home && home.length > 3) {
    const pattern = home.split(/[\\/]/).map(escapeRe).join("[\\\\/]") + "(?=[\\\\/]|$|\\s)";
    out = out.replace(new RegExp(pattern, process.platform === "win32" ? "gi" : "g"), process.platform === "win32" ? "%USERPROFILE%" : "~");
  }
  out = out.replace(/\b[A-Za-z]:([\\/])Users[\\/]([^\\/:*?"<>|\r\n]+)(?=[\\/]|$)/gi,
    (m, sep, name) => (SHARED_PROFILES.test(name) ? m : "%USERPROFILE%"));
  out = out.replace(/(^|[\s("'=])\/(?:home|Users)\/[^/\s]+(?=\/|$)/g, "$1~");
  return out;
}
/** A check result as the page may see it: ok, the reason code, and the path masked; no English reason. */
function forPage(r) {
  if (!r || typeof r !== "object") return r;
  const out = { ok: !!r.ok };
  if (!r.ok) out.code = typeof r.code === "string" ? r.code : "none";
  if (typeof r.path === "string") out.path = maskUserPath(r.path);
  return out;
}

function defaultRun(file, args) {
  return new Promise((resolve) => {
    execFile(file, args, { timeout: 15000, maxBuffer: 8 * 1024 * 1024, windowsHide: true },
      (err, stdout) => resolve({ code: err ? (typeof err.code === "number" ? err.code : 1) : 0, stdout: String(stdout || ""), error: err ? String(err.code || err.message) : null }));
  });
}

/** Check one file. → {ok:true, path, version} | {ok:false, path, code, reason}. `code` is what the page
    shows (ui-preferences.js says it in the interface language); `reason` is English, for logs and agents. */
const placeAllowed = (file) => require("./ffmpeg-path").placeAllowed(file);
async function check(file, { run = defaultRun } = {}) {
  if (typeof file !== "string" || !file || !path.isAbsolute(file))
    return { ok: false, path: file || null, code: "extNotFullPath", reason: "Choose the FFmpeg program file itself (a full path)." };
  // a folder the server writes, or (POSIX) not executable: never started
  if (!placeAllowed(file)) return { ok: false, path: file, code: "extNotFfmpeg", reason: `MontClip does not run programs from ${maskUserPath(path.dirname(file))}.` };
  let st = null;
  try { st = fs.statSync(file); } catch { }
  if (!st || !st.isFile()) return { ok: false, path: file, code: "extGone", reason: `There is no file at ${maskUserPath(file)} any more.` };
  const v = await run(file, ["-hide_banner", "-version"]);
  if (v.code !== 0 || !/ffmpeg version/i.test(v.stdout)) return { ok: false, path: file, code: "extNotFfmpeg", reason: `The chosen program could not be started or did not run as FFmpeg (${maskUserPath(file)}).` };
  const e = await run(file, ["-hide_banner", "-encoders"]);
  if (e.code !== 0 || !/^\s*V\S*\s+libx264\b/m.test(e.stdout)) return { ok: false, path: file, code: "extNoX264", reason: "The chosen FFmpeg has no libx264 encoder, so it cannot improve H.264 export." };
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

const ENV_WHY = {
  extNotFullPath: "it must be the full path of the ffmpeg program",
  extGone: "there is no file there",
  extNotFfmpeg: "it could not be started, or it is not FFmpeg",
  extNoX264: "it has no libx264 encoder",
};
/** How MontClip was started, which decides only how a reason is worded (what the user can do there), never which
    encoder is used: "settings" (desktop app: the Settings dialog), "plugin" (Cindy plugin: the plugin names one),
    "server" (node server.js in a browser: MONTCLIP_EXTERNAL_FFMPEG when it starts). */
function setupFor(env = process.env) {
  if (env.MONTCLIP_HOST === "cindy") return "plugin";
  return env.MONTCLIP_DESKTOP === "1" ? "settings" : "server";
}

/** A program the user names in the card (any FFmpeg, x264 or not): it must be an existing file called ffmpeg(.exe) and
    answer -version as FFmpeg. A file with another name is never started. → {ok:true, path} | {ok:false, code:"notFfmpeg"} */
async function checkTool(file, { run = defaultRun } = {}) {
  const bad = { ok: false, path: typeof file === "string" ? file : null, code: "notFfmpeg" };
  if (typeof file !== "string" || !path.isAbsolute(file) || !/^ffmpeg(\.exe)?$/i.test(path.basename(file))) return bad;
  try { if (!fs.statSync(file).isFile()) return bad; } catch { return bad; }
  if (!placeAllowed(file)) return bad;   // a folder the server writes (an upload named ffmpeg.exe), or not executable
  const v = await run(file, ["-hide_banner", "-version"]);
  return v.code === 0 && /ffmpeg version/i.test(v.stdout) ? { ok: true, path: file } : bad;
}
function writeChoice(settingsFile, file) {
  const temp = settingsFile + "." + process.pid + "." + Date.now().toString(36) + Math.random().toString(36).slice(2, 8) + ".tmp";
  try {
    fs.mkdirSync(path.dirname(settingsFile), { recursive: true });
    fs.writeFileSync(temp, JSON.stringify({ version: 1, path: file }), { flag: "wx" });
    fs.renameSync(temp, settingsFile);
    return true;
  } catch { try { fs.unlinkSync(temp); } catch { } return false; }
}
/** Save what the card's path box named (checkTool first). The same file the desktop Settings choice uses. */
async function saveTool(settingsFile, file, { run = defaultRun } = {}) {
  const r = await checkTool(file, { run });
  if (!r.ok) return r;
  return writeChoice(settingsFile, r.path) ? r : { ok: false, path: r.path, code: "extSaveFailed" };
}

/** A user's choice, saved where the server reads it: the desktop main process (file dialog) and the Cindy plugin's
    worker both call these, so the check and the file are the same everywhere. → forPage-able results. */
async function saveChoice(settingsFile, file, { run = defaultRun } = {}) {
  const result = await check(file, { run });
  if (!result.ok) return result;
  return writeChoice(settingsFile, result.path) ? result : { ok: false, path: result.path, code: "extSaveFailed", reason: "The choice could not be saved." };
}
function clearChoice(settingsFile) {
  try { fs.rmSync(settingsFile, { force: true }); return { ok: false, code: "none" }; } catch { return { ok: false, code: "extRemoveFailed" }; }
}
async function savedStatus(settingsFile, { run = defaultRun } = {}) {
  const saved = readSetting(settingsFile);
  if (!saved) return { ok: false, code: "none" };
  if (saved.bad) return { ok: false, code: "extSettingBad" };
  return check(saved.path, { run });
}

/** The server's view of the setting. Re-checked when the setting or the file changes. Sources, first that is set:
    the saved choice (desktop Settings, or the Cindy plugin), then MONTCLIP_EXTERNAL_FFMPEG. Same in every run mode. */
function createExternal({ settingsFile = process.env.MONTCLIP_EXTERNAL_FFMPEG_SETTINGS || null,
  envPath = process.env.MONTCLIP_EXTERNAL_FFMPEG || null, run = defaultRun, setup = setupFor(),
  findOnPath = () => require("./ffmpeg-path").findOnPath(process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg") } = {}) {
  let memo = null;
  const stamp = (f) => { try { const s = fs.statSync(f); return `${s.size}:${s.mtimeMs}`; } catch { return "gone"; } };
  async function checked(file, source) {
    const key = `${source}|${file}|${stamp(file)}|${settingsFile ? stamp(settingsFile) : ""}`;
    if (memo && memo.key === key) return memo.value;
    let value = { ...(await check(file, { run })), source };
    // the variable is not chosen in a dialog, so its failures name the variable instead of Settings
    if (!value.ok && source === "env") value = { ok: false, path: file, source, code: "extEnvUnusable",
      reason: `MONTCLIP_EXTERNAL_FFMPEG (${maskUserPath(file)}) cannot be used: ${ENV_WHY[value.code] || "it did not pass the check"}.` };
    // outside the desktop app the reasons that point at its Settings ("choose again", "Stop using this FFmpeg") don't apply
    if (!value.ok && source === "settings" && setup !== "settings") value = { ok: false, path: file, source, code: "extSavedUnusable",
      reason: `The FFmpeg chosen for MontClip (${maskUserPath(file)}) cannot be used: ${ENV_WHY[value.code] || "it did not pass the check"}.` };
    memo = { key, value };
    return value;
  }
  let pathAllowed = false;   // set by available(): PATH only when the bundled build has no H.264 encoder
  async function current({ allowPath = pathAllowed } = {}) {
    const s = readSetting(settingsFile);
    if (s && s.bad) return setup === "settings"
      ? { ok: false, code: "extSettingBad", reason: "The saved local FFmpeg setting could not be read. Choose the program again in Settings." }
      : { ok: false, code: "extSavedUnusable", reason: "The saved FFmpeg choice for MontClip could not be read." };
    if (s) return checked(s.path, "settings");
    if (envPath) return checked(envPath, "env");
    if (allowPath) {
      const onPath = findOnPath();
      if (onPath) { const r = await checked(onPath, "path"); if (r.ok) return r; }
    }
    return { ok: false, code: "none", reason: "none" };
  }
  return {
    current,
    setup,
    /** The general program's encoder set, plus libx264 while a local FFmpeg with it checks out. ownX264: the general
        program has libx264 itself (no bundled build, a full FFmpeg used for everything) — then it stays. */
    async available(bundled, { ownX264 = false } = {}) {
      const set = new Set([...bundled].filter((e) => e !== "libx264"));
      // the same test export uses: an h264_* MontClip never selects (h264_omx, h264_v4l2m2m …) is no encoder here
      pathAllowed = !require("./delivery").encodersFor("h264", set).length;
      if (ownX264 || (await current({ allowPath: pathAllowed })).ok) set.add("libx264");
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

/** Do these raw encoding-profile args encode H.264 (libx264, a graphics-card or Windows' own encoder)? */
function argsUseH264(args) {
  for (let i = 0; i < args.length - 1; i++) if ((args[i] === "-c:v" || args[i] === "-vcodec" || args[i] === "-codec:v") && /^(libx264|h264_\w+)$/.test(args[i + 1])) return true;
  return false;
}

/** Why there is no H.264 encoder, as a code for the page. `setup` "server" / "plugin" (no desktop Settings) lets the
    page say what exists in that mode. */
function noH264({ platform = process.platform, mediaFoundation = true, setup } = {}) {
  const r = platform === "win32" ? { code: "h264NoneWin", featurePack: !mediaFoundation } : { code: "h264NoneOther", featurePack: false };
  return setup === "server" || setup === "plugin" ? { ...r, setup } : r;
}
/** The same in English, for agents and logs. */
function noH264Reason({ platform = process.platform, mediaFoundation = true, setup } = {}) {
  let s = "This computer has no H.264 encoder MontClip can use: no graphics-card encoder answered";
  if (platform === "win32") {
    s += " and Windows' own H.264 encoder is not available.";
    if (!mediaFoundation) s += " This looks like a Windows \"N\" edition without media components: install the Media Feature Pack from Windows Settings (Optional features), then restart MontClip.";
  } else s += ".";
  if (setup === "plugin") return s + " In Cindy, name an FFmpeg with libx264 on this computer for MontClip to use, or export in another format (for example Archive).";
  if (setup === "server") return s + " Start the MontClip server with MONTCLIP_EXTERNAL_FFMPEG set to the full path of an FFmpeg that has libx264 (for example /usr/bin/ffmpeg), or export in another format (for example Archive).";
  return s + " You can choose your own FFmpeg with libx264 in Settings, or export in another format (for example Archive).";
}

module.exports = { maskUserPath, forPage, noH264, check, checkTool, saveTool, setupFor, saveChoice, clearChoice, savedStatus, createExternal, isExternalJob, argsUseX264, argsUseH264, noH264Reason, readSetting };
