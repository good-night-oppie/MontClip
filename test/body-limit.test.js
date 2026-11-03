"use strict";
// QQ / Deja (after #67): readBody held any request body in memory with no limit, so one large POST to a small JSON route
// could take the server's memory with it. Now a body over 1 MB gets 413 and is not kept; the few routes that carry large
// bodies have their own, larger limits (the project document, a project import, a transcript, an export frame).
// Uploads and the export audio already stream to disk and do not go through readBody.
const test = require("node:test"), a = require("node:assert/strict");
const http = require("node:http"), fs = require("node:fs"), path = require("node:path");
const { makeDataDir, startServer } = require("./helpers");

function post(port, pathname, body, { method = "POST", chunked = false, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const h = { "Content-Type": "application/json", ...headers };
    if (!chunked) h["Content-Length"] = Buffer.byteLength(body);
    const req = http.request({ host: "127.0.0.1", port, path: pathname, method, headers: h }, (res) => {
      const parts = []; res.on("data", (c) => parts.push(c));
      res.on("end", () => resolve({ status: res.statusCode, body: Buffer.concat(parts).toString("utf8") }));
    });
    req.on("error", reject);
    if (chunked) { for (let i = 0; i < body.length; i += 65536) req.write(body.slice(i, i + 65536)); req.end(); } else req.end(body);
  });
}
const big = (mb) => JSON.stringify({ action: "list", pad: "x".repeat(mb * 1048576) });

test("a JSON route refuses a body over 1 MB with 413, with or without Content-Length", async (t) => {
  const { port } = await startServer(t, makeDataDir(t), { FABLECUT_NO_FS_WATCH: "1" });
  for (const route of ["/api/versions", "/api/media-info", "/api/export/request"]) {
    for (const chunked of [false, true]) {
      const r = await post(port, route, big(2), { chunked });
      a.equal(r.status, 413, `${route} ${chunked ? "chunked" : "with length"}: ${r.body.slice(0, 120)}`);
      a.match(r.body, /BODY_TOO_LARGE/);
    }
  }
  // under the limit still works
  a.equal((await post(port, "/api/media-info", JSON.stringify({ srcs: [] }))).status, 200);
  // and the server is still answering afterwards
  a.equal((await post(port, "/api/media-info", JSON.stringify({ srcs: [] }))).status, 200);
});

test("the project document may be larger than 1 MB (its own limit)", async (t) => {
  const dir = makeDataDir(t);
  const { port } = await startServer(t, dir, { FABLECUT_NO_FS_WATCH: "1" });
  const doc = JSON.parse(fs.readFileSync(path.join(dir, "project.json"), "utf8"));
  doc.revision = (doc.revision || 0) + 1; doc.notes = "x".repeat(3 * 1048576);
  const r = await post(port, "/api/project?force=1", JSON.stringify(doc), { method: "PUT" });
  a.equal(r.status, 200, r.body.slice(0, 200));
});

test("every readBody call goes through the limit; the large routes are named, the rest get 1 MB", () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
  a.match(src, /const MAX_BODY = 1024 \* 1024;/);
  for (const route of ['"PUT /api/project"', '"POST /api/projects"', '"POST /api/transcript"', '"POST /api/export/frame"']) a.ok(src.includes(route), route);
  a.doesNotMatch(src, /req\.on\("data", \(c\) => chunks\.push\(c\)\)/, "no unbounded body reader left");
});
