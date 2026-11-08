/* ═══════════════════════════════════════════════════════════════════════════
   MontClip MCP server — connects Claude (Code / Desktop) to the video editor.
   Zero-dependency stdio JSON-RPC (Model Context Protocol).

   Register once for all Claude Code sessions, from a clone:
     claude mcp add -s user fablecut -- node "<path-to>/MontClip/mcp-server.js"

    Tools: fablecut_status, fablecut_docs, fablecut_get_project,
           fablecut_set_project, fablecut_patch_project, fablecut_import_media,
           fablecut_analyze_reference, fablecut_frame, fablecut_encode_profiles,
           fablecut_normalize_audio, fablecut_auto_duck, fablecut_export,
           fablecut_scopes
   ═══════════════════════════════════════════════════════════════════════════ */
"use strict";
const fs = require("fs");
const path = require("path");
const http = require("http");
const { spawn, spawnSync } = require("child_process");
const { AsyncLocalStorage } = require("async_hooks");
const FF = require("./ffmpeg-path");
const { loadEncodeProfiles, listProfilesPublic, resolveProfile, profileSummary } = require("./encode-profiles");

const {
  APP_DIR, DATA_DIR, MEDIA_DIR, EXPORTS_DIR, ANALYSIS_DIR, LIBRARY_DIR, PROJECT_FILE, PROXIES_DIR, ensureDirs, readSaved, writeSaved,
} = require("./paths");
const { downloadImportUrl, kindFromName, maybeFaststart } = require("./import-url");
const { prepareMedia } = require("./prepare-media");
const MediaLib = require("./media-lib");
const Danmaku = require("./danmaku");
const { readDanmakuFile } = require("./danmaku-file");
const FX = require("./audio-fx");
const EditOps = require("./edit-ops");
const ProjectOps = require("./project-ops");
const Denoise = require("./denoise");
const MakeEditable = require("./make-editable");
const { createProjects } = require("./projects");
const { createHistory } = require("./history");
const Color = require("./color");
const FrameStats = require("./frame-stats");
const Mask = require("./mask");
const Tracker = require("./tracker");
const Motion = require("./motion");
const CompLib = require("./comp");
const SeqLib = require("./sequences");
const Templates = require("./templates");
const Delivery = require("./delivery");
const { probeFile, infoForEntry } = require("./media-probe");
const { findProxies } = require("./proxy");
/** The user's saved presets / templates (library/presets, library/templates), validated; bad files skipped. */
const savedItems = (kind) => readSaved(kind).map((x) => (kind === "presets" ? Templates.normalizePreset(x.data) : Templates.normalizeTemplate(x.data))).filter(Boolean);

/* ROOT is where the code lives (server.js, CLAUDE.md); the user's timeline and
   media live under DATA_DIR. Identical unless FABLECUT_DATA_DIR is set. */
const ROOT = APP_DIR;
ensureDirs();
const PORT = process.env.FABLECUT_PORT || 7777;
const BASE = `http://localhost:${PORT}`;
// Requests go to the address the server binds: on Node 18, "localhost" can
// resolve to ::1 first and is not retried on 127.0.0.1.
const API = `http://${process.env.HOST === "::1" ? "[::1]" : "127.0.0.1"}:${PORT}`;

/* MCP initialize must echo a version we actually speak. Echoing an unknown
   client version (or crashing) fails handshake with stock SDK clients. */
const MCP_PROTOCOL_VERSIONS = ["2025-11-25", "2025-06-18", "2024-11-05"];
const MCP_DEFAULT_PROTOCOL_VERSION = MCP_PROTOCOL_VERSIONS[0];
function negotiateProtocolVersion(requested) {
  return MCP_PROTOCOL_VERSIONS.includes(requested) ? requested : MCP_DEFAULT_PROTOCOL_VERSION;
}

/* ── Helpers ── */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* The editor's job queue (export-jobs.js) runs ONE job at a time — exports, scope readings and timeline frames,
   tracking, transcription — so a job nobody waits for any more must not keep it. Whatever ends a wait early cancels
   the job it waited on: its deadline, a lost poll, or the caller cancelling the call (MCP notifications/cancelled,
   the MCP process being stopped with SIGTERM / SIGINT, or the signal a host passes to callTool). The caller's signal rides along in callScope,
   so the tools need not pass it down. keepOnTimeout leaves a long export running past the deadline (the reply gives
   its id to check on later); cancelOnExit:false leaves a job this call did not start alone. */
const callScope = new AsyncLocalStorage();
const callSignal = () => callScope.getStore()?.signal || null;
function napOrAbort(ms, signal) {
  return new Promise((r) => {
    if (!signal) return setTimeout(r, ms);
    if (signal.aborted) return r();
    const done = () => { clearTimeout(t); signal.removeEventListener("abort", done); r(); };
    const t = setTimeout(done, ms);
    signal.addEventListener("abort", done);
  });
}
async function cancelJob(id) {
  try { await apiJSON("POST", "/api/export/job/cancel?id=" + encodeURIComponent(id)); } catch { /* the server is gone: nothing holds its queue */ }
}
async function waitJob(job, { every, timeout, what, timeoutError, keepOnTimeout = false, cancelOnExit = true }) {
  const signal = callSignal();
  const deadline = Date.now() + 1000 * timeout;
  const open = (j) => j.status === "pending" || j.status === "running";
  let keep = !cancelOnExit;
  try {
    while (open(job)) {
      if (signal?.aborted) throw new Error(`the call was cancelled, so its ${what} ${job.id} was cancelled too`);
      if (Date.now() > deadline) {
        if (keepOnTimeout) { keep = true; break; }
        throw new Error(timeoutError);
      }
      await napOrAbort(every, signal);
      if (signal?.aborted) continue;
      const q = await apiJSON("GET", "/api/export/job?id=" + encodeURIComponent(job.id));
      if (q.status !== 200) throw new Error(q.body?.error || `lost track of the ${what}`);
      job = q.body;
    }
    return job;
  } finally {
    if (!keep && open(job)) await cancelJob(job.id);
  }
}
function readProject() {
  const raw = fs.readFileSync(PROJECT_FILE, "utf8").replace(new RegExp("^\\uFEFF"), "");
  return JSON.parse(raw);
}
function writeProject(doc) {
  // atomic tmp+rename so the UI's file watcher never sees a half-written doc
  const tmp = PROJECT_FILE + ".mcp.tmp";
  fs.writeFileSync(tmp, JSON.stringify(doc, null, 2));
  fs.renameSync(tmp, PROJECT_FILE);
}
/* Optimistic concurrency: revision of project.json when this session last read
   the full document. If the file has moved past it by write time, someone else
   (usually the user, in the editor UI) edited in between — refuse to clobber. */
let lastReadRevision = null;
/* Embedded in Cindy the editor server answers only requests that carry its session token (server.js, embed.js). */
const session = () => process.env.MONTCLIP_HOST === "cindy" && process.env.MONTCLIP_EMBED_TOKEN
  ? { "X-MontClip-Session": process.env.MONTCLIP_EMBED_TOKEN } : {};
function httpOk(url) {
  return new Promise((resolve) => {
    const req = http.get(url, { headers: session() }, (r) => { r.resume(); resolve(r.statusCode < 500); });
    req.on("error", () => resolve(false));
    req.setTimeout(1200, () => { req.destroy(); resolve(false); });
  });
}
/** JSON request to the editor server → {status, body}. Extra headers are for
 *  endpoints that gate on them — /api/frame?path= needs X-FableCut-Client. */
function apiJSON(method, urlPath, payload, headers) {
  return new Promise((resolve, reject) => {
    const req = http.request(API + urlPath, { method, headers: { "Content-Type": "application/json", ...session(), ...headers } }, (r) => {
      let data = "";
      r.setEncoding("utf8");
      r.on("data", (d) => { data += d; });
      r.on("end", () => {
        let body = null;
        try { body = JSON.parse(data); } catch { body = { error: data }; }
        resolve({ status: r.statusCode, body });
      });
    });
    req.on("error", reject);
    req.setTimeout(15_000, () => req.destroy(new Error("editor server did not answer")));
    req.end(payload === undefined ? undefined : JSON.stringify(payload));
  });
}
async function ensureUIServer() {
  if (await httpOk(API + "/api/project")) return true;
  /* Tests (and nothing else) may set FABLECUT_NO_AUTOSTART=1: the auto-start
     below spawns a detached server.js the test harness cannot stop — it
     inherits the test's port and data dir and keeps running after the test.
     With the flag set, report the missing server instead of starting one. */
  if (process.env.FABLECUT_NO_AUTOSTART === "1") return false;
  spawn(process.execPath, [path.join(ROOT, "server.js")],
    { cwd: ROOT, detached: true, stdio: "ignore" }).unref();
  for (let i = 0; i < 12; i++) {
    await sleep(300);
    if (await httpOk(API + "/api/project")) return true;
  }
  return false;
}
const KIND_BY_EXT = {
  ".mp4": "video", ".webm": "video", ".mov": "video", ".mkv": "video", ".m4v": "video", ".avi": "video", ".flv": "video",
  ".mp3": "audio", ".wav": "audio", ".ogg": "audio", ".m4a": "audio", ".aac": "audio", ".flac": "audio",
  ".png": "image", ".jpg": "image", ".jpeg": "image", ".gif": "image", ".webp": "image", ".svg": "svg",
};
const uid = () => Math.random().toString(36).slice(2, 9);
/** Media entries with no length read yet get it from ffprobe here, so the agent never waits for an editor tab to probe
 *  them (JJ, P1 / P3, 2026-11-05). An entry nothing can read is marked durationUnknown (MediaLib.cannotCut).
 *  Rea (#152): never hold the call up — the probes run side by side (media-probe runs at most PROBE_CONCURRENCY ffprobes
 *  at once, the rest queue), the caller waits at most BACKFILL_WAIT_MS, and whatever takes longer is written when it
 *  is done, in the background. One pass at a time; a call while one runs waits on the same pass (up to the same wait).
 *  Written back as an edit only when something changed, onto the latest document, re-checked just before the write
 *  (as fablecut_patch_project does): an editor save that lands meanwhile is re-read and kept. → the pass's promise */
const BACKFILL_WAIT_MS = 1500;
let backfillPass = null;
function backfillDurations({ wait = BACKFILL_WAIT_MS } = {}) {
  if (!backfillPass) {
    backfillPass = backfillNow().catch((e) => { console.error("[MontClip] reading missing lengths failed: " + e.message); return 0; })
      .finally(() => { backfillPass = null; });
  }
  const pass = backfillPass;
  if (!wait) return Promise.resolve(null);
  return Promise.race([pass, new Promise((r) => setTimeout(() => r(null), wait).unref())]);
}
async function backfillNow() {
  const noLength = (m) => (m.kind === "video" || m.kind === "audio") && !(Number.isFinite(m.duration) && m.duration > 0) && !m.durationUnknown;
  // P6: a video with a size but no stored size beside it may hold the stored size of non-square pixels (read once
  // per file version — probeFile caches it — so this costs nothing after the first call)
  const sizeUnchecked = (m) => m.kind === "video" && m.width > 0 && m.storedWidth == null;
  const todo = (readProject().media || []).filter((m) => (noLength(m) || sizeUnchecked(m)) && mediaFile(m.src));
  if (!todo.length) return [];
  const found = new Map();
  await Promise.all(todo.map(async (m) => {
    const info = await probeFile(mediaFile(m.src));
    if (info && ((noLength(m) && (info.duration > 0 || info.durationUnknown)) || (sizeUnchecked(m) && info.storedWidth > 0))) found.set(m.id, info);
  }));
  if (!found.size) return [];
  const updates = [...found].map(([id, info]) => {
    const m = todo.find((x) => x.id === id);
    const u = { id, src: m.src };
    if (noLength(m)) {
      if (info.duration > 0) { u.duration = info.duration; if (info.durationFrom) u.durationFrom = info.durationFrom; }
      else if (info.durationUnknown) u.durationUnknown = true;
    }
    // P6: the display size and the stored one, applied by MediaLib.applyBackfill (MediaLib.displaySize)
    if (sizeUnchecked(m) && info.storedWidth > 0) Object.assign(u, { width: info.width, height: info.height, storedWidth: info.storedWidth, storedHeight: info.storedHeight });
    return u;
  });
  // QQ (#152): through the server, so an editor's unsaved step is never written over — it merges them itself, or the
  // server does when none is open. Only a refused connection permits a direct write: a timeout or HTTP error may
  // mean an editor is still open, so it must never turn into an outside write over that editor's pending save.
  try {
    const r = await apiJSON("POST", "/api/media-backfill", { updates });
    if (r.status === 200) return updates;
    throw new Error("media backfill refused by server: " + r.status);
  } catch (e) { if (e.code !== "ECONNREFUSED") throw e; }
  for (let attempt = 0; attempt < 3; attempt++) {
    const proj = readProject();
    const readRev = proj.revision || 0;
    const wasCurrent = lastReadRevision === readRev;
    const n = MediaLib.applyBackfill(proj, updates);
    if (!n) return updates;
    // someone saved while this was being put together: start again from what they saved
    if ((readProject().revision || 0) !== readRev) continue;
    proj.revision = readRev + 1;
    writeProject(proj);
    if (wasCurrent) lastReadRevision = proj.revision;
    return updates;
  }
  return updates;   // the project kept changing: the next call writes them (probeFile has them cached)
}
/** What fablecut_import_media says about the length it found (europa P3, 2026-11-05: "no ffprobe" was said whenever
 *  the header had no length, though ffprobe had run). Say what actually happened. */
function importNote(entry, probed) {
  const timed = entry.kind === "video" || entry.kind === "audio";
  if (!timed || entry.duration > 0) {
    return probed && probed.durationFrom === "packets"
      ? `Note: the file's header has no length (a recording stopped mid-way?), so it was read from the last packet: ${entry.duration}s. Seeking in it may be slow. Ready to use in clips via mediaId.`
      : "Ready to use in clips via mediaId.";
  }
  if (!probed || probed.probe === "stat")
    return "Note: duration unknown — ffprobe isn't available here, so the length wasn't read. The browser UI will probe and fill it in; re-read the project before trimming this media.";
  if (probed.probe === "failed")
    return `Note: ffprobe could not read this file (${probed.probeError}). It may be cut off — a recording stopped before it was saved. With no length it can't be placed or cut; the original file is unchanged.`;
  return "Note: nothing in this file says how long it is — not the header, the streams or the packets' times. With no length it can't be placed or cut; the original file is unchanged.";
}

/** A recording with several audio streams: which one is read, and how to pick another (fablecut_audio_track). */
function audioTracksNote(m) {
  if (!Array.isArray(m.audioTracks) || m.audioTracks.length < 2) return "";
  return `\nIt has ${m.audioTracks.length} audio tracks: ` +
    m.audioTracks.map((t, i) => `${i}: ${t.channels} ch${t.title ? ` "${t.title}"` : ""}${t.default ? " (default)" : ""}`).join(" · ") +
    `. Songs, loudness and the transcript listen to track ${MediaLib.audioTrackOf(m)}; the export always uses track 0. If the streamer's voice is on another one, ` +
    `ask the streamer which (fablecut_audio_track {mediaId, listen} cuts a few seconds of each to play), then fablecut_audio_track {mediaId, track}.`;
}
/* fablecut_audio_track: list a recording's audio streams, cut a few seconds of each to listen to, or pick the one
   every reader uses (setAudioTrack, one undo step). */
async function audioTrackTool(args) {
  const doc = readProject(), readRev = doc.revision || 0;
  const m = doc.media.find((x) => x.id === String(args.mediaId || ""));
  if (!m) throw new Error("`mediaId` must name a media entry (fablecut_get_project {compact:true} lists them)");
  if (m.kind !== "video" && m.kind !== "audio") throw new Error(`${m.id} is ${m.kind} — it has no sound`);
  const file = mediaFile(m.src);
  if (!file) throw new Error(`${m.id}: the file is missing (offline)`);
  const info = await probeFile(file);
  const tracks = info && Array.isArray(info.audioTracks) ? info.audioTracks : null;
  const n = tracks ? tracks.length : info && info.audioChannels === 0 ? 0 : 1;
  const list = () => (tracks || [{ channels: info && info.audioChannels }]).map((t, i) =>
    `  ${i}: ${t.channels || "?"} ch${t.title ? ` "${t.title}"` : ""}${t.default ? " (default)" : ""}${i === MediaLib.audioTrackOf({ ...m, audioTracks: tracks }) ? "  ← read now" : ""}`).join("\n");
  if (!n) return `${m.id} "${m.name}" has no audio.`;
  if (args.listen != null) {
    const at = Math.max(0, Number(args.listen) || 0), len = 6;
    const out = [];
    for (let i = 0; i < n; i++) {
      const dest = require("./audio-window").listenPath(path.join(ANALYSIS_DIR, "listen"), m.id, i, at);   // id cleaned, kept inside listen/
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      const r = spawnSync(FF.path("ffmpeg"), require("./audio-window").windowArgs(file, at, len, dest, i), { timeout: 60000 });
      out.push(`  ${i}: ${r.status === 0 ? dest : "could not be read"}`);
    }
    return `${m.id} "${m.name}" — ${len} s of each audio track from ${at} s, to play to the streamer:\n${out.join("\n")}\nTracks:\n${list()}`;
  }
  if (args.track == null) return `${m.id} "${m.name}" — ${n} audio track${n === 1 ? "" : "s"}:\n${list()}` +
    (n > 1 ? "\nPick the streamer's voice with {mediaId, track}; listen first with {mediaId, listen: <seconds>}." : "");
  const proj = readProject();
  if ((proj.revision || 0) !== readRev) throw new Error(`the project changed meanwhile (revision ${readRev} → ${proj.revision}) — nothing changed; run fablecut_audio_track again`);
  const pm = proj.media.find((x) => x.id === m.id);
  if (tracks) pm.audioTracks = tracks;   // an entry probed before audio tracks were read
  const { notes } = ProjectOps.applyPatch(proj, [{ op: "setAudioTrack", id: m.id, track: args.track }], { savedItems });
  const verWarn = versionBeforeAgent(false);
  proj.revision = readRev + 1;
  writeProject(proj);
  lastReadRevision = proj.revision;
  return `${notes.join(" ")} — songs, loudness, the transcript, beats and silences of ${m.id} now listen to audio track ${args.track}; the export keeps track 0 (revision ${proj.revision}; one undo step). ` +
    `Songs found from the other track were dropped: run fablecut_songs / fablecut_transcribe again for this one.` + (verWarn || "");
}

/* ── Tool definitions ── */
const TOOLS = require("./mcp-tools");

/* ── Loudness normalize (fablecut_normalize_audio) ──
   Decodes each clip's source window with ffmpeg and measures it with the same
   loudness.js the editor uses, so agent and UI land on identical gains. */
const DEFAULT_TRACKS = [
  { id: "V3", kind: "video" }, { id: "V2", kind: "video" }, { id: "V1", kind: "video" },
  { id: "A1", kind: "audio" }, { id: "A2", kind: "audio" }, { id: "A3", kind: "audio" }, { id: "A4", kind: "audio" },
];
const NORM_SR = 48000;
function mediaFile(src) {
  const p = decodeURIComponent(String(src || "").split("?")[0]);
  const [root, rel] = p.startsWith("/media/") ? [MEDIA_DIR, p.slice(7)]
    : p.startsWith("/library/") ? [LIBRARY_DIR, p.slice(9)] : [null, null];
  if (!root) return null;
  const file = path.normalize(path.join(root, rel));
  return file.startsWith(path.normalize(root + path.sep)) && fs.existsSync(file) ? file : null;
}
/** Source seconds a clip consumes: duration × speed, integrating speed keyframes. */
function clipSourceLen(c) {
  const base = Math.min(8, Math.max(0.1, +c.props?.speed || 1));
  const kf = c.keyframes?.speed;
  if (!Array.isArray(kf) || !kf.length) return c.duration * base;
  const at = (t) => {
    if (t <= kf[0].t) return kf[0].v;
    for (let i = 1; i < kf.length; i++)
      if (t <= kf[i].t) return kf[i - 1].v + (kf[i].v - kf[i - 1].v) * (t - kf[i - 1].t) / ((kf[i].t - kf[i - 1].t) || 1);
    return kf[kf.length - 1].v;
  };
  let sum = 0;
  const n = Math.max(2, Math.ceil(c.duration * 60));
  for (let i = 0; i < n; i++) sum += Math.min(8, Math.max(0.1, at((i + 0.5) * c.duration / n))) * c.duration / n;
  return sum;
}
function probeChannels(file, track = 0) {
  const r = spawnSync(FF.path("ffprobe"), ["-v", "error", "-select_streams", "a:" + track, "-show_entries", "stream=channels",
    "-of", "csv=p=0", file], { encoding: "utf8" });
  if (r.error) throw new Error(FF.why("ffprobe", "to measure audio"));
  const n = parseInt(String(r.stdout).trim(), 10);
  return n > 0 ? n : 0;
}
/** Decode a clip's source window with ffmpeg and hand each chunk to
 *  `onChunk(channels)`. Resolves to the channel count (0 = no audio stream).
 *  `analysis`: listening to the sound (silence, beats, highlights) reads the entry's audioTrack; working on the
 *  exported sound (normalize, auto-duck) reads track 0, the one the export uses (JJ on #177). */
function streamClipAudio(proj, c0, onStart, onChunk, { analysis = false } = {}) {
  const media = proj.media.find((m) => m.id === c0.mediaId);
  const file = media && mediaFile(media.src);
  if (!file) return Promise.reject(new Error(`clip ${c0.id}: media file not found`));
  const track = analysis ? MediaLib.audioTrackOf(media) : 0;
  const nCh = probeChannels(file, track);
  if (!nCh || onStart(nCh) === false) return Promise.resolve(0);
  return new Promise((resolve, reject) => {
    const proc = spawn(FF.path("ffmpeg"), ["-v", "error", "-ss", String(Math.max(0, +c0.in || 0)),
      "-t", String(Math.max(0.01, clipSourceLen(c0))), "-i", file, "-vn", "-map", "0:a:" + track,
      "-ar", String(NORM_SR), "-f", "f32le", "-acodec", "pcm_f32le", "-"]);
    let rest = Buffer.alloc(0), err = "";
    const frameBytes = 4 * nCh;
    proc.stdout.on("data", (chunk) => {
      const buf = rest.length ? Buffer.concat([rest, chunk]) : chunk;
      const frames = Math.floor(buf.length / frameBytes);
      rest = buf.subarray(frames * frameBytes);
      if (!frames) return;
      const chs = Array.from({ length: nCh }, () => new Float32Array(frames));
      for (let i = 0; i < frames; i++)
        for (let c = 0; c < nCh; c++) chs[c][i] = buf.readFloatLE((i * nCh + c) * 4);
      onChunk(chs);
    });
    proc.stderr.on("data", (d) => { err += d; });
    proc.on("error", () => reject(new Error(FF.why("ffmpeg", "to read audio"))));
    proc.on("close", (code) => code === 0 ? resolve(nCh)
      : reject(new Error(`ffmpeg failed reading ${c0.id}: ${err.trim().split("\n").pop() || code}`)));
  });
}
/** Measure clips that play together (one linked group: same file + window). */
async function measureClipGroup(proj, clips) {
  const L = require("./loudness.js");
  let meter = null;
  await streamClipAudio(proj, clips[0], (nCh) => {
    const routedCount = clips.reduce((n, c) =>
      n + L.routeChannels(Array.from({ length: nCh }, () => new Float32Array(0)), c.props || {}).length, 0);
    if (!routedCount) return false;
    meter = new L.LoudnessMeter(routedCount, NORM_SR);
  }, (chs) => meter.push(clips.flatMap((c) => L.routeChannels(chs, c.props || {}))));
  return meter ? meter.result() : null;
}
/** Timeline spans with sound on these voice clips (ducking.js pipeline). */
async function voiceRegions(proj, voices, threshold, minLen, heard, { analysis = false } = {}) {
  const L = require("./loudness.js"), D = require("./ducking.js");
  const lists = [];
  for (const v of voices) {
    let env = null;
    await streamClipAudio(proj, v, (nCh) => { env = new D.EnvelopeMeter(nCh, NORM_SR); },
      (chs) => env.push(L.routeChannels(chs, v.props || {})));
    if (!env) continue;   // no audio stream
    if (heard) heard.add(v.id);
    const sp = Math.min(8, Math.max(0.1, +v.props?.speed || 1));
    const gain = Math.pow(10, (+v.props?.gain || 0) / 20) * Math.min(2, Math.max(0, +(v.props?.volume ?? 1)));
    lists.push(D.activeRegions(env.result(), { t0: v.start, speed: sp, gain, threshold, ...(minLen != null ? { minLen } : {}) }));
  }
  return D.mergeRegions(lists, minLen != null ? 0 : undefined);
}
/** The clips that carry a selection's sound, one list per linked group: its
 *  audio stems, else the clip itself (audio, or a video without stems). */
function speechGroups(proj, ids) {
  const groups = new Map();
  for (const id of ids) {
    const c = proj.clips.find((x) => x.id === id);
    if (!c) throw new Error("no clip " + id);
    if (c.kind !== "audio" && c.kind !== "video") throw new Error(`clip ${id} is ${c.kind} — no sound to listen to`);
    const key = c.linkGroup || c.id;
    if (groups.has(key)) continue;
    const members = c.linkGroup ? proj.clips.filter((x) => x.linkGroup === c.linkGroup) : [c];
    const stems = members.filter((x) => x.kind === "audio");
    groups.set(key, stems.length ? stems : [c]);
  }
  return [...groups.values()];
}
const fmtClock = (s) => `${Math.floor(s / 60)}:${(s % 60).toFixed(2).padStart(5, "0")}`;
const fmtDur = (s) => { const t = Math.round(s); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`; };
/* fablecut_silence: silence.js on the clips' sound, then (cut:true) its extract ops. */
async function silenceTool(args) {
  const S = require("./silence.js");
  const ids = Array.isArray(args.clipIds) ? args.clipIds.map(String) : [];
  if (!ids.length) throw new Error("`clipIds` must list the speech clip(s) to listen to");
  const opts = S.options(args);
  const doc = readProject();
  const readRev = doc.revision || 0;
  const groups = speechGroups(doc, ids);
  const disabled = new Set(Array.isArray(doc.disabledTracks) ? doc.disabledTracks : []);
  const enabled = groups.map((g) => g.filter((x) => !disabled.has(x.track) && x.disabled !== true)).filter((g) => g.length);
  if (!enabled.length) throw new Error("those clips are disabled (or on disabled tracks) — nothing to listen to");
  // a speed ramp moves the sound along the timeline unevenly: those clips are left alone
  const live = enabled.filter((g) => !g.some(S.ramped));
  const rampedN = enabled.length - live.length;
  if (!live.length) throw new Error("those clips have a speed ramp (speed keyframes) — silence removal works on clips at a steady speed");
  const heard = new Set();
  const sound = await voiceRegions(doc, live.flat(), opts.threshold, S.MIN_SOUND, heard, { analysis: true });
  // only time that was actually listened to can be silent: a clip with no audio stream is left alone
  const usable = live.filter((g) => g.every((x) => heard.has(x.id)));
  if (!usable.length) throw new Error("those clips have no audio stream — nothing to listen to");
  const ranges = usable.map((g) => [Math.min(...g.map((x) => x.start)), Math.max(...g.map((x) => x.start + x.duration))]);
  const spans = S.silentSpans(sound, ranges, { ...opts, fps: doc.fps });
  const listen = S.union(ranges).reduce((n, [a, b]) => n + b - a, 0);
  const head = `${spans.length} silence${spans.length === 1 ? "" : "s"}, ${S.total(spans).toFixed(1)} s of ${fmtDur(listen)} ` +
    `(threshold ${opts.threshold} dBFS, at least ${opts.minSilence} s, ${opts.padding} s kept beside speech` +
    (usable.length < live.length ? `; ${live.length - usable.length} clip(s) with no audio stream left alone` : "") +
    (rampedN ? `; ${rampedN} clip(s) with a speed ramp left alone` : "") + ")";
  const list = spans.slice(0, 60).map((s) => `  ${fmtClock(s.from)} → ${fmtClock(s.to)}  (${(s.to - s.from).toFixed(2)} s)`)
    .concat(spans.length > 60 ? [`  … +${spans.length - 60} more`] : []);
  if (args.cut !== true) return [head + (spans.length ? ":" : "."), ...list,
    ...(spans.length ? ["Nothing cut yet: call again with cut:true to remove them (lock the music bed first if it should keep running)."] : [])].join("\n");
  if (!spans.length) return head + " — nothing to cut.";
  // the timeline must be the one that was listened to
  const proj = readProject();
  if ((proj.revision || 0) !== readRev)
    throw new Error(`the project changed while listening (revision ${readRev} → ${proj.revision}) — nothing cut; run fablecut_silence again`);
  const end = (p) => p.clips.reduce((m, c) => Math.max(m, c.start + c.duration), 0);
  const before = end(proj);
  ProjectOps.applyPatch(proj, S.cutOps(spans, { tracks: args.tracks, force: args.force === true }), { savedItems });
  // a cut this size always keeps the project as it was, not once per session like other edits
  let verWarn = "";
  try { createHistory({ projects: createProjects({ dataDir: DATA_DIR, projectFile: PROJECT_FILE, libraryDir: LIBRARY_DIR }) }).beforeAgent("Before cutting silences"); }
  catch (e) { verWarn = ` Warning: no version was saved before the cut (${e.message}).`; }
  const diskRev = readProject().revision || 0;   // a failed read stops it: never write over what we can't see
  if (diskRev !== readRev) throw new Error(`the project changed while cutting (revision ${readRev} → ${diskRev}) — nothing cut; run fablecut_silence again`);
  proj.revision = readRev + 1;
  writeProject(proj);
  lastReadRevision = proj.revision;
  return `Cut ${head} — timeline ${fmtDur(before)} → ${fmtDur(end(proj))} (revision ${proj.revision}). UI hot-reloaded.` +
    (verWarn || ` The project as it was is kept as a version (fablecut_versions lists it; restore undoes the cut).`);
}
/* fablecut_songs (P2 「找出每首歌」): song-scan.js reads each file in segments (kept as read, so a stopped call carries
   on), songs.js finds the songs; they are kept in the project (setSongs, one revision). */
async function songsTool(args) {
  const Songs = require("./songs"), scanner = require("./song-scan").createSongScan({ dir: path.join(ANALYSIS_DIR, "songs"), ffmpeg: FF.path("ffmpeg") });
  const doc = readProject(), readRev = doc.revision || 0;
  const wanted = Array.isArray(args.mediaIds) ? args.mediaIds.map(String)
    : [...new Set(doc.clips.filter((c) => c.kind === "video" || c.kind === "audio").map((c) => c.mediaId))];
  const media = wanted.map((id) => doc.media.find((m) => m.id === id) || id);
  const missing = media.filter((m) => typeof m === "string");
  if (missing.length) throw new Error(`no media ${missing.join(", ")} in the project (fablecut_get_project {compact:true} lists them)`);
  const files = media.filter((m) => m.kind === "video" || m.kind === "audio");
  if (!files.length) throw new Error("no video or audio file to read — name the recordings with mediaIds");
  const ops = [], lines = [];
  for (const m of files) {
    const file = mediaFile(m.src);
    if (!file) { lines.push(`${m.id} "${m.name}": the file is missing (offline) — skipped`); continue; }
    const track = MediaLib.audioTrackOf(m);
    if (args.again === true) scanner.forget(file, track);
    const r = await scanner.scan(file, { track });
    const songs = Songs.find(r.rows.map((x) => x[0]), { step: r.step, complete: r.complete });
    ops.push({ op: "setSongs", mediaId: m.id, songs: { key: r.key, complete: r.complete, scanned: r.scanned, songs } });
    const est = songs.filter((s) => s.confidence === "estimated").length;
    lines.push(`${m.id} "${m.name}" (${fmtDur(r.scanned)} read): ${songs.length} song${songs.length === 1 ? "" : "s"}${est ? `, ${est} estimated` : ""}`);
    for (const s of songs.slice(0, 80))
      lines.push(`  ${fmtClock(s.from)} → ${fmtClock(s.to)}  (${fmtDur(s.to - s.from)})` +
        (s.marks.length ? `  estimated: ${s.marks.map((k) => `${k.at} ${k.why}${k.at === "inside" ? " @" + fmtClock(k.t) : ""}`).join(", ")}` : ""));
    if (songs.length > 80) lines.push(`  … +${songs.length - 80} more`);
  }
  if (args.store === false || !ops.length) return lines.join("\n") + (ops.length ? "\nNot kept in the project (store:false)." : "");
  const proj = readProject();
  if ((proj.revision || 0) !== readRev)
    throw new Error(`the project changed while reading (revision ${readRev} → ${proj.revision}) — nothing kept; run fablecut_songs again (what was read is kept, so it is quick)`);
  ProjectOps.applyPatch(proj, ops, { savedItems });
  proj.revision = readRev + 1;
  writeProject(proj);
  lastReadRevision = proj.revision;
  return lines.join("\n") + `\nKept in the project as project.songs (revision ${proj.revision}); times are seconds of each file.`;
}
/* fablecut_beats: beats.js on the music clip's sound, then its ops (markers, snap, retime). */
const BEATS_MAX_SECS = 20 * 60;
async function beatsTool(args) {
  const Bt = require("./beats.js");
  const doc = readProject();
  const readRev = doc.revision || 0;
  const clip = doc.clips.find((c) => c.id === String(args.clipId || ""));
  if (!clip) throw new Error("`clipId` must name the music clip on the timeline (fablecut_get_project {compact:true} lists them)");
  if (clip.kind !== "audio" && clip.kind !== "video") throw new Error(`clip ${clip.id} is ${clip.kind} — no sound to find a beat in`);
  if (Bt.ramped(clip)) throw new Error(`clip ${clip.id} has a speed ramp — beats follow music playing at a steady speed`);
  const sp = Math.min(8, Math.max(0.1, +clip.props?.speed || 1));
  if (clip.duration * sp > BEATS_MAX_SECS) throw new Error(`clip ${clip.id} is longer than ${BEATS_MAX_SECS / 60} minutes of music — split it, or find the beat on a part of it`);
  const parts = [];
  const nCh = await streamClipAudio(doc, clip, () => true, (chs) => parts.push(Bt.mono(chs)), { analysis: true });
  if (!nCh) throw new Error(`clip ${clip.id} has no audio stream — nothing to listen to`);
  const len = parts.reduce((n, p) => n + p.length, 0), all = new Float32Array(len);
  let at = 0;
  for (const p of parts) { all.set(p, at); at += p.length; }
  const a = Bt.analyze(Bt.resample(all, NORM_SR));
  const src0 = clip.in || 0;
  const abs = { beats: a.beats.map((t) => t + src0), bpm: a.bpm, drop: a.drop != null ? a.drop + src0 : null };
  const acts = { markers: args.markers === true, snap: args.snap || false, retime: args.retime || false, every: args.every, force: args.force === true };
  const r = Bt.plan(doc, clip, abs, acts);
  if (!r.ops.length) return Bt.describe(r);
  const proj = readProject();
  if ((proj.revision || 0) !== readRev)
    throw new Error(`the project changed while listening (revision ${readRev} → ${proj.revision}) — nothing changed; run fablecut_beats again`);
  ProjectOps.applyPatch(proj, r.ops, { savedItems });
  let verWarn = "";
  if (acts.snap || acts.retime) {
    try { createHistory({ projects: createProjects({ dataDir: DATA_DIR, projectFile: PROJECT_FILE, libraryDir: LIBRARY_DIR }) }).beforeAgent(acts.retime ? "Before re-cutting to the beat" : "Before snapping cuts to the beat"); }
    catch (e) { verWarn = ` Warning: no version was saved first (${e.message}).`; }
  }
  const diskRev = readProject().revision || 0;   // a failed read stops it: never write over what we can't see
  if (diskRev !== readRev) throw new Error(`the project changed meanwhile (revision ${readRev} → ${diskRev}) — nothing changed; run fablecut_beats again`);
  proj.revision = readRev + 1;
  writeProject(proj);
  lastReadRevision = proj.revision;
  return Bt.describe(r, { applied: true }) + ` (revision ${proj.revision}; UI hot-reloaded.)` +
    (acts.snap || acts.retime ? verWarn || " The project as it was is kept as a version (fablecut_versions; restore undoes it)." : "");
}
/* fablecut_reframe: a new sequence on the canvas asked for (or the open one), then reframe.js on frames
   ffmpeg samples from each full-frame shot's window. */
const REFRAME_MAX_SECS = 15 * 60;
/** → {frames, times}: SAMPLE_FPS a second, then the clip's last frame (reframe.js sampleTimes), read once more. */
function sampleFrames(file, c, w, h, fps = 30) {
  const R = require("./reframe.js");
  const sp = Math.min(8, Math.max(0.1, +c.props?.speed || 1));
  const len = Math.min(REFRAME_MAX_SECS, c.duration * sp);
  if (!(len > 0)) throw new Error('reframe requires a positive clip duration');
  const args = c.kind === "image"
    ? ["-v", "error", "-i", file, "-frames:v", "1", "-vf", `scale=${w}:${h}`, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"]
    : ["-v", "error", "-ss", String(Math.max(0, +c.in || 0)), "-t", String(len), "-i", file, "-an",
       "-vf", `fps=${R.SAMPLE_FPS},scale=${w}:${h}`, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"];
  const r = require("child_process").spawnSync(FF.path("ffmpeg"), args, { maxBuffer: 1 << 29, timeout: sampleTimeoutMs(len) });
  if (r.error?.code === "ENOENT") throw new Error(FF.why("ffmpeg", "to look at the footage"));
  if (r.error) throw new Error(`ffmpeg couldn't read ${c.id}: ${r.error.code === "ETIMEDOUT" ? "it took too long" : r.error.message}`);
  if (r.status !== 0) throw new Error(`ffmpeg couldn't read ${c.id}: ${String(r.stderr).trim().split("\n").pop()}`);
  const fb = w * h * 3, frames = [];
  for (let o = 0; o + fb <= r.stdout.length; o += fb) frames.push(r.stdout.subarray(o, o + fb));
  if (c.kind === "image") return { frames, times: null };
  const times = frames.map((_, i) => Math.round((i / R.SAMPLE_FPS) * 1000) / 1000);
  // A timeline sample time is not a source-frame index. Decode from the preceding keyframe:
  // accurate seek would discard the frame displayed at target and can return the next shot.
  const start = Math.max(0, +c.in || 0), end = start + len;
  const target = start + Math.max(0, len - sp / (fps > 0 ? fps : 30));
  const q = require("child_process").spawnSync(FF.path("ffmpeg"), ["-hide_banner", "-v", "info", "-noaccurate_seek", "-ss", String(target), "-i", file,
    "-copyts", "-start_at_zero", "-to", String(end), "-an", "-vf", `select='gte(t,${start})*lte(t,${target + 1e-7})*lt(t,${end})',scale=${w}:${h},showinfo`,
    "-fps_mode", "passthrough", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], { maxBuffer: 1 << 26, timeout: 60000, windowsHide: true });
  const log = String(q.stderr || ''), clock = /config in time_base:\s*(\d+)\/(\d+)/.exec(log);
  const tick = clock && Number(clock[1]) / Number(clock[2]);
  const stamps = [...log.matchAll(/\bn:\s*\d+\s+pts:\s*(-?\d+)\s+pts_time:/g)].map(m => Number(m[1]) * tick);
  const count = q.stdout ? q.stdout.length / fb : 0, pts = stamps[count - 1];
  if (q.error || q.status !== 0 || !Number.isInteger(count) || !count || stamps.length !== count || !Number.isFinite(pts) || pts < start || pts >= end || pts > target + 1e-5)
    throw new Error(`ffmpeg couldn't read the displayed tail frame of ${c.id}`);
  const last = pts - start;
  // fps=5 may repeat a VFR tail beyond its actual PTS. Replace those copies with the real tail.
  while (times.length && times[times.length - 1] >= last) { times.pop(); frames.pop(); }
  frames.push(q.stdout.subarray((count - 1) * fb, count * fb)); times.push(last);
  return { frames, times };
}
/** The frame sampling's time limit: 2 s per second of clip, at least 2 minutes, in whole ms (spawnSync refuses a
 *  fraction with ERR_OUT_OF_RANGE — the same as #130's FLV import, VV on europa, 2026-11-06). */
function sampleTimeoutMs(len) {
  return Math.ceil(Math.max(120000, len * 2000));
}
async function reframeTool(args) {
  const R = require("./reframe.js");
  const doc = readProject();
  const readRev = doc.revision || 0;
  const smooth = args.smooth == null ? 0.5 : +args.smooth;
  if (!(smooth >= 0 && smooth <= 1)) throw new Error("smooth must be 0…1");
  const ids = Array.isArray(args.clipIds) && args.clipIds.length ? args.clipIds.map(String) : null;
  const ops = [];
  // the sequence as it will be: a copy on the new canvas, opened — or the open one
  let work = doc, made = "";
  if (args.aspect) {
    const canvas = R.canvasFor(args.aspect, doc.width, doc.height);
    const open = (doc.sequences || []).find((s) => s.id === doc.sequence);
    const seqName = String(args.name || `${open?.name || "Main"} ${args.aspect}`).slice(0, 80);
    const add = { op: "addSequence", from: "open", name: seqName, width: canvas.width, height: canvas.height, open: true };
    work = JSON.parse(JSON.stringify(doc));
    ProjectOps.applyPatch(work, [add], { savedItems });
    ops.push(add);
    made = `New sequence "${seqName}" ${canvas.width}×${canvas.height}, opened. `;
  }
  const canvas = { width: work.width, height: work.height };
  const { take, skip } = R.targets(work, { ids, force: args.force === true });
  if (!take.length) throw new Error("no full-frame shots to reframe" + (skip.length ? ` (${skip.map((x) => `${x.id}: ${x.why}`).join("; ")})` : ""));
  const lines = [];
  for (const c of take) {
    const m = work.media.find((x) => x.id === c.mediaId);
    const file = m && mediaFile(m.src);
    if (!file) { skip.push({ id: c.id, why: "media file not found" }); continue; }
    let src = m.width > 0 && m.height > 0 ? { width: m.width, height: m.height } : null;
    if (!src) {
      const pr = require("child_process").spawnSync(FF.path("ffprobe"), ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", file], { timeout: 10000 });
      const [w, h] = String(pr.stdout).trim().split(",").map(Number);
      if (w > 0 && h > 0) src = { width: w, height: h };
    }
    if (!src) { skip.push({ id: c.id, why: "couldn't read its size" }); continue; }
    let samples = null;
    const cover = R.coverRect(src.width, src.height, canvas.width, canvas.height, 1);
    if (args.follow !== false && Math.max(cover.maxX, cover.maxY) > 0.5) {   // no room to pan: nothing to look at
      const w = R.SAMPLE_W, h = Math.max(8, Math.round(w * src.height / src.width / 2) * 2);
      try { const s = sampleFrames(file, c, w, h, work.fps || 30); samples = R.subjectTrack(s.frames, w, h, s.times ? { times: s.times } : {}); }
      catch (e) { skip.push({ id: c.id, why: e.message }); continue; }
    }
    const p = R.clipPlan(c, samples, src, canvas, { smooth, fps: work.fps || 30, follow: args.follow !== false });
    ops.push({ op: "updateClip", id: c.id, set: p.set, ...(args.force === true ? { force: true } : {}) });
    lines.push(`  ${c.id}: ${p.note}`);
  }
  if (!lines.length) throw new Error("nothing could be reframed: " + skip.map((x) => `${x.id}: ${x.why}`).join("; "));
  const proj = readProject();
  if ((proj.revision || 0) !== readRev)
    throw new Error(`the project changed while looking at the footage (revision ${readRev} → ${proj.revision}) — nothing changed; run fablecut_reframe again`);
  let verWarn = "";
  try { createHistory({ projects: createProjects({ dataDir: DATA_DIR, projectFile: PROJECT_FILE, libraryDir: LIBRARY_DIR }) }).beforeAgent("Before reframing"); }
  catch (e) { verWarn = ` Warning: no version was saved first (${e.message}).`; }
  const diskRev = readProject().revision || 0;   // a failed read stops it: never write over what we can't see
  if (diskRev !== readRev) throw new Error(`the project changed meanwhile (revision ${readRev} → ${diskRev}) — nothing changed; run fablecut_reframe again`);
  ProjectOps.applyPatch(proj, ops, { savedItems });
  proj.revision = readRev + 1;
  writeProject(proj);
  lastReadRevision = proj.revision;
  return `${made}Reframed ${lines.length} shot${lines.length === 1 ? "" : "s"} for ${canvas.width}×${canvas.height} (revision ${proj.revision}):\n` + lines.join("\n") +
    (skip.length ? `\nLeft as they were: ${skip.map((x) => `${x.id} (${x.why})`).join(", ")} — check them on the new canvas with fablecut_frame {time}.` : "") +
    (verWarn || "\nThe project as it was is kept as a version (fablecut_versions; restore undoes it).");
}
/* fablecut_highlights: highlights.js on the frames and sound ffmpeg streams from each source
   (frame by frame, without holding the server), then a new sequence holding the best moments. */
function streamPicture(file, from, len, w, h, push) {
  const H = require("./highlights.js");
  return new Promise((resolve, reject) => {
    const proc = spawn(FF.path("ffmpeg"), ["-v", "error", "-ss", String(Math.max(0, from)), "-t", String(Math.max(0.1, len)), "-i", file, "-an",
      "-vf", `fps=${H.PIC_FPS},scale=${w}:${h}`, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"]);
    const fb = w * h * 3;
    let rest = Buffer.alloc(0), err = "", n = 0;
    const tm = setTimeout(() => { proc.kill(); reject(new Error("ffmpeg took too long reading the footage")); }, Math.max(120000, len * 1000));
    proc.stdout.on("data", (chunk) => {
      const buf = rest.length ? Buffer.concat([rest, chunk]) : chunk;
      let o = 0;
      for (; o + fb <= buf.length; o += fb) { push(buf.subarray(o, o + fb)); n++; }
      rest = Buffer.from(buf.subarray(o));
    });
    proc.stderr.on("data", (d) => { err += d; });
    proc.on("error", (e) => { clearTimeout(tm); reject(new Error(e.code === "ENOENT" ? FF.why("ffmpeg", "to look at the footage") : e.message)); });
    proc.on("close", (code) => { clearTimeout(tm); if (code === 0) resolve(n); else reject(new Error(`ffmpeg couldn't read the footage: ${err.trim().split("\n").pop() || code}`)); });
  });
}
async function highlightsTool(args) {
  const H = require("./highlights.js"), Bt = require("./beats.js");
  const opts = H.options(args);
  const doc = readProject();
  const readRev = doc.revision || 0;
  const canvas = args.aspect ? require("./reframe.js").canvasFor(args.aspect, doc.width, doc.height) : {};   // a bad shape refuses before any reading
  const srcs = [];
  let skip = [];
  if (Array.isArray(args.mediaIds) && args.mediaIds.length) {
    for (const id of args.mediaIds.map(String)) {
      const m = (doc.media || []).find((x) => x.id === id);
      if (!m) throw new Error(`no media ${id}`);
      if (m.kind !== "video") throw new Error(`media ${id} is ${m.kind} — highlights are cut from video`);
      if (!(m.duration > 0)) throw new Error(`media ${id}: its length isn't known yet — open the editor so it probes the file, then call again`);
      srcs.push({ id: "media:" + id, clip: { id: "media:" + id, mediaId: id, kind: "video", in: 0, duration: m.duration, props: {} }, media: m });
    }
  } else {
    const ids = Array.isArray(args.clipIds) && args.clipIds.length ? args.clipIds.map(String) : null;
    const r = H.sourcesOf(doc, ids);
    skip = r.skip;
    for (const c of r.take) {
      const m = (doc.media || []).find((x) => x.id === c.mediaId);
      if (m) srcs.push({ id: c.id, clip: c, media: m });
      else skip.push({ id: c.id, why: "its media isn't in the project" });
    }
  }
  const why = () => skip.map((x) => `${x.id} (${x.why})`).join(", ");
  if (!srcs.length) throw new Error("no video to make highlights from" + (skip.length ? `: ${why()}` : "") + " — put footage on the timeline, or pass mediaIds");
  const total = srcs.reduce((n, s) => n + clipSourceLen(s.clip), 0);
  if (total > H.MAX_SOURCE_SECS)
    throw new Error(`that's ${Math.round(total / 60)} minutes of footage — up to ${H.MAX_SOURCE_SECS / 60} at a time; pass clipIds or mediaIds`);
  const sources = [];
  for (const s of srcs) {
    const file = mediaFile(s.media.src);
    if (!file) { skip.push({ id: s.id, why: "media file not found" }); continue; }
    let mw = s.media.width, mh = s.media.height;
    if (!(mw > 0 && mh > 0)) {
      const pr = spawnSync(FF.path("ffprobe"), ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", file], { timeout: 10000 });
      [mw, mh] = String(pr.stdout || "").trim().split(",").map(Number);
    }
    const w = H.SAMPLE_W, h = Math.max(8, Math.round((w * (mw > 0 && mh > 0 ? mh / mw : 9 / 16)) / 2) * 2);
    const len = clipSourceLen(s.clip), pic = H.picture(w, h);
    try { await streamPicture(file, s.clip.in || 0, len, w, h, (f) => pic.push(f)); }
    catch (e) { skip.push({ id: s.id, why: e.message }); continue; }
    if (pic.motion.length < 2) { skip.push({ id: s.id, why: "too short to look at" }); continue; }
    let aud = H.sound(NORM_SR);
    try { if (!(await streamClipAudio(doc, s.clip, () => true, (chs) => aud.push(Bt.mono(chs)), { analysis: true }))) aud = null; }
    catch { aud = null; }   // no sound to read: the picture alone decides
    sources.push({ id: s.id, len, pic, aud, speed: Math.min(8, Math.max(0.1, +s.clip.props?.speed || 1)) });
  }
  if (!sources.length) throw new Error("none of the footage could be read: " + why());
  const picks = H.pick(sources, opts);
  if (!picks.length) throw new Error("no moments long enough to use — try a shorter shot");
  const seqName = String(args.name || `Highlights ${opts.duration} s`).slice(0, 80);
  const ops = H.ops(doc, picks, { name: seqName, ...canvas });
  const proj = readProject();
  if ((proj.revision || 0) !== readRev)
    throw new Error(`the project changed while looking at the footage (revision ${readRev} → ${proj.revision}) — nothing changed; run fablecut_highlights again`);
  let verWarn = "";
  try { createHistory({ projects: createProjects({ dataDir: DATA_DIR, projectFile: PROJECT_FILE, libraryDir: LIBRARY_DIR }) }).beforeAgent("Before making highlights"); }
  catch (e) { verWarn = ` Warning: no version was saved first (${e.message}).`; }
  const diskRev = readProject().revision || 0;   // a failed read stops it: never write over what we can't see
  if (diskRev !== readRev) throw new Error(`the project changed meanwhile (revision ${readRev} → ${diskRev}) — nothing changed; run fablecut_highlights again`);
  ProjectOps.applyPatch(proj, ops, { savedItems });
  proj.revision = readRev + 1;
  writeProject(proj);
  lastReadRevision = proj.revision;
  const reshaped = canvas.width && canvas.width * doc.height !== canvas.height * doc.width;
  return H.describe(picks, { duration: opts.duration, seqName, made: true }) + `\n(revision ${proj.revision}; UI hot-reloaded.)` +
    (skip.length ? `\nNot looked at: ${why()}.` : "") +
    (reshaped ? "\nThe shots are letterboxed on the new canvas: fablecut_reframe {} fits them and follows the subject." : "") +
    "\nCheck a moment with fablecut_frame {time}; with music under it, fablecut_beats {clipId, retime:{every:2}} cuts it on the beat." +
    (verWarn || "\nThe project as it was is kept as a version (fablecut_versions; restore undoes it).");
}
/** What words are placed by and cuts land on: where each clip sits and plays from, the track
 *  switches and the frame rate. An editor saving probed media details while a transcription runs
 *  doesn't change it; a moved, trimmed or cut clip does. */
function timelineSig(doc) {
  return JSON.stringify([doc.fps, doc.lockedTracks || [], doc.untargetedTracks || [], doc.disabledTracks || [],
    (doc.clips || []).map((c) => [c.id, c.track, c.start, c.in, c.duration, c.mediaId, c.props?.speed ?? 1, c.keyframes?.speed ?? null, !!c.locked, !!c.disabled])]);
}
/** A file longer than this is listened to only where its clips play, when they cover less than half of it. */
const LONG_FILE_S = 600;
/* The words said on the timeline (or in whole files, mediaIds): transcribes what has no
   transcript yet as a job in an open tab, else headless, then lays the words out. Shared by
   fablecut_transcribe and fablecut_captions. */
async function speechWords(args, fileMode) {
  const T = require("./transcribe.js");
  const model = T.model(args.model), language = T.language(args.language);
  const doc = readProject();
  const readRev = doc.revision || 0;
  const mediaById = new Map((doc.media || []).map((m) => [m.id, m]));
  const disabled = new Set(Array.isArray(doc.disabledTracks) ? doc.disabledTracks : []);
  let entries = [], files = [], rampedN = 0;
  if (fileMode) {
    for (const id of args.mediaIds.map(String)) {
      const m = mediaById.get(id);
      if (!m) throw new Error("no media " + id);
      if (m.kind !== "audio" && m.kind !== "video") throw new Error(`media ${id} is ${m.kind} — no sound to transcribe`);
      files.push(m);
    }
  } else {
    const ids = Array.isArray(args.clipIds) && args.clipIds.length ? args.clipIds.map(String)
      : doc.clips.filter((c) => (c.kind === "audio" || c.kind === "video") && mediaById.get(c.mediaId) && mediaById.get(c.mediaId).audioChannels !== 0
        // a picture whose sound is on linked stems (they are read instead), or one with its sound off
        && !(c.kind === "video" && (c.linkGroup ? doc.clips.some((x) => x.linkGroup === c.linkGroup && x.kind === "audio") : +(c.props?.volume ?? 1) === 0))).map((c) => c.id);
    if (!ids.length) throw new Error("the timeline has no clips with sound — add some, or pass mediaIds");
    const groups = speechGroups(doc, ids).map((g) => g.filter((x) => !disabled.has(x.track) && x.disabled !== true)).filter((g) => g.length);
    if (!groups.length) throw new Error("those clips are disabled (or on disabled tracks) — nothing to read");
    for (const g of groups) {
      if (g.some(T.ramped)) { rampedN++; continue; }
      const m = mediaById.get(g[0].mediaId);
      if (m) entries.push({ clip: g[0], media: m });
    }
    if (!entries.length) throw new Error("those clips have a speed ramp (speed keyframes) — their words can't be placed on the timeline");
    files = [...new Map(entries.map((e) => [e.media.src, e.media])).values()];
  }
  if (!(await ensureUIServer())) throw new Error(`the editor server is not running and could not be started on port ${PORT}`);
  const srcs = files.map((m) => m.src);
  const st = await apiJSON("POST", "/api/transcript/status", { srcs });
  if (st.status !== 200) throw new Error(st.body?.error || "could not read the transcripts");
  const gone = srcs.filter((s) => st.body.status[s] === null);
  if (gone.length) throw new Error("these files are missing (offline): " + gone.join(", "));
  // a long recording's clips are listened to in their windows only (P8: three clips of a two-hour replay), and only
  // the parts its transcript has not covered yet; a short file, or mediaIds, is listened to whole
  const rangesOf = new Map();
  if (!fileMode) for (const m of files) {
    // a file whose length the project doesn't know yet is listened to in its clips' windows too, never whole (MC-11:
    // 16 s of captions read a whole 2-hour file)
    const dur = +m.duration > 0 ? +m.duration : null;
    if (dur != null && !(dur > LONG_FILE_S)) continue;
    const rs = T.clipRanges(entries.filter((e) => e.media.src === m.src).map((e) => e.clip), { duration: dur });
    if (rs.length && (dur == null || T.rangeSeconds(rs) < dur / 2)) rangesOf.set(m.src, rs);
  }
  const ask = {};
  const todo = srcs.filter((s) => {
    const info = st.body.status[s], rs = rangesOf.get(s);
    if (rs) {
      const left = args.again === true ? rs : T.missingSpans(info || null, rs);
      if (left.length) ask[s] = left;
      return left.length > 0;
    }
    return args.again === true || !info || Array.isArray(info.spans);   // parts of it only: now the whole file
  });
  let note = "";
  if (todo.length) {
    const r = await apiJSON("POST", "/api/transcribe/request", { where: args.where || "auto",
      transcribe: { srcs: todo, model, language, again: args.again === true, ...(Object.keys(ask).length ? { ranges: ask } : {}) } });
    if (r.status !== 200) throw new Error(r.body?.error || `transcribe request failed (${r.status})`);
    const job = await waitJob(r.body, { every: 1000, timeout: Number.isFinite(args.timeout) && args.timeout > 0 ? args.timeout : 1800,
      what: "transcription job", timeoutError: "timed out waiting for the transcription — try fewer clips, or a larger timeout" });
    if (job.status !== "done") {
      const why = String(job.error || "");
      const S = require("./asr-status");
      const code = Object.keys(S.SAY).find((c) => new RegExp("\\b" + c + "\\b").test(why));   // ASR_MANIFEST_MISSING · ASR_ENGINE_MISSING · ASR_MODEL_MISSING
      if (code) throw new Error(S.SAY[code]);
      throw new Error(`transcription ${job.status}: ${why || "no reason given"}`);
    }
    const res = job.result || {};
    const partial = (res.done || []).filter((d) => d.gaps);
    note = (partial.length ? `PARTLY transcribed: ${partial.reduce((n, d) => n + d.gaps, 0)} part(s) could not be read (${Math.round(partial.reduce((t, d) => t + (d.gapSeconds || 0), 0))} s in all) and have no words — no subtitles there; the rest is below. ` : "") +
      `Transcribed ${(res.done || []).length} file${(res.done || []).length === 1 ? "" : "s"} (${model}${language ? ", " + language : ""}, in ${job.via === "headless" ? "a headless browser" : "the open editor tab"})` +
      ((res.failed || []).length ? `; failed: ${res.failed.map((f) => `${f.src} (${f.error})`).join(", ")}` : "") + ".\n";
  }
  const docs = new Map();
  for (const src of srcs) {
    const g = await apiJSON("GET", "/api/transcript?src=" + encodeURIComponent(src));
    if (g.status === 200 && g.body?.transcript) docs.set(src, T.validate(g.body.transcript));
  }
  const langs = [...new Set([...docs.values()].map((d) => d.language === "auto" ? "detected" : d.language).filter(Boolean))];
  const without = srcs.filter((s) => !docs.has(s));
  let words, scope;
  if (fileMode) {
    // file seconds, one file after another
    words = [];
    for (const m of files) { const d = docs.get(m.src); if (d) words.push(...d.words.map(([w, s, e]) => ({ w, s, e, clip: m.id, r: [0, d.duration || e] }))); }
    scope = `${files.length} file${files.length === 1 ? "" : "s"} (file seconds)`;
  } else {
    words = T.layout(entries.filter((e) => docs.has(e.media.src)).map((e) => ({ clip: e.clip, words: docs.get(e.media.src).words })));
    scope = `${entries.length} clip${entries.length === 1 ? "" : "s"} on the timeline (timeline seconds)`;
  }
  return { doc, readRev, sig: timelineSig(doc), words, scope, note, langs, without, rampedN };
}
/* fablecut_transcribe: transcripts from the editor (a job), read on the timeline, found, cut. */
async function transcribeTool(args) {
  const T = require("./transcribe.js");
  const model = T.model(args.model), language = T.language(args.language);
  const finds = (args.find == null ? [] : Array.isArray(args.find) ? args.find : [args.find]).map(String).filter((q) => T.norm(q));
  if (args.find != null && !finds.length) throw new Error("find needs a word or phrase with letters or digits in it");
  const fileMode = Array.isArray(args.mediaIds) && args.mediaIds.length;
  if (args.cut === true && !finds.length) throw new Error("cut:true needs find — the words or phrases to cut");
  if (args.cut === true && fileMode) throw new Error("cut works on the timeline — pass clipIds (or nothing), not mediaIds");
  const { doc, sig, words, scope, note, langs, without, rampedN } = await speechWords(args, fileMode);
  const fmtT = (x) => fmtClock(Math.max(0, x));
  const lo = Number.isFinite(args.from) ? args.from : -Infinity, hi = Number.isFinite(args.to) ? args.to : Infinity;
  const inWin = (w) => w.e >= lo && w.s <= hi;
  const head = note + `${words.filter(inWin).length} words, ${scope}` + (langs.length ? `, language ${langs.join("/")}` : "") +
    (without.length ? `; no transcript for ${without.join(", ")}` : "") + (rampedN ? `; ${rampedN} clip(s) with a speed ramp left out` : "");
  if (!finds.length) {
    const segs = T.segments(words).filter((sg) => sg.to >= lo && sg.from <= hi);
    const MAX = 300;
    const lines = segs.slice(0, MAX).map((sg) => `[${fmtT(sg.from)}] ${sg.text}`);
    return [head + (segs.length ? ":" : "."), ...lines,
      ...(segs.length > MAX ? [`… ${segs.length - MAX} more lines — pass from (e.g. ${segs[MAX].from.toFixed(1)}) to read on`] : []),
      ...(segs.length ? ["find:\"…\" locates a phrase; with cut:true it is cut out."] : [])].join("\n");
  }
  // find (and cut)
  const runs = [], report = [];
  for (const q of finds) {
    const hits = T.find(words, q).filter((r) => inWin(words[r.i]) && inWin(words[r.j]));
    const spans = T.cutSpans(words, hits, { fps: doc.fps });
    report.push(`"${q}": ${hits.length} match${hits.length === 1 ? "" : "es"}` + (hits.length ? ":" : ""));
    for (const r of hits.slice(0, 50)) {
      const ctx = `${T.text(words, Math.max(0, r.i - 4), r.i - 1)} «${T.text(words, r.i, r.j)}» ${T.text(words, r.j + 1, Math.min(words.length - 1, r.j + 4))}`.trim();
      report.push(`  ${fmtT(words[r.i].s)} → ${fmtT(words[r.j].e)}  ${ctx}`);
    }
    if (hits.length > 50) report.push(`  … +${hits.length - 50} more`);
    runs.push(...hits);
    if (!spans.length && hits.length) report.push("  (each is too short to cut on its own)");
  }
  const spans = T.cutSpans(words, runs, { fps: doc.fps });
  if (args.cut !== true) return [head + ".", ...report,
    ...(spans.length && !fileMode ? [`Cutting them would remove ${spans.length} span${spans.length === 1 ? "" : "s"}, ${T.total(spans).toFixed(1)} s (the words and the pause after each): call again with cut:true.`] : [])].join("\n");
  if (!spans.length) return [head + ".", ...report, "Nothing to cut."].join("\n");
  const proj = readProject(), readRev = proj.revision || 0;
  if (timelineSig(proj) !== sig)
    throw new Error("the timeline changed while transcribing (a clip was moved, trimmed or cut) — nothing cut; run fablecut_transcribe again");
  const end = (p) => p.clips.reduce((m, c) => Math.max(m, c.start + c.duration), 0);
  const before = end(proj);
  ProjectOps.applyPatch(proj, T.cutOps(spans, { tracks: args.tracks, force: args.force === true }), { savedItems });
  let verWarn = "";
  try { createHistory({ projects: createProjects({ dataDir: DATA_DIR, projectFile: PROJECT_FILE, libraryDir: LIBRARY_DIR }) }).beforeAgent("Before cutting words"); }
  catch (e) { verWarn = ` Warning: no version was saved before the cut (${e.message}).`; }
  const diskRev = readProject().revision || 0;   // a failed read stops it: never write over what we can't see
  if (diskRev !== readRev) throw new Error(`the project changed while cutting (revision ${readRev} → ${diskRev}) — nothing cut; run fablecut_transcribe again`);
  proj.revision = readRev + 1;
  writeProject(proj);
  lastReadRevision = proj.revision;
  return [head + ".", ...report,
    `Cut ${spans.length} span${spans.length === 1 ? "" : "s"}, ${T.total(spans).toFixed(1)} s — timeline ${fmtDur(before)} → ${fmtDur(end(proj))} (revision ${proj.revision}). UI hot-reloaded.` +
    (verWarn || " The project as it was is kept as a version (fablecut_versions lists it; restore undoes the cut).")].join("\n");
}
/* fablecut_captions: caption clips from the transcripts (captions.js), subtitle files out and in. */
async function captionsTool(args) {
  const C = require("./captions.js");
  const st = C.style(args.style);
  const ownLocks = (proj, c) => c.locked === true || (Array.isArray(proj.lockedTracks) && proj.lockedTracks.includes(c.track));
  if (args.keepIds != null || args.keepRanges != null) {
    if (args.keepIds != null && args.keepRanges != null) throw new Error("Use keepIds or keepRanges separately");
    if (args.export != null || args.import != null || args.remove) throw new Error("keepIds must be used separately from import/export/remove");
    const proj = readProject();
    if (!Number.isInteger(args.baseRevision) || args.baseRevision !== proj.revision)
      throw new Error(`CONFLICT — not saved: read the project and supply baseRevision ${proj.revision}`);
    const ranges = args.keepRanges || args.keepIds.map(id => {
      const c = proj.clips.find(c => c.id === id && C.isCaption(c));
      if (!c) throw new Error("Unknown caption: " + id);
      return { from: c.start, to: c.start+c.duration };
    });
    const plan = require("./range-plan").create(proj, ranges);
    Object.assign(proj, plan.project);
    const history = createHistory({ projects: createProjects({ dataDir: DATA_DIR, projectFile: PROJECT_FILE, libraryDir: LIBRARY_DIR }) });
    history.beforeAgent("Before joining caption sentences");
    proj.revision++;
    writeProject(proj);
    lastReadRevision = proj.revision;
    return `Kept ${plan.segments.length} ranges in user order; ${plan.duration}s (revision ${proj.revision}). Source files unchanged. Export srt and mapping separately.`;
  }
  if (args.export === "mapping") {
    const proj = readProject(), map = C.sourceMap(proj);
    if (!map.segments.length) throw new Error("No source media clips to map");
    fs.mkdirSync(EXPORTS_DIR, { recursive: true });
    const base = Delivery.fileSafeName(String(proj.name || ""), "captions", { max: 80 });
    let file = path.join(EXPORTS_DIR, `${base}.mapping.json`);
    for (let n = 2; fs.existsSync(file); n++) file = path.join(EXPORTS_DIR, `${base} ${n}.mapping.json`);
    fs.writeFileSync(file, JSON.stringify(map, null, 2));
    return `Wrote ${map.segments.length} source/output segments to ${file}. Times describe the edit; encoder/A-V accuracy is not measured here.`;
  }
  if (args.export != null) {
    if (args.export !== "srt" && args.export !== "vtt") throw new Error("export must be srt or vtt");
    const proj = readProject(), list = C.fromClips(proj.clips, proj.disabledTracks);
    if (!list.length) throw new Error("there are no captions on the timeline to export — make them first (fablecut_captions {})");
    fs.mkdirSync(EXPORTS_DIR, { recursive: true });
    const base = Delivery.fileSafeName(String(proj.name || ""), "captions", { max: 80 });
    let file = path.join(EXPORTS_DIR, `${base}.${args.export}`);
    for (let n = 2; fs.existsSync(file); n++) file = path.join(EXPORTS_DIR, `${base} ${n}.${args.export}`);
    fs.writeFileSync(file, args.export === "srt" ? C.toSRT(list) : C.toVTT(list));
    return `Wrote ${list.length} caption${list.length === 1 ? "" : "s"} to ${file} (${args.export === "srt" ? "SubRip" : "WebVTT"}, ${fmtClock(list[0].start)} → ${fmtClock(list[list.length - 1].end)}).`;
  }
  if (args.remove === true) {
    const proj = readProject(), caps = proj.clips.filter(C.isCaption);
    if (!caps.length) return "There are no captions on the timeline.";
    const locked = caps.filter((c) => ownLocks(proj, c));
    if (locked.length && args.force !== true) throw new Error(`${locked.length} caption(s) are locked — nothing removed (pass force:true only if the user asked)`);
    ProjectOps.applyPatch(proj, caps.map((c) => ({ op: "removeClip", id: c.id, ...(args.force === true ? { force: true } : {}) })), { savedItems });
    proj.revision = (proj.revision || 0) + 1;
    writeProject(proj);
    lastReadRevision = proj.revision;
    return `Removed ${caps.length} caption${caps.length === 1 ? "" : "s"} (revision ${proj.revision}). UI hot-reloaded.`;
  }
  let list, note = "", sig;
  const first = readProject();
  const m = C.metrics(st, first.width || 1920, first.height || 1080, { lines: args.lines, words: args.words, scale: args.size });
  if (args.import != null) {
    let text = String(args.import);
    const asFile = text.length < 1024 && !text.includes("-->");
    if (asFile) {
      const file = text.startsWith("/media/") ? path.join(MEDIA_DIR, decodeURIComponent(text.slice(7))) : path.resolve(text);
      if (!fs.existsSync(file)) throw new Error("no such subtitle file: " + text);
      text = fs.readFileSync(file, "utf8");
    }
    list = C.fit(C.parse(text), m.chars, m.lines);
    sig = timelineSig(first);
    note = `Read ${list.length} caption${list.length === 1 ? "" : "s"} from the ${/^WEBVTT/m.test(text) ? "WebVTT" : "SubRip"} file.\n`;
  } else {
    const r = await speechWords(args, false);
    const lo = Number.isFinite(args.from) ? args.from : -Infinity, hi = Number.isFinite(args.to) ? args.to : Infinity;
    const words = r.words.filter((w) => w.s >= lo && w.e <= hi);
    if (!words.length) throw new Error("no words to caption" + (r.without.length ? ` — no transcript for ${r.without.join(", ")}` : " in that stretch"));
    list = C.cues(words, { chars: m.chars, lines: m.lines, words: m.words, maxDur: m.maxDur, fps: r.doc.fps });
    sig = r.sig;
    note = r.note;
  }
  const proj = readProject(), readRev = proj.revision || 0;
  if (timelineSig(proj) !== sig)
    throw new Error("the timeline changed while transcribing (a clip was moved, trimmed or cut) — nothing added; run fablecut_captions again");
  const old = args.replace === false ? [] : proj.clips.filter(C.isCaption);
  const lockedOld = old.filter((c) => ownLocks(proj, c));
  if (lockedOld.length && args.force !== true) throw new Error(`${lockedOld.length} existing caption(s) are locked — nothing changed (pass replace:false to keep them, or force:true if the user asked)`);
  const from = list[0].start, to = list[list.length - 1].end;
  let lane = args.track ? { track: String(args.track), add: false } : C.trackFor(old.length ? proj : { ...proj, clips: proj.clips.filter((c) => !C.isCaption(c)) }, from, to);
  if (!/^V\d+$/.test(lane.track)) throw new Error("track must be a video lane such as V3");
  if (args.track && !(proj.tracks || C.DEFAULT_TRACKS).some((t) => t.id === lane.track)) lane.add = true;
  if (Array.isArray(proj.lockedTracks) && proj.lockedTracks.includes(lane.track) && args.force !== true) throw new Error(`${lane.track} is locked — pick another track, or unlock it`);
  if (lane.add) proj.tracks = [{ id: lane.track, kind: "video" }, ...(Array.isArray(proj.tracks) && proj.tracks.length ? proj.tracks : C.DEFAULT_TRACKS)];
  const ops = [
    ...old.map((c) => ({ op: "removeClip", id: c.id, ...(args.force === true ? { force: true } : {}) })),
    ...list.map((cue) => ({ op: "addClip", clip: C.clip(cue, { style: st, width: proj.width, height: proj.height, track: lane.track, scale: args.size }), ...(args.force === true ? { force: true } : {}) })),
  ];
  ProjectOps.applyPatch(proj, ops, { savedItems });
  proj.revision = readRev + 1;
  writeProject(proj);
  lastReadRevision = proj.revision;
  const sample = list.slice(0, 3).map((c) => `  [${fmtClock(c.start)}] ${c.text.replace(/\n/g, " / ")}`);
  return note + `Added ${list.length} caption${list.length === 1 ? "" : "s"} (${C.STYLES[st].label}, ${m.fontSize} px) on ${lane.track}${lane.add ? " (a new lane)" : ""}, ${fmtClock(from)} → ${fmtClock(to)}` +
    (old.length ? `, replacing ${old.length}` : "") + ` (revision ${proj.revision}). UI hot-reloaded.\n` + sample.join("\n") +
    (list.length > 3 ? `\n  … ${list.length - 3} more` : "") + "\nfablecut_frame {time} shows how one looks; export:\"srt\" writes a subtitle file.";
}
/** The clips that sound for a selection: a linked group's audio stems, else the clip. */
function normalizeGroups(proj, ids) {
  const groups = new Map();
  for (const id of ids) {
    const c = proj.clips.find((x) => x.id === id);
    if (!c) throw new Error("no clip " + id);
    if (c.kind !== "audio" && c.kind !== "video") throw new Error(`clip ${id} is ${c.kind} — no audio to normalize`);
    const key = c.linkGroup || c.id;
    if (groups.has(key)) continue;
    const members = c.linkGroup ? proj.clips.filter((x) => x.linkGroup === c.linkGroup) : [c];
    const stems = members.filter((x) => x.kind === "audio");
    groups.set(key, stems.length ? stems : members);
  }
  return [...groups.values()];
}

/* ── Noise reduction (fablecut_denoise) — denoise.js, as the editor's Noise control ── */
async function denoiseTool(args) {
  const ids = Array.isArray(args.clipIds) ? args.clipIds.map(String) : [];
  if (!ids.length) throw new Error("`clipIds` must list at least one clip");
  const amount = args.amount == null ? "medium" : String(args.amount);
  if (amount !== "off" && !Denoise.AMOUNT_IDS.includes(amount)) throw new Error(`amount must be one of ${Denoise.AMOUNT_IDS.join(", ")}, off`);
  let doc = readProject();
  const picked = ids.map((id) => {
    const c = doc.clips.find((x) => x.id === id);
    if (!c) throw new Error("no clip " + id);
    return c;
  });
  const targets = Denoise.denoiseTargets(doc, picked);
  const lockedTracks = new Set(Array.isArray(doc.lockedTracks) ? doc.lockedTracks : []);
  const isLocked = (c) => (c.linkGroup ? doc.clips.filter((x) => x.linkGroup === c.linkGroup) : [c])
    .some((x) => x.locked === true || lockedTracks.has(x.track));
  if (args.force !== true && targets.some(isLocked))
    throw new Error(`${targets.filter(isLocked).map((c) => c.id).join(", ")} locked — the user locked it. Leave it alone, or pass force:true if they asked you to change it`);
  const bases = [...new Set(targets.map((c) => Denoise.baseMediaId(doc, c.mediaId)))];
  const rendered = new Map(); // base id → {r, base}
  if (amount !== "off") {
    for (const id of bases) {
      const base = doc.media.find((m) => m.id === id);
      const file = base && mediaFile(base.src);
      if (!file) throw new Error(`media ${id}: file not found`);
      rendered.set(id, { base, r: await Denoise.denoiseFile(file, MEDIA_DIR, amount) });
    }
  }
  // Re-read after the (slow) render so concurrent UI edits are kept.
  const proj = readProject();
  const report = [];
  const swap = new Map();
  for (const id of bases) {
    if (amount === "off") { swap.set(id, id); continue; }
    const { base, r } = rendered.get(id);
    const src = "/media/" + encodeURIComponent(r.name);
    let m = proj.media.find((x) => x.src === src);
    if (!m) {
      m = { id: "m_" + uid(), name: r.name, kind: "audio", src, duration: r.duration, folderId: base.folderId || null,
        derivedFrom: base.id, denoise: amount };
      proj.media.push(m);
    }
    swap.set(id, m.id);
    report.push(`${id} → ${m.id} "${r.name}"${r.cached ? " (already rendered)" : ""}`);
  }
  let changed = 0;
  for (const t of targets) {
    const c = proj.clips.find((x) => x.id === t.id);
    if (!c) continue;
    const next = swap.get(Denoise.baseMediaId(proj, c.mediaId));
    if (next && next !== c.mediaId) { c.mediaId = next; changed++; }
  }
  proj.revision = (proj.revision || 0) + 1;
  writeProject(proj);
  lastReadRevision = proj.revision;
  return `Noise reduction ${amount} on ${targets.map((c) => c.id).join(", ")} (revision ${proj.revision}, ${changed} clip${changed === 1 ? "" : "s"} switched)` +
    (report.length ? ":\n" + report.join("\n") : "");
}

/* ── Export (fablecut_export) ── */
/** Saved delivery presets (library/delivery/), as the server lists them. */
function savedDeliveryPresets() { return Delivery.savedPresets(readSaved("delivery")); }
function describeExportJob(j) {
  const pct = Math.round((j.progress || 0) * 100);
  if (j.status === "done") {
    const file = path.join(EXPORTS_DIR, path.basename(decodeURIComponent(j.src || "")));
    let size = "";
    try { size = ` (${(fs.statSync(file).size / 1048576).toFixed(1)} MB)`; } catch {}
    const outs = j.result && Array.isArray(j.result.outputs) ? j.result.outputs : null;
    if (outs && outs.length > 1) {
      return `Export ${j.id} done — ${outs.filter((o) => o.ok).length} of ${outs.length} files:\n` + outs.map((o) => o.ok
        ? `✓ ${path.join(EXPORTS_DIR, o.file)}${o.summary ? ` — ${o.summary}` : ""}${o.report ? `\n    ${o.report.ok ? "checks passed" : "CHECK"}: ${o.report.line}` : ""}`
        : `✗ ${o.file}: ${o.error}`).join("\n");
    }
    const rep = outs && outs[0] && outs[0].report;
    return `Export ${j.id} done → ${file}${size}${j.result && j.result.summary ? `\n${j.result.summary}` : ""}` +
      `${rep ? `\n${rep.ok ? "Checks passed" : "CHECK"}: ${rep.line}` : ""}\nServed at ${BASE}${j.src}`;
  }
  // fablecut_export {cancel} also frees the queue of a scope reading, frame, tracking or transcription job
  const noun = { scopes: "Scope reading / frame", track: "Tracking job", transcribe: "Transcription" }[j.kind] || "Export";
  if (j.status === "failed" || j.status === "cancelled") return `${noun} ${j.id} ${j.status}: ${j.error || "no reason given"}`;
  return `Export ${j.id} ${j.status}${j.status === "running" ? ` — ${pct}%` : ""} (in ${j.via === "headless" ? "a headless browser" : "the open editor tab"}). ` +
    `Check again with fablecut_export {job:"${j.id}"}, or stop it with {cancel:"${j.id}"}.`;
}
/* fablecut_proxy: the server makes proxies (proxy.js); this asks it, and waits. */
/* fablecut_projects: through the editor server, so it is the only process that
   switches ./project.json and its tabs hear about it at once. */
function describeProject(p) {
  const dur = p.duration == null ? "?" : `${Math.floor(p.duration / 60)}:${String(Math.round(p.duration % 60)).padStart(2, "0")}`;
  return `${p.id} "${p.name}"${p.active ? " (OPEN)" : ""}${p.archived ? " [archived]" : ""} — ` +
    (p.unreadable ? "project file unreadable" : `${p.width}x${p.height}@${p.fps} ${dur}, ${p.clips} clip(s), ${p.media} media`) +
    (p.modified ? `, modified ${p.modified.slice(0, 16).replace("T", " ")}` : "") +
    (p.tags?.length ? " " + p.tags.map((t) => "#" + t).join(" ") : "") +
    (p.notes ? `\n    notes: ${p.notes.length > 300 ? p.notes.slice(0, 300) + "…" : p.notes}` : "");
}
const describeTemplate = (t) => `${t.id} "${t.name}" ${t.width}x${t.height}@${t.fps}${t.builtin ? " (built-in)" : ` — ${t.clips} clip(s)`}`;
async function projectsTool(args) {
  if (!(await ensureUIServer())) throw new Error(`the editor server is not running and could not be started on port ${PORT}`);
  const action = args.action || "list";
  if (action === "list") {
    const r = await apiJSON("GET", "/api/projects?archived=" + encodeURIComponent(args.archived || "exclude"));
    if (r.status !== 200) throw new Error(r.body?.error || `projects request failed (${r.status})`);
    const { projects, templates } = r.body;
    return [`${projects.length} project(s):`, ...projects.map(describeProject),
      `Templates (action:"new", template): ${templates.map((t) => t.id).join(", ")}`].join("\n");
  }
  const r = await apiJSON("POST", "/api/projects", { ...args, action });
  if (r.status !== 200) throw new Error(r.body?.error || `projects request failed (${r.status})`);
  const out = r.body;
  if (action === "templates") return out.templates.map(describeTemplate).join("\n");
  if (action === "save_template") return `Saved template ${describeTemplate(out.template)}. Start a project from it: {action:"new", template:"${out.template.id}", name}.`;
  if (action === "delete_template") return `Deleted template ${out.template}.`;
  if (action === "delete") return `Deleted project ${out.id} (its media stay in media/).`;
  if (out.already) return `${describeProject(out.project)}\nAlready open.`;
  if (out.from) return `Opened ${describeProject(out.project)}\nThe editor switched to it (${out.from} was saved first). Read it with fablecut_get_project {compact:true} before editing.`;
  return describeProject(out.project);
}
/* fablecut_versions: through the editor server, like fablecut_projects. */
const KIND_LABEL = { manual: "", auto: " (auto)", agent: " (before agent edits)", restore: " (before a restore)" };
function describeVersion(e) {
  const when = e.created ? e.created.slice(0, 16).replace("T", " ") : "?";
  return `v${e.v}${e.final ? " FINAL" : ""} "${e.name}"${KIND_LABEL[e.kind] || ""} — ${when}, ${e.clips} clip(s), ` +
    `${Math.floor(Math.round(e.duration) / 60)}:${String(Math.round(e.duration) % 60).padStart(2, "0")}, revision ${e.revision}` +
    (e.note ? `\n    note: ${e.note.length > 300 ? e.note.slice(0, 300) + "…" : e.note}` : "");
}
async function versionsTool(args) {
  if (!(await ensureUIServer())) throw new Error(`the editor server is not running and could not be started on port ${PORT}`);
  const action = args.action || "list";
  const r = action === "list"
    ? await apiJSON("GET", "/api/versions" + (args.project ? "?project=" + encodeURIComponent(args.project) : ""))
    : await apiJSON("POST", "/api/versions", { ...args, action });
  if (r.status !== 200) throw new Error(r.body?.error || `versions request failed (${r.status})`);
  const out = r.body;
  if (action === "list") return out.versions.length
    ? [`${out.versions.length} version(s) of ${out.project}, newest first:`, ...out.versions.map(describeVersion)].join("\n")
    : `No versions of ${out.project} yet. {action:"save", name, note} keeps one.`;
  if (action === "save") return `Saved ${describeVersion(out.version)}`;
  if (action === "update") return describeVersion(out.version);
  if (action === "delete") return `Deleted v${out.deleted}.`;
  if (action === "restore") return `Restored v${out.restored.v} "${out.restored.name}". What was there is kept as v${out.saved.v} "${out.saved.name}" (restore it to undo). ` +
    (out.open === false
      ? `${out.project} is not the open project, so the editor didn't change; open it (fablecut_projects {action:"open", id:"${out.project}"}) before reading or editing it.`
      : `The editor reloaded; re-read the project (fablecut_get_project {compact:true}) before editing.`);
  if (action === "diff") return out.same
    ? `No difference between ${out.from === "current" ? "now" : "v" + String(out.from).replace(/^v/, "")} and ${out.to === "current" ? "now" : "v" + String(out.to).replace(/^v/, "")}.`
    : [`From v${String(out.from).replace(/^v/, "")} to ${out.to === "current" ? "now" : "v" + String(out.to).replace(/^v/, "")}:`, ...out.lines.map((l) => "- " + l)].join("\n");
  return JSON.stringify(out);
}
/* Before an agent changes the project: a version to go back to. Once per session start
   (or after 10 quiet minutes), and before every whole-document rewrite. */
let lastAgentVersion = 0;
/** "" when the version was kept (or wasn't due), else a warning for the tool's answer:
 *  a version is a safety net, so the edit itself goes ahead either way. */
function versionBeforeAgent(rewrite) {
  if (!rewrite && Date.now() - lastAgentVersion < 10 * 60_000) return "";
  try {
    const pj = createProjects({ dataDir: DATA_DIR, projectFile: PROJECT_FILE, libraryDir: LIBRARY_DIR });
    createHistory({ projects: pj }).beforeAgent(rewrite ? "Before an agent rewrote the project" : "Before agent edits");
    lastAgentVersion = Date.now();
    return "";
  } catch (e) {
    return ` Warning: no version was saved before this edit (${e.message}) — fablecut_versions {action:"save"} keeps one.`;
  }
}
/* fablecut_repair_media (JJ, P3, 2026-11-05): 〔帮我修好〕 for agents — repairs and the general conversion, one path (the old 〔帮我转〕 — any
   video, FLV or not, without allowTranscode. A background job (the long-operation convention, MontClip-Cindy #3):
   {mediaId} answers at once with the job; {job} says how far it got and, once done, the new mediaId; {cancel} stops
   it; the same {mediaId} again while it runs joins that job. Done: the new MP4 takes the entry's place (MediaLib.swapMedia),
   a version of the project kept first, so the swap can be undone (fablecut_versions; in the editor, Ctrl+Z). */
const repairJobs = MakeEditable.createJobs({ prefix: "r_" });
const repairNames = new Map();   // job → the file's name, for the words when it fails
const REPAIR_WORDS = {
  REPAIR_FAILED: (name) => `"${name}" stopped recording before it was saved, and this kind can't be fixed. The original file is unchanged — please use a complete file.`,
  REPAIR_ENCODER_MISSING: (name) => `This computer has no encoder MontClip can use to fix "${name}", so nothing was written. The original file is unchanged.`,
  REPAIR_CANCELLED: () => "Stopped; nothing was changed.",
};
function repairLine(j) {
  const pct = Math.round(j.progress * 100);
  const head = j.status === "done" ? `Fixed. Clips that use it now use the fixed copy, in the same place. The original is still there. (Usable part ${j.result.duration}s; now media ${j.result.mediaId}, it replaced ${j.result.replaced}${j.result.clips ? `; ${j.result.clips} clip(s) switched` : ""}.)`
    : j.status === "failed" || j.status === "cancelled" ? (REPAIR_WORDS[j.error.code] ? REPAIR_WORDS[j.error.code](repairNames.get(j.job) || "this video") : j.error.message)
    : `Repair job ${j.job}: ${j.status} ${pct}% (${j.phase}). Call again with job "${j.job}" for progress and the result, or cancel "${j.job}" to stop it.`;
  return head + "\n" + JSON.stringify(j);
}
async function repairTool(args) {
  if (args.cancel != null) {
    const j = repairJobs.cancel(args.cancel);
    if (!j) throw new Error("no repair job " + args.cancel);
    return repairLine(j);
  }
  if (args.job != null) {
    const j = repairJobs.get(args.job);
    if (!j) throw new Error("no repair job " + args.job + " (jobs live as long as this MCP server runs; start it again with {mediaId})");
    return repairLine(j);
  }
  const id = args.mediaId != null ? String(args.mediaId) : "";
  if (!id) throw new Error("mediaId is required (or job / cancel)");
  const doc = readProject();
  const m = (doc.media || []).find((x) => x.id === id);
  if (!m) throw new Error("no media " + id);
  if (m.kind !== "video") throw new Error(`${id} is ${m.kind}: only a video can be repaired or converted`);
  const file = mediaFile(m.src);
  if (!file) throw new Error(`${id}: its file is missing (offline) — relinkMedia first`);
  const lockedTracks = new Set(Array.isArray(doc.lockedTracks) ? doc.lockedTracks : []);
  const locked = (doc.clips || []).filter((c) => c.mediaId === id && (c.locked === true || lockedTracks.has(c.track)));
  if (locked.length && args.force !== true)
    throw new Error(`${locked.map((c) => c.id).join(", ")} locked — the user locked it. Leave it alone, or pass force:true if they asked you to change it`);
  const j = repairJobs.start(id, async ({ signal, onProgress }) => {
    const r = await MakeEditable.makeEditable(file, { outDir: MEDIA_DIR, signal, onProgress });
    const name = path.basename(r.file);
    const entry = { id: "m_" + uid(), name, kind: "video", src: "/media/" + encodeURIComponent(name), duration: r.duration, preparation: r.preparation };
    Object.assign(entry, infoForEntry(await probeFile(r.file), entry));
    versionBeforeAgent(true);
    // re-read: the project may have changed while it ran; re-checked just before the write (as fablecut_patch_project
    // does), so an editor save that lands meanwhile is re-read and kept
    let proj, clips = 0, replaced = id;
    for (let attempt = 0; ; attempt++) {
      proj = readProject();
      const readRev = proj.revision || 0;
      const wasCurrent = lastReadRevision === readRev;
      clips = 0; replaced = id;
      if ((proj.media || []).some((x) => x.id === id)) clips = MediaLib.swapMedia(proj, id, entry).clips;
      else { proj.media.push(entry); replaced = null; }   // the original was removed meanwhile: just added
      if ((readProject().revision || 0) !== readRev && attempt < 3) continue;
      proj.revision = readRev + 1;
      writeProject(proj);
      if (wasCurrent) lastReadRevision = proj.revision;
      break;
    }
    return { mediaId: entry.id, replaced, duration: r.duration, preparation: r.preparation, ...(r.encoder ? { encoder: r.encoder } : {}), src: entry.src, clips };
  });
  repairNames.set(j.job, m.name);
  return repairLine(j);
}
async function proxyTool(args) {
  if (!(await ensureUIServer())) throw new Error(`the editor server is not running and could not be started on port ${PORT}`);
  const proj = readProject();
  const ids = Array.isArray(args.mediaIds) && args.mediaIds.length ? args.mediaIds : proj.media.filter((m) => m.kind === "video").map((m) => m.id);
  const list = ids.map((id) => {
    const m = proj.media.find((x) => x.id === id);
    if (!m) throw new Error(`no media ${id}`);
    if (m.kind !== "video") throw new Error(`${id} is ${m.kind === "audio" || m.kind === "image" ? "an" : "a"} ${m.kind} — only video gets a proxy`);
    return m;
  });
  if (!list.length) return "No video in the project.";
  const srcs = list.map((m) => m.src);
  if (args.delete) {
    const r = await apiJSON("POST", "/api/proxy/delete", { srcs });
    if (r.status !== 200) throw new Error(r.body?.error || "delete failed");
    return list.map((m) => `${m.id} "${m.name}": ${r.body.deleted[m.src] ? "proxy deleted" : "had no proxy"}`).join("\n");
  }
  let r = await apiJSON("POST", args.create ? "/api/proxy" : "/api/proxy/status", { srcs, height: args.height });
  if (r.status !== 200) throw new Error(r.body?.error || `proxy request failed (${r.status})`);
  let status = r.body.status;
  const busy = () => Object.values(status).some((s) => s && (s.state === "queued" || s.state === "running"));
  if (args.create && args.wait !== false) {
    const deadline = Date.now() + 1000 * (Number.isFinite(args.timeout) && args.timeout > 0 ? args.timeout : 900);
    while (busy() && Date.now() < deadline) {
      await sleep(1000);
      r = await apiJSON("POST", "/api/proxy/status", { srcs });
      if (r.status === 200) status = r.body.status;
    }
  }
  const line = (m) => {
    const s = status[m.src];
    if (!s) return `${m.id} "${m.name}": OFFLINE — the file is missing`;
    if (s.state === "ready") return `${m.id} "${m.name}": proxy ready — ${s.width ? s.width + "×" + s.height : s.height + "p"}, ${(s.size / 1048576).toFixed(1)} MB (${s.src})`;
    if (s.state === "running" || s.state === "queued") return `${m.id} "${m.name}": proxy ${s.state}${s.state === "running" ? ` ${Math.round(s.progress * 100)}%` : ""} (${s.height}p)`;
    if (s.state === "failed") return `${m.id} "${m.name}": proxy FAILED — ${s.error}`;
    return `${m.id} "${m.name}": no proxy${m.height ? ` (source ${m.width}×${m.height})` : ""}`;
  };
  return list.map(line).join("\n") + (busy() ? "\nStill working — call fablecut_proxy again (without create) to check." : "");
}
async function exportTool(args) {
  if (!(await ensureUIServer())) throw new Error(`the editor server is not running and could not be started on port ${PORT}`);
  let startNote = "";
  if (args.cancel) {
    const r = await apiJSON("POST", "/api/export/job/cancel?id=" + encodeURIComponent(args.cancel));
    if (r.status !== 200) throw new Error(r.body?.error || "cancel failed");
    return describeExportJob(r.body);
  }
  let job;
  if (args.job) {
    const r = await apiJSON("GET", "/api/export/job?id=" + encodeURIComponent(args.job));
    if (r.status !== 200) throw new Error(r.body?.error || "no such export job");
    job = r.body;
  } else {
    const r = await apiJSON("POST", "/api/export/request", { range: args.range, profile: args.profile, preset: args.preset, delivery: args.delivery, outputs: args.outputs, where: args.where || "auto" });
    if (r.status !== 200) throw new Error(r.body?.error || `export request failed (${r.status})`);
    job = r.body;
    if (job.notes && job.notes.length) startNote = `Settings adjusted: ${job.notes.join("; ")}\n`;
    if (args.wait === false) return (job.delivery ? `Output: ${job.delivery}\n` : "") + startNote + describeExportJob(job);
  }
  // a status check answers right away; past the deadline the export goes on (its id is in the reply)
  if (!(args.job && args.wait !== true))
    job = await waitJob(job, { every: 1000, timeout: Number.isFinite(args.timeout) && args.timeout > 0 ? args.timeout : 900,
      what: "export job", keepOnTimeout: true, cancelOnExit: !args.job });
  return startNote + describeExportJob(job);
}

/* ── Frames (fablecut_frame) ──
   The tool is the only one that answers with an image, so it returns content
   blocks rather than a string. Text comes FIRST: it carries the coordinates of
   what is in the picture (src, timestamp, dimensions), which is the part an
   agent would otherwise have to guess at, and it keeps the existing
   content[0].text reading in the test harness valid. */

/** {mimeType, data:Buffer} → an MCP image content block. */
function imageBlock(mimeType, buf) {
  return { type: "image", data: buf.toString("base64"), mimeType };
}
/** A data: URL from the compositor → an image content block, or null. */
function imageBlockFromDataUrl(url) {
  const m = /^data:(image\/\w+);base64,(.+)$/.exec(String(url || ""));
  return m ? { type: "image", data: m[2], mimeType: m[1] } : null;
}

/** Raw GET to the editor server → {status, headers, buffer}.
 *  Sends the MCP client header: /api/frame?path= only answers requests that
 *  carry it, so a web page in the user's browser can neither render frames of
 *  arbitrary files nor probe which ones exist. */
function apiBytes(urlPath) {
  return new Promise((resolve, reject) => {
    const req = http.request(API + urlPath, { method: "GET", headers: { "X-FableCut-Client": "mcp", ...session() } }, (r) => {
      const chunks = [];
      r.on("data", (c) => chunks.push(c));
      r.on("end", () => resolve({ status: r.statusCode, headers: r.headers, body: Buffer.concat(chunks) }));
    });
    req.on("error", reject);
    req.setTimeout(60_000, () => req.destroy(new Error("the editor server did not answer")));
    req.end();
  });
}

async function frameTool(args) {
  /* Timeline mode: no path. The compositor lives in the browser, so this rides
     the same job queue the scopes reading uses, with image:true. Text mode
     needs no image at all here — the scopes reading already measures the frame,
     and those numbers describe the composed picture. */
  if (!args.path) {
    if (!(await ensureUIServer())) throw new Error(`the editor server is not running and could not be started on port ${PORT}`);
    const body = { where: args.where || "auto", image: true };
    if (args.time != null) body.time = args.time;
    const r = await apiJSON("POST", "/api/scopes/request", body);
    if (r.status !== 200) throw new Error(r.body?.error || `frame request failed (${r.status})`);
    const job = await waitJob(r.body, { every: 300, timeout: Number.isFinite(args.timeout) && args.timeout > 0 ? args.timeout : 60,
      what: "frame render", timeoutError: "timed out waiting for the editor to render the frame" });
    if (job.status !== "done") throw new Error(`frame render ${job.status}: ${job.error || "no reason given"}`);
    const res = job.result || {};
    const onScreen = (res.clips || []).map((c) => `${c.id} ${c.track} ${c.kind}`).join(", ") || "nothing";
    const head = `Timeline at ${res.time}s (${res.frame?.w}x${res.frame?.h}) — on screen: ${onScreen}`;
    /* Say how the image maps to the frame: it is the whole frame scaled down, and an agent that reads a position
       off the picture (to place a mask or a crop) must divide by these sizes, not by the `width` default. */
    const sized = res.imageSize && res.frame
      ? `
Image ${res.imageSize.w}x${res.imageSize.h} px = the whole ${res.frame.w}x${res.frame.h} frame (1 image px = ${(res.frame.w / res.imageSize.w).toFixed(2)} frame px). ` +
        "Crop and mask numbers are not canvas positions: crop is a percent of each clip's whole source frame, and a mask's x, y (its centre), w, h are fractions of the picture left after the crop, before the clip's scale and x / y — see \"Mask and crop coordinates\" in the docs."
      : "";

    /* Text mode: the scopes reading measured this exact frame already, and its
       numbers are the same family as the source-frame measurements — so a
       text-only agent gets the composed picture described, not nothing. */
    if (args.text) {
      const st = res.stats, st_ = st ? describeScopeLines(st) : null;
      return [{ type: "text", text: head + "\n" + (st_ || "The editor returned no measurements for this frame.") + "\n\n" + TEXT_ONLY_NOTE }];
    }
    const img = imageBlockFromDataUrl(res.image);
    if (!img) throw new Error("the editor rendered the frame but could not encode it as an image (a cross-origin source taints the canvas)");
    return [{ type: "text", text: head + sized }, img];
  }

  /* Source mode: ffmpeg on the server. Looking must not have side effects, so
     the file is read where it is — an absolute path is passed through as
     `path`, and a /media/… or /library/… src is passed through as `src`. The
     server never copies anything into media/ on our behalf. */
  if (!(await ensureUIServer())) throw new Error(`the editor server is not running and could not be started on port ${PORT}`);
  const raw = String(args.path);
  const served = /^\/(media|library)\//i.test(raw);
  // A served src is resolved by the server against its own data dir, which may
  // be somewhere this process cannot see (FABLECUT_DATA_DIR) — so let it decide
  // and report the 404. A filesystem path we can check ourselves is checked.
  if (!served && (!fs.existsSync(raw) || !fs.statSync(raw).isFile()))
    throw new Error("File not found: " + raw);

  const q = new URLSearchParams(served ? { src: raw } : { path: path.resolve(raw) });
  if (args.frames != null) {
    q.set("frames", String(Math.round(Number(args.frames))));
    // No cols → the server picks the squarest layout (6 frames give 3×2).
    if (args.cols != null) q.set("cols", String(Math.round(Number(args.cols))));
    if (args.from != null) q.set("from", String(args.from));
    if (args.to != null) q.set("to", String(args.to));
    q.set("w", String(args.width || 320));
  } else {
    q.set("t", String(Number.isFinite(args.t) ? args.t : 0));
    q.set("w", String(args.width || 768));
  }
  if (args.quality != null) q.set("q", String(args.quality));

  /* text mode asks the server for measurements instead of the picture, in the
     one request — not the picture and then a second call for the numbers. */
  if (args.text) {
    q.set("text", "1");
    const j = await apiJSON("GET", "/api/frame?" + q.toString(), undefined, { "X-FableCut-Client": "mcp" });
    if (j.status !== 200) throw new Error(j.body?.error || `frame description failed (${j.status})`);
    const st = j.body.stats, b = j.body;
    const where = b.frames > 1
      ? `${b.frames} moments across ${b.source || raw}, left→right then top→bottom, at ${(b.times || []).join("s, ")}s.`
      : `Frame at ${(b.times || [])[0] ?? 0}s of ${b.source || raw}.`;
    const body = !st
      ? "The server returned no measurements for this frame (does it have a video track?)."
      : b.frames > 1 ? FrameStats.gridLines(st).join("\n") : FrameStats.frameLines("Frame", st).join("\n");
    return [{ type: "text", text: where + "\n" + body + "\n\n" + TEXT_ONLY_NOTE }];
  }

  const res = await apiBytes("/api/frame?" + q.toString());
  if (res.status !== 200) {
    let msg = `frame request failed (${res.status})`;
    try { msg = JSON.parse(res.body.toString("utf8")).error || msg; } catch { /* not JSON */ }
    throw new Error(msg);
  }
  const times = (res.headers["x-fablecut-frame-times"] || "").split(",").filter(Boolean);
  const type = res.headers["content-type"] || "image/jpeg";
  const source = decodeURI(res.headers["x-fablecut-frame-source"] || "") || raw;
  const head = args.frames != null
    ? `Contact sheet — ${times.length} moments across ${source}, left→right then top→bottom, at ${times.join("s, ")}s.`
    : `Frame at ${times[0] ?? 0}s of ${source}.`;

  if (res.body.length < 4 || res.body[0] !== 0xff || res.body[1] !== 0xd8)
    throw new Error("the server did not return a JPEG");
  return [{ type: "text", text: head }, imageBlock(type, res.body)];
}

/* Appended to every text: true answer, because a measurement is not a caption:
   it says what the picture is made of, never what is in it. */
const { TEXT_ONLY_NOTE, describeScopeLines, describeScopes } = ProjectOps;

async function scopesTool(args) {
  if (!(await ensureUIServer())) throw new Error(`the editor server is not running and could not be started on port ${PORT}`);
  const body = { where: args.where || "auto" };
  if (args.time != null) body.time = args.time;
  if (args.matte != null) body.matte = args.matte;
  if (args.mask != null) body.mask = args.mask;
  const r = await apiJSON("POST", "/api/scopes/request", body);
  if (r.status !== 200) throw new Error(r.body?.error || `scope request failed (${r.status})`);
  const job = await waitJob(r.body, { every: 300, timeout: Number.isFinite(args.timeout) && args.timeout > 0 ? args.timeout : 60,
    what: "scope reading", timeoutError: "timed out waiting for the editor to measure the frame" });
  if (job.status !== "done") throw new Error(`scope reading ${job.status}: ${job.error || "no reason given"}`);
  return describeScopes(job);
}

/* ── Tracking (fablecut_track): runs in the editor, which saves the result ── */
async function trackTool(args) {
  if (typeof args.clip !== "string") throw new Error("fablecut_track needs clip");
  const proj = readProject(), c = proj.clips.find((x) => x.id === args.clip);
  if (!c) throw new Error("no clip " + args.clip);
  if (c.kind !== "video") throw new Error(`${c.id} is a ${c.kind} clip — tracking follows a video clip's picture`);
  for (const k of ["region", "point"]) if (args[k] != null && (typeof args[k] !== "object" || !(k === "region" ? ["x", "y", "w", "h"] : ["x", "y"]).every((q) => Number.isFinite(args[k][q])))) throw new Error(`${k} needs numbers x, y${k === "region" ? ", w, h" : ""} (fractions of the picture)`);
  if (args.apply != null && (typeof args.apply !== "object" || (args.apply.mask == null && args.apply.clip == null))) throw new Error("apply must be {mask: index | name} or {clip: id}");
  if (!(await ensureUIServer())) throw new Error(`the editor server is not running and could not be started on port ${PORT}`);
  const track = {};
  for (const k of ["clip", "region", "point", "size", "at", "direction", "to", "scale", "rotation", "name", "apply", "force"]) if (args[k] != null) track[k] = args[k];
  const r = await apiJSON("POST", "/api/track/request", { where: args.where || "auto", track });
  if (r.status !== 200) throw new Error(r.body?.error || `track request failed (${r.status})`);
  const job = await waitJob(r.body, { every: 500, timeout: Number.isFinite(args.timeout) && args.timeout > 0 ? args.timeout : 300,
    what: "tracking job", timeoutError: "timed out waiting for the editor to track — try a shorter range (to), or a larger timeout" });
  if (job.status !== "done") throw new Error(`tracking ${job.status}: ${job.error || "no reason given"}`);
  return ProjectOps.describeTrack(job.result || {});
}

/* fablecut_lyrics / fablecut_lyrics_apply (JJ, 2026-11-05; docs/decisions/2026-11-05-lyrics-align-agent-tool.md): the
   pasted lyrics lined up with the transcript on this computer (lyrics-track.js), first as a proposal that changes nothing,
   then — only after the streamer agrees on the editor's card — on a new caption track, one undo step. Proposals are kept
   in analysis/lyrics-proposals/ (the newest 50), so the apply can come from another session. */
const LYRICS_DIR = path.join(ANALYSIS_DIR, "lyrics-proposals");
function lyricsMessage(key, v) {
  const View = require("./ui-preferences.js");
  return { "zh-CN": View.t("zh-CN", "own." + key, v), en: View.t("en", "own." + key, v) };
}
function lyricsReply(p, extra = {}) {
  const LT = require("./lyrics-track.js");
  const body = { ...extra, ...LT.forAgent(p) };
  if (!p.ok) body.code = p.code;
  body.message = lyricsMessage(LT.messageKey(p), p.ok ? { k: p.k, n: p.n, m: p.m } : {});
  if (p.code === "OK") body.next = "Show the user the message and a few lines (never the whole lyrics), then call fablecut_lyrics_apply {proposalId} — the editor asks the user on a card before anything is placed.";
  return JSON.stringify(body, null, 1);
}
async function lyricsTool(args) {
  const LT = require("./lyrics-track.js"), LA = require("./lyrics-align.js");
  if (typeof args.lyrics !== "string") throw new Error("lyrics must be the pasted lyrics, one line per line of the song");
  if (!LA.lines(args.lyrics).length) return lyricsReply({ ok: false, code: "NO_LYRICS" });
  let r;
  try { r = await speechWords({ clipIds: args.clipIds, language: args.language, timeout: args.timeout }, false); }
  catch (e) {
    // the transcription itself could not run (the engine, the job, the editor server): say so in the streamer's words
    if (/transcri|editor server is not running|EDITOR_NOT_READY|HEADLESS_DISABLED/i.test(String(e.message || e))) return lyricsReply({ ok: false, code: "ASR_UNAVAILABLE" }, { detail: String(e.message || e) });
    throw e;
  }
  const lo = Number.isFinite(args.from) ? args.from : -Infinity, hi = Number.isFinite(args.to) ? args.to : Infinity;
  const words = r.words.filter((w) => (w.s + w.e) / 2 >= lo && (w.s + w.e) / 2 <= hi);
  const p = LT.propose(words, args.lyrics);
  if (!p.ok || p.code !== "OK") return lyricsReply(p);
  const clipIds = [...new Set(words.map((w) => w.clip).filter(Boolean))];
  const id = "ly_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const stored = { ...p, id, created: new Date().toISOString(), clipIds, sig: LT.scopeSig(r.doc, clipIds), revision: r.readRev };
  fs.mkdirSync(LYRICS_DIR, { recursive: true });
  fs.writeFileSync(path.join(LYRICS_DIR, id + ".json"), JSON.stringify(stored));
  // keep the newest 50
  const old = fs.readdirSync(LYRICS_DIR).filter((f) => /^ly_[a-z0-9]+\.json$/.test(f)).sort().slice(0, -50);
  for (const f of old) try { fs.unlinkSync(path.join(LYRICS_DIR, f)); } catch {}
  return lyricsReply(p, { proposalId: id });
}
async function lyricsApplyTool(args) {
  const LT = require("./lyrics-track.js");
  const id = String(args.proposalId || "");
  if (!/^ly_[a-z0-9]{6,40}$/.test(id)) throw new Error("proposalId must be the id fablecut_lyrics returned");
  let p;
  try { p = JSON.parse(fs.readFileSync(path.join(LYRICS_DIR, id + ".json"), "utf8")); }
  catch { throw new Error("no such proposal " + id + " — run fablecut_lyrics again"); }
  if (p.code !== "OK") return lyricsReply(p, { proposalId: id, applied: false });
  if (LT.scopeSig(readProject(), p.clipIds) !== p.sig) throw new Error("the clips with the singing changed since this proposal (moved, trimmed or cut) — nothing placed; run fablecut_lyrics again");
  if (!(await ensureUIServer())) throw new Error(`the editor server is not running and could not be started on port ${PORT}`);
  const r0 = await apiJSON("POST", "/api/lyrics/request", { proposal: p });
  if (r0.status !== 200) throw new Error(r0.body?.error || `lyrics request failed (${r0.status})`);
  let job = r0.body;
  const deadline = Date.now() + 1000 * (Number.isFinite(args.timeout) && args.timeout > 0 ? args.timeout : 600);
  while (job.status === "pending" || job.status === "running") {
    if (Date.now() > deadline) {
      await apiJSON("POST", "/api/export/job/cancel?id=" + encodeURIComponent(job.id));
      throw new Error("the user did not answer the lyrics card in time — nothing placed");
    }
    await sleep(500);
    const q = await apiJSON("GET", "/api/export/job?id=" + encodeURIComponent(job.id));
    if (q.status !== 200) throw new Error(q.body?.error || "lost track of the lyrics card");
    job = q.body;
  }
  if (job.status !== "done") throw new Error(`lyrics card ${job.status}: ${job.error || "no reason given"}`);
  const res = job.result || {};
  if (res.revision) lastReadRevision = res.revision;
  return JSON.stringify({ proposalId: id, applied: res.applied === true, track: res.track || null, placed: res.placed || 0, grey: res.grey || 0,
    ...(res.reason ? { reason: res.reason } : {}),
    message: res.applied === true ? lyricsMessage("lt-done") : lyricsMessage("lt-not-placed") }, null, 1);
}

/* ── Tool implementations ── */
/** callTool(name, args, {signal}?) — signal (an AbortSignal) is the caller giving up on the call: a job it started on
 *  the editor's queue is cancelled then (see waitJob). The MCP stdio loop passes one per tools/call; a host that
 *  requires this module (the Cindy plugin's worker) may pass its own. A number in its place is the old `attempt`. */
async function callTool(name, args, opts = {}) {
  const o = typeof opts === "number" ? { attempt: opts } : opts || {};
  if (o.signal && callSignal() !== o.signal) return callScope.run({ signal: o.signal }, () => runTool(name, args, o.attempt || 0));
  return runTool(name, args, o.attempt || 0);
}
async function runTool(name, args, attempt = 0) {
  switch (name) {
    case "fablecut_track":
      return trackTool(args);
    case "fablecut_export":
      return exportTool(args);
    case "fablecut_scopes":
      return scopesTool(args);
    case "fablecut_frame":
      return frameTool(args);
    case "fablecut_silence":
      return silenceTool(args);
    case "fablecut_beats":
      return beatsTool(args);
    case "fablecut_reframe":
      return reframeTool(args);
    case "fablecut_highlights":
      return highlightsTool(args);
    case "fablecut_songs":
      return songsTool(args);
    case "fablecut_audio_track":
      return audioTrackTool(args);
    case "fablecut_transcribe":
      return transcribeTool(args);
    case "fablecut_lyrics":
      return lyricsTool(args);
    case "fablecut_lyrics_apply":
      return lyricsApplyTool(args);
    case "fablecut_captions":
      return captionsTool(args);
    case "fablecut_denoise":
      return denoiseTool(args);
    case "fablecut_repair_media":
      return repairTool(args);
    case "fablecut_proxy":
      return proxyTool(args);
    case "fablecut_projects":
      return projectsTool(args);
    case "fablecut_versions":
      return versionsTool(args);
    case "fablecut_status": {
      const up = await ensureUIServer();
      backfillDurations({ wait: 0 });   // status only reports: the lengths are written when they are read
      const proj = readProject();
      const dur = proj.clips.reduce((m, c) => Math.max(m, c.start + c.duration), 0);
      const files = fs.existsSync(MEDIA_DIR)
        ? fs.readdirSync(MEDIA_DIR).filter((f) => fs.statSync(path.join(MEDIA_DIR, f)).isFile())
        : [];
      const libSummary = ["sfx", "elements", "svg", "fonts"].map((d) => {
        const dir = path.join(LIBRARY_DIR, d);
        const n = fs.existsSync(dir) ? fs.readdirSync(dir).length : 0;
        return `${d}: ${n}`;
      }).join(", ");
      const cap = (arr, n) => arr.length > n ? arr.slice(0, n).concat(`… +${arr.length - n} more`) : arr;
      let encLine = "";
      try {
        const cfg = loadEncodeProfiles();
        const describe = (id) => {
          const p = cfg.profiles[id];
          return p ? `${id} (${p.label}) — ${profileSummary(p)}` : null;
        };
        const pinned = proj.encodeProfile;
        if (pinned && !cfg.profiles[pinned]) {
          /* a project pinning a since-deleted profile must not read as "nothing
             configured" — the bad id and the fallback are two separate facts */
          encLine = `Export profile: project encodeProfile "${pinned}" is NOT DEFINED in encoding-profiles.json` +
            ` — falling back to default ${describe(cfg.default) || `"${cfg.default}"`}`;
        } else {
          encLine = `Export profile: ${describe(pinned || cfg.default) || `server default "${cfg.default}"`}`;
        }
      } catch { encLine = "Export profile: (encoding-profiles.json unavailable)"; }
      if (proj.delivery) {
        try {
          const { spec } = Delivery.normalize(proj.delivery, { presets: savedDeliveryPresets() });
          encLine = `Export: project.delivery — ${spec.preset} · ${Delivery.describe(spec)} (fablecut_export uses it unless you pass profile or preset)`;
        } catch { }
      }
      if (Array.isArray(proj.outputs) && proj.outputs.length) {
        const on = proj.outputs.filter((o) => o.on !== false);
        encLine += `\nBatch outputs (fablecut_export {outputs:true}): ${on.length} of ${proj.outputs.length} checked — ` +
          on.map((o) => Delivery.projectFilename(o, proj)).join(", ");
      }
      return [
        `Editor server: ${up ? "RUNNING — open " + BASE + " in a browser to watch edits live" : "FAILED TO START (check node / port " + PORT + ")"}`,
        `Project: "${proj.name}" — ${proj.width}x${proj.height} @ ${proj.fps}fps, ${proj.clips.length} clip(s), ${dur.toFixed(2)}s, revision ${proj.revision}`,
        ...(SeqLib.entries(proj).length > 1 ? [`Sequences (${SeqLib.entries(proj).length}; the numbers above are the open one's): ${SeqLib.list(proj).map(SeqLib.describe).join(" · ")}`] : []),
        encLine,
        `Registered media: ${cap(proj.media.map((m) => `${m.id} (${m.kind}, ${m.name}${m.duration ? ", " + m.duration + "s" : ""})`), 25).join("; ") || "none"}`,
        ...(() => {
          const off = proj.media.filter((m) => /^\/(media|library)\//.test(m.src || "") && !mediaFile(m.src));
          return off.length ? [`OFFLINE media (file missing — find it and relinkMedia): ${cap(off.map((m) => `${m.id} ${m.src}`), 25).join("; ")}`] : [];
        })(),
        ...(() => {
          // a project saved before mono stems were centred; the streamer hasn't answered the editor's question yet
          const left = proj.monoPanReviewed ? [] : EditOps.monoLeftStems(proj);
          return left.length ? [`WARNING — mono audio in the left ear only: ${cap(left.map((c) => c.id), 25).join(", ")} (a mono file's stem at pan −1; it exports with sound on one side). Only if the user asks: updateClip set:{props:{pan:0}} on each, then setProject {monoPanReviewed:true}.`] : [];
        })(),
        `Files in media/: ${cap(files, 25).join(", ") || "none"}`,
        `Library assets (./library): ${libSummary}`,
        ...(() => {
          try {
            const pj = createProjects({ dataDir: DATA_DIR, projectFile: PROJECT_FILE, libraryDir: LIBRARY_DIR });
            if (!pj.peekActive()) return [];
            const { projects: all } = pj.list();
            const nv = createHistory({ projects: pj }).list(pj.peekActive()).versions.length;
            return [`Projects: ${all.length} (fablecut_projects lists, opens and creates them; this one is ${pj.peekActive()}, with ${nv} saved version(s): fablecut_versions)`];
          } catch { return []; }
        })(),
        `Project file: ${PROJECT_FILE}`,
        `Tips: fablecut_docs (use \`section\`) for the schema · fablecut_get_project {compact:true} to see the timeline · fablecut_patch_project for edits (cheapest) · fablecut_encode_profiles for export presets.`,
      ].join("\n");
    }
    case "fablecut_docs": {
      const md = fs.readFileSync(path.join(ROOT, "CLAUDE.md"), "utf8");
      if (!args.section) return md;
      const q = args.section.toLowerCase();
      const parts = md.split(/^(?=## )/m);
      const hits = parts.filter((s) => s.startsWith("## ") && s.slice(0, s.indexOf("\n")).toLowerCase().includes(q));
      return hits.length ? hits.join("\n") :
        `No '## ' section matches "${args.section}". Headings: ` +
        parts.filter((s) => s.startsWith("## ")).map((s) => s.slice(3, s.indexOf("\n"))).join(" · ");
    }
    case "fablecut_get_project": {
      const filled = await backfillDurations();
      const doc = readProject();
      // read just now, maybe not saved yet (an open editor saves them a moment later): shown already
      if (Array.isArray(filled)) MediaLib.applyBackfill(doc, filled);
      lastReadRevision = doc.revision || 0;
      if (!args.compact) return JSON.stringify(doc);
      return ProjectOps.compactView(doc, {
        offline: (m) => /^\/(media|library)\//.test(m.src || "") && !mediaFile(m.src),
        proxy: (m) => { const f = mediaFile(m.src); const p = f && findProxies(PROXIES_DIR, f)[0]; return p ? p.height : null; },
      });
    }
    case "fablecut_patch_project": {
      if (!Array.isArray(args.ops) || !args.ops.length) throw new Error("`ops` must be a non-empty array");
      const base = args.baseRevision;
      if (base != null && !Number.isInteger(base))
        throw new Error("`baseRevision` must be an integer revision (from fablecut_get_project, fablecut_status or the last patch result)");
      // ops get filled in as they apply (auto ids …); a retry must start from the originals
      const ops = structuredClone(args.ops);
      const filled = base == null ? await backfillDurations() : null;   // with a baseRevision, a write here would itself be the conflict
      const proj = readProject();
      // the ops see the lengths just read, and this patch's write carries them
      if (Array.isArray(filled)) MediaLib.applyBackfill(proj, filled);
      const readRev = proj.revision || 0;
      const conflict = (rev) => new Error(
        `CONFLICT — not saved. project.json is at revision ${rev}, but this patch was based on ` +
        `revision ${base ?? readRev}: the project changed in between (the user probably edited in the UI). ` +
        `Re-read the clips you touch (fablecut_get_project {compact:true}), then retry with baseRevision:${rev} — ` +
        `or omit baseRevision to apply on top of the latest anyway.`);
      if (base != null && readRev !== base) throw conflict(readRev);
      const { notes, toSave } = ProjectOps.applyPatch(proj, ops, {
        savedItems,
        audioChannels: (m) => { const f = mediaFile(m.src); return f ? probeChannels(f) || 0 : null; },   // stems carry the exported sound: track 0
        checkProfile: resolveProfile,
        deliveryPresets: savedDeliveryPresets(),
        mediaInfo: (src) => { const f = mediaFile(src); return f ? probeFile(f) : null; },
      });
      // a version of the project as it was, kept before the last check so the write follows that check at once
      const verWarn = versionBeforeAgent(false);
      // Someone else saved while the ops ran: writing now would drop their change.
      // Without a baseRevision the ops just re-apply on the newer document.
      const diskRev = readProject().revision || 0;   // a failed read stops it: never write over what we can't see
      if (diskRev !== readRev) {
        if (base == null && attempt < 3) return runTool(name, args, attempt + 1);
        throw conflict(diskRev);
      }
      proj.revision = readRev + 1;
      writeProject(proj);
      lastReadRevision = proj.revision;
      for (const [kind, item] of toSave) writeSaved(kind, item.id, item);
      return `Patched (revision ${proj.revision}): ${notes.join(" ")}. Now ${proj.clips.length} clip(s), ${proj.media.length} media. UI hot-reloaded.${verWarn}`;
    }
    case "fablecut_set_project": {
      const doc = args.project;
      if (!doc || typeof doc !== "object") throw new Error("`project` must be an object");
      if (!Array.isArray(doc.clips) || !Array.isArray(doc.media))
        throw new Error("project must contain `clips` and `media` arrays");
      ProjectOps.checkProject(doc);
      const verWarn = versionBeforeAgent(true);   // before the conflict check, so the write follows it at once
      let cur = { revision: 0 };
      try { cur = readProject(); } catch {}
      const curRev = cur.revision || 0;
      // strict check when this session read via the tool; otherwise fall back to
      // the revision baked into the submitted doc (e.g. it was read as a file)
      const stale = lastReadRevision !== null
        ? curRev !== lastReadRevision
        : (doc.revision || 0) < curRev;
      if (stale && !args.force) {
        throw new Error(
          `CONFLICT — not saved. project.json is at revision ${curRev}, but this edit was based on ` +
          `revision ${lastReadRevision ?? (doc.revision || 0)}: the project changed in between ` +
          `(the user probably tweaked something in the editor UI). ` +
          `Call fablecut_get_project, re-apply your edit on top of the latest document, then save again. ` +
          `Pass force:true only if the user explicitly wants those changes discarded.`);
      }
      doc.revision = Math.max(curRev + 1, (doc.revision || 0));
      // Agents often omit top-level flags they don't know about. Keep panSchema
      // once established so a rewrite that drops pan:0 cannot re-trigger L/R migration.
      if (!(doc.panSchema >= 1) && (cur.panSchema >= 1)) doc.panSchema = 1;
      writeProject(doc);
      lastReadRevision = doc.revision;
      return `Saved (revision ${doc.revision}). ${doc.clips.length} clip(s). The editor UI (if open at ${BASE}) has hot-reloaded.${verWarn}`;
    }
    case "fablecut_normalize_audio": {
      const ids = Array.isArray(args.clipIds) ? args.clipIds.map(String) : [];
      if (!ids.length) throw new Error("`clipIds` must list at least one clip");
      const mode = args.mode === "peak" ? "peak" : "lufs";
      const target = Number.isFinite(args.target) ? args.target : mode === "peak" ? -1 : -14;
      if (mode === "lufs" && (target < -60 || target > 0)) throw new Error("target LUFS must be -60…0");
      if (mode === "peak" && (target < -60 || target > 0)) throw new Error("target peak must be -60…0 dBFS");
      const L = require("./loudness.js");
      const groups = normalizeGroups(readProject(), ids);
      const measured = [];
      for (const g of groups) measured.push({ ids: g.map((c) => c.id), m: await measureClipGroup(readProject(), g) });
      // Re-read after the (slow) measuring so concurrent UI edits are kept.
      const proj = readProject();
      const locked = new Set(Array.isArray(proj.lockedTracks) ? proj.lockedTracks : []);
      const report = [];
      let changed = 0;
      for (const { ids: gIds, m } of measured) {
        const clips = gIds.map((id) => proj.clips.find((x) => x.id === id)).filter(Boolean);
        const lockedBy = clips.find((c) => c.locked === true || locked.has(c.track));
        if (lockedBy && args.force !== true) {
          report.push(`${gIds.join("+")}: skipped — ${lockedBy.id} is locked (pass force:true if the user asked)`);
          continue;
        }
        const db = m && L.normalizeGainDb(m, { mode, value: target });
        if (db == null) { report.push(`${gIds.join("+")}: silent — left alone`); continue; }
        const gain = Math.round(Math.min(24, Math.max(-60, db)) * 10) / 10;
        for (const c of clips) { c.props = c.props || {}; c.props.gain = gain; }
        changed++;
        const level = mode === "peak" ? `${m.peakDb.toFixed(1)} dBFS peak` : `${m.lufs.toFixed(1)} LUFS`;
        report.push(`${gIds.join("+")}: ${level} → gain ${gain > 0 ? "+" : ""}${gain} dB`);
      }
      if (changed) {
        proj.revision = (proj.revision || 0) + 1;
        writeProject(proj);
        lastReadRevision = proj.revision;
      }
      return `Normalize to ${target} ${mode === "peak" ? "dBFS peak" : "LUFS"}${changed ? ` (revision ${proj.revision})` : " — nothing changed"}:\n` + report.join("\n");
    }
    case "fablecut_auto_duck": {
      const ids = Array.isArray(args.clipIds) ? args.clipIds.map(String) : [];
      if (!ids.length) throw new Error("`clipIds` must list the music clip(s) to duck");
      const amount = args.amount == null ? -12 : +args.amount;
      if (!Number.isFinite(amount) || amount < -40 || amount > 0) throw new Error("amount must be -40…0 dB");
      const threshold = args.threshold == null ? -40 : +args.threshold;
      const attack = args.attack == null ? 0.3 : Math.max(0, +args.attack || 0);
      const release = args.release == null ? 0.6 : Math.max(0, +args.release || 0);
      const D = require("./ducking.js");
      const doc = readProject();
      const musicGroups = [];
      const seen = new Set();
      for (const id of ids) {
        const c = doc.clips.find((x) => x.id === id);
        if (!c) throw new Error("no clip " + id);
        if (c.kind !== "audio" && c.kind !== "video") throw new Error(`clip ${id} is ${c.kind} — no audio to duck`);
        const key = c.linkGroup || c.id;
        if (seen.has(key)) continue;
        seen.add(key);
        const members = c.linkGroup ? doc.clips.filter((x) => x.linkGroup === c.linkGroup) : [c];
        const stems = members.filter((x) => x.kind === "audio");
        if (stems.length) musicGroups.push(stems.map((x) => x.id));
      }
      if (!musicGroups.length) throw new Error("none of those clips carry audio on an A-track");
      const musicIds = new Set(musicGroups.flat());
      const musicClips = doc.clips.filter((x) => musicIds.has(x.id));
      const own = new Set(musicClips.map((x) => x.track));
      const lanes = Array.isArray(args.under) && args.under.length ? args.under.map(String)
        : [...new Set(doc.clips.filter((x) => x.kind === "audio").map((x) => x.track))].filter((t) => !own.has(t));
      const t0 = Math.min(...musicClips.map((x) => x.start));
      const t1 = Math.max(...musicClips.map((x) => x.start + x.duration));
      const disabled = new Set(Array.isArray(doc.disabledTracks) ? doc.disabledTracks : []);
      const voices = doc.clips.filter((x) => x.kind === "audio" && lanes.includes(x.track) && !musicIds.has(x.id) &&
        !disabled.has(x.track) && x.disabled !== true && x.start + x.duration > t0 && x.start < t1);
      const regions = amount && voices.length ? await voiceRegions(doc, voices, threshold) : [];
      if (amount && !voices.length) throw new Error(`no audio clips on ${lanes.join(", ") || "other tracks"} under the music — nothing to duck for`);
      // Re-read after the (slow) analysis so concurrent UI edits are kept.
      const proj = readProject();
      const locked = new Set(Array.isArray(proj.lockedTracks) ? proj.lockedTracks : []);
      const report = [];
      let changed = 0;
      for (const g of musicGroups) {
        const clips = g.map((id) => proj.clips.find((x) => x.id === id)).filter(Boolean);
        if (!clips.length) continue;
        const lockedBy = clips.find((c) => c.locked === true || locked.has(c.track));
        if (lockedBy && args.force !== true) {
          report.push(`${g.join("+")}: skipped — ${lockedBy.id} is locked (pass force:true if the user asked)`);
          continue;
        }
        const keys = amount ? D.duckKeyframes(regions, clips[0], { amount, attack, release }) : [];
        for (const c of clips) {
          if (keys.length) { c.keyframes = c.keyframes || {}; c.keyframes.duck = keys.map((k) => ({ ...k })); }
          else if (c.keyframes && c.keyframes.duck) {
            delete c.keyframes.duck;
            if (!Object.keys(c.keyframes).length) delete c.keyframes;
          }
        }
        changed++;
        const dips = keys.filter((k, i) => k.v === amount && (i === 0 || keys[i - 1].v !== amount)).length;
        report.push(`${g.join("+")}: ${amount ? `${dips} dip${dips === 1 ? "" : "s"} of ${amount} dB` : "ducking removed"}`);
      }
      if (changed) {
        proj.revision = (proj.revision || 0) + 1;
        writeProject(proj);
        lastReadRevision = proj.revision;
      }
      const head = amount ? `Auto-duck under ${lanes.join(", ")} — ${regions.length} voice span${regions.length === 1 ? "" : "s"}` : "Ducking cleared";
      return `${head}${changed ? ` (revision ${proj.revision})` : " — nothing changed"}:\n` + report.join("\n");
    }
    case "fablecut_analyze_reference": {
      let src = args.path || "";
      let file = /^\/media\//i.test(src)
        ? path.join(MEDIA_DIR, decodeURIComponent(src.replace(/^\/media\//i, "")))
        : src;
      if (!file || !fs.existsSync(file) || !fs.statSync(file).isFile())
        throw new Error("File not found: " + src);
      // keep the reference inside media/ so the user can preview it in the UI
      if (path.dirname(path.resolve(file)).toLowerCase() !== MEDIA_DIR.toLowerCase()) {
        if (!fs.existsSync(MEDIA_DIR)) fs.mkdirSync(MEDIA_DIR);
        const ext = path.extname(file);
        const stem = Delivery.fileSafeName(path.basename(file, ext), "media");   // Chinese kept (Deja)
        let target = path.join(MEDIA_DIR, stem + ext);
        let i = 1;
        while (fs.existsSync(target)) target = path.join(MEDIA_DIR, `${stem}_${i++}${ext}`);
        fs.copyFileSync(file, target);
        file = target;
      }
      const { analyze } = require("./analyze.js");
      const bp = await analyze(file, {
        threshold: args.threshold,
        music: args.registerMusic !== false,
        musicDir: MEDIA_DIR,
        srcUrl: "/media/" + encodeURIComponent(path.basename(file)),
      });
      let musicNote = "Reference has no audio track — no music extracted.";
      if (bp.music) {
        bp.music.src = "/media/" + encodeURIComponent(bp.music.name);
        // merge-safe append, same protocol as fablecut_import_media
        const entry = {
          id: "m_" + uid(), name: bp.music.name, kind: "audio",
          src: bp.music.src, duration: bp.duration,
        };
        const proj = readProject();
        const wasCurrent = lastReadRevision === (proj.revision || 0);
        proj.media.push(entry);
        proj.revision = (proj.revision || 0) + 1;
        writeProject(proj);
        if (wasCurrent) lastReadRevision = proj.revision;
        bp.music.mediaId = entry.id;
        musicNote = `Music extracted and registered as media "${entry.id}" — place it on A1 (in:0, duration:${bp.duration}).`;
      }
      const dir = ANALYSIS_DIR;
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, path.basename(file, path.extname(file)) + ".json"),
        JSON.stringify(bp, null, 2));
      return JSON.stringify(bp, null, 2) + "\n\n" + [
        musicNote,
        `REMAKE RECIPE: 1) set project width/height/fps to ${bp.width}x${bp.height} @ ${bp.fps} — 2) write beats[] into project markers — 3) extracted music on A1 — 4) one clip per shots[] entry at the same start/duration on V1 (hard cuts; footage energy should track each shot's energy value) — 5) biggest moment on drop (${bp.drop}s)${bp.bpm ? ` — tempo ${bp.bpm} BPM` : ""}. Full recipe: fablecut_docs → "Remake a reference video".`,
      ].join("\n");
    }
    case "fablecut_danmaku": {
      const doc0 = readProject();
      const listText = (doc) => {
        const list = Danmaku.normalize(doc.danmaku, (doc.media || []).map((m) => m.id));
        return list.length ? list.map((e) => `${e.mediaId} "${e.name}" ${e.format} ${e.count} danmaku`).join("\n") : "No danmaku in this project.";
      };
      if (!args.path && args.remove !== true) return listText(doc0);
      const av = (doc0.media || []).filter((m) => m.kind === "video" || m.kind === "audio");
      const mediaId = args.mediaId != null ? String(args.mediaId) : av.length === 1 ? av[0].id : null;
      if (!mediaId) throw new Error("Say which recording: pass mediaId (" + (av.map((m) => m.id).join(", ") || "no video or audio in the project") + ")");
      if (!(doc0.media || []).some((m) => m.id === mediaId)) throw new Error("no media " + mediaId);
      let entry = null;
      if (args.remove !== true) {
        let parsed;
        try { parsed = await readDanmakuFile(path.resolve(String(args.path))); }
        catch (e) { throw new Error((e.code ? e.code + ": " : "") + e.message); }
        entry = Danmaku.entry({ id: "dm_" + Math.random().toString(36).slice(2, 9), mediaId, name: path.basename(String(args.path)), parsed });
      }
      // re-read after the (possibly long) read so concurrent UI edits are kept
      const proj = readProject();
      if (!(proj.media || []).some((m) => m.id === mediaId)) throw new Error("no media " + mediaId);
      const kept = (Array.isArray(proj.danmaku) ? proj.danmaku : []).filter((e) => e && e.mediaId !== mediaId);
      const next = entry ? kept.concat([entry]) : kept;
      if (next.length) proj.danmaku = next; else delete proj.danmaku;
      proj.revision = (proj.revision || 0) + 1;
      writeProject(proj);
      lastReadRevision = proj.revision;
      if (!entry) return `Danmaku removed from ${mediaId} (revision ${proj.revision}).`;
      const sk = Object.entries(entry.skipped).filter(([, n]) => n).map(([k, n]) => `${n} ${k}`).join(", ");
      return `Imported ${entry.count} danmaku (${entry.format}) for ${mediaId} (revision ${proj.revision}).` + (sk ? ` Not kept: ${sk}.` : "");
    }
    case "fablecut_import_media": {
      const src = args.path;
      if (!src) throw new Error("path is required");
      let target, kind;
      if (/^https?:\/\//i.test(src)) {
        if (!/^https:\/\//i.test(src)) throw new Error("URL must be https");
        const got = await downloadImportUrl(src, MEDIA_DIR);
        target = got.target;
        kind = kindFromName(got.name);
        await maybeFaststart(target);
      } else {
        if (!fs.existsSync(src) || !fs.statSync(src).isFile())
          throw new Error("File not found: " + src);
        const ext = path.extname(src).toLowerCase();
        kind = KIND_BY_EXT[ext];
        if (!kind) throw new Error(`Unsupported extension ${ext}`);
        if (!fs.existsSync(MEDIA_DIR)) fs.mkdirSync(MEDIA_DIR);
        let base = Delivery.mediaFileName(path.basename(src));   // Chinese kept (Deja)
        target = path.join(MEDIA_DIR, base);
        let i = 1;
        const stem = path.basename(base, ext);
        while (fs.existsSync(target)) target = path.join(MEDIA_DIR, `${stem}_${i++}${ext}`);
        // link:true — a hard link when the file is on the same drive, so a several-GB recording is in media/
        // at once with no second copy of disk space (another drive, or no links: copied). Default: a copy.
        if (args.link === true) { try { fs.linkSync(src, target); } catch { fs.copyFileSync(src, target); } }
        else fs.copyFileSync(src, target);
      }
      if (!kind) throw new Error("Unsupported media type");
      const prepared = await prepareMedia(target, { allowTranscode: args.allowTranscode, acceptReadable: args.acceptReadable, fixGaps: args.fixGaps });
      const originalName = path.basename(target);
      if (prepared.originalSrc) target = path.join(MEDIA_DIR, decodeURIComponent(prepared.src.slice(7)));
      const entry = {
        id: "m_" + uid(),
        name: originalName,
        kind,
        src: "/media/" + encodeURIComponent(path.basename(target)),
        // the length comes from probeFile below (media-lib parseProbe), the same reading the editor uses: an MKV's start
        // offset is not counted (QQ, #126: format=duration alone stored 3620 s for 20 s)
      };
      if (prepared.originalSrc) Object.assign(entry, {originalSrc: prepared.originalSrc, preparation: prepared.preparation});
      // where the recording broke, for the timeline's marks (prepare-media.js; faint: small drop, labelled: converted)
      const gaps = MediaLib.normalizeGaps(prepared.gaps);
      if (gaps.length) entry.gaps = gaps;
      const probed = await probeFile(target);
      Object.assign(entry, infoForEntry(probed, entry));
      const proj = readProject();
      // import only appends a media entry (never touches clips), so it merges
      // into the live document; keep lastReadRevision in step only if it
      // already was — otherwise a later set_project must still re-read
      const wasCurrent = lastReadRevision === (proj.revision || 0);
      proj.media.push(entry);
      proj.revision = (proj.revision || 0) + 1;
      writeProject(proj);
      if (wasCurrent) lastReadRevision = proj.revision;
      return `Imported → ${JSON.stringify(entry)}\n` +
        importNote(entry, probed) + audioTracksNote(entry);
    }
    case "fablecut_encode_profiles": {
      if (args.preset) {
        const saved = savedDeliveryPresets();
        const id = String(args.preset);
        if (!Delivery.PRESETS[id] && !saved[id]) throw new Error(`no delivery preset "${id}" — built-in: ${Delivery.PRESET_IDS.join(", ")}${Object.keys(saved).length ? "; saved: " + Object.keys(saved).join(", ") : ""}`);
        const { spec } = Delivery.normalize(id, { presets: saved });
        const p = Delivery.PRESETS[id] || saved[id];
        return JSON.stringify({ preset: id, label: p.label, note: p.note || "", summary: Delivery.describe(spec), spec }, null, 2);
      }
      if (args.profile) {
        const p = resolveProfile(String(args.profile));
        return JSON.stringify({
          default: loadEncodeProfiles().default,
          profile: args.profile,
          label: p.label,
          description: p.description,
          jpegQuality: p.jpegQuality,
          extension: p.extension,
          color: p.color,
          args: p.args,
        }, null, 2);
      }
      const saved = savedDeliveryPresets();
      let encoders = null;
      try { const r = await apiJSON("GET", "/api/export/presets"); if (r.status === 200) encoders = r.body.encoders; } catch {}
      const presets = {};
      for (const id of [...Delivery.PRESET_IDS, ...Object.keys(saved)]) {
        const p = Delivery.PRESETS[id] || saved[id];
        presets[id] = { label: p.label, ...(saved[id] ? { saved: true } : {}), summary: Delivery.describe(Delivery.normalize(id, { presets: saved }).spec) };
      }
      // the encoding-profile fields stay at the top level, as they always were
      return JSON.stringify({
        ...listProfilesPublic(!!args.detail),
        deliveryPresets: presets,
        encoders: encoders || "(start the editor server to list them)",
      }, null, 2);
    }
    default:
      throw new Error("Unknown tool: " + name);
  }
}

/* ── MCP stdio plumbing (newline-delimited JSON-RPC 2.0) ── */
function send(msg) { process.stdout.write(JSON.stringify(msg) + "\n"); }

async function handle(msg) {
  const { id, method, params } = msg;
  const isRequest = id !== undefined && id !== null;
  try {
    if (method === "initialize") {
      return send({
        jsonrpc: "2.0", id,
        result: {
          protocolVersion: negotiateProtocolVersion(params?.protocolVersion),
          capabilities: { tools: {} },
          serverInfo: { name: "fablecut", version: "1.18.0" },
        },
      });
    }
    if (method === "tools/list") return send({ jsonrpc: "2.0", id, result: { tools: TOOLS } });
    if (method === "tools/call") {
      pending++;
      const ac = new AbortController();
      if (isRequest) inFlight.set(id, ac);
      try {
        const out = await callTool(params.name, params.arguments || {}, { signal: ac.signal });
        /* A tool may answer with ready-made content blocks (fablecut_frame
           returns an image); everything else answers with a string. */
        const content = Array.isArray(out) ? out : [{ type: "text", text: String(out) }];
        send({ jsonrpc: "2.0", id, result: { content } });
      } catch (e) {
        send({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text: "Error: " + e.message }], isError: true } });
      } finally {
        if (isRequest && inFlight.get(id) === ac) inFlight.delete(id);
        if (--pending === 0 && stdinClosed) process.exit(0);
      }
      return;
    }
    // the client gave up on a call: a job it started on the editor's queue is cancelled (waitJob)
    if (method === "notifications/cancelled") { inFlight.get(params?.requestId)?.abort(); return; }
    if (method === "ping") return send({ jsonrpc: "2.0", id, result: {} });
    if (!isRequest) return; // ignore other notifications (e.g. notifications/initialized)
    send({ jsonrpc: "2.0", id, error: { code: -32601, message: "Method not found: " + method } });
  } catch (e) {
    if (isRequest) send({ jsonrpc: "2.0", id, error: { code: -32603, message: String(e) } });
  }
}

let buf = "", pending = 0, stdinClosed = false;
const inFlight = new Map();   // tools/call request id → its AbortController
/* Run as a program (`node mcp-server.js`, the Claude Code / Desktop registration): MCP over stdio.
   Required by another shell (the Cindy plugin's Node worker) it only hands over the same tools —
   that shell speaks its own protocol on stdio and calls them in-process. */
if (require.main === module) {
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => {
    buf += chunk;
    let nl;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      try { handle(JSON.parse(line)); } catch { /* skip malformed line */ }
    }
  });
  // stdin ending lets the calls in flight finish (a piped one-shot `echo … | node mcp-server.js` waits for its answer)
  process.stdin.on("end", () => { stdinClosed = true; if (pending === 0) process.exit(0); });
  /* Stopped with calls in flight (the client's shutdown sends SIGTERM after closing stdin): nobody will read their
     answers, so they are given up — each cancels the job it started on the editor's queue — and the process ends.
     Where the process is killed outright (Windows), the queue's own limit frees it (export-jobs.js TAB_SILENT_MS). */
  const stop = () => {
    stdinClosed = true;
    for (const ac of inFlight.values()) ac.abort();
    if (pending === 0) process.exit(0);
    setTimeout(() => process.exit(0), 5000).unref();   // the cancels have had their chance
  };
  process.stdout.on("error", () => {});   // EPIPE: the reader is gone; the answer has nowhere to go
  for (const sig of ["SIGTERM", "SIGINT", "SIGHUP"]) process.on(sig, stop);
}
module.exports = { TOOLS, callTool, ensureUIServer };
