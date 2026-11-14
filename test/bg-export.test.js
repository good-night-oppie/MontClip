"use strict";
// MontClip#263: Fast export runs in a hidden page from a copy of the timeline taken at the click, so the progress window
// can be closed and the editing goes on; the notes say what each engine really does. These tests run bg-export.js and
// app.js's own background-export code (with a stand-in page), not just look for keys.
const test = require("node:test"), a = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path");
const ROOT = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
const app = read("app/app.js"), html = read("app/index.html");
const BgExport = require("../app/bg-export");
const view = require("../shared/ui-preferences");

const doc0 = () => ({ name: "p", revision: 3, fps: 30, clips: [{ id: "c1", start: 0, duration: 5 }, { id: "c2", start: 5, duration: 5 }], media: [] });

test("Fast export waits for the discard request before its worker may be removed", async () => {
  const fast = app.slice(app.indexOf('async function fastExport('), app.indexOf('/* ── Export queue'));
  const discard = fast.match(/if \(sessId\) [^\n]+discard=1[^\n]+/)[0];
  let acknowledge, finished = false;
  const request = new Promise(resolve => { acknowledge = resolve; });
  const run = new (Object.getPrototypeOf(async function(){}).constructor)('sessId', 'endToken', 'fetch', discard);
  const done = run('s1', 't'.repeat(64), () => request).then(() => { finished = true; });
  await Promise.resolve(); await Promise.resolve();
  a.equal(finished, false, 'the page must remain alive until the server receives discard');
  acknowledge({ ok: true }); await done;
  a.equal(finished, true);
});

/** A fake clock and an editor ↔ export page pair wired like app.js (postMessage replaced by direct calls). */
function rig({ run, answerCancel = true } = {}) {
  let t = 1000; const timers = [];
  const clock = { now: () => t, setTimer: (fn, ms) => { const x = { fn, at: t + ms }; timers.push(x); return x; },
    clearTimer: (x) => { const i = timers.indexOf(x); if (i >= 0) timers.splice(i, 1); },
    advance(ms) { t += ms; for (const x of timers.filter((x) => x.at <= t)) { this.clearTimer(x); x.fn(); } } };
  const seen = { toEditor: [], toPage: [], done: [], discarded: [], removed: 0, cancels: 0, runDocs: [] };
  let worker = null, ctl = null;
  ctl = BgExport.createController({
    ...clock,
    makeFrame(id) {
      worker = BgExport.createWorker(id, {
        post: (m) => { seen.toEditor.push(m); ctl.receive(m); },
        cancel: () => { seen.cancels++; if (answerCancel && worker.finish) worker.finish({ error: "cancelled", cancelled: true }); },
        run: (doc, opts, hooks) => { seen.runDocs.push(doc); return run ? run(doc, opts, hooks, worker) : new Promise((res) => { worker.finish = res; }); },
      });
      return { post: (m) => { seen.toPage.push(m); if (!seen.dead) worker.receive(m); }, remove: () => { seen.removed++; seen.dead = true; } };
    },
    discard: (sess) => seen.discarded.push(sess),
    onDone: (j, result) => seen.done.push({ j, result }),
  });
  return { ctl, clock, seen, worker: () => worker };
}

test("the export page renders the copy taken at the click: editing the timeline afterwards does not change it", async () => {
  const live = doc0();
  const r = rig();
  const j = r.ctl.start(live, { profile: "default", range: "entire" });
  // she edits while the page is still loading, and again while it renders
  live.clips.splice(1, 1); live.revision++;
  r.worker().ready();
  await new Promise((res) => setImmediate(res));
  live.clips[0].duration = 1; live.name = "changed";
  a.equal(r.seen.runDocs.length, 1);
  a.deepEqual(r.seen.runDocs[0], doc0(), "the page renders the timeline as it was at the click");
  a.deepEqual(j.doc, doc0());
  a.equal(BgExport.sameTimeline(j.doc, live), false, "the editor can tell the file is from an older timeline");
  a.equal(BgExport.sameTimeline(j.doc, { ...doc0(), revision: 99 }), true, "a save alone is not an edit");
  r.worker().finish({ outputs: [{ ok: true, src: "/exports/p.mp4", file: "p.mp4" }] });
  await new Promise((res) => setImmediate(res));
  a.equal(r.seen.done.length, 1);
  a.equal(r.seen.done[0].result.outputs[0].file, "p.mp4");
  a.equal(r.ctl.busy(), false);
  a.equal(r.seen.removed, 1, "the hidden page goes when the job ends");
});

test("progress, phase and the server session come back to the editor; foreign and malformed messages are ignored", async () => {
  const r = rig({ run: (doc, opts, hooks, w) => new Promise((res) => { hooks.onPhase("rendering"); hooks.onSession("abc123"); hooks.onProgress(0.42); w.finish = res; }) });
  const j = r.ctl.start(doc0(), { profile: "x", range: "entire" });
  r.worker().ready();
  await new Promise((res) => setImmediate(res));
  a.equal(j.phase, "rendering"); a.equal(j.sess, "abc123"); a.equal(j.progress, 0.42);
  a.equal(r.ctl.receive({ bgExport: 1, id: "other", type: "progress", f: 0.9 }), false);
  a.equal(r.ctl.receive({ bgExport: 1, id: j.id, type: "progress", f: "x" }), false);
  a.equal(r.ctl.receive({ bgExport: 1, id: j.id, type: "phase", phase: "<b>" }), false);
  a.equal(r.ctl.receive({ bgExport: 1, id: j.id, type: "session", sess: "../x" }), false);
  a.equal(r.ctl.receive({ id: j.id, type: "done", result: {} }), false, "no bgExport marker");
  a.equal(j.progress, 0.42);
  a.equal(r.ctl.start(doc0(), {}), null, "one background export at a time");
  r.worker().finish({ error: "x" });
});

test("cancel: the page stops and discards its file; the job ends as cancelled", async () => {
  const r = rig();
  r.ctl.start(doc0(), { profile: "x", range: "entire" });
  r.worker().ready();
  await new Promise((res) => setImmediate(res));
  a.equal(r.ctl.cancel(), true);
  await new Promise((res) => setImmediate(res));
  a.equal(r.seen.cancels, 1, "the page was told to stop");
  a.equal(r.seen.done.length, 1);
  a.equal(r.seen.done[0].result.cancelled, true);
  a.equal(r.seen.discarded.length, 0, "the page discarded its own session");
  a.equal(r.ctl.busy(), false);
});

test("cancel: a page that does not answer is removed and its half-made file discarded by the editor", async () => {
  const r = rig({ answerCancel: false, run: (doc, opts, hooks, w) => new Promise((res) => { hooks.onSession("sess-1"); w.finish = res; }) });
  r.ctl.start(doc0(), { profile: "x", range: "entire" });
  r.worker().ready();
  await new Promise((res) => setImmediate(res));
  r.ctl.cancel();
  a.equal(r.seen.done.length, 0, "it waits for the page first");
  r.clock.advance(8000);
  a.deepEqual(r.seen.discarded, ["sess-1"]);
  a.equal(r.seen.done[0].result.cancelled, true);
  a.equal(r.seen.done[0].result.forced, true);
  a.equal(r.seen.removed, 1);
});

test("cancel before the page is ready, and a page that never starts", () => {
  const r = rig();
  r.ctl.start(doc0(), {});
  r.ctl.cancel();
  a.equal(r.seen.done[0].result.cancelled, true);
  a.equal(r.seen.toPage.length, 0, "nothing was sent to the page");
  const r2 = rig();
  r2.ctl.start(doc0(), {});
  r2.clock.advance(60000);
  a.equal(r2.seen.done[0].result.code, "EXPORT_BACKGROUND_NOT_STARTED");
  a.equal(r2.ctl.busy(), false);
});

/* ── app.js's own code: the editor stays usable while the export runs ── */
function el(id) {
  const cls = new Set();
  return { id, textContent: "", title: "", disabled: false, dataset: {}, style: {}, listeners: {},
    classList: { add: (...c) => c.forEach((x) => cls.add(x)), remove: (...c) => c.forEach((x) => cls.delete(x)), contains: (c) => cls.has(c), toggle: (c, on) => (on ? cls.add(c) : cls.delete(c)) },
    focus() { doc.activeElement = this; }, contains: () => false, remove() { this.removed = true; }, setAttribute() { } };
}
const doc = { activeElement: null };
function editor(language = "zh-CN") {
  const ids = ["btnExport", "btnExportHide", "btnCancelExport", "exportOverlay", "exportProgress", "exportTitle", "exportNote"];
  const E = Object.fromEntries(ids.map((i) => [i, el(i)]));
  E.exportOverlay.classList.add("hidden"); E.btnExportHide.classList.add("hidden");
  const frames = [], posted = [], said = [], queue = [], saved = [];
  const live = doc0();
  const state = { connected: true, ffmpeg: true, exporting: false, rendering: false, compCtx: null };
  const start = app.indexOf("const BgExport = typeof MontClipBgExport");
  const end = app.indexOf("/* The export page's side");
  a.ok(start > 0 && end > start, "the background export block is in app.js");
  const deps = {
    state, EXPORT_WORKER: null, MontClipBgExport: BgExport, $: (id) => E[id], els: E,
    uiText: (k, v) => view.t(language, k, v), mcView: { get: () => ({ language }) },
    exportRangeMode: () => "entire", deliveryFileName: () => "p_master", projectFps: () => 30, exportBaseName: () => "p",
    queueLabel: () => "Master", exportProfileMeta: (id) => ({ label: id, summary: id }), exportQueue: queue,
    renderQueue: () => { }, renderQueueProgress: () => { }, projectJSON: () => JSON.parse(JSON.stringify(live)),
    toast: (t) => said.push(t), toastHeld: (t) => said.push(t), saveDownload: (src, name) => saved.push(name),
    sayExportFailure: (e) => said.push("FAIL " + e.code), exportReportLine: () => "report", showOneSidedWarning: () => { },
    applyFfmpegState: () => { }, exportBgRemoveClip: () => null, fetch: () => Promise.resolve(),
    renderCancelled: false, exportAbort: null, fastExport: () => { throw Error("not in this page"); },
    document: Object.assign(doc, { body: { appendChild: (f) => frames.push(f) }, createElement: () => {
      const f = el("frame"); f.contentWindow = { postMessage: (m) => posted.push(m) }; return f; } }),
    window: { listeners: [], addEventListener(t, fn) { this.listeners.push(fn); }, removeEventListener(t, fn) { this.listeners = this.listeners.filter((x) => x !== fn); } },
    location: { origin: "http://127.0.0.1:7777" },
  };
  const names = Object.keys(deps);
  const api = new Function(...names, app.slice(start, end) +
    "\nreturn { startBgExport, showBgExportOverlay, hideBgExportOverlay, bgExport, bgExportBusy, fastExportBlocker, get shown() { return bgExportShown; } };")(...names.map((k) => deps[k]));
  const fromPage = (m) => { for (const fn of deps.window.listeners) fn({ source: frames.at(-1).contentWindow, origin: deps.location.origin, data: m }); };
  return { api, E, frames, posted, said, queue, saved, live, state, fromPage, deps };
}

test("a background export leaves the editor usable: not in its exporting state, the window closes, the button shows progress", () => {
  const w = editor();
  const j = w.api.startBgExport({ delivery: { preset: "master", container: "mp4" } });
  a.ok(j, "started");
  a.equal(w.state.exporting, false, "the editor is not exporting: edits, playback, project switches and syncs are not held");
  a.equal(w.state.rendering, false);
  a.equal(w.frames.length, 1, "one hidden page");
  a.match(w.frames[0].src, /^\/\?exportWorker=bg/);
  a.equal(w.E.exportOverlay.classList.contains("hidden"), false, "the progress window opens first");
  a.equal(w.E.btnExportHide.classList.contains("hidden"), false, "with a button to close it");
  a.equal(w.E.exportNote.textContent, '导出会继续做。想看进度，点顶栏的「导出中」。');
  w.api.hideBgExportOverlay();
  a.equal(w.E.exportOverlay.classList.contains("hidden"), true, "closed: nothing covers the editor");
  a.equal(w.api.bgExportBusy(), true, "the export goes on");
  // the page loads, renders
  w.fromPage({ bgExport: 1, id: j.id, type: "ready" });
  a.equal(w.posted[0].type, "start");
  a.equal(w.posted[0].doc.clips.length, 2);
  w.fromPage({ bgExport: 1, id: j.id, type: "phase", phase: "rendering" });
  w.fromPage({ bgExport: 1, id: j.id, type: "progress", f: 0.4 });
  a.equal(w.E.btnExport.textContent, "导出中 40%", "the top bar shows the percentage");
  a.equal(w.queue[0].status, "running"); a.equal(w.queue[0].progress, 0.4);
  // a message from another window is not the page's
  for (const fn of w.deps.window.listeners) fn({ source: {}, origin: w.deps.location.origin, data: { bgExport: 1, id: j.id, type: "progress", f: 0.9 } });
  a.equal(w.queue[0].progress, 0.4);
  // the button opens the progress window again
  w.api.showBgExportOverlay();
  a.equal(w.E.exportOverlay.classList.contains("hidden"), false);
  a.equal(w.E.exportTitle.textContent, "导出中 40%");
  w.api.hideBgExportOverlay();
  // she deletes a clip meanwhile; the file is the old timeline, and the toast says so
  w.live.clips.splice(1, 1);
  w.fromPage({ bgExport: 1, id: j.id, type: "done", result: { outputs: [{ ok: true, src: "/exports/p_master.mp4", file: "p_master.mp4" }] } });
  a.equal(w.queue[0].status, "done");
  a.deepEqual(w.saved, ["p_master.mp4"]);
  a.match(w.said.at(-1), /^导出完成：p_master\.mp4。这个文件是你 \d{2}:\d{2} 点「导出」时的样子，之后的改动不在里面。想带上新改动，请再导出一次。$/);
  a.equal(w.queue[0].note, w.said.at(-1));
  a.equal(w.E.btnExport.classList.contains("bg-exporting"), false, "the button is the Export button again");
  a.equal(w.frames[0].removed, true);
});

test("a background export's failure and its readback warnings are said as before, in the toast and the queue", () => {
  const w = editor();
  let j = w.api.startBgExport({ profile: "default" });
  w.fromPage({ bgExport: 1, id: j.id, type: "done", result: { error: "x", code: "EXPORT_AUDIO_FAILED" } });
  a.equal(w.queue[0].status, "failed"); a.equal(w.queue[0].code, "EXPORT_AUDIO_FAILED");
  a.equal(w.said.at(-1), "FAIL EXPORT_AUDIO_FAILED");
  j = w.api.startBgExport({ profile: "default" });
  const report = { ok: false, checks: [{ ok: false, code: "EXPORT_CLIP_SILENT" }] };
  w.fromPage({ bgExport: 1, id: j.id, type: "done", result: { outputs: [{ ok: true, src: "/exports/p.mp4", file: "p.mp4", report }] } });
  a.equal(w.queue[1].status, "done"); a.equal(w.queue[1].report, report, "the check's report is kept unchanged");
  a.equal(w.said.at(-1), "report\n导出完成：p.mp4。");
  a.equal(w.queue[1].note, "导出完成：p.mp4。");
});

test("unchanged timeline has no version sentence; warnings precede a changed version on a separate line", () => {
  const w = editor();
  let j = w.api.startBgExport({ profile: "default" });
  w.fromPage({ bgExport: 1, id: j.id, type: "done", result: { outputs: [{ ok: true, src: "/exports/p.mp4", file: "p.mp4" }] } });
  a.equal(w.said.at(-1), "导出完成：p.mp4。");
  a.equal(w.queue[0].note, w.said.at(-1));
  j = w.api.startBgExport({ profile: "default" });
  w.live.clips.pop();
  w.fromPage({ bgExport: 1, id: j.id, type: "done", result: { outputs: [{ ok: true, src: "/exports/p.mp4", file: "p.mp4", report: { ok: false, checks: [] } }] } });
  a.match(w.said.at(-1), /^report\n导出完成：p.mp4。这个文件是你 \d{2}:\d{2} 点「导出」/);
  a.equal(w.said.at(-1), "report\n" + w.queue[1].note);
});

test("Cancel in the progress window or the queue stops the background export", () => {
  const w = editor();
  const j = w.api.startBgExport({ profile: "default" });
  w.fromPage({ bgExport: 1, id: j.id, type: "ready" });
  w.api.bgExport.cancel();
  a.equal(w.posted.at(-1).type, "cancel");
  a.equal(w.E.exportTitle.textContent, "正在取消…");
  a.equal(w.E.btnCancelExport.disabled, true);
  w.fromPage({ bgExport: 1, id: j.id, type: "done", result: { error: "cancelled", cancelled: true } });
  a.equal(w.queue[0].status, "cancelled");
  a.equal(w.said.at(-1), "导出已取消，没有留下文件。");
  a.equal(w.E.exportOverlay.classList.contains("hidden"), true);
  a.equal(w.api.bgExportBusy(), false);
  // the wiring: the window's Cancel, the queue's Cancel, Esc and the button
  a.match(app, /\$\("btnCancelExport"\)\.addEventListener\("click", \(\) => \{\n  if \(bgExportShown\) \{ bgExport\.cancel\(\); return; \}/);
  a.match(app, /if \(e\.target\.dataset\.qBgcancel\) \{ bgExport\?\.cancel\(\); return; \}/);
  a.match(app, /\$\("btnExportHide"\)\?\.addEventListener\("click", hideBgExportOverlay\);/);
  a.match(app, /async function openExportSetup\(\) \{\n  if \(bgExportBusy\(\)\) \{ showBgExportOverlay\(\); return; \}/);
  a.match(html, /<button class="btn primary hidden" id="btnExportHide" data-i18n="own\.bg-keep-editing">/);
});

test("Export goes to the background unless this export has to stay in this window", () => {
  const w = editor();
  a.equal(w.api.fastExportBlocker(), null);
  w.state.compCtx = {}; a.equal(w.api.fastExportBlocker(), "COMP_OPEN");
  w.state.compCtx = null; w.deps.state.connected = false; a.equal(w.api.fastExportBlocker(), "NO_WORKER");
  const fn = app.slice(app.indexOf("function startChosenExport("), app.indexOf("\n}\n", app.indexOf("function startChosenExport(")));
  a.match(fn, /if \(bgExport && !fastExportBlocker\(\)\) startBgExport\(fastOpts\);\n\s+else fastExport\(fastOpts\);/);
  a.equal(BgExport.blocker({ bgRemove: true }), "BG_REMOVE");
  // the export page itself saves nothing and listens to nothing
  a.match(app, /if \(!state\.connected \|\| EXPORT_WORKER\) return;   \/\/ an export page holds a copy/);
  a.match(app, /async function saveNow\(\) \{\n  if \(EXPORT_WORKER\) return false;/);
  // the desktop window may frame its own origin (the export page) and nothing else
  a.match(read("desktop/main.js"), /const frames = details\.resourceType === "mainFrame" \? "'self'" : "'none'";/);
  a.match(html, /<script src="app\/bg-export\.js"><\/script>/);
});

test("the notes say what each engine does: only an engine that runs in the background says she can keep editing", () => {
  const zh = (k) => view.t("zh-CN", k), en = (k) => view.t("en", k);
  for (const [engine, info] of Object.entries(BgExport.ENGINES)) {
    for (const k of [info.note]) {
      if (info.background) {
        a.match(zh(k), /可以把进度收起来，接着剪，导出会继续做/, engine);
        a.match(zh(k), /点「导出」那一刻的样子/, engine + ": the copy");
        a.match(en(k), /hide the progress and keep editing; the export keeps going/, engine);
      } else {
        a.match(zh(k), /请别关掉 MontClip|请一直停在这个页面/, engine + " says to stay");
        a.doesNotMatch(zh(k), /可以关掉进度窗口/, engine);
        a.doesNotMatch(en(k), /keep editing/i, engine);
      }
    }
  }
  const here = BgExport.noteKey("fast", "BG_REMOVE");
  a.match(zh(here), /（用了 AI 抠像）/);
  a.doesNotMatch(zh(here), /复合片段/);
  a.match(zh(BgExport.noteKey("fast", "COMP_OPEN")), /（打开着复合片段）/);
  a.match(zh(here), /请别关掉 MontClip/);
  a.equal(BgExport.noteKey("fast", null), "term.engine-fast-note");
  // the old promise is gone everywhere
  for (const f of ["shared/ui-terms.js", "shared/ui-preferences.js", "app/index.html", "app/app.js"]) {
    a.doesNotMatch(read(f), /切到别的页面也不影响|切到别的页面也会继续导出|Keeps rendering if you switch tabs/, f);
  }
});

test("JJ progress copy is permanent and bilingual", () => {
  a.equal(view.t('zh-CN', 'own.bg-keep-editing'), '收起，接着剪');
  a.equal(view.t('en', 'own.bg-keep-editing'), 'Hide, keep editing');
  a.equal(view.t('en', 'own.bg-progress-note'), 'The export keeps going. To check on it, click "Exporting" at the top.');
  a.equal(view.t('en', 'own.bg-export-version-changed', { file: 'p.mp4', time: '15:02' }), 'Exported p.mp4. This file is how things were at 15:02, when you clicked Export. Edits made after that are not in it. To include them, export again.');
});

test("both languages prepare until a real progress message, not a ready or phase message", () => {
  for (const [language, preparing, progressed] of [['zh-CN','准备导出…','导出中 50%'],['en','Preparing export…','Exporting 50%']]) {
    const w = editor(language), j = w.api.startBgExport({profile:'default'});
    const assertPreparing = () => { a.equal(w.E.btnExport.textContent, preparing); a.equal(w.E.exportTitle.textContent, preparing); };
    assertPreparing();
    for (const message of [{type:'ready'},{type:'phase',phase:'mixing'},{type:'session',sess:'s1'},{type:'phase',phase:'rendering'},{type:'progress',f:NaN}]) {
      w.fromPage({bgExport:1,id:j.id,...message}); assertPreparing();
    }
    w.fromPage({bgExport:1,id:j.id,type:'progress',f:0.5});
    a.equal(w.E.btnExport.textContent, progressed); a.equal(w.E.exportTitle.textContent, progressed);
    w.fromPage({bgExport:1,id:j.id,type:'phase',phase:'encoding'});
    a.equal(w.E.exportTitle.textContent, progressed);
    w.fromPage({bgExport:1,id:j.id,type:'done',result:{cancelled:true}});
    const next=w.api.startBgExport({profile:'default'}); assertPreparing();
    w.fromPage({bgExport:1,id:next.id,type:'done',result:{cancelled:true}});
  }
});

test("English completion also omits the version when unchanged and separates warnings when edited", () => {
  const w = editor("en");
  let j = w.api.startBgExport({ profile: "default" });
  const output = { ok: true, src: "/exports/p.mp4", file: "p.mp4" };
  w.fromPage({ bgExport: 1, id: j.id, type: "done", result: { outputs: [output] } });
  a.equal(w.said.at(-1), "Exported p.mp4.");
  j = w.api.startBgExport({ profile: "default" });
  w.live.clips.pop();
  w.fromPage({ bgExport: 1, id: j.id, type: "done", result: { outputs: [{ ...output, report: { ok: false, checks: [] } }] } });
  a.match(w.said.at(-1), /^report\nExported p.mp4\. This file is how things were at \d{2}:\d{2}, when you clicked Export\. Edits made after that are not in it\. To include them, export again\.$/);
  a.equal(w.said.at(-1), "report\n" + w.queue[1].note);
  a.match(read("app/style.css"), /#toast\s*\{\s*white-space: pre-line;/);
  a.ok(app.indexOf('(q.report ? `<span class="xq-report') < app.indexOf('(q.note ? `<span class="xq-note'), "queue warning precedes completion");
});
