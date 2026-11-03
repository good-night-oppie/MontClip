"use strict";
// Exported files keep a Chinese project name (Deja / JJ, 2026-11-03: the default project name becomes 「未命名项目」, so
// export, the same-name .srt, the mapping JSON, the Save dialog's default name and the file in Downloads must all keep
// Chinese). Until now every one of them replaced or dropped anything outside [A-Za-z0-9_- ]: 「第一次 导出」 came out as
// "_ _.mp4", and 「未命名项目」 as "export". Only what Windows cannot have in a file name is replaced now.
const test = require("node:test"), a = require("node:assert/strict");
const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const { execFileSync } = require("node:child_process");
const D = require("../delivery");
const { makeDataDir, startServer } = require("./helpers");
const read = (f) => fs.readFileSync(path.join(__dirname, "..", f), "utf8");

test("fileSafeName keeps Chinese, and replaces only what Windows cannot have", () => {
  a.equal(D.fileSafeName("未命名项目"), "未命名项目");
  a.equal(D.fileSafeName("周五杂谈 11-02 竖屏 (2)"), "周五杂谈 11-02 竖屏 (2)");
  a.equal(D.fileSafeName('a\\b/c:d*e?f"g<h>i|j'), "a_b_c_d_e_f_g_h_i_j");
  a.equal(D.fileSafeName("  名字. . "), "名字", "no trailing dots or spaces (Windows drops them)");
  a.equal(D.fileSafeName("..隐藏"), "隐藏", "no leading dots");
  a.equal(D.fileSafeName("CON"), "_CON"); a.equal(D.fileSafeName("com1.txt"), "_com1.txt");
  a.equal(D.fileSafeName("", "export"), "export"); a.equal(D.fileSafeName("///", "export"), "_");
  a.equal(D.fileSafeName("x".repeat(300)).length, 120);
  a.equal(D.fileSafeName("a\u0000b\u001fc"), "a_b_c");
});

test("every place that names an exported file uses it: export, captions, mapping, the page's downloads", () => {
  const app = read("app.js"), server = read("server.js"), mcp = read("mcp-server.js");
  a.doesNotMatch(app, /replace\(\/\[\^\\w\\- \]\+\/g/, "app.js: no name reduced to [A-Za-z0-9_- ]");
  a.doesNotMatch(mcp, /replace\(\/\[\^\\w\\- \]\+\/g/, "mcp-server.js: captions and mapping keep Chinese");
  a.match(app, /const exportBaseName = \(fallback\) => Delivery\.fileSafeName\(project\.name, fallback\);/);
  a.match(server, /function exportName\(name\) \{ return Delivery\.fileSafeName\(String\(name \|\| ""\), "export"\); \}/);
  a.match(server, /reserveExportPaths\(EXPORTS_DIR, exportName\(o\.name \|\| "export"\), ext\)/);
  a.match(server, /const safe = exportName\(name \|\| "export"\);/);
});

test("the server exports 未命名项目 as 未命名项目.mp4 and serves it under its encoded name", async (t) => {
  const dir = makeDataDir(t);
  const { base } = await startServer(t, dir, { FABLECUT_NO_FS_WATCH: "1" });
  const h264 = await (await fetch(base + "/api/export/h264")).json();
  if (!h264.encoder) return t.skip("no H.264 encoder on this machine: " + h264.reason);
  if (!h264.encoders.some((e) => !D.ENCODERS[e]?.min)) return t.skip("only a graphics-card encoder with a minimum frame size here");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "fc-cn-")); t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const jpg = path.join(tmp, "f.jpg");
  execFileSync(require("../ffmpeg-path").path("ffmpeg"), ["-y", "-v", "error", "-f", "lavfi", "-i", "color=c=red:s=160x90", "-frames:v", "1", "-q:v", "2", jpg]);
  const post = (p, b) => fetch(base + p, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) });
  const sess = await (await post("/api/export/begin", { fps: 30, name: "未命名项目", hasAudio: false, duration: 0.2,
    delivery: { preset: "custom", width: 160, height: 90 }, canvasW: 160, canvasH: 90 })).json();
  a.ok(sess.id, sess.error);
  await fetch(base + "/api/export/frame?id=" + sess.id, { method: "POST", body: Buffer.concat(Array(6).fill(fs.readFileSync(jpg))) });
  const end = await (await fetch(base + "/api/export/end?id=" + sess.id, { method: "POST" })).json();
  a.equal(end.src, "/exports/" + encodeURIComponent("未命名项目.mp4"), end.error);
  a.ok(fs.existsSync(path.join(dir, "exports", "未命名项目.mp4")));
  const got = await fetch(base + end.src);
  a.equal(got.status, 200); await got.arrayBuffer();
});
