/* Background export (MontClip#263). The Fast (FFmpeg) export runs in a hidden page of its own (app.js, ?exportWorker=…)
   from a copy of the timeline taken when Export is clicked, so the progress window can be closed and the editing goes on:
   a later edit never reaches the file being made. WebCodecs and realtime (MediaRecorder) record this window's own
   picture, so they stay in this window, and their notes say so (the conservative choice; see the PR for #263).

   This file has no DOM: which engines may run in the background, the copy of the timeline, the messages between the
   editor and its export page, and one job's life (starting → running → cancelling → ended). app.js gives it the page
   (makeFrame) and the clock. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.MontClipBgExport = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  /** Each engine: does it keep running after the progress window is closed, and the note it shows (ui-terms.js). */
  const ENGINES = Object.freeze({
    fast: Object.freeze({ background: true, note: "term.engine-fast-note" }),
    webcodecs: Object.freeze({ background: false, note: "term.engine-webcodecs-note" }),
    realtime: Object.freeze({ background: false, note: "term.export-note-realtime" }),
  });
  /** The Fast export when this one export has to stay in this window (blocker() below). */
  const FAST_HERE_NOTE = "term.engine-fast-note-here";

  /** Why a Fast export has to run in this window instead: null when it can go to the background.
   *  worker: a hidden export page can be made here (a connected editor, not itself an export page).
   *  compOpen: a composition is open for editing (the timeline shown is not the project's own).
   *  bgRemove: the range uses AI background removal (its model is loaded in this window only, with her consent). */
  function blocker({ worker = true, compOpen = false, bgRemove = false } = {}) {
    if (!worker) return "NO_WORKER";
    if (compOpen) return "COMP_OPEN";
    if (bgRemove) return "BG_REMOVE";
    return null;
  }
  /** The note key for an engine, given blocker()'s answer for Fast. */
  function noteKey(engine, why = null) {
    if (engine === "fast" && why) return "term.engine-fast-note-" + (why === "COMP_OPEN" ? "comp" : why === "BG_REMOVE" ? "cutout" : "unavailable");
    return (ENGINES[engine] || ENGINES.realtime).note;
  }

  /** A deep copy of the timeline document: what the export page renders, whatever is edited afterwards. */
  function snapshot(doc) { return JSON.parse(JSON.stringify(doc)); }
  /** Same timeline, apart from the save counter and the event log. */
  function sameTimeline(a, b) {
    const key = (d) => { const { revision: _r, agentLog: _l, ...rest } = d || {}; return JSON.stringify(rest); };
    return key(a) === key(b);
  }

  const PHASES = ["mixing", "rendering", "encoding"];
  /** A message from the export page, or null when it is not one (wrong job, wrong shape). */
  function workerMessage(m, id) {
    if (!m || typeof m !== "object" || m.bgExport !== 1 || m.id !== id || typeof m.type !== "string") return null;
    switch (m.type) {
      case "ready": return { type: "ready" };
      case "progress": return Number.isFinite(m.f) ? { type: "progress", f: Math.min(1, Math.max(0, m.f)) } : null;
      case "phase": return PHASES.includes(m.phase) ? { type: "phase", phase: m.phase } : null;
      case "session": return typeof m.sess === "string" && /^[\w-]{1,80}$/.test(m.sess)
        ? { type: "session", sess: m.sess, ...(typeof m.token === "string" && /^[a-f0-9]{64}$/.test(m.token) ? { token: m.token } : {}) } : null;
      case "toast": return typeof m.text === "string" ? { type: "toast", text: m.text.slice(0, 500) } : null;
      case "done": return m.result && typeof m.result === "object" ? { type: "done", result: m.result } : null;
      default: return null;
    }
  }
  /** A message from the editor to its export page, or null. */
  function editorMessage(m, id) {
    if (!m || typeof m !== "object" || m.bgExport !== 1 || m.id !== id) return null;
    if (m.type === "cancel") return { type: "cancel" };
    if (m.type === "start" && m.doc && typeof m.doc === "object" && Array.isArray(m.doc.clips) && m.opts && typeof m.opts === "object")
      return { type: "start", doc: m.doc, opts: m.opts };
    return null;
  }

  /** The editor's side: at most one background export at a time.
   *  deps.makeFrame(id) → {post(msg), remove()}: the hidden export page for this job.
   *  deps.discard(sess): drop the server's half-made file (a cancel the page did not answer).
   *  deps.onChange(job), deps.onDone(job, result): the editor's window, button, queue and toast.
   *  result: {outputs:[…]} | {error, code?, params?, featurePack?, cancelled?} — fastExport's own answer. */
  function createController(deps) {
    const now = deps.now || Date.now;
    const setTimer = deps.setTimer || setTimeout, clearTimer = deps.clearTimer || clearTimeout;
    const bootMs = deps.bootMs || 60000, cancelMs = deps.cancelMs || 8000;
    let job = null, seq = 0;
    const post = (j, m) => { try { j.frame.post({ bgExport: 1, id: j.id, ...m }); } catch { } };
    function finish(j, result) {
      if (job !== j) return;
      clearTimer(j.bootTimer); clearTimer(j.cancelTimer);
      job = null;
      j.state = "ended";
      try { j.frame.remove(); } catch { }
      deps.onDone(j, result);
    }
    return {
      busy: () => !!job,
      job: () => job,
      /** opts: what fastExport needs ({profile} or {delivery}, range) — plain data. */
      start(doc, opts, extra = {}) {
        if (job) return null;
        const id = "bg" + now().toString(36) + "_" + (++seq);
        const j = job = { id, doc: snapshot(doc), opts: snapshot(opts), startedAt: now(), state: "starting", phase: "starting",
          progress: 0, hasProgress: false, sess: null, frame: null, bootTimer: null, cancelTimer: null, ...extra };
        j.frame = deps.makeFrame(id);
        j.bootTimer = setTimer(() => finish(j, { error: "the export page did not start", code: "EXPORT_BACKGROUND_NOT_STARTED" }), bootMs);
        if (deps.onChange) deps.onChange(j);
        return j;
      },
      /** A message from the export page (the caller checked it came from that page's window and this origin). */
      receive(raw) {
        const j = job;
        const m = j && workerMessage(raw, j.id);
        if (!m) return false;
        if (m.type === "ready") {
          if (j.state !== "starting") return false;
          clearTimer(j.bootTimer);
          j.state = "running";
          post(j, { type: "start", doc: j.doc, opts: j.opts });
        } else if (m.type === "progress") { j.progress = m.f; j.hasProgress = true; }
        else if (m.type === "phase") j.phase = m.phase;
        else if (m.type === "session") { j.sess = m.sess; j.token = m.token || null; }
        else if (m.type === "toast") { if (deps.onToast) deps.onToast(j, m.text); return true; }
        else if (m.type === "done") { finish(j, m.result); return true; }
        if (deps.onChange) deps.onChange(j);
        return true;
      },
      /** Stop it. The page discards its own half-made file; one that does not answer in cancelMs is removed, and the
       *  server's session for it discarded here. */
      cancel() {
        const j = job;
        if (!j) return false;
        if (j.state === "cancelling") return true;
        const wasStarting = j.state === "starting";
        j.state = "cancelling";
        if (deps.onChange) deps.onChange(j);
        if (wasStarting) { finish(j, { error: "cancelled", cancelled: true }); return true; }
        post(j, { type: "cancel" });
        j.cancelTimer = setTimer(() => {
          if (j.sess && deps.discard) { try { deps.discard(j.sess, j.token); } catch { } }
          finish(j, { error: "cancelled", cancelled: true, forced: true });
        }, cancelMs);
        return true;
      },
    };
  }

  /** The export page's side. deps.post(msg) to the editor; deps.run(doc, opts, hooks) → fastExport's result;
   *  deps.cancel() stops the running export. Returns receive(msg) for the editor's messages. */
  function createWorker(id, deps) {
    let started = false;
    const post = (m) => deps.post({ bgExport: 1, id, ...m });
    const hooks = {
      onProgress: (f) => post({ type: "progress", f }),
      onPhase: (phase) => post({ type: "phase", phase }),
      onSession: (sess, token) => post({ type: "session", sess, ...(token ? { token } : {}) }),
      toast: (text) => post({ type: "toast", text: String(text) }),
    };
    return {
      ready: () => post({ type: "ready" }),
      hooks,
      async receive(raw) {
        const m = editorMessage(raw, id);
        if (!m) return false;
        if (m.type === "cancel") { deps.cancel(); return true; }
        if (started) return false;
        started = true;
        let result;
        try { result = await deps.run(m.doc, m.opts, hooks); } catch (e) { result = { error: String((e && e.message) || e || "export failed") }; }
        post({ type: "done", result: result && typeof result === "object" ? result : { error: "export failed" } });
        return true;
      },
    };
  }

  return { ENGINES, FAST_HERE_NOTE, blocker, noteKey, snapshot, sameTimeline, workerMessage, editorMessage, createController, createWorker };
});
