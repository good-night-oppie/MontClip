/* Download one file for asr-models.js (#70). Only https, only the listed hosts, and every redirect is checked the same
   way before it is followed (at most 5). No cookies, no credentials, nothing sent but the GET.
   It resumes (Deja, 2026-11-03): when `dest` already holds part of the file it asks for the rest with a Range header;
   206 appends, 200 (a server that ignores Range) starts again from the first byte. When the connection drops, what came
   is kept in `dest` for the next attempt. Checking the bytes is the caller's (asr-models.js). The desktop main process
   uses it after the streamer said yes to the download. */
"use strict";
const fs = require("node:fs");
const https = require("node:https");
const { manifest, allowedUrl } = require("./asr-models");

/** Where a redirect goes, if it may: a relative Location stays on the same host. */
function nextUrl(from, location, hosts = manifest.hosts) {
  let to;
  try { to = new URL(String(location), from).toString(); } catch { to = ""; }
  if (!allowedUrl(to, hosts)) throw Object.assign(new Error("a redirect left the listed hosts: " + (to ? new URL(to).hostname : String(location))), { code: "ASR_HOST_REFUSED" });
  return to;
}

function fetchFile(url, dest, { onProgress = () => {}, signal, hosts = manifest.hosts, timeout = 60000, get = https.get } = {}) {
  if (!allowedUrl(url, hosts)) return Promise.reject(Object.assign(new Error("not a listed host: " + url), { code: "ASR_HOST_REFUSED" }));
  if (signal && signal.aborted) return Promise.reject(Object.assign(new Error("cancelled"), { code: "ASR_DOWNLOAD_CANCELLED" }));
  return new Promise((resolve, reject) => {
    let hops = 0, done = false, req = null;
    const finish = (err) => { if (done) return; done = true; if (signal) signal.removeEventListener("abort", onAbort); if (err) reject(err); else resolve(); };
    const onAbort = () => { if (req) req.destroy(Object.assign(new Error("cancelled"), { code: "ASR_DOWNLOAD_CANCELLED" })); else finish(Object.assign(new Error("cancelled"), { code: "ASR_DOWNLOAD_CANCELLED" })); };
    if (signal) signal.addEventListener("abort", onAbort, { once: true });
    const go = (u) => {
      let have = 0;
      try { have = fs.statSync(dest).size; } catch { }
      const headers = { "User-Agent": "MontClip", Accept: "*/*" };
      if (have > 0) headers.Range = `bytes=${have}-`;
      req = get(u, { headers, timeout }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          if (++hops > 5) return finish(new Error("too many redirects"));
          try { return go(nextUrl(u, res.headers.location, hosts)); } catch (e) { return finish(e); }
        }
        if (res.statusCode === 416 && have > 0) { res.resume(); return finish(); }   // nothing left to send: the part is whole
        let append = false;
        if (res.statusCode === 206) {
          const m = /^bytes (\d+)-/.exec(String(res.headers["content-range"] || ""));
          if (!m || +m[1] !== have) { res.resume(); fs.rmSync(dest, { force: true }); return finish(new Error("the server sent another part of the file than asked for")); }
          append = true;
        } else if (res.statusCode !== 200) { res.resume(); return finish(new Error("HTTP " + res.statusCode + " from " + new URL(u).hostname)); }
        const out = fs.createWriteStream(dest, { flags: append ? "a" : "w" });
        const expect = Number(res.headers["content-length"]);
        let n = append ? have : 0, got = 0, failed = null;
        // what came stays in `dest` either way; the promise settles once the file is closed
        const fail = (e) => { if (!failed) { failed = e; res.unpipe(out); out.end(); } };
        res.on("data", (c) => { n += c.length; got += c.length; onProgress(n); });
        res.on("error", fail);
        res.on("aborted", () => fail(new Error("the connection dropped")));
        res.on("end", () => { if (expect >= 0 && got !== expect) fail(new Error("the connection dropped after " + got + " of " + expect + " bytes")); });
        out.on("error", (e) => { failed = failed || e; });
        out.on("close", () => finish(failed || undefined));
        res.pipe(out);
      });
      req.on("timeout", () => req.destroy(new Error("no answer from " + new URL(u).hostname)));
      req.on("error", (e) => finish(e));
    };
    go(url);
  });
}

module.exports = { nextUrl, fetchFile };
