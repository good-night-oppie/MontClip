"use strict";
const test = require("node:test"), a = require("node:assert/strict"), fs = require("node:fs"), os = require("node:os"), path = require("node:path"), http = require("node:http");
const FF = require("../ffmpeg-path"), Clock = require("../packet-clock"), { samples } = require("../scripts/packet-timestamps-bench");
const { makeDataDir, seedProject, startServer, startMcp, readProject } = require("./helpers");
const have = FF.available("ffmpeg") && FF.available("ffprobe");
let dir, fixture;
test.before(() => { if (have) { dir = fs.mkdtempSync(path.join(os.tmpdir(), "mc-gap-project-")); fixture = samples(dir); } });
test.after(() => { if (dir) fs.rmSync(dir, { recursive: true, force: true }); });
async function setup(t, conflict = false) {
  const file = fixture.rows.find(r => r.file.endsWith("mkv")).file;
  const scan = await Clock.scanFile(file), map = Clock.repairMap(scan, scan.sourceOrigin);
  const doc = seedProject({ media: [{ id: "old", kind: "video", name: "cut.mkv", src: "/media/cut.mkv", duration: map.sourceDuration }],
    clips: [{ id: "full", kind: "video", mediaId: "old", track: "V1", start: 0, in: 0, duration: map.sourceDuration },
      ...[2, conflict ? 20 : 302].map((t, i) => ({ id: "cap" + i, kind: "text", track: "V2", start: t, duration: .2, props: { caption: true, text: "synthetic" } }))],
    danmaku: [{ id: "d", mediaId: "old", items: [[2, .2, 100], [302, .2, 200]] }], collections: [{ id: "c", media: ["old"] }],
  });
  const data = makeDataDir(t, doc); fs.mkdirSync(path.join(data, "media")); fs.copyFileSync(file, path.join(data, "media", "cut.mkv"));
  const srv = await startServer(t, data);
  return { ...srv, data, doc, map };
}
const post = (base, route, body) => fetch(base + route, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
test("agent explicit repair remaps annotations and saved version restores them", { skip: !have }, async t => {
  const { base, data, doc, map } = await setup(t);
  const mcp = startMcp(t, data, { FABLECUT_PORT: new URL(base).port, FABLECUT_NO_AUTOSTART: "1" });
  await mcp.request("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "gap-test", version: "1" } });
  const parse = r => { a.equal(r.isError, false, r.text); return JSON.parse(r.text.slice(r.text.indexOf("{"))); };
  let job = parse(await mcp.callTool("fablecut_repair_media", { mediaId: "old", skipGaps: true }));
  const deadline = Date.now() + 60000;
  while (["running", "pending"].includes(job.status) && Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 100)); job = parse(await mcp.callTool("fablecut_repair_media", { job: job.job }));
  }
  a.equal(job.status, "done", JSON.stringify(job));
  const fixed = readProject(data), removed = map.gaps.reduce((n, g) => n + g.to - g.from, 0);
  a.equal(fixed.clips[1].start, 2); a.ok(Math.abs(fixed.clips[2].start - (302 - removed)) < 1 / 30);
  a.equal(fixed.danmaku[0].mediaId, job.result.mediaId);
  a.ok(Math.abs(fixed.danmaku[0].items[1][0] - (302 - removed)) < 1 / 30);
  a.deepEqual(fixed.collections[0].media, [job.result.mediaId]);
  const restored = await post(base, "/api/versions", { action: "restore", version: 1 }); a.equal(restored.status, 200);
  const original = readProject(data); a.deepEqual(original.media, doc.media); a.deepEqual(original.clips, doc.clips); a.deepEqual(original.danmaku, doc.danmaku);
});
test("inside-gap annotation leaves project and media directory unchanged", { skip: !have }, async t => {
  const { base, data } = await setup(t, true), before = fs.readFileSync(path.join(data, "project.json"), "utf8");
  let job = await (await post(base, "/api/repair", { src: "/media/cut.mkv", mediaId: "old", skipGaps: true, applyToProject: true })).json();
  const deadline = Date.now() + 30000;
  while (job.status === "running" && Date.now() < deadline) { await new Promise(r => setTimeout(r, 100)); job = await (await fetch(base + "/api/repair/job?id=" + job.job)).json(); }
  a.equal(job.status, "failed", JSON.stringify(job)); a.equal(job.error.code, "GAP_EDIT_CONFLICT");
  a.equal(fs.readFileSync(path.join(data, "project.json"), "utf8"), before); a.deepEqual(fs.readdirSync(path.join(data, "media")), ["cut.mkv"]);
});
test("an open editor prevents agent replacement of unsaved edits", { skip: !have }, async t => {
  const { base } = await setup(t);
  const req = http.get(base + "/api/events"); req.on("error", () => {}); t.after(() => req.destroy());
  await new Promise(resolve => req.once("response", res => { res.on("error", () => {}); res.resume(); resolve(); }));
  const response = await post(base, "/api/repair", { src: "/media/cut.mkv", mediaId: "old", skipGaps: true, applyToProject: true });
  a.equal(response.status, 409);
  const body = await response.json(); a.equal(body.code, "REPAIR_EDITOR_OPEN");
  a.equal(body.error, "The editor is open, so the assistant won't fix this directly and risk overwriting your edits there. Click “Fix it for me” in the editor instead; your edits stay and you can undo.");
});
