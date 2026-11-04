/* One engine, two shells (docs/decisions/2026-11-04-montclip-cindy-plugin.md): what the Cindy plugin needs
   from the engine and the standalone app keeps — the tools as a module, commands for the open editor tab,
   its undo history kept per project, one writer per data folder, and a hard-linked import that never
   changes the user's original. Only generated files; no recordings, no keys. */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawn, spawnSync } = require("node:child_process");
const { ROOT, makeDataDir, startServer, startMcp, bundledH264 } = require("./helpers");
const WriterLock = require("../writer-lock");
const { createUndoStacks, MAX_STEPS } = require("../undo-stacks");

const json = (r) => r.json();
const post = (url, body, method = "POST") => fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

/* ── mcp-server.js as a module ── */

test("mcp-server.js required by another shell hands over its tools and leaves stdin alone", (t) => {
  const dir = makeDataDir(t);
  const code = `const m = require(${JSON.stringify(path.join(ROOT, "mcp-server.js"))});
    m.callTool("fablecut_get_project", { compact: true }).then((r) => {
      process.stdout.write(JSON.stringify({ tools: m.TOOLS.length, call: typeof m.callTool, ensure: typeof m.ensureUIServer,
        names: m.TOOLS.map((x) => x.name), text: typeof r === "string" ? r : JSON.stringify(r) }));
    });`;
  // stdin stays open (a pipe nobody closes): a module that read it would keep the process alive or eat the input
  const r = spawnSync(process.execPath, ["-e", code], { cwd: ROOT, input: "not json\n",
    env: { ...process.env, FABLECUT_DATA_DIR: dir, FABLECUT_NO_AUTOSTART: "1", FABLECUT_NO_FS_WATCH: "1" }, encoding: "utf8", timeout: 20000 });
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  assert.equal(out.call, "function");
  assert.equal(out.ensure, "function");
  assert.ok(out.tools >= 20 && out.names.includes("fablecut_patch_project"));
  assert.match(out.text, /Test Project/);
});

test("mcp-server.js run as a program still speaks MCP on stdio", async (t) => {
  const mcp = startMcp(t, makeDataDir(t), { FABLECUT_NO_AUTOSTART: "1" });
  const res = await mcp.request("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "t", version: "1" } });
  assert.equal(res.result.serverInfo.name, "fablecut");
});

/* ── /api/ui/command: the open editor tab runs undo / redo / seek / state ── */

/** A stand-in for an editor tab: answers each ui-command on /api/ui/command/result. */
async function fakeTab(t, base, answer) {
  const ac = new AbortController();
  t.after(() => ac.abort());
  const res = await fetch(base + "/api/events", { signal: ac.signal });
  const seen = [];
  (async () => {
    const dec = new TextDecoder();
    let buf = "";
    try {
      for await (const chunk of res.body) {
        buf += dec.decode(chunk, { stream: true });
        let i;
        while ((i = buf.indexOf("\n\n")) >= 0) {
          const block = buf.slice(0, i); buf = buf.slice(i + 2);
          if (!/^event: ui-command$/m.test(block)) continue;
          const c = JSON.parse(/^data: (.*)$/m.exec(block)[1]);
          seen.push(c);
          await post(base + "/api/ui/command/result", { id: c.id, ...answer(c) });
        }
      }
    } catch { /* aborted */ }
  })();
  return seen;
}

test("ui commands reach the open tab and its answer comes back", async (t) => {
  const { base } = await startServer(t, makeDataDir(t), { FABLECUT_NO_FS_WATCH: "1" });
  let undo = 2;
  const seen = await fakeTab(t, base, (c) => {
    if (c.cmd === "undo") undo--;
    return { ok: true, cmd: c.cmd, undo, time: c.t ?? 0 };
  });
  const a = await json(await post(base + "/api/ui/command", { cmd: "undo" }));
  assert.deepEqual([a.ok, a.cmd, a.undo], [true, "undo", 1]);
  const s = await json(await post(base + "/api/ui/command", { cmd: "seek", t: 95 }));
  assert.equal(s.time, 95);
  assert.deepEqual(seen.map((c) => c.cmd), ["undo", "seek"]);
  assert.equal(seen[1].t, 95);
});

test("ui commands are checked, and without a tab the answer is NO_EDITOR", async (t) => {
  const { base } = await startServer(t, makeDataDir(t), { FABLECUT_NO_FS_WATCH: "1" });
  assert.equal((await post(base + "/api/ui/command", { cmd: "format-disk" })).status, 400);
  assert.equal((await post(base + "/api/ui/command", { cmd: "seek" })).status, 400);
  assert.equal((await post(base + "/api/ui/command", { cmd: "seek", t: -1 })).status, 400);
  const late = await post(base + "/api/ui/command/result", { id: "nobody-asked" });
  assert.equal(late.status, 409);
  assert.equal((await late.json()).taken, false);
  const r = await post(base + "/api/ui/command", { cmd: "state" });
  assert.equal(r.status, 409);
  assert.equal((await r.json()).code, "NO_EDITOR");
});

/* ── the undo history, kept per project ── */

test("undo stacks: kept per project, trimmed to the editor's 100 steps, the playhead alone on leave", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "montclip-undo-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const u = createUndoStacks({ dir });
  assert.equal(u.get("p_a"), null);
  const steps = Array.from({ length: MAX_STEPS + 5 }, (_, i) => JSON.stringify({ clips: [{ id: "c" + i }] }));
  assert.deepEqual(u.put("p_a", { sequence: null, revision: 7, current: "{}", undo: steps, redo: ["{}", 3], time: 12.5 }),
    { undo: MAX_STEPS, redo: 1, revision: 7 });
  u.put("p_b", { revision: 1, undo: ["{}"], redo: [] });
  const a = u.get("p_a");
  assert.equal(a.undo.length, MAX_STEPS);
  assert.equal(a.undo[0], steps[5], "the oldest steps go first");
  assert.equal(a.time, 12.5);
  assert.equal(u.get("p_b").undo.length, 1, "each project its own");
  assert.equal(u.setTime("p_a", 40), true);
  assert.equal(u.get("p_a").time, 40);
  assert.equal(u.get("p_a").undo.length, MAX_STEPS, "the playhead alone leaves the steps");
  assert.equal(u.setTime("p_none", 1), false);
  assert.throws(() => u.get("../x"), /project id/);
  assert.throws(() => u.put("a b", {}), /project id/);
  u.remove("p_a");
  assert.equal(u.get("p_a"), null);
});

test("undo stacks over HTTP: written, read back, the playhead kept on leave, removed with the project", async (t) => {
  const dir = makeDataDir(t);
  const { base } = await startServer(t, dir, { FABLECUT_NO_FS_WATCH: "1" });
  assert.deepEqual(await json(await fetch(base + "/api/ui/undo-stack?project=default")), { stack: null });
  const put = await post(base + "/api/ui/undo-stack?project=default", { revision: 3, current: '{"clips":[]}', undo: ['{"clips":[1]}'], redo: [], time: 4 }, "PUT");
  assert.equal(put.status, 200);
  assert.deepEqual(await put.json(), { undo: 1, redo: 0, revision: 3 });
  assert.equal((await json(await post(base + "/api/ui/undo-stack/time?project=default", { t: 88 }))).saved, true);
  const got = (await json(await fetch(base + "/api/ui/undo-stack?project=default"))).stack;
  assert.deepEqual([got.revision, got.undo, got.time, got.current], [3, ['{"clips":[1]}'], 88, '{"clips":[]}']);
  assert.ok(fs.existsSync(path.join(dir, "analysis", "undo", "default.json")));
  assert.equal((await fetch(base + "/api/ui/undo-stack?project=..%2Fproject")).status, 400);
  assert.equal((await fetch(base + "/api/ui/undo-stack?project=default", { method: "DELETE" })).status, 405);

  // a project's undo history goes when the project is deleted
  const made = await json(await post(base + "/api/projects", { action: "new", name: "Second", open: false }));
  await post(base + `/api/ui/undo-stack?project=${made.id}`, { revision: 1, undo: ["{}"] }, "PUT");
  assert.ok(fs.existsSync(path.join(dir, "analysis", "undo", made.id + ".json")));
  assert.equal((await post(base + "/api/projects", { action: "archive", id: made.id })).status, 200);
  assert.equal((await post(base + "/api/projects", { action: "delete", id: made.id })).status, 200);
  assert.ok(!fs.existsSync(path.join(dir, "analysis", "undo", made.id + ".json")));
});

/* ── one writer per data folder ── */

test("writer lock: one holder; a lock left by a process that is gone is taken over", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "montclip-lock-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  // a live holder: another process
  const other = spawn(process.execPath, ["-e", "setTimeout(() => {}, 60000)"], { stdio: "ignore" });
  t.after(() => other.kill());
  fs.writeFileSync(path.join(dir, WriterLock.LOCK_NAME), JSON.stringify({ pid: other.pid, shell: "desktop", port: 4321 }));
  assert.throws(() => WriterLock.acquire(dir, { shell: "cindy" }),
    (e) => e.code === "DATA_DIR_IN_USE" && /desktop, pid \d+ on port 4321/.test(e.message));
  assert.equal(WriterLock.holder(dir).shell, "desktop");
  // its process is gone: the lock is stale
  other.kill();
  await new Promise((r) => other.once("exit", r));
  const lock = WriterLock.acquire(dir, { shell: "cindy" });
  lock.update({ port: 5555 });
  assert.deepEqual([WriterLock.holder(dir).pid, WriterLock.holder(dir).shell, WriterLock.holder(dir).port], [process.pid, "cindy", 5555]);
  lock.release();
  assert.equal(WriterLock.holder(dir), null);
  assert.ok(!fs.existsSync(path.join(dir, WriterLock.LOCK_NAME)));
});

test("a second engine on the same data folder refuses to start and names the first", async (t) => {
  const dir = makeDataDir(t);
  const first = await startServer(t, dir, { FABLECUT_NO_FS_WATCH: "1", MONTCLIP_SHELL: "desktop" });
  const holder = WriterLock.holder(dir);
  assert.equal(holder.shell, "desktop");
  assert.equal(holder.port, first.port);
  const second = spawnSync(process.execPath, [path.join(ROOT, "server.js")], { cwd: ROOT, encoding: "utf8", timeout: 20000,
    env: { ...process.env, PORT: "0", HOST: "127.0.0.1", FABLECUT_DATA_DIR: dir, FABLECUT_NO_FS_WATCH: "1", MONTCLIP_SHELL: "cindy" } });
  assert.notEqual(second.status, 0);
  assert.match(second.stderr, /Another MontClip \(desktop, pid \d+ on port \d+\) is already editing/);
  assert.equal((await fetch(first.base + "/api/project")).status, 200, "the first one keeps going");
});

/* ── hard-linked import ── */

const sha = (f) => crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex");

test("import link:true hard-links a local file; the default is still a copy", async (t) => {
  const dir = makeDataDir(t);
  const srcDir = fs.mkdtempSync(path.join(os.tmpdir(), "montclip-src-"));
  t.after(() => fs.rmSync(srcDir, { recursive: true, force: true }));
  const src = path.join(srcDir, "tone.wav");
  // a generated 0.1 s silent WAV: header + zeros (no recording)
  const pcm = Buffer.alloc(4800 * 2), h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + pcm.length, 4); h.write("WAVEfmt ", 8); h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(48000, 24); h.writeUInt32LE(96000, 28);
  h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write("data", 36); h.writeUInt32LE(pcm.length, 40);
  fs.writeFileSync(src, Buffer.concat([h, pcm]));
  const before = sha(src);
  const mcp = startMcp(t, dir, { FABLECUT_NO_AUTOSTART: "1", FABLECUT_NO_FS_WATCH: "1" });
  const linked = await mcp.callTool("fablecut_import_media", { path: src, link: true });
  assert.ok(!linked.isError, linked.text);
  const copied = await mcp.callTool("fablecut_import_media", { path: src });
  assert.ok(!copied.isError, copied.text);
  const files = fs.readdirSync(path.join(dir, "media")).filter((f) => f.endsWith(".wav")).sort();
  assert.deepEqual(files, ["tone.wav", "tone_1.wav"]);
  const ino = (f) => fs.statSync(f, { bigint: true }).ino;
  assert.equal(ino(path.join(dir, "media", "tone.wav")), ino(src), "link:true is the same file");
  assert.notEqual(ino(path.join(dir, "media", "tone_1.wav")), ino(src), "the default is a copy");
  assert.equal(sha(src), before);
});

test("faststart on a hard-linked recording writes a new file: the user's original is never changed", { skip: bundledH264() ? false : "needs an H.264 encoder in the bundled ffmpeg" }, async (t) => {
  const FF = require("../ffmpeg-path");
  const { maybeFaststart } = require("../import-url");
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "montclip-fs-"));
  t.after(() => fs.rmSync(work, { recursive: true, force: true }));
  const original = path.join(work, "original.mp4");
  const enc = bundledH264();
  // a generated test pattern, moov at the end (no +faststart)
  const r = spawnSync(FF.path("ffmpeg"), ["-v", "error", "-f", "lavfi", "-i", "testsrc2=s=320x180:r=30:d=1",
    "-c:v", enc.encoder, "-pix_fmt", enc.pix, original], { timeout: 60000 });
  assert.equal(r.status, 0);
  const media = path.join(work, "media"); fs.mkdirSync(media);
  const linked = path.join(media, "original.mp4");
  fs.linkSync(original, linked);
  const before = sha(original);
  const out = await maybeFaststart(linked);
  assert.equal(sha(original), before, "the original's bytes are untouched");
  if (out.optimized) assert.notEqual(fs.statSync(linked, { bigint: true }).ino, fs.statSync(original, { bigint: true }).ino,
    "the optimized file replaced the link, not the linked bytes");
});

/* ── the editor side (app.js, sliced out like undo-outside.test.js): keeping and restoring the stack, ui commands ── */

function editorWorld({ clips, stack = null, sequence = "main" }) {
  const { SRC } = require("./timeline-sandbox");
  const i = SRC.indexOf("function undoSnapshot()"), j = SRC.indexOf("function defaultTrackFor(", i);
  const project = { clips, markers: [], comps: [], media: [], revision: 5 };
  const runtime = { undo: [], redo: [], projectId: "p_one", projectGen: 1 };
  const state = { connected: true, compCtx: null, time: 0 };
  const sent = [], toasts = [];
  const fetch = async (url, opts = {}) => {
    sent.push({ url, method: opts.method || "GET", body: opts.body ? JSON.parse(opts.body) : null });
    return { json: async () => ({ stack }) };
  };
  const env = {
    project, runtime, state, fetch, toast: (m) => toasts.push(m), uiText: (k) => require("../ui-preferences").t("zh-CN", k), pruneSelection() {}, scheduleSave() {}, renderInspector() {},
    SeqLib: { others: () => [], activeId: () => sequence, find: () => null }, seqRoot: () => project,
    reloadMediaSource() {}, renderBin() {}, scheduleOfflineCheck() {},
    setTime: (t) => { state.time = t; }, projDur: () => 600,
  };
  const names = Object.keys(env);
  const fns = new Function(...names, `${SRC.slice(i, j)}
    return { undoSnapshot, pushUndo, undo, redo, persistUndoSoon, restoreUndoStack, onUiCommand, outsideEditStep };`)(...names.map((k) => env[k]));
  return { ...fns, project, runtime, state, sent, toasts };
}
const tclip = (id, text) => ({ id, kind: "text", track: "V1", start: 0, duration: 3, props: { text } });

test("editor: the stack is written after a save, for this project, with the timeline it belongs to", async () => {
  const w = editorWorld({ clips: [tclip("a", "x")] });
  w.pushUndo(); w.project.clips[0].props = { text: "y" };
  w.state.time = 12;
  w.persistUndoSoon(); w.persistUndoSoon();   // debounced: one write
  await new Promise((r) => setTimeout(r, 400));
  const puts = w.sent.filter((s) => s.method === "PUT");
  assert.equal(puts.length, 1);
  assert.equal(puts[0].url, "/api/ui/undo-stack?project=p_one");
  assert.deepEqual([puts[0].body.undo.length, puts[0].body.time, puts[0].body.sequence, puts[0].body.revision], [1, 12, "main", 5]);
  assert.equal(puts[0].body.current, w.undoSnapshot());
});

test("editor: a reloaded page gets its undo steps and playhead back, and undo works on them", async () => {
  const before = JSON.stringify({ clips: [tclip("a", "x")], markers: [], comps: [] });
  const after = JSON.stringify({ clips: [tclip("a", "y")], markers: [], comps: [] });
  const w = editorWorld({ clips: [tclip("a", "y")], stack: { sequence: "main", current: after, undo: [before], redo: [], time: 700 } });
  assert.equal(await w.restoreUndoStack(), true);
  assert.equal(w.runtime.undo.length, 1);
  assert.equal(w.state.time, 600, "the playhead, kept inside the timeline");
  w.undo();
  assert.equal(w.project.clips[0].props.text, "x");
});

test("editor: a change made while no tab was open becomes an undo step of its own", async () => {
  const older = JSON.stringify({ clips: [tclip("a", "x")], markers: [], comps: [] });
  const left = JSON.stringify({ clips: [tclip("a", "y")], markers: [], comps: [] });
  // the tab left the timeline at "y"; an agent then changed it to "agent"
  const w = editorWorld({ clips: [tclip("a", "agent")], stack: { sequence: "main", current: left, undo: [older], redo: [], time: 0 } });
  await w.restoreUndoStack();
  assert.equal(w.runtime.undo.length, 2);
  w.undo();
  assert.equal(w.project.clips[0].props.text, "y", "the agent's change is taken back first");
  w.undo();
  assert.equal(w.project.clips[0].props.text, "x");
});

test("editor: no restore into a stack that has steps, or for another sequence", async () => {
  const snap = JSON.stringify({ clips: [], markers: [], comps: [] });
  const other = editorWorld({ clips: [], sequence: "seq_v9", stack: { sequence: "main", current: snap, undo: [snap], redo: [] } });
  assert.equal(await other.restoreUndoStack(), false);
  assert.equal(other.runtime.undo.length, 0);
  const busy = editorWorld({ clips: [], stack: { sequence: "main", current: snap, undo: [snap, snap], redo: [] } });
  busy.pushUndo();
  assert.equal(await busy.restoreUndoStack(), false);
  assert.equal(busy.runtime.undo.length, 1);
});

test("editor: ui commands run the tab's own undo and answer with its state", async () => {
  const w = editorWorld({ clips: [tclip("a", "x")] });
  w.project.clips.length = 1;
  w.onUiCommand(JSON.stringify({ id: "1", cmd: "undo" }));
  w.pushUndo(); w.project.clips[0].props = { text: "y" };
  w.onUiCommand(JSON.stringify({ id: "2", cmd: "undo" }));
  w.onUiCommand(JSON.stringify({ id: "3", cmd: "seek", t: 42 }));
  w.onUiCommand(JSON.stringify({ id: "4", cmd: "nope" }));
  w.onUiCommand("not json");
  const answers = w.sent.filter((s) => s.url === "/api/ui/command/result").map((s) => s.body);
  assert.deepEqual(answers.map((a) => [a.id, a.ok, a.code ?? null]), [["1", false, "NOTHING_TO_UNDO"], ["2", true, null], ["3", true, null], ["4", false, "UNKNOWN_CMD"]]);
  assert.equal(w.project.clips[0].props.text, "x");
  assert.deepEqual([answers[1].undo, answers[1].redo], [0, 1]);
  assert.equal(answers[2].time, 42);
});

/* VV's offscreen review of #111 (fe865b7): split a recording at 60 s, delete the second half, reload. Loading relinks
   the picture to its audio stems with fresh linkGroup ids (edit-ops.js relinkClips), so the timeline the stack was
   kept for looked "changed from outside": the reload added an empty undo step with an English toast. */
function recordingWorld() {
  const EditOps = require("../edit-ops");
  const clips = [
    { id: "v1", mediaId: "m1", kind: "video", track: "V1", start: 0, in: 0, duration: 120, props: { volume: 0 } },
    { id: "a1", mediaId: "m1", kind: "audio", track: "A1", start: 0, in: 0, duration: 120, props: { audioChannel: 0, pan: -1 } },
    { id: "a2", mediaId: "m1", kind: "audio", track: "A2", start: 0, in: 0, duration: 120, props: { audioChannel: 1, pan: 1 } },
  ];
  const w = editorWorld({ clips });
  w.project.media = [{ id: "m1", name: "rec.mp4", kind: "video", src: "/media/rec.mp4", duration: 120 }];
  let n = 0;
  const ops = () => EditOps.forDoc(w.project, { uid: () => "u" + ++n + Math.random().toString(36).slice(2, 6) });
  ops().relinkClips();
  return { w, ops };
}
/** The editor's split at 60 s and delete of the right half (both linked stems go with it), each one undo step. */
function splitAndDelete({ w, ops }) {
  w.pushUndo(); const o = ops(); o.splitAt(60); o.relinkClips();
  w.pushUndo(); ops().removeClips(w.project.clips.filter((c) => c.start >= 59));
  assert.deepEqual(w.project.clips.map((c) => [c.track, c.start, c.duration]).sort(), [["A1", 0, 60], ["A2", 0, 60], ["V1", 0, 60]]);
}
/** What the tab kept (persistUndoSoon's body), then a fresh page loading the saved document: relinkClips runs again. */
function reload({ w, ops }, change) {
  const kept = { sequence: "main", revision: w.project.revision, current: w.undoSnapshot(), media: w.project.media, undo: w.runtime.undo.slice(), redo: w.runtime.redo.slice(), time: 0 };
  const saved = JSON.parse(JSON.stringify(w.project.clips));
  const fresh = editorWorld({ clips: saved, stack: kept });
  fresh.project.media = w.project.media;
  if (change) { change(fresh.project); fresh.project.revision = kept.revision + 1; }
  require("../edit-ops").forDoc(fresh.project, { uid: () => "r" + Math.random().toString(36).slice(2, 8) }).relinkClips();
  return { fresh, kept };
}

test("a reload adds no undo step: the first Ctrl+Z after it brings the deleted half back (VV #111, linked stems)", async () => {
  const rec = recordingWorld();
  splitAndDelete(rec);
  const { fresh, kept } = reload(rec);
  assert.notEqual(fresh.undoSnapshot(), kept.current, "loading gave the stems new linkGroup ids (the trigger)");
  await fresh.restoreUndoStack();
  assert.equal(fresh.runtime.undo.length, kept.undo.length, "as many steps after the reload as before it");
  fresh.undo();
  assert.deepEqual(fresh.project.clips.filter((c) => c.track === "V1").map((c) => [c.start, c.duration]).sort((a, b) => a[0] - b[0]), [[0, 60], [60, 60]],
    "the first Ctrl+Z brings the second half back");
  assert.deepEqual(fresh.toasts, [], "no outside-edit toast");
});

test("a real change made while the tab was away is still its own undo step after the reload", async () => {
  const rec = recordingWorld();
  splitAndDelete(rec);
  const { fresh, kept } = reload(rec, (p) => { for (const c of p.clips) c.duration = 30; });   // an agent trimmed it to 30 s
  await fresh.restoreUndoStack();
  assert.equal(fresh.runtime.undo.length, kept.undo.length + 1);
  fresh.undo();
  assert.deepEqual(fresh.project.clips.map((c) => c.duration), [60, 60, 60], "the first Ctrl+Z takes back the outside change");
  assert.equal(fresh.toasts.at(-1), "撤销的这一步是 AI 或另一个窗口改的，不是你在这里改的。撤错了，点「重做」就能改回来。", "and says so in Chinese");
});

test("an outside write that only relinks the stems (new linkGroup ids) is not an undo step", () => {
  const rec = recordingWorld();
  const before = rec.w.undoSnapshot();
  rec.ops().relinkClips();
  assert.notEqual(rec.w.undoSnapshot(), before);
  assert.equal(rec.w.outsideEditStep(before, rec.w.undoSnapshot()), null);
});

test("the outside-edit toast: JJ's final words, in both languages", () => {
  const UI = require("../ui-preferences");
  assert.equal(UI.t("zh-CN", "own.undo-outside"), "撤销的这一步是 AI 或另一个窗口改的，不是你在这里改的。撤错了，点「重做」就能改回来。");
  assert.equal(UI.t("en", "own.undo-outside"), "Undid a change made by the AI or in another window, not here. If that was a mistake, click Redo to bring it back.");
  assert.doesNotMatch(require("node:fs").readFileSync(require("node:path").join(ROOT, "app.js"), "utf8"), /Undid a change made outside this tab/);
});
