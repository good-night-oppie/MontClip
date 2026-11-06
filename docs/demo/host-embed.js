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

  /** The host named in a page URL's query (?host=), or null. */
  function hostFrom(search) {
    const h = new URLSearchParams(search || "").get("host");
    return HOSTS.includes(h) ? h : null;
  }
  /** "light" / "dark" from a theme value: a ?theme=, or a CSS color-scheme such as "light dark" (its first word). */
  function schemeFrom(value) {
    const first = String(value || "").trim().toLowerCase().split(/\s+/)[0];
    return first === "light" || first === "dark" ? first : null;
  }
  /** A theme message from the page that frames this one, or null for anything else. */
  function themeMessage(data) {
    return data && typeof data === "object" && data.type === "montclip-host-theme" ? schemeFrom(data.scheme) : null;
  }

  function install(win) {
    const doc = win.document, el = doc.documentElement;
    const host = hostFrom(win.location.search);
    if (!host) return { embedded: false, host: null };
    el.dataset.host = host;
    const apply = (scheme) => { if (scheme) el.dataset.hostTheme = scheme; };
    apply(schemeFrom(new URLSearchParams(win.location.search).get("theme")) || "dark");
    win.addEventListener("message", (e) => {
      if (e.source !== win.parent) return;      // only the page that frames the editor
      apply(themeMessage(e.data));
    });
    return { embedded: true, host };
  }

  const api = { hostFrom, schemeFrom, themeMessage, install, embedded: false, host: null };
  if (typeof window !== "undefined" && window.document) Object.assign(api, install(window));
  return api;
});
