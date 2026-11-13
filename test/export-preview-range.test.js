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
const { createExportJobs } = require("../server/export-jobs");

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

test("a new sample keeps the newest 20 samples, drops the old ones, and touches nothing else in previews/", { skip, timeout: 120_000 }, async (t) => {
  const dir = makeDataDir(t);
  fs.mkdirSync(path.join(dir, "previews"), { recursive: true });
  const now = Date.now();
  for (let i = 0; i < 25; i++) {
    const f = path.join(dir, "previews", `preview_old${i}.mp4`);
    fs.writeFileSync(f, "x");
    fs.utimesSync(f, new Date(now - (i + 1) * 60_000), new Date(now - (i + 1) * 60_000));
  }
  const stale = path.join(dir, "previews", "preview_stale.mp4");
  fs.writeFileSync(stale, "x"); fs.utimesSync(stale, new Date(now - 25 * 3600_000), new Date(now - 25 * 3600_000));
  fs.writeFileSync(path.join(dir, "previews", "keep-me.mp4"), "mine");
  fs.writeFileSync(path.join(dir, "previews", "notes.txt"), "mine");

  const { base } = await startServer(t, dir, { FABLECUT_NO_FS_WATCH: "1", FABLECUT_CHROME: path.join(dir, "no-such-browser") });
  const tab = fakeTab(t, base);
  await tab.connected();
  const req = await post(base, "/api/export/request", { where: "tab", range: { start: 0, end: 1 }, preview: true, profile: "prores422" });
  const ticket = await tab.next();
  await post(base, "/api/export/job/claim?id=" + ticket.id);
  const begin = await post(base, "/api/export/begin", { fps: 30, frames: 30, profile: "prores422", name: "x", hasAudio: false, job: req.body.id });
  assert.equal(begin.status, 200, JSON.stringify(begin.body));

  const left = names(dir, "previews");
  const samples = left.filter((n) => /^preview_/.test(n));
  assert.ok(samples.length <= 21, "at most 20 old ones and the new one: " + samples.length);
  assert.ok(samples.includes("preview_old0.mp4") && !samples.includes("preview_old24.mp4"), "the newest stay, the oldest go");
  assert.ok(!samples.includes("preview_stale.mp4"), "one older than a day goes");
  assert.ok(left.includes("keep-me.mp4") && left.includes("notes.txt"), "files that are not samples are never touched");
  await post(base, "/api/export/end?id=" + begin.body.id + "&discard=1&token=" + begin.body.endToken);
});

test("fablecut_export takes start and end together, not with range, and says where a sample is", () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "server", "mcp-server.js"), "utf8");
  assert.match(src, /pass start and end together/);
  assert.match(src, /pass start and end, or range/);
  assert.match(src, /startsWith\("\/previews\/"\) \? PREVIEWS_DIR : EXPORTS_DIR/);
  const tools = require("../server/mcp-tools");
  const t = (Array.isArray(tools) ? tools : Object.values(tools)).find((x) => x && x.name === "fablecut_export");
  for (const k of ["start", "end", "preview"]) assert.ok(t.inputSchema.properties[k], k + " is a parameter");
});
