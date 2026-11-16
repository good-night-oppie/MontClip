"use strict";
/* #321 — /api/review/* on a real server (ADR #341): the editor page and an agent are told apart, only the desktop main process — after
   the streamer's click — makes the server send, the record cannot be written to "passed", and project.json stays byte for byte as it was.
   A server started here has no main process (no process.parentPort): the streamer's switch is off and there is no sender, so these
   tests check the refusals over HTTP; what a send does is in test/review-api.test.js with a stand-in sender. No network. */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { makeDataDir, seedProject, startServer } = require("./helpers");
const FF = require("../server/ffmpeg-path");

let HAS_FFMPEG = false;
try { HAS_FFMPEG = spawnSync(FF.path("ffmpeg"), ["-version"], { stdio: "ignore" }).status === 0; } catch { }
const skip = HAS_FFMPEG ? false : "needs ffmpeg";

const PAGE_SECRET = "a1b2c3d4".repeat(8);   // what the Electron main process hands the server at start and adds to the editor window's own requests
const MAIN_SECRET = "e5f6a7b8".repeat(8);   // what only the main process itself sends, after the streamer's click
const srvEnv = (more = {}) => ({ MONTCLIP_REVIEW_PAGE_SECRET: PAGE_SECRET, MONTCLIP_REVIEW_MAIN_SECRET: MAIN_SECRET,
  FABLECUT_NO_FS_WATCH: "1", FABLECUT_CHROME: "no-such-browser", ...more });
/* The editor page is the Electron window: the main process adds the page secret to its own requests to /api/review/ (it never travels over HTTP to anyone else,
   and a header like Origin proves nothing: a local process can write any header). */
const PAGE = { "Sec-Fetch-Site": "same-origin", Origin: "http://localhost", "X-MontClip-Page": PAGE_SECRET };
const MAIN = { "X-MontClip-Page": PAGE_SECRET, "X-MontClip-Main": MAIN_SECRET };
/* node's fetch adds neither Origin nor Sec-Fetch-Site: that is an agent (MCP / the plugin); the page's header is added by hand */
const call = (base, method, p, body, headers) => fetch(base + p, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
  .then(async (r) => ({ status: r.status, body: await r.json() }));
const previews = (dir) => fs.existsSync(path.join(dir, "previews")) ? fs.readdirSync(path.join(dir, "previews")) : [];

test("a standalone server (no desktop main process): the streamer's switch is off, so prepare is refused before anything is rendered; only the main process's secret reaches send; the project stays as it was", { skip, timeout: 60_000 }, async (t) => {
  const dir = makeDataDir(t, seedProject({ revision: 7, inPoint: 1, outPoint: 3 }));
  const { base } = await startServer(t, dir, srvEnv());
  const before = fs.readFileSync(path.join(dir, "project.json"), "utf8");
  for (const headers of [undefined, PAGE, MAIN]) {
    const r = await call(base, "POST", "/api/review/prepare", { start: 1, end: 3, where: "tab" }, headers);
    assert.equal(r.status, 409, JSON.stringify(r.body)); assert.equal(r.body.code, "REVIEW_SEND_OFF");
  }
  assert.deepEqual(previews(dir), [], "nothing was rendered");
  /* send: the page's own click no longer sends over HTTP — it goes through the main process's box (IPC), which alone carries its secret */
  for (const h of [undefined, PAGE]) {
    const s = await call(base, "POST", "/api/review/send", { id: "r_000000000000", token: "0".repeat(48), hash: "0".repeat(64) }, h);
    assert.equal(s.status, 403); assert.equal(s.body.code, "CLICK_REQUIRED");
  }
  const m = await call(base, "POST", "/api/review/send", { id: "r_000000000000", token: "0".repeat(48), hash: "0".repeat(64) }, MAIN);
  assert.equal(m.status, 404, "the main process gets through the door, and there is no such check"); assert.equal(m.body.code, "NO_SUCH_REVIEW");
  /* the streamer's confirmation after a DESTINATION_MISMATCH: the main process only */
  for (const h of [undefined, PAGE]) assert.equal((await call(base, "POST", "/api/review/unblock", {}, h)).status, 403);
  assert.equal((await call(base, "POST", "/api/review/unblock", {}, MAIN)).status, 200);
  assert.equal((await call(base, "GET", "/api/review/records")).body.records.length, 0);
  assert.equal(fs.readFileSync(path.join(dir, "project.json"), "utf8"), before, "project.json is byte for byte the same");
});

test("an agent's send:true needs no owner switch but is still refused while the streamer's switch is off; a page cannot ask that; marks never make a pass; the gate says no without a pass", { skip, timeout: 60_000 }, async (t) => {
  const dir = makeDataDir(t, seedProject({ revision: 3 }));
  const { base } = await startServer(t, dir, srvEnv());
  assert.equal((await call(base, "POST", "/api/review/prepare", { start: 1, end: 3, send: true }, PAGE)).body.code, "CLICK_REQUIRED");
  const prep = await call(base, "POST", "/api/review/prepare", { start: 1, end: 3, where: "tab", send: true });
  assert.equal(prep.status, 409); assert.equal(prep.body.code, "REVIEW_SEND_OFF", "the streamer's switch is off: nothing is rendered or sent");
  const gate = (s, e) => call(base, "GET", `/api/review/gate?start=${s}&end=${e}`).then((r) => r.body);
  assert.equal((await gate(1, 3)).passed, false, "no check, no pass");
  for (const m of ["passed", "pass", "ok"]) assert.equal((await call(base, "POST", "/api/review/mark", { id: "nope", mark: m })).status, 400, m);
  assert.equal((await call(base, "POST", "/api/review/mark", { id: "nope", mark: "note" })).status, 404);
  assert.deepEqual(previews(dir), []);
});

test("refusals before anything is rendered: bad range, too long, bad scope or mode or audio; with no sender and the switch off, a good one is refused too", { skip, timeout: 60_000 }, async (t) => {
  const dir = makeDataDir(t);
  const a = await startServer(t, dir, srvEnv());
  for (const b of [{}, { start: 5, end: 5 }, { start: 0, end: 31 }, { start: 0, end: 5, scope: "x" }, { start: 0, end: 5, mode: "three" }, { start: 0, end: 5, audio: "yes" }])
    assert.equal((await call(a.base, "POST", "/api/review/prepare", b)).status, 400, JSON.stringify(b));
  assert.equal((await call(a.base, "GET", "/api/review/gate?start=2&end=1")).status, 400);
  assert.equal((await call(a.base, "GET", "/api/review/status?id=nope")).status, 404);
  assert.equal((await call(a.base, "POST", "/api/review/nothing", {})).status, 404);
  const r = await call(a.base, "POST", "/api/review/prepare", { start: 1, end: 3 });
  assert.equal(r.status, 409); assert.equal(r.body.code, "REVIEW_SEND_OFF");
  assert.deepEqual(previews(dir), []);
});

test("taste notes by route; the page and the agent see the same notes", { skip, timeout: 60_000 }, async (t) => {
  const dir = makeDataDir(t);
  const { base } = await startServer(t, dir, srvEnv());
  assert.equal((await call(base, "POST", "/api/review/taste/add", { kind: "positive", text: "all good" })).status, 400, "a positive note says what");
  const add = await call(base, "POST", "/api/review/taste/add", { kind: "positive", aspect: "pacing", text: "the pause before the reply" });
  assert.equal(add.status, 200, JSON.stringify(add.body));
  assert.equal((await call(base, "POST", "/api/review/taste/add", { kind: "negative", text: "a caption that explains the joke" })).status, 200);
  assert.equal((await call(base, "GET", "/api/review/taste", undefined, PAGE)).body.notes.length, 2);
  assert.equal((await call(base, "POST", "/api/review/taste/remove", { id: add.body.id })).status, 200);
  assert.equal((await call(base, "GET", "/api/review/taste")).body.notes.length, 1);
  assert.equal((await call(base, "POST", "/api/review/taste/remove", { id: "nope" })).status, 404);
});

test("#321 (6921163328): the removed start-up variables change nothing over HTTP — unset, empty, openrouter.ai or the old address, prepare answers the same (the streamer's switch is off here) and nothing is rendered", { skip, timeout: 60_000 }, async (t) => {
  for (const conf of [undefined, "", "openrouter.ai", "daily-cloudcode-pa.googleapis.com"]) {
    const dir = makeDataDir(t);
    const env = srvEnv(); if (conf !== undefined) { env.MONTCLIP_REVIEW_DEST_CONFIRMED = conf; env.MONTCLIP_REVIEW_AGENT_SEND = conf; }
    const { base } = await startServer(t, dir, env);
    for (const headers of [undefined, PAGE, MAIN]) {
      const r = await call(base, "POST", "/api/review/prepare", { start: 1, end: 3 }, headers);
      assert.equal(r.status, 409, String(conf)); assert.equal(r.body.code, "REVIEW_SEND_OFF", String(conf));
    }
    assert.deepEqual(previews(dir), []);
  }
});

test("a header is not a page or the main process: Origin, Sec-Fetch-Site, a cookie or a guessed secret cannot send or lift a stop; no answer of the review hands out a secret or a cookie (QQ #328)", { skip, timeout: 60_000 }, async (t) => {
  const dir = makeDataDir(t, seedProject({ revision: 3 }));
  const { base } = await startServer(t, dir, srvEnv());
  const forged = { "Sec-Fetch-Site": "same-origin", Origin: base, "Sec-Fetch-Mode": "cors", Referer: base + "/" };
  /* 1: the first request of a script, and the second, and the tenth: never a cookie, never anything it could show back */
  for (let i = 0; i < 3; i++) {
    const r = await fetch(base + "/api/review/records", { headers: forged });
    assert.equal(r.headers.get("set-cookie"), null, "no answer of the review sets a cookie");
    const text = await r.text();
    for (const s of [PAGE_SECRET, MAIN_SECRET]) assert.ok(!JSON.stringify([...r.headers]).includes(s) && !text.includes(s), "the secret is in no answer");
  }
  assert.equal((await fetch(base + "/")).headers.get("set-cookie"), null);
  /* 2: forged headers, a replayed or invented cookie, a wrong or short secret, the page's secret in the main process's place: none sends */
  const others = [forged, { ...forged, Cookie: "mc_review_page=" + PAGE_SECRET }, PAGE,
    { ...PAGE, "X-MontClip-Main": "0".repeat(64) }, { ...PAGE, "X-MontClip-Main": MAIN_SECRET.slice(0, 32) }, { ...PAGE, "X-MontClip-Main": "" },
    { ...PAGE, "X-MontClip-Main": PAGE_SECRET }, { ...forged, "X-MontClip-Session": MAIN_SECRET }];
  for (const h of others) {
    const s = await call(base, "POST", "/api/review/send", { id: "r_000000000000", token: "0".repeat(48), hash: "0".repeat(64) }, h);
    assert.equal(s.status, 403, JSON.stringify(Object.keys(h))); assert.equal(s.body.code, "CLICK_REQUIRED");
    assert.equal((await call(base, "POST", "/api/review/unblock", {}, h)).status, 403);
  }
  assert.equal((await fetch(base + "/reviews/default.json")).status, 404, "what this server keeps is not an app file");
  assert.equal((await fetch(base + "/reviews/")).status, 404);
});

test("without the main process's secret (not started by the desktop app) nothing can send, whatever header is sent", { skip, timeout: 60_000 }, async (t) => {
  const dir = makeDataDir(t, seedProject({ revision: 3 }));
  const env = srvEnv(); delete env.MONTCLIP_REVIEW_MAIN_SECRET;
  const { base } = await startServer(t, dir, env);
  for (const h of [PAGE, MAIN]) assert.equal((await call(base, "POST", "/api/review/send", { id: "r_000000000000", token: "0".repeat(48), hash: "0".repeat(64) }, h)).status, 403);
});

test("the desktop main process: the page secret on every request of the editor window itself (whatever the path); its own secret only on its own requests (never added to a page's); both reach the server only through its environment", () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "desktop", "main.js"), "utf8");
  assert.ok(src.includes("MONTCLIP_REVIEW_PAGE_SECRET: pageSecret"), "the server gets it in its environment");
  assert.ok(src.includes("MONTCLIP_REVIEW_MAIN_SECRET: mainSecret"), "and the main process's own secret the same way");
  assert.ok(src.includes('const pageSecret = crypto.randomBytes(32).toString("hex")'), "minted fresh at every start");
  assert.ok(src.includes('const mainSecret = crypto.randomBytes(32).toString("hex")'), "minted fresh at every start");
  const at = src.indexOf("onBeforeSendHeaders((details, callback) => {"), end = src.indexOf("\n  });", at);
  assert.ok(at > 0 && end > at, "the header hook is there");
  const hook = src.slice(at, end);
  assert.ok(hook.includes("X-MontClip-Page") && hook.includes("pageSecret"));
  /* QQ #326 review 5927365621: not filtered by the raw path — /api/%72eview/… decoded to /api/review/… and went without it, read as an agent */
  assert.ok(!/pathname|startsWith\(/.test(hook), "the page secret does not depend on how the page spells the path");
  assert.ok(hook.includes("webContentsId"), "only for the editor window's own contents");
  assert.ok(!hook.includes("mainSecret") && !hook.includes("X-MontClip-Main"), "the page's requests never carry the main process's secret");
  const server = fs.readFileSync(path.join(__dirname, "..", "server", "server.js"), "utf8");
  assert.doesNotMatch(server, /reviewPageCookie|mc_review_page/, "no cookie is handed out");
  assert.match(server, /delete process\.env\.MONTCLIP_REVIEW_MAIN_SECRET/, "nothing the server starts inherits it");
});

test("no agent door to the streamer's switch or key, and none to the removed start-up variables: no route, MCP tool or prepare field sets them (reverse test)", { skip, timeout: 60_000 }, async (t) => {
  const dir = makeDataDir(t);
  const { base } = await startServer(t, dir, srvEnv());
  for (const p of ["/api/review/settings", "/api/review/confirm", "/api/review/dest", "/api/review/agent-send", "/api/review/switch", "/api/review/key"])
    assert.equal((await call(base, "POST", p, { MONTCLIP_REVIEW_DEST_CONFIRMED: "openrouter.ai", MONTCLIP_REVIEW_AGENT_SEND: "1", on: true }, MAIN)).status, 404, p);
  /* extra fields on prepare are ignored: the streamer's switch is still off */
  const r = await call(base, "POST", "/api/review/prepare", { start: 1, end: 3, destConfirmed: true, MONTCLIP_REVIEW_DEST_CONFIRMED: "openrouter.ai", agentSend: true, sendSwitch: true, send: true });
  assert.equal(r.status, 409);
  const mcp = fs.readFileSync(path.join(__dirname, "..", "server", "mcp-server.js"), "utf8");
  for (const name of ["MONTCLIP_REVIEW_DEST_CONFIRMED", "MONTCLIP_REVIEW_AGENT_SEND"]) {
    const uses = mcp.split(name).length - 1;
    assert.ok(!new RegExp(`process\\.env\\.${name}\\s*=`).test(mcp) && !new RegExp(`["']${name}["']\\s*:`).test(mcp), name + " is never written by the MCP server (" + uses + " mentions)");
  }
  /* #321 (PG 6921163328): no code that decides a send reads them any more */
  for (const rel of ["server/server.js", "server/review-service.js", "server/video-bridge.js", "server/openrouter-review.js", "desktop/review-sender.js", "desktop/main.js"]) {
    const src = fs.readFileSync(path.join(__dirname, "..", rel), "utf8");
    for (const name of ["MONTCLIP_REVIEW_DEST_CONFIRMED", "MONTCLIP_REVIEW_AGENT_SEND"]) assert.ok(!src.includes("env." + name) && !/env\[["']MONTCLIP_REVIEW_(DEST_CONFIRMED|AGENT_SEND)/.test(src), rel + " reads " + name);
  }
});

test("the review answers only to this computer: a connection through the machine's own network address is refused", { skip, timeout: 60_000 }, async (t) => {
  const os = require("node:os");
  const ip = Object.values(os.networkInterfaces()).flat().find((i) => i && i.family === "IPv4" && !i.internal);
  if (!ip) return t.skip("no network address on this computer");
  const dir = makeDataDir(t);
  /* startServer pins HOST to 127.0.0.1, so this one is started by hand, listening on every address */
  const { spawn } = require("node:child_process");
  const port = 41000 + Math.floor(Math.random() * 2000);
  const child = spawn(process.execPath, [path.join(__dirname, "..", "server", "server.js")], { env: { ...process.env, ...srvEnv(), PORT: String(port), HOST: "0.0.0.0", FABLECUT_DATA_DIR: dir }, stdio: "ignore", windowsHide: true });
  t.after(() => { try { child.kill(); } catch { } });
  for (let i = 0; i < 60; i++) { try { if ((await fetch("http://127.0.0.1:" + port + "/api/export/ffmpeg")).status === 200) break; } catch { } await new Promise((r) => setTimeout(r, 250)); }
  /* fetch cannot set Host; http can */
  const via = (host) => new Promise((resolve, reject) => { const q = http.request({ host, port, path: "/api/review/records", headers: { Host: "localhost:" + port }, timeout: 5000 }, (x) => { let body = ""; x.on("data", (c) => { body += c; }); x.on("end", () => resolve({ status: x.statusCode, body })); }); q.on("error", reject); q.on("timeout", () => q.destroy(new Error("timeout"))); q.end(); });
  let r; try { r = await via(ip.address); } catch { return t.skip("the machine's address is not reachable from itself here"); }
  assert.equal(r.status, 403); assert.equal(JSON.parse(r.body).code, "NOT_LOCAL");
  assert.equal((await fetch("http://127.0.0.1:" + port + "/api/review/records")).status, 200, "this computer itself is fine");
});

test("the 60 s gate: an agent's full export of more than a minute is refused until a video check passed over it, or the owner's bypass (recorded, the words are not)", { skip, timeout: 120_000 }, async (t) => {
  const { startMcp } = require("./helpers");
  const dir = makeDataDir(t, seedProject({ revision: 2, media: [{ id: "m_a", name: "a.mp4", kind: "video", src: "/media/a.mp4", duration: 200 }],
    clips: [{ id: "c_a", mediaId: "m_a", kind: "video", track: "V1", start: 0, in: 0, duration: 90 }] }));
  const { port } = await startServer(t, dir, srvEnv());
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

/* the request line exactly as written: fetch() and URL() would tidy dot segments and some encodings before they reach the server */
const rawCall = (base, method, rawPath, body, headers) => new Promise((resolve, reject) => {
  const u = new URL(base), data = body === undefined ? undefined : JSON.stringify(body);
  const req = require("node:http").request({ hostname: u.hostname, port: u.port, method, path: rawPath,
    headers: { ...(headers || {}), ...(data ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) } : {}) } }, (res) => {
    let txt = ""; res.setEncoding("utf8"); res.on("data", (c) => { txt += c; });
    res.on("end", () => { let j = null; try { j = JSON.parse(txt); } catch { j = null; } resolve({ status: res.statusCode, body: j || {} }); });
  });
  req.on("error", reject); if (data) req.write(data); req.end();
});
const NONCANONICAL = [
  "/api/%72eview/prepare", "/api/review/%70repare", "/api/review%2Fprepare", "/api/%72eview/status?id=x", "/api/%65xport/request", "/api/%252eview/prepare",   // encoded
  "/API/review/prepare", "/api/Review/prepare", "/Api/review/send", "/api/review/PREPARE",                                                                   // case
  "//api/review/prepare", "/api//review/prepare", "/api/review//prepare",                                                                                     // doubled slashes
  "/api/x/../review/prepare", "/api/./review/prepare", "/media/../api/review/prepare", "/%2e%2e/api/review/prepare", "/api/review/./prepare",                // dot segments
  "/api\\review\\prepare", "/api/review\\prepare",                                                                                                             // backslashes
];

test("QQ #326 review 5927365621 / Deja: an /api/ path spelt any way but the plain one is refused (400) — encoded, upper-case, doubled slash, dot segment or backslash: with send:true it neither prepares nor sends, whatever the headers", { skip, timeout: 120_000 }, async (t) => {
  const dir = makeDataDir(t, seedProject({ revision: 3 }));
  const { base } = await startServer(t, dir, srvEnv());
  for (const p of NONCANONICAL) {
    for (const h of [undefined, PAGE, MAIN]) {
      const r = await rawCall(base, "POST", p, { start: 1, end: 3, send: true }, h);
      assert.equal(r.status, 400, p); assert.equal(r.body.code, "NONCANONICAL_PATH", p);
    }
  }
  assert.equal((await call(base, "GET", "/api/review/records")).body.records.length, 0, "no check was made");
  assert.deepEqual(previews(dir), [], "nothing was rendered");
  assert.equal((await rawCall(base, "POST", "/api/review/prepare", { start: 1, end: 3, send: true })).body.code, "REVIEW_SEND_OFF", "the plain path still answers as before");
  /* not touched: plain API paths with a query, and files whose names are encoded (Chinese names, spaces) */
  assert.equal((await rawCall(base, "GET", "/api/review/status?id=%72_x")).body.code, "NO_SUCH_REVIEW", "encoding in the query is fine");
  for (const p of ["/media/%E4%B8%AD%E6%96%87.mp4", "/media/a%20b.mp4", "/index.html"]) assert.notEqual((await rawCall(base, "GET", p)).body.code, "NONCANONICAL_PATH", p);
});
