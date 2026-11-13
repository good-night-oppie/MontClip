/* E5b (MontClip#215, MontClip-Cindy#18 — QQ issuecomment-6723202388, option ①): which Cindy task an embedded editor
   belongs to is bound to its event-stream connection, never to the cookie (one Cindy page frames every task's editor,
   and they share one cookie jar). The worker registers a one-time task ticket (≥128 random bits, ≤60 s, bound to
   {project, session}); the page trades it with its own connection id; UI commands and export tickets for a task go
   only to the connections bound to it, and answers are taken by the one-time command id alone. Forged, reused,
   expired and another engine's tickets bind nothing. Synthetic data only; no browser (see embed-task-browser.test.js). */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const { createEmbed, TASK_TICKET_MS } = require("../server/embed");
const Host = require("../host-embed");
const { toolError } = require("../server/tool-error");
const { redactProblem } = require("../problem-redact");
const { makeDataDir, freePort, endTree } = require("./helpers");

const ROOT = path.join(__dirname, "..");
const hex = () => crypto.randomBytes(32).toString("hex");
const T = { project: "p_synthetic_a", session: "synthetic-task-A" };

/* ── the ticket (embed.js) ── */

test("a task ticket: 256 random bits, at most 60 s, one use, bound to its project and session", () => {
  let clock = 1_000_000;
  const e = createEmbed({ token: hex(), hostAllowed: () => true, now: () => clock });
  const a = e.taskTicket(T), b = e.taskTicket(T);
  assert.match(a.ticket, /^[a-f0-9]{64}$/, "64 hex = 256 bits (QQ: at least 128)");
  assert.notEqual(a.ticket, b.ticket);
  assert.ok(a.expiresInMs <= 60_000 && TASK_TICKET_MS <= 60_000);
  assert.deepEqual(e.redeemTask(a.ticket), T);
  assert.equal(e.redeemTask(a.ticket), null, "used once, gone");
  clock += TASK_TICKET_MS;
  assert.equal(e.redeemTask(b.ticket), null, "expired at 60 s");
  for (const bad of [{}, { project: "p" }, { session: "s" }, { project: "../x", session: "s" }, { project: "p", session: "a b" }])
    assert.throws(() => e.taskTicket(bad), (err) => err.code === 400, JSON.stringify(bad));
});

test("forged, wrong-length and another engine's tickets bind nothing", () => {
  const one = createEmbed({ token: hex(), hostAllowed: () => true });
  const other = createEmbed({ token: hex(), hostAllowed: () => true });   // another engine (another port)
  const theirs = other.taskTicket(T).ticket;
  const mine = one.taskTicket(T).ticket;
  for (const v of [hex(), theirs, mine.slice(0, 63), mine + "0", mine.toUpperCase(), "", null, 7, { ticket: mine }])
    assert.equal(one.redeemTask(v), null, String(v).slice(0, 12));
  assert.deepEqual(one.redeemTask(mine), T, "its own still works after all that");
});

/* ── the page (host-embed.js) ── */

test("the page uses the ticket in its first address once; after a reconnect it asks its parent for a new one", () => {
  const claims = [], asks = [];
  const b = Host.taskBinding({ initial: "a".repeat(64), ask: () => asks.push(1) });
  const how = (t, c) => claims.push([t, c]);
  b.ticket("c".repeat(64));                           // nobody asked: not kept for later
  b.connected("conn1", how);
  assert.deepEqual(claims, [["a".repeat(64), "conn1"]]);
  b.connected("conn2", how);                          // the stream reconnected: the old ticket is never sent again
  assert.equal(asks.length, 1);
  assert.equal(claims.length, 1);
  b.ticket("b".repeat(64));
  assert.deepEqual(claims[1], ["b".repeat(64), "conn2"]);
  b.ticket("d".repeat(64));                           // an extra one is not used
  assert.equal(claims.length, 2);
  assert.equal(Host.ticketFrom("?host=cindy&ticket=" + "a".repeat(64)), "a".repeat(64));
  for (const s of ["?ticket=xyz", "?ticket=" + "A".repeat(64), "?host=cindy"]) assert.equal(Host.ticketFrom(s), null, s);
  assert.equal(Host.ticketMessage({ type: "montclip-host-ticket", ticket: "zz" }), null);
});

function fakeWindow(search) {
  const listeners = [], fetched = [], posted = [], replaced = [];
  const parent = { postMessage: (m, o) => posted.push([m, o]) };
  const win = {
    parent, fetched, posted, replaced, listeners,
    location: { search, pathname: "/", hash: "", ancestorOrigins: ["cindy-ghost://montclip"] },
    history: { state: null, replaceState: (s, _t, u) => { replaced.push(u); win.location.search = u.slice(1); } },
    document: { documentElement: { dataset: {} }, referrer: "" },
    addEventListener: (type, fn) => { if (type === "message") listeners.push(fn); },
  };
  win.claim = (ticket, conn) => fetched.push(["/api/embed/claim", { ticket, conn }]);   // what app.js does
  return win;
}
test("the ticket leaves the address at once; a ticket message counts only from the framing page's window and origin", () => {
  const t1 = hex(), t2 = hex();
  const win = fakeWindow("?host=cindy&ticket=" + t1 + "&theme=light");
  const api = Host.install(win);
  assert.equal(api.embedded, true);
  assert.deepEqual(win.replaced, ["/?host=cindy&theme=light"], "no ticket left in the address");
  api.taskConnected("conn1", win.claim);
  assert.deepEqual(win.fetched, [["/api/embed/claim", { ticket: t1, conn: "conn1" }]]);
  api.taskConnected("conn2", win.claim);
  assert.deepEqual(win.posted, [[{ type: "montclip-need-ticket" }, "cindy-ghost://montclip"]], "asks only its parent's origin");
  const send = (e) => win.listeners.forEach((fn) => fn(e));
  send({ source: {}, origin: "cindy-ghost://montclip", data: { type: "montclip-host-ticket", ticket: hex() } });          // another window
  send({ source: win.parent, origin: "http://127.0.0.1:47778", data: { type: "montclip-host-ticket", ticket: hex() } }); // another origin
  assert.equal(win.fetched.length, 1, "forged ticket messages are ignored");
  send({ source: win.parent, origin: "cindy-ghost://montclip", data: { type: "montclip-host-ticket", ticket: t2 } });
  assert.deepEqual(win.fetched[1], ["/api/embed/claim", { ticket: t2, conn: "conn2" }]);
});

/* ── over HTTP: one embedded engine, two task editors (A, B) on the same port ── */

async function engine(t) {
  // the engine stops before its data folder is removed (helpers.js, #233): this hook is added first, so it runs first
  let stop = () => { };
  t.after(() => stop());
  const token = hex(), port = await freePort(), dir = makeDataDir(t);
  let out = "";
  const child = spawn(process.execPath, [path.join(ROOT, "server/server.js")], {
    cwd: ROOT, stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, PORT: String(port), HOST: "127.0.0.1", FABLECUT_DATA_DIR: dir, FABLECUT_NO_FS_WATCH: "1",
      FABLECUT_CHROME: path.join(dir, "no-such-browser"), MONTCLIP_DESKTOP: "", MONTCLIP_HOST: "cindy", MONTCLIP_EMBED_TOKEN: token },
  });
  child.stdout.on("data", (c) => { out += c; });
  child.stderr.on("data", (c) => { out += c; });
  const exited = new Promise((r) => child.on("exit", r));
  stop = async () => { endTree(child); await exited; };
  const base = `http://127.0.0.1:${port}`, worker = { "X-MontClip-Session": token };
  for (let i = 0; i < 400; i++) {
    try { if ((await fetch(base + "/api/project", { headers: worker })).status === 200) break; } catch { }
    await new Promise((r) => setTimeout(r, 50));
  }
  const boot = await fetch(base + "/?token=" + token, { redirect: "manual" });
  const page = { Cookie: boot.headers.get("set-cookie").split(";")[0] };
  const project = (await call(base, "/api/projects", undefined, worker)).body.active;
  return { base, worker, page, project, token, out: () => out };
}
const call = (base, p, body, headers = {}) => fetch(base + p, { method: body === undefined ? "GET" : "POST", headers, body: body === undefined ? undefined : JSON.stringify(body) })
  .then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
/* An editor page's event stream (with the page's cookie): its conn id, and every ui-command / export event it gets.
   answer: the page's reply to a ui-command (it posts the receipt with the command's id). */
async function editor(t, s, answer = (c) => ({ ok: true, cmd: c.cmd })) {
  const seen = { commands: [], exports: [], conn: null };
  let buf = "";
  const req = http.get(s.base + "/api/events", { headers: s.page }, (res) => {
    res.setEncoding("utf8");
    res.on("data", (c) => {
      buf += c;
      let i;
      while ((i = buf.indexOf("\n\n")) >= 0) {
        const block = buf.slice(0, i); buf = buf.slice(i + 2);
        const ev = /^event: (.*)$/m.exec(block)?.[1], data = /^data: (.*)$/m.exec(block)?.[1];
        if (ev === "conn") seen.conn = JSON.parse(data).conn;
        if (ev === "export") seen.exports.push(JSON.parse(data));
        if (ev === "ui-command") {
          const c = JSON.parse(data);
          seen.commands.push(c);
          call(s.base, "/api/ui/command/result", { id: c.id, ...answer(c) }, s.page);
        }
      }
    });
  });
  req.on("error", () => { });
  t.after(() => req.destroy());
  for (let i = 0; i < 100 && !seen.conn; i++) await new Promise((r) => setTimeout(r, 20));
  assert.ok(seen.conn, "the stream says its connection id");
  seen.close = () => req.destroy();
  return seen;
}
const ticketFor = async (s, session, project = s.project) => (await call(s.base, "/api/embed/ticket", { project, session }, s.worker)).body.ticket;
const claim = (s, ticket, conn) => call(s.base, "/api/embed/claim", { ticket, conn }, s.page);
const command = (s, body, headers = s.worker) => call(s.base, "/api/ui/command", body, headers);

test("only the worker registers task tickets; a page cannot", async (t) => {
  const s = await engine(t);
  assert.equal((await call(s.base, "/api/embed/ticket", { project: s.project, session: "A" }, s.page)).status, 403);
  assert.equal((await call(s.base, "/api/embed/ticket", { project: s.project, session: "a b" }, s.worker)).status, 400);
  const r = await call(s.base, "/api/embed/ticket", { project: s.project, session: "A" }, s.worker);
  assert.equal(r.status, 200);
  assert.match(r.body.ticket, /^[a-f0-9]{64}$/);
  assert.ok(r.body.expiresInMs <= 60_000);
});

test("forged, reused and another engine's tickets are 403 and bind nothing", async (t) => {
  const s = await engine(t), other = await engine(t);
  const ed = await editor(t, s);
  const theirs = await ticketFor(other, "A", other.project);
  for (const bad of [hex(), theirs, "", undefined]) {
    const r = await claim(s, bad, ed.conn);
    assert.equal(r.status, 403, String(bad));
    assert.equal(r.body.code, "TASK_TICKET_REFUSED");
  }
  assert.equal((await command(s, { cmd: "state", session: "A" })).status, 409, "still bound to nothing");
  const ticket = await ticketFor(s, "A");
  assert.equal((await claim(s, ticket, "not-a-connection")).status, 403, "a ticket for a connection that is not open here");
  assert.equal((await claim(s, ticket, ed.conn)).status, 403, "…is used up by that try");
  const fresh = await ticketFor(s, "A");
  assert.equal((await claim(s, fresh, ed.conn)).status, 200);
  const other2 = await editor(t, s);
  assert.equal((await claim(s, fresh, other2.conn)).status, 403, "reused");
  assert.equal((await claim(s, await ticketFor(s, "B"), ed.conn)).status, 403, "a bound connection is not bound again");
  assert.equal((await command(s, { cmd: "state", session: "A" })).status, 200);
  assert.equal((await command(s, { cmd: "state", session: "B" })).status, 409);
});

test("A/B: two task editors on one engine and port — B's commands and export tickets never reach A", async (t) => {
  const s = await engine(t);
  const a = await editor(t, s, (c) => ({ ok: true, cmd: c.cmd, time: 0, session: "B" }));   // A claims to be B: not believed
  const b = await editor(t, s, (c) => ({ ok: true, cmd: c.cmd, time: c.t ?? 1 }));
  assert.equal((await claim(s, await ticketFor(s, "task-A"), a.conn)).status, 200);
  assert.equal((await claim(s, await ticketFor(s, "task-B"), b.conn)).status, 200);

  const seek = await command(s, { cmd: "seek", t: 3, session: "task-B", project: s.project });
  assert.equal(seek.status, 200);
  assert.equal(seek.body.time, 3, "B answered");
  const stateA = await command(s, { cmd: "state", session: "task-A", project: s.project });
  assert.equal(stateA.status, 200);
  assert.deepEqual(a.commands.map((c) => c.cmd), ["state"], "A got only its own command");
  assert.deepEqual(b.commands.map((c) => c.cmd), ["seek"], "B got only its own");
  assert.ok(!JSON.stringify([...a.commands, ...b.commands]).includes("task-"), "commands do not carry the task id to the page");
  assert.equal((await command(s, { cmd: "state", session: "task-B", project: "p_other" })).status, 409, "bound to another project");
  assert.equal((await command(s, { cmd: "state", session: "task-C" })).status, 409, "no editor of that task");
  assert.equal((await call(s.base, "/api/ui/command/result", { id: crypto.randomUUID(), session: "task-B" }, s.page)).status, 409,
    "a receipt without a live command id is not taken");
  assert.equal((await command(s, { cmd: "state", session: "task-B" }, s.page)).status, 403, "a page cannot send commands");

  const job = await call(s.base, "/api/export/request", { where: "tab", session: "task-B", project: s.project }, s.worker);
  assert.equal(job.status, 200, JSON.stringify(job.body));
  for (let i = 0; i < 50 && !b.exports.length; i++) await new Promise((r) => setTimeout(r, 20));
  assert.deepEqual(b.exports.map((x) => x.id), [job.body.id], "B got its export ticket");
  assert.equal(a.exports.length, 0, "A did not");
  const claimAs = (ed) => call(s.base, "/api/export/job/claim?id=" + job.body.id, { tabId: "t", conn: ed.conn }, s.page);
  assert.equal((await claimAs(a)).status, 409, "A cannot claim B's job");
  assert.equal((await call(s.base, "/api/export/job/claim?id=" + job.body.id, { tabId: "t" }, s.page)).status, 409, "nor can a page without a connection");
  assert.equal((await claimAs(b)).status, 200, "B can");
  await call(s.base, "/api/export/job/cancel?id=" + job.body.id, {}, s.worker);

  b.close();
  await new Promise((r) => setTimeout(r, 200));
  assert.equal((await command(s, { cmd: "state", session: "task-B" })).status, 409, "the binding ended with B's connection");
  assert.equal((await command(s, { cmd: "state", session: "task-A" })).status, 200);
});

test("the ticket stays out of logs, error text and Referer: no-referrer on every editor page, nothing printed", async (t) => {
  const s = await engine(t);
  const ticket = await ticketFor(s, "A");
  for (const p of ["/?host=cindy&ticket=" + ticket, "/index.html?ticket=" + ticket, "/app.js", "/host-embed.js", "/style.css"]) {
    const r = await fetch(s.base + p, { headers: s.page });
    assert.equal(r.status, 200, p);
    assert.equal(r.headers.get("referrer-policy"), "no-referrer", p);
  }
  await claim(s, ticket, "nope");
  assert.ok(!s.out().includes(ticket), "the engine's output never shows a ticket");
  const msg = "page http://127.0.0.1:47777/?host=cindy&ticket=" + ticket + "&theme=dark failed";
  // the shapes a ticket can take in a message: a page address, a claim body, a key=value pair (Rea, #251 review)
  const body = 'POST /api/embed/claim {"ticket":"' + ticket + '","conn":"c1"} refused';
  for (const m of [msg, body, "ticket=" + ticket, "ticket: " + ticket]) {
    assert.ok(!JSON.stringify(toolError({ error: m })).includes(ticket), "the tool error outlet (#240) takes it out: " + m.slice(0, 24));
    assert.ok(!redactProblem(m).includes(ticket), "and so do copied problem details: " + m.slice(0, 24));
  }
  assert.ok(JSON.stringify(toolError({ error: body })).includes('"conn'), "the rest of the message stays readable");
  assert.ok(JSON.stringify(toolError({ error: msg })).includes("theme=dark"), "and the rest of the address too");
});

test("a first address with both the launch token and a ticket: the 302 keeps the ticket, drops the token, and the ticket still binds", async (t) => {
  // QQ, #251: the ticket in this Location stays within the frame's one first navigation; the bootstrap must not use it up
  const s = await engine(t);
  const ticket = await ticketFor(s, "A");
  const r = await fetch(s.base + "/?token=" + s.token + "&host=cindy&ticket=" + ticket, { redirect: "manual" });
  assert.equal(r.status, 302);
  const location = r.headers.get("location");
  assert.ok(!location.includes(s.token), "no launch token in the Location");
  assert.equal(new URL(location, s.base).searchParams.get("ticket"), ticket, "the ticket goes on with the same navigation");
  assert.equal(r.headers.get("cache-control"), "no-store");
  assert.equal(r.headers.get("referrer-policy"), "no-referrer");
  const page = { Cookie: r.headers.get("set-cookie").split(";")[0] };
  const ed = await editor(t, { ...s, page });
  assert.equal((await claim({ ...s, page }, ticket, ed.conn)).status, 200, "the bootstrap did not use the ticket up");
  assert.equal((await command(s, { cmd: "state", session: "A" })).status, 200);
});
