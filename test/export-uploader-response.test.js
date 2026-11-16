"use strict";
/* MontClip#320: the headless export's browser (the page's render process) grew without bound while an export ran:
   createExportUploader's POST /api/export/frame never read or cancelled the server's reply when it was ok, and an
   unread reply keeps its request (a batch of JPEG or RGBA frames) alive in the page. Measured on arena (synthetic 90 s
   projects, 6 GiB cap): about 3 MB per second of timeline at 720p, 9 at 1080x1920, 13 for raw RGBA, and flat once the
   reply was read. This runs the real createExportUploader, sliced out of app.js, against a stand-in fetch whose reply
   says whether anything consumed its body. */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { ROOT } = require("./helpers");

const SRC = fs.readFileSync(path.join(ROOT, "app/app.js"), "utf8");
const a = SRC.indexOf("function createExportUploader(");
const b = SRC.indexOf("/* ── Fast / WebCodecs frame sync ──", a);
assert.ok(a >= 0 && b > a, "createExportUploader moved or was renamed: update the slice markers");

/** A reply that records whether its body was read (any way: arrayBuffer / text / json / blob) or cancelled. */
function reply(ok, status = ok ? 200 : 500) {
  const r = { ok, status, consumed: false };
  const mark = (v) => async () => { r.consumed = true; return v; };
  r.arrayBuffer = mark(new ArrayBuffer(0));
  r.text = mark("{}");
  r.json = mark(ok ? {} : { error: "stand-in failure" });
  r.blob = mark(new Blob([]));
  r.body = { cancel: async () => { r.consumed = true; } };
  return r;
}

function makeUploader({ okAfter = true } = {}) {
  const replies = [];
  const fakeFetch = async () => { const r = reply(okAfter); replies.push(r); return r; };
  const env = new Function("fetch", "renderCancelled", `${SRC.slice(a, b)}\nreturn createExportUploader;`)(fakeFetch, false);
  const errors = [];
  const up = env("x_test", { batchItems: 8, batchBytes: 512 * 1024, signal: null, getError: () => errors[0] || null, setError: (e) => errors.push(e) });
  return { up, replies, errors };
}

test("#320: every ok reply from /api/export/frame is read or cancelled", async () => {
  const { up, replies, errors } = makeUploader();
  const frame = new Uint8Array(300 * 1024);
  for (let i = 0; i < 40; i++) { up.push(frame); await up.waitBackpressure(4); }
  await up.done();
  assert.deepEqual(errors, []);
  assert.ok(replies.length >= 10, "the stand-in saw the uploads: " + replies.length);
  assert.equal(replies.filter((r) => !r.consumed).length, 0, "no reply may be left unread: " + replies.filter((r) => !r.consumed).length + " of " + replies.length);
});

test("#320: a failed reply still says why (the error text is its body)", async () => {
  const { up, errors } = makeUploader({ okAfter: false });
  up.push(new Uint8Array(600 * 1024));
  await up.done().catch(() => {});
  assert.equal(errors.length, 1);
  assert.match(String(errors[0].message), /stand-in failure/);
});
