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
/* A local FFmpeg the user chose for libx264, H.264 export only (external-ffmpeg.js). */
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
  dryRunProfile,
} = require("./encode-profiles");
const { downloadImportUrl, maybeFaststart } = require("./import-url");
const { prepareMedia, publicPreparationError } = require("./prepare-media");
const { pruneCache } = require("./frame-cache");
const { createExportJobs } = require("./export-jobs");
const { denoiseFile, AMOUNT_IDS: DENOISE_AMOUNTS } = require("./denoise");

const {
  APP_DIR, DATA_DIR, MEDIA_DIR, EXPORTS_DIR, ANALYSIS_DIR, LIBRARY_DIR,
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
const Templates = require("./templates");
const { probeFile } = require("./media-probe");
const MediaLib = require("./media-lib");
const { createProxies } = require("./proxy");
const { createTranscripts } = require("./transcripts");
const Delivery = require("./delivery");
const ExportCleanup = require("./export-cleanup");
const { createProjects } = require("./projects");
const { createHistory } = require("./history");

/* Static app files are served from the install dir; everything the user creates
   lives under DATA_DIR. The two are the same unless FABLECUT_DATA_DIR is set. */
const ROOT = APP_DIR;
const PORT = process.env.PORT || 7777;
const HOST = process.env.HOST || "127.0.0.1";
const DESKTOP = process.env.MONTCLIP_DESKTOP === "1";
const DESKTOP_TOKEN = process.env.MONTCLIP_SESSION_TOKEN;
if (DESKTOP && (HOST !== "127.0.0.1" || !/^[a-f0-9]{64}$/.test(DESKTOP_TOKEN || "")))
  throw new Error("Desktop requires loopback binding and a fresh session token");
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
function requestAllowed(req) {
  if (DESKTOP) {
    if (req.headers.host !== `127.0.0.1:${boundPort}` ||
        req.headers["x-montclip-session"] !== DESKTOP_TOKEN) return false;
    return !req.headers.origin || req.headers.origin === serverOrigin();
  }
  if (!hostAllowed(req.headers.host)) return false;
  const origin = req.headers.origin;
  if (origin) {
    try { return hostAllowed(new URL(origin).host); } catch { return false; }
  }
  return true;
}

/* ffmpeg powers optional niceties (faststart remux on upload, fast export).
   Everything else works without it. It is always the bundled build
   (ffmpeg-path.js); FFMPEG_MISSING says in plain words why it is unavailable. */
let HAS_FFMPEG = false;
let FFMPEG_MISSING = FF.reason("ffmpeg");
/* the page says "ffmpegMissing" in its language; the English reasons of a development setup stay English */
const FFMPEG_MISSING_CODE = FF.missingCode({ source: FF.source("ffmpeg") });
if (!FFMPEG_MISSING) {
  try { HAS_FFMPEG = spawnSync(FF.path("ffmpeg"), ["-version"], { stdio: "ignore", timeout: 15000, windowsHide: true }).status === 0; } catch {}
  if (!HAS_FFMPEG) FFMPEG_MISSING = `MontClip's bundled ffmpeg (${FF.path("ffmpeg")}) could not be started. Reinstall MontClip to restore it.`;
}

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
const asr = () => asrLocal || (asrLocal = require("./asr-local").createAsr({ asrDir: ASR_DIR, modelsDir: ASR_MODELS_DIR, ffmpeg: FF.path("ffmpeg"), cacheDir: path.join(DATA_DIR, "asr-cache") }));
const asrJob = { running: null };
/** Optional speech models (asr-optional.js; ADR 2026-11-04 §6): only after the streamer agreed in the desktop host's own
 *  box and every file matched its SHA-256. While one is in use, transcription runs it in a process of its own
 *  (asr-optional-engine.js), so it can fail without taking this server or the default engine with it. Nothing here
 *  agrees, downloads or switches: the API only reports, and says the streamer has to choose it in Settings. */
let asrOptStore = null, asrOptEngine = null;
const asrOptional = () => asrOptStore || (asrOptStore = require("./asr-optional").createOptional({ userDir: ASR_MODELS_DIR }));
const asrOptionalEngine = () => asrOptEngine || (asrOptEngine = require("./asr-optional-engine").createOptionalAsr({ asrDir: ASR_DIR, optional: asrOptional(), ffmpeg: FF.path("ffmpeg") }));
/** The optional model in use, or null (also when the optional models cannot be read at all: the default is used). */
const asrOptionalActive = () => { try { return asrOptional().active(); } catch { return null; } };
const asrOptionalSummary = () => { try { const o = asrOptional(); return { active: o.active(), models: o.list() }; } catch (e) { return { active: null, models: [], error: String(e.message || e) }; } };

ensureDirs();
/* One engine writes a data folder (writer-lock.js): the Windows app and the Cindy plugin share this
   engine, and two of them on one folder would save over each other. MONTCLIP_SHELL names the shell. */
const SHELL = process.env.MONTCLIP_SHELL || (DESKTOP ? "desktop" : "server");
const writerLock = require("./writer-lock").acquire(DATA_DIR, { shell: SHELL });
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
function broadcast(event = "change", data = event) {
  const payload = `event: ${event}\ndata: ${data}\n\n`;
  for (const res of sseClients) res.write(payload);
}
const proxies = createProxies({ dir: PROXIES_DIR, resolveSrc, probe: probeFile, ffmpeg: FF.path("ffmpeg"), broadcast: (ev, data) => broadcast(ev, data),
  // proxies are for preview: the bundled build's own H.264 encoder only, never the user's FFmpeg
  encoder: async () => Delivery.encodersFor("h264", await bundledEncoders()).find((e) => e !== "libx264") || null,
  noEncoder: () => X.noH264Reason({ mediaFoundation: hasMediaFoundation() }) });
/* Word transcripts, one per version of a file (fablecut_transcribe, the Transcript tab). */
const transcripts = createTranscripts({ dir: path.join(ANALYSIS_DIR, "transcripts"), resolveSrc });
// P2 highlight signals: each file's loudness, read once by ffmpeg as a stream and cached per file version
const signals = require("./signals").createSignals({ dir: path.join(ANALYSIS_DIR, "signals"), ffmpeg: FF.path("ffmpeg") });
// P2 songs: each file read in segments, each kept as it is read (analysis/songs/), so a stopped scan carries on
const Songs = require("./songs");
const songScan = require("./song-scan").createSongScan({ dir: path.join(ANALYSIS_DIR, "songs"), ffmpeg: FF.path("ffmpeg") });
const songJobs = new Map();   // src → {state, done, total, ctrl, error, code}
// the drive the song analysis is written to ("C" on Windows), for 「{drive} 盘空间不够」 — never the path
const songDrive = () => { const root = path.parse(path.resolve(ANALYSIS_DIR)).root; return /^[A-Za-z]:/.test(root) ? root[0].toUpperCase() : root; };
async function startSongScan(src, file, again) {
  const old = songJobs.get(src);
  if (old && old.state === "running") return old;
  if (again) songScan.forget(file);
  let total = null;
  try { const info = await probeFile(file); if (info && info.duration > 0) total = Math.max(1, Math.ceil(info.duration / songScan.SEGMENT)); } catch { /* unknown length */ }
  const job = { state: "running", done: songScan.cached(file).done, total, ctrl: new AbortController(), error: null };
  songJobs.set(src, job);
  const tell = () => broadcast("songs", JSON.stringify({ src, state: job.state, done: job.done, total: job.total }));
  songScan.scan(file, { signal: job.ctrl.signal, onSegment: (i) => { job.done = i + 1; tell(); } })
    .then((r) => { job.state = r.complete ? "done" : "stopped"; job.done = songScan.cached(file).done; })
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
function faststart(file) { return maybeFaststart(file); }

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
let deliveryEncodersP = null;
function runFfmpeg(args, timeout = 15000, bin = FF.path("ffmpeg")) {
  return new Promise((resolve) => {
    execFile(bin, args, { timeout, maxBuffer: 8 * 1024 * 1024, windowsHide: true },
      (err, stdout, stderr) => resolve({ code: err ? (err.code ?? 1) : 0, stdout: String(stdout || ""), stderr: String(stderr || "") }));
  });
}
/** Encoders an export may use: the bundled build's (checked once), plus libx264 while
 *  the user's local FFmpeg checks out (re-checked when the setting or file changes). */
async function deliveryEncoders() {
  if (!HAS_FFMPEG) return new Set();
  return externalFfmpeg.available(await bundledEncoders());
}
function bundledEncoders() {
  if (deliveryEncodersP) return deliveryEncodersP;
  deliveryEncodersP = (async () => {
    const listed = Delivery.parseEncoders((await runFfmpeg(["-hide_banner", "-encoders"])).stdout);
    const usable = new Set([...listed].filter((e) => !Delivery.ENCODERS[e]?.hw));
    await Promise.all([...listed].filter((e) => Delivery.ENCODERS[e]?.hw).map(async (e) => {
      const r = await runFfmpeg(["-hide_banner", "-v", "error", "-f", "lavfi", "-i", "color=c=black:s=256x144:r=30:d=0.1",
        "-frames:v", "2", "-c:v", e, "-pix_fmt", Delivery.ENCODERS[e].hw === "nvenc" ? "yuv420p" : "nv12", "-f", "null", "-"]);
      if (r.code === 0) usable.add(e);
    }));
    return usable;
  })();
  return deliveryEncodersP;
}
/** Windows has Media Foundation (missing on "N" editions without the Media Feature Pack). */
const hasMediaFoundation = () => process.platform !== "win32" ||
  fs.existsSync(path.join(process.env.SystemRoot || "C:/Windows", "System32", "mfplat.dll"));
/** The program that encodes an export: the user's local FFmpeg only for libx264, else the bundled one. */
async function exportBinary(useX264) {
  if (!useX264) return FF.path("ffmpeg");
  const ext = await externalFfmpeg.current();
  if (ext.ok) return ext.path;
  throw Object.assign(new Error(ext.reason === "none"
    ? "libx264 is only available from your own FFmpeg: choose it in Settings, or use a delivery preset (MontClip then uses the graphics card or Windows' own H.264 encoder)."
    : "Your local FFmpeg cannot be used: " + X.maskUserPath(ext.reason)), { status: 400, code: ext.reason === "none" ? "extNeeded" : ext.code });
}
/** What H.264 export will use here, for the export dialog and agents. */
async function h264Status() {
  const available = await deliveryEncoders();
  const list = Delivery.encodersFor("h264", available);
  const ext = await externalFfmpeg.current();
  return { encoder: list[0] || null, encoders: list, external: ext.ok ? { ok: true } : { ok: false, code: ext.code },
    reason: list.length ? null : X.noH264({ mediaFoundation: hasMediaFoundation() }) };
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
      throw Object.assign(new Error(`The exported picture (${frame.outW}×${frame.outH}) is smaller than this computer's H.264 encoder accepts (${[...available].filter((e) => Delivery.ENCODERS[e]?.min).map((e) => Delivery.ENCODERS[e].label + " needs " + Delivery.ENCODERS[e].min.join("×")).join(", ")}). Export a larger size, or choose another format.`), { status: 400, code: "frameTooSmall", params: { w: frame.outW, h: frame.outH } });
    return { spec, notes, noteCodes: [], name: d && typeof d.name === "string" ? d.name : name, frame };
  });
  // one render has one frame rate: an output asking for another needs a render of its own
  const off = outs.map((o, i) => [o, i]).filter(([o]) => o.spec.fps != null && Math.abs(o.spec.fps - rate) > 0.01);
  if (off.length) throw new Error(off.map(([o, i]) => `output ${i + 1} asks for ${o.spec.fps} fps but this render is ${rate} fps`).join("; ") + " — render each frame rate separately");
  const input = outs.some((o) => Delivery.frameInput(o.spec) === "rgba") ? "rgba" : "jpeg";
  // H.264 with no encoder at all: say why now, not after the render
  if (outs.some((o) => o.spec.video.codec === "h264") && !Delivery.encodersFor("h264", available).length)
    throw Object.assign(new Error(X.noH264Reason({ mediaFoundation: hasMediaFoundation() })), { status: 400, ...X.noH264({ mediaFoundation: hasMediaFoundation() }) });
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
  const dir = fs.mkdtempSync(path.join(EXPORTS_DIR, "fablecut-"));
  const duration = Number.isFinite(+extra.duration) && +extra.duration > 0 ? +extra.duration : null;
  for (const o of outs) {
    const ext = Delivery.CONTAINERS[o.spec.container].ext;
    Object.assign(o, reserveExportPaths(EXPORTS_DIR, exportName(o.name || "export"), ext), { proc: null, stderr: "", done: null, failed: null });
    o.err = () => o.stderr.trim().split("\n").filter(Boolean).slice(-3).map((l) => l.trim()).join(" · ");
  }
  const sess = {
    mode: "jpeg", proc: null, fps: rate, outputs: outs, input, canvasW, canvasH, duration,
    hasAudio: !!hasAudio, dir, wav: null, partPath: null, outPath: null,
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
  const r = await runFfmpeg(Delivery.LOUDNESS_ARGS(file), timeout);
  return r.code === 0 ? Delivery.parseEbur128(r.stderr) : null;
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
    const [probe, loud] = await Promise.all([ffprobeJSON(file), loudWanted ? measureLoudness(file, VERIFY_LOUDNESS_MS) : null]);
    if (!probe) return failed("could not read the file back to check it (ffprobe)");
    let size = 0;
    try { size = fs.statSync(file).size; } catch {}
    return Delivery.verify(o.spec, probe, {
      fps: sess.fps, frames: sess.frames || (sess.duration ? Math.round(sess.duration * sess.fps) : null), duration: sess.duration,
      size, loud, loudWanted, frame: o.frame, hasAudio: !!sess.wav,
    });
  } catch (e) { return failed("could not check the file: " + (e.message || e)); }
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
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const safe = exportName(name || "export");
  // Same filesystem as the finished file so renameSync(partPath, out) cannot EXDEV.
  const dir = fs.mkdtempSync(path.join(EXPORTS_DIR, "fablecut-"));

  if (m === "annexb") {
    const { outPath, partPath } = reserveExportPaths(EXPORTS_DIR, safe, ".mp4");
    const sess = {
      mode: m, fps: rate, proc: null, dir,
      name: safe, hasAudio: !!hasAudio,
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
  // a raw profile that encodes with libx264 needs the user's local FFmpeg
  const binary = await exportBinary(X.argsUseX264(profile.args));
  const dry = await dryRunProfile(profile, { fps: rate, hasAudio, bin: binary });
  if (!dry.ok) throw new Error(`profile "${profile.id}" was rejected by ffmpeg: ${X.maskUserPath(dry.error)}`);
  // Reserve the output name now (not at first frame) so concurrent exports
  // cannot both see the same free path. The empty .part file is overwritten by ffmpeg (-y).
  const { outPath, partPath } = reserveExportPaths(EXPORTS_DIR, safe, profile.extension);
  const sess = {
    mode: m, proc: null, fps: rate, profile, name: safe, hasAudio: !!hasAudio, binary,
    pixelFormat, width, height,
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
    fps: sess.fps, wavPath: sess.wav, outPath: sess.partPath,
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
  exportSessions.delete(id);
  const job = ExportCleanup.stopSessions([s], { timeoutMs: 5000, log: logCleanupLeft });
  pendingCleanups.add(job); job.finally(() => pendingCleanups.delete(job));
}
/** Paths an export cleanup could not delete, kept in DATA_DIR/logs/export-cleanup.log (local only). */
function logCleanupLeft(left) {
  const line = left.map((p) => `${new Date().toISOString()} not removed: ${X.maskUserPath(p)}`).join("\n") + "\n";   // no user name (QQ)
  console.error(line.trim());
  try { fs.mkdirSync(path.join(DATA_DIR, "logs"), { recursive: true }); fs.appendFileSync(path.join(DATA_DIR, "logs", "export-cleanup.log"), line); } catch {}
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
  url: (id) => `${DESKTOP ? serverOrigin() : `http://localhost:${boundPort}`}/?exportJob=${encodeURIComponent(id)}`,
  broadcast,
  editors: () => sseClients.size,
});

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
const server = http.createServer(async (req, res) => {
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
  if (p === "/api/ui/command" && req.method === "POST") {
    let a;
    try { a = JSON.parse((await readBody(req)).toString("utf8") || "{}"); }
    catch { sendJSON(res, 400, { error: "body must be JSON {cmd, t?}" }); return; }
    if (!["undo", "redo", "seek", "state"].includes(a.cmd)) { sendJSON(res, 400, { error: "cmd must be undo, redo, seek or state" }); return; }
    if (a.cmd === "seek" && !(Number.isFinite(+a.t) && +a.t >= 0)) { sendJSON(res, 400, { error: "seek needs t (seconds, ≥ 0)" }); return; }
    const id = crypto.randomUUID();
    const answer = await new Promise((resolve) => {
      const timer = setTimeout(() => { uiCommands.delete(id); resolve(null); }, 4000);
      uiCommands.set(id, (r) => { clearTimeout(timer); uiCommands.delete(id); resolve(r); });
      broadcast("ui-command", JSON.stringify({ id, cmd: a.cmd, ...(a.cmd === "seek" ? { t: +a.t } : {}) }));
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
    try { sendJSON(res, 200, await signals.loudness(file)); }
    catch (e) { sendJSON(res, 422, { error: X.maskUserPath(e.message), code: e.code || "SIGNALS_FAILED" }); }   // no local paths in the answer (QQ, #52)
    return;
  }
  /* API: the songs in a file (P2 「找出每首歌」; song-scan.js reads, songs.js finds).
       POST /api/songs {src, again?} → 202 {src, state, done, total} — starts the scan, or carries on from the first segment
                                       not read yet; again:true forgets what was read
       GET  /api/songs?src=          → {src, key, state, done, total, complete, scanned, songs} — songs in file seconds
       POST /api/songs/cancel {src}  → {src, state} — stops the scan; what was read is kept
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
    try {
      if (p === "/api/songs/cancel") {
        const job = songJobs.get(src);
        if (job && job.state === "running") job.ctrl.abort();
        sendJSON(res, 200, { src, state: job ? job.state : "none" });
        return;
      }
      if (req.method === "POST") {
        const job = await startSongScan(src, file, body.again === true);
        sendJSON(res, 202, { src, state: job.state, done: job.done, total: job.total });
        return;
      }
      const have = songScan.load(file), job = songJobs.get(src);
      const state = job && job.state === "running" ? "running" : have.complete ? "done" : job ? job.state : have.done ? "stopped" : "none";
      sendJSON(res, 200, { src, key: have.key, state, done: have.done, total: job ? job.total : null, complete: have.complete, scanned: have.scanned,
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
    const d = transcripts.get(src);
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
        const d = transcripts.put(src, body);
        broadcast("transcript", JSON.stringify({ src }));
        sendJSON(res, 200, { src, words: d.words.length });
      } else if (p === "/api/transcript/delete") {
        const deleted = transcripts.remove(String(body.src || ""));
        if (deleted) broadcast("transcript", JSON.stringify({ src: String(body.src) }));
        sendJSON(res, 200, { deleted });
      } else {
        const status = {};
        for (const src of (Array.isArray(body.srcs) ? body.srcs.slice(0, 2000).map(String) : [])) status[src] = transcripts.info(src);
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
      const TR = require("./transcribe.js");
      let spec;
      try { spec = { srcs: [...new Set(t.srcs)], model: TR.model(t.model), language: TR.language(t.language), again: t.again === true }; }
      catch (e) { sendJSON(res, 400, { error: e.message }); return; }
      sendJSON(res, 200, exportJobs.request({ kind: "transcribe", where: opts.where, transcribe: spec }));
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
      if (p === "/api/proxy" && !HAS_FFMPEG) { sendJSON(res, 503, { error: FFMPEG_MISSING, code: FFMPEG_MISSING_CODE }); return; }
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
      await faststart(target);
      sendJSON(res, 200, { ok: true, ...await prepareMedia(target) });
    } catch (e) { sendJSON(res, ["FLV_TRANSCODE_REQUIRED","FLV_READABLE_CONSENT_REQUIRED"].includes(e.code) ? 409 : 500, publicPreparationError(e)); }
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
      sendJSON(res, 200, { ok: true, ...await prepareMedia(file, {allowTranscode: body.allowTranscode, acceptReadable: body.acceptReadable}) });
    } catch (e) { sendJSON(res, ["FLV_TRANSCODE_REQUIRED","FLV_READABLE_CONSENT_REQUIRED"].includes(e.code) ? 409 : 500, publicPreparationError(e)); }
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
     polls it; the editor tab claims, reports and finishes it. */
  if (p === "/api/export/request" && req.method === "POST") {
    try {
      const opts = JSON.parse((await readBody(req)).toString("utf8") || "{}");
      exportJobs.assertWhere(opts.where);
      if (!HAS_FFMPEG) { sendJSON(res, 400, { error: FFMPEG_MISSING, code: FFMPEG_MISSING_CODE }); return; }
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
      const job = exportJobs.request({ range: opts.range, profile: opts.profile, delivery: deliveries ? null : delivery, deliveries, where: opts.where, revision });
      sendJSON(res, 200, deliveries ? { ...job, delivery: `${deliveries.length} outputs from one render`, notes: outNotes }
        : delivery ? { ...job, delivery: Delivery.describe(delivery), notes } : job);
    } catch (e) {
      const code = e.code === 409 || e.code === 400 ? e.code : /^Unknown encoding profile/.test(e.message || "") ? 400 : 500;
      sendJSON(res, code, { code: e.errorCode, error: String(e.message || e) });
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
      sendJSON(res, e.code === 409 || e.code === 400 ? e.code : 500, { code: e.errorCode, error: String(e.message || e) });
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
      sendJSON(res, e.code === 409 || e.code === 400 ? e.code : 500, { code: e.errorCode, error: String(e.message || e) });
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
        : action === "/claim" && req.method === "POST" ? (exportJobs.claim(id) ? { ok: true } : undefined)
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
  if (p === "/api/export/ffmpeg" && req.method === "GET") {
    sendJSON(res, 200, HAS_FFMPEG ? { available: true } : { available: false, reason: FFMPEG_MISSING, code: FFMPEG_MISSING_CODE });
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
      if (!HAS_FFMPEG) { sendJSON(res, 400, { error: FFMPEG_MISSING, code: FFMPEG_MISSING_CODE }); return; }
      sendJSON(res, 200, await beginExport(opts.fps, opts.name, opts.profile, opts.hasAudio !== false, mode, opts));
    } catch (e) {
      // an unusable profile is the caller's problem, not a server fault
      const bad = /^Unknown encoding profile|was rejected by ffmpeg|ffmpeg rejected these settings|at most \d+ outputs|deliveries is empty|render each frame rate separately|export fps required|export width\/height required/.test(e.message || "");
      sendJSON(res, bad || e.status === 400 ? 400 : 500, { error: String(e.message || e), code: e.code, params: e.params, featurePack: e.featurePack });
    }
    return;
  }
  if (p === "/api/export/frame" && req.method === "POST") {
    const id = url.searchParams.get("id");
    const sess = exportSessions.get(id);
    if (!sess) { sendJSON(res, 404, { error: "no such export session" }); return; }
    try {
      const body = await readBody(req);
      if (!body || !body.length) throw new Error("empty frame");
      if (sess.hasAudio && !sess.wav) {
        sendJSON(res, 409, { error: "audio mix has not been uploaded yet" });
        return;
      }
      // queue behind any in-flight write so concurrent POSTs cannot interleave stdin
      const run = async () => {
        if (!sess.proc) sess.mode === "annexb" ? startAnnexbEncoder(sess) : startEncoder(sess);
        await (sess.outputs ? writeDeliveryFrame(sess, body) : writeExportFrame(sess, body));
      };
      const writeJob = sess.writeLock.then(run, run);
      sess.writeLock = writeJob.catch(() => {}); // keep the chain alive after a failed write
      await writeJob;
      touchExport(sess);
      sendJSON(res, 200, { ok: true });
    } catch (e) {
      cleanupExport(id);
      sendJSON(res, 500, { error: String(e.message || e) });
    }
    return;
  }
  if (p === "/api/export/audio" && req.method === "POST") {
    const sess = exportSessions.get(url.searchParams.get("id"));
    if (!sess) { sendJSON(res, 404, { error: "no such export session" }); return; }
    try {
      const wavPath = path.join(sess.dir, "audio.wav");
      try { fs.rmSync(wavPath, { force: true }); } catch {}
      await bodyToFile(req, wavPath);   // streamed: a long mix is not held in memory
      // outputs that normalize loudness need the mix measured (loudnorm pass one) before ffmpeg starts
      const byTarget = new Map();
      for (const o of sess.outputs || []) {
        if (o.spec.audio.loudness == null || o.spec.audio.codec === "none") continue;
        const k = `${o.spec.audio.loudness}/${o.spec.audio.truePeak}`;
        if (!byTarget.has(k)) byTarget.set(k, runFfmpeg(Delivery.LOUDNORM_ARGS(wavPath, o.spec), 10 * 60 * 1000).then((r) => Delivery.parseLoudnorm(r.stderr)));
        o.loudnorm = await byTarget.get(k);
      }
      sess.wav = wavPath;
      touchExport(sess);
      sendJSON(res, 200, { ok: true });
    } catch (e) { sendJSON(res, 500, { error: String(e) }); }
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
      if (url.searchParams.get("discard")) { cleanupExport(id); sendJSON(res, 200, { ok: true }); return; }
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
          o.partPath = null; // renamed — cleanup must not delete the finished file
          exportedThisRun.add(file);
          freshExports.add(file);
          const report = await verifyDeliveryOutput(sess, o, o.outPath);
          return { file, ok: true, src: "/exports/" + encodeURIComponent(file), ...(report ? { report } : {}),
            ...(o.loudnorm ? { mixLoudness: o.loudnorm.input_i } : {}) };
        }));
        cleanupExport(id);
        const ok = results.filter((x) => x.ok);
        if (!ok.length) throw new Error(results.map((x) => `${x.file}: ${x.error}`).join(" · "));
        sendJSON(res, 200, { ok: true, src: ok[0].src, outputs: results });
        return;
      }
      sess.proc.stdin.end();
      const code = await sess.done;
      if (code !== 0) throw new Error("ffmpeg encode failed: " + sess.err());
      const out = sess.outPath;
      fs.renameSync(sess.partPath, out);
      sess.partPath = null; // renamed — cleanup must not delete the finished file
      exportedThisRun.add(path.basename(out));
      freshExports.add(path.basename(out));
      cleanupExport(id);
      sendJSON(res, 200, { ok: true, src: "/exports/" + encodeURIComponent(path.basename(out)) });
    } catch (e) { cleanupExport(id); sendJSON(res, 500, { error: String(e) }); }
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
    if (!HAS_FFMPEG) { sendJSON(res, 400, { error: FFMPEG_MISSING, code: FFMPEG_MISSING_CODE }); return; }
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
    if (!HAS_FFMPEG) { sendJSON(res, 400, { error: FFMPEG_MISSING, code: FFMPEG_MISSING_CODE }); return; }
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
    if (!HAS_FFMPEG) { sendJSON(res, 400, { error: FFMPEG_MISSING, code: FFMPEG_MISSING_CODE }); return; }
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

  /* API: SSE live-reload channel */
  if (p === "/api/events") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream", "Cache-Control": "no-store",
      Connection: "keep-alive",
    });
    res.write("data: hello\n\n");
    sseClients.add(res);
    req.on("close", () => sseClients.delete(res));
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

  /* API: on-device transcription (asr-local.js; #70). One file at a time; the transcript is saved like a tab's.
       GET  /api/asr/status            → {model, engine, vad, asr, punct}   (asr / punct: {ready, where, missing, bad})
       POST /api/asr/transcribe {src}  → {src, status, gaps, gapSeconds, skippedSegments, words, duration, speech, punctuated} once the
                                         transcript is saved; status complete or partial (gaps: how many parts could not
                                         be read, kept with the transcript); 500 {code: ASR_FAILED} when nothing could;
                                         progress as SSE "asr" ({src, frac}); 409 {code} when busy, when the model or the
                                         engine is missing, or when cancelled. Nothing is downloaded here.
       POST /api/asr/cancel            → {cancelled}
       GET  /api/asr/optional          → {active, models:[{id, name, installed, consented, ready, …}]}   (asr-optional.js)
       POST /api/asr/optional          → never switches: 409 {code: ASR_CONSENT_REQUIRED, waiting: "streamer"} — only the
                                         streamer chooses an optional model, in Settings › 听写, after reading its licence;
                                         a body with an agree field is refused (400 ASR_AGREE_NOT_ACCEPTED).
       While an optional model is in use, /api/asr/transcribe runs it (engine: "optional") instead of the default. */
  if (p === "/api/asr/status" && req.method === "GET") { sendJSON(res, 200, { ...asr().status(), optional: asrOptionalSummary() }); return; }
  if (p === "/api/asr/optional" && req.method === "GET") { sendJSON(res, 200, asrOptionalSummary()); return; }
  if (p === "/api/asr/optional" && req.method === "POST") {
    let body = {};
    try { body = JSON.parse((await readBody(req)).toString("utf8") || "{}") || {}; } catch { }
    if (body && typeof body === "object" && ["agree", "agreed", "consent", "accept", "accepted"].some((k) => Object.prototype.hasOwnProperty.call(body, k))) {
      sendJSON(res, 400, { code: "ASR_AGREE_NOT_ACCEPTED", error: "nobody can agree to a model licence for the streamer: the streamer reads it and agrees in Settings › Transcription. Nothing was changed." });
      return;
    }
    sendJSON(res, 409, { code: "ASR_CONSENT_REQUIRED", waiting: "streamer", error: "only the streamer can choose an optional speech model: Settings › Transcription, where MontClip shows its licence and asks. Nothing was changed.", active: asrOptionalActive() });
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
    if (asrJob.running) { sendJSON(res, 409, { code: "ASR_BUSY", error: "already transcribing " + asrJob.running.src }); return; }
    const st = asr().status(), optionalId = asrOptionalActive();
    if (!st.engine.ready || !st.vad.ready) { sendJSON(res, 409, { code: "ASR_ENGINE_MISSING", error: "the speech engine is missing from this copy of MontClip" }); return; }
    if (!optionalId && !st.asr.ready) { sendJSON(res, 409, { code: "ASR_MODEL_MISSING", error: "no speech model yet: the user downloads it or imports it (USB drive / a file) in the Transcript tab; MontClip never fetches it by itself", missing: st.asr.missing, bad: st.asr.bad }); return; }
    const ac = new AbortController(), job = asrJob.running = { src, ac };
    res.on("close", () => { if (!res.writableFinished) ac.abort(); });   // the page went away: stop
    let last = 0;
    try {
      const info = await probeFile(file);
      const r = await (optionalId ? asrOptionalEngine() : asr()).transcribe(file, { signal: ac.signal, duration: info && info.duration,
        onProgress: (frac) => { const now = Date.now(); if (now - last > 250) { last = now; broadcast("asr", JSON.stringify({ src, frac })); } } });
      const TR = require("./transcribe.js");
      const doc = transcripts.put(src, { src, model: optionalId || TR.DEFAULT_MODEL, language: r.language, duration: r.duration, created: new Date().toISOString(), words: r.words,
        gaps: r.gaps.map((g) => [g.start, g.end, g.reason]) });
      broadcast("transcript", JSON.stringify({ src }));
      const gapSeconds = Math.round(doc.gaps.reduce((t, g) => t + g[1] - g[0], 0) * 10) / 10;
      sendJSON(res, 200, { src, status: TR.status(doc), gaps: doc.gaps.length, gapSeconds, skippedSegments: r.skippedSegments, words: doc.words.length, duration: doc.duration, speech: Math.round(r.speech * 10) / 10, punctuated: r.punctuated,
        ...(optionalId ? { engine: "optional", model: optionalId, threads: r.threads, maxRssMB: r.maxRssMB } : {}) });
    } catch (e) {
      const code = e.code === "ASR_CANCELLED" || ac.signal.aborted ? "ASR_CANCELLED" : e.code || "ASR_FAILED";
      if (!res.writableEnded) sendJSON(res, /^ASR_(CANCELLED|MODEL_MISSING|ENGINE_MISSING|OPTIONAL_NOT_READY|OPTIONAL_NO_MEMORY)$/.test(code) ? 409 : 500,
        { code, error: String(e.message || e), ...(optionalId ? { engine: "optional", model: optionalId, needMB: e.needMB, freeMB: e.freeMB } : {}) });
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
});

/* Auto-save versions of the open project while it changes (every FABLECUT_AUTO_VERSION_MIN
   minutes at most, default 10), whoever edits it: the editor, an agent, a script. */
setInterval(() => {
  try {
    const v = history.maybeAuto();
    if (v) broadcast("versions", JSON.stringify({ project: projects.peekActive(), action: "auto" }));
  } catch { }
}, 60_000).unref();

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
