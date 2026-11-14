/* Agent-requested exports (POST /api/export/request, MCP fablecut_export).

   The compositor lives in the browser, so an export job is handed to an
   editor tab: an open one gets it over SSE, otherwise a headless Chrome /
   Edge is started on `/?exportJob=<id>` and closed when the job ends. The tab
   claims the job, renders it with the normal Fast export, and reports
   progress and the finished file back here. A job is
     pending → running → done | failed | cancelled
   and stays readable for an hour after it ends. Zero dependencies. */
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn, spawnSync } = require("child_process");

const PENDING_TAB_MS = 20_000;       // an open tab answers SSE within a beat
const PENDING_HEADLESS_MS = 90_000;  // a cold browser has to boot and load media
/* A tab that claimed a job reports at least every JOB_HEARTBEAT_MS while it works (app.js runExportJob beats on
   its own, apart from progress). Four beats missed means it is not working: Chrome runs a hidden tab's timers at
   most once a minute once it throttles it hard, and a minimized or paused window may not run them at all. The
   one-job queue is freed then, instead of waiting for the caller or for STALL_MS, and the job ends as failed with
   the reason. It is not handed on to a headless browser: the quiet tab may still be half-way (a track saved into
   the project, a file half written), and running it twice is worse than saying so. */
const JOB_HEARTBEAT_MS = 5_000;
const TAB_SILENT_MS = 20_000;
const STALL_MS = 120_000;            // a headless page (nothing throttles it) reports at least every few seconds
const KEEP_MS = 60 * 60 * 1000;
const KIND_NAME = { scopes: "scope reading", track: "tracking job", transcribe: "transcription", lyrics: "lyrics card", export: "export" };

/** A Chromium-family browser to run headless: FABLECUT_CHROME, else the usual
 *  Chrome / Edge / Chromium install paths for this platform. Null if none. */
function findBrowser(env = process.env) {
  if (env.FABLECUT_CHROME) return fs.existsSync(env.FABLECUT_CHROME) ? env.FABLECUT_CHROME : null;
  const candidates = [];
  if (process.platform === "win32") {
    const roots = [env.PROGRAMFILES, env["PROGRAMFILES(X86)"], env.LOCALAPPDATA].filter(Boolean);
    for (const r of roots) {
      candidates.push(path.join(r, "Google", "Chrome", "Application", "chrome.exe"));
      candidates.push(path.join(r, "Microsoft", "Edge", "Application", "msedge.exe"));
      candidates.push(path.join(r, "Chromium", "Application", "chrome.exe"));
    }
  } else if (process.platform === "darwin") {
    candidates.push("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
      "/Applications/Chromium.app/Contents/MacOS/Chromium");
  } else {
    for (const name of ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "microsoft-edge"]) {
      const r = spawnSync("which", [name], { encoding: "utf8" });
      if (r.status === 0 && r.stdout.trim()) candidates.push(r.stdout.trim());
    }
  }
  return candidates.find((p) => { try { return fs.statSync(p).isFile(); } catch { return false; } }) || null;
}

/* Which process the Linux out-of-memory killer takes first (MC-15) is not set by MontClip. #231 started the headless
   browser with oom_score_adj 1000; on europa (Video, #231 issuecomment-6715105038) Chrome sets its own per process type
   as it starts — browser and zygote 0, GPU and utility 200, renderer (the export page) 300 — and the 1000 lasted under a
   second, the same as main without it. So that line was removed. The export page is still above the engine (0), which
   makes it the likelier one to be killed, but that is Chrome's default, not ours, and nobody has run a machine out of
   memory to see which one goes. What MontClip does do: a page that dies ends its job (EXPORT_PAGE_CRASHED, below). */

/** opts: {url(id) → page to open headless, broadcast(event, data, task), editors(task) → open tab count (task: a job's
 *  {project, session} when it names a Cindy task, else null — only the editor connections bound to that task count and
 *  get its ticket), claimAllowed(job, body) → may this tab claim it (a task's job: only its own connection),
 *  keepProfile(kind) → a browser profile dir that outlives the job (a model cache), or null for a throwaway one,
 *  now() → the clock (tests),
 *  activeProject() → the open project's id: a job asked for one project ends when another is open (EXPORT_PROJECT_CHANGED),
 *  onEnd(job) → a job ended without its file (failed or cancelled): stop what it left running,
 *  finished(src) → is the file an export job says it made really in place (renamed from .part)?} */
function createExportJobs(opts) {
  const clock = typeof opts.now === "function" ? opts.now : () => Date.now();   // late-bound: tests may stub Date.now
  function assertWhere(where = "auto") {
    if (opts.allowHeadless !== false) return;
    // English for agents and logs; the page says errorCode in the interface language (app.js jobProblem, errorText)
    if (where === "headless") throw Object.assign(new Error("Headless system browsers are disabled in desktop mode."), { code: 409, errorCode: "HEADLESS_DISABLED" });
    if (!opts.editors()) throw Object.assign(new Error("The editor is not ready; open it and retry."), { code: 409, errorCode: "EDITOR_NOT_READY" });
  }
  const jobs = new Map();
  let timer = null;
  const isEnded = (j) => j.status === "done" || j.status === "failed" || j.status === "cancelled";
  const view = (j) => ({
    id: j.id, project: j.project, session: j.session, kind: j.kind, status: j.status, via: j.via, range: j.range, preview: !!j.preview, profile: j.profile || null, preset: j.delivery ? j.delivery.preset || "custom" : null,
    time: j.time ?? null, progress: j.progress, src: j.src || null, result: j.result || null, error: j.error || null,
    code: j.errorCode || null, created: j.created, updated: j.updated,
  });

  function closeBrowser(j) {
    const b = j.browser;
    if (!b) return;
    j.browser = null;
    try { b.proc.kill(); } catch {}
    if (b.keep) return;
    // The profile dir is locked until the browser exits.
    const rm = (n) => fs.rm(b.profileDir, { recursive: true, force: true }, (err) => {
      if (err && n > 0) setTimeout(() => rm(n - 1), 1000);
    });
    b.proc.once("exit", () => rm(5));
    setTimeout(() => rm(5), 3000);
  }
  function end(j, status, fields = {}) {
    if (isEnded(j)) return;
    Object.assign(j, fields, { status, updated: clock() });
    closeBrowser(j);
    if (status !== "done" && opts.onEnd) { try { opts.onEnd(view(j)); } catch {} }
  }
  /* E5a (MontClip#215): a job knows the project it renders. When another one is open — opened by another task, the
     dashboard or an agent — whatever the tab renders now is not that project, so the job ends instead of finishing. */
  const projectChanged = (j) => !!j.project && !isEnded(j) && typeof opts.activeProject === "function" && opts.activeProject() !== j.project;
  const endProjectChanged = (j) => end(j, "failed", { errorCode: "EXPORT_PROJECT_CHANGED", error: "The export project changed." });
  function sweep() {
    const now = clock();
    for (const j of jobs.values()) {
      if (projectChanged(j)) endProjectChanged(j);
      else if (j.status === "pending" && now - j.created > (j.via === "headless" ? PENDING_HEADLESS_MS : PENDING_TAB_MS))
        end(j, "failed", j.via !== "headless" && opts.allowHeadless === false
          ? { error: "The editor did not accept the task; retry when it is ready.", errorCode: "EDITOR_DID_NOT_ACCEPT" }
          : { error: j.via === "headless"
            ? "the headless browser never picked up the job (it may have failed to start or to load the editor)"
            : "no editor tab picked up the job — is it busy exporting? Retry with where:\"headless\"" });
      else if (j.status === "running" && j.via === "tab" && now - j.updated > TAB_SILENT_MS &&
        (j.hidden === true || (j.tabId && opts.editorConnected?.(j.tabId) === false)))
        // English for agents and logs; the page says errorCode in the interface language (app.js jobProblem, errorText)
        end(j, "failed", { errorCode: "EDITOR_STOPPED_ANSWERING", error: `the editor tab stopped answering for ${TAB_SILENT_MS / 1000} s ` +
          "(it may be in the background, minimized or paused), so the job was ended to free the queue — bring the editor to the front and retry" +
          (opts.allowHeadless === false ? "" : ", or retry with where:\"headless\"") });
      // headless, or a tab that never said who it is (no tabId, no hidden): main's 120 s stall (P11). Only a tab known to be
      // visible and connected keeps its job past that.
      else if (j.status === "running" && (j.via === "headless" || (!j.tabId && typeof j.hidden !== "boolean")) && now - j.updated > STALL_MS)
        end(j, "failed", { ...(j.via === "headless" ? { errorCode: "EXPORT_PAGE_CRASHED" } : {}), error: "the editor stopped reporting progress" +
          (j.kind === "export" ? ` at ${Math.round(j.progress * 100)}%${j.at != null ? ` (timeline ${j.at} s)` : ""}` : "") + " (tab closed or browser crashed)" });
      else if (isEnded(j) && now - j.updated > KEEP_MS) jobs.delete(j.id);
    }
    if (![...jobs.values()].some((j) => !isEnded(j)) && timer) { clearInterval(timer); timer = null; }
  }
  function launch(j) {
    assertWhere("headless");
    const exe = findBrowser();
    if (!exe) throw Object.assign(new Error("no editor tab is open and no Chrome / Edge was found to export headless — " +
      "open the editor in a browser, or set FABLECUT_CHROME to a Chromium-based browser"), { code: 409 });
    const kept = opts.keepProfile ? opts.keepProfile(j.kind) : null;
    if (kept) fs.mkdirSync(kept, { recursive: true });
    const profileDir = kept || fs.mkdtempSync(path.join(os.tmpdir(), "fablecut-export-"));
    const args = [
      "--headless=new", `--user-data-dir=${profileDir}`, "--no-first-run", "--no-default-browser-check",
      "--disable-extensions", "--mute-audio", "--autoplay-policy=no-user-gesture-required",
      "--disable-background-timer-throttling", "--disable-renderer-backgrounding",
      "--disable-backgrounding-occluded-windows", "--window-size=1600,900",
      opts.url(j.id),
    ];
    const proc = spawn(exe, args, { stdio: "ignore", windowsHide: true });
    j.browser = { proc, profileDir, keep: !!kept };
    proc.on("error", (e) => end(j, "failed", { error: "could not start the headless browser: " + e.message }));
    // the page crashed with its browser (MC-15): this job ends, said in the interface language (EXPORT_PAGE_CRASHED); the
    // engine and the queue carry on
    proc.on("exit", () => { if (j.browser) { j.browser = null; if (!isEnded(j)) end(j, "failed", { errorCode: "EXPORT_PAGE_CRASHED", error: "the headless browser exited before the export finished" }); } });
  }

  return {
    assertWhere,
    /** Queue an export. where: auto (open tab, else headless) · tab · headless.
     *  kind "scopes" measures one still at `time` instead (fablecut_scopes);
     *  kind "track" follows a region of a clip and saves it (fablecut_track);
     *  kind "transcribe" turns files' speech into words and saves them (fablecut_transcribe);
     *  kind "lyrics" asks the streamer on a card whether to put a lyrics proposal on a new caption track, and does it
     *  when she agrees (fablecut_lyrics_apply) — always in an open tab: a headless page has no one to ask.
     *  A scopes job's `image` flag also returns that still as a JPEG data URL,
     *  which is how fablecut_frame shows an agent the composed program picture. */
    request({ project = null, session = null, kind = "export", range, preview = false, profile, delivery = null, deliveries = null, time, revision, where = "auto", matte = null, mask = null, track = null, transcribe = null, lyrics = null, image = false }) {
      if (!["auto", "tab", "headless"].includes(where)) throw Object.assign(new Error("where must be auto, tab or headless"), { code: 400 });
      assertWhere(where);
      if (!["export", "scopes", "track", "transcribe", "lyrics"].includes(kind)) throw Object.assign(new Error("kind must be export, scopes, track, transcribe or lyrics"), { code: 400 });
      if (kind === "lyrics" && where === "headless") throw Object.assign(new Error("the lyrics card needs an open editor window: someone has to answer it"), { code: 409, errorCode: "EDITOR_NOT_READY" });
      if (time != null && !(Number.isFinite(time) && time >= 0)) throw Object.assign(new Error("time must be seconds ≥ 0"), { code: 400 });
      /* #321: a quick sample takes its own seconds, {start, end} on the timeline, without touching the project's IN / OUT
         (which would make a revision and, forgotten, a cut-off export later). */
      const spanRange = range != null && typeof range === "object" && !Array.isArray(range);
      if (range != null && range !== "entire" && range !== "in-out" &&
        !(spanRange && Number.isFinite(range.start) && Number.isFinite(range.end) && range.start >= 0 && range.end > range.start))
        throw Object.assign(new Error("range must be \"entire\", \"in-out\" or {start, end} in seconds with 0 <= start < end"), { code: 400 });
      if (preview && kind !== "export") throw Object.assign(new Error("preview applies to an export only"), { code: 400 });
      sweep();   // a job that has just run out of time must not refuse this one until the next tick
      const busy = [...jobs.values()].find((j) => !isEnded(j));
      // English for agents and logs, with the exact call that frees the queue; the page says JOB_BUSY in its own words
      if (busy) throw Object.assign(new Error(`${KIND_NAME[busy.kind] || "export"} ${busy.id} is still ${busy.status} — wait for it, or cancel it: ` +
        `fablecut_export {cancel:"${busy.id}"} (POST /api/export/job/cancel?id=${busy.id})` +
        (busy.via === "tab" ? `. A silent job whose editor is hidden or disconnected ends after ${TAB_SILENT_MS / 1000} s` : "")),
      { code: 409, errorCode: "JOB_BUSY", busy: { id: busy.id, kind: busy.kind, status: busy.status, via: busy.via, progress: busy.progress, since: busy.created } });
      const task = session ? { project: project || null, session } : null;
      const tabs = opts.editors(task);
      if (kind === "lyrics" && !tabs) throw Object.assign(new Error("no editor window is open — the lyrics card needs one: open the editor, then try again"), { code: 409, errorCode: "EDITOR_NOT_READY" });
      if (where === "tab" && !tabs) throw Object.assign(new Error("no editor tab is open — open the editor, or use where:\"headless\""), { code: 409 });
      const now = clock();
      const j = {
        id: "x_" + Math.random().toString(36).slice(2, 10), project: project || null, session: session || null, kind, status: "pending", progress: 0,
        range: spanRange ? { start: +range.start, end: +range.end } : range || null, preview: kind === "export" && preview === true,
        profile: profile || null, delivery: kind === "export" && delivery ? delivery : null,
        deliveries: kind === "export" && Array.isArray(deliveries) && deliveries.length ? deliveries : null, time: time ?? null, revision: Number.isFinite(revision) ? revision : null,
        matte: kind === "scopes" && matte ? { clip: String(matte.clip), layer: matte.layer } : null,
        mask: kind === "scopes" && mask ? { clip: String(mask.clip) } : null,
        track: kind === "track" && track ? track : null,
        transcribe: kind === "transcribe" && transcribe ? transcribe : null,
        lyrics: kind === "lyrics" && lyrics ? lyrics : null,
        image: kind === "scopes" && !!image,
        via: where === "headless" || (where === "auto" && !tabs) ? "headless" : "tab",
        created: now, updated: now,
      };
      if (j.via === "headless") launch(j);
      jobs.set(j.id, j);
      if (j.via === "tab") opts.broadcast("export", JSON.stringify(this.ticket(j.id)), task);
      if (!timer) { timer = setInterval(sweep, 1000); timer.unref?.(); }
      return view(j);
    },
    get(id) { const j = jobs.get(id); return j ? view(j) : null; },
    /** What a tab needs to run the job (headless pages fetch it by id). */
    ticket(id) { const j = jobs.get(id); return j ? { id: j.id, project: j.project, session: j.session, kind: j.kind, range: j.range, profile: j.profile, delivery: j.delivery || null, deliveries: j.deliveries || null, time: j.time, revision: j.revision, matte: j.matte || null, mask: j.mask || null, track: j.track || null, transcribe: j.transcribe || null, lyrics: j.lyrics || null, image: !!j.image, status: j.status } : null; },
    /** First tab to claim a pending job runs it. */
    claim(id, body = {}) {
      const { tabId, hidden } = body;
      const j = jobs.get(id);
      if (j && projectChanged(j)) endProjectChanged(j);
      if (!j || j.status !== "pending") return false;
      if (opts.claimAllowed && !opts.claimAllowed(view(j), body)) return false;
      j.status = "running"; j.updated = clock();
      j.tabId = typeof tabId === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(tabId) ? tabId : null;
      j.hidden = typeof hidden === "boolean" ? hidden : null;
      return true;
    },
    /** Progress / result from the running tab. Returns {cancel} so a cancel reaches it. */
    report(id, { progress, status, src, result, error, code, at, tabId, hidden } = {}) {
      const j = jobs.get(id);
      if (!j) return null;
      if (projectChanged(j)) endProjectChanged(j);
      // cancelled, or ended for it (it stopped answering): the tab stops, and what it sends late is not taken.
      // Ended by the queue, it is also told why, so it can say so to whoever is at it (app.js jobProblem).
      if (j.status === "failed" && j.errorCode) return { cancel: true, code: j.errorCode, error: j.error };
      if (j.status === "cancelled" || j.status === "failed") return { cancel: true };
      if (j.status !== "running") return { cancel: false };
      if (j.tabId && tabId !== j.tabId) return { cancel: true };
      if (typeof hidden === "boolean") j.hidden = hidden;
      j.updated = clock();   // any report counts; an empty one ({}) is the tab's heartbeat
      if (Number.isFinite(progress)) j.progress = Math.max(0, Math.min(1, progress));
      if (Number.isFinite(at)) j.at = at;   // the timeline second last drawn: where a stalled export stopped
      // done means the finished file is in place, never "ffmpeg exited" (P11): a job whose file is not there failed
      if (status === "done" && j.kind === "export" && opts.finished && !opts.finished(String(src || "")))
        end(j, "failed", { error: "the export said it was done, but its file is not in place" });
      else if (status === "done") end(j, "done", { progress: 1, src: String(src || ""), result: result && typeof result === "object" ? result : null });
      // the page's reason code (EXPORT_AUDIO_FAILED, EXPORT_NO_H264 …) is kept in the record and its view; anything else is not
      else if (status === "failed") end(j, "failed", { error: String(error || "export failed"), ...(typeof code === "string" && /^[A-Za-z][A-Za-z0-9_]{1,63}$/.test(code) ? { errorCode: code } : {}) });
      return { cancel: false };
    },
    cancel(id) {
      const j = jobs.get(id);
      if (!j) return null;
      // A running tab hears about it on its next report and stops; pending just ends.
      if (!isEnded(j)) end(j, "cancelled", { error: "cancelled" });
      return view(j);
    },
    sweep,
    shutdown() { for (const j of jobs.values()) closeBrowser(j); if (timer) clearInterval(timer); },
  };
}

/* #325 (QQ, Rea; #321 R1a / R1b / P6): the editor clamps a range to the timeline, so a part past its end used to come
   back as a shorter file under the seconds that were asked. /api/export/request refuses those up front instead.
   timelineLength mirrors the editor's projDur(): the last second a clip occupies on one of the project's lanes
   (project.tracks, else the default V3…V1 + A1…A4). */
const DEFAULT_LANES = ["V3", "V2", "V1", "A1", "A2", "A3", "A4"];
function timelineLength(project) {
  const p = project && typeof project === "object" ? project : {};
  const lanes = new Set(Array.isArray(p.tracks) && p.tracks.length ? p.tracks.map((t) => t && t.id) : DEFAULT_LANES);
  let end = 0;
  for (const c of Array.isArray(p.clips) ? p.clips : []) {
    if (!c || !lanes.has(c.track)) continue;
    const e = +c.start + +c.duration;
    if (Number.isFinite(e) && e > end) end = e;
  }
  return end;
}
/** The seconds an export request would render: {start, end} as given, else the project's IN / OUT ("in-out", the default
 *  when either is set) or the whole timeline. */
function requestedSpan(project, range, length) {
  if (range && typeof range === "object") return { start: +range.start, end: +range.end };
  const hasIn = Number.isFinite(project && project.inPoint), hasOut = Number.isFinite(project && project.outPoint);
  const mode = range || (hasIn || hasOut ? "in-out" : "entire");
  if (mode === "in-out" && (hasIn || hasOut)) {
    const start = Math.min(Math.max(0, hasIn ? project.inPoint : 0), length);
    return { start, end: Math.max(start, Math.min(Math.max(0, hasOut ? project.outPoint : length), length)) };
  }
  return { start: 0, end: length };
}
/** null when the request is fine, else {errorCode, error} for a 400. Shape errors are export-jobs' request()'s to report. */
function checkExportSpan({ project, range, preview = false, maxPreviewSec = 30 }) {
  const isSpan = range != null && typeof range === "object" && !Array.isArray(range) &&
    Number.isFinite(range.start) && Number.isFinite(range.end) && range.start >= 0 && range.end > range.start;
  if (range != null && typeof range === "object" && !isSpan) return null;   // request() refuses it with its own message
  const length = timelineLength(project);
  const EPS = 1e-6;
  if (isSpan && range.end > length + EPS)
    return { errorCode: "RANGE_PAST_END", error: `end ${range.end} s is past the end of the timeline (${+length.toFixed(3)} s): pass an end of at most ${+length.toFixed(3)}` };
  if (preview) {
    const s = requestedSpan(project, range, length);
    if (s.end - s.start > maxPreviewSec + EPS)
      return { errorCode: "PREVIEW_TOO_LONG", error: `a preview is at most ${maxPreviewSec} s; this one would be ${+(s.end - s.start).toFixed(3)} s — pass a shorter start / end, or export without preview` };
  }
  return null;
}

module.exports = { createExportJobs, findBrowser, TAB_SILENT_MS, JOB_HEARTBEAT_MS, timelineLength, checkExportSpan };
