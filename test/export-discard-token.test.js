'use strict';
/* MontClip#302: a half-made export may be discarded only with the secret its page got at /begin, so one task's page
   (or a stray tool call) cannot stop another task's export by guessing an id. The page sends it from pagehide; the
   10-minute sweep stays as the fallback when a page cannot send anything. Runs only where ffmpeg is available. */
const test = require("node:test");
const assert = require("node:assert/strict");
const { makeDataDir, startServer } = require("./helpers");

test("discard needs this session's token; a wrong or missing one changes nothing", { timeout: 30000 }, async (t) => {
  const dir = makeDataDir(t);
  const { base } = await startServer(t, dir, { FABLECUT_NO_FS_WATCH: "1" });
  const ff = await (await fetch(base + "/api/export/ffmpeg")).json();
  if (!ff.available) return t.skip("no ffmpeg here; the CI matrix runs this test");

  const begin = async (name) => {
    const r = await fetch(base + "/api/export/begin", { method: "POST", body: JSON.stringify({ fps: 30, name, hasAudio: false, mode: "annexb" }) });
    const j = await r.json();
    assert.equal(r.status, 200, j.error);
    assert.equal(typeof j.endToken, "string");
    assert.match(j.endToken, /^[a-f0-9]{64}$/);
    return j;
  };
  const active = async () => (await (await fetch(base + "/api/export/active")).json()).active;
  const discard = (id, token) => fetch(base + "/api/export/end?id=" + encodeURIComponent(id) + "&discard=1" + (token === undefined ? "" : "&token=" + encodeURIComponent(token)), { method: "POST" });

  const a = await begin("t302-a");
  const b = await begin("t302-b");
  assert.equal(await active(), 2);

  const noToken = await discard(a.id);
  assert.equal(noToken.status, 403);
  assert.equal((await noToken.json()).code, "EXPORT_TOKEN_REFUSED");
  assert.equal(await active(), 2, "a missing token must not stop anything");

  const wrong = await discard(a.id, "0".repeat(64));
  assert.equal(wrong.status, 403);
  assert.equal(await active(), 2, "another session's token must not stop this one");

  const ok = await discard(a.id, a.endToken);
  assert.equal(ok.status, 200);
  assert.equal(await active(), 1, "only the named session goes");
  assert.equal((await discard(b.id, b.endToken)).status, 200);
  assert.equal(await active(), 0);
});
test("the page keeps the token and beacons it on pagehide; the server refuses a bare id", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const root = path.resolve(__dirname, "..");
  const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
  const server = fs.readFileSync(path.join(root, "server.js"), "utf8");
  assert.match(app, /addEventListener\("pagehide"[\s\S]{0,400}navigator\.sendBeacon/);
  assert.match(app, /discard=1&token=" \+ encodeURIComponent\(token\)/);
  assert.match(server, /endToken = crypto\.randomBytes\(32\)\.toString\("hex"\)/);
  assert.match(server, /EXPORT_TOKEN_REFUSED/);
});
