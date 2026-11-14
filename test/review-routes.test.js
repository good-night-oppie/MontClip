"use strict";
/* #321 — /api/review/* on a real server: the editor page and an agent are told apart, only a person's click sends, the record
   cannot be written to "passed", and project.json stays byte for byte as it was. The tool is the stand-in (no network). */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { execFileSync, spawnSync } = require("node:child_process");
const { makeDataDir, seedProject, startServer } = require("./helpers");
const FF = require("../server/ffmpeg-path");

const FAKE = path.join(__dirname, "fixtures", "fake-agy.js");
let HAS_FFMPEG = false;
try { HAS_FFMPEG = spawnSync(FF.path("ffmpeg"), ["-version"], { stdio: "ignore" }).status === 0; } catch { }
const skip = HAS_FFMPEG ? false : "needs ffmpeg";

const agyEnv = (mode, report, more = {}) => ({ MONTCLIP_REVIEW_DEST_CONFIRMED: "daily-cloudcode-pa.googleapis.com", FABLECUT_NO_FS_WATCH: "1", FABLECUT_CHROME: "no-such-browser", MONTCLIP_AGY_BIN: process.execPath, ...more,
  MONTCLIP_AGY_PREFIX_ARGS: JSON.stringify([FAKE, `--mode=${mode}`, ...(report ? [`--report=${report}`] : []), "--"]) });
const PAGE = { "Sec-Fetch-Site": "same-origin" };
/* node's fetch adds neither Origin nor Sec-Fetch-Site: that is an agent (MCP / the plugin); the page's header is added by hand */
const call = (base, method, p, body, headers) => fetch(base + p, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
  .then(async (r) => ({ status: r.status, body: await r.json() }));
const until = async (fn, ms = 30000) => { const t0 = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > ms) throw new Error("timed out"); await new Promise((r) => setTimeout(r, 100)); } };

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
  return { next: () => tickets.length ? Promise.resolve(tickets.shift()) : new Promise((r) => waiters.push(r)), connected: () => new Promise((r) => setTimeout(r, 300)) };
}
const jpegFrame = () => execFileSync(FF.path("ffmpeg"), ["-v", "error", "-f", "lavfi", "-i", "testsrc2=size=320x180", "-frames:v", "1", "-c:v", "mjpeg", "-f", "image2pipe", "-"], { windowsHide: true });
/* plays the editor tab for one sample: claims the job, uploads 30 frames, reports the file */
async function playTab(base, tab) {
  const ticket = await tab.next();
  assert.equal((await call(base, "POST", "/api/export/job/claim?id=" + ticket.id, {})).status, 200);
  const begin = await call(base, "POST", "/api/export/begin", { fps: 30, frames: 30, profile: ticket.profile || "prores422", name: "x", hasAudio: false, job: ticket.id });
  assert.equal(begin.status, 200, JSON.stringify(begin.body));
  await fetch(base + "/api/export/frame?id=" + begin.body.id, { method: "POST", body: Buffer.concat(Array(30).fill(jpegFrame())) });
  const end = await call(base, "POST", "/api/export/end?id=" + begin.body.id, {});
  assert.equal(end.status, 200, JSON.stringify(end.body));
  await call(base, "POST", "/api/export/job/report?id=" + ticket.id, { status: "done", src: end.body.src });
  return ticket;
}

test("the whole way on a real server: page prepares, the tab renders, only the page's token sends, the project stays as it was", { skip, timeout: 120_000 }, async (t) => {
  const dir = makeDataDir(t, seedProject({ revision: 7, inPoint: 1, outPoint: 3 }));
  const report = path.join(dir, "..", path.basename(dir) + "-report.json");
  t.after(() => { try { fs.rmSync(report, { force: true }); } catch { } });
  const { base } = await startServer(t, dir, agyEnv("issues", report));
  const before = fs.readFileSync(path.join(dir, "project.json"), "utf8");
  const tab = fakeTab(t, base); await tab.connected();

  const prep = await call(base, "POST", "/api/review/prepare", { start: 1, end: 3, where: "tab" }, PAGE);
  assert.equal(prep.status, 200, JSON.stringify(prep.body));
  const ticket = await playTab(base, tab);
  assert.deepEqual(ticket.range, { start: 0, end: 3 }, "the sample starts 3 s (here: to the start) before the stretch");
  const id = prep.body.reviewId;

  const agentView = await until(async () => { const r = await call(base, "GET", "/api/review/status?id=" + id); return r.body.state === "ready" && r.body; });
  assert.equal(agentView.sendToken, undefined, "an agent is never shown the token");
  assert.equal(agentView.willSend.to.service, "Google Gemini");
  const pageView = (await call(base, "GET", "/api/review/status?id=" + id, undefined, PAGE)).body;
  assert.match(pageView.sendToken, /^[0-9a-f]{48}$/);
  assert.match(pageView.previewSrc, /^\/previews\/preview_/);

  const agentSend = await call(base, "POST", "/api/review/send", { id, token: pageView.sendToken });
  assert.equal(agentSend.status, 403); assert.equal(agentSend.body.code, "CLICK_REQUIRED");
  assert.equal((await call(base, "POST", "/api/review/send", { id, token: "0".repeat(48) }, PAGE)).status, 403);
  assert.equal(fs.existsSync(report), false, "nothing started so far");

  const sent = await call(base, "POST", "/api/review/send", { id, token: pageView.sendToken }, PAGE);
  assert.equal(sent.status, 200, JSON.stringify(sent.body));
  assert.equal(sent.body.status, "issues");
  assert.equal(sent.body.source, "streamer");
  assert.equal((await call(base, "POST", "/api/review/send", { id, token: pageView.sendToken }, PAGE)).status, 409, "once");

  const got = await call(base, "GET", "/api/review/record?id=" + id);
  assert.equal(got.status, 200); assert.equal(got.body.findings.length, 2);
  assert.equal((await call(base, "GET", "/api/review/records")).body.records.length, 1);
  assert.equal(fs.readFileSync(path.join(dir, "project.json"), "utf8"), before, "project.json is byte for byte the same");
  const kept = fs.readFileSync(path.join(dir, "reviews", fs.readdirSync(path.join(dir, "reviews"))[0]), "utf8");
  assert.ok(!kept.includes(process.execPath), "the record names no tool path");
});

test("an agent's check sends when ready (send:true); a page cannot ask that; marks never make a pass; the gate says no without a pass", { skip, timeout: 120_000 }, async (t) => {
  const dir = makeDataDir(t, seedProject({ revision: 3 }));
  const { base } = await startServer(t, dir, agyEnv("pass", undefined, { MONTCLIP_REVIEW_AGENT_SEND: "1" }));
  const before = fs.readFileSync(path.join(dir, "project.json"), "utf8");
  const tab = fakeTab(t, base); await tab.connected();

  assert.equal((await call(base, "POST", "/api/review/prepare", { start: 1, end: 3, send: true }, PAGE)).body.code, "CLICK_REQUIRED");
  const prep = await call(base, "POST", "/api/review/prepare", { start: 1, end: 3, where: "tab", send: true });
  assert.equal(prep.status, 200, JSON.stringify(prep.body));
  assert.equal((await call(base, "POST", "/api/review/prepare", { start: 5, end: 8 })).body.code, "BUSY");
  await playTab(base, tab);
  const done = await until(async () => { const r = await call(base, "GET", "/api/review/status?id=" + prep.body.reviewId); return r.body.state === "done" && r.body; });
  assert.equal(done.result.status, "passed"); assert.equal(done.result.source, "agent");

  const gate = (s, e) => call(base, "GET", `/api/review/gate?start=${s}&end=${e}`).then((r) => r.body);
  assert.equal((await gate(1, 3)).passed, true);
  assert.equal((await gate(0, 3)).passed, false, "not covered");

  const id = done.result.reviewId;
  for (const m of ["passed", "pass", "ok"]) assert.equal((await call(base, "POST", "/api/review/mark", { id, mark: m })).status, 400, m);
  assert.equal((await call(base, "POST", "/api/review/mark", { id: "nope", mark: "note" })).status, 404);
  assert.equal((await call(base, "POST", "/api/review/mark", { id, mark: "recheck_needed", note: "not sure" })).status, 200);
  assert.equal((await gate(1, 3)).passed, false, "a person's recheck takes the pass away");

  /* a project edit (any content change) makes an older pass not count */
  const doc = JSON.parse(before); doc.title = "changed";
  fs.writeFileSync(path.join(dir, "project.json"), JSON.stringify(doc));
  assert.equal((await gate(1, 3)).passed, false);
});

test("refusals before anything is rendered: bad range, too long, no tool", { skip, timeout: 60_000 }, async (t) => {
  const dir = makeDataDir(t);
  const a = await startServer(t, dir, agyEnv("pass"));
  for (const b of [{}, { start: 5, end: 5 }, { start: 0, end: 31 }, { start: 0, end: 5, scope: "x" }]) assert.equal((await call(a.base, "POST", "/api/review/prepare", b)).status, 400, JSON.stringify(b));
  assert.equal((await call(a.base, "GET", "/api/review/gate?start=2&end=1")).status, 400);
  assert.equal((await call(a.base, "GET", "/api/review/status?id=nope")).status, 404);
  assert.equal((await call(a.base, "POST", "/api/review/nothing", {})).status, 404);
  const dir2 = makeDataDir(t);
  const b = await startServer(t, dir2, { FABLECUT_NO_FS_WATCH: "1", MONTCLIP_REVIEW_DEST_CONFIRMED: "daily-cloudcode-pa.googleapis.com", MONTCLIP_AGY_BIN: path.join(dir2, "none") });
  const r = await call(b.base, "POST", "/api/review/prepare", { start: 1, end: 3 });
  assert.equal(r.status, 409); assert.equal(r.body.code, "NO_BRIDGE");
});

test("an agent's send:true is off unless the switch is on; taste notes by route; the page and the agent see the same notes", { skip, timeout: 60_000 }, async (t) => {
  const dir = makeDataDir(t);
  const { base } = await startServer(t, dir, agyEnv("pass"));
  const off = await call(base, "POST", "/api/review/prepare", { start: 1, end: 3, send: true });
  assert.equal(off.status, 403); assert.equal(off.body.code, "AGENT_SEND_OFF");
  assert.deepEqual(fs.existsSync(path.join(dir, "previews")) ? fs.readdirSync(path.join(dir, "previews")) : [], [], "nothing was rendered");
  assert.equal((await call(base, "POST", "/api/review/taste/add", { kind: "positive", text: "all good" })).status, 400, "a positive note says what");
  const add = await call(base, "POST", "/api/review/taste/add", { kind: "positive", aspect: "pacing", text: "the pause before the reply" });
  assert.equal(add.status, 200, JSON.stringify(add.body));
  assert.equal((await call(base, "POST", "/api/review/taste/add", { kind: "negative", text: "a caption that explains the joke" })).status, 200);
  assert.equal((await call(base, "GET", "/api/review/taste", undefined, PAGE)).body.notes.length, 2);
  assert.equal((await call(base, "POST", "/api/review/taste/remove", { id: add.body.id })).status, 200);
  assert.equal((await call(base, "GET", "/api/review/taste")).body.notes.length, 1);
  assert.equal((await call(base, "POST", "/api/review/taste/remove", { id: "nope" })).status, 404);
  assert.equal((await call(base, "POST", "/api/review/prepare", { start: 1, end: 3, mode: "three" })).body.code, "BAD_MODE");
});

test("fail closed over HTTP: without the owner's confirmation of the address, prepare is refused (409) and nothing is rendered", { skip, timeout: 60_000 }, async (t) => {
  const dir = makeDataDir(t);
  const env = agyEnv("pass"); delete env.MONTCLIP_REVIEW_DEST_CONFIRMED;
  const { base } = await startServer(t, dir, env);
  for (const headers of [undefined, PAGE]) {
    const r = await call(base, "POST", "/api/review/prepare", { start: 1, end: 3 }, headers);
    assert.equal(r.status, 409); assert.equal(r.body.code, "DESTINATION_UNVERIFIED");
  }
  assert.deepEqual(fs.existsSync(path.join(dir, "previews")) ? fs.readdirSync(path.join(dir, "previews")) : [], []);
});

test("the checks of /api/export/request apply here too: an end past the timeline, or a sample (lead-in included) over 30 s, is refused with its reason", { skip, timeout: 60_000 }, async (t) => {
  const dir = makeDataDir(t, seedProject({ clips: [{ id: "c_a", mediaId: "m_a", kind: "video", track: "V1", start: 0, in: 0, duration: 40 }], media: [{ id: "m_a", name: "a.mp4", kind: "video", src: "/media/a.mp4", duration: 60 }] }));
  const { base } = await startServer(t, dir, agyEnv("pass"));
  const past = await call(base, "POST", "/api/review/prepare", { start: 38, end: 45 });
  assert.equal(past.status, 400); assert.equal(past.body.code, "RANGE_PAST_END"); assert.match(past.body.error, /past the end of the timeline/);
  const long = await call(base, "POST", "/api/review/prepare", { start: 5, end: 35 });   // 30 s plus the 3 s lead-in is a 33 s sample
  assert.equal(long.status, 400); assert.equal(long.body.code, "PREVIEW_TOO_LONG");
  assert.deepEqual(fs.existsSync(path.join(dir, "previews")) ? fs.readdirSync(path.join(dir, "previews")) : [], [], "nothing was rendered");
});
