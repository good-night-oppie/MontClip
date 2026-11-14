/* ═══════════════════════════════════════════════════════════════════════════
   MontClip server — zero-dependency Node.js
   Run:  node server.js   →  http://localhost:7777

   Adds to the browser editor:
     • persistent project      ./project.json      (GET/PUT /api/project)
     • media library folder    ./media/            (served at /media/*, POST /api/upload,
                                                    POST /api/import-url)
     • live reload             GET /api/events     (SSE: event "change" for
                                                    project/media/library;
                                                    event "profiles" for
                                                    encoding-profiles.json)

   Automation: any tool (e.g. Claude Code) can edit project.json or drop files
   into ./media — the browser UI reloads instantly. Schema: see CLAUDE.md.
   ═══════════════════════════════════════════════════════════════════════════ */
"use strict";
const http = require("http");
const crypto = require("crypto");
const stream = require("stream");
const fs = require("fs");
const os = require("os");
const path = require("path");
const ownedProcesses = process.env.MONTCLIP_DESKTOP === "1"
  ? require("./owned-processes").trackOwnedProcesses(require("child_process")) : null;
const { spawn, spawnSync, execFile } = require("child_process");
const FF = require("./ffmpeg-path");
const X = require("./external-ffmpeg");
/* Where a chosen FFmpeg is saved: the desktop app names its own file; otherwise it lives with the user's data, so the
   web / server mode and the Cindy plugin keep a choice across restarts too (JJ P1). */
if (!process.env.MONTCLIP_EXTERNAL_FFMPEG_SETTINGS)
  process.env.MONTCLIP_EXTERNAL_FFMPEG_SETTINGS = path.join(require("./paths").DATA_DIR, "external-ffmpeg.json");
const Redact = require("../problem-redact");   // 〔复制问题信息〕: viewers, keys and user folders out
const ProblemFiles = require("./problem-files");   // 〔复制问题信息〕: a named file's size, by its name only (#161)
/* A local FFmpeg with libx264 for H.264 export (external-ffmpeg.js): the user's choice, the server's variable, or PATH. */
const externalFfmpeg = X.createExternal();

const { analyze, frame, frameGrid } = require("./analyze");
const {
  PROFILES_FILE,
  loadEncodeProfiles,
  invalidateEncodeProfiles,
  resolveProfile,
  listProfilesPublic,
  profileSummary,
  buildExportArgs,
  proresProjectEnd,
  proresFilterPlan,
  dryRunProfile,
} = require("./encode-profiles");
const { downloadImportUrl, maybeFaststart } = require("./import-url");
const { prepareMedia, publicPreparationError } = require("./prepare-media");
const { pruneCache } = require("./frame-cache");
const { createExportJobs, checkExportSpan } = require("./export-jobs");
const AudioWindow = require("./audio-window");
const { denoiseFile, AMOUNT_IDS: DENOISE_AMOUNTS } = require("./denoise");

const {
  APP_DIR, DATA_DIR, MEDIA_DIR, EXPORTS_DIR, PREVIEWS_DIR, REVIEWS_DIR, ANALYSIS_DIR, LIBRARY_DIR,
  PROJECT_FILE, LIBRARY_SUBDIRS, FRAMES_DIR, PROXIES_DIR, ensureDirs, readSaved, writeSaved,
} = require("./paths");
/** Uploads arrive here first (same volume as media/; a dot folder, so never served). At start only .part files older than
 *  24 hours are removed (left over from a crash): another server on the same DATA_DIR may be receiving an upload (QQ). */
const UPLOADS_DIR = path.join(DATA_DIR, ".uploads");
try {
  const stale = Date.now() - 24 * 3600 * 1000;
  for (const f of fs.readdirSync(UPLOADS_DIR)) {
    if (!f.endsWith(".part")) continue;
    const file = path.join(UPLOADS_DIR, f);
    try { if (fs.statSync(file).mtimeMs < stale) fs.rmSync(file, { force: true }); } catch {}
  }
} catch {}
const Templates = require("../templates");
const { probeFile, infoForEntry } = require("./media-probe");
const MakeEditable = require("./make-editable");
const repairJobs = MakeEditable.createJobs({ prefix: "r_" });
const MediaLib = require("../media-lib");
const { createProxies, PROXY_H264 } = require("./proxy");
const { createTranscripts } = require("./transcripts");
const Delivery = require("../delivery");
const ExportCleanup = require("./export-cleanup");
const { createPreviewStore } = require("./preview-store");
const ExportCheck = require("./export-check");
const { createProjects } = require("./projects");
const { createHistory } = require("./history");
const { createEmbed, sameSecret, TASK_ID_RE } = require("./embed");

/* Static app files are served from the install dir; everything the user creates
   lives under DATA_DIR. The two are the same unless FABLECUT_DATA_DIR is set. */
const ROOT = APP_DIR;
const PORT = process.env.PORT || 7777;
const HOST = process.env.HOST || "127.0.0.1";
const DESKTOP = process.env.MONTCLIP_DESKTOP === "1";
const DESKTOP_TOKEN = process.env.MONTCLIP_SESSION_TOKEN;
if (DESKTOP && (HOST !== "127.0.0.1" || !/^[a-f0-9]{64}$/.test(DESKTOP_TOKEN || "")))
  throw new Error("Desktop requires loopback binding and a fresh session token");
/* Embedded in Cindy (MONTCLIP_HOST=cindy, the MontClip-Cindy plugin): only requests carrying the plugin's session
   token get in — X-MontClip-Session, or the cookie a page load with ?token= trades for (embed.js). Unset, nothing
   here changes. */
const EMBED = process.env.MONTCLIP_HOST === "cindy";
if (EMBED && (DESKTOP || HOST !== "127.0.0.1"))
  throw new Error("Embedding in Cindy requires loopback binding (HOST=127.0.0.1) and cannot run in desktop mode");
let boundPort = PORT;
const serverOrigin = () => `http://127.0.0.1:${boundPort}`;

/* Requests must come from the local machine (or an explicitly allowed host).
   The Host check stops DNS rebinding; the Origin check stops malicious web
   pages firing blind cross-origin writes at the API. Opt into LAN use with
   HOST=0.0.0.0 and FABLECUT_ALLOWED_HOSTS=192.168.1.20,mybox.local */
const ALLOWED_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1", HOST.toLowerCase()]);
for (const h of (process.env.FABLECUT_ALLOWED_HOSTS || "").split(","))
  if (h.trim()) ALLOWED_HOSTS.add(h.trim().toLowerCase());

function hostAllowed(value) {
  if (!value) return false;
  // strip a :port suffix, but not the colons inside a bare IPv6 address
  const host = value.replace(/^(\[[^\]]*\]|[^:]+)(:\d+)?$/, "$1").toLowerCase();
  return ALLOWED_HOSTS.has(host);
}
const embed = EMBED ? createEmbed({ token: process.env.MONTCLIP_EMBED_TOKEN, hostAllowed }) : null;
function requestAllowed(req) {
  if (DESKTOP) {
    if (req.headers.host !== `127.0.0.1:${boundPort}` ||
        req.headers["x-montclip-session"] !== DESKTOP_TOKEN) return false;
    return !req.headers.origin || req.headers.origin === serverOrigin();
  }
  if (!hostAllowed(req.headers.host)) return false;
  if (embed && !embed.authorized(req)) return false;
  const origin = req.headers.origin;
  if (origin) {
    try { return hostAllowed(new URL(origin).host); } catch { return false; }
  }
  return true;
}

/* ffmpeg powers preview niceties (proxies, frames, conversions) and export. Everything else works without it:
   browsing media and marking clips never need it. Which program runs is ffmpeg-path.js's answer (bundled → PATH →
   the user's choice); FFMPEG_MISSING says in plain words why it is unavailable. detectFfmpeg() runs again for
   「重新检测」 and after a choice, without a restart. */
let HAS_FFMPEG = false, FFMPEG_MISSING = "", FFMPEG_MISSING_CODE = "ffmpegDev";
/* Never start a program from a folder this server writes: an upload named ffmpeg.exe lands in media/ (QQ, 2026-11-05).
   The plugin's download folder (MONTCLIP_FFMPEG_DIR, under the data folder) is the one allowed place. */
FF.setPlaces({ deny: [MEDIA_DIR, LIBRARY_DIR, UPLOADS_DIR, ANALYSIS_DIR, PROXIES_DIR, FRAMES_DIR, EXPORTS_DIR, PREVIEWS_DIR, path.join(DATA_DIR, "projects")],
  allow: [process.env.MONTCLIP_FFMPEG_DIR] });
function detectFfmpeg() {
  FF.refresh();
  HAS_FFMPEG = false;
  FFMPEG_MISSING = FF.reason("ffmpeg");
  /* the page says "ffmpegMissing" in its language; the English reasons of a development setup stay English */
  FFMPEG_MISSING_CODE = FF.missingCode({ source: FF.source("ffmpeg"), tooOld: !!FF.status().ffmpeg.tooOld });
  if (!FFMPEG_MISSING) {
    try { HAS_FFMPEG = spawnSync(FF.path("ffmpeg"), ["-version"], { stdio: "ignore", timeout: 15000, windowsHide: true }).status === 0; } catch {}
    if (!HAS_FFMPEG) FFMPEG_MISSING = `The ffmpeg MontClip found (${X.maskUserPath(FF.path("ffmpeg"))}) could not be started.`;
  }
}
/** What every "no usable FFmpeg" answer carries: the reason, its code, and for FFMPEG_TOO_OLD the version (no path). */
function ffmpegMissingBody() {
  const f = FF.status().ffmpeg;
  return { error: FFMPEG_MISSING, code: FFMPEG_MISSING_CODE, ...(f.tooOld ? { version: f.version || null, why: f.why || "options" } : {}) };
}
detectFfmpeg();

const MIME = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".json": "application/json",
  ".mp4": "video/mp4", ".webm": "video/webm", ".mov": "video/quicktime",
  ".mkv": "video/x-matroska", ".m4v": "video/mp4", ".flv": "video/x-flv",
  ".mp3": "audio/mpeg", ".wav": "audio/wav", ".ogg": "audio/ogg",
  ".m4a": "audio/mp4", ".aac": "audio/aac", ".flac": "audio/flac",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".gif": "image/gif", ".webp": "image/webp", ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".ttf": "font/ttf", ".otf": "font/otf", ".woff": "font/woff", ".woff2": "font/woff2",
};
/** On-device transcription (#70, asr-local.js): the engine and the VAD in the package's resources/asr (MONTCLIP_ASR_DIR,
 *  set by desktop/main.js), else vendor/asr in a checkout; the user's downloaded or imported models in
 *  MONTCLIP_ASR_MODELS_DIR (userData/asr-models in the desktop app), else <data dir>/asr-models. */
const ASR_DIR = path.resolve(process.env.MONTCLIP_ASR_DIR || path.join(APP_DIR, "vendor", "asr"));
const ASR_MODELS_DIR = path.resolve(process.env.MONTCLIP_ASR_MODELS_DIR || path.join(DATA_DIR, "asr-models"));
let asrLocal = null;
const asr = () => asrLocal || (asrLocal = require("./asr-local").createAsr({ asrDir: ASR_DIR, modelsDir: ASR_MODELS_DIR, ffmpeg: () => FF.path("ffmpeg"), cacheDir: path.join(DATA_DIR, "asr-cache") }));
/** The speech engine's front, or null when this copy of MontClip cannot even load it (P8: a copy without
 *  desktop/asr-manifest.json threw here and took the whole server down). Never throws. */
let asrLoadError = null, asrLoadCode = null;
const AsrStatus = require("./asr-status");
const asrOrNull = () => {
  try { return asr(); }
  catch (e) {
    asrLoadError = AsrStatus.hidePaths(String((e && e.message) || e).split("\n")[0]).slice(0, 200);   // never a local path
    asrLoadCode = /asr-manifest\.json/.test(asrLoadError) ? "ASR_MANIFEST_MISSING" : "ASR_ENGINE_MISSING";
    return null;
  }
};
const ASR_NONE = { ready: false, where: null, missing: [], bad: [] };
const asrJob = { running: null };

ensureDirs();
/* One engine writes a data folder (writer-lock.js): the Windows app and the Cindy plugin share this
   engine, and two of them on one folder would save over each other. MONTCLIP_SHELL names the shell. */
const SHELL = process.env.MONTCLIP_SHELL || (DESKTOP ? "desktop" : "server");
let writerLock;
try { writerLock = require("./writer-lock").acquire(DATA_DIR, { shell: SHELL }); }
catch (e) {
  // the shell that started this server (the Windows app) tells the user who has the folder: one line it can read
  if (e.code === "DATA_DIR_IN_USE") console.error("MONTCLIP_DATA_DIR_IN_USE " + JSON.stringify({ shell: e.holder?.shell || null, port: e.holder?.port || null }));
  throw e;
}
const projects = createProjects({ dataDir: DATA_DIR, projectFile: PROJECT_FILE, libraryDir: LIBRARY_DIR });
const undoStacks = require("./undo-stacks").createUndoStacks({ dir: path.join(ANALYSIS_DIR, "undo") });
const history = createHistory({ projects, autoMinutes: Number(process.env.FABLECUT_AUTO_VERSION_MIN) || 10 });
/* project.json that can't be read at startup (a crash mid-write by another tool, a
   bad hand edit): keep it aside and put back the newest good copy. */
if (fs.existsSync(PROJECT_FILE)) {
  try { JSON.parse(fs.readFileSync(PROJECT_FILE, "utf8").replace(/^﻿/, "")); }
  catch (e) {
    const r = history.recover(PROJECT_FILE);
    console.warn(`  ⚠ project.json could not be read (${e.message}); kept as ${path.basename(r.aside)}` +
      (r.recovered ? ` and restored from ${r.from}` : " — starting a new project"));
  }
}
if (!fs.existsSync(PROJECT_FILE)) {
  fs.writeFileSync(PROJECT_FILE, JSON.stringify({
    name: "未命名项目", width: 1280, height: 720, fps: 30,
    revision: 0, media: [], clips: [],
  }, null, 2));
}

/* ── SSE clients + file watching ── */
const sseClients = new Set();
const uiCommands = new Map();   // /api/ui/command id → resolve, until a tab answers or 4 s pass
/* Embedded in Cindy, an editor connection may be bound to one task (embed.js taskTicket / redeemTask, POST
   /api/embed/claim): res.montclipTask = {project, session}, in memory only, gone with the connection. Something meant
   for one task (its UI commands, its export tickets) goes only to the connections bound to it. */
const boundTo = (res, task) => !!res.montclipTask && res.montclipTask.session === task.session &&
  (!task.project || res.montclipTask.project === task.project);
const editorsFor = (task) => task ? [...sseClients].filter((res) => boundTo(res, task)) : [...sseClients];
function broadcast(event = "change", data = event, task = null) {
  const payload = `event: ${event}\ndata: ${data}\n\n`;
  for (const res of editorsFor(task)) res.write(payload);
}
/* Proxies are H.264 (ADR 2026-11-02 as amended 2026-11-05): the bundled build's own encoder; with none (Linux, LGPL,
   no graphics card), the local FFmpeg (chosen, MONTCLIP_EXTERNAL_FFMPEG or PATH) makes the proxy. Each program is
   probed itself — its own -encoders, and a 2-frame test encode with the proxy's arguments — so an encoder is never
   taken from one program and run on another. encoder() answers {encoder, bin}; proxy.js runs that bin. */
const proxyTrials = new Map();
function proxyTrial(bin, e) {
  let key = `${bin}|${e}`;
  try { const st = fs.statSync(bin); key += `|${st.size}|${st.mtimeMs}`; } catch { return Promise.resolve(false); }
  if (!proxyTrials.has(key)) proxyTrials.set(key, runFfmpeg(["-hide_banner", "-v", "error", "-f", "lavfi", "-i", "color=c=black:s=256x144:r=30:d=0.1",
    "-frames:v", "2", ...PROXY_H264[e], "-f", "null", "-"], 15000, bin).then((r) => r.code === 0));
  return proxyTrials.get(key);
}
async function proxyEncoder() {
  for (const e of Delivery.encodersFor("h264", await bundledEncoders()))
    if (PROXY_H264[e] && await proxyTrial(FF.path("ffmpeg"), e)) return { encoder: e, bin: FF.path("ffmpeg") };
  const ext = await externalFfmpeg.current();
  if (!ext.ok) return null;
  // its own -encoders, then a 2-frame test of each H.264 one (and nothing else: no HEVC or other test encodes on it)
  const listed = Delivery.parseEncoders((await runFfmpeg(["-hide_banner", "-encoders"], 15000, ext.path)).stdout);
  for (const e of Delivery.encodersFor("h264", listed))
    if (PROXY_H264[e] && await proxyTrial(ext.path, e)) return { encoder: e, bin: ext.path };
  return null;
}
const proxies = createProxies({ dir: PROXIES_DIR, resolveSrc, probe: probeFile, ffmpeg: () => FF.path("ffmpeg"), broadcast: (ev, data) => broadcast(ev, data),
  encoder: proxyEncoder,
  noEncoder: () => X.noH264Reason({ mediaFoundation: hasMediaFoundation() }) });
/* Word transcripts, one per version of a file (fablecut_transcribe, the Transcript tab). */
const transcripts = createTranscripts({ dir: path.join(ANALYSIS_DIR, "transcripts"), resolveSrc });
// P2 highlight signals: each file's loudness, read once by ffmpeg as a stream and cached per file version
const signals = require("./signals").createSignals({ dir: path.join(ANALYSIS_DIR, "signals"), ffmpeg: () => FF.path("ffmpeg") });
// P2 songs: each file read in segments, each kept as it is read (analysis/songs/), so a stopped scan carries on
const Songs = require("../songs");
const songScan = require("./song-scan").createSongScan({ dir: path.join(ANALYSIS_DIR, "songs"), ffmpeg: () => FF.path("ffmpeg") });
const songJobs = new Map();   // src (+ "|a<track>" for another audio stream) → {state, done, total, ctrl, error, code}
/* Which audio stream of a file is analysed — songs, loudness, the transcript: `given` (a request's
   `track`) when there is one, else the open project's media entry for that src (its audioTrack, media-lib.js
   audioTrackOf), else 0. One answer for every reader, so they never read different streams
   (docs/validation/2026-11-05-audio-tracks). → an integer, or NaN for a `given` that is not one. */
function audioTrackFor(src, given) {
  if (given != null && given !== "") { const n = Number(given); return Number.isInteger(n) && n >= 0 && n < 64 ? n : NaN; }
  try {
    const doc = JSON.parse(fs.readFileSync(PROJECT_FILE, "utf8").replace(/^\uFEFF/, ""));
    const m = (Array.isArray(doc.media) ? doc.media : []).find((x) => x && x.src === src);
    return m ? MediaLib.audioTrackOf(m) : 0;
  } catch { return 0; }
}
const BAD_TRACK = { error: "track is an audio stream number: 0 for the first", code: "BAD_TRACK" };
const songJobKey = (src, track) => (track > 0 ? src + "|a" + track : src);
// the drive the song analysis is written to ("C" on Windows), for 「{drive} 盘空间不够」 — never the path
const songDrive = () => { const root = path.parse(path.resolve(ANALYSIS_DIR)).root; return /^[A-Za-z]:/.test(root) ? root[0].toUpperCase() : root; };
async function startSongScan(src, file, again, track = 0) {
  const old = songJobs.get(songJobKey(src, track));
  if (old && old.state === "running") return old;
  if (again) songScan.forget(file, track);
  let total = null;
  try { const info = await probeFile(file); if (info && info.duration > 0) total = Math.max(1, Math.ceil(info.duration / songScan.SEGMENT)); } catch { /* unknown length */ }
  const job = { state: "running", done: songScan.cached(file, track).done, total, ctrl: new AbortController(), error: null };
  songJobs.set(songJobKey(src, track), job);
  const tell = () => broadcast("songs", JSON.stringify({ src, track, state: job.state, done: job.done, total: job.total }));
  songScan.scan(file, { signal: job.ctrl.signal, track, onSegment: (i) => { job.done = i + 1; tell(); } })
    .then((r) => { job.state = r.complete ? "done" : "stopped"; job.done = songScan.cached(file, track).done; })
    .catch((e) => { job.state = e.code === "SONGS_STOPPED" ? "stopped" : "failed"; job.error = X.maskUserPath(String(e.message)); job.code = e.code === "ENOSPC" ? "ENOSPC" : "SONGS_FAILED"; })
    .finally(tell);
  return job;
}
let debounce = null;
let profilesDebounce = null;
function onFsChange() {
  clearTimeout(debounce);
  debounce = setTimeout(() => broadcast("change"), 150);
}
function onProfilesChange() {
  invalidateEncodeProfiles();
  clearTimeout(profilesDebounce);
  profilesDebounce = setTimeout(() => broadcast("profiles"), 150);
}
/* watch the directory, not the file — atomic tmp+rename writes would detach a
   direct file watcher on Windows */
if (process.env.FABLECUT_NO_FS_WATCH !== "1") {
  try { fs.watch(DATA_DIR, (ev, f) => { if (f === "project.json") onFsChange(); }); } catch {}
  try {
    fs.watch(ROOT, (ev, f) => {
      if (f === path.basename(PROFILES_FILE)) onProfilesChange();
    });
  } catch {}
  try { fs.watch(MEDIA_DIR, onFsChange); } catch {}
  for (const d of LIBRARY_SUBDIRS) {
    try { fs.watch(path.join(LIBRARY_DIR, d), onFsChange); } catch {}
  }
}

/* ── Helpers ── */
/* An exported file's name keeps Chinese (Delivery.fileSafeName); other names stay as safeName makes them. */
function exportName(name) { return Delivery.fileSafeName(String(name || ""), "export"); }
function safeName(name) {
  return name.replace(/[^\w.\- ()\[\]]+/g, "_").slice(0, 120) || "file";
}
function sendJSON(res, code, obj) {
  const req = res.req;
  if (req && req.tooLarge) {
    code = 413; obj = { error: "request body too large", code: "BODY_TOO_LARGE", limit: req.bodyLimit || MAX_BODY };
    // answer once the rest of the body has been read (and dropped): closing earlier resets the connection while the
    // client is still sending, and it never sees the 413
    if (!req.complete) { req.resume(); if (!req.tooLargeAnswer) { req.tooLargeAnswer = true; req.once("end", () => sendJSON(res, code, obj)); } return; }
  }
  const body = JSON.stringify(obj);
  res.writeHead(code, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(body);
}
/** Writes a request body straight to a file as it arrives (uploads, the export audio), instead of holding it in memory
 *  like readBody: a multi-GB recording used to cost the server about twice its size (Deja, 2026-11-03: a server.js that
 *  ran 9 hours held 54 GB). Resolves with the byte count; on a dropped request or a write error the file is removed. */
function bodyToFile(req, file) {
  let bytes = 0;
  req.on("data", (c) => { bytes += c.length; });
  return stream.promises.pipeline(req, fs.createWriteStream(file, { flags: "wx" })).then(() => bytes, (e) => {
    try { fs.rmSync(file, { force: true }); } catch {}
    throw e;
  });
}
/* Request bodies held in memory (readBody) are limited (QQ/Deja after #67: one large POST to a small JSON route could take
   the server's memory with it). 1 MB, except the routes that really carry more. Uploads and the export audio stream to
   disk instead (bodyToFile) and have no such limit. */
const MAX_BODY = 1024 * 1024;
const BODY_LIMITS = {
  "PUT /api/project": 64 * 1048576,              // the project document
  "POST /api/projects": 128 * 1048576,           // an imported project or backup, with its versions
  "POST /api/transcript": 16 * 1048576,          // the words of a long recording
  "PUT /api/ui/undo-stack": 64 * 1048576,        // up to 100 undo + redo snapshots of the timeline
  "POST /api/export/frame": 8192 * 8192 * 4 + MAX_BODY, // one raw RGBA frame of the largest canvas (with what came before it)
};
const STREAMED = new Set(["POST /api/upload", "POST /api/export/audio"]); // bodyToFile: straight to disk
const bodyLimit = (req, p) => (STREAMED.has(req.method + " " + p) ? Infinity : BODY_LIMITS[req.method + " " + p] || MAX_BODY);
/** Refused for size: 413 with code BODY_TOO_LARGE. sendJSON gives that answer for a request marked tooLarge, whatever the
 *  route's own catch asked for, so every caller of readBody answers 413 without its own handling. */
function readBody(req) {
  const limit = req.bodyLimit || MAX_BODY;
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      if (req.tooLarge) return;                 // drained, not kept
      size += c.length;
      if (size > limit) { req.tooLarge = true; chunks.length = 0; reject(Object.assign(new Error("request body too large"), { code: "BODY_TOO_LARGE" })); return; }
      chunks.push(c);
    });
    req.on("end", () => { if (!req.tooLarge) resolve(Buffer.concat(chunks)); });
    req.on("error", reject);
  });
}
/** Claim final + sibling `.part` paths with exclusive create (`wx`) so concurrent
 *  exports cannot pick the same free name before either file exists. */
function reserveExportPaths(dir, baseName, ext) {
  const base = baseName.replace(/\.(mp4|mov|m4v|mkv|webm)$/i, "");
  let i = 0;
  for (;;) {
    const stem = i === 0 ? base : `${base}_${i}`;
    i++;
    const outPath = path.join(dir, stem + ext);
    const partPath = path.join(dir, stem + ".part" + ext);
    if (fs.existsSync(outPath)) continue;
    try {
      fs.closeSync(fs.openSync(partPath, "wx")); // exclusive create — claim the name
    } catch (e) {
      if (e.code === "EEXIST") continue;
      throw e;
    }
    if (fs.existsSync(outPath)) {
      try { fs.rmSync(partPath, { force: true }); } catch { }
      continue;
    }
    return { outPath, partPath };
  }
}
/* #321: a quick sample is written to previews/, under its own name (preview_<id>), and never overwrites a file.
   #325 (QQ, Rea): only what this exporter registered is ever removed — not files that merely look like a sample.
   preview-store.js keeps the registry (finished samples with their size and mtime; fablecut-* work folders and .part
   files while they are written). Pruned before a sample starts and again after it is saved, so at most PREVIEW_KEEP stay
   and none older than a day; a crash leftover goes after an hour. */
const PREVIEW_KEEP = 20, PREVIEW_MAX_AGE_MS = 24 * 3600 * 1000, PREVIEW_WORKDIR_MS = 3600 * 1000;
/* #325 R1b: a sample is a quick look — at most this many seconds (Deja may change it) */
const PREVIEW_MAX_SEC = 30;
const previewStore = createPreviewStore(PREVIEWS_DIR, { keep: PREVIEW_KEEP, maxAgeMs: PREVIEW_MAX_AGE_MS, workMs: PREVIEW_WORKDIR_MS });
/** Work folders and .part files that running sample exports still use: never pruned. */
function livePreviewNames() {
  const live = new Set();
  for (const s of exportSessions.values()) {
    if (!s.preview) continue;
    if (s.dir) live.add(path.basename(s.dir));
    if (s.partPath) live.add(path.basename(s.partPath));
    for (const o of s.outputs || []) if (o.partPath) live.add(path.basename(o.partPath));
  }
  return live;
}
function prunePreviews() {
  try { previewStore.prune({ live: livePreviewNames() }); } catch (e) { console.error("preview cleanup:", X.maskUserPath(String(e.message || e))); }
}
/** Registers what a sample export has just created in previews/ (its work folder, its .part files). */
function registerPreviewWork(dir, parts) {
  previewStore.addWork(path.basename(dir), "dir");
  for (const p of parts) if (p) previewStore.addWork(path.basename(p), "file");
}
/** A sample has been saved under its own name: record it as ours, then keep the newest PREVIEW_KEEP. */
function registerPreviewFile(outPath, partPath) {
  try { previewStore.addFile(path.basename(outPath), { replaces: partPath ? path.basename(partPath) : null }); }
  catch (e) { console.error("preview registry:", X.maskUserPath(String(e.message || e))); }
  prunePreviews();
}
const exportSrc = (sess, file) => (sess.preview ? "/previews/" : "/exports/") + encodeURIComponent(file);
function run(cmd, args) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { maxBuffer: 1 << 24 }, (err, _out, stderr) =>
      err ? reject(new Error((stderr || String(err)).slice(-800))) : resolve());
  });
}

/** A "/media/…" or "/library/…" src → an existing file inside that root, or null.
 *  Every src-accepting endpoint resolves through here: basename alone is not
 *  enough (library has subfolders) and a bare join is a traversal hole. */
function resolveSrc(src) {
  const p = decodeURIComponent(String(src || "").split("?")[0]);
  const [root, rel] = p.startsWith("/media/") ? [MEDIA_DIR, p.slice(7)]
    : p.startsWith("/library/") ? [LIBRARY_DIR, p.slice(9)] : [null, null];
  if (!root || !rel) return null;
  const file = path.normalize(path.join(root, rel));
  if (!file.startsWith(path.normalize(root + path.sep))) return null;
  try { return fs.statSync(file).isFile() ? file : null; } catch { return null; }
}

/** An explicit absolute/relative path argument → an existing file, or null.
 *  Used by /api/frame only. This deliberately reaches outside media/ and
 *  library/: looking at a clip must not require putting it in the project
 *  folder. The caller is the local MCP server or the user's own fetch, both
 *  already able to read any file the user can — and unlike resolveSrc() it
 *  never turns a request string into a path *inside* a served root, so there
 *  is no traversal to defend. It is deliberately NOT how a src is resolved. */
function resolvePathArg(p) {
  if (!p || typeof p !== "string") return null;
  let file = path.resolve(p);
  try { return fs.statSync(file).isFile() ? file : null; } catch { return null; }
}

/* Remux MP4-family uploads with `+faststart` so the moov atom leads the file —
   without it <video> stalls for seconds probing over Range requests. */
function faststart(file, opts) { return maybeFaststart(file, opts); }

/* ── Export sessions ──
   Two modes share the same HTTP session API:
     jpeg   — browser streams JPEGs (one POST may concatenate several);
              ffmpeg encodes via an encoding profile (Fast)
     annexb — browser streams Annex-B H.264 (one POST may concatenate several AUs);
              ffmpeg stream-copies (WebCodecs)
   Both spawn on the FIRST frame, not here: the audio mix is uploaded between
   /begin and the first frame, and a one-pass encode needs it on disk. */
const exportSessions = new Map();
/* Container + bitstream BT.709/tv for the WebCodecs (annexb) path.
   `-c copy` alone drops the colr atom; the bsf writes VUI so players see
   primaries/transfer, not "unknown". JPEG Fast export uses profile.color instead. */
const COLOR_TAGS = [
  "-colorspace", "bt709", "-color_primaries", "bt709",
  "-color_trc", "bt709", "-color_range", "tv",
];
const COLOR_BSF = "h264_metadata=colour_primaries=1:transfer_characteristics=1:matrix_coefficients=1:video_full_range_flag=0";
const EXPORT_IDLE_MS = 10 * 60 * 1000; // abandon sessions with no successful activity
/* #302 follow-up: a host that destroys the whole editor view gives the page no pagehide, but its SSE connection closes.
   Sessions begun by that editor are cleaned after this grace, unless the same Cindy task reconnects first. */
const EXPORT_OWNER_GRACE_MS = +process.env.MONTCLIP_OWNER_GRACE_MS > 0 ? +process.env.MONTCLIP_OWNER_GRACE_MS : 15 * 1000;   // tests shorten it
const EXPORT_SWEEP_MS = 60 * 1000;
let exportSweepTimer = null;
function touchExport(sess) {
  if (sess) sess.lastTouch = Date.now();
}
function attachProc(sess, proc) {
  sess.proc = proc;
  sess.stderr = "";
  proc.stderr.on("data", (d) => { sess.stderr = (sess.stderr + d).slice(-2000); });
  proc.stdin.on("error", () => {}); // EPIPE if ffmpeg dies mid-stream
  sess.done = new Promise((res) => proc.on("close", res));
}
/* Delivery presets (delivery.js) — structured settings instead of raw args.
   Which encoders exist: `ffmpeg -encoders`, and for the hardware ones a 2-frame
   test encode, because a build lists h264_nvenc / _qsv / _amf whether or not
   this machine has the GPU. Asked once, in the background, on first use. */
/** What the page's FFmpeg card shows (ffmpeg-card.js): one of ready · missing · noProbe · noH264, the same answer in
 *  every run mode. No paths: only where each tool came from. */
async function ffmpegStatus() {
  const probe = FF.status().ffprobe, found = FF.status().ffmpeg, tooOld = !HAS_FFMPEG && !!found.tooOld;
  const h264 = HAS_FFMPEG ? Delivery.encodersFor("h264", await deliveryEncoders()) : [];
  // tooOld: the FFmpeg named in MONTCLIP_FFMPEG, or found with no bundled build, fails the gate (ffmpeg-path.js): FFMPEG_TOO_OLD
  const state = HAS_FFMPEG ? (probe.ok ? (h264.length ? "ready" : "noH264") : "noProbe") : tooOld ? "tooOld" : "missing";
  return { state, platform: process.platform, setup: externalFfmpeg.setup, picker: false,
    ffmpeg: { ok: HAS_FFMPEG, source: FF.source("ffmpeg"), ...(tooOld ? { code: "FFMPEG_TOO_OLD", version: found.version || null, why: found.why || "options" } : {}) }, ffprobe: { ok: probe.ok, source: probe.source }, encoder: h264[0] || null };
}
/** 「重新检测」: look again, forget the encoder list, answer the new state. */
async function redetectFfmpeg() {
  detectFfmpeg();   // encodersOf() probes again only a program it hasn't seen (path, size, time)
  return ffmpegStatus();
}
function runFfmpeg(args, timeout = 15000, bin = FF.path("ffmpeg")) {
  return new Promise((resolve) => {
    execFile(bin, args, { timeout, maxBuffer: 8 * 1024 * 1024, windowsHide: true },
      (err, stdout, stderr) => resolve({ code: err ? (err.code ?? 1) : 0, stdout: String(stdout || ""), stderr: String(stderr || "") }));
  });
}
/** Encoders an export may use: the picked program's own (libx264 included when it has it), plus libx264 from the
 *  user's x264 choice / MONTCLIP_EXTERNAL_FFMPEG while that checks out. */
async function deliveryEncoders() {
  if (!HAS_FFMPEG) return new Set();
  const own = await bundledEncoders();
  return externalFfmpeg.available(own, { ownX264: own.has("libx264") });
}
/** The general program's encoders: the bundled build (or, with none, the FFmpeg used for everything). */
function bundledEncoders() { return encodersOf(FF.path("ffmpeg")); }
/* One program's usable encoders: `ffmpeg -encoders`, and for the hardware ones a 2-frame test encode, because a build
   lists h264_nvenc / _qsv / _amf whether or not this machine has the GPU. Kept per program (path, size, time), so
   「重新检测」 with the same programs answers at once and a new one is probed. */
const encoderCache = new Map();
function encodersOf(bin) {
  let key = bin;
  try { const st = fs.statSync(bin); key += `|${st.size}|${st.mtimeMs}`; } catch { }
  if (encoderCache.has(key)) return encoderCache.get(key);
  const p = (async () => {
    let listed = Delivery.parseEncoders((await runFfmpeg(["-hide_banner", "-encoders"], 15000, bin)).stdout);
    // test/export-h264-precheck.test.js: a computer whose bundled build has no H.264 encoder (Linux with the LGPL build,
    // no graphics card). Only the bundled program: a local FFmpeg keeps its libx264 (proxies probe it here too).
    if (process.env.MONTCLIP_TEST_NO_H264 === "1" && bin === FF.path("ffmpeg")) listed = new Set([...listed].filter((e) => !Delivery.encodersFor("h264", new Set([e])).length));
    const usable = new Set([...listed].filter((e) => !Delivery.ENCODERS[e]?.hw));
    await Promise.all([...listed].filter((e) => Delivery.ENCODERS[e]?.hw).map(async (e) => {
      const r = await runFfmpeg(["-hide_banner", "-v", "error", "-f", "lavfi", "-i", "color=c=black:s=256x144:r=30:d=0.1",
        "-frames:v", "2", "-c:v", e, "-pix_fmt", Delivery.ENCODERS[e].hw === "nvenc" ? "yuv420p" : "nv12", "-f", "null", "-"], 15000, bin);
      if (r.code === 0) usable.add(e);
    }));
    return usable;
  })();
  encoderCache.set(key, p);
  return p;
}
/** Windows has Media Foundation (missing on "N" editions without the Media Feature Pack). */
const hasMediaFoundation = () => process.platform !== "win32" ||
  fs.existsSync(path.join(process.env.SystemRoot || "C:/Windows", "System32", "mfplat.dll"));
/** What the no-encoder reason may point at: Settings on the desktop, MONTCLIP_EXTERNAL_FFMPEG in web / server mode. */
function noH264Where() { return { mediaFoundation: hasMediaFoundation(), setup: externalFfmpeg.setup }; }
/** The program that encodes an export: the user's local FFmpeg only for libx264, else the bundled one. */
async function exportBinary(useX264) {
  if (!useX264) return FF.path("ffmpeg");
  const ext = await externalFfmpeg.current();
  if (ext.ok) return ext.path;
  if ((await bundledEncoders()).has("libx264")) return FF.path("ffmpeg");   // no bundled build: the full FFmpeg used for everything
  const setup = externalFfmpeg.setup, how = {
    settings: "choose it in Settings",
    server: "start the MontClip server with MONTCLIP_EXTERNAL_FFMPEG set to its full path",
    plugin: "in Cindy, name it for MontClip to use",
  }[setup] || "choose it in Settings";
  throw Object.assign(new Error(ext.reason === "none"
    ? `libx264 is only available from your own FFmpeg: ${how}, or use a delivery preset (MontClip then uses the graphics card or Windows' own H.264 encoder).`
    : "Your local FFmpeg cannot be used: " + X.maskUserPath(ext.reason)),
  { status: 400, code: ext.reason === "none" ? "extNeeded" : ext.code, ...(setup !== "settings" ? { setup } : {}) });
}
/** No H.264 encoder at all (bundled, graphics card or the user's x264): the refusal, before anything renders (ADR 2026-11-02, 3). */
async function noH264Error() {
  if (Delivery.encodersFor("h264", await deliveryEncoders()).length) return null;
  return Object.assign(new Error(X.noH264Reason(noH264Where())), { status: 400, ...X.noH264(noH264Where()) });
}
/** What H.264 export will use here, for the export dialog and agents. */
async function h264Status() {
  const available = await deliveryEncoders();
  const list = Delivery.encodersFor("h264", available);
  const ext = await externalFfmpeg.current();
  return { encoder: list[0] || null, encoders: list, setup: externalFfmpeg.setup,
    external: ext.ok ? { ok: true, source: ext.source } : { ok: false, code: ext.code },
    reason: list.length ? null : X.noH264(noH264Where()) };
}
/** Saved delivery presets: library/delivery/<id>.json, each a spec plus a label. */
function savedDeliveryPresets() { return Delivery.savedPresets(readSaved("delivery")); }
/* One render, several files: `deliveries:[{delivery, name}, …]` (up to 8) or a
   single `delivery` + name. Every output gets its own ffmpeg, fed the same
   frames; the browser renders each frame once. Frames are raw RGBA when any
   output needs more than 4:2:0 8-bit, else JPEG at the highest quality asked. */
const MAX_OUTPUTS = 8;
async function beginDeliveryExport(rate, name, hasAudio, extra) {
  const available = await deliveryEncoders();
  const presets = savedDeliveryPresets();
  const list = Array.isArray(extra.deliveries) ? extra.deliveries : [{ delivery: extra.delivery, name }];
  if (!list.length) throw new Error("deliveries is empty");
  if (list.length > MAX_OUTPUTS) throw new Error(`at most ${MAX_OUTPUTS} outputs per render`);
  const canvasW = extra.canvasW | 0, canvasH = extra.canvasH | 0;
  if (canvasW < 2 || canvasH < 2 || canvasW > 16384 || canvasH > 16384) throw new Error("export width/height required (canvasW, canvasH)");
  const r = extra.region;
  const region = r && typeof r === "object" && [r.x, r.y, r.w, r.h].every(Number.isFinite) && r.w > 0 && r.h > 0 &&
    r.x >= 0 && r.y >= 0 && r.x + r.w <= canvasW + 0.5 && r.y + r.h <= canvasH + 0.5 ? r : null;
  const outs = list.map((d) => {
    const input = d && d.delivery !== undefined ? d.delivery : d;
    let avail = available, { spec, notes } = Delivery.normalize(input, { available: avail, presets });
    let frame = Delivery.reframe(spec, canvasW, canvasH, region);
    // an encoder with a minimum frame size (NVENC) gives way when the picture comes out smaller
    for (let min; (min = Delivery.ENCODERS[spec.video.encoder]?.min) && (frame.outW < min[0] || frame.outH < min[1]);) {
      avail = new Set([...avail].filter((e) => e !== spec.video.encoder));
      ({ spec, notes } = Delivery.normalize(input, { available: avail, presets }));
      frame = Delivery.reframe(spec, canvasW, canvasH, region);
    }
    if (avail !== available && !avail.has(spec.video.encoder))
      throw Object.assign(new Error(`The exported picture (${frame.outW}×${frame.outH}) is smaller than this computer's H.264 encoder accepts (${[...available].filter((e) => Delivery.ENCODERS[e]?.min).map((e) => Delivery.ENCODERS[e].label + " needs " + Delivery.ENCODERS[e].min.join("×")).join(", ")}). Export a larger size, or choose another format.`), { status: 400, code: "frameTooSmall",
        // n: the smallest side the page names (JJ: one number for width and height): the largest minimum of the encoders refused
        params: { w: frame.outW, h: frame.outH, n: Math.max(...[...available].map((e) => Delivery.ENCODERS[e]?.min || []).flat()) } });
    return { spec, notes, noteCodes: [], name: d && typeof d.name === "string" ? d.name : name, frame };
  });
  // one render has one frame rate: an output asking for another needs a render of its own
  const off = outs.map((o, i) => [o, i]).filter(([o]) => o.spec.fps != null && Math.abs(o.spec.fps - rate) > 0.01);
  if (off.length) throw new Error(off.map(([o, i]) => `output ${i + 1} asks for ${o.spec.fps} fps but this render is ${rate} fps`).join("; ") + " — render each frame rate separately");
  const input = outs.some((o) => Delivery.frameInput(o.spec) === "rgba") ? "rgba" : "jpeg";
  // H.264 with no encoder at all: say why now, not after the render
  const noH264 = outs.some((o) => o.spec.video.codec === "h264") && await noH264Error();
  if (noH264) throw noH264;
  const ext = await externalFfmpeg.current();
  for (const o of outs) {
    o.binary = await exportBinary(X.isExternalJob(o.spec));
    if (o.spec.video.codec === "h264" && !X.isExternalJob(o.spec) && ext.reason !== "none" && !ext.ok) {
      o.notes.push("Your local FFmpeg is not used (" + X.maskUserPath(ext.reason) + ") — using " + (Delivery.ENCODERS[o.spec.video.encoder]?.label || o.spec.video.encoder));
      o.noteCodes.push({ code: "extNotUsedNote", params: { reason: ext.code, encoder: o.spec.video.encoder } });
    }
  }
  // check every output on a 0.1 s synthetic canvas before the browser renders anything
  const dryDir = fs.mkdtempSync(path.join(os.tmpdir(), "fablecut-dry-"));
  try {
    const dry = await Promise.all(outs.map((o, i) => runFfmpeg(Delivery.ffmpegArgs(o.spec, { fps: rate, input, canvasW, canvasH, frame: o.frame,
      hasAudio, dry: true, outPath: path.join(dryDir, `probe${i}` + Delivery.CONTAINERS[o.spec.container].ext) }), 30000, o.binary)));
    const bad = dry.map((d, i) => [d, outs[i]]).filter(([d]) => d.code !== 0);
    if (bad.length) {
      throw new Error(bad.map(([d, o]) => {
        const why = d.stderr.trim().split("\n").filter(Boolean).slice(-3).map((l) => l.trim()).join(" · ");
        return `ffmpeg rejected these settings (${Delivery.describe(o.spec)}): ${X.maskUserPath(why) || "exit " + d.code}`;
      }).join("\n"));
    }
  } finally { try { fs.rmSync(dryDir, { recursive: true, force: true }); } catch {} }
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const outDir = extra.preview ? PREVIEWS_DIR : EXPORTS_DIR;
  if (extra.preview) prunePreviews();
  const dir = fs.mkdtempSync(path.join(outDir, "fablecut-"));
  if (extra.preview) registerPreviewWork(dir, []);
  const duration = Number.isFinite(+extra.duration) && +extra.duration > 0 ? +extra.duration : null;
  for (const o of outs) {
    const ext = Delivery.CONTAINERS[o.spec.container].ext;
    Object.assign(o, reserveExportPaths(outDir, exportName(extra.preview ? "preview_" + id : o.name || "export"), ext), { proc: null, stderr: "", done: null, failed: null });
    if (extra.preview) registerPreviewWork(dir, [o.partPath]);
    o.err = () => o.stderr.trim().split("\n").filter(Boolean).slice(-3).map((l) => l.trim()).join(" · ");
  }
  const sess = {
    mode: "jpeg", proc: null, fps: rate, outputs: outs, input, canvasW, canvasH, duration,
    hasAudio: !!hasAudio, panIntent: !!extra.panIntent, preview: !!extra.preview, dir, wav: null, partPath: null, outPath: null,
    stderr: "", done: null, lastTouch: Date.now(), err: () => "",
  };
  sess.writeLock = Promise.resolve();
  exportSessions.set(id, sess);
  const jpegQuality = Math.max(...outs.map((o) => Delivery.jpegQuality(o.spec)));
  const view = outs.map((o) => ({ file: path.basename(o.outPath), spec: o.spec, notes: o.notes, noteCodes: o.noteCodes, summary: Delivery.describe(o.spec), size: { w: o.frame.outW, h: o.frame.outH } }));
  // the single-output fields stay as they were for one delivery
  return { id, mode: "jpeg", input, jpegQuality, outputs: view, ...view[0] };
}
/** Integrated loudness and true peak of a file's first audio stream (ffmpeg ebur128). */
async function measureLoudness(file, timeout = 10 * 60 * 1000) {
  const r = await runFfmpeg(Delivery.LOUDNESS_ARGS(file), timeout);   // the bundled build (ADR 2026-11-05 supplement)
  return r.code === 0 ? Delivery.parseEbur128(r.stderr) : null;
}
/** Each channel's level (dB) of a file's first audio stream, or null. */
async function measureChannelLevels(file, timeout = 10 * 60 * 1000) {
  const r = await runFfmpeg(Delivery.CHANNEL_LEVEL_ARGS(file), timeout);
  return r.code === 0 ? Delivery.parseChannelLevels(r.stderr) : null;
}
function ffprobeJSON(file) {
  return new Promise((resolve) => {
    execFile(FF.path("ffprobe"), ["-v", "error", "-show_streams", "-show_format", "-of", "json", file], { timeout: 60000, maxBuffer: 8 * 1024 * 1024, windowsHide: true },
      (err, stdout) => { try { resolve(err ? null : JSON.parse(stdout)); } catch { resolve(null); } });
  });
}
/** Check a finished output against its spec: size, frames, fps, codecs, length, loudness, file size. */
const VERIFY_LOUDNESS_MS = 120 * 1000;   // the file is already saved; a long re-measure must not hold the reply
async function verifyDeliveryOutput(sess, o, file) {
  const failed = (text) => ({ ok: false, checks: [{ ok: false, text }], line: "⚠ " + text });
  try {
    const loudWanted = o.spec.audio.codec !== "none" && !!sess.wav;
    const [probe, loud, channelLevels] = await Promise.all([ffprobeJSON(file), loudWanted ? measureLoudness(file, VERIFY_LOUDNESS_MS) : null,
      loudWanted && o.spec.audio.channels === 2 ? measureChannelLevels(file, VERIFY_LOUDNESS_MS) : null]);
    o.loud = loud;   // the self-check reads its silence (blankCheck)
    if (!probe) return failed("could not read the file back to check it (ffprobe)");
    let size = 0;
    try { size = fs.statSync(file).size; } catch {}
    return Delivery.verify(o.spec, probe, {
      fps: sess.fps, frames: sess.frames || (sess.duration ? Math.round(sess.duration * sess.fps) : null), duration: sess.duration,
      size, loud, loudWanted, frame: o.frame, hasAudio: !!sess.wav, channelLevels, panIntent: sess.panIntent,
    });
  } catch (e) { return failed("could not check the file: " + (e.message || e)); }
}
/** The self-check of a finished file (export-check.js): null when it may be called done, else {code, error, check}.
 *  `loud`: the file's measured loudness (a delivery report), when there is one; `soundless`: the output was asked to
 *  have no sound (a delivery with audio codec none), so its silence is not checked. */
async function blankCheck(sess, file, loud, soundless = false) {
  const plan = sess.check && (soundless ? { ...sess.check, audio: [], silent: [] } : sess.check);
  if (!plan || (!plan.video.length && !plan.audio.length && !plan.silent.length)) return null;
  try {
    const r = await ExportCheck.check({ ffmpeg: FF.path("ffmpeg"), file, plan, resolve: resolveSrc,
      silent: !sess.wav ? true : loud ? !!loud.silent : null, mix: sess.wav,
      // tests (and nothing else) shorten the time one read may take, to stand in for a slow disk
      ...(+process.env.MONTCLIP_EXPORT_CHECK_TIMEOUT_MS > 0 ? { timeoutMs: +process.env.MONTCLIP_EXPORT_CHECK_TIMEOUT_MS } : {}) });
    if (process.env.MONTCLIP_EXPORT_CHECK_LOG) console.log("[export-check] " + JSON.stringify(r));
    sess.quiet = r.quiet;   // pieces silent in their files too: a warning in the report (ExportCheck.withQuiet)
    sess.unchecked = r.unchecked;   // pieces whose file took too long to read: the file is kept, with a warning
    return r.ok ? null : { code: ExportCheck.failCode(r), params: ExportCheck.failParams(r), error: ExportCheck.failText(r), check: r };
  } catch { return null; }   // a check that cannot run never fails an export
}
/** Spawn one ffmpeg per output of a delivery session. */
function startDeliveryEncoders(sess) {
  for (const o of sess.outputs) {
    const proc = spawn(o.binary || FF.path("ffmpeg"), Delivery.ffmpegArgs(o.spec, {
      fps: sess.fps, input: sess.input, canvasW: sess.canvasW, canvasH: sess.canvasH, frame: o.frame,
      wavPath: sess.wav, outPath: o.partPath, duration: sess.duration, loudnorm: o.loudnorm,
    }), { stdio: ["pipe", "ignore", "pipe"] });
    proc.stderr.on("data", (d) => { o.stderr = (o.stderr + d).slice(-2000); });
    proc.stdin.on("error", () => { });
    o.proc = proc;
    o.done = new Promise((res) => proc.on("close", res));
  }
  sess.proc = sess.outputs[0].proc; // "started"
}
/** The same frames to every output still running. One that fails is marked and
 *  left behind; the render goes on for the rest, and fails only when none is left. */
async function writeDeliveryFrame(sess, body) {
  const live = sess.outputs.filter((o) => !o.failed);
  await Promise.all(live.map((o) => writeExportFrame(o, body).catch((e) => { o.failed = String(e.message || e); })));
  if (!sess.outputs.some((o) => !o.failed))
    throw new Error(sess.outputs.map((o) => `${path.basename(o.outPath)}: ${o.failed}`).join(" · "));
}
async function beginExport(fps, name, profileId, hasAudio, mode, extra = {}) {
  const m = mode === "annexb" ? "annexb" : "jpeg";
  const rate = Number(fps);
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error("export fps required (pass project.fps)");
  }
  const pixelFormat = extra.pixelFormat === "rgba" ? "rgba" : "jpeg";
  const width = Math.max(0, extra.width | 0);
  const height = Math.max(0, extra.height | 0);
  if (pixelFormat === "rgba" && (width < 2 || height < 2)) {
    throw new Error("export width/height required for rgba");
  }
  if (m === "jpeg" && (extra.delivery || extra.deliveries)) return beginDeliveryExport(rate, name, hasAudio, extra);
  if (m === "jpeg") {
    const rawProfile = resolveProfile(profileId);
    if (proresProjectEnd(rawProfile, { fps: rate, frames: extra.frames, pixelFormat }))
      proresFilterPlan(rawProfile.args, !!hasAudio);
  }
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const safe = exportName(extra.preview ? "preview_" + id : name || "export");
  const outDir = extra.preview ? PREVIEWS_DIR : EXPORTS_DIR;
  if (extra.preview) prunePreviews();
  // Same filesystem as the finished file so renameSync(partPath, out) cannot EXDEV.
  const dir = fs.mkdtempSync(path.join(outDir, "fablecut-"));
  if (extra.preview) registerPreviewWork(dir, []);

  if (m === "annexb") {
    const { outPath, partPath } = reserveExportPaths(outDir, safe, ".mp4");
    if (extra.preview) registerPreviewWork(dir, [partPath]);
    const sess = {
      mode: m, fps: rate, proc: null, dir,
      name: safe, hasAudio: !!hasAudio, preview: !!extra.preview,
      wav: null, partPath, outPath,
      stderr: "", done: null, lastTouch: Date.now(),
      err: () => sess.stderr.trim().split("\n").filter(Boolean).slice(-3)
        .map((l) => l.trim()).join(" · "),
    };
    sess.writeLock = Promise.resolve();
    exportSessions.set(id, sess);
    return { id, mode: m };
  }

  const profile = resolveProfile(profileId);
  const never = Delivery.forbiddenEncoder(profile.args);
  if (never) throw Object.assign(new Error(`profile "${profile.id}" encodes with ${never}, which MontClip never uses`), { status: 400 });
  // a raw H.264 profile on a computer with no H.264 encoder at all: say why, not "choose your own FFmpeg" for x264 alone
  const noH264 = X.argsUseH264(profile.args) && await noH264Error();
  if (noH264) throw noH264;
  // a raw profile that encodes with libx264 needs the user's local FFmpeg
  const binary = await exportBinary(X.argsUseX264(profile.args));
  const dry = await dryRunProfile(profile, { fps: rate, hasAudio, bin: binary });
  if (!dry.ok) throw new Error(`profile "${profile.id}" was rejected by ffmpeg: ${X.maskUserPath(dry.error)}`);
  // Reserve the output name now (not at first frame) so concurrent exports
  // cannot both see the same free path. The empty .part file is overwritten by ffmpeg (-y).
  const { outPath, partPath } = reserveExportPaths(outDir, safe, profile.extension);
  if (extra.preview) registerPreviewWork(dir, [partPath]);
  const sess = {
    mode: m, proc: null, fps: rate, profile, name: safe, hasAudio: !!hasAudio, preview: !!extra.preview, binary,
    pixelFormat, width, height, frames: extra.frames,
    dir, wav: null, partPath, outPath,
    stderr: "", done: null, lastTouch: Date.now(),
    err: () => sess.stderr.trim().split("\n").filter(Boolean).slice(-3)
      .map((l) => l.trim()).join(" · "),
  };
  sess.writeLock = Promise.resolve();
  exportSessions.set(id, sess);
  return { id, mode: m, profile: profile.id, label: profile.label, summary: profileSummary(profile) };
}
/* Encode into the paths reserved at /begin; rename .part → final on clean exit
   so an aborted render never leaves something that looks like a finished file. */
function startEncoder(sess) {
  if (sess.outputs) return startDeliveryEncoders(sess);
  const args = buildExportArgs(sess.profile, {
    fps: sess.fps, frames: sess.frames, wavPath: sess.wav, outPath: sess.partPath,
    pixelFormat: sess.pixelFormat, width: sess.width, height: sess.height,
  });
  const proc = spawn(sess.binary || FF.path("ffmpeg"), args, { stdio: ["pipe", "ignore", "pipe"] });
  proc.stderr.on("data", (d) => { sess.stderr = (sess.stderr + d).slice(-2000); });
  // EPIPE on end()/late writes is normal once ffmpeg has exited; writeExportFrame
  // attaches its own error listener while a backpressured write is in flight.
  proc.stdin.on("error", () => { });
  sess.proc = proc;
  sess.done = new Promise((res) => proc.on("close", res));
  return proc;
}
/** Write one frame (JPEG or Annex-B NAL) to ffmpeg stdin. If the pipe is full,
 *  wait for drain — but also reject if ffmpeg exits or the stdin errors, so the
 *  HTTP request cannot hang forever after a failed encode. */
function writeExportFrame(sess, body) {
  const proc = sess.proc;
  return new Promise((resolve, reject) => {
    if (!proc || proc.exitCode !== null || proc.killed)
      return reject(new Error("ffmpeg exited: " + sess.err()));

    let settled = false;
    const finish = (fn, arg) => {
      if (settled) return;
      settled = true;
      proc.off("close", onClose);
      proc.stdin.off("error", onErr);
      proc.stdin.off("drain", onDrain);
      fn(arg);
    };
    const onClose = () => finish(reject, new Error("ffmpeg exited: " + (sess.err() || "closed")));
    const onErr = (e) => finish(reject, new Error(e?.message || "ffmpeg stdin error"));
    const onDrain = () => finish(resolve);

    proc.once("close", onClose);
    proc.stdin.once("error", onErr);
    let ok;
    try { ok = proc.stdin.write(body); }
    catch (e) { return finish(reject, e); }
    if (proc.exitCode !== null)
      return finish(reject, new Error("ffmpeg exited: " + sess.err()));
    if (ok) finish(resolve);
    else proc.stdin.once("drain", onDrain);
  });
}
/* One-pass mux for WebCodecs: H.264 elementary stream on stdin + optional WAV.
   Use input `-r` (not only `-framerate`): HW encoders stamp AUs with µs-rounded
   durations (e.g. 33333µs ≈ 1/30), which otherwise become avg_frame_rate
   1000000/33333. `-r` forces CFR PTS so the MP4 matches project.fps exactly. */
function startAnnexbEncoder(sess) {
  const fps = sess.fps;
  const args = [
    "-y", "-hide_banner",
    "-fflags", "+genpts",
    "-f", "h264", "-r", String(fps), "-i", "pipe:0",
  ];
  if (sess.wav) args.push("-i", sess.wav);
  args.push("-map", "0:v:0", "-c:v", "copy", "-bsf:v", COLOR_BSF, ...COLOR_TAGS);
  // do not use -shortest: with unset/generated PTS it drops the audio track
  if (sess.wav) args.push("-map", "1:a:0", "-c:a", "aac", "-b:a", "192k");
  args.push("-movflags", "+faststart+write_colr", sess.partPath);
  attachProc(sess, spawn(FF.path("ffmpeg"), args, { stdio: ["pipe", "ignore", "pipe"] }));
  return sess.proc;
}
/* Stops a session's ffmpeg and deletes its half-finished files and fablecut-XXXX folder (export-cleanup.js: what
   ffmpeg still holds open is deleted once it has exited, for up to 5 s). shutdown() waits for these. */
const pendingCleanups = new Set();
/** Base names of the files /api/export/end put in exports/ while this server runs: the only ones
 *  /api/export/delete-unsaved may delete (the close prompt's 删掉它们并关闭). */
const exportedThisRun = new Set();
function cleanupExport(id) {
  const s = exportSessions.get(id);
  if (!s) return;
  s.discarded = true;   // a queued frame/audio write must not start ffmpeg after this
  exportSessions.delete(id);
  const job = ExportCleanup.stopSessions([s], { timeoutMs: 5000, log: logCleanupLeft });
  pendingCleanups.add(job); job.finally(() => { pendingCleanups.delete(job); if (s.preview) prunePreviews(); });   // #325: forget the work removed
}
/** Paths an export cleanup could not delete, kept in DATA_DIR/logs/export-cleanup.log (local only). */
function logCleanupLeft(left) {
  const line = left.map((p) => `${new Date().toISOString()} not removed: ${X.maskUserPath(p)}`).join("\n") + "\n";   // no user name (QQ)
  console.error(line.trim());
  try { fs.mkdirSync(path.join(DATA_DIR, "logs"), { recursive: true }); fs.appendFileSync(path.join(DATA_DIR, "logs", "export-cleanup.log"), line); } catch {}
}
const ownerCleanups = new Map();   // closed editor connection → {timer, task, tabId, conn}
function scheduleOwnerCleanup(conn, task, tabId) {
  if (!conn) return;
  const prev = ownerCleanups.get(conn); if (prev) clearTimeout(prev.timer);
  const record = { timer: null, task, tabId, conn };
  const check = () => {
    ownerCleanups.delete(conn);
    // the same Cindy tab reconnected inside the grace (same task + same tab id): its export stays
    const alive = task && (tabId
      ? [...sseClients].some((r) => r.montclipTask && r.montclipTask.session === task.session && r.montclipTabId === tabId)
      : editorsFor(task).length > 0);
    if (alive) return;
    // A closed event stream is not a gone page: a page that still pushed a frame inside the last grace keeps its export
    // (MontClip-Cindy#79: task switch / a dropped stream); it is asked again after another grace, so once the frames stop
    // the export is cleaned as before.
    let stillPushing = false;
    for (const [id, s] of [...exportSessions]) {
      if (!(s.ownerConn === conn || (task && s.ownerSession === task.session && s.ownerTabId === tabId))) continue;
      if (Date.now() - (s.lastFrameAt || 0) < EXPORT_OWNER_GRACE_MS) stillPushing = true;
      else cleanupExport(id);
    }
    if (stillPushing) arm();
  };
  const arm = () => {
    record.timer = setTimeout(check, EXPORT_OWNER_GRACE_MS);
    record.timer.unref?.();
    ownerCleanups.set(conn, record);
  };
  arm();
}
function sweepIdleExports() {
  const now = Date.now();
  for (const [id, s] of [...exportSessions]) {
    if (now - (s.lastTouch || 0) > EXPORT_IDLE_MS) cleanupExport(id);
  }
}
function startExportSweep() {
  if (exportSweepTimer) return;
  exportSweepTimer = setInterval(sweepIdleExports, EXPORT_SWEEP_MS);
}
function stopExportSweep() {
  if (!exportSweepTimer) return;
  clearInterval(exportSweepTimer);
  exportSweepTimer = null;
}

/* The files /api/export/end made since this server started, until the desktop app claims one (after its Save dialog
   saved it): only these may lose their copy in exports/ (QQ, 0a2c13b). */
const freshExports = new Set();

/* Agent-requested exports: handed to an open editor tab over SSE, or to a
   headless browser the server starts (export-jobs.js). */
const exportJobs = createExportJobs({
  allowHeadless: !DESKTOP,
  // embedded: a one-time ticket the page trades for the session cookie — the token itself stays off the command line
  url: (id) => `${DESKTOP ? serverOrigin() : `http://localhost:${boundPort}`}/?exportJob=${encodeURIComponent(id)}${embed ? "&token=" + embed.launchTicket() : ""}`,
  broadcast,
  editors: (task) => editorsFor(task).length,
  // a task's job is claimed only by an editor connection bound to that task (the connection id came over its own
  // stream); a headless page has its one-time launch ticket instead
  claimAllowed: (j, body) => !j.session || j.via === "headless" ||
    editorsFor(j).some((res) => typeof body.conn === "string" && sameSecret(body.conn, res.montclipConn)),
  activeProject: () => projects.peekActive(),
  editorConnected: (id) => [...sseClients].some((res) => res.montclipTabId === id),
  // a job that failed or was cancelled stops its encode now: ffmpeg and the half-finished file did wait for the
  // 10-minute idle sweep, while a retry was already writing the next file (P11, europa 2026-11-05)
  onEnd: (j) => { for (const [id, s] of [...exportSessions]) if (s.job === j.id) cleanupExport(id); },
  // an export is done when its file is in exports/ under its own name (the .part is renamed only after ffmpeg exits)
  finished: (src) => {
    let name = "";
    const sample = String(src).startsWith("/previews/");
    try { name = decodeURIComponent(String(src).split("?")[0].replace(/^\/(?:exports|previews)\//, "")); } catch { return false; }
    if (!name || name !== path.basename(name) || /\.part\.[^.]+$/i.test(name)) return false;
    try { return fs.statSync(path.join(sample ? PREVIEWS_DIR : EXPORTS_DIR, name)).isFile(); } catch { return false; }
  },
});

/* #321: checking a stretch of the timeline with the video bridge (review-service.js; the records are in reviews/, apart from
   project.json). Built when first used. */
let reviewSvc = null, reviewStoreInst = null;
function reviewStore() { return reviewStoreInst || (reviewStoreInst = require("./review-store").createReviewStore({ dir: REVIEWS_DIR })); }
const liveProject = () => { try { return JSON.parse(fs.readFileSync(PROJECT_FILE, "utf8").replace(/^﻿/, "")); } catch { return {}; } };
function reviews() {
  if (reviewSvc) return reviewSvc;
  /* prores422 is the one profile every build can encode: the x264 ones ("draft") need the user's own FFmpeg. The sample is heavy but
     short and is deleted as soon as it was sent or cancelled; what leaves is the compact copy video-bridge.js makes of it. */
  const sampleProfile = () => "prores422";
  reviewSvc = require("./review-service").createReviewService({
    store: reviewStore(), bridge: require("./video-bridge"), readProject: liveProject, activeProject: () => projects.peekActive(),
    /* the same checks as /api/export/request: an end past the timeline, or a sample over the preview limit, is refused with its reason */
    requestSample: ({ project, range, where, revision }) => {
      const bad = checkExportSpan({ project: liveProject(), range, preview: true, maxPreviewSec: PREVIEW_MAX_SEC });
      if (bad) throw Object.assign(new Error(bad.error), { status: 400, code: bad.errorCode });
      return exportJobs.request({ project, range, preview: true, profile: sampleProfile(), where, revision });
    },
    getJob: (id) => exportJobs.get(id), cancelJob: (id) => exportJobs.cancel(id),
    sampleFile: (src) => { const n = path.basename(decodeURIComponent(String(src).split("?")[0])); const f = path.join(PREVIEWS_DIR, n); try { return fs.statSync(f).isFile() ? f : null; } catch { return null; } },
    ffmpeg: () => FF.path("ffmpeg"), ffprobe: () => FF.path("ffprobe"),
    /* an agent sending on the streamer's behalf is OFF unless MONTCLIP_REVIEW_AGENT_SEND=1 (set only after QQ has verified the owner's authorisation) */
    agentSendEnabled: () => process.env.MONTCLIP_REVIEW_AGENT_SEND === "1",
    onChange: (r) => { try { broadcast("review", JSON.stringify({ id: r.id, state: r.state })); } catch { } },
  });
  return reviewSvc;
}
/* a request from an agent (the plugin worker, MCP) and not from the editor page: the page always sends Origin or Sec-Fetch-Site */
const isAgentReq = (req) => !!(embed && embed.worker(req)) || (!req.headers.origin && !req.headers["sec-fetch-site"]);

/* Static file with HTTP Range support (required for <video> seeking) */
function serveFile(req, res, filePath) {
  fs.stat(filePath, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); res.end("Not found"); return; }
    const ext = path.extname(filePath).toLowerCase();
    const type = MIME[ext] || "application/octet-stream";
    const extra = {};
    if (ext === ".svg") {
      extra["Content-Security-Policy"] = "sandbox; default-src 'none'; style-src 'unsafe-inline'";
      extra["X-Content-Type-Options"] = "nosniff";
    }
    const range = req.headers.range;
    if (range) {
      const m = /bytes=(\d*)-(\d*)/.exec(range);
      let start = m && m[1] ? parseInt(m[1]) : 0;
      let end = m && m[2] ? parseInt(m[2]) : st.size - 1;
      start = Math.min(start, st.size - 1); end = Math.min(end, st.size - 1);
      res.writeHead(206, {
        "Content-Type": type, "Accept-Ranges": "bytes",
        "Content-Range": `bytes ${start}-${end}/${st.size}`,
        "Content-Length": end - start + 1, ...extra,
      });
      stream.pipeline(fs.createReadStream(filePath, { start, end }), res, () => {});
    } else {
      res.writeHead(200, {
        "Content-Type": type, "Content-Length": st.size,
        "Accept-Ranges": "bytes", "Cache-Control": "no-cache", ...extra,
      });
      stream.pipeline(fs.createReadStream(filePath), res, () => {});
    }
  });
}

/* ── Server ── */
/* Every request's handler runs here: whatever it throws is answered (500, JSON) and logged, never left as an
   unhandled rejection that ends the process (P8: a missing speech manifest took the Cindy plugin's engine down). */
const server = http.createServer((req, res) => {
  handleRequest(req, res).catch((e) => {
    console.error("[montclip] request failed: " + req.method + " " + String(req.url).split("?")[0] + ": " + ((e && e.stack) || e));
    if (!res.headersSent) { try { sendJSON(res, 500, { code: "INTERNAL", error: String((e && e.message) || e) }); } catch { } }
    else { try { res.end(); } catch { } }
  });
});
async function handleRequest(req, res) {
  if (embed) {
    res.setHeader("Referrer-Policy", "no-referrer");  // embedded pages never pass their address on
    if (embed.bootstrap(req, res)) return;
  }
  if (!requestAllowed(req)) {
    sendJSON(res, 403, { error: "forbidden: request must come from this machine (bad Host or Origin header)" });
    return;
  }
  const url = new URL(req.url, "http://localhost");
  const p = decodeURIComponent(url.pathname);
  req.bodyLimit = bodyLimit(req, p);
  if (Number(req.headers["content-length"]) > req.bodyLimit) {
    req.tooLarge = true;                         // known too large before reading: refused, what arrives is dropped
    sendJSON(res, 413, {}); return;
  }
  // never serve dotfiles/dot-directories (.git, .gitignore, …)
  if (p.split(/[\\/]/).some((seg) => seg.startsWith("."))) { res.writeHead(403); res.end(); return; }

  /* API: project */
  if (p === "/api/project" && req.method === "GET") {
    // strip UTF-8 BOM some editors/PowerShell prepend, which breaks JSON.parse
    try {
      const doc = JSON.parse(fs.readFileSync(PROJECT_FILE, "utf8").replace(new RegExp("^\\uFEFF"), ""));
      // which project this is, once there are several: the editor resets undo when it changes
      const id = projects.peekActive();
      res.setHeader("X-FableCut-Projects", "1");
      if (id) res.setHeader("X-FableCut-Project", id);
      sendJSON(res, 200, doc);
    }
    catch (e) { sendJSON(res, 500, { error: String(e) }); }
    return;
  }

  /* API: projects — the dashboard. GET lists them (?archived=only|all) with the
     project templates; POST {action, …} creates, opens, duplicates, renames,
     archives, deletes, imports, and saves / deletes templates (projects.js).
     GET / PUT /api/projects/thumb?id= is a project's JPEG thumbnail. */
  if (p === "/api/projects" && req.method === "GET") {
    try {
      const archived = ["only", "all"].includes(url.searchParams.get("archived")) ? url.searchParams.get("archived") : "exclude";
      sendJSON(res, 200, projects.act({ action: "list", archived }));
    } catch (e) { sendJSON(res, 500, { error: e.message }); }
    return;
  }
  if (p === "/api/projects" && req.method === "POST") {
    let a;
    try { a = JSON.parse((await readBody(req)).toString("utf8") || "{}"); }
    catch { sendJSON(res, 400, { error: "body must be JSON {action, …}" }); return; }
    try {
      // a backup file (a project with its versions) imports through history.js
      const out = a.action === "import" && a.project?.fablecut === "backup" ? history.importBackup(a.project, a) : projects.act(a);
      if (a.action === "delete" && out.deleted) try { undoStacks.remove(String(out.id || a.id)); } catch { }   // its undo history goes too
      broadcast("projects", JSON.stringify({ action: a.action, id: out.id || a.id || null, active: projects.activeId() }));
      // opening, or renaming the open project, rewrites ./project.json: reload the tabs now, watcher or not
      if (out.from || ((a.action === "update" || a.action === "rename") && out.project?.active)) onFsChange();
      sendJSON(res, 200, out);
    } catch (e) { sendJSON(res, /^no (project|saved template)/.test(e.message) ? 404 : 400, { error: e.message }); }
    return;
  }
  /* API: commands for the open editor tab — undo, redo, seek, state. The undo stack lives in the
     tab (one stack for the streamer and the agent), so an agent outside the tab asks the tab:
     POST {cmd, t?} is sent to the tabs as SSE `ui-command`; the first tab to answer on
     /api/ui/command/result wins, and its answer is this request's answer. No tab within 4 s → 409. */
  /* API (embedded in Cindy): bind an editor connection to its task (MontClip-Cindy#18, QQ option ①).
     POST /api/embed/ticket {project, session} — the worker only (X-MontClip-Session) — registers a one-time ticket
     (256 bits, 60 s) and returns {ticket, expiresInMs}; the parent page puts it once in the frame's first URL (?ticket=).
     POST /api/embed/claim {ticket, conn} — the page — trades it for its own event stream: that connection is bound to
     the task until it closes. A reused, expired or unknown ticket (another engine's) is 403 and binds nothing; so is a
     connection that is not open here or is already bound. The answer carries the task's BroadcastChannel suffix,
     {bound, channel} (embed.js channelFor, MontClip#215 E3).
     POST /api/embed/channel {ticket} — the side panel — trades a task ticket for that suffix alone, {channel}: no
     connection is bound and no UI command reaches it. Refused like a claim. */
  if (embed && p === "/api/embed/ticket" && req.method === "POST") {
    if (!embed.worker(req)) { sendJSON(res, 403, { error: "forbidden: only the plugin worker registers task tickets" }); return; }
    try { sendJSON(res, 200, embed.taskTicket(JSON.parse((await readBody(req)).toString("utf8") || "{}"))); }
    catch (e) { sendJSON(res, 400, { error: e.code === 400 ? e.message : "body must be JSON {project, session}" }); }
    return;
  }
  if (embed && p === "/api/embed/claim" && req.method === "POST") {
    let a = {};
    try { a = JSON.parse((await readBody(req)).toString("utf8") || "{}"); } catch { }
    const task = embed.redeemTask(a.ticket);   // used up, whatever happens next
    const conn = task && [...sseClients].find((r) => typeof a.conn === "string" && sameSecret(a.conn, r.montclipConn));
    if (!task || !conn || conn.montclipTask) { sendJSON(res, 403, { error: "forbidden: wrong, used or expired task ticket", code: "TASK_TICKET_REFUSED" }); return; }
    conn.montclipTask = task;
    // an export that began before this claim finished: bind it to the same task and tab now
    for (const s of exportSessions.values())
      if (s.ownerConn === conn.montclipConn && !s.ownerSession) { s.ownerSession = task.session; s.ownerTabId = conn.montclipTabId; }
    sendJSON(res, 200, { bound: true, channel: embed.channelFor(task) });
    return;
  }
  if (embed && p === "/api/embed/channel" && req.method === "POST") {
    let a = {};
    try { a = JSON.parse((await readBody(req)).toString("utf8") || "{}"); } catch { }
    const channel = embed.redeemChannel(a.ticket);   // used up, whatever happens next
    if (!channel) { sendJSON(res, 403, { error: "forbidden: wrong, used or expired task ticket", code: "TASK_TICKET_REFUSED" }); return; }
    sendJSON(res, 200, { channel });
    return;
  }
  if (p === "/api/ui/command" && req.method === "POST") {
    let a;
    try { a = JSON.parse((await readBody(req)).toString("utf8") || "{}"); }
    catch { sendJSON(res, 400, { error: "body must be JSON {cmd, t?}" }); return; }
    if (!["undo", "redo", "seek", "state"].includes(a.cmd)) { sendJSON(res, 400, { error: "cmd must be undo, redo, seek or state" }); return; }
    if (a.cmd === "seek" && !(Number.isFinite(+a.t) && +a.t >= 0)) { sendJSON(res, 400, { error: "seek needs t (seconds, ≥ 0)" }); return; }
    /* Embedded (E5b, MontClip-Cindy#18): only the worker asks, and a command for a task goes only to the editor
       connections bound to it; none bound (or bound to another project) → 409 at once. The answer is taken by the
       one-time command id alone, never by a session or project the page says it has. */
    let task = null;
    if (embed) {
      if (!embed.worker(req)) { sendJSON(res, 403, { error: "forbidden: only the plugin worker sends editor commands" }); return; }
      if (a.session != null) {
        if (!TASK_ID_RE.test(String(a.session)) || (a.project != null && !TASK_ID_RE.test(String(a.project)))) {
          sendJSON(res, 400, { error: "session and project must be task ids (letters, digits, _ and -, at most 128)" }); return;
        }
        task = { session: String(a.session), project: a.project == null ? null : String(a.project) };
        if (!editorsFor(task).length) { sendJSON(res, 409, { error: "no editor of this task is open to run it", code: "NO_EDITOR" }); return; }
      }
    }
    const id = crypto.randomUUID();
    const answer = await new Promise((resolve) => {
      const timer = setTimeout(() => { uiCommands.delete(id); resolve(null); }, 4000);
      uiCommands.set(id, (r) => { clearTimeout(timer); uiCommands.delete(id); resolve(r); });
      broadcast("ui-command", JSON.stringify({ id, cmd: a.cmd, ...(a.cmd === "seek" ? { t: +a.t } : {}) }), task);
    });
    if (!answer) sendJSON(res, 409, { error: "no editor tab is open to run it", code: "NO_EDITOR" });
    else sendJSON(res, 200, answer);
    return;
  }
  /* API: the open project's undo history, kept so a reloaded editor tab gets it back (undo-stacks.js).
     GET ?project= → the stack or null · PUT ?project= {sequence, revision, current, media, undo, redo, time}
     · POST /api/ui/undo-stack/time?project= {t} (a page going away: the playhead only). `project` is the
     X-FableCut-Project id, "default" before projects are used. */
  if (p === "/api/ui/undo-stack" || p === "/api/ui/undo-stack/time") {
    const id = url.searchParams.get("project") || "default";
    try {
      if (p === "/api/ui/undo-stack" && req.method === "GET") { sendJSON(res, 200, { stack: undoStacks.get(id) }); return; }
      if (p === "/api/ui/undo-stack" && req.method === "PUT") {
        const body = JSON.parse((await readBody(req)).toString("utf8") || "null");
        sendJSON(res, 200, undoStacks.put(id, body)); return;
      }
      if (p === "/api/ui/undo-stack/time" && req.method === "POST") {
        const body = JSON.parse((await readBody(req)).toString("utf8") || "{}");
        sendJSON(res, 200, { saved: undoStacks.setTime(id, +body.t) }); return;
      }
      sendJSON(res, 405, { error: "GET or PUT /api/ui/undo-stack, POST /api/ui/undo-stack/time" });
    } catch (e) { sendJSON(res, e.status || 400, { error: e.message }); }
    return;
  }
  if (p === "/api/ui/command/result" && req.method === "POST") {
    let a;
    try { a = JSON.parse((await readBody(req)).toString("utf8") || "{}"); }
    catch { sendJSON(res, 400, { error: "body must be JSON {id, …}" }); return; }
    const done = uiCommands.get(a.id);
    if (done) done(a);
    sendJSON(res, done ? 200 : 409, { taken: !!done });
    return;
  }
  /* API: versions (history.js) — GET ?project= lists them (default: the open project);
     POST {action, project?, version?, …} saves, restores, compares, renames / marks
     final, deletes; GET /api/versions/file?project=&version= is one version's document.
     GET /api/projects/backup?id= is a project with all its versions, as one file. */
  if (p === "/api/versions" && req.method === "GET") {
    try { sendJSON(res, 200, history.list(url.searchParams.get("project") || null)); }
    catch (e) { sendJSON(res, /^no project/.test(e.message) ? 404 : 400, { error: e.message }); }
    return;
  }
  if (p === "/api/versions" && req.method === "POST") {
    let a;
    try { a = JSON.parse((await readBody(req)).toString("utf8") || "{}"); }
    catch { sendJSON(res, 400, { error: "body must be JSON {action, …}" }); return; }
    try {
      const out = history.act(a);
      if (a.action && a.action !== "list" && a.action !== "diff") broadcast("versions", JSON.stringify({ project: out.project, action: a.action }));
      const isOpen = out.project === projects.peekActive();
      if (a.action === "restore" && isOpen) onFsChange();   // the tabs load the restored document
      sendJSON(res, 200, a.action === "restore" ? { ...out, open: isOpen } : out);
    } catch (e) { sendJSON(res, /^no (project|version)/.test(e.message) ? 404 : 400, { error: e.message }); }
    return;
  }
  if (p === "/api/versions/file" && req.method === "GET") {
    try {
      const doc = history.get(url.searchParams.get("project") || null, url.searchParams.get("version"));
      res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store",
        "Content-Disposition": `attachment; filename="${safeName(doc.name || "project")}-v${String(url.searchParams.get("version")).replace(/\D/g, "")}.json"` });
      res.end(JSON.stringify(doc, null, 2));
    } catch (e) { sendJSON(res, /^no (project|version)/.test(e.message) ? 404 : 400, { error: e.message }); }
    return;
  }
  if (p === "/api/projects/backup" && req.method === "GET") {
    try {
      const b = history.backup(url.searchParams.get("id") || null);
      res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store",
        "Content-Disposition": `attachment; filename="${safeName(b.name || "project")}.fablecut-backup.json"` });
      res.end(JSON.stringify(b));
    } catch (e) { sendJSON(res, /^no project/.test(e.message) ? 404 : 400, { error: e.message }); }
    return;
  }
  if (p === "/api/projects/thumb" && (req.method === "GET" || req.method === "PUT")) {
    const id = url.searchParams.get("id") || "";
    if (req.method === "GET") {
      const file = projects.thumbPath(id);
      if (!file) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { "Content-Type": "image/jpeg", "Cache-Control": "no-store" });
      fs.createReadStream(file).pipe(res);
      return;
    }
    try { sendJSON(res, 200, projects.setThumb(id, await readBody(req))); }
    catch (e) { sendJSON(res, /^no project/.test(e.message) ? 404 : 400, { error: e.message }); }
    return;
  }
  if (p === "/api/project" && req.method === "PUT") {
    try {
      const body = await readBody(req);
      const data = JSON.parse(body.toString("utf8")); // validate JSON
      /* Optimistic concurrency: a write whose revision isn't newer than what's
         on disk was based on a stale read (someone else — the UI or an external
         tool — saved in between). Reject it instead of clobbering their work.
         ?force=1 skips the check for deliberate overwrites. */
      let cur = {};
      try { cur = JSON.parse(fs.readFileSync(PROJECT_FILE, "utf8").replace(new RegExp("^\\uFEFF"), "")); } catch {}
      // a save the editor made for another project (it sends the id it loaded) never lands here
      const meant = req.headers["x-fablecut-project"], open = projects.peekActive();
      if (meant && open && meant !== open) {
        sendJSON(res, 409, { error: "another project is open now", revision: cur.revision || 0, project: open });
        return;
      }
      if ((data.revision || 0) <= (cur.revision || 0) && url.searchParams.get("force") !== "1") {
        sendJSON(res, 409, { error: "stale revision — project changed since it was read", revision: cur.revision || 0 });
        return;
      }
      const tmp = PROJECT_FILE + ".tmp";
      fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
      fs.renameSync(tmp, PROJECT_FILE);
      sendJSON(res, 200, { ok: true, revision: data.revision });
    } catch (e) { sendJSON(res, 400, { error: String(e) }); }
    return;
  }

  /* API: media library listing */
  if (p === "/api/media" && req.method === "GET") {
    try {
      const files = fs.readdirSync(MEDIA_DIR)
        .filter((f) => fs.statSync(path.join(MEDIA_DIR, f)).isFile())
        .map((f) => ({ name: f, src: "/media/" + encodeURIComponent(f), size: fs.statSync(path.join(MEDIA_DIR, f)).size }));
      sendJSON(res, 200, files);
    } catch (e) { sendJSON(res, 500, { error: String(e) }); }
    return;
  }

  /* API: media metadata (ffprobe; size only without it).
       GET  /api/media-info?src=/media/x.mp4 → {src, info} (info null = file missing)
       POST /api/media-info {srcs:[…], stat?} → {info:{src: info | null}} — up to 2000 per call;
       stat:true answers {size, mtimeMs} without ffprobe (the editor's offline check) */
  if (p === "/api/signals/loudness" && req.method === "GET") {
    const file = resolveSrc(url.searchParams.get("src") || "");
    if (!file) { sendJSON(res, 404, { error: "no such file under media/ or library/" }); return; }
    const track = audioTrackFor(url.searchParams.get("src") || "", url.searchParams.get("track"));
    if (Number.isNaN(track)) { sendJSON(res, 400, BAD_TRACK); return; }
    try { sendJSON(res, 200, { ...(await signals.loudness(file, { track })), track }); }
    catch (e) { sendJSON(res, 422, { error: X.maskUserPath(e.message), code: e.code || "SIGNALS_FAILED" }); }   // no local paths in the answer (QQ, #52)
    return;
  }
  /* API: the songs in a file (P2 「找出每首歌」; song-scan.js reads, songs.js finds).
       POST /api/songs {src, again?} → 202 {src, state, done, total} — starts the scan, or carries on from the first segment
                                       not read yet; again:true forgets what was read
       GET  /api/songs?src=          → {src, key, state, done, total, complete, scanned, songs} — songs in file seconds
       POST /api/songs/cancel {src}  → {src, state} — stops the scan; what was read is kept
     `track` (query or body) picks the audio stream; without it, the media entry's audioTrack (audioTrackFor).
     state: running · done · stopped (part read, nothing running) · failed · none. SSE event `songs` {src, state, done, total}. */
  if ((p === "/api/songs" || p === "/api/songs/cancel") && (req.method === "POST" || (req.method === "GET" && p === "/api/songs"))) {
    let src = url.searchParams.get("src") || "", body = {};
    if (req.method === "POST") {
      try { body = JSON.parse((await readBody(req)).toString("utf8") || "{}"); } catch { sendJSON(res, 400, { error: "the body is not JSON" }); return; }
      if (!body || typeof body !== "object" || Array.isArray(body)) { sendJSON(res, 400, { error: "the body is {src}" }); return; }
      src = String(body.src || "");
    }
    const file = resolveSrc(src);
    if (!file || !fs.existsSync(file)) { sendJSON(res, 404, { error: "no such file under media/ or library/" }); return; }
    const track = audioTrackFor(src, body.track != null ? body.track : url.searchParams.get("track"));
    if (Number.isNaN(track)) { sendJSON(res, 400, BAD_TRACK); return; }
    try {
      if (p === "/api/songs/cancel") {
        const job = songJobs.get(songJobKey(src, track));
        if (job && job.state === "running") job.ctrl.abort();
        sendJSON(res, 200, { src, state: job ? job.state : "none" });
        return;
      }
      if (req.method === "POST") {
        // P10: never hand song-scan's filter to an FFmpeg that can't run it (raw "Option 'measure' not found")
        if (!HAS_FFMPEG) { sendJSON(res, 503, ffmpegMissingBody()); return; }
        const job = await startSongScan(src, file, body.again === true, track);
        sendJSON(res, 202, { src, track, state: job.state, done: job.done, total: job.total });
        return;
      }
      const have = songScan.load(file, track), job = songJobs.get(songJobKey(src, track));
      const state = job && job.state === "running" ? "running" : have.complete ? "done" : job ? job.state : have.done ? "stopped" : "none";
      sendJSON(res, 200, { src, track, key: have.key, state, done: have.done, total: job ? job.total : null, complete: have.complete, scanned: have.scanned,
        songs: have.rows.length ? Songs.find(have.rows.map((r) => r[0]), { step: have.step, complete: have.complete }) : [],
        ...(job && job.state === "failed" ? { error: job.error, code: job.code, ...(job.code === "ENOSPC" ? { drive: songDrive() } : {}) } : {}) });
    } catch (e) { sendJSON(res, 422, { error: X.maskUserPath(e.message), code: e.code || "SONGS_FAILED", ...(e.code === "ENOSPC" ? { drive: songDrive() } : {}) }); }
    return;
  }
  if (p === "/api/media-info" && (req.method === "GET" || req.method === "POST")) {
    try {
      if (req.method === "GET") {
        const src = url.searchParams.get("src") || "";
        const file = resolveSrc(src);
        sendJSON(res, 200, { src, info: file ? await probeFile(file) : null });
        return;
      }
      const body = JSON.parse((await readBody(req)).toString("utf8") || "{}");
      const srcs = Array.isArray(body.srcs) ? body.srcs.slice(0, 2000).map(String) : [];
      const info = Object.create(null);   // any src is a plain key, "__proto__" too
      // probed side by side (media-probe.js caps how many ffprobes run at once)
      await Promise.all(srcs.map(async (src) => {
        const file = resolveSrc(src);
        if (!file) { info[src] = null; return; }
        // stat:true only asks "is it there?" (offline checks) — no ffprobe
        if (body.stat) { const st = await fs.promises.stat(file); info[src] = { size: st.size, mtimeMs: Math.round(st.mtimeMs) }; }
        else info[src] = await probeFile(file);
      }));
      sendJSON(res, 200, { info });
    } catch (e) { sendJSON(res, 400, { error: String(e.message || e) }); }
    return;
  }

  /* API: where might a missing file be now? Body {media:[{id, name, size?}]} →
     {candidates:{id:[{src, name, size, score, why}]}} — files under media/ and
     library/ ranked by name and size (MediaLib.relinkScore), best first, at most 5 each. */
  if (p === "/api/relink/candidates" && req.method === "POST") {
    try {
      const body = JSON.parse((await readBody(req)).toString("utf8") || "{}");
      const want = Array.isArray(body.media) ? body.media.slice(0, 2000) : [];
      const files = [];
      const walk = (root, prefix, d, depth) => {
        let list = [];
        try { list = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
        for (const e of list) {
          if (e.name.startsWith(".")) continue;
          const full = path.join(d, e.name);
          if (e.isDirectory()) { if (depth < 6 && !(root === LIBRARY_DIR && /^(presets|templates|fonts)$/.test(e.name) && depth === 0)) walk(root, prefix, full, depth + 1); continue; }
          let size = 0;
          try { size = fs.statSync(full).size; } catch { continue; }
          const rel = path.relative(root, full).split(path.sep).map(encodeURIComponent).join("/");
          files.push({ src: prefix + rel, name: e.name, size });
        }
      };
      walk(MEDIA_DIR, "/media/", MEDIA_DIR, 0);
      walk(LIBRARY_DIR, "/library/", LIBRARY_DIR, 0);
      const candidates = Object.create(null);
      for (const m of want) {
        if (!m || !m.id) continue;
        candidates[m.id] = files.map((f) => ({ ...f, ...MediaLib.relinkScore(m, f) }))
          .filter((f) => f.score > 0).sort((a, b) => b.score - a.score || a.name.localeCompare(b.name)).slice(0, 5);
      }
      sendJSON(res, 200, { candidates });
    } catch (e) { sendJSON(res, 400, { error: String(e.message || e) }); }
    return;
  }

  /* API: word transcripts (transcripts.js) — one per version of a file, times in file seconds.
       GET  /api/transcript?src=          → {transcript} (null when there is none; 404 when the file is missing)
       POST /api/transcript?src=  {doc}   → {src, words} — saved by the tab that transcribed it
       POST /api/transcript/status {srcs} → {status:{src: {words, language, model, duration, created} | false | null}}
       POST /api/transcript/delete {src}  → {deleted}
     Saves and deletes also arrive as SSE event "transcript" ({src}). */
  if (p === "/api/transcript" && req.method === "GET") {
    const src = url.searchParams.get("src") || "";
    const track = audioTrackFor(src, url.searchParams.get("track"));
    if (Number.isNaN(track)) { sendJSON(res, 400, BAD_TRACK); return; }
    const d = transcripts.get(src, track);
    if (d === null) { sendJSON(res, 404, { error: "no such file: " + src }); return; }
    if (d === false) { sendJSON(res, 200, { transcript: null }); return; }   // none yet: not an error
    sendJSON(res, 200, { transcript: d });
    return;
  }
  if ((p === "/api/transcript" || p === "/api/transcript/status" || p === "/api/transcript/delete") && req.method === "POST") {
    try {
      const body = JSON.parse((await readBody(req)).toString("utf8") || "{}");
      if (p === "/api/transcript") {
        const src = url.searchParams.get("src") || body.src || "";
        const track = audioTrackFor(src, url.searchParams.get("track"));
        if (Number.isNaN(track)) { sendJSON(res, 400, BAD_TRACK); return; }
        const d = transcripts.put(src, body, track);
        broadcast("transcript", JSON.stringify({ src }));
        sendJSON(res, 200, { src, words: d.words.length });
      } else if (p === "/api/transcript/delete") {
        const track = audioTrackFor(String(body.src || ""), body.track);
        if (Number.isNaN(track)) { sendJSON(res, 400, BAD_TRACK); return; }
        const deleted = transcripts.remove(String(body.src || ""), track);
        if (deleted) broadcast("transcript", JSON.stringify({ src: String(body.src) }));
        sendJSON(res, 200, { deleted });
      } else {
        const status = {};
        for (const src of (Array.isArray(body.srcs) ? body.srcs.slice(0, 2000).map(String) : [])) {
          const track = audioTrackFor(src, body.tracks?.[src]);
          if (Number.isNaN(track)) throw new Error('invalid audio track');
          status[src] = transcripts.info(src, track);
        }
        sendJSON(res, 200, { status });
      }
    } catch (e) { sendJSON(res, e.code === 404 ? 404 : 400, { error: String(e.message || e) }); }
    return;
  }
  /* API: transcribe files (fablecut_transcribe) — a "transcribe" job on the
     export-job queue; the tab that runs it saves each transcript. */
  if (p === "/api/transcribe/request" && req.method === "POST") {
    try {
      const opts = JSON.parse((await readBody(req)).toString("utf8") || "{}");
      exportJobs.assertWhere(opts.where);
      const t = opts.transcribe;
      if (!t || typeof t !== "object" || !Array.isArray(t.srcs) || !t.srcs.length || t.srcs.length > 200 || !t.srcs.every((x) => typeof x === "string")) {
        sendJSON(res, 400, { error: "transcribe must be {srcs: [\"/media/…\", …] (1–200), model?, language?, again?}" }); return;
      }
      const missing = t.srcs.find((x) => !resolveSrc(x));
      if (missing) { sendJSON(res, 404, { error: "no such file: " + missing }); return; }
      const TR = require("../transcribe.js");
      let spec;
      try {
        spec = { srcs: [...new Set(t.srcs)], model: TR.model(t.model), language: TR.language(t.language), again: t.again === true };
        spec.tracks = Object.fromEntries(spec.srcs.map(src => {
          const track = audioTrackFor(src, t.tracks?.[src]);
          if (Number.isNaN(track)) throw new Error('invalid audio track');
          return [src, track];
        }));
        // ranges: {src: [[from, to], …]} — a long file's clips are listened to in their windows only (P8)
        if (t.ranges != null) {
          if (!t.ranges || typeof t.ranges !== "object" || Array.isArray(t.ranges)) throw new Error("ranges must be {src: [[from, to], …]}");
          const out = {};
          for (const [src, list] of Object.entries(t.ranges)) {
            if (!spec.srcs.includes(src)) throw new Error("ranges for a file not in srcs: " + src);
            if (!Array.isArray(list) || !list.length || list.length > 500 || !list.every((x) => Array.isArray(x) && Number.isFinite(x[0]) && Number.isFinite(x[1]) && x[0] >= 0 && x[1] > x[0]))
              throw new Error("ranges must be {src: [[from, to], …]} in file seconds (1–500 each), with to > from ≥ 0");
            out[src] = list.map((x) => [x[0], x[1]]);
          }
          if (Object.keys(out).length) spec.ranges = out;
        }
      } catch (e) { sendJSON(res, 400, { error: e.message }); return; }
      sendJSON(res, 200, exportJobs.request({ kind: "transcribe", where: opts.where, transcribe: spec }));
    } catch (e) {
      sendJSON(res, e.code === 409 || e.code === 400 ? e.code : 500, { code: e.errorCode, error: String(e.message || e), busy: e.busy });
    }
    return;
  }
  /* API: put a lyrics proposal on a new caption track (fablecut_lyrics_apply) — a "lyrics" job on the export-job queue,
     open tabs only: the tab asks the streamer on a card and does it only when she agrees. */
  if (p === "/api/lyrics/request" && req.method === "POST") {
    try {
      const opts = JSON.parse((await readBody(req)).toString("utf8") || "{}");
      const pr = opts.proposal;
      if (!pr || typeof pr !== "object" || pr.ok !== true || pr.code !== "OK" || typeof pr.id !== "string" || !Array.isArray(pr.lines) || !pr.lines.length || pr.lines.length > 300 || typeof pr.sig !== "string" || !Array.isArray(pr.clipIds)) {
        sendJSON(res, 400, { error: "proposal must be a fablecut_lyrics proposal whose code is OK" }); return;
      }
      if (JSON.stringify(pr).length > 2_000_000) { sendJSON(res, 413, { error: "proposal too large" }); return; }
      sendJSON(res, 200, exportJobs.request({ kind: "lyrics", where: "tab", lyrics: pr }));
    } catch (e) {
      sendJSON(res, e.code === 409 || e.code === 400 ? e.code : 500, { code: e.errorCode, error: String(e.message || e) });
    }
    return;
  }
  /* API: proxies (see proxy.js).
       POST /api/proxy {srcs:[…], height?:540|720|1080} → {status:{src: status}} — queue them
       POST /api/proxy/status {srcs:[…]} → {status:{src: status | null}}
       POST /api/proxy/delete {srcs:[…]} → {deleted:{src: n}}
     Progress and results also arrive as SSE event "proxy". */
  if ((p === "/api/proxy" || p === "/api/proxy/status" || p === "/api/proxy/delete") && req.method === "POST") {
    try {
      const body = JSON.parse((await readBody(req)).toString("utf8") || "{}");
      const srcs = Array.isArray(body.srcs) ? body.srcs.slice(0, 2000).map(String) : [];
      if (p === "/api/proxy/delete") {
        const deleted = {};
        for (const src of srcs) deleted[src] = proxies.remove(src);
        sendJSON(res, 200, { deleted });
        return;
      }
      if (p === "/api/proxy" && !HAS_FFMPEG) { sendJSON(res, 503, ffmpegMissingBody()); return; }
      const status = {};
      for (const src of srcs) status[src] = p === "/api/proxy" ? await proxies.start(src, body.height) : await proxies.status(src);
      sendJSON(res, 200, { status });
    } catch (e) { sendJSON(res, 400, { error: String(e.message || e) }); }
    return;
  }

  /* API: default-asset library listing (./library/{sfx,elements,svg,fonts}) */
  if (p === "/api/library" && req.method === "GET") {
    const dir = url.searchParams.get("dir");
    if (!LIBRARY_SUBDIRS.includes(dir)) { sendJSON(res, 400, { error: "dir must be one of " + LIBRARY_SUBDIRS.join("|") }); return; }
    try {
      const base = path.join(LIBRARY_DIR, dir);
      const out = [];
      const walk = (d, rel) => {
        for (const f of fs.readdirSync(d)) {
          const full = path.join(d, f), r = rel ? rel + "/" + f : f;
          const st = fs.statSync(full);
          if (st.isDirectory()) walk(full, r);
          else out.push({
            name: f, rel: r, size: st.size,
            src: "/library/" + dir + "/" + r.split("/").map(encodeURIComponent).join("/"),
          });
        }
      };
      walk(base, "");
      sendJSON(res, 200, out);
    } catch (e) { sendJSON(res, 500, { error: String(e) }); }
    return;
  }

  /* API: saved animation presets and templates (library/presets, library/templates).
       GET  /api/presets | /api/templates  → [ …validated items… ] (bad files skipped)
       POST /api/presets {preset} | /api/templates {template} → saved as library/<kind>/<id>.json */
  if ((p === "/api/presets" || p === "/api/templates") && (req.method === "GET" || req.method === "POST")) {
    const kind = p.slice(5), norm = kind === "presets" ? Templates.normalizePreset : Templates.normalizeTemplate;
    try {
      if (req.method === "GET") {
        sendJSON(res, 200, readSaved(kind).map((x) => norm(x.data)).filter(Boolean));
        return;
      }
      const body = JSON.parse((await readBody(req)).toString("utf8") || "{}");
      const item = Templates.asSaved(norm(kind === "presets" ? body.preset : body.template, true), kind);
      const file = writeSaved(kind, item.id, item);
      sendJSON(res, 200, { id: item.id, name: item.name, file: path.relative(DATA_DIR, file).split(path.sep).join("/") });
    } catch (e) { sendJSON(res, 400, { error: String(e.message || e) }); }
    return;
  }

  /* API: upload → saved into ./media */
  if (p === "/api/upload" && req.method === "POST") {
    try {
      let name = Delivery.mediaFileName(url.searchParams.get("name") || "upload.bin");   // Chinese kept (Deja)
      let target = path.join(MEDIA_DIR, name);
      let i = 1;
      const ext = path.extname(name), base = path.basename(name, ext);
      // Streamed to a staging file first (never held in memory), then claimed under a free name: the link fails on an
      // existing name instead of replacing it, so another upload is never overwritten. A dropped upload leaves nothing.
      const staging = path.join(UPLOADS_DIR, crypto.randomBytes(8).toString("hex") + ".part");
      fs.mkdirSync(UPLOADS_DIR, { recursive: true });
      await bodyToFile(req, staging);
      try {
        for (;;) {
          try { fs.linkSync(staging, target); break; }
          catch (error) {
            if (error.code === "EEXIST") { target = path.join(MEDIA_DIR, `${base}_${i++}${ext}`); continue; }
            // a file system without hard links: an exclusive copy keeps the same no-overwrite rule
            if (["EPERM", "ENOTSUP", "EXDEV", "EINVAL"].includes(error.code)) {
              try { fs.copyFileSync(staging, target, fs.constants.COPYFILE_EXCL); break; }
              catch (e2) { if (e2.code === "EEXIST") { target = path.join(MEDIA_DIR, `${base}_${i++}${ext}`); continue; } throw e2; }
            }
            throw error;
          }
        }
      } finally { try { fs.rmSync(staging, { force: true }); } catch {} }
      // the page's 「正在导入… n%」 for this file (?ticket= from importFiles): how far the faststart tidy is, over SSE
      const ticket = url.searchParams.get("ticket");
      await faststart(target, /^[A-Za-z0-9_-]{1,40}$/.test(ticket || "") ? { onProgress: (frac) => broadcast("upload", JSON.stringify({ ticket, frac })) } : undefined);
      sendJSON(res, 200, { ok: true, ...await prepareMedia(target) });
    } catch (e) { sendJSON(res, ["FLV_TRANSCODE_REQUIRED","FLV_READABLE_CONSENT_REQUIRED","FLV_TIMELINE_GAP"].includes(e.code) ? 409 : 500, publicPreparationError(e)); }
    return;
  }

  if (p === "/api/prepare-media" && req.method === "POST") {
    try {
      const body = JSON.parse((await readBody(req)).toString("utf8"));
      const file = resolveSrc(body.src);
      if (!file || !String(body.src).startsWith("/media/") || path.extname(file).toLowerCase() !== ".flv") {
        sendJSON(res, 400, { code:"FLV_SOURCE_REQUIRED", error:"FLV_SOURCE_REQUIRED" });
        return;
      }
      sendJSON(res, 200, { ok: true, ...await prepareMedia(file, {allowTranscode: body.allowTranscode, acceptReadable: body.acceptReadable, fixGaps: body.fixGaps}) });
    } catch (e) { sendJSON(res, ["FLV_TRANSCODE_REQUIRED","FLV_READABLE_CONSENT_REQUIRED","FLV_TIMELINE_GAP"].includes(e.code) ? 409 : 500, publicPreparationError(e)); }
    return;
  }

  /* API: download an HTTPS URL into ./media (same-origin src after import).
     Body {url}. Rejects http/file/local/private targets. Does not register
     project media — the client / MCP tool does that, matching /api/upload. */
  if (p === "/api/import-url" && req.method === "POST") {
    if (DESKTOP) {
      sendJSON(res, 403, { code: "NETWORK_DISABLED", error: "Offline mode: import a local file." });
      return;
    }
    try {
      const opts = JSON.parse((await readBody(req)).toString("utf8") || "{}");
      const ac = new AbortController();
      // IncomingMessage "close" also fires when the request body finishes, which
      // would abort a successful download. ServerResponse "close" with
      // writableEnded still false means the client dropped the connection.
      res.on("close", () => { if (!res.writableEnded) ac.abort(); });
      const { target, name } = await downloadImportUrl(opts.url, MEDIA_DIR, {
        signal: ac.signal,
        // test/rest-api.test.js: HTTP to 127.0.0.1 only (loopback fixture).
        // Does not disable SSRF for LAN / metadata / other private ranges.
        allowLoopback: process.env.FABLECUT_TEST_IMPORT_ALLOW_PRIVATE === "1",
      });
      await faststart(target);
      sendJSON(res, 200, { ok: true, src: "/media/" + encodeURIComponent(name), name });
    } catch (e) {
      if (e && e.code === "ABORT_ERR") { try { res.end(); } catch {} return; }
      const msg = e && e.message ? e.message : String(e);
      const code = /must be https|invalid URL|blocked:|credentials|unsupported|too large|did not return/i.test(msg) ? 400 : 502;
      sendJSON(res, code, { error: msg });
    }
    return;
  }

  /* API: agent-requested export jobs (see export-jobs.js).
     POST /api/export/request {range?, profile?, where?} → job; GET /api/export/job?id=
     polls it; the editor tab claims, reports and finishes it. One job at a time on this queue (all four request
     endpoints): another unfinished one answers 409 {code:"JOB_BUSY", busy:{id, kind, status, …}, error} with the
     cancel call in error. */
  if (p === "/api/export/request" && req.method === "POST") {
    try {
      const opts = JSON.parse((await readBody(req)).toString("utf8") || "{}");
      /* E5a (MontClip#215): the job names the open project and the Cindy task that asked. The task is taken only from
         the plugin worker's own request (X-MontClip-Session); a page's body or URL never names one (MontClip-Cindy#18).
         A caller that names another project, or a switch before the job is queued, is EXPORT_PROJECT_CHANGED. */
      const session = embed && embed.worker(req) && opts.session != null ? opts.session : null;
      if (session !== null && (typeof session !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(session))) {
        sendJSON(res, 400, { error: "session must be the task's id (letters, digits, _ and -, at most 128)" }); return;
      }
      if (opts.project != null && typeof opts.project !== "string") { sendJSON(res, 400, { error: "project must be a project id" }); return; }
      const exportProject = projects.peekActive();
      const checkProject = () => {
        if ((opts.project && opts.project !== exportProject) || projects.peekActive() !== exportProject)
          throw Object.assign(new Error("The export project changed."), { code: 409, errorCode: "EXPORT_PROJECT_CHANGED" });
      };
      checkProject();
      exportJobs.assertWhere(opts.where);
      if (opts.preview === true && opts.outputs) { sendJSON(res, 400, { error: "a preview is one quick file: pass profile or preset, not outputs" }); return; }
      /* #325: an end past the timeline, or a preview longer than PREVIEW_MAX_SEC, is refused with the reason — not
         rendered shorter under the seconds that were asked (the editor clamps to the timeline) */
      {
        let doc = {};
        try { doc = JSON.parse(fs.readFileSync(PROJECT_FILE, "utf8").replace(/^﻿/, "")); } catch {}
        const bad = checkExportSpan({ project: doc, range: opts.range, preview: opts.preview === true, maxPreviewSec: PREVIEW_MAX_SEC });
        if (bad) { sendJSON(res, 400, { code: bad.errorCode, error: bad.error }); return; }
      }
      if (!HAS_FFMPEG) { sendJSON(res, 400, ffmpegMissingBody()); return; }
      if (opts.profile) resolveProfile(String(opts.profile));
      if (opts.profile && (opts.preset || opts.delivery || opts.outputs)) { sendJSON(res, 400, { error: "pass a profile (raw ffmpeg args) or a preset / delivery spec / outputs, not both" }); return; }
      // several files from one render: outputs:true = the project's checked batch outputs, or a list of specs
      let deliveries = null, outNotes = [];
      if (opts.outputs) {
        let list = opts.outputs;
        if (list === true) {
          let proj = {};
          try { proj = JSON.parse(fs.readFileSync(PROJECT_FILE, "utf8").replace(/^\uFEFF/, "")); } catch {}
          list = (Array.isArray(proj.outputs) ? proj.outputs : []).filter((o) => o && o.on !== false);
          if (!list.length) { sendJSON(res, 400, { error: "the project has no checked batch outputs — pass outputs:[{preset…}, …], or add some with setProject {outputs}" }); return; }
        }
        if (!Array.isArray(list) || !list.length) { sendJSON(res, 400, { error: "outputs is true or a list of delivery specs" }); return; }
        if (list.length > 16) { sendJSON(res, 400, { error: "at most 16 outputs" }); return; }
        const available = await deliveryEncoders(), presets = savedDeliveryPresets();
        deliveries = list.map((o, i) => {
          const n = Delivery.normalize(typeof o === "string" ? o : o, { available, presets });
          for (const note of n.notes) outNotes.push(`output ${i + 1}: ${note}`);
          return n.spec;
        });
      }
      // a delivery preset with overrides → one complete spec, checked against this ffmpeg
      let delivery = null, notes = [];
      if (opts.preset || opts.delivery) {
        const d = opts.delivery && typeof opts.delivery === "object" ? opts.delivery : {};
        const n = Delivery.normalize({ ...d, preset: opts.preset || d.preset || undefined },
          { available: await deliveryEncoders(), presets: savedDeliveryPresets() });
        delivery = n.spec; notes = n.notes;
      }
      let revision = null;
      try { revision = JSON.parse(fs.readFileSync(PROJECT_FILE, "utf8").replace(/^\uFEFF/, "")).revision ?? null; } catch {}
      checkProject();
      const job = exportJobs.request({ project: exportProject, session, range: opts.range, preview: opts.preview === true, profile: opts.profile, delivery: deliveries ? null : delivery, deliveries, where: opts.where, revision });
      sendJSON(res, 200, deliveries ? { ...job, delivery: `${deliveries.length} outputs from one render`, notes: outNotes }
        : delivery ? { ...job, delivery: Delivery.describe(delivery), notes } : job);
    } catch (e) {
      const code = e.code === 409 || e.code === 400 ? e.code : /^Unknown encoding profile/.test(e.message || "") ? 400 : 500;
      sendJSON(res, code, { code: e.errorCode, error: String(e.message || e), busy: e.busy });
    }
    return;
  }
  /* API: check a stretch of the timeline with the video bridge (#321). Nothing here changes the project.
       POST /api/review/prepare {start, end, lead?, scope?: "window"|"full", where?, send?} → {reviewId, state: "rendering", …}
            renders a small sample (a preview export job). A person's page then gets state "ready" with willSend {what, to} and a one-time
            sendToken (from /api/review/status); only POST /api/review/send {id, token} sends it. An agent's request may pass send:true
            (the streamer asked for it in the chat): the sample is sent when it is ready and no token is involved.
       GET  /api/review/status?id= → the check now (result when done)         POST /api/review/cancel {id}
       GET  /api/review/records?limit= · /api/review/record?id=                POST /api/review/mark {id, finding?, mark: fixed|recheck_needed|note, note?}
       POST /api/review/correct {id, digest}                                   GET  /api/review/gate?start=&end= → {passed, recordId, …}
       GET  /api/review/taste · POST /api/review/taste/add {kind: positive|negative, aspect (positive), text} · /taste/remove {id}
       prepare also takes mode: "single" (default) | "two_pass" (a blind first look, then the full check: the same clip is sent in 2 requests).
       An agent's send:true answers 403 AGENT_SEND_OFF unless MONTCLIP_REVIEW_AGENT_SEND=1.
       "passed" is only ever written by a check that passed; mark refuses it (400). */
  if (p.startsWith("/api/review/")) {
    const action = p.slice("/api/review/".length);
    const agent = isAgentReq(req);
    try {
      const svc = reviews(), store = reviewStore(), project = projects.peekActive();
      const body = req.method === "POST" ? JSON.parse((await readBody(req)).toString("utf8") || "{}") : {};
      const q = (k) => url.searchParams.get(k);
      if (action === "prepare" && req.method === "POST") {
        if (body.send === true && !agent) { sendJSON(res, 403, { code: "CLICK_REQUIRED", error: "only a person's click at the editor sends a sample" }); return; }
        sendJSON(res, 200, svc.prepare({ start: body.start, end: body.end, lead: body.lead, scope: body.scope, mode: body.mode, where: body.where, agent, autoSend: body.send === true }));
      } else if (action === "status" && req.method === "GET") {
        const v = svc.status(q("id") || undefined);
        if (!agent && v.state === "ready") v.sendToken = svc.tokenFor(v.reviewId);
        sendJSON(res, 200, v);
      } else if (action === "send" && req.method === "POST") {
        if (agent) { sendJSON(res, 403, { code: "CLICK_REQUIRED", error: "only a person's click at the editor sends a sample; an agent asks with send:true in prepare" }); return; }
        sendJSON(res, 200, await svc.send(String(body.id || ""), body.token));
      } else if (action === "cancel" && req.method === "POST") {
        sendJSON(res, 200, svc.cancel(String(body.id || "")));
      } else if (action === "records" && req.method === "GET") {
        sendJSON(res, 200, { records: store.list(project, Number(q("limit")) || 20) });
      } else if (action === "record" && req.method === "GET") {
        const rec = store.get(project, String(q("id") || ""));
        if (!rec) { sendJSON(res, 404, { code: "NO_SUCH_REVIEW", error: "no such check" }); return; }
        sendJSON(res, 200, rec);
      } else if (action === "mark" && req.method === "POST") {
        sendJSON(res, 200, store.mark(project, { id: String(body.id || ""), finding: body.finding ?? null, mark: body.mark, note: body.note }));
      } else if (action === "correct" && req.method === "POST") {
        sendJSON(res, 200, store.correct(project, { id: String(body.id || ""), digest: body.digest }));
      } else if (action === "taste" && req.method === "GET") {
        sendJSON(res, 200, { notes: store.tasteList(project) });
      } else if (action === "taste/add" && req.method === "POST") {
        sendJSON(res, 200, store.tasteAdd(project, { kind: body.kind, aspect: body.aspect, text: body.text }));
      } else if (action === "taste/remove" && req.method === "POST") {
        sendJSON(res, 200, store.tasteRemove(project, String(body.id || "")));
      } else if (action === "gate" && req.method === "GET") {
        const s = Number(q("start")), e = Number(q("end"));
        if (!Number.isFinite(s) || !Number.isFinite(e) || s < 0 || e <= s) { sendJSON(res, 400, { code: "BAD_RANGE", error: "start and end are seconds with 0 <= start < end" }); return; }
        sendJSON(res, 200, store.gate(project, { key: store.contentKey(liveProject()), start: s, end: e }));
      } else { sendJSON(res, 404, { error: "unknown review endpoint" }); }
    } catch (e) {
      const code = Number.isInteger(e.status) ? e.status : e instanceof SyntaxError ? 400 : e.code === 409 || e.code === 400 ? e.code : 500;
      sendJSON(res, code, { code: e.errorCode || (typeof e.code === "string" ? e.code : undefined), error: String(e.message || e), busy: e.busy });
    }
    return;
  }
  /* API: measure the graded program frame (fablecut_scopes) — a "scopes"
     job on the export-job queue, polled with GET /api/export/job?id=. */
  if (p === "/api/scopes/request" && req.method === "POST") {
    try {
      const opts = JSON.parse((await readBody(req)).toString("utf8") || "{}");
      exportJobs.assertWhere(opts.where);
      let revision = null;
      try { revision = JSON.parse(fs.readFileSync(PROJECT_FILE, "utf8").replace(/^﻿/, "")).revision ?? null; } catch {}
      const ok = typeof opts.time === "number" || (typeof opts.time === "string" && opts.time.trim() !== "" && Number.isFinite(Number(opts.time)));
      if (opts.time != null && !ok) { sendJSON(res, 400, { error: "time must be seconds ≥ 0" }); return; }
      const time = opts.time == null ? null : Number(opts.time);
      const m = opts.matte;
      if (m != null && (typeof m !== "object" || typeof m.clip !== "string" || !Number.isInteger(m.layer) || m.layer < 0)) {
        sendJSON(res, 400, { error: "matte must be {clip: \"<clip id>\", layer: <index ≥ 0>}" }); return;
      }
      const mk = opts.mask;
      if (mk != null && (typeof mk !== "object" || typeof mk.clip !== "string")) {
        sendJSON(res, 400, { error: "mask must be {clip: \"<clip id>\"}" }); return;
      }
      sendJSON(res, 200, exportJobs.request({ kind: "scopes", time, where: opts.where, revision, matte: m || null, mask: mk || null, image: opts.image === true }));
    } catch (e) {
      sendJSON(res, e.code === 409 || e.code === 400 ? e.code : 500, { code: e.errorCode, error: String(e.message || e), busy: e.busy });
    }
    return;
  }
  /* API: follow a region of a clip (fablecut_track) — a "track" job on the
     same queue; the tab that runs it saves the track into the project. */
  if (p === "/api/track/request" && req.method === "POST") {
    try {
      const opts = JSON.parse((await readBody(req)).toString("utf8") || "{}");
      exportJobs.assertWhere(opts.where);
      let revision = null;
      try { revision = JSON.parse(fs.readFileSync(PROJECT_FILE, "utf8").replace(/^﻿/, "")).revision ?? null; } catch {}
      const t = opts.track;
      if (!t || typeof t !== "object" || Array.isArray(t) || typeof t.clip !== "string") { sendJSON(res, 400, { error: "track must be {clip: \"<clip id>\", …}" }); return; }
      const body = JSON.stringify(t);
      if (body.length > 8192) { sendJSON(res, 400, { error: "track spec too large" }); return; }
      sendJSON(res, 200, exportJobs.request({ kind: "track", where: opts.where, revision, track: JSON.parse(body) }));
    } catch (e) {
      sendJSON(res, e.code === 409 || e.code === 400 ? e.code : 500, { code: e.errorCode, error: String(e.message || e), busy: e.busy });
    }
    return;
  }
  if (p.startsWith("/api/export/job")) {
    const id = url.searchParams.get("id") || "";
    const action = p.slice("/api/export/job".length);
    let got = false;
    try {
      got = action === "" && req.method === "GET" ? exportJobs.get(id)
        : action === "/ticket" && req.method === "GET" ? exportJobs.ticket(id)
        : action === "/claim" && req.method === "POST" ? (exportJobs.claim(id, JSON.parse((await readBody(req)).toString("utf8") || "{}")) ? { ok: true } : undefined)
        : action === "/report" && req.method === "POST" ? exportJobs.report(id, JSON.parse((await readBody(req)).toString("utf8") || "{}"))
        : action === "/cancel" && req.method === "POST" ? exportJobs.cancel(id)
        : false;
    } catch (e) { sendJSON(res, 400, { error: String(e.message || e) }); return; }
    if (got === false) { sendJSON(res, 404, { error: "unknown export job endpoint" }); return; }
    if (got === undefined) { sendJSON(res, 409, { error: "job is not pending — another tab took it, or it ended" }); return; }
    if (got === null) { sendJSON(res, 404, { error: "no such export job" }); return; }
    sendJSON(res, 200, got);
    return;
  }

  /* API: fast export (browser-rendered frames → ffmpeg encode) */
  /* API: the FFmpeg card (ffmpeg-card.js) — the state, 「重新检测」, and a path typed into the card where there is no file
     dialog (web / server mode, the plugin). The desktop app chooses through its own file dialog instead. */
  if (p === "/api/ffmpeg" && req.method === "GET") { sendJSON(res, 200, await ffmpegStatus()); return; }
  if (p === "/api/ffmpeg/detect" && req.method === "POST") { sendJSON(res, 200, await redetectFfmpeg()); return; }
  /* #115's self-check after a download (ADR 4): can THIS program export MP4? Nothing switches to it here; 「重新检测」
     (or the next start) picks it if it should be used. → {ok, ffprobe, h264, encoders} | {ok:false, code:"notFfmpeg"} */
  if (p === "/api/ffmpeg/check" && req.method === "POST") {
    // the desktop app chooses only in its main process's file dialog; nothing here starts a program for it
    if (DESKTOP) { sendJSON(res, 403, { error: "the desktop app checks FFmpeg in its own file dialog", code: "EXTERNAL_FFMPEG_FORBIDDEN" }); return; }
    let body = {};
    try { body = JSON.parse((await readBody(req)).toString("utf8") || "{}"); } catch { }
    const file = typeof body.path === "string" ? body.path.trim() : "";
    const r = await X.checkTool(file);
    if (!r.ok) { sendJSON(res, 200, { ok: false, code: r.code }); return; }
    const encoders = Delivery.encodersFor("h264", await encodersOf(file));
    const probe = path.join(path.dirname(file), process.platform === "win32" ? "ffprobe.exe" : "ffprobe");
    sendJSON(res, 200, { ok: true, ffprobe: fs.existsSync(probe), h264: encoders.length > 0, encoders });
    return;
  }
  if (p === "/api/ffmpeg/choose" && req.method === "POST") {
    if (DESKTOP) { sendJSON(res, 403, { error: "the desktop app chooses FFmpeg in its own file dialog", code: "EXTERNAL_FFMPEG_FORBIDDEN" }); return; }
    let body = {};
    try { body = JSON.parse((await readBody(req)).toString("utf8") || "{}"); } catch { }
    const r = await X.saveTool(process.env.MONTCLIP_EXTERNAL_FFMPEG_SETTINGS, typeof body.path === "string" ? body.path.trim() : "");
    const st = await redetectFfmpeg();
    sendJSON(res, 200, { ...st, result: r.ok ? (st.state === "ready" ? "found" : st.state) : r.code });
    return;
  }
  if (p === "/api/export/ffmpeg" && req.method === "GET") {
    sendJSON(res, 200, HAS_FFMPEG ? { available: true } : { available: false, reason: FFMPEG_MISSING, ...ffmpegMissingBody() });
    return;
  }
  if (p === "/api/export/h264" && req.method === "GET") {
    sendJSON(res, 200, HAS_FFMPEG ? await h264Status() : { encoder: null, encoders: [], external: { ok: false, code: "none" }, reason: { code: FFMPEG_MISSING_CODE } });
    return;
  }
  if (p === "/api/export/profiles" && req.method === "GET") {
    try {
      const detail = url.searchParams.get("detail") === "1";
      sendJSON(res, 200, listProfilesPublic(detail));
    } catch (e) { sendJSON(res, 500, { error: String(e) }); }
    return;
  }
  /* API: delivery presets — GET lists the saved ones and the encoders this
     ffmpeg can use (the built-in presets live in delivery.js, which the page
     loads too); POST {name, spec} saves one to library/delivery/; POST
     /api/export/presets/delete {id} removes it. */
  if (p === "/api/export/presets" && req.method === "GET") {
    const encoders = [...(await deliveryEncoders())].filter((e) => Delivery.ENCODERS[e]).sort();
    sendJSON(res, 200, { ffmpeg: HAS_FFMPEG, encoders, saved: savedDeliveryPresets(), builtin: Delivery.PRESET_IDS });
    return;
  }
  if ((p === "/api/export/presets" || p === "/api/export/presets/delete") && req.method === "POST") {
    try {
      const opts = JSON.parse((await readBody(req)).toString("utf8") || "{}");
      if (p.endsWith("/delete")) {
        const id = Delivery.presetId(opts.id);
        const file = path.join(LIBRARY_DIR, "delivery", id + ".json");
        if (!id || !fs.existsSync(file)) { sendJSON(res, 404, { error: "no saved delivery preset " + JSON.stringify(opts.id) }); return; }
        fs.unlinkSync(file);
        broadcast("delivery-presets");
        sendJSON(res, 200, { ok: true, id });
        return;
      }
      const label = String(opts.name || "").trim().slice(0, 60);
      const id = Delivery.presetId(label);
      if (!id) { sendJSON(res, 400, { error: "name the preset (letters or digits)" }); return; }
      if (Delivery.PRESETS[id]) { sendJSON(res, 400, { error: `"${label}" is a built-in preset — pick another name` }); return; }
      // what the spec leaves out comes from the preset it names (built-in or saved), not from Custom
      const { spec, notes } = Delivery.normalize(opts.spec || {}, { presets: savedDeliveryPresets() });
      delete spec.preset;
      writeSaved("delivery", id, { id, label, ...spec });
      broadcast("delivery-presets");
      sendJSON(res, 200, { ok: true, id, label, notes });
    } catch (e) { sendJSON(res, 400, { error: String(e.message || e) }); }
    return;
  }
  // the desktop close prompt (desktop/export-close.js) asks this: is an export session open (begun, not ended)?
  if (p === "/api/export/active" && req.method === "GET") { sendJSON(res, 200, { active: exportSessions.size }); return; }
  /* The close prompt's 删掉它们并关闭: deletes exported copies that were not saved. Only a bare file name that this server
     itself exported (exportedThisRun) is deleted, from exports/ and nowhere else — no folder is scanned, no other file is
     looked at. A name that is not such a file is refused and left alone; one that cannot be deleted (a player has it
     open) is reported as failed and stays on the list, so it can be tried again. */
  if (p === "/api/export/delete-unsaved" && req.method === "POST") {
    let files;
    try { files = JSON.parse((await readBody(req)).toString("utf8") || "{}").files; } catch { files = null; }
    if (!Array.isArray(files) || files.length > 200) { sendJSON(res, 400, { error: "files: a list of exported file names" }); return; }
    const out = { deleted: [], failed: [], refused: [] };
    for (const name of files) {
      const ok = typeof name === "string" && name === path.basename(name) && name !== "." && name !== ".." && exportedThisRun.has(name);
      if (!ok) { out.refused.push(String(name)); continue; }
      try { fs.rmSync(path.join(EXPORTS_DIR, name), { force: true }); exportedThisRun.delete(name); out.deleted.push(name); }
      catch { out.failed.push(name); }
    }
    sendJSON(res, 200, out);
    return;
  }
  if (p === "/api/export/begin" && req.method === "POST") {
    try {
      const opts = JSON.parse((await readBody(req)).toString("utf8") || "{}");
      const mode = opts.mode === "annexb" ? "annexb" : "jpeg";
      if (mode !== "annexb" && opts.profile) resolveProfile(opts.profile); // 400, not 500, on a bad id — even without ffmpeg
      if (!HAS_FFMPEG) { sendJSON(res, 400, ffmpegMissingBody()); return; }
      // who began it: the editor may close (or claim) while the precheck awaits
      const connKey = typeof opts.conn === "string" ? opts.conn : null;
      const liveOwner = connKey ? [...sseClients].find((r) => sameSecret(connKey, r.montclipConn)) : null;
      const closedOwner = !liveOwner && connKey ? ownerCleanups.get(connKey) : null;
      const ownerConn = liveOwner ? liveOwner.montclipConn : closedOwner ? connKey : null;
      // tests only: hold the precheck so a claim or a close lands between this snapshot and the new session (#302)
      if (+process.env.MONTCLIP_TEST_BEGIN_DELAY_MS > 0) await new Promise((r) => setTimeout(r, +process.env.MONTCLIP_TEST_BEGIN_DELAY_MS));
      // a sample is what the job says it is; a page cannot ask for previews/ by itself
      const jobRec = typeof opts.job === "string" && opts.job ? exportJobs.get(opts.job) : null;
      const begun = await beginExport(opts.fps, opts.name, opts.profile, opts.hasAudio !== false, mode, { ...opts, preview: !!(jobRec && jobRec.preview) });
      /* Read the owner again after the precheck: the page can claim or close while it runs. The snapshot above has
         no task when begin came before claim, and the close handler's record carries the task that snapshot lacks --
         using either older value would leave the tab unmatched, or overwrite that task with null. */
      const liveNow = connKey ? [...sseClients].find((r) => sameSecret(connKey, r.montclipConn)) : null;
      const closedNow = !liveNow && connKey ? ownerCleanups.get(connKey) : null;
      const ownerTask = (liveNow && liveNow.montclipTask) || (closedNow && closedNow.task) || (liveOwner && liveOwner.montclipTask) || (closedOwner && closedOwner.task) || null;
      const ownerTabId = (liveNow && liveNow.montclipTabId) || (closedNow && closedNow.tabId) || (liveOwner && liveOwner.montclipTabId) || (closedOwner && closedOwner.tabId) || null;
      const sess = exportSessions.get(begun.id);
      if (sess) sess.check = ExportCheck.cleanPlan(opts.check);   // what the finished file is checked against (export-check.js)
      // the agent's export job this encode belongs to (export-jobs.js): when that job ends without a file, so does this
      if (typeof opts.job === "string" && opts.job && exportSessions.has(begun.id)) exportSessions.get(begun.id).job = opts.job;
      /* #302: an unfinished export can be discarded only by the page that began it: the page keeps this secret and
         sends it with its pagehide beacon, so a bare session id cannot stop another task's export. */
      const endToken = crypto.randomBytes(32).toString("hex");
      if (sess) {
        sess.endToken = endToken; begun.endToken = endToken;
        if (ownerConn) {
          sess.ownerConn = ownerConn;
          if (ownerTask) { sess.ownerSession = ownerTask.session; sess.ownerTabId = ownerTabId; }
          // the connection is gone now: use the same grace and same-tab reconnect rule as any close
          if (!liveNow) scheduleOwnerCleanup(ownerConn, ownerTask, ownerTabId);
        }
      }
      sendJSON(res, 200, begun);
    } catch (e) {
      // an unusable profile is the caller's problem, not a server fault
      const bad = /^Unknown encoding profile|was rejected by ffmpeg|ffmpeg rejected these settings|at most \d+ outputs|deliveries is empty|render each frame rate separately|export fps required|export width\/height required/.test(e.message || "");
      sendJSON(res, bad || e.status === 400 ? 400 : 500, { error: String(e.message || e), code: e.code, params: e.params, featurePack: e.featurePack, setup: e.setup });
    }
    return;
  }
  if (p === "/api/export/frame" && req.method === "POST") {
    const id = url.searchParams.get("id");
    const sess = exportSessions.get(id);
    if (!sess) { sendJSON(res, 404, { error: "no such export session" }); return; }
    try {
      const body = await readBody(req);
      if (sess.discarded || exportSessions.get(id) !== sess) { sendJSON(res, 410, { error: "export session was discarded" }); return; }
      if (!body || !body.length) throw new Error("empty frame");
      if (sess.hasAudio && !sess.wav) {
        sendJSON(res, 409, { error: "audio mix has not been uploaded yet" });
        return;
      }
      // queue behind any in-flight write so concurrent POSTs cannot interleave stdin
      const run = async () => {
        if (sess.discarded || exportSessions.get(id) !== sess) throw Object.assign(new Error("export session was discarded"), { code: "EXPORT_DISCARDED" });
        if (!sess.proc) sess.mode === "annexb" ? startAnnexbEncoder(sess) : startEncoder(sess);
        await (sess.outputs ? writeDeliveryFrame(sess, body) : writeExportFrame(sess, body));
      };
      const writeJob = sess.writeLock.then(run, run);
      sess.writeLock = writeJob.catch(() => {}); // keep the chain alive after a failed write
      await writeJob;
      touchExport(sess);
      sess.lastFrameAt = Date.now();   // the page is still alive: a closed event stream alone does not clean this export
      sendJSON(res, 200, { ok: true });
    } catch (e) {
      if (e.code === "EXPORT_DISCARDED") { sendJSON(res, 410, { error: e.message }); return; }
      cleanupExport(id);
      sendJSON(res, 500, { error: String(e.message || e) });
    }
    return;
  }
  if (p === "/api/export/audio" && req.method === "POST") {
    const id = url.searchParams.get("id");
    const sess = exportSessions.get(id);
    if (!sess) { sendJSON(res, 404, { error: "no such export session" }); return; }
    try {
      const wavPath = path.join(sess.dir, "audio.wav");
      try { fs.rmSync(wavPath, { force: true }); } catch {}
      await bodyToFile(req, wavPath);   // streamed: a long mix is not held in memory
      if (sess.discarded || exportSessions.get(id) !== sess) {
        try { fs.rmSync(sess.dir, { recursive: true, force: true }); } catch { }
        sendJSON(res, 410, { error: "export session was discarded" }); return;
      }
      // outputs that normalize loudness need the mix measured (loudnorm pass one) before ffmpeg starts
      const byTarget = new Map();
      for (const o of sess.outputs || []) {
        if (o.spec.audio.loudness == null || o.spec.audio.codec === "none") continue;
        const k = `${o.spec.audio.loudness}/${o.spec.audio.truePeak}`;
        if (!byTarget.has(k)) byTarget.set(k, runFfmpeg(Delivery.LOUDNORM_ARGS(wavPath, o.spec), 10 * 60 * 1000).then((r) => Delivery.parseLoudnorm(r.stderr)));
        o.loudnorm = await byTarget.get(k);
      }
      if (sess.discarded || exportSessions.get(id) !== sess) {
        try { fs.rmSync(sess.dir, { recursive: true, force: true }); } catch { }
        sendJSON(res, 410, { error: "export session was discarded" }); return;
      }
      sess.wav = wavPath;
      touchExport(sess);
      sendJSON(res, 200, { ok: true });
    } catch (e) { sendJSON(res, 500, { error: String(e) }); }
    return;
  }
  /* 〔复制问题信息〕 (JJ's table v2; #161): {text, language} → what is copied: its first line (the mail watcher's mark),
     then the text with viewers, keys, accounts and paths taken out, by the rules the page has too (problem-redact.js),
     with this computer's home folder and user name. */
  if (p === "/api/problem-details" && req.method === "POST") {
    let body;
    try { body = JSON.parse((await readBody(req)).toString("utf8") || "{}"); } catch { sendJSON(res, 400, { error: "the body must be JSON: {text}" }); return; }
    const userName = () => { try { return os.userInfo().username; } catch { return ""; } };
    // the files the raw error names, as their type and size only (JJ, #161): looked up here, never copied by name
    // never a path the page sent, only a file name where the server keeps files (problem-files.js; QQ, #161)
    let srcs = [];
    try { srcs = (JSON.parse(fs.readFileSync(PROJECT_FILE, "utf8").replace(/^\uFEFF/, "")).media || []).map((m) => m && m.src); } catch {}
    const where = { mediaDir: MEDIA_DIR, exportsDir: EXPORTS_DIR, srcs, resolve: resolveSrc };
    const sizeOf = (name) => ProblemFiles.sizeOf(name, where, fs.statSync);
    const files = Redact.fileMentions(String(body.log || "").slice(0, 8000)).map((f) => ({ ext: f.ext, size: sizeOf(f.name) }));
    // the version line (JJ / QQ, #161): package.json's version and the system's family only (problem-redact.js versionLine)
    const version = (() => { try { return require("../package.json").version; } catch { return ""; } })();
    const app = { version, platform: process.platform, release: os.release() };
    const p = { text: String(body.text || "").slice(0, 2000), code: body.code, files, app };
    sendJSON(res, 200, { text: Redact.problemDetails(p, { home: os.homedir(), platform: process.platform, user: userName(), language: body.language }) });
    return;
  }
  /* {fresh:true} once for a file this session exported (then forgotten); {fresh:false} for anything else */
  if (p === "/api/export/claim") {
    if (req.method !== "POST") { sendJSON(res, 405, { error: "POST only" }); return; }
    const name = url.searchParams.get("name") || "";
    sendJSON(res, 200, { fresh: freshExports.delete(name) });
    return;
  }
  if (p === "/api/export/end" && req.method === "POST") {
    const id = url.searchParams.get("id");
    const sess = exportSessions.get(id);
    if (!sess) { sendJSON(res, 404, { error: "no such export session" }); return; }
    try {
      if (url.searchParams.get("discard")) {
        if (!sess.endToken || !sameSecret(url.searchParams.get("token") || "", sess.endToken)) {
          sendJSON(res, 403, { error: "forbidden: this export session's token is required", code: "EXPORT_TOKEN_REFUSED" });
          return;
        }
        cleanupExport(id); sendJSON(res, 200, { ok: true }); return;
      }
      touchExport(sess); // keep alive through final mux
      if (!sess.proc) throw new Error("no frames were uploaded");
      if (sess.outputs) {
        // every output finishes on its own; the reply lists each file or why it failed
        const results = await Promise.all(sess.outputs.map(async (o) => {
          const file = path.basename(o.outPath);
          if (!o.failed) {
            o.proc.stdin.end();
            const code = await o.done;
            if (code !== 0) o.failed = "ffmpeg encode failed: " + o.err();
          }
          if (o.failed) return { file, ok: false, error: o.failed };
          // a file that cannot be put in place fails alone; the others keep finishing
          try { fs.renameSync(o.partPath, o.outPath); }
          catch (e) { return { file, ok: false, error: "could not save the file: " + (e.message || e) }; }
          const savedPart = o.partPath;
          o.partPath = null; // renamed — cleanup must not delete the finished file
          if (!sess.preview) { exportedThisRun.add(file); freshExports.add(file); }
          const report = await verifyDeliveryOutput(sess, o, o.outPath);
          const blank = await blankCheck(sess, o.outPath, o.loud, o.spec.audio.codec === "none");
          // MC-14: a piece whose sound was lost is not handed over — the file goes (「没有生成文件」)
          if (blank && blank.code === "EXPORT_AUDIO_FAILED") {
            try { fs.unlinkSync(o.outPath); } catch { }
            exportedThisRun.delete(file); freshExports.delete(file);
            return { file, ok: false, error: blank.error, code: blank.code, params: blank.params };
          }
          if (sess.preview) registerPreviewFile(o.outPath, savedPart);   // #325: ours from now on; keep the newest 20
          if (blank) return { file, ok: false, src: exportSrc(sess, file), error: blank.error, code: blank.code, ...(report ? { report } : {}) };
          return { file, ok: true, src: exportSrc(sess, file), ...(report ? { report: o.spec.audio.codec === "none" ? report : ExportCheck.withQuiet(report, sess.quiet, sess.unchecked) } : {}),
            ...(o.loudnorm ? { mixLoudness: o.loudnorm.input_i } : {}) };
        }));
        cleanupExport(id);
        const ok = results.filter((x) => x.ok);
        if (!ok.length) throw Object.assign(new Error(results.map((x) => `${x.file}: ${x.error}`).join(" · ")), { code: results.find((x) => x.code)?.code, params: results.find((x) => x.params)?.params });
        sendJSON(res, 200, { ok: true, src: ok[0].src, outputs: results });
        return;
      }
      sess.proc.stdin.end();
      const code = await sess.done;
      if (code !== 0) throw new Error("ffmpeg encode failed: " + sess.err());
      const out = sess.outPath;
      fs.renameSync(sess.partPath, out);
      const savedPart = sess.partPath;
      sess.partPath = null; // renamed — cleanup must not delete the finished file
      if (!sess.preview) { exportedThisRun.add(path.basename(out)); freshExports.add(path.basename(out)); }
      const blank = await blankCheck(sess, out, null);
      cleanupExport(id);
      if (blank && blank.code === "EXPORT_AUDIO_FAILED") { try { fs.unlinkSync(out); } catch { } exportedThisRun.delete(path.basename(out)); freshExports.delete(path.basename(out)); }
      else if (sess.preview) registerPreviewFile(out, savedPart);   // #325: ours from now on; keep the newest 20
      if (blank) throw Object.assign(new Error(`${path.basename(out)}: ${blank.error}`), { code: blank.code, params: blank.params });
      // a profile export has no delivery report: its warnings (a silent piece, one not checked in time) come on their own
      const warned = ExportCheck.warningReport(sess.quiet, sess.unchecked);
      sendJSON(res, 200, { ok: true, src: exportSrc(sess, path.basename(out)), ...(warned ? { report: warned } : {}) });
    } catch (e) { cleanupExport(id); sendJSON(res, 500, { error: String(e), ...(e && e.code ? { code: e.code } : {}), ...(e && e.params ? { params: e.params } : {}) }); }
    return;
  }

  /* API: reference analysis → edit blueprint (shots, beats, BPM, energy, music).
     POST body {src:"/media/ref.mp4", threshold?, music?} runs the analysis
     (seconds to ~a minute — decode-bound); GET ?src= returns the cached result. */
  if (p === "/api/analyze" && req.method === "GET") {
    const src = decodeURIComponent(url.searchParams.get("src") || "");
    const f = path.join(ANALYSIS_DIR, path.basename(src, path.extname(src)) + ".json");
    if (!src || !fs.existsSync(f)) { sendJSON(res, 404, { error: "no cached analysis for that src — POST /api/analyze first" }); return; }
    try { sendJSON(res, 200, JSON.parse(fs.readFileSync(f, "utf8"))); }
    catch (e) { sendJSON(res, 500, { error: String(e) }); }
    return;
  }
  if (p === "/api/analyze" && req.method === "POST") {
    if (!HAS_FFMPEG) { sendJSON(res, 400, ffmpegMissingBody()); return; }
    try {
      const opts = JSON.parse((await readBody(req)).toString("utf8") || "{}");
      const name = path.basename(decodeURIComponent(opts.src || ""));
      const file = path.join(MEDIA_DIR, name);
      if (!name || !fs.existsSync(file)) { sendJSON(res, 404, { error: "src must name an existing file under /media/" }); return; }
      const bp = await analyze(file, {
        threshold: opts.threshold,
        music: opts.music !== false,
        musicDir: MEDIA_DIR,
        srcUrl: "/media/" + encodeURIComponent(name),
      });
      if (bp.music) bp.music.src = "/media/" + encodeURIComponent(bp.music.name);
      fs.writeFileSync(path.join(ANALYSIS_DIR, path.basename(name, path.extname(name)) + ".json"),
        JSON.stringify(bp, null, 2));
      sendJSON(res, 200, bp);
    } catch (e) { sendJSON(res, 500, { error: String(e) }); }
    return;
  }

  /* API: one frame of a source clip, or an N-up contact sheet across it —
     the "eyes" to go with /api/analyze's ears, so an agent can look at a
     moment instead of guessing from an energy number. JPEG in, JPEG out.

       GET /api/frame?src=/media/x.mp4&t=3.2[&w=768][&q=4]
       GET /api/frame?src=/media/x.mp4&frames=12[&cols=][&from=0][&to=30][&w=320]
     (cols omitted → the squarest layout: 6 frames give 3×2, 12 give 4×3)
       GET /api/frame?path=C:\clips\x.mp4&t=3.2

     `src` is a served /media/ or /library/ path. `path` is any readable path on
     this machine — it does NOT copy the file into media/, because looking at a
     clip must not change the user's project folder. `path` is answered only
     with the `X-FableCut-Client: mcp` request header, which only the local MCP
     client sends: without it a web page could otherwise probe which files
     exist (`onload` vs `onerror`), make ffmpeg decode them, and fill the cache
     below with junk. resolveSrc() remains the guard for anything that turns a
     request string into a path inside a served root.

     &text=1 returns JSON statistics instead of the image, for agents (or
     models) that cannot see one. Needs the bundled ffmpeg.

     Results are cached under analysis/frames/ by a hash of every argument, so
     polling the same timestamp costs nothing and the mtime/size of the cached
     file answers "did the source change underneath this?". The cache is capped
     (500 files / 128 MB, oldest mtime first — see frame-cache.js), so no
     combination of arguments can fill the disk. */
  /* API: part of a file's audio, for the fast-export mix. The page used to fetch and decode the whole file, which on a
     2-hour recording (8 GB) read gigabytes, ran the tab out of memory and exported no sound (europa, 2026-11-04).
     WAV, 32-bit float, the file's own channels, 48 kHz; at most an hour (the page falls back to the whole file). */
  if (p === "/api/audio-window" && req.method === "GET") {
    const file = resolveSrc(url.searchParams.get("src") || "");
    if (!file) { sendJSON(res, 404, { error: "src must name an existing file under /media/ or /library/" }); return; }
    if (!HAS_FFMPEG) { sendJSON(res, 400, ffmpegMissingBody()); return; }
    const from = Number(url.searchParams.get("from")), to = Number(url.searchParams.get("to"));
    // the exported sound is track 0 whatever the entry picks for analysis (JJ on #177); `track` names another (试听)
    const track = audioTrackFor(url.searchParams.get("src") || "", url.searchParams.get("track") || "0");
    if (Number.isNaN(track)) { sendJSON(res, 400, BAD_TRACK); return; }
    if (!Number.isFinite(from) || !Number.isFinite(to) || from < 0 || to <= from || to - from > 3600) {
      sendJSON(res, 400, { error: "from and to are seconds, 0 ≤ from < to, at most an hour apart" }); return;
    }
    // written to a file (never held in memory: an hour of stereo is 1.4 GB), then streamed and removed
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "montclip-aw-")), out = path.join(tmpDir, "window.wav");
    const cleanup = () => { try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { } };
    const proc = spawn(FF.path("ffmpeg"), AudioWindow.windowArgs(file, from, to - from, out, track), { stdio: ["ignore", "ignore", "pipe"], windowsHide: true });
    let err = "", gone = false;
    proc.stderr.on("data", (d) => { err = (err + d).slice(-1000); });
    proc.on("error", () => { cleanup(); if (!res.headersSent) sendJSON(res, 500, { error: "ffmpeg could not be started" }); });
    res.on("close", () => { gone = true; if (proc.exitCode === null) proc.kill(); });
    proc.on("close", (code) => {
      if (gone || res.headersSent) { cleanup(); return; }
      let head = null, size = 0;
      try {
        size = fs.statSync(out).size;
        const fd = fs.openSync(out, "r"), buf = Buffer.alloc(Math.min(size, 64 * 1024));
        fs.readSync(fd, buf, 0, buf.length, 0); fs.closeSync(fd);
        head = AudioWindow.wavChunks(buf);
      } catch { }
      if (code !== 0 || !head || head.data.size === 0) {
        cleanup();
        sendJSON(res, 422, { error: "no audio in that part of the file: " + X.maskUserPath(err.trim().split("\n").pop() || "exit " + code) });
        return;
      }
      res.writeHead(200, { "Content-Type": "audio/wav", "Content-Length": size, "Cache-Control": "no-store" });
      const rs = fs.createReadStream(out);
      rs.on("close", cleanup); rs.on("error", () => { cleanup(); res.destroy(); });
      rs.pipe(res);
    });
    return;
  }
  if (p === "/api/frame" && req.method === "GET") {
    const pathArg = url.searchParams.get("path");
    /* `path=` reads any file on this machine, so it is only answered for the
       local MCP client, which proves itself with a custom header. An <img> or
       <form> on a web page cannot set one, and a cross-site fetch() that sets
       one needs a CORS preflight this server never grants — so a page in the
       user's browser can neither render a frame nor probe which files exist
       (a missing header is refused before the path is even resolved, so the
       answer leaks nothing). `src=` needs no header: those files are already
       served over HTTP at /media/ and /library/. */
    if (pathArg && req.headers["x-fablecut-client"] !== "mcp") {
      sendJSON(res, 403, { error: "path= needs the X-FableCut-Client: mcp request header — only the local MCP client may read files outside media/ and library/" });
      return;
    }
    /* The path is resolved next: whether a file is readable never depends on
       whether ffmpeg happens to be installed. */
    const src = url.searchParams.get("src") || "";
    const file = pathArg ? resolvePathArg(pathArg) : resolveSrc(src);
    if (!file) {
      sendJSON(res, 404, { error: pathArg
        ? "path must be an existing file on this machine"
        : "src must name an existing file under /media/ or /library/" });
      return;
    }
    if (!HAS_FFMPEG) { sendJSON(res, 400, ffmpegMissingBody()); return; }
    const num = (k, dflt) => {
      const raw = url.searchParams.get(k);
      if (raw === null || raw === "") return dflt;
      const n = Number(raw);
      if (!Number.isFinite(n)) throw new Error(`${k} must be a number`);
      return n;
    };
    try {
      fs.mkdirSync(FRAMES_DIR, { recursive: true });
      const isSheet = url.searchParams.get("frames") != null;
      const opts = isSheet
        ? { frames: num("frames"), cols: num("cols", null), from: num("from", 0), to: num("to", undefined), width: num("w", 320), quality: url.searchParams.get("q") }
        : { t: num("t", 0), width: num("w", 768), quality: url.searchParams.get("q") };
      // Key on the source's identity + size + mtime so an overwritten file
      // never serves a stale grab.
      const st = fs.statSync(file);
      const key = crypto.createHash("sha1")
        .update(JSON.stringify([file, st.size, Math.round(st.mtimeMs), opts])).digest("hex");
      const cache = path.join(FRAMES_DIR, key + ".jpg");
      let meta = null;
      try {
        meta = JSON.parse(fs.readFileSync(cache.replace(/\.jpg$/, ".json"), "utf8"));
      } catch { /* render below */ }
      // Self-healing: if the JPEG exists but meta doesn't, re-render so both are
      // written together. A partial write (JPEG with no meta) otherwise serves
      // 500 forever because meta stays null.
      if (!fs.existsSync(cache) || !meta) {
        const r = isSheet ? await frameGrid(file, opts) : await frame(file, opts);
        meta = isSheet
          ? { frames: r.frames, cols: r.cols, rows: r.rows, times: r.times, duration: r.duration, cellWidth: r.width, stats: r.stats }
          : { frames: 1, times: [r.time], stats: r.stats };
        meta.source = pathArg ? pathArg : src;
        const tmp = cache + ".tmp";
        fs.writeFileSync(tmp, r.jpeg);
        fs.renameSync(tmp, cache); // atomic: a half-written jpeg never gets cached
        fs.writeFileSync(cache.replace(/\.jpg$/, ".json"), JSON.stringify(meta));
        /* Bound the cache: every distinct argument set mints a file, so cap
           the directory oldest-first rather than letting it grow forever. */
        try { pruneCache(FRAMES_DIR); } catch { /* a prune failure is not the request's problem */ }
      } else {
        // Refresh LRU order so hot entries survive the prune above.
        try { fs.utimesSync(cache, new Date(), new Date()); } catch {}
      }
      /* text=1 answers JSON measurements instead of the picture, for agents and
         models that cannot see one. Same decode, no pixels over the wire. */
      if (url.searchParams.get("text") === "1") {
        sendJSON(res, 200, {
          source: meta.source, frames: meta.frames, times: meta.times,
          cols: meta.cols || null, rows: meta.rows || null, duration: meta.duration ?? null,
          stats: meta.stats || null,
        });
        return;
      }
      res.writeHead(200, {
        "Content-Type": "image/jpeg",
        "Content-Length": fs.statSync(cache).size,
        "Cache-Control": "no-cache",
        "X-FableCut-Frame-Times": (meta.times || []).join(","),
        "X-FableCut-Frame-Source": encodeURI(meta.source || src),
      });
      fs.createReadStream(cache).pipe(res);
    } catch (e) {
      const msg = e && e.message ? e.message : String(e);
      /* A bad argument, a missing file, or a timestamp past the end is the
         caller's problem; anything else is ours. */
      sendJSON(res, /must be|File not found|no video|no frame|past the end/.test(msg) ? 400 : 500, { error: msg });
    }
    return;
  }

  /* API: noise reduction — POST {src:"/media/…"|"/library/…", amount:"light"|"medium"|"strong"}
     writes a denoised FLAC of the whole file into media/ (reused if it exists)
     and returns {src, name, duration, channels}. Registering it is the caller's job. */
  if (p === "/api/denoise" && req.method === "POST") {
    if (!HAS_FFMPEG) { sendJSON(res, 400, ffmpegMissingBody()); return; }
    try {
      const opts = JSON.parse((await readBody(req)).toString("utf8") || "{}");
      if (!DENOISE_AMOUNTS.includes(opts.amount)) { sendJSON(res, 400, { error: `amount must be one of ${DENOISE_AMOUNTS.join(", ")}` }); return; }
      const file = resolveSrc(opts.src);
      if (!file) {
        sendJSON(res, 404, { error: "src must name an existing file under /media/ or /library/" });
        return;
      }
      const r = await denoiseFile(file, MEDIA_DIR, opts.amount);
      sendJSON(res, 200, { src: "/media/" + encodeURIComponent(r.name), name: r.name, duration: r.duration, channels: r.channels, cached: r.cached });
    } catch (e) { sendJSON(res, 500, { error: String(e.message || e) }); }
    return;
  }

  /* API: 〔帮我修好〕 (JJ, P3) — POST {src} starts a job (or joins the one running for that
     file) → {job, status, progress, phase}; GET /api/repair/job?id= → the same, with result {src, name, kind, duration,
     preparation, encoder?, …file details} once done, or error {code}; POST /api/repair/cancel?id= stops it. The new MP4
     is written into media/; the original is never touched. Swapping it into the project is the editor's job
     (MediaLib.swapMedia, one undo step), as fablecut_repair_media does for agents. */
  if (p === "/api/repair" && req.method === "POST") {
    if (!HAS_FFMPEG) { sendJSON(res, 400, ffmpegMissingBody()); return; }
    let opts;
    try { opts = JSON.parse((await readBody(req)).toString("utf8") || "{}"); } catch { sendJSON(res, 400, { error: "body must be JSON {src}" }); return; }
    const file = resolveSrc(opts.src);
    if (!file) { sendJSON(res, 404, { error: "src must name an existing file under /media/ or /library/" }); return; }
    sendJSON(res, 200, repairJobs.start(file, async ({ signal, onProgress }) => {
      const r = await MakeEditable.makeEditable(file, { outDir: MEDIA_DIR, signal, onProgress });
      const name = path.basename(r.file);
      const out = { src: "/media/" + encodeURIComponent(name), name, kind: "video", duration: r.duration, preparation: r.preparation, ...(r.encoder ? { encoder: r.encoder } : {}) };
      return { ...infoForEntry(await probeFile(r.file), out), ...out };
    }));
    return;
  }
  if (p === "/api/repair/job" && req.method === "GET") {
    const j = repairJobs.get(url.searchParams.get("id"));
    if (!j) { sendJSON(res, 404, { error: "no such repair job" }); return; }
    sendJSON(res, 200, j);
    return;
  }
  if (p === "/api/repair/cancel" && req.method === "POST") {
    const j = repairJobs.cancel(url.searchParams.get("id"));
    if (!j) { sendJSON(res, 404, { error: "no such repair job" }); return; }
    sendJSON(res, 200, j);
    return;
  }

  /* API: lengths the agent read for files that had none (QQ, #152 review): POST {updates:[{id, src, duration?,
     durationFrom?, durationUnknown?}]}. With an editor open they go to it (SSE "media-backfill"): it puts them into the
     project it has open, an unsaved step included, and saves once — the agent no longer writes over that step. With
     none open they are merged onto the project on disk here, as a PUT would write it. → {via:"editor"|"server", changed?} */
  if (p === "/api/media-backfill" && req.method === "POST") {
    let body;
    try { body = JSON.parse((await readBody(req)).toString("utf8") || "{}"); } catch { sendJSON(res, 400, { error: "body must be JSON {updates}" }); return; }
    const updates = body && Array.isArray(body.updates) ? body.updates.filter((u) => u && typeof u.id === "string" && typeof u.src === "string").slice(0, 2000) : null;
    if (!updates) { sendJSON(res, 400, { error: "updates must be a list of {id, src, duration | durationUnknown}" }); return; }
    if (sseClients.size) { broadcast("media-backfill", JSON.stringify({ updates })); sendJSON(res, 200, { via: "editor", editors: sseClients.size }); return; }
    try {
      const cur = JSON.parse(fs.readFileSync(PROJECT_FILE, "utf8").replace(new RegExp("^\\uFEFF"), ""));
      const changed = MediaLib.applyBackfill(cur, updates);
      if (changed) {
        cur.revision = (cur.revision || 0) + 1;
        const tmp = PROJECT_FILE + ".tmp";
        fs.writeFileSync(tmp, JSON.stringify(cur, null, 2));
        fs.renameSync(tmp, PROJECT_FILE);
        broadcast("change");
      }
      sendJSON(res, 200, { via: "server", changed, revision: cur.revision || 0 });
    } catch (e) { sendJSON(res, 500, { error: String(e.message || e) }); }
    return;
  }

  /* API: SSE live-reload channel */
  if (p === "/api/events") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream", "Cache-Control": "no-store",
      Connection: "keep-alive",
    });
    res.write("data: hello\n\n");
    res.montclipTabId = url.searchParams.get("tabId") || null;
    if (embed) {
      // this connection's own id, sent only on its stream: what the page hands in with its task ticket (/api/embed/claim)
      res.montclipConn = crypto.randomBytes(16).toString("hex");
      res.write(`event: conn\ndata: ${JSON.stringify({ conn: res.montclipConn })}\n\n`);
    }
    sseClients.add(res);
    req.on("close", () => {
    sseClients.delete(res);
    if (res.montclipTask) scheduleOwnerCleanup(res.montclipConn, res.montclipTask, res.montclipTabId);
  });
    return;
  }

  /* Media files (subfolders too — relinked footage can sit in one) */
  if (p.startsWith("/media/")) {
    const file = path.normalize(path.join(MEDIA_DIR, p.slice("/media/".length)));
    if (!file.startsWith(MEDIA_DIR + path.sep)) { res.writeHead(403); res.end(); return; }
    serveFile(req, res, file);
    return;
  }

  /* Proxies (analysis/proxies) */
  if (p.startsWith("/proxies/")) {
    const file = proxies.file(p.slice("/proxies/".length));
    if (!file) { res.writeHead(404); res.end(); return; }
    serveFile(req, res, file);
    return;
  }

  /* Finished exports */
  if (p.startsWith("/exports/")) {
    serveFile(req, res, path.join(EXPORTS_DIR, path.basename(p)));
    return;
  }
  /* #321: quick samples (previews/), served the same way and by name only */
  if (p.startsWith("/previews/")) {
    // the registry and work files (dot / fablecut- names) are the server's own, not samples
    const base = path.basename(p);
    if (base.startsWith(".")) { res.writeHead(404); res.end(); return; }
    serveFile(req, res, path.join(PREVIEWS_DIR, base));
    return;
  }

  /* API: on-device transcription (asr-local.js; #70). One file at a time; the transcript is saved like a tab's.
       GET  /api/asr/status            → {model, engine, vad, asr, punct}   (asr / punct: {ready, where, missing, bad})
       POST /api/asr/transcribe {src, ranges?, again?} → {src, status, gaps, gapSeconds, skippedSegments, words, duration, speech, punctuated, spans}
                                         (ranges: [[from, to], …] file seconds — only those parts are read and added to what the
                                         file's transcript already covers; spans: what it covers now, null = the whole file) once the
                                         transcript is saved; status complete or partial (gaps: how many parts could not
                                         be read, kept with the transcript); 500 {code: ASR_FAILED} when nothing could;
                                         progress as SSE "asr" ({src, frac}); 409 {code} when busy, when the model or the
                                         engine is missing, or when cancelled. Nothing is downloaded here.
       POST /api/asr/cancel            → {cancelled} */
  if (p === "/api/asr/status" && req.method === "GET") {
    const A = asrOrNull();
    const st = A ? A.status() : { model: null, engine: { ready: false, why: asrLoadError }, vad: { ready: false }, asr: ASR_NONE, punct: ASR_NONE };
    // code: why transcription cannot run here (asr-status.js), null when it can
    sendJSON(res, 200, { ...st, code: A ? AsrStatus.code(st) : asrLoadCode });
    return;
  }
  if (p === "/api/asr/cancel" && req.method === "POST") {
    const j = asrJob.running;
    if (j) j.ac.abort();
    sendJSON(res, 200, { cancelled: !!j });
    return;
  }
  if (p === "/api/asr/transcribe" && req.method === "POST") {
    let body;
    try { body = JSON.parse((await readBody(req)).toString("utf8") || "{}"); } catch { sendJSON(res, 400, { error: "the body must be JSON: {src}" }); return; }
    const src = typeof body.src === "string" ? body.src : "", file = src ? resolveSrc(src) : null;
    if (!file || !fs.existsSync(file)) { sendJSON(res, 404, { error: "no such file: " + src }); return; }
    const track = audioTrackFor(src, body.track);
    if (Number.isNaN(track)) { sendJSON(res, 400, BAD_TRACK); return; }
    // ranges: [[from, to], …] file seconds — listen only there (a long recording's clips, P8); none: the whole file
    let ranges = null;
    if (body.ranges != null) {
      const ok = Array.isArray(body.ranges) && body.ranges.length >= 1 && body.ranges.length <= 500
        && body.ranges.every((x) => Array.isArray(x) && Number.isFinite(x[0]) && Number.isFinite(x[1]) && x[0] >= 0 && x[1] > x[0]);
      if (!ok) { sendJSON(res, 400, { error: "ranges must be [[from, to], …] in file seconds (1–500), each with to > from ≥ 0" }); return; }
      ranges = body.ranges.map((x) => [x[0], x[1]]);
    }
    if (asrJob.running) { sendJSON(res, 409, { code: "ASR_BUSY", error: "already transcribing " + asrJob.running.src }); return; }
    const A = asrOrNull(), st = A ? A.status() : null;
    if (!st) { sendJSON(res, 409, { code: asrLoadCode, error: "the speech engine cannot be loaded in this copy of MontClip: " + asrLoadError }); return; }
    if (!st.engine.ready || !st.vad.ready) { sendJSON(res, 409, { code: "ASR_ENGINE_MISSING", error: "the speech engine is missing from this copy of MontClip" }); return; }
    if (!st.asr.ready) { sendJSON(res, 409, { code: "ASR_MODEL_MISSING", error: "no speech model yet: the user downloads it or imports it (USB drive / a file) in the Transcript tab; MontClip never fetches it by itself", missing: st.asr.missing, bad: st.asr.bad }); return; }
    const ac = new AbortController(), job = asrJob.running = { src, ac };
    res.on("close", () => { if (!res.writableFinished) ac.abort(); });   // the page went away: stop
    let last = 0;
    try {
      const TR = require("../transcribe.js");
      // the parts of the ranges this file's transcript (of this audio track, #177) has not listened to yet (all of them with again:true), read with a
      // pad either side; only each part's core is kept (Rea on #165: no lead-in doubled a word cut at the border)
      const had = ranges ? transcripts.get(src, track) || null : null;
      const info = await probeFile(file);
      const dur = info && info.duration;
      let plan = ranges ? TR.refillPlan(body.again === true ? null : had, ranges, { pad: 1.5, duration: dur }) : null;
      if (plan && !plan.read.length && !had) plan = { read: ranges, core: ranges };   // only slivers asked for, and nothing yet: read them as asked
      if (plan && !plan.read.length) {
        sendJSON(res, 200, { src, status: TR.status(had), gaps: had.gaps.length, gapSeconds: Math.round(had.gaps.reduce((t, g) => t + g[1] - g[0], 0) * 10) / 10,
          skippedSegments: 0, words: had.words.length, duration: had.duration, speech: 0, punctuated: null, spans: had.spans || null, already: true });
        return;
      }
      const r = await A.transcribe(file, { signal: ac.signal, duration: dur, ranges: plan ? plan.read : null, track,
        onCheckpoint: (part) => {
          let add = TR.validate({ ...part, src, model: TR.DEFAULT_MODEL, created: new Date().toISOString(), gaps: part.gaps.map(g => [g.start, g.end, g.reason]) });
          if (plan) add = TR.keepIn(add, plan.core);
          transcripts.put(src, TR.mergeDocs(transcripts.get(src, track) || null, add), track);
        },
        onProgress: (frac) => { const now = Date.now(); if (now - last > 250) { last = now; broadcast("asr", JSON.stringify({ src, frac })); } } });
      let add = TR.validate({ src, model: TR.DEFAULT_MODEL, language: r.language, duration: r.duration, created: new Date().toISOString(), words: r.words,
        gaps: r.gaps.map((g) => [g.start, g.end, g.reason]), ...(r.spans ? { spans: r.spans } : {}) });
      if (r.spans && plan) add = TR.keepIn(add, plan.core);
      // what was listened to before (other clips' windows of this file) stays; a new part replaces its own stretch
      const doc = transcripts.put(src, r.spans ? TR.mergeDocs(transcripts.get(src, track) || null, add) : add, track);
      broadcast("transcript", JSON.stringify({ src }));
      const gapSeconds = Math.round(doc.gaps.reduce((t, g) => t + g[1] - g[0], 0) * 10) / 10;
      sendJSON(res, 200, { src, status: TR.status(doc), gaps: doc.gaps.length, gapSeconds, skippedSegments: r.skippedSegments, words: doc.words.length, duration: doc.duration, speech: Math.round(r.speech * 10) / 10, punctuated: r.punctuated, spans: doc.spans || null });
    } catch (e) {
      const code = e.code === "ASR_CANCELLED" || ac.signal.aborted ? "ASR_CANCELLED" : e.code || "ASR_FAILED";
      const saved = transcripts.get(src, track)
        ? path.relative(DATA_DIR, transcripts.file(src, track)).split(path.sep).join('/') : null;
      if (!res.writableEnded) sendJSON(res, /^ASR_(CANCELLED|MODEL_MISSING|ENGINE_MISSING)$/.test(code) ? 409 : 500,
        require('./tool-error').toolError({ code, status: 'incomplete', saved, error: AsrStatus.incompleteText(e, saved) }, { dataDir: DATA_DIR }));
    } finally { if (asrJob.running === job) asrJob.running = null; }
    return;
  }

  /* Library assets (supports subfolders) */
  if (p.startsWith("/library/")) {
    const file = path.normalize(path.join(LIBRARY_DIR, p.slice("/library/".length)));
    if (!file.startsWith(LIBRARY_DIR + path.sep)) { res.writeHead(403); res.end(); return; }
    serveFile(req, res, file);
    return;
  }

  /* Static app files */
  let file = p === "/" ? "/index.html" : p;
  file = path.normalize(path.join(ROOT, file));
  if (!file.startsWith(ROOT + path.sep)) { res.writeHead(403); res.end(); return; }
  serveFile(req, res, file);
}

/* Auto-save versions of the open project while it changes (every FABLECUT_AUTO_VERSION_MIN
   minutes at most, default 10), whoever edits it: the editor, an agent, a script. */
setInterval(() => {
  try {
    const v = history.maybeAuto();
    if (v) broadcast("versions", JSON.stringify({ project: projects.peekActive(), action: "auto" }));
  } catch { }
}, 60_000).unref();

/** Web / server mode has no Settings dialog: say at start what H.264 export will use, and how to add x264. */
async function logH264AtStart() {
  if (DESKTOP || !HAS_FFMPEG || externalFfmpeg.setup !== "server") return;
  try {
    const st = await h264Status(), ext = await externalFfmpeg.current();
    const from = { settings: "the chosen FFmpeg", env: "MONTCLIP_EXTERNAL_FFMPEG", path: "FFmpeg on PATH" }[ext.source];
    if (st.encoder) console.log(`  H.264 export : ${st.encoder}${ext.ok && st.encoder === "libx264" && from ? ` (${from})` : ""}`);
    else console.log("  H.264 export : ⚠ none. Set MONTCLIP_EXTERNAL_FFMPEG to the full path of an FFmpeg with libx264 (e.g. /usr/bin/ffmpeg) and restart.");
    if (!ext.ok && ext.code === "extEnvUnusable") console.log(`                 ${X.maskUserPath(ext.reason)}`);
  } catch { }
}

server.listen(PORT, HOST, () => {
  boundPort = server.address().port;
  writerLock.update({ port: boundPort });
  console.log(`\n  MontClip running →  http://localhost:${boundPort}\n`);
  const ready = { type: "montclip-ready", origin: serverOrigin() };
  if (DESKTOP) {
    process.parentPort?.postMessage(ready);
    if (process.send) process.send(ready);
  }
  if (!["127.0.0.1", "localhost", "::1"].includes(HOST))
    console.log(`  ⚠ WARNING: HOST=${HOST} exposes the editor (and its file APIs) to the network.\n`);
  console.log(`  project file : ${PROJECT_FILE}`);
  console.log(`  media folder : ${MEDIA_DIR}`);
  console.log(`  library      : ${LIBRARY_DIR} (${LIBRARY_SUBDIRS.join(", ")})`);
  if (DATA_DIR !== APP_DIR) console.log(`  app files    : ${APP_DIR}`);
  logH264AtStart();
  console.log(`  ffmpeg       : ${HAS_FFMPEG ? "found (fast export + faststart remux on)" : "not available (real-time export only) — " + FFMPEG_MISSING}`);
  const enc = loadEncodeProfiles(true);
  console.log(`  encode prof. : ${PROFILES_FILE} (${Object.keys(enc.profiles).join(", ")} · default ${enc.default})`);
  for (const issue of enc.issues || []) console.log(`     ⚠ ${issue}`);
  console.log("");
  startExportSweep();
});

let shuttingDown = false;
/* Quitting (desktop: before-quit gives this 4 s, then kills the process): running exports are stopped — ffmpeg
   first, then their half-finished files and fablecut-XXXX folders — within 3 s; what could not be deleted is
   logged, and the process exits either way. Exported files that were not saved yet are not touched. */
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  setTimeout(() => process.exit(0), 3700).unref?.();
  stopExportSweep();
  for (const record of ownerCleanups.values()) clearTimeout(record.timer);
  ownerCleanups.clear();
  const sessions = [...exportSessions.values()];
  exportSessions.clear();
  exportJobs.shutdown();
  ownedProcesses?.stop();
  try { await Promise.all([ExportCleanup.stopSessions(sessions, { timeoutMs: 3000, log: logCleanupLeft }), ...pendingCleanups]); } catch {}
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 200).unref?.();
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
if (DESKTOP) {
  process.parentPort?.on("message", ({ data }) => { if (data?.type === "shutdown") shutdown(); });
  process.on("message", (data) => { if (data?.type === "shutdown") shutdown(); });
  process.on("disconnect", shutdown);
}
