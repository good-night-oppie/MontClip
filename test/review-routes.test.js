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

const PAGE_SECRET = "a1b2c3d4".repeat(8);   // what the Electron main process hands the server at start and adds to the editor window's own requests
const agyEnv = (mode, report, more = {}) => ({ MONTCLIP_REVIEW_PAGE_SECRET: PAGE_SECRET, MONTCLIP_REVIEW_DEST_CONFIRMED: "daily-cloudcode-pa.googleapis.com", FABLECUT_NO_FS_WATCH: "1", FABLECUT_CHROME: "no-such-browser", MONTCLIP_AGY_BIN: process.execPath, ...more,
  MONTCLIP_AGY_PREFIX_ARGS: JSON.stringify([FAKE, `--mode=${mode}`, ...(report ? [`--report=${report}`] : []), "--"]) });
/* The editor page is the Electron window: the main process adds the page secret to its own requests to /api/review/ (it never travels over HTTP to anyone else,
   and a header like Origin proves nothing: a local process can write any header). */
const PAGE = { "Sec-Fetch-Site": "same-origin", Origin: "http://localhost", "X-MontClip-Page": PAGE_SECRET };
async function asPage() { return PAGE; }
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
  const { base } = await startServer(t, dir, agyEnv("issues", report)); await asPage(base);
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
  const { base } = await startServer(t, dir, agyEnv("pass", undefined, { MONTCLIP_REVIEW_AGENT_SEND: "1" })); await asPage(base);
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
  const { base } = await startServer(t, dir, agyEnv("pass")); await asPage(base);
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
  const { base } = await startServer(t, dir, env); await asPage(base);
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

test("a header is not a page: Origin, Sec-Fetch-Site, a cookie or a guessed secret get no token and cannot send; no answer of the review hands out a secret or a cookie (QQ #328)", { skip, timeout: 120_000 }, async (t) => {
  const dir = makeDataDir(t, seedProject({ revision: 3 }));
  const report = path.join(dir, "..", path.basename(dir) + "-rpt.json"); t.after(() => { try { fs.rmSync(report, { force: true }); } catch { } });
  const { base } = await startServer(t, dir, agyEnv("pass", report));
  const tab = fakeTab(t, base); await tab.connected();
  const forged = { "Sec-Fetch-Site": "same-origin", Origin: base, "Sec-Fetch-Mode": "cors", Referer: base + "/" };
  /* 1: the first request of a script, and the second, and the tenth: never a cookie, never anything it could show back */
  for (let i = 0; i < 3; i++) {
    const r = await fetch(base + "/api/review/records", { headers: forged });
    assert.equal(r.headers.get("set-cookie"), null, "no answer of the review sets a cookie");
    assert.ok(!JSON.stringify([...r.headers]).includes(PAGE_SECRET) && !(await r.text()).includes(PAGE_SECRET), "the secret is in no answer");
  }
  assert.equal((await fetch(base + "/")).headers.get("set-cookie"), null);
  const prep = await call(base, "POST", "/api/review/prepare", { start: 1, end: 3, where: "tab" }, forged);
  assert.equal(prep.status, 200, JSON.stringify(prep.body));
  await playTab(base, tab);
  const id = prep.body.reviewId;
  await until(async () => (await call(base, "GET", "/api/review/status?id=" + id, undefined, forged)).body.state === "ready");
  /* 2: forged headers, a replayed or invented cookie, a wrong or short secret, the right secret in the wrong place: all agents */
  const agents = [forged, { ...forged, Cookie: "mc_review_page=" + PAGE_SECRET }, { ...forged, Cookie: "mc_review_page=" + "0".repeat(64) },
    { ...forged, "X-MontClip-Page": "0".repeat(64) }, { ...forged, "X-MontClip-Page": PAGE_SECRET.slice(0, 32) }, { ...forged, "X-MontClip-Page": "" },
    { ...forged, "X-MontClip-Session": PAGE_SECRET }];
  for (const h of agents) {
    const seen = (await call(base, "GET", "/api/review/status?id=" + id, undefined, h)).body;
    assert.equal(seen.sendToken, undefined, "no token for " + JSON.stringify(Object.keys(h)));
    assert.equal((await call(base, "POST", "/api/review/send", { id, token: "0".repeat(48) }, h)).status, 403);
    assert.equal((await call(base, "POST", "/api/review/prepare", { start: 1, end: 3, send: true }, h)).body.code, "AGENT_SEND_OFF", "an agent, and the agent switch is off");
  }
  assert.equal(fs.existsSync(report), false, "nothing was sent");
  const real = await asPage(base);
  assert.match((await call(base, "GET", "/api/review/status?id=" + id, undefined, real)).body.sendToken, /^[0-9a-f]{48}$/, "the window that carries the secret gets the token");
  assert.equal((await fetch(base + "/reviews/default.json")).status, 404, "what this server keeps is not an app file");
  assert.equal((await fetch(base + "/reviews/")).status, 404);
});

test("without a page secret (not started by the desktop app) nobody is the page: no token is ever shown, whatever header is sent", { skip, timeout: 120_000 }, async (t) => {
  const dir = makeDataDir(t, seedProject({ revision: 3 }));
  const env = agyEnv("pass"); delete env.MONTCLIP_REVIEW_PAGE_SECRET;
  const { base } = await startServer(t, dir, env);
  const tab = fakeTab(t, base); await tab.connected();
  const h = { ...PAGE };   // even the header the desktop would add
  const prep = await call(base, "POST", "/api/review/prepare", { start: 1, end: 3, where: "tab" }, h);
  assert.equal(prep.status, 200, JSON.stringify(prep.body));
  await playTab(base, tab);
  await until(async () => (await call(base, "GET", "/api/review/status?id=" + prep.body.reviewId, undefined, h)).body.state === "ready");
  assert.equal((await call(base, "GET", "/api/review/status?id=" + prep.body.reviewId, undefined, h)).body.sendToken, undefined);
  assert.equal((await call(base, "POST", "/api/review/send", { id: prep.body.reviewId, token: "0".repeat(48) }, h)).status, 403);
});

test("the desktop main process adds the page secret only to the editor window's own requests to /api/review/, and hands it to the server only through its environment", () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "desktop", "main.js"), "utf8");
  assert.ok(src.includes("MONTCLIP_REVIEW_PAGE_SECRET: pageSecret"), "the server gets it in its environment");
  assert.ok(src.includes('const pageSecret = crypto.randomBytes(32).toString("hex")'), "minted fresh at every start");
  const at = src.indexOf("onBeforeSendHeaders((details, callback) => {"), end = src.indexOf("\n  });", at);
  assert.ok(at > 0 && end > at, "the header hook is there");
  const hook = src.slice(at, end);
  assert.ok(hook.includes("X-MontClip-Page") && hook.includes("pageSecret"));
  assert.ok(hook.includes("/api/review/"), "only for the review's path");
  assert.ok(hook.includes("webContentsId"), "only for the editor window's own contents");
  const server = fs.readFileSync(path.join(__dirname, "..", "server", "server.js"), "utf8");
  assert.doesNotMatch(server, /reviewPageCookie|mc_review_page/, "no cookie is handed out");
});

test("the review answers only to this computer: a connection through the machine's own network address is refused", { skip, timeout: 60_000 }, async (t) => {
  const os = require("node:os");
  const ip = Object.values(os.networkInterfaces()).flat().find((i) => i && i.family === "IPv4" && !i.internal);
  if (!ip) return t.skip("no network address on this computer");
  const dir = makeDataDir(t);
  /* startServer pins HOST to 127.0.0.1, so this one is started by hand, listening on every address */
  const { spawn } = require("node:child_process");
  const port = 41000 + Math.floor(Math.random() * 2000);
  const child = spawn(process.execPath, [path.join(__dirname, "..", "server", "server.js")], { env: { ...process.env, ...agyEnv("pass"), PORT: String(port), HOST: "0.0.0.0", FABLECUT_DATA_DIR: dir }, stdio: "ignore", windowsHide: true });
  t.after(() => { try { child.kill(); } catch { } });
  for (let i = 0; i < 60; i++) { try { if ((await fetch("http://127.0.0.1:" + port + "/api/export/ffmpeg")).status === 200) break; } catch { } await new Promise((r) => setTimeout(r, 250)); }
  /* fetch cannot set Host; http can */
  const via = (host) => new Promise((resolve, reject) => { const q = http.request({ host, port, path: "/api/review/records", headers: { Host: "localhost:" + port }, timeout: 5000 }, (x) => { let body = ""; x.on("data", (c) => { body += c; }); x.on("end", () => resolve({ status: x.statusCode, body })); }); q.on("error", reject); q.on("timeout", () => q.destroy(new Error("timeout"))); q.end(); });
  let r; try { r = await via(ip.address); } catch { return t.skip("the machine's address is not reachable from itself here"); }
  assert.equal(r.status, 403); assert.equal(JSON.parse(r.body).code, "NOT_LOCAL");
  assert.equal((await fetch("http://127.0.0.1:" + port + "/api/review/records")).status, 200, "this computer itself is fine");
});

test("409 DESTINATION_UNVERIFIED carries the destination, so the page can say where it would have gone and that it is not confirmed", { skip, timeout: 60_000 }, async (t) => {
  const dir = makeDataDir(t);
  const env = agyEnv("pass"); delete env.MONTCLIP_REVIEW_DEST_CONFIRMED;
  const { base } = await startServer(t, dir, env);
  const r = await call(base, "POST", "/api/review/prepare", { start: 1, end: 3 });
  assert.equal(r.status, 409); assert.equal(r.body.code, "DESTINATION_UNVERIFIED");
  assert.deepEqual(r.body.destination, { service: "Google Gemini", host: "daily-cloudcode-pa.googleapis.com", source: "docs", verified: false });
});

test("the 60 s gate: an agent's full export of more than a minute is refused until a video check passed over it, or the owner's bypass (recorded, the words are not)", { skip, timeout: 120_000 }, async (t) => {
  const { startMcp } = require("./helpers");
  const dir = makeDataDir(t, seedProject({ revision: 2, media: [{ id: "m_a", name: "a.mp4", kind: "video", src: "/media/a.mp4", duration: 200 }],
    clips: [{ id: "c_a", mediaId: "m_a", kind: "video", track: "V1", start: 0, in: 0, duration: 90 }] }));
  const { base, port } = await startServer(t, dir, agyEnv("pass"));
  const mcp = startMcp(t, dir, { FABLECUT_PORT: String(port) });
  await mcp.request("initialize", { protocolVersion: "2025-11-25" });
  const run = async (args) => { try { const r = await mcp.callTool("fablecut_export", { wait: false, where: "tab", ...args }); return String(r && (r.text || JSON.stringify(r))); } catch (e) { return String(e.message || e); } };
  const refused = await run({});
  assert.match(refused, /has not passed a video check over its whole length/, refused);
  assert.match(await run({ range: "entire" }), /has not passed a video check/);
  assert.match(await run({ bypassReason: "no" }), /has not passed a video check/, "a reason of a few words is needed");
  /* not touched: a sample, a short stretch, a stretch of exactly a minute */
  for (const a of [{ preview: true, start: 0, end: 10 }, { start: 0, end: 30 }, { start: 0, end: 60 }]) assert.doesNotMatch(await run(a), /has not passed a video check/, JSON.stringify(a));
  /* the owner's bypass goes through to the export request, and leaves a record without the reason */
  const reason = "the owner said so SENTINEL-NICK-7731";
  assert.doesNotMatch(await run({ bypassReason: reason }), /has not passed a video check/);
  const file = fs.readdirSync(path.join(dir, "reviews")).map((f) => fs.readFileSync(path.join(dir, "reviews", f), "utf8")).join("");
  const led = JSON.parse(file); assert.equal(led.bypasses.length, 1); assert.equal(led.bypasses[0].start, 0); assert.equal(led.bypasses[0].end, 90);
  assert.ok(!file.includes("SENTINEL-NICK-7731") && !file.includes("owner said"), "the reason is not on disk");
});
