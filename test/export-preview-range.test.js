"use strict";
/* MontClip#321: a quick sample of any stretch of the timeline, before the whole export. The job takes its own seconds
   ({start, end}) without touching the project's IN / OUT, and a job that says "preview" writes to previews/, under
   preview_<id>, never into exports/. The tests play the editor tab (an SSE reader that claims and reports). */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { execFileSync, spawnSync } = require("node:child_process");
const { makeDataDir, seedProject, startServer } = require("./helpers");
const { createExportJobs, checkExportSpan, timelineLength } = require("../server/export-jobs");
const { createPreviewStore } = require("../server/preview-store");

const FF = require("../server/ffmpeg-path");
let HAS_FFMPEG = false;
try { HAS_FFMPEG = spawnSync(FF.path("ffmpeg"), ["-version"], { stdio: "ignore" }).status === 0; } catch { }
const skip = HAS_FFMPEG ? false : "export requests need ffmpeg";

const jobs = () => createExportJobs({ allowHeadless: false, editors: () => 1, url: () => "http://127.0.0.1:1", broadcast() { } });

test("a range is 'entire', 'in-out' or {start, end} seconds with 0 <= start < end; anything else is refused", () => {
  const j = jobs();
  const bad = [{ start: -1, end: 5 }, { start: 5, end: 5 }, { start: 6, end: 5 }, { start: "a", end: 9 }, { start: 1 }, { end: 9 }, [1, 2], "half", { start: NaN, end: 4 }, { start: 0, end: Infinity }];
  for (const range of bad) {
    assert.throws(() => j.request({ range, where: "tab" }), (e) => e.code === 400 && /range must be/.test(e.message), JSON.stringify(range));
  }
  assert.equal(j.request({ range: "entire", where: "tab" }).range, "entire");
});

test("a {start, end} range keeps just those two numbers, and the job is a preview only when it asks", () => {
  const j = jobs();
  const v = j.request({ range: { start: 20, end: 30, junk: "x" }, preview: true, where: "tab" });
  assert.deepEqual(v.range, { start: 20, end: 30 });
  assert.equal(v.preview, true);
  assert.deepEqual(j.ticket(v.id).range, { start: 20, end: 30 }, "the editor page gets the seconds it renders");
  j.cancel(v.id);
  const plain = j.request({ range: { start: 0, end: 4 }, where: "tab" });
  assert.equal(plain.preview, false, "no preview unless the request says so");
  j.cancel(plain.id);
  assert.throws(() => j.request({ kind: "scopes", time: 1, preview: true, where: "tab" }), (e) => e.code === 400);
});

/* An open editor tab, as far as the server can tell: an SSE subscriber that keeps the export tickets. */
function fakeTab(t, base) {
  const tickets = [], waiters = [];
  let buf = "";
  const req = http.get(base + "/api/events", (res) => {
    res.setEncoding("utf8");
    res.on("data", (chunk) => {
      buf += chunk;
      let i;
      while ((i = buf.indexOf("\n\n")) >= 0) {
        const block = buf.slice(0, i); buf = buf.slice(i + 2);
        if (/^event: (.*)$/m.exec(block)?.[1] !== "export") continue;
        const ticket = JSON.parse(/^data: (.*)$/m.exec(block)[1]);
        const w = waiters.shift();
        if (w) w(ticket); else tickets.push(ticket);
      }
    });
  });
  req.on("error", () => { });
  t.after(() => req.destroy());
  return {
    next: () => tickets.length ? Promise.resolve(tickets.shift()) : new Promise((r) => waiters.push(r)),
    connected: async () => { await new Promise((r) => setTimeout(r, 300)); },
  };
}
const post = (base, p, body) => fetch(base + p, { method: "POST", body: body && JSON.stringify(body) }).then(async (r) => ({ status: r.status, body: await r.json() }));
const jpegFrame = () => execFileSync(FF.path("ffmpeg"), ["-v", "error", "-f", "lavfi", "-i", "color=c=gray:size=320x180", "-frames:v", "1", "-c:v", "mjpeg", "-f", "image2pipe", "-"], { windowsHide: true });
const names = (dir, sub) => { try { return fs.readdirSync(path.join(dir, sub)).sort(); } catch { return []; } };

test("a preview job writes to previews/, never to exports/; the project is not touched; the file is served", { skip, timeout: 120_000 }, async (t) => {
  const dir = makeDataDir(t, seedProject({ revision: 7, inPoint: 1, outPoint: 3 }));
  const { base } = await startServer(t, dir, { FABLECUT_NO_FS_WATCH: "1", FABLECUT_CHROME: path.join(dir, "no-such-browser") });
  const before = fs.readFileSync(path.join(dir, "project.json"), "utf8");
  const tab = fakeTab(t, base);
  await tab.connected();

  const req = await post(base, "/api/export/request", { where: "tab", range: { start: 0, end: 1 }, preview: true, profile: "prores422" });
  assert.equal(req.status, 200, JSON.stringify(req.body));
  assert.deepEqual(req.body.range, { start: 0, end: 1 });
  const ticket = await tab.next();
  assert.deepEqual(ticket.range, { start: 0, end: 1 });
  assert.equal((await post(base, "/api/export/job/claim?id=" + ticket.id)).status, 200);

  const begin = await post(base, "/api/export/begin", { fps: 30, frames: 30, profile: "prores422", name: "mine", hasAudio: false, job: ticket.id });
  assert.equal(begin.status, 200, JSON.stringify(begin.body));
  assert.deepEqual(names(dir, "exports"), [], "nothing is reserved in exports/");
  const during = names(dir, "previews");
  assert.ok(during.some((n) => /^preview_[A-Za-z0-9]+\.part\.mov$/.test(n)), "the sample's name is reserved in previews/: " + during.join(","));

  const frame = jpegFrame();
  const sent = await fetch(base + "/api/export/frame?id=" + begin.body.id, { method: "POST", body: Buffer.concat(Array(30).fill(frame)) });
  assert.equal(sent.status, 200);
  const end = await post(base, "/api/export/end?id=" + begin.body.id, {});
  assert.equal(end.status, 200, JSON.stringify(end.body));
  assert.match(end.body.src, /^\/previews\/preview_[A-Za-z0-9]+\.mov$/);
  assert.ok(!/mine/.test(end.body.src), "the sample has its own name, not the project's");

  const file = path.join(dir, "previews", decodeURIComponent(end.body.src.replace("/previews/", "")));
  assert.ok(fs.statSync(file).size > 0, "the sample is on disk");
  assert.deepEqual(names(dir, "exports"), [], "exports/ stays empty");
  assert.equal((await fetch(base + end.body.src)).status, 200, "and it is served");

  const done = await post(base, "/api/export/job/report?id=" + ticket.id, { status: "done", src: end.body.src });
  assert.deepEqual(done.body, { cancel: false });
  const job = await fetch(base + "/api/export/job?id=" + ticket.id).then((r) => r.json());
  assert.equal(job.status, "done", "the job accepts a file in previews/ as the finished one: " + JSON.stringify(job));
  assert.equal(job.preview, true);
  assert.equal(fs.readFileSync(path.join(dir, "project.json"), "utf8"), before, "project.json is byte for byte the same (revision, IN / OUT)");
  assert.deepEqual(names(dir, "previews").filter((n) => /^fablecut-/.test(n)), [], "no work folder is left behind");
});

test("a page cannot ask for previews/ by itself; a request without preview still exports to exports/", { skip, timeout: 120_000 }, async (t) => {
  const dir = makeDataDir(t);
  const { base } = await startServer(t, dir, { FABLECUT_NO_FS_WATCH: "1" });
  const begin = await post(base, "/api/export/begin", { fps: 30, frames: 30, profile: "prores422", name: "own", hasAudio: false, preview: true });
  assert.equal(begin.status, 200, JSON.stringify(begin.body));
  assert.deepEqual(names(dir, "previews"), [], "a bare preview:true in the body does nothing");
  assert.ok(names(dir, "exports").some((n) => /^own\.part\.mov$/.test(n)), names(dir, "exports").join(","));
  await post(base, "/api/export/end?id=" + begin.body.id + "&discard=1&token=" + begin.body.endToken);
});

/* #325 (QQ, Rea, ReviewInbox): what a sample run removes is what the registry says this exporter made — a file that only
   looks like a sample stays, and the newest 20 are what is left after the new one is saved. */
async function runSample(t, base, tab, range = { start: 0, end: 1 }) {
  const req = await post(base, "/api/export/request", { where: "tab", range, preview: true, profile: "prores422" });
  assert.equal(req.status, 200, JSON.stringify(req.body));
  const ticket = await tab.next();
  assert.equal((await post(base, "/api/export/job/claim?id=" + ticket.id)).status, 200);
  const begin = await post(base, "/api/export/begin", { fps: 30, frames: 30, profile: "prores422", name: "x", hasAudio: false, job: ticket.id });
  assert.equal(begin.status, 200, JSON.stringify(begin.body));
  const sent = await fetch(base + "/api/export/frame?id=" + begin.body.id, { method: "POST", body: Buffer.concat(Array(30).fill(jpegFrame())) });
  assert.equal(sent.status, 200);
  const end = await post(base, "/api/export/end?id=" + begin.body.id, {});
  assert.equal(end.status, 200, JSON.stringify(end.body));
  await post(base, "/api/export/job/report?id=" + ticket.id, { status: "done", src: end.body.src });
  return decodeURIComponent(end.body.src.replace("/previews/", ""));
}

test("a sample run never removes a file it did not register, however much it looks like a sample (Rea's repro)", { skip, timeout: 120_000 }, async (t) => {
  const dir = makeDataDir(t);
  const prev = path.join(dir, "previews");
  fs.mkdirSync(prev, { recursive: true });
  const old = new Date(Date.now() - 26 * 3600_000);
  for (const n of ["preview_unowned.mov", "preview_unowned.mp4", "preview_x.part.mov", "unowned.mov", "notes.txt"]) {
    fs.writeFileSync(path.join(prev, n), "sentinel"); fs.utimesSync(path.join(prev, n), old, old);
  }
  fs.mkdirSync(path.join(prev, "fablecut-abc123")); fs.utimesSync(path.join(prev, "fablecut-abc123"), old, old);
  const { base } = await startServer(t, dir, { FABLECUT_NO_FS_WATCH: "1", FABLECUT_CHROME: path.join(dir, "no-such-browser") });
  const tab = fakeTab(t, base);
  await tab.connected();
  const made = await runSample(t, base, tab);
  const left = names(dir, "previews");
  for (const n of ["preview_unowned.mov", "preview_unowned.mp4", "preview_x.part.mov", "unowned.mov", "notes.txt", "fablecut-abc123"])
    assert.ok(left.includes(n), n + " is not the exporter's, so it stays: " + left.join(","));
  assert.equal(fs.readFileSync(path.join(prev, "preview_unowned.mov"), "utf8"), "sentinel");
  assert.ok(left.includes(made), "the new sample is there");
  const regKeys = () => Object.keys(JSON.parse(fs.readFileSync(path.join(prev, ".preview-registry.json"), "utf8")).entries);
  for (let i = 0; i < 50 && regKeys().length > 1; i++) await new Promise((r) => setTimeout(r, 100));   // the work folder goes after the reply
  assert.deepEqual(regKeys(), [made], "only the sample it made is registered (its work folder and .part are gone)");
  assert.ok([403, 404].includes((await fetch(base + "/previews/.preview-registry.json")).status), "the registry is not served");
});

test("after a sample is saved at most 20 registered samples are left; the oldest registered one goes", { skip, timeout: 120_000 }, async (t) => {
  const dir = makeDataDir(t);
  const prev = path.join(dir, "previews");
  fs.mkdirSync(prev, { recursive: true });
  const store = createPreviewStore(prev);
  const now = Date.now();
  for (let i = 0; i < 20; i++) {
    const n = `preview_reg${i}.mp4`, f = path.join(prev, n);
    fs.writeFileSync(f, "x"); fs.utimesSync(f, new Date(now - (i + 1) * 60_000), new Date(now - (i + 1) * 60_000));
    store.addFile(n);
  }
  const { base } = await startServer(t, dir, { FABLECUT_NO_FS_WATCH: "1", FABLECUT_CHROME: path.join(dir, "no-such-browser") });
  const tab = fakeTab(t, base);
  await tab.connected();
  const made = await runSample(t, base, tab);
  const samples = names(dir, "previews").filter((n) => /^preview_/.test(n));
  assert.equal(samples.length, 20, "20 left after the new one, not 21: " + samples.join(","));
  assert.ok(samples.includes(made) && samples.includes("preview_reg0.mp4"));
  assert.ok(!samples.includes("preview_reg19.mp4"), "the oldest registered sample went");
});

test("preview registry: removes only registered files whose size and time still match; old work leftovers go, live ones stay", () => {
  const dir = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "mc-prev-"));
  try {
    let clock = 1_000_000_000_000;
    const store = createPreviewStore(dir, { keep: 2, maxAgeMs: 24 * 3600_000, workMs: 3600_000, clock: () => clock });
    const mk = (n, ageMs, body = "x") => { const f = path.join(dir, n); fs.writeFileSync(f, body); const d = new Date(clock - ageMs); fs.utimesSync(f, d, d); return n; };
    store.addFile(mk("preview_a.mp4", 1000));
    store.addFile(mk("preview_b.mxf", 2000));            // any container the sample was written in
    store.addFile(mk("preview_c.mp4", 3000));            // third newest: over keep
    store.addFile(mk("preview_old.mp4", 25 * 3600_000)); // older than a day
    store.addFile(mk("preview_changed.mp4", 4000));
    fs.writeFileSync(path.join(dir, "preview_changed.mp4"), "someone else's now");   // no longer what was registered
    mk("preview_unregistered.mp4", 30 * 3600_000);
    fs.mkdirSync(path.join(dir, "fablecut-old")); store.addWork("fablecut-old", "dir");
    fs.mkdirSync(path.join(dir, "fablecut-live")); store.addWork("fablecut-live", "dir");
    mk("preview_z.part.mp4", 0); store.addWork("preview_z.part.mp4", "file");
    clock += 2 * 3600_000;
    const removed = store.prune({ live: new Set(["fablecut-live"]) }).sort();
    assert.deepEqual(removed, ["fablecut-old", "preview_c.mp4", "preview_old.mp4", "preview_z.part.mp4"].sort());
    const left = fs.readdirSync(dir).sort();
    for (const n of ["preview_a.mp4", "preview_b.mxf", "preview_changed.mp4", "preview_unregistered.mp4", "fablecut-live"]) assert.ok(left.includes(n), n);
    assert.ok(!Object.keys(store.entries()).includes("preview_changed.mp4"), "a changed file is forgotten, not deleted");
    fs.writeFileSync(path.join(dir, ".preview-registry.json"), "{not json");
    assert.deepEqual(store.prune(), [], "an unreadable registry removes nothing");
    assert.throws(() => store.addWork("../escape", "dir"));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("checkExportSpan: an end past the timeline and a preview over 30 s are refused with a reason code", () => {
  const proj = { clips: [{ track: "V1", start: 0, duration: 32 }, { track: "V9", start: 0, duration: 99 }] };
  assert.equal(timelineLength(proj), 32, "a clip on a lane the project does not have does not count (as projDur)");
  assert.equal(checkExportSpan({ project: proj, range: { start: 31, end: 35 } }).errorCode, "RANGE_PAST_END");
  assert.equal(checkExportSpan({ project: proj, range: { start: 31, end: 35 }, preview: true }).errorCode, "RANGE_PAST_END");
  assert.equal(checkExportSpan({ project: proj, range: { start: 25, end: 32 } }), null, "up to the very end is fine");
  assert.equal(checkExportSpan({ project: proj, range: { start: 0, end: 30 }, preview: true }), null, "30 s is the limit, allowed");
  assert.equal(checkExportSpan({ project: proj, range: { start: 0, end: 30.5 }, preview: true }).errorCode, "PREVIEW_TOO_LONG");
  assert.equal(checkExportSpan({ project: proj, range: { start: 0, end: 31 } }), null, "a plain {start, end} export has no length limit");
  assert.equal(checkExportSpan({ project: proj, range: "entire", preview: true }).errorCode, "PREVIEW_TOO_LONG", "a preview of the whole 32 s timeline");
  assert.equal(checkExportSpan({ project: { ...proj, inPoint: 2, outPoint: 9 }, preview: true }), null, "a preview of IN/OUT (7 s)");
  assert.equal(checkExportSpan({ project: proj, range: "entire" }), null, "entire / in-out exports are unchanged");
  assert.equal(checkExportSpan({ project: proj, range: { start: "a", end: 2 } }), null, "shape errors are request()'s to report");
});

test("/api/export/request answers 400 with the reason for an end past the timeline or a preview over 30 s", { timeout: 60_000 }, async (t) => {
  const dir = makeDataDir(t, seedProject({ media: [{ id: "m_a", name: "a.mp4", kind: "video", src: "/media/a.mp4", duration: 60 }], clips: [{ id: "c_a", mediaId: "m_a", kind: "video", track: "V1", start: 0, in: 0, duration: 32 }] }));
  const { base } = await startServer(t, dir, { FABLECUT_NO_FS_WATCH: "1", FABLECUT_CHROME: path.join(dir, "no-such-browser") });
  const past = await post(base, "/api/export/request", { where: "headless", range: { start: 31, end: 35 }, preview: true, profile: "prores422" });
  assert.equal(past.status, 400, JSON.stringify(past.body));
  assert.equal(past.body.code, "RANGE_PAST_END");
  assert.match(past.body.error, /past the end of the timeline \(32 s\)/);
  const long = await post(base, "/api/export/request", { where: "headless", range: { start: 0, end: 31 }, preview: true, profile: "prores422" });
  assert.equal(long.status, 400, JSON.stringify(long.body));
  assert.equal(long.body.code, "PREVIEW_TOO_LONG");
  assert.match(long.body.error, /at most 30 s/);
  assert.deepEqual(names(dir, "previews"), [], "nothing was started");
});

test("fablecut_export takes start and end together, not with range, and says where a sample is", () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "server", "mcp-server.js"), "utf8");
  assert.match(src, /pass start and end together/);
  assert.match(src, /pass start and end, or range/);
  assert.match(src, /startsWith\("\/previews\/"\) \? PREVIEWS_DIR : EXPORTS_DIR/);
  const tools = require("../server/mcp-tools");
  const t = (Array.isArray(tools) ? tools : Object.values(tools)).find((x) => x && x.name === "fablecut_export");
  for (const k of ["start", "end", "preview"]) assert.ok(t.inputSchema.properties[k], k + " is a parameter");
  assert.match(t.inputSchema.properties.preview.description, /at most 30 s/, "the tool says how long a sample may be");
  assert.match(t.inputSchema.properties.end.description, /RANGE_PAST_END/);
});

/* #321: a sample with no encoding named gets a light one: H.264 (the "web" delivery preset at the picture's own size) where this computer
   can encode H.264, else ProRes 422, which every build can. Anything the caller names is kept; a normal export is unchanged. */
async function withTab(t, env) {
  const dir = makeDataDir(t, seedProject({ revision: 2 }));
  const { base } = await startServer(t, dir, { FABLECUT_NO_FS_WATCH: "1", FABLECUT_CHROME: path.join(dir, "no-such-browser"), ...env });
  const tab = fakeTab(t, base); await tab.connected();
  return { base, dir };
}
const cancel = (base, id) => post(base, "/api/export/job/cancel?id=" + id, {});

test("a sample with no encoding named: ProRes 422 where there is no H.264 encoder", { skip, timeout: 60_000 }, async (t) => {
  const { base } = await withTab(t, { MONTCLIP_TEST_NO_H264: "1" });
  const r = await post(base, "/api/export/request", { where: "tab", range: { start: 0, end: 2 }, preview: true });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.profile, "prores422"); assert.equal(r.body.preset, null);
  await cancel(base, r.body.id);
});

test("a sample with no encoding named: light H.264 where there is an encoder; what the caller names is kept; a normal export is not touched", { skip, timeout: 60_000 }, async (t) => {
  const { base } = await withTab(t, {});
  const h264 = await fetch(base + "/api/export/h264").then((r) => r.json());
  if (!h264.encoders || !h264.encoders.length) return t.skip("no H.264 encoder on this computer");
  const light = await post(base, "/api/export/request", { where: "tab", range: { start: 0, end: 2 }, preview: true });
  assert.equal(light.status, 200, JSON.stringify(light.body));
  assert.equal(light.body.preset, "web"); assert.equal(light.body.profile, null);
  assert.match(light.body.delivery, /H\.?264|h264|AAC/i, light.body.delivery);
  assert.ok(light.body.notes.some((n) => /sample/i.test(n)), "the reply says which encoding it chose and why");
  await cancel(base, light.body.id);
  const named = await post(base, "/api/export/request", { where: "tab", range: { start: 0, end: 2 }, preview: true, profile: "prores422" });
  assert.equal(named.body.profile, "prores422"); assert.equal(named.body.preset, null); await cancel(base, named.body.id);
  const preset = await post(base, "/api/export/request", { where: "tab", range: { start: 0, end: 2 }, preview: true, preset: "youtube" });
  assert.equal(preset.body.preset, "youtube"); await cancel(base, preset.body.id);
  const plain = await post(base, "/api/export/request", { where: "tab" });
  assert.equal(plain.body.preview, false); assert.equal(plain.body.preset, null); assert.equal(plain.body.profile, null, "a normal export keeps the server's own default");
  await cancel(base, plain.body.id);
});

/* ---- QQ's three follow-ups on #325 (review 5901047800, "after the merge") ---- */
test("preview registry: every removal is logged with its name and the reason, and a name the registry never saw is never logged as removed", () => {
  const dir = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "mc-prevlog-"));
  try {
    let clock = 1_000_000_000_000; const lines = [];
    const store = createPreviewStore(dir, { keep: 1, maxAgeMs: 24 * 3600_000, workMs: 3600_000, clock: () => clock, log: (l) => lines.push(l) });
    const mk = (n, ageMs) => { const f = path.join(dir, n); fs.writeFileSync(f, "x"); const d = new Date(clock - ageMs); fs.utimesSync(f, d, d); return n; };
    store.addFile(mk("preview_new.mp4", 1000)); store.addFile(mk("preview_over.mp4", 2000)); store.addFile(mk("preview_old.mp4", 25 * 3600_000));
    fs.mkdirSync(path.join(dir, "fablecut-left")); store.addWork("fablecut-left", "dir");
    mk("preview_stranger.mp4", 30 * 3600_000);
    clock += 2 * 3600_000;
    const removed = store.prune();
    assert.deepEqual([...removed].sort(), ["fablecut-left", "preview_old.mp4", "preview_over.mp4"]);
    for (const n of removed) assert.ok(lines.some((l) => l.includes(n)), "logged: " + n);
    assert.ok(lines.some((l) => /fablecut-left/.test(l) && /leftover/.test(l)) && lines.some((l) => /preview_over\.mp4/.test(l) && /over the newest 1/.test(l)) && lines.some((l) => /preview_old\.mp4/.test(l) && /older than/.test(l)));
    assert.ok(!lines.some((l) => l.includes("preview_stranger")), "what it never registered is not touched, so not logged");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("when the registry cannot be written, the work folder that was just made is removed instead of being left in previews/ for good", () => {
  const dir = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "mc-prevreg-"));
  try {
    const store = createPreviewStore(dir);
    fs.mkdirSync(path.join(dir, ".preview-registry.json"));          // a folder in the registry's place: the atomic replace cannot succeed
    fs.mkdirSync(path.join(dir, "fablecut-new")); fs.writeFileSync(path.join(dir, "preview_x.part.mp4"), "p");
    assert.throws(() => store.registerRun("fablecut-new", ["preview_x.part.mp4"]), /registry/i);
    assert.ok(!fs.existsSync(path.join(dir, "fablecut-new")), "the folder just made is gone");
    assert.ok(!fs.existsSync(path.join(dir, "preview_x.part.mp4")), "and the part file");
    assert.throws(() => store.registerRun("../escape", []), "a name outside previews/ is refused, nothing outside is removed");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("fablecut_export through MCP names the reason code (RANGE_PAST_END, PREVIEW_TOO_LONG) as well as the words", { skip, timeout: 120_000 }, async (t) => {
  const { startMcp } = require("./helpers");
  const dir = makeDataDir(t, seedProject({ revision: 2, media: [{ id: "m_a", name: "a.mp4", kind: "video", src: "/media/a.mp4", duration: 32 }],
    clips: [{ id: "c_a", mediaId: "m_a", kind: "video", track: "V1", start: 0, in: 0, duration: 32 }] }));
  const { port } = await startServer(t, dir, { FABLECUT_NO_FS_WATCH: "1", FABLECUT_CHROME: path.join(dir, "no-such-browser") });
  const mcp = startMcp(t, dir, { FABLECUT_PORT: String(port) });
  await mcp.request("initialize", { protocolVersion: "2025-11-25" });
  const run = async (args) => { try { const r = await mcp.callTool("fablecut_export", { wait: false, where: "tab", ...args }); return String(r && (r.text || JSON.stringify(r))); } catch (e) { return String(e.message || e); } };
  assert.match(await run({ preview: true, start: 31, end: 35 }), /RANGE_PAST_END/);
  assert.match(await run({ preview: true, start: 0, end: 31 }), /PREVIEW_TOO_LONG/);
});
