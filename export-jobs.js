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
const KIND_NAME = { scopes: "scope reading", track: "tracking job", transcribe: "transcription", export: "export" };

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

/** opts: {url(id) → page to open headless, broadcast(event, data), editors() → open tab count,
 *  keepProfile(kind) → a browser profile dir that outlives the job (a model cache), or null for a throwaway one,
 *  now() → the clock (tests)} */
function createExportJobs(opts) {
  const clock = typeof opts.now === "function" ? opts.now : Date.now;
  function assertWhere(where = "auto") {
    if (opts.allowHeadless !== false) return;
    // English for agents and logs; the page says errorCode in the interface language (app.js codeText)
    if (where === "headless") throw Object.assign(new Error("Headless system browsers are disabled in desktop mode."), { code: 409, errorCode: "HEADLESS_DISABLED" });
    if (!opts.editors()) throw Object.assign(new Error("The editor is not ready; open it and retry."), { code: 409, errorCode: "EDITOR_NOT_READY" });
  }
  const jobs = new Map();
  let timer = null;
  const isEnded = (j) => j.status === "done" || j.status === "failed" || j.status === "cancelled";
  const view = (j) => ({
    id: j.id, kind: j.kind, status: j.status, via: j.via, range: j.range, profile: j.profile || null, preset: j.delivery ? j.delivery.preset || "custom" : null,
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
  }
  function sweep() {
    const now = clock();
    for (const j of jobs.values()) {
      if (j.status === "pending" && now - j.created > (j.via === "headless" ? PENDING_HEADLESS_MS : PENDING_TAB_MS))
        end(j, "failed", j.via !== "headless" && opts.allowHeadless === false
          ? { error: "The editor did not accept the task; retry when it is ready.", errorCode: "EDITOR_DID_NOT_ACCEPT" }
          : { error: j.via === "headless"
            ? "the headless browser never picked up the job (it may have failed to start or to load the editor)"
            : "no editor tab picked up the job — is it busy exporting? Retry with where:\"headless\"" });
      else if (j.status === "running" && j.via === "tab" && now - j.updated > TAB_SILENT_MS)
        // English for agents and logs; the page says errorCode in the interface language (app.js codeText)
        end(j, "failed", { errorCode: "EDITOR_STOPPED_ANSWERING", error: `the editor tab stopped answering for ${TAB_SILENT_MS / 1000} s ` +
          "(it may be in the background, minimized or paused), so the job was ended to free the queue — bring the editor to the front and retry" +
          (opts.allowHeadless === false ? "" : ", or retry with where:\"headless\"") });
      else if (j.status === "running" && now - j.updated > STALL_MS)
        end(j, "failed", { error: "the editor stopped reporting progress (tab closed or browser crashed)" });
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
    const proc = spawn(exe, [
      "--headless=new", `--user-data-dir=${profileDir}`, "--no-first-run", "--no-default-browser-check",
      "--disable-extensions", "--mute-audio", "--autoplay-policy=no-user-gesture-required",
      "--disable-background-timer-throttling", "--disable-renderer-backgrounding",
      "--disable-backgrounding-occluded-windows", "--window-size=1600,900",
      opts.url(j.id),
    ], { stdio: "ignore", windowsHide: true });
    j.browser = { proc, profileDir, keep: !!kept };
    proc.on("error", (e) => end(j, "failed", { error: "could not start the headless browser: " + e.message }));
    proc.on("exit", () => { if (j.browser) { j.browser = null; if (!isEnded(j)) end(j, "failed", { error: "the headless browser exited before the export finished" }); } });
  }

  return {
    assertWhere,
    /** Queue an export. where: auto (open tab, else headless) · tab · headless.
     *  kind "scopes" measures one still at `time` instead (fablecut_scopes);
     *  kind "track" follows a region of a clip and saves it (fablecut_track);
     *  kind "transcribe" turns files' speech into words and saves them (fablecut_transcribe).
     *  A scopes job's `image` flag also returns that still as a JPEG data URL,
     *  which is how fablecut_frame shows an agent the composed program picture. */
    request({ kind = "export", range, profile, delivery = null, deliveries = null, time, revision, where = "auto", matte = null, mask = null, track = null, transcribe = null, image = false }) {
      if (!["auto", "tab", "headless"].includes(where)) throw Object.assign(new Error("where must be auto, tab or headless"), { code: 400 });
      assertWhere(where);
      if (!["export", "scopes", "track", "transcribe"].includes(kind)) throw Object.assign(new Error("kind must be export, scopes, track or transcribe"), { code: 400 });
      if (time != null && !(Number.isFinite(time) && time >= 0)) throw Object.assign(new Error("time must be seconds ≥ 0"), { code: 400 });
      if (range != null && range !== "entire" && range !== "in-out") throw Object.assign(new Error("range must be \"entire\" or \"in-out\""), { code: 400 });
      sweep();   // a job that has just run out of time must not refuse this one until the next tick
      const busy = [...jobs.values()].find((j) => !isEnded(j));
      // English for agents and logs, with the exact call that frees the queue; the page says JOB_BUSY in its own words
      if (busy) throw Object.assign(new Error(`${KIND_NAME[busy.kind] || "export"} ${busy.id} is still ${busy.status} — wait for it, or cancel it: ` +
        `fablecut_export {cancel:"${busy.id}"} (POST /api/export/job/cancel?id=${busy.id})` +
        (busy.via === "tab" ? `. A job the editor tab stops answering ends by itself within ${TAB_SILENT_MS / 1000} s` : "")),
      { code: 409, errorCode: "JOB_BUSY", busy: { id: busy.id, kind: busy.kind, status: busy.status, via: busy.via, progress: busy.progress, since: busy.created } });
      const tabs = opts.editors();
      if (where === "tab" && !tabs) throw Object.assign(new Error("no editor tab is open — open the editor, or use where:\"headless\""), { code: 409 });
      const now = clock();
      const j = {
        id: "x_" + Math.random().toString(36).slice(2, 10), kind, status: "pending", progress: 0,
        range: range || null, profile: profile || null, delivery: kind === "export" && delivery ? delivery : null,
        deliveries: kind === "export" && Array.isArray(deliveries) && deliveries.length ? deliveries : null, time: time ?? null, revision: Number.isFinite(revision) ? revision : null,
        matte: kind === "scopes" && matte ? { clip: String(matte.clip), layer: matte.layer } : null,
        mask: kind === "scopes" && mask ? { clip: String(mask.clip) } : null,
        track: kind === "track" && track ? track : null,
        transcribe: kind === "transcribe" && transcribe ? transcribe : null,
        image: kind === "scopes" && !!image,
        via: where === "headless" || (where === "auto" && !tabs) ? "headless" : "tab",
        created: now, updated: now,
      };
      if (j.via === "headless") launch(j);
      jobs.set(j.id, j);
      if (j.via === "tab") opts.broadcast("export", JSON.stringify(this.ticket(j.id)));
      if (!timer) { timer = setInterval(sweep, 1000); timer.unref?.(); }
      return view(j);
    },
    get(id) { const j = jobs.get(id); return j ? view(j) : null; },
    /** What a tab needs to run the job (headless pages fetch it by id). */
    ticket(id) { const j = jobs.get(id); return j ? { id: j.id, kind: j.kind, range: j.range, profile: j.profile, delivery: j.delivery || null, deliveries: j.deliveries || null, time: j.time, revision: j.revision, matte: j.matte || null, mask: j.mask || null, track: j.track || null, transcribe: j.transcribe || null, image: !!j.image, status: j.status } : null; },
    /** First tab to claim a pending job runs it. */
    claim(id) {
      const j = jobs.get(id);
      if (!j || j.status !== "pending") return false;
      j.status = "running"; j.updated = clock();
      return true;
    },
    /** Progress / result from the running tab. Returns {cancel} so a cancel reaches it. */
    report(id, { progress, status, src, result, error } = {}) {
      const j = jobs.get(id);
      if (!j) return null;
      // cancelled, or ended for it (it stopped answering): the tab stops, and what it sends late is not taken
      if (j.status === "cancelled" || j.status === "failed") return { cancel: true };
      if (j.status !== "running") return { cancel: false };
      j.updated = clock();   // any report counts; an empty one ({}) is the tab's heartbeat
      if (Number.isFinite(progress)) j.progress = Math.max(0, Math.min(1, progress));
      if (status === "done") end(j, "done", { progress: 1, src: String(src || ""), result: result && typeof result === "object" ? result : null });
      else if (status === "failed") end(j, "failed", { error: String(error || "export failed") });
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

module.exports = { createExportJobs, findBrowser, TAB_SILENT_MS, JOB_HEARTBEAT_MS };
