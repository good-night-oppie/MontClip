/* Embedded in Cindy (MONTCLIP_HOST=cindy, embed.js): the engine answers only requests that carry its session token —
   as X-MontClip-Session or as the montclip_embed cookie a page load with ?token= trades for — and the token never
   shows up in a redirect, a log line, an error message or a Referer. Without MONTCLIP_HOST=cindy nothing changes.
   Synthetic requests against a throwaway data dir; no real media. */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const crypto = require("node:crypto");
const path = require("node:path");
const { makeDataDir, freePort, rawGet, startServer } = require("./helpers");
const Embed = require("../embed");

const ROOT = path.join(__dirname, "..");
const hex = () => crypto.randomBytes(32).toString("hex");

/** server.js with extra env; resolves {base, port, out(), stop} once it answers `ready(base, port)`, or {exit, out()} */
async function launch(t, env, ready) {
  const port = await freePort();
  const child = spawn(process.execPath, [path.join(ROOT, "server.js")], {
    cwd: ROOT, stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, PORT: String(port), HOST: "127.0.0.1", FABLECUT_DATA_DIR: makeDataDir(t),
      FABLECUT_NO_FS_WATCH: "1", NODE_DEBUG: "", MONTCLIP_DESKTOP: "", MONTCLIP_HOST: "", MONTCLIP_EMBED_TOKEN: "", ...env },
  });
  let log = "", exit = null;
  child.stdout.on("data", (c) => { log += c; });
  child.stderr.on("data", (c) => { log += c; });
  const exited = new Promise((r) => child.on("exit", (code, signal) => { exit = code ?? signal ?? "exited"; r(); }));
  const stop = async () => { if (exit === null) { child.kill(); await exited; } };
  t.after(stop);
  const base = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline && exit === null) {
    try { if (await ready(base, port)) return { base, port, out: () => log, stop, alive: () => exit === null }; } catch { }
    await new Promise((r) => setTimeout(r, 50));
  }
  await Promise.race([exited, new Promise((r) => setTimeout(r, 2000))]);
  return { exit, out: () => log };
}

async function embedded(t, token = hex()) {
  const s = await launch(t, { MONTCLIP_HOST: "cindy", MONTCLIP_EMBED_TOKEN: token },
    async (base) => (await fetch(base + "/api/project", { headers: { "X-MontClip-Session": token } })).status === 200);
  assert.ok(s.base, "the embedded engine started:\n" + s.out());
  return { ...s, token };
}

test("embedded start is refused without loopback, a 64-hex token, or next to desktop mode — and never echoes the token", async (t) => {
  const near = "abc" + hex().slice(3) + "0";      // 65 characters: almost a token
  for (const env of [
    { MONTCLIP_HOST: "cindy" },
    { MONTCLIP_HOST: "cindy", MONTCLIP_EMBED_TOKEN: near },
    { MONTCLIP_HOST: "cindy", MONTCLIP_EMBED_TOKEN: hex().toUpperCase() },
    { MONTCLIP_HOST: "cindy", MONTCLIP_EMBED_TOKEN: hex(), HOST: "0.0.0.0" },
    { MONTCLIP_HOST: "cindy", MONTCLIP_EMBED_TOKEN: hex(), MONTCLIP_DESKTOP: "1", MONTCLIP_SESSION_TOKEN: hex() },
  ]) {
    const s = await launch(t, env, async () => false);
    assert.ok(s.exit !== null && s.exit !== 0, "refused: " + JSON.stringify(Object.keys(env)));
    if (env.MONTCLIP_EMBED_TOKEN) assert.ok(!s.out().includes(env.MONTCLIP_EMBED_TOKEN), "the token is not in the output");
    if (env.MONTCLIP_SESSION_TOKEN) assert.ok(!s.out().includes(env.MONTCLIP_SESSION_TOKEN));
  }
});

test("embedded: only the session header or cookie gets in; anything else is 403", async (t) => {
  const s = await embedded(t);
  const get = (p, headers = {}) => fetch(s.base + p, { headers, redirect: "manual" });
  for (const p of ["/api/project", "/", "/index.html", "/app.js", "/api/events"]) assert.equal((await get(p)).status, 403, p);
  assert.equal((await get("/api/project", { "X-MontClip-Session": hex() })).status, 403);
  assert.equal((await get("/api/project", { Cookie: `montclip_embed=${hex()}` })).status, 403);
  assert.equal((await get("/api/project", { Cookie: `other=${s.token}` })).status, 403, "only the montclip_embed cookie counts");
  assert.equal((await get("/api/project", { "X-MontClip-Session": s.token.slice(0, 63) })).status, 403);
  assert.equal((await get("/api/project", { "X-MontClip-Session": s.token })).status, 200);
  assert.equal((await get("/api/project", { Cookie: `montclip_embed=${s.token}` })).status, 403, "the cookie is a session the server handed out, not the token");
  const boot = await get(`/?token=${s.token}`);
  const id = boot.headers.get("set-cookie").split(";")[0].split("=")[1];
  assert.equal((await get("/api/project", { Cookie: `a=1; montclip_embed=${id}; b=2` })).status, 200);
  // the token does not replace the Host / Origin checks
  assert.equal((await rawGet(s.port, "/api/project", { "X-MontClip-Session": s.token, Host: "evil.example" })).status, 403);
  assert.equal((await get("/api/project", { "X-MontClip-Session": s.token, Origin: "https://evil.example" })).status, 403);
  // a value with as many characters as the token but more bytes (é is two in UTF-8) is unequal, not a crash
  const r = await rawGet(s.port, "/api/project", { Host: `127.0.0.1:${s.port}`, Cookie: "montclip_embed=é" + s.token.slice(1) });
  assert.equal(r.status, 403);
  assert.equal((await get("/api/project", { "X-MontClip-Session": s.token })).status, 200, "still running");
  assert.ok(s.alive());
});

test("embedded: ?token= trades for an HttpOnly partitioned cookie and a 302 to the same URL without it", async (t) => {
  const s = await embedded(t);
  const r = await fetch(s.base + `/?exportJob=x_1&token=${s.token}&view=monitor`, { redirect: "manual" });
  assert.equal(r.status, 302);
  const location = r.headers.get("location");
  assert.equal(location, "/?exportJob=x_1&view=monitor");
  assert.ok(!location.includes(s.token));
  const cookie = r.headers.get("set-cookie");
  const id = cookie.match(/^montclip_embed=([a-f0-9]{64}); /)?.[1];
  assert.ok(id, cookie);
  assert.notEqual(id, s.token, "the cookie is its own random session, not the token");
  assert.ok(!cookie.includes(s.token));
  for (const attr of ["Path=/", "HttpOnly", "SameSite=None", "Secure", "Partitioned"]) assert.ok(cookie.split("; ").includes(attr), attr);
  assert.equal(r.headers.get("referrer-policy"), "no-referrer");
  assert.equal(r.headers.get("cache-control"), "no-store");

  // the cookie it handed out opens the page, and every embedded answer says no-referrer
  const page = await fetch(s.base + location, { headers: { Cookie: `montclip_embed=${id}` } });
  assert.equal(page.status, 200);
  assert.match(page.headers.get("content-type"), /html/);
  assert.equal(page.headers.get("referrer-policy"), "no-referrer");
  for (const [p, headers] of [["/api/project", { "X-MontClip-Session": s.token }], ["/api/project", {}], ["/no-such-file", { "X-MontClip-Session": s.token }]])
    assert.equal((await fetch(s.base + p, { headers })).headers.get("referrer-policy"), "no-referrer", p);

  // the token alone, or with nothing else in the query
  const bare = await fetch(s.base + `/index.html?token=${s.token}`, { redirect: "manual" });
  assert.equal(bare.status, 302);
  assert.equal(bare.headers.get("location"), "/index.html");
  // a path that starts with // stays on this server
  for (const raw of [`//evil.example/?token=${s.token}`, `/\\evil.example/x?token=${s.token}`]) {
    const odd = await rawGet(s.port, raw, { Host: `127.0.0.1:${s.port}` });
    assert.equal(odd.status, 302, raw);
    assert.match(odd.headers.location, /^\/(?![/\\])/, raw);
    assert.ok(!odd.headers.location.includes(s.token));
  }
});

test("embedded: a wrong token, a POST or a foreign Host gets no cookie, and the answers never carry the token", async (t) => {
  const s = await embedded(t);
  const wrong = hex();
  const r = await fetch(s.base + `/?token=${wrong}`, { redirect: "manual" });
  assert.equal(r.status, 403);
  assert.equal(r.headers.get("set-cookie"), null);
  assert.equal(r.headers.get("referrer-policy"), "no-referrer");
  const body = await r.text();
  assert.ok(!body.includes(wrong) && !body.includes(s.token), body);
  // POST cannot bootstrap: a form on another page must not be able to plant the cookie
  const post = await fetch(s.base + `/api/project?token=${s.token}`, { method: "POST", redirect: "manual", body: "{}" });
  assert.equal(post.status, 403);
  assert.equal(post.headers.get("set-cookie"), null);
  const host = await rawGet(s.port, `/?token=${s.token}`, { Host: "evil.example" });
  assert.equal(host.status, 403);
  assert.equal(host.headers["set-cookie"], undefined);
  assert.ok(!host.body.includes(s.token));
  // nothing the server printed while answering all of this names the token
  await s.stop();
  assert.ok(!s.out().includes(s.token), "the server log does not contain the session token");
  assert.ok(!s.out().includes(wrong));
});

test("embedded: the headless browser gets a one-time ticket, not the token", () => {
  let now = 1_000;
  const token = hex();
  const e = Embed.createEmbed({ token, hostAllowed: (h) => /^localhost(:\d+)?$/.test(h || ""), now: () => now });
  const answer = (url) => {
    const res = { code: 0, headers: null, writeHead(c, h) { this.code = c; this.headers = h; }, end() { } };
    const handled = e.bootstrap({ method: "GET", url, headers: { host: "localhost:1" } }, res);
    return handled ? res : null;
  };
  const ticket = e.launchTicket();
  assert.match(ticket, /^[a-f0-9]{64}$/);
  assert.notEqual(ticket, token);
  const first = answer(`/?exportJob=x_9&token=${ticket}`);
  assert.equal(first.code, 302);
  assert.equal(first.headers.Location, "/?exportJob=x_9");
  const cookie = first.headers["Set-Cookie"];
  const id = cookie.match(/^montclip_embed=([a-f0-9]{64}); /)?.[1];
  assert.ok(id && id !== token && id !== ticket && !cookie.includes(token), "the ticket buys a cookie session, never the token");
  assert.equal(e.authorized({ headers: { cookie: `montclip_embed=${id}` } }), true);
  assert.equal(answer(`/?token=${ticket}`).code, 403, "a ticket works once");
  const late = e.launchTicket();
  now += 60_001;
  assert.equal(answer(`/?token=${late}`).code, 403, "and only within a minute");
  assert.equal(answer("/?exportJob=x_9"), null, "no ?token=: not the bootstrap's business");
  assert.equal(e.bootstrap({ method: "GET", url: `/?token=${token}`, headers: { host: "evil.example" } }, {}), false);
  assert.equal(e.bootstrap({ method: "GET", url: `/?token=${token}`, headers: {} }, {}), false);
  assert.throws(() => Embed.createEmbed({ token: "x", hostAllowed: () => true }), (err) => !String(err.message).includes("x\""));
});

test("cookie sessions: one per page load, each can be ended on its own, the oldest end past the cap", () => {
  const token = hex();
  const e = Embed.createEmbed({ token, hostAllowed: () => true });
  const boot = () => {
    const res = { headers: null, writeHead(c, h) { this.headers = h; }, end() { } };
    e.bootstrap({ method: "GET", url: `/?token=${token}`, headers: { host: "localhost" } }, res);
    return res.headers["Set-Cookie"].match(/^montclip_embed=([a-f0-9]{64}); /)[1];
  };
  const req = (id) => ({ headers: { cookie: `montclip_embed=${id}` } });
  const a = boot(), b = boot();
  assert.notEqual(a, b);
  assert.equal(e.cookieSession(req(a)), a);
  assert.equal(e.cookieSession(req(b)), b);
  assert.equal(e.cookieSession(req(hex())), null, "a value the server did not hand out is no session");
  assert.equal(e.cookieSession({ headers: { "x-montclip-session": token } }), null, "the worker's header is not a cookie session");
  assert.equal(e.revoke(a), true);
  assert.equal(e.authorized(req(a)), false, "an ended session's cookie gets 403");
  assert.equal(e.authorized(req(b)), true, "the others stay");
  assert.equal(e.authorized({ headers: { "x-montclip-session": token } }), true);
  const ids = Array.from({ length: Embed.MAX_SESSIONS }, boot);
  assert.equal(e.authorized(req(b)), false, "past the cap the oldest session ends");
  assert.equal(e.authorized(req(ids[0])), true);
  assert.equal(e.authorized(req(ids.at(-1))), true);
  assert.equal(Embed.COOKIE_ATTRS, "Path=/; HttpOnly; SameSite=None; Secure; Partitioned", "SameSite is QQ's call (PR #198) — change it here and in this test together");
});

test("embed helpers: constant-time comparison never throws, cookie parsing takes only the named cookie", () => {
  const token = hex();
  assert.equal(Embed.sameSecret(token, token), true);
  assert.equal(Embed.sameSecret("é" + token.slice(1), token), false);
  assert.equal(Embed.sameSecret(undefined, token), false);
  assert.equal(Embed.sameSecret(["a"], token), false);
  assert.equal(Embed.cookieValue(`x=1; montclip_embed=${token}`), token);
  assert.equal(Embed.cookieValue(`xmontclip_embed=${token}`), null);
  assert.equal(Embed.cookieValue(undefined), null);
  // server.js builds the headless export URL from a ticket; the long-lived token is never put in it
  const src = require("node:fs").readFileSync(path.join(ROOT, "server.js"), "utf8");
  const urlLine = src.split("\n").find((l) => /url: \(id\) =>/.test(l));
  assert.match(urlLine, /launchTicket\(\)/);
  assert.ok(!/EMBED_TOKEN/.test(urlLine));
});

test("not embedded: ?token=, cookies and session headers change nothing (desktop / web behaviour as before)", async (t) => {
  for (const env of [{}, { MONTCLIP_HOST: "web", MONTCLIP_EMBED_TOKEN: hex() }, { MONTCLIP_EMBED_TOKEN: hex() }]) {
    const srv = await startServer(t, makeDataDir(t), { FABLECUT_NO_FS_WATCH: "1", MONTCLIP_DESKTOP: "", MONTCLIP_HOST: "", ...env });
    const token = env.MONTCLIP_EMBED_TOKEN || hex();
    assert.equal((await fetch(srv.base + "/api/project")).status, 200);
    const page = await fetch(srv.base + `/?token=${token}`, { redirect: "manual" });
    assert.equal(page.status, 200, "no redirect");
    assert.equal(page.headers.get("set-cookie"), null);
    assert.equal(page.headers.get("referrer-policy"), null);
    assert.equal((await fetch(srv.base + "/api/project", { headers: { "X-MontClip-Session": hex(), Cookie: `montclip_embed=${hex()}` } })).status, 200);
    assert.equal((await rawGet(srv.port, "/api/project", { Host: "evil.example" })).status, 403, "the Host check is unchanged");
    // t.after stops it (helpers.startServer)
  }
});

test("mcp-server.js sends X-MontClip-Session to an embedded engine", async (t) => {
  const s = await embedded(t);
  const r = await new Promise((resolve) => {
    const child = spawn(process.execPath, ["-e", `
      const m = require(${JSON.stringify(path.join(ROOT, "mcp-server.js"))});
      (async () => {
        const up = await m.ensureUIServer();
        const v = await m.callTool("fablecut_versions", {});
        process.stdout.write(JSON.stringify({ up, v }));
      })().catch((e) => { process.stdout.write(JSON.stringify({ error: String(e && e.message || e) })); });`], {
      cwd: ROOT, stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, FABLECUT_PORT: String(s.port), HOST: "127.0.0.1", FABLECUT_DATA_DIR: makeDataDir(t),
        FABLECUT_NO_AUTOSTART: "1", MONTCLIP_HOST: "cindy", MONTCLIP_EMBED_TOKEN: s.token },
    });
    let out = "", err = "";
    child.stdout.on("data", (c) => { out += c; });
    child.stderr.on("data", (c) => { err += c; });
    child.on("exit", () => resolve({ out, err }));
  });
  const res = JSON.parse(r.out || "{}");
  assert.equal(res.up, true, r.out + r.err);
  const text = JSON.stringify(res.v);
  assert.ok(!/forbidden|403/.test(text), text);
  assert.ok(!res.v?.isError, text);
});
