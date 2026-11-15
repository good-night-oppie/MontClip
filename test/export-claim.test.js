"use strict";
// QQ (0a2c13b): the desktop app may remove an export's copy only when it is this session's new export. The server
// remembers each file /api/export/end made since it started; POST /api/export/claim?name= answers {fresh:true} once for
// such a file (then forgets it), and {fresh:false} for anything else — an older file in exports/, an unknown name.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const D = require("../delivery");
const { makeDataDir, startServer } = require("./helpers");

const post = (base, p, body) => fetch(base + p, { method: "POST", headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
const claim = async (base, name) => (await post(base, "/api/export/claim?name=" + encodeURIComponent(name))).json();

test("an older file in exports/, an unknown name or a path is not fresh", async (t) => {
  const dir = makeDataDir(t);
  fs.mkdirSync(path.join(dir, "exports"), { recursive: true });
  fs.writeFileSync(path.join(dir, "exports", "older.mp4"), "v");
  const { base } = await startServer(t, dir, { FABLECUT_NO_FS_WATCH: "1" });
  for (const name of ["older.mp4", "nothing.mp4", "../project.json", ""]) assert.deepEqual(await claim(base, name), { fresh: false }, name);
  assert.equal((await fetch(base + "/api/export/claim?name=older.mp4")).status, 405, "POST only");
});

test("a file this session exported is fresh exactly once", async (t) => {
  const dir = makeDataDir(t);
  const { base } = await startServer(t, dir, { FABLECUT_NO_FS_WATCH: "1" });
  const h264 = await (await fetch(base + "/api/export/h264")).json();
  if (!h264.encoder) return t.skip("no H.264 encoder on this machine: " + h264.reason);
  if (!h264.encoders.some((e) => !D.ENCODERS[e]?.min)) return t.skip("only a graphics-card encoder with a minimum frame size here");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "fc-claim-"));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const jpg = path.join(tmp, "f.jpg");
  execFileSync(require("../server/ffmpeg-path").path("ffmpeg"), ["-y", "-v", "error", "-f", "lavfi", "-i", "color=c=red:s=160x90", "-frames:v", "1", "-q:v", "2", jpg]);
  const begin = await post(base, "/api/export/begin", { fps: 30, name: "claimed", hasAudio: false, duration: 0.2,
    delivery: { preset: "custom", width: 160, height: 90 }, canvasW: 160, canvasH: 90 });
  const sess = await begin.json();
  assert.equal(begin.status, 200, sess.error);
  await fetch(base + "/api/export/frame?id=" + sess.id, { method: "POST", body: Buffer.concat(Array(6).fill(fs.readFileSync(jpg))) });
  const end = await (await fetch(base + "/api/export/end?id=" + sess.id, { method: "POST" })).json();
  assert.match(end.src || "", /^\/exports\/claimed\.mp4$/, end.error);
  assert.deepEqual(await claim(base, "claimed.mp4"), { fresh: true });
  assert.deepEqual(await claim(base, "claimed.mp4"), { fresh: false }, "only once");
});

test("both ways /api/export/end finishes register the file", () => {
  const server = fs.readFileSync(path.join(__dirname, "..", "server/server.js"), "utf8");
  assert.equal((server.match(/freshExports\.add\(/g) || []).length, 2);
});
