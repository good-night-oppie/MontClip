/* Embedded in Cindy (MONTCLIP_HOST=cindy, the MontClip-Cindy plugin): the plugin's pages frame this server, and a
   frame cannot add a request header. The plugin worker starts the engine with a fresh random 64-hex token
   (MONTCLIP_EMBED_TOKEN). The frame's first page load carries it once in the URL (?token=) and is sent on (302) to
   the same URL without it, with an HttpOnly cookie; every later request carries the cookie. The worker's own calls
   (and mcp-server.js) send the token as X-MontClip-Session. Anything else on this machine gets 403.

   The cookie is not the token: each page load that trades the token gets its own random cookie session, which the
   server remembers and can end (revoke) on its own — what a later layer binds a Cindy task to (MontClip-Cindy #18).

   Which Cindy task an editor page belongs to (MontClip-Cindy#18, QQ issuecomment-6723202388, option ①) is not in the
   cookie: one Cindy page frames every task's editor and they all share one cookie jar. The worker registers a task
   ticket for {project, session} (taskTicket: 256 random bits, one use, at most 60 s); the frame's first load carries
   it once (?ticket=), the page hands it in together with the id of its own event stream (SSE), and the server binds
   that one connection to the task (redeemTask). The binding lives only in memory and ends with the connection; a
   page that reconnects needs a new ticket from its parent page. The cookie stays the first gate only.

   The plugin's side panel and a task's editor talk over a BroadcastChannel (app.js startHostChannel), which every page
   of this origin shares, so its name carries the task's channel (MontClip#215 E3, QQ issuecomment-6726997672): an
   HMAC-SHA256 of project + "\0" + session under a key drawn when this engine starts (never the token, never written
   down), cut to 128 bits. A page gets it only by trading a task ticket: the editor with its claim, the panel with
   redeemChannel, which binds nothing.

   The token never goes into a Location, a log line or an error message, and every answer says
   Referrer-Policy: no-referrer, so the address it arrived in is not passed on. The headless browser an export
   starts gets a one-time ticket in its URL instead of the token: the token stays off the command line. */
"use strict";
const crypto = require("crypto");

const COOKIE = "montclip_embed";
const TOKEN_RE = /^[a-f0-9]{64}$/;
const TICKET_MS = 60_000;
const TASK_TICKET_MS = 60_000;                       // a task ticket (QQ: at most 60 s)
const MAX_TASK_TICKETS = 64;                         // the oldest unused one is dropped when a 65th is registered
const TASK_ID_RE = /^[A-Za-z0-9_-]{1,128}$/;         // a Cindy session or a project id
const MAX_SESSIONS = 64;                            // the oldest cookie session ends when a 65th is handed out
/* The cookie's attributes, decided by QQ on PR #198 (issuecomment-6698706427; ADR 2026-11-06-embed-cookie-samesite):
   the editor frame is cross-site to its Cindy page (cindy-ghost://<plugin>/… frames http://127.0.0.1:<port>/), and a
   cross-site frame neither receives nor sends a Lax / Strict cookie, so it is None + Partitioned (Secure is allowed
   on loopback). HttpOnly, Secure and Partitioned must stay. Cross-site forgery is stopped by the Host and Origin
   checks and the server-issued random session, not by SameSite. This is the only place the attributes are written;
   test/embed-server.test.js pins the exact string. */
const COOKIE_ATTRS = "Path=/; HttpOnly; SameSite=None; Secure; Partitioned";

/** Constant-time comparison of a request value with a secret. Compares bytes, not characters: a value of the same
 *  length in characters but not in bytes (é is two) is simply unequal, never an exception. */
function sameSecret(value, secret) {
  if (typeof value !== "string" || typeof secret !== "string") return false;
  const a = Buffer.from(value), b = Buffer.from(secret);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** The value of one cookie in a Cookie header, or null. */
function cookieValue(header, name = COOKIE) {
  for (const part of String(header || "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}

/** opts: {token, hostAllowed(host) → bool, now() → ms}. Throws when the token is not 64 lowercase hex. */
function createEmbed({ token, hostAllowed, now = Date.now }) {
  if (!TOKEN_RE.test(token || "")) throw new Error("Embedding in Cindy requires a fresh 64-hex session token (MONTCLIP_EMBED_TOKEN)");
  const tickets = new Map();                        // one-time ticket → expiry (ms)
  const sessions = new Set();                       // live cookie sessions, oldest first
  const taskTickets = new Map();                    // task ticket → {project, session, exp}, oldest first
  const channelKey = crypto.randomBytes(32);        // this engine's own: a restart gives every task a new channel

  /** The live cookie session a request carries, or null. Only a value this server handed out counts. */
  function cookieSession(req) {
    const value = cookieValue(req.headers.cookie);
    for (const id of sessions) if (sameSecret(value, id)) return id;
    return null;
  }
  /** The plugin worker (or mcp-server.js) itself: the token as X-MontClip-Session. A page has only its cookie. */
  const worker = (req) => sameSecret(req.headers["x-montclip-session"], token);
  const authorized = (req) => worker(req) || cookieSession(req) !== null;
  /** End one cookie session: its cookie gets 403 from now on. True when it was live. */
  const revoke = (id) => sessions.delete(id);

  /** A ticket the headless browser's first page load trades for a cookie: once, within a minute. */
  function launchTicket() {
    const t = now();
    for (const [k, exp] of tickets) if (exp <= t) tickets.delete(k);
    const ticket = crypto.randomBytes(32).toString("hex");
    tickets.set(ticket, t + TICKET_MS);
    return ticket;
  }
  /** A one-time ticket for a task's editor frame: registered by the worker, traded once (redeemTask) within 60 s. */
  function taskTicket({ project, session } = {}) {
    if (!TASK_ID_RE.test(String(project || "")) || !TASK_ID_RE.test(String(session || "")))
      throw Object.assign(new Error("a task ticket needs the task's project and session ids"), { code: 400 });
    const t = now();
    for (const [k, v] of taskTickets) if (v.exp <= t) taskTickets.delete(k);
    const ticket = crypto.randomBytes(32).toString("hex");
    taskTickets.set(ticket, { project, session, exp: t + TASK_TICKET_MS });
    while (taskTickets.size > MAX_TASK_TICKETS) taskTickets.delete(taskTickets.keys().next().value);
    return { ticket, expiresInMs: TASK_TICKET_MS };
  }
  /** {project, session} for a live task ticket, which is used up by this call; null for anything else (reused,
   *  expired, never registered here — another engine's, say). A ticket presented is gone either way. */
  function redeemTask(value) {
    const t = now();
    for (const [k, v] of taskTickets) {
      if (!sameSecret(value, k)) continue;
      taskTickets.delete(k);
      return v.exp > t ? { project: v.project, session: v.session } : null;
    }
    return null;
  }
  /** The BroadcastChannel suffix of a task: 32 hex, the same for its editor and its panel, unguessable for others. */
  function channelFor({ project, session }) {
    return crypto.createHmac("sha256", channelKey).update(String(project) + "\0" + String(session)).digest("hex").slice(0, 32);
  }
  /** The panel's way to its task's channel: a task ticket, used up; null for anything redeemTask refuses. */
  function redeemChannel(value) {
    const task = redeemTask(value);
    return task ? channelFor(task) : null;
  }
  function redeem(value) {
    if (sameSecret(value, token)) return true;
    const t = now();
    for (const [k, exp] of tickets) {
      if (!sameSecret(value, k)) continue;
      tickets.delete(k);
      return exp > t;
    }
    return false;
  }

  /** A page load (GET) with ?token= gets a new cookie session and a 302 to the same URL without it. True when answered. */
  function bootstrap(req, res) {
    if (req.method !== "GET" || !hostAllowed(req.headers.host)) return false;
    const url = new URL(req.url, "http://localhost");
    if (!url.searchParams.has("token")) return false;
    if (!redeem(url.searchParams.get("token"))) {
      res.writeHead(403, { "Content-Type": "application/json", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" });
      res.end(JSON.stringify({ error: "forbidden: wrong or used session token" }));
      return true;
    }
    url.searchParams.delete("token");
    const id = crypto.randomBytes(32).toString("hex");
    sessions.add(id);
    while (sessions.size > MAX_SESSIONS) sessions.delete(sessions.values().next().value);
    // one leading slash: a request path like //host/… must not turn into a redirect to another site
    const location = "/" + url.pathname.replace(/^[/\\]+/, "") + url.search;
    res.writeHead(302, {
      "Set-Cookie": `${COOKIE}=${id}; ${COOKIE_ATTRS}`,
      Location: location, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer",
    });
    res.end();
    return true;
  }

  return { authorized, worker, taskTicket, redeemTask, channelFor, redeemChannel, bootstrap, launchTicket, cookieSession, revoke };
}

/** The review's page cookie (#321): the one place its attributes are written. Only the review's own paths ever receive it. */
module.exports = { COOKIE, COOKIE_ATTRS, MAX_SESSIONS, TOKEN_RE, TASK_TICKET_MS, TASK_ID_RE, sameSecret, cookieValue, createEmbed };
