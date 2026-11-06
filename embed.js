/* Embedded in Cindy (MONTCLIP_HOST=cindy, the MontClip-Cindy plugin): the plugin's pages frame this server, and a
   frame cannot add a request header. The plugin worker starts the engine with a fresh random 64-hex token
   (MONTCLIP_EMBED_TOKEN). The frame's first page load carries it once in the URL (?token=), gets it back as an
   HttpOnly cookie and is sent on (302) to the same URL without it; every later request carries the cookie. The
   worker's own calls (and mcp-server.js) send it as X-MontClip-Session. Anything else on this machine gets 403.

   The token never goes into a Location, a log line or an error message, and every answer says
   Referrer-Policy: no-referrer, so the address it arrived in is not passed on. The headless browser an export
   starts gets a one-time ticket in its URL instead of the token: the token stays off the command line. */
"use strict";
const crypto = require("crypto");

const COOKIE = "montclip_embed";
const TOKEN_RE = /^[a-f0-9]{64}$/;
const TICKET_MS = 60_000;

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

  const authorized = (req) =>
    sameSecret(req.headers["x-montclip-session"], token) || sameSecret(cookieValue(req.headers.cookie), token);

  /** A ticket the headless browser's first page load trades for the cookie: once, within a minute. */
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

  /** A page load (GET) with ?token= gets the cookie and a 302 to the same URL without it. True when answered. */
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
    // one leading slash: a request path like //host/… must not turn into a redirect to another site
    const location = "/" + url.pathname.replace(/^[/\\]+/, "") + url.search;
    // SameSite=None + Partitioned: the frame sits inside Cindy's own page (another site); Secure is allowed on loopback
    res.writeHead(302, {
      "Set-Cookie": `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=None; Secure; Partitioned`,
      Location: location, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer",
    });
    res.end();
    return true;
  }

  return { authorized, bootstrap, launchTicket };
}

module.exports = { COOKIE, TOKEN_RE, sameSecret, cookieValue, createEmbed };
