/* QQ (#152 review 5780430295; Deja, 2026-11-05): the lengths the agent reads for files that had none were written
   straight into project.json, so the outside write won — a step the streamer had made in the editor but not yet saved
   (the 400 ms save delay) was dropped. Now they go through the server:
     · an editor is open → the server hands them to it (SSE "media-backfill"); the editor puts them into the project it
       has open, unsaved step and all, and saves once — nothing is lost on either side;
     · no editor → the server merges them onto what is on disk and writes that, as a PUT would.
   Only with no server at all does the agent write the file itself (as before). */
"use strict";
const test = require("node:test"), a = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), vm = require("node:vm"), http = require("node:http");
const FF = require("../server/ffmpeg-path");
const MediaLib = require("../media-lib");
const { makeDataDir, seedProject, startServer, startMcp, readProject } = require("./helpers");

const have = FF.available("ffmpeg") && FF.available("ffprobe");
const skip = !have && "no ffmpeg / ffprobe here";
const OBS = path.join(__dirname, "fixtures", "truncated-h264", "obs-crash.mkv");

test("MediaLib.applyBackfill: fills entries that still have no length (same file only); leaves the rest alone", () => {
  const doc = { media: [
    { id: "m1", kind: "video", src: "/media/a.mkv" },
    { id: "m2", kind: "video", src: "/media/b.mkv", duration: 9 },
    { id: "m3", kind: "video", src: "/media/c-relinked.mkv" },
    { id: "m4", kind: "audio", src: "/media/d.wav" },
  ] };
  const n = MediaLib.applyBackfill(doc, [
    { id: "m1", src: "/media/a.mkv", duration: 3.6, durationFrom: "packets" },
    { id: "m2", src: "/media/b.mkv", duration: 4 },            // has one: kept
    { id: "m3", src: "/media/c.mkv", duration: 5 },            // relinked meanwhile: another file now
    { id: "m4", src: "/media/d.wav", durationUnknown: true },
    { id: "m9", src: "/media/x.mkv", duration: 1 },            // removed meanwhile
  ]);
  a.equal(n, 2);
  a.deepEqual([doc.media[0].duration, doc.media[0].durationFrom], [3.6, "packets"]);
  a.equal(doc.media[1].duration, 9);
  a.equal(doc.media[2].duration, undefined);
  a.equal(doc.media[3].durationUnknown, true);
  a.equal(MediaLib.applyBackfill(doc, [{ id: "m1", src: "/media/a.mkv", duration: 7 }]), 0, "once");
  a.equal(MediaLib.applyBackfill(doc, [{ id: "m3", src: "/media/c-relinked.mkv", duration: Infinity }]), 0, "non-finite duration is not metadata");
});

test("the editor: the lengths go into the project it has open — its unsaved step kept — and it saves once", () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
  const at = src.indexOf("function onMediaBackfill("), end = src.indexOf("\n}\n", at) + 3;
  a.ok(at > 0, "app.js has onMediaBackfill");
  a.match(src, /es\.addEventListener\("media-backfill", \(e\) => onMediaBackfill\(e\.data\)\);/);
  const project = { revision: 5, media: [{ id: "m1", kind: "video", src: "/media/a.mkv" }],
    clips: [{ id: "c1", mediaId: "m1", start: 2 }] };   // the streamer just moved c1 to 2 s, not saved yet
  const calls = { saved: 0, undo: 0, bin: 0 };
  const ctx = { project, MediaLib, seqRoot: () => project, scheduleSave: () => calls.saved++, pushUndo: () => calls.undo++, renderBin: () => calls.bin++, JSON };
  vm.createContext(ctx);
  vm.runInContext(src.slice(at, end), ctx);
  ctx.onMediaBackfill(JSON.stringify({ updates: [{ id: "m1", src: "/media/a.mkv", duration: 3.6, durationFrom: "packets" }] }));
  a.equal(project.clips[0].start, 2, "the unsaved step is still there");
  a.equal(project.media[0].duration, 3.6, "and the length is in");
  a.equal(calls.saved, 1, "one save carries both");
  a.equal(calls.undo, 0, "not an undo step: a file's details, as when the editor reads them itself");
  ctx.onMediaBackfill("{not json");
  ctx.onMediaBackfill(JSON.stringify({ updates: [{ id: "m1", src: "/media/a.mkv", duration: 9 }] }));
  a.equal(calls.saved, 1, "nothing new: no save");
});

/** An SSE client on the server, as an open editor is; resolves each named event's data. */
function listen(base) {
  const events = [];
  let waiting = null;
  const req = http.get(base + "/api/events", (res) => {
    res.setEncoding("utf8");
    let buf = "";
    res.on("data", (c) => {
      buf += c;
      let i;
      while ((i = buf.indexOf("\n\n")) >= 0) {
        const block = buf.slice(0, i); buf = buf.slice(i + 2);
        const ev = (/^event: (.+)$/m.exec(block) || [])[1] || "message", data = (/^data: (.*)$/m.exec(block) || [])[1] || "";
        events.push({ ev, data });
        if (waiting) waiting();
      }
    });
  });
  req.on("error", () => { /* closed by the test, or by the server stopping */ });
  return {
    events, close: () => req.destroy(),
    next: (name, ms = 30_000) => new Promise((resolve, reject) => {
      const t0 = Date.now();
      let iv = null;
      const done = () => { waiting = null; if (iv) clearInterval(iv); };
      const look = () => {
        const e = events.find((x) => x.ev === name);
        if (e) { done(); resolve(e); } else if (Date.now() - t0 > ms) { done(); reject(new Error("no " + name + " event")); }
      };
      waiting = look; iv = setInterval(look, 100); look();
    }),
  };
}
const post = (base, p, body) => fetch(base + p, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, body: await r.json() }));

test("the server, no editor open: merges the lengths onto the project on disk and writes it once", async (t) => {
  const data = makeDataDir(t, { ...seedProject({ media: [{ id: "m1", kind: "video", name: "a.mkv", src: "/media/a.mkv" }], clips: [] }), revision: 5 });
  const srv = await startServer(t, data, { FABLECUT_NO_FS_WATCH: "1" });
  const r = await post(srv.base, "/api/media-backfill", { updates: [{ id: "m1", src: "/media/a.mkv", duration: 3.6, durationFrom: "packets" }] });
  a.equal(r.status, 200, JSON.stringify(r.body));
  a.equal(r.body.via, "server");
  const doc = readProject(data);
  a.equal(doc.revision, 6);
  a.equal(doc.media[0].duration, 3.6);
  a.equal((await post(srv.base, "/api/media-backfill", { updates: [{ id: "m1", src: "/media/a.mkv", duration: 3.6 }] })).body.changed, 0);
  a.equal(readProject(data).revision, 6, "nothing new: not written");
  a.equal((await post(srv.base, "/api/media-backfill", { updates: "x" })).status, 400);
  a.equal((await post(srv.base, "/api/media-backfill", null)).status, 400, "null JSON is rejected without stopping the server");
});

test("end to end: the agent reads a missing length while the editor has an unsaved step — both are kept", { skip }, async (t) => {
  const data = makeDataDir(t, { ...seedProject({ media: [], clips: [] }), revision: 5 });
  fs.mkdirSync(path.join(data, "media"), { recursive: true });
  fs.copyFileSync(OBS, path.join(data, "media", "rec.mkv"));
  const proj = readProject(data);
  proj.media = [{ id: "m1", kind: "video", name: "rec.mkv", src: "/media/rec.mkv", size: 1 }];
  proj.clips = [{ id: "c1", mediaId: "m1", kind: "video", track: "V1", start: 0, in: 0, duration: 2, props: {} }];
  fs.writeFileSync(path.join(data, "project.json"), JSON.stringify(proj));
  const srv = await startServer(t, data, { FABLECUT_NO_FS_WATCH: "1" });
  // the editor: has the project at revision 5 and has just moved c1 to 4 s, not saved yet
  const editor = listen(srv.base);
  t.after(editor.close);
  const mine = readProject(data);
  mine.clips[0].start = 4;
  const mcp = startMcp(t, data, { FABLECUT_NO_AUTOSTART: "1", FABLECUT_PORT: String(srv.port) });
  await mcp.request("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "t", version: "1" } });
  const r = await mcp.callTool("fablecut_get_project", { compact: true });
  a.equal(r.isError, false, r.text);
  const ev = await editor.next("media-backfill");
  a.equal(readProject(data).revision, 5, "the agent did not write the file over the editor");
  // the editor does what onMediaBackfill does: into its own project, then its one save
  a.equal(MediaLib.applyBackfill(mine, JSON.parse(ev.data).updates), 1);
  mine.revision++;
  const put = await fetch(srv.base + "/api/project", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(mine) });
  a.equal(put.status, 200, "the editor's save is not refused");
  const doc = readProject(data);
  a.equal(doc.clips[0].start, 4, "the streamer's step is kept");
  a.ok(doc.media[0].duration > 3, "and the length the agent read is in");
});

test("a server refusal never falls back to writing over the editor", { skip }, async (t) => {
  const data = makeDataDir(t, { ...seedProject({ media: [{ id: "m1", kind: "video", src: "/media/rec.mkv" }], clips: [] }), revision: 5 });
  fs.mkdirSync(path.join(data, "media"), { recursive: true });
  fs.copyFileSync(OBS, path.join(data, "media", "rec.mkv"));
  let calls = 0;
  const server = http.createServer((req, res) => {
    calls++;
    req.resume();
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "save unavailable" }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const before = fs.readFileSync(path.join(data, "project.json"), "utf8");
  const mcp = startMcp(t, data, { FABLECUT_NO_AUTOSTART: "1", FABLECUT_PORT: String(server.address().port) });
  await mcp.callTool("fablecut_get_project", { compact: true });
  a.equal(calls, 1);
  a.equal(fs.readFileSync(path.join(data, "project.json"), "utf8"), before);
});
