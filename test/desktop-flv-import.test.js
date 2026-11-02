"use strict";
// Desktop FLV import (Deja, replacing #7): the chosen FLV is checked where it is and hashed before anything is
// copied; only after the user agrees is it copied into media/ as a stream, and the copy's hash is checked against the
// original's. Cancel or failure removes only the files this import made. The ffmpeg steps are injected here, so
// this runs anywhere; the real steps are covered by desktop/flv-native-smoke.cjs.
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), os = require("node:os"), path = require("node:path"), crypto = require("node:crypto");
const { createFlvImports } = require("../desktop/flv-import");

const sha = (buf) => crypto.createHash("sha256").update(buf).digest("hex");
function setup(t, { compatible = true, range = { maxGap: 0, needsConsent: false }, prepare } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "montclip-flv-中文-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const media = path.join(root, "media"), src = path.join(root, "录播 原片");
  fs.mkdirSync(media); fs.mkdirSync(src);
  fs.writeFileSync(path.join(media, "someone-else.flv"), "keep");   // not this import's: never touched
  const file = path.join(src, "直播 2026-11-02.flv"), bytes = crypto.randomBytes(3 * 1024 * 1024 + 17);
  fs.writeFileSync(file, bytes);
  const seen = { inspect: [], prepare: [] };
  const service = createFlvImports({
    mediaDir: media, chunk: 64 * 1024,
    inspect: async (f) => { seen.inspect.push({ file: f, mediaFiles: fs.readdirSync(media).sort() }); return { compatible, range }; },
    prepare: prepare || (async (f, opts) => {
      seen.prepare.push({ file: f, opts });
      const out = path.join(media, "compat-" + crypto.randomUUID() + ".mp4");
      fs.writeFileSync(out, "mp4");
      return { src: "/media/" + path.basename(out), originalSrc: "/media/" + path.basename(f), preparation: compatible ? "remux" : "transcode" };
    }),
  });
  t.after(() => service.shutdown());
  return { root, media, file, bytes, service, seen, others: () => fs.readdirSync(media).filter((n) => n !== "someone-else.flv").sort() };
}

test("inspect: checks the file where it is and hashes it; nothing is copied yet", async (t) => {
  const w = setup(t);
  const r = await w.service.inspect(w.file);
  assert.deepEqual(w.seen.inspect.map((x) => x.file), [fs.realpathSync(w.file)], "inspected in place");
  assert.deepEqual(w.seen.inspect[0].mediaFiles, ["someone-else.flv"]);
  assert.deepEqual(w.others(), [], "no copy before the user agrees");
  assert.equal(r.sha256, sha(w.bytes));
  assert.equal(r.size, w.bytes.length);
  assert.equal(r.name, "直播 2026-11-02.flv");
  assert.equal(r.compatible, true);
  assert.equal(r.needsReadableConsent, false);
  assert.match(r.id, /^[0-9a-f-]{36}$/);
});

test("prepare: a stream copy into media/ whose hash matches, then the compatible copy; finish keeps both", async (t) => {
  const w = setup(t);
  const r = await w.service.inspect(w.file);
  const out = await w.service.prepare(r.id, {});
  const copy = path.join(w.media, decodeURIComponent(out.originalSrc.slice("/media/".length)));
  assert.equal(sha(fs.readFileSync(copy)), r.sha256, "the copy is byte for byte the original");
  assert.equal(w.seen.prepare.length, 1);
  assert.equal(w.seen.prepare[0].file, copy, "the compatible copy is made from the copy, not the original");
  assert.equal(out.sha256, r.sha256);
  assert.equal(w.others().length, 2);
  w.service.finish(r.id);
  await w.service.shutdown();
  assert.equal(w.others().length, 2, "finished files belong to the project now");
  assert.deepEqual(fs.readFileSync(w.file), w.bytes, "the original is untouched");
});

test("an incompatible or uncertain file needs the user's yes before anything is copied", async (t) => {
  const w = setup(t, { compatible: false, range: { maxGap: 0, needsConsent: true } });
  const r = await w.service.inspect(w.file);
  assert.deepEqual([r.compatible, r.needsReadableConsent], [false, true]);
  await assert.rejects(w.service.prepare(r.id, {}), { code: "FLV_TRANSCODE_REQUIRED" });
  await assert.rejects(w.service.prepare(r.id, { allowTranscode: true }), { code: "FLV_READABLE_CONSENT_REQUIRED" });
  assert.deepEqual(w.others(), [], "refused before copying");
  const out = await w.service.prepare(r.id, { allowTranscode: true, acceptReadable: true });
  assert.deepEqual(w.seen.prepare[0].opts.allowTranscode, true);
  assert.deepEqual(w.seen.prepare[0].opts.acceptReadable, true);
  assert.equal(out.preparation, "transcode");
});

test("a gap in the timeline is refused at inspection, before any copy", async (t) => {
  const w = setup(t, { range: { maxGap: 0.2, needsConsent: false } });
  await assert.rejects(w.service.inspect(w.file), { code: "FLV_TIMELINE_GAP" });
  assert.deepEqual(w.others(), []);
});

test("a source changed after inspection is caught by the hash, and its copy removed", async (t) => {
  const w = setup(t);
  const r = await w.service.inspect(w.file);
  fs.appendFileSync(w.file, "x");
  await assert.rejects(w.service.prepare(r.id, {}), { code: "FLV_SOURCE_CHANGED" });
  assert.deepEqual(w.others(), []);
  assert.equal(fs.readFileSync(path.join(w.media, "someone-else.flv"), "utf8"), "keep");
});

test("cancel: after inspection, during the copy, during preparation, after preparation — only this import's files go", async (t) => {
  // after inspection: nothing to remove
  { const w = setup(t); const r = await w.service.inspect(w.file); w.service.cancel(r.id); assert.deepEqual(w.others(), []);
    await assert.rejects(w.service.prepare(r.id, {}), { code: "FLV_IMPORT_EXPIRED" }); }
  // during preparation (the copy exists, the compatible copy is being made)
  { let release; const gate = new Promise((r) => { release = r; });
    const w = setup(t, { prepare: async (f, opts) => { await gate; if (opts.signal.aborted) throw Object.assign(Error("aborted"), { code: "ABORT_ERR" }); return { src: "/media/x.mp4" }; } });
    const r = await w.service.inspect(w.file);
    const pending = w.service.prepare(r.id, {});
    while (!w.others().length) await new Promise((res) => setTimeout(res, 5));
    w.service.cancel(r.id); release();
    await assert.rejects(pending, { code: "FLV_IMPORT_CANCELED" });
    assert.deepEqual(w.others(), [], "the copy is removed"); }
  // during the copy: a big file cancelled as soon as the copy starts
  { const w = setup(t); const big = path.join(path.dirname(w.file), "大.flv"); fs.writeFileSync(big, crypto.randomBytes(48 * 1024 * 1024));
    const r = await w.service.inspect(big);
    const pending = w.service.prepare(r.id, {});
    while (!w.others().length) await new Promise((res) => setImmediate(res));
    w.service.cancel(r.id);
    await assert.rejects(pending, { code: "FLV_IMPORT_CANCELED" });
    assert.deepEqual(w.others(), []); }
  // after preparation, before finish (e.g. the page could not load the copy): both files go
  { const w = setup(t); const r = await w.service.inspect(w.file); await w.service.prepare(r.id, {});
    assert.equal(w.others().length, 2); w.service.cancel(r.id); assert.deepEqual(w.others(), []); }
});

test("a failed preparation removes the copy; shutdown removes unfinished imports and keeps finished ones", async (t) => {
  { const w = setup(t, { prepare: async () => { throw Object.assign(Error("no"), { code: "FLV_PREPARATION_FAILED" }); } });
    const r = await w.service.inspect(w.file);
    await assert.rejects(w.service.prepare(r.id, {}), { code: "FLV_PREPARATION_FAILED" });
    assert.deepEqual(w.others(), []); }
  { const w = setup(t);
    const done = await w.service.inspect(w.file); await w.service.prepare(done.id, {}); w.service.finish(done.id);
    const open = await w.service.inspect(w.file); await w.service.prepare(open.id, {});
    assert.equal(w.others().length, 4);
    await w.service.shutdown();
    assert.equal(w.others().length, 2, "the unfinished import's two files are gone, the finished ones stay"); }
});

test("only regular .flv files are taken", async (t) => {
  const w = setup(t);
  const txt = path.join(path.dirname(w.file), "a.txt"); fs.writeFileSync(txt, "x");
  await assert.rejects(w.service.inspect(txt), { code: "FLV_NOT_FLV" });
  await assert.rejects(w.service.inspect(path.dirname(w.file)), { code: "FLV_NOT_FLV" });
  await assert.rejects(w.service.inspect(path.join(path.dirname(w.file), "missing.flv")), { code: "FLV_NOT_FOUND" });
  assert.deepEqual(w.others(), []);
});

test("packaged: the FLV import in the main process runs MontClip's own FFmpeg, as the server does", () => {
  // After #28 the packaged app's server gets MONTCLIP_FFMPEG_PACKAGED / MONTCLIP_FFMPEG_DIR in its env; the FLV import
  // runs prepareMedia in the main process, whose own env lacked them, so ffmpeg-path.js could not find the bundled tools.
  const main = fs.readFileSync(path.join(__dirname, "..", "desktop", "main.js"), "utf8");
  const setsOwn = main.indexOf("process.env.MONTCLIP_FFMPEG_PACKAGED = \"1\""), creates = main.indexOf("createFlvImports(");
  assert.ok(setsOwn > 0, "the main process sets the packaged FFmpeg for itself");
  assert.ok(setsOwn < creates, "before the FLV import service starts");
  assert.match(main, /process\.env\.MONTCLIP_FFMPEG_DIR = env\.MONTCLIP_FFMPEG_DIR;/);
  const FF = require("../ffmpeg-path");
  const r = FF.resolveTool("ffmpeg", { env: { MONTCLIP_FFMPEG_PACKAGED: "1", MONTCLIP_FFMPEG_DIR: path.resolve("R", "ffmpeg") }, platform: "win32", exists: () => true });
  assert.equal(r.path, path.join(path.resolve("R", "ffmpeg"), "ffmpeg.exe"));
});
