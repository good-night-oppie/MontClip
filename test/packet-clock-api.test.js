"use strict";
const test = require("node:test"), a = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const FF = require("../ffmpeg-path");
const { makeDataDir, seedProject, startServer } = require("./helpers");
const { samples } = require("../scripts/packet-timestamps-bench");
test("clock diagnostics run in the background and never rewrite project coordinates", { skip: !FF.available("ffmpeg") || !FF.available("ffprobe") }, async t => {
  const project = seedProject({ media: [{ id: "m_a", src: "/media/cut.mkv", kind: "video", duration: 305 }],
    clips: [{ id: "c_a", mediaId: "m_a", kind: "video", track: "V1", start: 17, in: 301, duration: 2 }] });
  const dir = makeDataDir(t, project), mediaDir = path.join(dir, "media"); fs.mkdirSync(mediaDir);
  samples(mediaDir);
  const saved = fs.readFileSync(path.join(dir, "project.json")), original = fs.readFileSync(path.join(mediaDir, "cut.mkv"));
  const { base } = await startServer(t, dir);
  const post = (url, body) => fetch(base + url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const start = await post("/api/media-clock", { src: "/media/cut.mkv" });
  a.equal(start.status, 202); const begun = await start.json();
  a.ok(["queued", "running"].includes(begun.state));
  const same = await (await post("/api/media-clock", { src: "/media/cut.mkv" })).json(); a.equal(same.key, begun.key);
  a.equal((await fetch(base + "/api/project")).status, 200);
  let result;
  const deadline = Date.now() + 20000;
  do {
    result = await (await fetch(base + "/api/media-clock?src=/media/cut.mkv")).json();
    if (!["queued", "running"].includes(result.state)) break;
    await new Promise(r => setTimeout(r, 30));
  } while (Date.now() < deadline);
  a.equal(result.state, "done", JSON.stringify(result));
  a.ok(result.result.coveredDuration > 9 && result.result.coveredDuration < 10.2);
  a.equal(result.result.timestampJump, true);
  a.deepEqual(fs.readFileSync(path.join(dir, "project.json")), saved);
  a.deepEqual(fs.readFileSync(path.join(mediaDir, "cut.mkv")), original);
  a.equal((await post("/api/media-clock", { src: "/../project.json" })).status, 404);
  a.equal((await post("/api/media-clock", [])).status, 400);
  a.equal((await post("/api/media-clock", { src: "/media/cut.mkv", apply: "skip-gaps" })).status, 400, "a diagnostic request cannot apply a destructive clock change");
  fs.appendFileSync(path.join(mediaDir, "cut.mkv"), Buffer.from([0]));
  const stale = await (await fetch(base + "/api/media-clock?src=/media/cut.mkv")).json();
  a.equal(stale.state, "stale"); a.equal(stale.result, undefined);
});
