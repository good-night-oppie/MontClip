/* Transcripts over the REST API and fablecut_transcribe. The test plays the
   editor tab (an SSE reader that claims the transcribe job and saves a
   transcript, as the real tab does once the local server has transcribed), so the protocol,
   the timeline mapping, find and cut are covered without a browser or a model.
   The engine itself is covered by asr-offline.test.js and desktop/asr-smoke.cjs. */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { makeDataDir, readProject, seedProject, startServer, startMcp } = require("./helpers");

/* An open editor tab, as far as the server can tell: an SSE subscriber. */
function fakeTab(t, base) {
  const tickets = [], waiters = [], events = [];
  let buf = "";
  let connected;
  const ready = new Promise(resolve => { connected = resolve; });
  const req = http.get(base + "/api/events", (res) => {
    res.setEncoding("utf8");
    res.on("data", (chunk) => {
      connected(); // the server wrote its SSE greeting after registering this tab
      buf += chunk;
      let i;
      while ((i = buf.indexOf("\n\n")) >= 0) {
        const block = buf.slice(0, i);
        buf = buf.slice(i + 2);
        const ev = /^event: (.*)$/m.exec(block)?.[1];
        const data = /^data: (.*)$/m.exec(block)?.[1];
        if (ev === "transcript") events.push(JSON.parse(data));
        if (ev !== "export") continue;
        const ticket = JSON.parse(data);
        const w = waiters.shift();
        if (w) { clearTimeout(w.timer); w.resolve(ticket); } else tickets.push(ticket);
      }
    });
  });
  req.on("error", () => {});
  t.after(() => { req.destroy(); for (const w of waiters) clearTimeout(w.timer); });
  return {
    events,
    next: () => tickets.length ? Promise.resolve(tickets.shift()) : new Promise((resolve, reject) => {
      const w = {resolve}; w.timer = setTimeout(() => reject(new Error('no transcription ticket received by the connected tab')), 10000); waiters.push(w);
    }),
    connected: async () => {
      let timer;
      try { await Promise.race([ready, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('SSE tab did not connect')), 10000); })]); }
      finally { clearTimeout(timer); }
    },
  };
}
const post = (base, p, body) => fetch(base + p, { method: "POST", body: body && JSON.stringify(body) })
  .then(async (r) => ({ status: r.status, body: await r.json() }));
const get = (base, p) => fetch(base + p).then(async (r) => ({ status: r.status, body: await r.json() }));

const postOK = async (...args) => { const r = await post(...args); assert.equal(r.status, 200, JSON.stringify({route:args[1],...r})); return r; };

const WORDS = [["So", 1, 1.2], ["um,", 1.4, 1.7], ["this", 2, 2.3], ["is", 2.3, 2.4], ["great.", 2.5, 3]];
function project() {
  return seedProject({
    revision: 3, fps: 10,
    media: [{ id: "m_a", name: "a.wav", kind: "audio", src: "/media/a.wav", duration: 10 },
      { id: "m_m", name: "music.wav", kind: "audio", src: "/media/music.wav", duration: 10 }],
    clips: [{ id: "c_a", kind: "audio", mediaId: "m_a", track: "A1", start: 0, in: 0, duration: 10 },
      { id: "c_m", kind: "audio", mediaId: "m_m", track: "A2", start: 0, in: 0, duration: 10 }],
    lockedTracks: ["A2"],
  });
}
const boot = async (t) => {
  const dir = makeDataDir(t, project());
  fs.mkdirSync(path.join(dir, "media"), { recursive: true });
  fs.writeFileSync(path.join(dir, "media", "a.wav"), Buffer.alloc(4096));
  fs.writeFileSync(path.join(dir, "media", "music.wav"), Buffer.alloc(4096));
  const srv = await startServer(t, dir, { FABLECUT_NO_FS_WATCH: "1", FABLECUT_CHROME: path.join(dir, "no-such-browser") });
  return { dir, ...srv };
};

test('MC-08: tool timeout reports incomplete work and the readable partial transcript path', async t => {
  const { dir, base, port } = await boot(t), tab = fakeTab(t, base);
  await tab.connected();
  const mcp = startMcp(t, dir, { FABLECUT_PORT: String(port) });
  const started = JSON.parse((await mcp.callTool('fablecut_transcribe', { mediaIds: ['m_a'], timeout: 0.1, wait_ms: 0, idempotency_key: 'timeout' })).text);
  assert.equal(started.status, 'running');
  const ticket = await tab.next();
  await postOK(base, '/api/export/job/claim?id=' + ticket.id);
  await postOK(base, '/api/transcript?src=/media/a.wav', { duration: 10, words: WORDS, spans: [[0, 3]] });
  const result = JSON.parse((await mcp.callTool('fablecut_transcribe', { taskId: started.taskId, wait_ms: 5000 })).text);
  assert.equal(result.status, 'failed'); assert.match(result.error, /没听完/);
  assert.equal(result.saved.length, 1);
  assert.match(result.saved[0], /^analysis\/transcripts\//);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, result.saved[0]), 'utf8')).words, WORDS);
  const again = JSON.parse((await mcp.callTool('fablecut_transcribe', { mediaIds: ['m_a'], timeout: 0.1, wait_ms: 0, idempotency_key: 'timeout' })).text);
  assert.deepEqual(again, result);
});

test('MC-04: captions finish in their original project after another task opens a project', async t => {
  const { dir, base, port } = await boot(t), tab = fakeTab(t, base);
  await tab.connected();
  const origin = (await get(base, '/api/projects')).body.active;
  const mcp = startMcp(t, dir, { FABLECUT_PORT: String(port) });
  const started = JSON.parse((await mcp.callTool('fablecut_captions', { clipIds: ['c_a'], wait_ms: 0, idempotency_key: 'captions-a' })).text);
  const ticket = await tab.next();
  await postOK(base, '/api/export/job/claim?id=' + ticket.id);
  const other = await postOK(base, '/api/projects', { action: 'new', name: 'Other task' });
  assert.equal(other.status, 200);
  await postOK(base, '/api/transcript?src=/media/a.wav&track=0', { duration: 10, words: WORDS });
  await postOK(base, '/api/export/job/report?id=' + ticket.id, { status: 'done', result: { done: [{ src: '/media/a.wav', words: 5 }] } });
  const receipt = path.join(dir, 'analysis', 'tool-tasks', started.taskId + '.json');
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline && JSON.parse(fs.readFileSync(receipt, 'utf8')).status === 'running') await new Promise(r => setTimeout(r, 25));
  const terminal = JSON.parse(fs.readFileSync(receipt, 'utf8'));
  assert.equal(terminal.status, 'complete', terminal.error);
  assert.equal(readProject(dir).name, 'Other task');
  assert.equal(readProject(dir).clips.length, 0);
  assert.ok(JSON.parse(fs.readFileSync(path.join(dir, 'projects', origin, 'project.json'), 'utf8')).clips.some(c => c.kind === 'text'));
  // Direct MCP callers must return to the owning project before querying; the plugin supplies its captured scope.
  await postOK(base, '/api/projects', { action: 'open', id: origin });
  const result = JSON.parse((await mcp.callTool('fablecut_captions', { taskId: started.taskId, wait_ms: 5000 })).text);
  assert.equal(result.status, 'complete', result.error);
  assert.ok(readProject(dir).clips.some(c => c.kind === 'text'));
  const pj = require('../server/projects').createProjects({ dataDir: dir, projectFile: path.join(dir, 'project.json'), libraryDir: path.join(dir, 'library') });
  const second = pj.list().projects.find(p => p.name === 'Other task');
  assert.equal(pj.readDoc(second.id).clips.length, 0);
});

test("transcripts are saved, read, listed and deleted per file", async (t) => {
  const { dir, base } = await boot(t);
  const tab = fakeTab(t, base);
  await tab.connected();
  assert.deepEqual((await post(base, "/api/transcript/status", { srcs: ["/media/a.wav", "/media/none.wav"] })).body,
    { status: { "/media/a.wav": false, "/media/none.wav": null } }, "false = none yet, null = no such file");
  assert.deepEqual((await get(base, "/api/transcript?src=/media/a.wav")).body, { transcript: null });
  assert.equal((await get(base, "/api/transcript?src=/media/none.wav")).status, 404);

  assert.equal((await post(base, "/api/transcript?src=/media/a.wav", { words: [["x", "late", 1]] })).status, 400, "a malformed transcript is refused");
  assert.equal((await post(base, "/api/transcript?src=/media/none.wav", { words: [] })).status, 404);
  const saved = await post(base, "/api/transcript?src=/media/a.wav", { model: "base", language: "en", duration: 10, words: WORDS });
  assert.deepEqual(saved.body, { src: "/media/a.wav", words: 5 });

  const back = (await get(base, "/api/transcript?src=/media/a.wav")).body.transcript;
  assert.deepEqual(back.words, WORDS);
  assert.equal(back.src, "/media/a.wav");
  const info = (await post(base, "/api/transcript/status", { srcs: ["/media/a.wav"] })).body.status["/media/a.wav"];
  assert.equal(info.words, 5);
  assert.equal(info.language, "en");
  assert.ok(fs.readdirSync(path.join(dir, "analysis", "transcripts")).length === 1);
  for (let i = 0; i < 40 && tab.events.length < 1; i++) await new Promise((r) => setTimeout(r, 25));
  assert.deepEqual(tab.events[0], { src: "/media/a.wav" }, "open tabs hear about it");

  // a new version of the file has no transcript; saving one drops the old
  fs.writeFileSync(path.join(dir, "media", "a.wav"), Buffer.alloc(5000));
  assert.deepEqual((await get(base, "/api/transcript?src=/media/a.wav")).body, { transcript: null });
  await post(base, "/api/transcript?src=/media/a.wav", { duration: 10, words: WORDS.slice(0, 2) });
  assert.equal(fs.readdirSync(path.join(dir, "analysis", "transcripts")).length, 1);

  assert.deepEqual((await post(base, "/api/transcript/delete", { src: "/media/a.wav" })).body, { deleted: true });
  assert.deepEqual((await get(base, "/api/transcript?src=/media/a.wav")).body, { transcript: null });
  assert.deepEqual((await post(base, "/api/transcript/delete", { src: "/media/a.wav" })).body, { deleted: false });
});

test("a transcribe request is checked before it reaches a tab", async (t) => {
  const { base } = await boot(t);
  assert.equal((await post(base, "/api/transcribe/request", {})).status, 400);
  assert.equal((await post(base, "/api/transcribe/request", { transcribe: { srcs: [] } })).status, 400);
  assert.equal((await post(base, "/api/transcribe/request", { transcribe: { srcs: ["/media/none.wav"] } })).status, 404);
  const model = await post(base, "/api/transcribe/request", { transcribe: { srcs: ["/media/a.wav"], model: "huge" } });
  assert.equal(model.status, 400);
  assert.match(model.body.error, /model must be/);
  assert.equal((await post(base, "/api/transcribe/request", { transcribe: { srcs: ["/media/a.wav"], language: "xx" } })).status, 400);
  const tab = await post(base, "/api/transcribe/request", { where: "tab", transcribe: { srcs: ["/media/a.wav"] } });
  assert.equal(tab.status, 409);
  assert.match(tab.body.error, /no editor tab is open/);
});

test("fablecut_transcribe has a tab transcribe, then reads, finds and cuts words on the timeline", async (t) => {
  const { dir, base, port } = await boot(t);
  const tab = fakeTab(t, base);
  await tab.connected();
  const mcp = startMcp(t, dir, { FABLECUT_PORT: String(port) });
  await mcp.request("initialize", { protocolVersion: "2025-11-25" });

  // the whole timeline by default; the music on A2 is a clip with sound too
  const pending = mcp.callTool("fablecut_transcribe", { language: "zh" });
  const ticket = await tab.next();
  assert.equal(ticket.kind, "transcribe");
  assert.deepEqual(ticket.transcribe, { srcs: ["/media/a.wav", "/media/music.wav"], tracks: { '/media/a.wav': 0, '/media/music.wav': 0 }, model: "paraformer-zh", language: "zh", again: false });
  assert.equal((await post(base, "/api/export/job/claim?id=" + ticket.id)).status, 200);
  await post(base, "/api/transcript?src=/media/a.wav", { model: "base", language: "en", duration: 10, words: WORDS });
  await post(base, "/api/transcript?src=/media/music.wav", { model: "base", language: "en", duration: 10, words: [] });
  await post(base, "/api/export/job/report?id=" + ticket.id, { status: "done", result: { done: [{ src: "/media/a.wav", words: 5 }, { src: "/media/music.wav", words: 0 }], skipped: [], failed: [] } });
  const read = await pending;
  assert.equal(read.isError, false, read.text);
  assert.match(read.text, /Transcribed 2 files \(paraformer-zh, zh, in the open editor tab\)/);
  assert.match(read.text, /\[0:01\.00\] So um, this is great\./);

  // already transcribed: no job this time
  const found = await mcp.callTool("fablecut_transcribe", { clipIds: ["c_a"], find: "UM" });
  assert.equal(found.isError, false, found.text);
  assert.doesNotMatch(found.text, /Transcribed/);
  assert.match(found.text, /"UM": 1 match:\n  0:01\.40 → 0:01\.70  So «um,» this is great\./);
  assert.match(found.text, /remove 1 span, 0\.5 s/);
  assert.equal(readProject(dir).revision, 3, "find alone changes nothing");

  const refused = await mcp.callTool("fablecut_transcribe", { mediaIds: ["m_a"], find: "um", cut: true });
  assert.equal(refused.isError, true);
  assert.match(refused.text, /cut works on the timeline/);

  const cut = await mcp.callTool("fablecut_transcribe", { clipIds: ["c_a"], find: "um", cut: true });
  assert.equal(cut.isError, false, cut.text);
  assert.match(cut.text, /Cut 1 span, 0\.5 s/);
  const doc = readProject(dir);
  assert.equal(doc.revision, 4);
  const a = doc.clips.filter((c) => c.mediaId === "m_a").sort((x, y) => x.start - y.start);
  assert.deepEqual(a.map((c) => [c.start, c.in, c.duration]), [[0, 0, 1.4], [1.4, 1.9, 8.1]], "1.4–1.9 s extracted: the word and the pause after it");
  assert.equal(doc.clips.find((c) => c.id === "c_m").duration, 10, "the locked music bed keeps running");
  const versions = fs.readdirSync(path.join(dir, "projects")).flatMap((p) => { try { return fs.readdirSync(path.join(dir, "projects", p, "history")); } catch { return []; } });
  assert.ok(versions.some((f) => f.endsWith(".meta.json")), "a version was kept before the cut");

  // after the cut the words follow the new timeline
  const after = await mcp.callTool("fablecut_transcribe", { find: "this is" });
  assert.match(after.text, /0:01\.50 → 0:01\.90/);

  const bad = await mcp.callTool("fablecut_transcribe", { find: "  ...  " });
  assert.equal(bad.isError, true);
  assert.match(bad.text, /letters or digits/);
});
