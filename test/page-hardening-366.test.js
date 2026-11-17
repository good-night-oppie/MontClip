"use strict";
// #366 part B (QQ 6930008236 ③ ④): the editor page carries a script policy in the browser and in Cindy too,
// and what the data folders hand out is never a script or a page. (The path= key moved to #369.)
// Synthetic files only; the server runs on a fresh data folder.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path");
const { makeDataDir, startServer } = require("./helpers");

const NO_WATCH = { FABLECUT_NO_FS_WATCH: "1" };
const get = async (base, p, headers) => { const r = await fetch(base + p, headers ? { headers } : undefined); const body = Buffer.from(await r.arrayBuffer()); return { r, body }; };

test("the editor page has a script policy in browser mode: own scripts only, no inline script, no eval, nothing from other sites but fonts and MediaPipe", async (t) => {
  const dir = makeDataDir(t);
  const { base } = await startServer(t, dir, NO_WATCH);
  for (const p of ["/", "/index.html", "/?host=cindy&theme=dark"]) {
    const { r } = await get(base, p);
    assert.equal(r.status, 200, p);
    const csp = r.headers.get("content-security-policy") || "";
    assert.match(csp, /(^|; )script-src 'self' blob: 'wasm-unsafe-eval'(;|$)/, p);
    const scriptSrc = (csp.split("; ").find((d) => d.startsWith("script-src")) || "").split(" ");
    assert.ok(!scriptSrc.includes("'unsafe-inline'") && !scriptSrc.includes("'unsafe-eval'"), "no inline script, no eval: " + csp);
    assert.match(csp, /object-src 'none'/); assert.match(csp, /base-uri 'none'/); assert.match(csp, /form-action 'none'/);
    const hosts = [...csp.matchAll(/https:\/\/[^\s;]+/g)].map((m) => m[0]).sort();
    assert.deepEqual([...new Set(hosts)], ["https://cdn.jsdelivr.net", "https://fonts.googleapis.com", "https://fonts.gstatic.com"], "only the consented hosts");
    assert.equal(r.headers.get("x-content-type-options"), "nosniff");
  }
  // the page's own scripts are still served as scripts (the policy's 'self')
  const { r: js } = await get(base, "/app/app.js");
  assert.match(js.headers.get("content-type"), /^text\/javascript/);
});

test("an upload named like a script or a page is refused before anything is kept", async (t) => {
  const dir = makeDataDir(t);
  const { base } = await startServer(t, dir, NO_WATCH);
  for (const name of ["x.js", "x.MJS", "page.html", "page.htm", "a.xhtml", "s.svgz", "m.wasm", "c.css", "x.xml"]) {
    const r = await fetch(base + "/api/upload?name=" + encodeURIComponent(name), { method: "POST", body: "alert(1)" });
    assert.equal(r.status, 415, name);
    assert.equal((await r.json()).code, "UPLOAD_TYPE_REFUSED", name);
  }
  assert.deepEqual(fs.readdirSync(path.join(dir, "media")), [], "nothing was written");
  // footage still uploads
  const ok = await fetch(base + "/api/upload?name=clip.wav", { method: "POST", body: Buffer.alloc(64) });
  assert.equal(ok.status, 200);
});

test("what media/, library/, exports/ and previews/ hold is never served as a script or a page: bytes, nosniff", async (t) => {
  const dir = makeDataDir(t);
  // synthetic files put there by other means (an import, a copy by hand, an older version)
  const plant = (rel, body) => { const f = path.join(dir, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, body); };
  plant("media/evil.js", "alert(1)"); plant("media/sub/evil.html", "<script>alert(1)</script>"); plant("media/a.css", "body{}");
  plant("media/data.json", "{}"); plant("media/noext", "x"); plant("library/elements/x.js", "alert(1)"); plant("exports/x.html", "<b>x</b>");
  plant("media/clip.mp4", Buffer.alloc(16)); plant("media/pic.png", Buffer.alloc(16)); plant("library/fonts/F.woff2", Buffer.alloc(16));
  const { base } = await startServer(t, dir, NO_WATCH);
  for (const p of ["/media/evil.js", "/media/sub/evil.html", "/media/a.css", "/media/data.json", "/media/noext", "/library/elements/x.js", "/exports/x.html"]) {
    const { r } = await get(base, p);
    assert.equal(r.status, 200, p);
    assert.equal(r.headers.get("content-type"), "application/octet-stream", p);
    assert.equal(r.headers.get("x-content-type-options"), "nosniff", p);
    assert.equal(r.headers.get("content-security-policy"), null, p + ": not the page's policy either");
  }
  for (const [p, type] of [["/media/clip.mp4", "video/mp4"], ["/media/pic.png", "image/png"], ["/library/fonts/F.woff2", "font/woff2"]]) {
    const { r } = await get(base, p);
    assert.equal(r.headers.get("content-type"), type, p);
    assert.equal(r.headers.get("x-content-type-options"), "nosniff", p);
  }
});
