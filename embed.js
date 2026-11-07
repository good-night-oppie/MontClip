/* Embedded in Cindy (MONTCLIP_HOST=cindy, the MontClip-Cindy plugin): the plugin's pages frame this server, and a
   frame cannot add a request header. The plugin worker starts the engine with a fresh random 64-hex token
   (MONTCLIP_EMBED_TOKEN). The frame's first page load carries it once in the URL (?token=) and is sent on (302) to
   the same URL without it, with an HttpOnly cookie; every later request carries the cookie. The worker's own calls
   (and mcp-server.js) send the token as X-MontClip-Session. Anything else on this machine gets 403.

   The cookie is not the token: each page load that trades the token gets its own random cookie session, which the
   server remembers and can end (revoke) on its own — what a later layer binds a Cindy task to (MontClip-Cindy #18).

   The token never goes into a Location, a log line or an error message, and every answer says
   Referrer-Policy: no-referrer, so the address it arrived in is not passed on. The headless browser an export
   starts gets a one-time ticket in its URL instead of the token: the token stays off the command line. */
"use strict";
const crypto = require("crypto");

const COOKIE = "montclip_embed";
const TOKEN_RE = /^[a-f0-9]{64}$/;
const TICKET_MS = 60_000;
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

  /** The live cookie session a request carries, or null. Only a value this server handed out counts. */
  function cookieSession(req) {
    const value = cookieValue(req.headers.cookie);
    for (const id of sessions) if (sameSecret(value, id)) return id;
    return null;
  }
  const authorized = (req) => sameSecret(req.headers["x-montclip-session"], token) || cookieSession(req) !== null;
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

  return { authorized, bootstrap, launchTicket, cookieSession, revoke };
}

module.exports = { COOKIE, COOKIE_ATTRS, MAX_SESSIONS, TOKEN_RE, sameSecret, cookieValue, createEmbed };
