/* Download one file for asr-models.js (#70). Only https, only the hosts in desktop/asr-manifest.json, and every redirect
   is checked the same way before it is followed (at most 5). No cookies, no credentials, nothing sent but the GET.
   The desktop main process uses it after the streamer said yes to the download. */
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

function fetchFile(url, dest, { onProgress = () => {}, signal, hosts = manifest.hosts, timeout = 60000 } = {}) {
  if (!allowedUrl(url, hosts)) return Promise.reject(Object.assign(new Error("not a listed host: " + url), { code: "ASR_HOST_REFUSED" }));
  return new Promise((resolve, reject) => {
    let hops = 0, done = false;
    const finish = (err) => { if (done) return; done = true; if (err) { fs.rmSync(dest, { force: true }); reject(err); } else resolve(); };
    const get = (u) => {
      const req = https.get(u, { headers: { "User-Agent": "MontClip", Accept: "*/*" }, timeout }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          if (++hops > 5) return finish(new Error("too many redirects"));
          try { return get(nextUrl(u, res.headers.location, hosts)); } catch (e) { return finish(e); }
        }
        if (res.statusCode !== 200) { res.resume(); return finish(new Error("HTTP " + res.statusCode + " from " + new URL(u).hostname)); }
        const out = fs.createWriteStream(dest);
        let n = 0;
        res.on("data", (c) => { n += c.length; onProgress(n); });
        res.on("error", finish);
        out.on("error", finish);
        out.on("finish", () => finish());
        res.pipe(out);
      });
      req.on("timeout", () => req.destroy(new Error("no answer from " + new URL(u).hostname)));
      req.on("error", finish);
      if (signal) signal.addEventListener("abort", () => req.destroy(new Error("cancelled")), { once: true });
    };
    get(url);
  });
}

module.exports = { nextUrl, fetchFile };
