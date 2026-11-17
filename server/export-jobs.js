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
const KIND_NAME = { scopes: "scope reading", track: "tracking job", transcribe: "transcription", lyrics: "lyrics card", importurl: "download question", export: "export" };

/* MontClip#320, a safety net and not the fix (#348 is the fix): the headless export's browser grew without bound, and
   on europa one export took the whole machine (31 GiB, no swap) with it five times in a day. A runaway browser now ends
   only its own job: when the anonymous memory of the browser and everything under it passes the limit, the job is
   stopped (EXPORT_MEMORY_LIMIT, said to the streamer) and not retried. 2 GiB for now (Deja, #320): the longest export
   measured after #348 peaked at 0.85 GiB (275 s, 1080x1920, one layer, AD); before it, 3.1 GiB. Set
   MONTCLIP_EXPORT_MEMORY_MAX_MIB to change it, 0 to turn it off. Measured from /proc on Linux, and on Windows (#364)
   by a watcher started next to the browser (win-tree-memory.js: the private bytes of the browser and everything under
   it). Same limit, same code, same sentence on both. Elsewhere (macOS) the limit is not applied (nothing is measured,
   so nothing is stopped). */
const MEMORY_LIMIT_MIB = 2048;
const MEMORY_POLL_MS = 3_000;
function memoryLimitBytes(env = process.env) {
  const raw = env.MONTCLIP_EXPORT_MEMORY_MAX_MIB;
  const n = raw == null || raw === "" ? NaN : Number(raw);
  return (Number.isFinite(n) && n >= 0 ? Math.floor(n) : MEMORY_LIMIT_MIB) * 1048576;
}
/** Anonymous memory (RssAnon) of a process and every process under it, in bytes; null when it cannot be read (not
 *  Linux, the process is gone) — an unknown size never stops anything. Walks /proc/<pid>/task/<tid>/children, so it
 *  costs a few files per browser process, not a scan of the whole machine. */
function treeAnonBytes(pid, { platform = process.platform, proc = "/proc", fsx = fs } = {}) {
  if (platform !== "linux" || !Number.isInteger(pid) || pid <= 0) return null;
  const todo = [pid], seen = new Set();
  let sum = 0, read = 0;
  while (todo.length && seen.size < 2000) {
    const p = todo.pop();
    if (seen.has(p)) continue;
    seen.add(p);
    try {
      const m = /^RssAnon:\s+(\d+) kB/m.exec(fsx.readFileSync(`${proc}/${p}/status`, "utf8"));
      if (m) { sum += +m[1] * 1024; read++; }
    } catch { continue; }
    let tids = [];
    try { tids = fsx.readdirSync(`${proc}/${p}/task`); } catch { continue; }
    for (const t of tids) {
      try { for (const c of fsx.readFileSync(`${proc}/${p}/task/${t}/children`, "utf8").split(/\s+/)) if (/^\d+$/.test(c)) todo.push(+c); } catch {}
    }
  }
  return read ? sum : null;
}

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

/* MontClip#247: opened with "Run as administrator" (Windows), Chrome and Edge start themselves again without the
   elevation and the process we started exits at once — exit code 0, nothing said. That used to end the job as a
   crashed page, and she retried with no way to know why. It is said as what it is only when BOTH hold: this process
   is elevated, and the browser we started exited with code 0 within FAST_EXIT_MS before its page took the job. Any
   other exit stays EXPORT_PAGE_CRASHED (a quick exit alone is not proof: JJ's spec, PG on #223). Nothing is done to
   make the browser work elevated — no sandbox or de-elevation switch (QQ's ruling on #243). */
const FAST_EXIT_MS = 3000;   // measured on Win11: 140–206 ms; a browser that came up never exits 0 this early by itself
let elevatedKnown = null;
/** Is this process elevated (Windows: high or system integrity level)? Asked once, of whoami in the Windows folder by
 *  its full path, with fixed arguments. Anything that cannot be read is "no": the plain crash sentence is the default. */
function isElevated(env = process.env, platform = process.platform) {
  if (platform !== "win32") return false;
  if (elevatedKnown !== null) return elevatedKnown;
  try {
    const out = spawnSync(path.join(env.SystemRoot || env.windir || "C:\\Windows", "System32", "whoami.exe"), ["/groups", "/fo", "csv", "/nh"],
      { encoding: "utf8", windowsHide: true, timeout: 5000 }).stdout || "";
    elevatedKnown = /S-1-16-(12288|16384)\b/.test(out);
  } catch { elevatedKnown = false; }
  return elevatedKnown;
}
/** The code a job ends with, by who started the engine: the sentence names that program (JJ, #247), or "this program"
 *  where that is not known. host: "cindy" (the plugin) | "montclip" (the Windows app) | anything else. */
const elevatedCode = (host) => host === "cindy" ? "EXPORT_ELEVATED_CINDY" : host === "montclip" ? "EXPORT_ELEVATED_MONTCLIP" : "EXPORT_ELEVATED_PROGRAM";

/** opts: {url(id) → page to open headless, broadcast(event, data, task), editors(task) → open tab count (task: a job's
 *  {project, session} when it names a Cindy task, else null — only the editor connections bound to that task count and
 *  get its ticket), claimAllowed(job, body) → may this tab claim it (a task's job: only its own connection),
 *  keepProfile(kind) → a browser profile dir that outlives the job (a model cache), or null for a throwaway one,
 *  now() → the clock (tests),
 *  activeProject() → the open project's id: a job asked for one project ends when another is open (EXPORT_PROJECT_CHANGED),
 *  onEnd(job) → a job ended without its file (failed or cancelled): stop what it left running,
 *  finished(src) → is the file an export job says it made really in place (renamed from .part)?,
 *  isElevated() → is this process elevated (tests; default: asked of Windows once), host → who started the engine
 *  ("cindy" | "montclip" | ""), log(line) → one line for the engine's log (default console.warn)} */
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
    code: j.errorCode || null, created: j.created, updated: j.updated, memUnknown: j.memUnknown || null,
  });

  function closeBrowser(j) {
    const b = j.browser;
    if (!b) return;
    j.browser = null;
    if (b.mem) { try { b.mem.stop(); } catch {} }
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
  /* #320: is this job's browser over the memory limit? Looked at most every MEMORY_POLL_MS, from the sweep that already
     runs once a second while a job is open — no timer of its own. */
  const memoryLimit = opts.memoryLimit != null ? opts.memoryLimit : memoryLimitBytes();
  function overMemory(j, now) {
    if (!(memoryLimit > 0) || j.via !== "headless" || !j.browser || !j.browser.proc || now - (j.memAt || 0) < MEMORY_POLL_MS) return false;
    // a browser that has already exited is not measured: its pid may be somebody else's by now (pid reuse), and its exit handler is about to end the job
    if (j.browser.proc.exitCode !== null && j.browser.proc.exitCode !== undefined || j.browser.proc.signalCode !== null && j.browser.proc.signalCode !== undefined) return false;
    j.memAt = now;
    let used = null;
    try { used = opts.treeMemory ? opts.treeMemory(j.browser.proc.pid) : j.browser.mem ? j.browser.mem.read() : treeAnonBytes(j.browser.proc.pid); } catch { used = null; }
    if (used == null) { if (j.browser.win) checkWatch(j); return false; }
    j.memBytes = used;
    return used > memoryLimit;
  }
  /* #364, QQ on #365: on Windows a missing reading has many causes (PowerShell blocked, the watcher gone, CIM failing for
     a while — likeliest when memory runs short), and none of them may switch the limit off without a word. A watcher that
     could not start or ended while the browser runs is started again once; after that, or when no reading has come for
     the watcher's STALE_MS, the job carries memUnknown (it shows in the job and in fablecut_export's answer) and the log
     gets one line. The export goes on: an unknown size never stops one. */
  const UNKNOWN_WHY = { unavailable: "the memory watcher could not be started", exited: "the memory watcher stopped",
    gone: "the memory watcher stopped", stale: "no memory reading came in time" };
  function startWatch(j) {
    try { j.browser.mem = (opts.watchMemory || require("./win-tree-memory").watchTreeMemory)(j.browser.proc.pid); }   // loaded only here: Windows, headless
    catch { j.browser.mem = null; }
  }
  function checkWatch(j) {
    const m = j.browser.mem;
    let h = "unavailable";
    try { if (m) h = typeof m.health === "function" ? m.health() : "starting"; } catch {}
    if (h === "ok" || h === "starting") return;
    if (h !== "stale" && !j.memRestarted) {
      j.memRestarted = true;
      try { if (m) m.stop(); } catch {}
      startWatch(j);
      return;
    }
    if (j.memUnknown) return;
    j.memUnknown = UNKNOWN_WHY[h] ? h : "unavailable";
    try { (opts.log || console.warn)(`export: the memory limit could not be measured (${UNKNOWN_WHY[j.memUnknown]}); the export goes on without it`); } catch {}
  }
  function endOverMemory(j) {
    const mib = (n) => Math.round(n / 1048576);
    try { (opts.log || console.warn)(`export: the headless browser used ${mib(j.memBytes)} MiB, over the ${mib(memoryLimit)} MiB limit; the export was stopped`); } catch {}
    end(j, "failed", { errorCode: "EXPORT_MEMORY_LIMIT", error: `the export used more memory than allowed (${mib(j.memBytes)} MiB, limit ${mib(memoryLimit)} MiB), so it was stopped ` +
      "and no file was made; it is not retried. Try exporting a shorter part first" });
  }
  function sweep() {
    const now = clock();
    for (const j of jobs.values()) {
      if (projectChanged(j)) endProjectChanged(j);
      else if (!isEnded(j) && overMemory(j, now)) endOverMemory(j);
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
    const started = Date.now();
    j.browser = { proc, profileDir, keep: !!kept };
    // #364: Windows has no /proc; a watcher reads this browser's tree instead (nothing when the limit is off, or tests measure)
    if (memoryLimit > 0 && !opts.treeMemory && (opts.platform || process.platform) === "win32" && Number.isInteger(proc.pid)) {
      j.browser.win = true;
      startWatch(j);
    }
    proc.on("error", (e) => end(j, "failed", { error: "could not start the headless browser: " + e.message }));
    // the page crashed with its browser (MC-15): this job ends, said in the interface language (EXPORT_PAGE_CRASHED); the
    // engine and the queue carry on
    proc.on("exit", (code) => {
      if (!j.browser) return;
      if (j.browser.mem) { try { j.browser.mem.stop(); } catch {} }
      j.browser = null;
      if (isEnded(j)) return;
      const ms = Date.now() - started;
      // #247: only a clean, immediate exit before the page took the job, and only when this process is elevated
      if (code === 0 && ms < FAST_EXIT_MS && j.status === "pending" && (typeof opts.isElevated === "function" ? opts.isElevated() : isElevated())) {
        try { (opts.log || console.warn)(`export: running elevated (administrator); the headless browser exited within ${ms} ms`); } catch {}
        end(j, "failed", { errorCode: elevatedCode(opts.host), error: "this program was started with \"Run as administrator\", and the browser an export needs exits at once that way; " +
          "no file was made. Close it, start it normally (not as administrator) and export again" });
        return;
      }
      end(j, "failed", { errorCode: "EXPORT_PAGE_CRASHED", error: "the headless browser exited before the export finished" });
    });
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
    request({ project = null, session = null, kind = "export", range, preview = false, profile, delivery = null, deliveries = null, time, revision, where = "auto", matte = null, mask = null, track = null, transcribe = null, lyrics = null, importUrl = null, image = false }) {
      if (!["auto", "tab", "headless"].includes(where)) throw Object.assign(new Error("where must be auto, tab or headless"), { code: 400 });
      assertWhere(where);
      if (!["export", "scopes", "track", "transcribe", "lyrics", "importurl"].includes(kind)) throw Object.assign(new Error("kind must be export, scopes, track, transcribe, lyrics or importurl"), { code: 400 });
      const asks = kind === "lyrics" || kind === "importurl";   // a card the streamer answers: an open editor window, never headless
      if (asks && where === "headless") throw Object.assign(new Error(`the ${KIND_NAME[kind]} needs an open editor window: someone has to answer it`), { code: 409, errorCode: "EDITOR_NOT_READY" });
      if (kind === "importurl" && !(importUrl && typeof importUrl.url === "string" && typeof importUrl.host === "string")) throw Object.assign(new Error("an importurl job needs {url, host}"), { code: 400 });
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
      if (asks && !tabs) throw Object.assign(new Error(`no editor window is open — the ${KIND_NAME[kind]} needs one: open the editor, then try again`), { code: 409, errorCode: "EDITOR_NOT_READY" });
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
        importUrl: kind === "importurl" ? { url: importUrl.url, host: importUrl.host } : null,
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
    ticket(id) { const j = jobs.get(id); return j ? { id: j.id, project: j.project, session: j.session, kind: j.kind, range: j.range, profile: j.profile, delivery: j.delivery || null, deliveries: j.deliveries || null, time: j.time, revision: j.revision, matte: j.matte || null, mask: j.mask || null, track: j.track || null, transcribe: j.transcribe || null, lyrics: j.lyrics || null, importUrl: j.importUrl || null, image: !!j.image, status: j.status } : null; },
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

/* #337 (PG, 6886869583): the body of POST /api/export/request. A field the server does not know used to be dropped, so
   {start: 10, end: 12} at the top level — the way an agent most naturally writes it — exported the whole timeline: a long
   wait, and an easy way into #320's memory growth. Now start / end at the top level are the span, like range {start, end};
   given both ways they must agree; and any other field is refused with its name, before anything is queued. */
const EXPORT_REQUEST_FIELDS = ["range", "start", "end", "preview", "profile", "preset", "delivery", "outputs", "where", "project", "session"];
const bodyError = (code, error, extra = {}) => ({ error: { code, error: error + " — nothing was exported", ...extra } });
/** {opts} (start / end folded into range) or {error: {code, error, fields?}} for a 400. */
function exportRequestBody(body) {
  if (body === null || typeof body !== "object" || Array.isArray(body))
    return bodyError("BAD_BODY", "the body must be a JSON object: {range?, start?, end?, preview?, profile?, preset?, delivery?, outputs?, where?}");
  const unknown = Object.keys(body).filter((k) => !EXPORT_REQUEST_FIELDS.includes(k));
  if (unknown.length)
    return bodyError("UNKNOWN_FIELD", `unknown field${unknown.length > 1 ? "s" : ""} ${unknown.map((k) => JSON.stringify(k)).join(", ")}: ` +
      `/api/export/request takes ${EXPORT_REQUEST_FIELDS.join(", ")}`, { fields: unknown });
  const r = body.range;
  if (r != null && typeof r === "object" && !Array.isArray(r)) {
    const extra = Object.keys(r).filter((k) => k !== "start" && k !== "end");
    if (extra.length) return bodyError("UNKNOWN_FIELD", `unknown field${extra.length > 1 ? "s" : ""} ${extra.map((k) => JSON.stringify("range." + k)).join(", ")}: range takes start and end`,
      { fields: extra.map((k) => "range." + k) });
  }
  const { start, end, ...rest } = body;
  const hasStart = start != null, hasEnd = end != null;   // null is "not given", as undefined is
  if (!hasStart && !hasEnd) return { opts: rest };
  if (hasStart !== hasEnd) return bodyError("RANGE_INCOMPLETE", `${hasStart ? "start" : "end"} was given without ${hasStart ? "end" : "start"}: pass both, seconds on the timeline with 0 <= start < end`);
  if (!(Number.isFinite(start) && Number.isFinite(end) && start >= 0 && end > start))
    return bodyError("BAD_RANGE", "start and end must be seconds on the timeline (numbers) with 0 <= start < end");
  if (r != null && !(typeof r === "object" && !Array.isArray(r) && r.start === start && r.end === end))
    return bodyError("RANGE_CONFLICT", `start / end (${start}–${end} s) and range ${JSON.stringify(r)} say different things: pass one of them`);
  return { opts: { ...rest, range: { start, end } } };
}

module.exports = { createExportJobs, findBrowser, isElevated, elevatedCode, FAST_EXIT_MS, memoryLimitBytes, treeAnonBytes, MEMORY_LIMIT_MIB, MEMORY_POLL_MS, TAB_SILENT_MS, JOB_HEARTBEAT_MS, timelineLength, checkExportSpan, exportRequestBody, EXPORT_REQUEST_FIELDS };
