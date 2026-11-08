/* The editor inside another app's page (?host=cindy: the MontClip plugin's task view in Cindy). The chat is the
   host's own, so the editor's built-in assistant is hidden; the colours follow the host's light / dark theme, which
   the plugin page sends in (?theme= at load, then postMessage {type:"montclip-host-theme", scheme} from the page
   that frames the editor). Loaded before app.js; sets <html data-host data-host-theme>. Pure parts tested in Node. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.MontClipHost = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const HOSTS = ["cindy"];
  const SCHEMES = ["light", "dark"];

  /** The host named in a page URL's query (?host=), or null. */
  function hostFrom(search) {
    const h = new URLSearchParams(search || "").get("host");
    return HOSTS.includes(h) ? h : null;
  }
  /** Whether a page address (a full URL) is the editor inside another app; false for anything unreadable. Used by the
   *  desktop main process, which refuses the built-in assistant's requests from such a page (QQ on #219). */
  function embeddedUrl(url) {
    try { return !!hostFrom(new URL(String(url)).search); } catch { return false; }
  }
  /** "light" or "dark" — exactly one of those two values — or null for anything else. */
  function schemeFrom(value) {
    return typeof value === "string" && SCHEMES.includes(value) ? value : null;
  }
  /** A theme message's scheme, or null for anything else. */
  function themeMessage(data) {
    return data && typeof data === "object" && data.type === "montclip-host-theme" ? schemeFrom(data.scheme) : null;
  }
  /** The origin of the page that frames this one (the browser's ancestorOrigins, else the referrer's), or null when
   *  there is no framing page or its origin is opaque. */
  function parentOrigin(win) {
    if (!win.parent || win.parent === win) return null;
    let o = null;
    try { o = win.location.ancestorOrigins && win.location.ancestorOrigins.length ? win.location.ancestorOrigins[0] : null; } catch { }
    if (!o) try { o = win.document.referrer ? new URL(win.document.referrer).origin : null; } catch { }
    return o && o !== "null" ? o : null;
  }
  /** Whether a message event comes from the page that frames this one: its window and its origin both. */
  function fromParent(e, win, origin) {
    return !!origin && e.source === win.parent && e.origin === origin;
  }

  /* Which Cindy task this editor belongs to (MontClip-Cindy#18, QQ option ①). The worker registers a one-time ticket
     for the task; the frame's first address carries it once (?ticket=). The page takes it out of its address at once
     and hands it in with the id of its event stream (SSE event "conn"), which binds that one connection to the task
     on the server (POST /api/embed/claim). A ticket is never used twice: when the stream reconnects, the page asks the
     page that frames it for a new one — {type:"montclip-need-ticket"} out, {type:"montclip-host-ticket", ticket} back,
     taken only from that page (window and origin). The page itself never learns the task's id. */
  const TICKET_RE = /^[a-f0-9]{64}$/;
  /** The task ticket in a page URL's query (?ticket=), or null for anything that is not one. */
  function ticketFrom(search) {
    const t = new URLSearchParams(search || "").get("ticket");
    return TICKET_RE.test(t || "") ? t : null;
  }
  /** A ticket message's ticket, or null for anything else. */
  function ticketMessage(data) {
    return data && typeof data === "object" && data.type === "montclip-host-ticket" && TICKET_RE.test(data.ticket || "") ? data.ticket : null;
  }
  /** opts: {initial ticket or null, ask() → asks the framing page for a ticket}.
   *  → {connected(conn, claim): a new event stream, and how the page hands a ticket in (app.js: POST /api/embed/claim);
   *     ticket(t): a ticket from the framing page} */
  function taskBinding({ initial = null, ask }) {
    let unused = initial, waiting = null, claim = null;
    return {
      connected(conn, how) {
        if (typeof conn !== "string" || !conn || typeof how !== "function") return;
        claim = how;
        if (unused) { const t = unused; unused = null; waiting = null; claim(t, conn); return; }
        waiting = conn;
        ask();
      },
      ticket(t) {
        if (!t || !waiting) return;                   // nobody asked: not kept for later
        const conn = waiting; waiting = null;
        claim(t, conn);
      },
    };
  }

  function install(win) {
    const doc = win.document, el = doc.documentElement;
    const host = hostFrom(win.location.search);
    if (!host) return { embedded: false, host: null };
    el.dataset.host = host;
    const apply = (scheme) => { if (scheme) el.dataset.hostTheme = scheme; };
    apply(schemeFrom(new URLSearchParams(win.location.search).get("theme")) || "dark");
    const origin = parentOrigin(win);
    // the ticket leaves the address before anything else can read it (history, a reload, an error report)
    const initial = ticketFrom(win.location.search);
    const q = new URLSearchParams(win.location.search);
    if (q.has("ticket")) {
      q.delete("ticket");
      try { win.history.replaceState(win.history.state, "", win.location.pathname + (q.toString() ? "?" + q : "") + win.location.hash); } catch { }
    }
    const binding = taskBinding({
      initial,
      ask: () => { if (origin) try { win.parent.postMessage({ type: "montclip-need-ticket" }, origin); } catch { } },
    });
    win.addEventListener("message", (e) => {
      if (!fromParent(e, win, origin)) return;      // only the page that frames the editor
      apply(themeMessage(e.data));
      binding.ticket(ticketMessage(e.data));
    });
    return { embedded: true, host, taskConnected: binding.connected };
  }

  const api = { hostFrom, embeddedUrl, schemeFrom, themeMessage, ticketFrom, ticketMessage, taskBinding, parentOrigin, fromParent, install,
    embedded: false, host: null, taskConnected() { } };
  if (typeof window !== "undefined" && window.document) Object.assign(api, install(window));
  return api;
});
