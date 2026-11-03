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

// One rule for every exported file name (Deja, 2026-11-03, option b; VV's list): what Windows cannot have becomes "-",
// spaces collapse, no trailing dots or spaces, Windows' reserved names are avoided (with an extension too), and a long
// name is cut by characters — never through a surrogate pair — leaving room for a suffix such as " 竖屏 (2)".
test("fileSafeName keeps Chinese, and replaces only what Windows cannot have — with -", () => {
  a.equal(D.fileSafeName("未命名项目"), "未命名项目");
  a.equal(D.fileSafeName("周五杂谈 11-02 竖屏 (2)"), "周五杂谈 11-02 竖屏 (2)");
  // JJ (2026-11-03): : ? * " < > | become their full-width forms, so 「周五杂谈：唱歌」 reads as written; only / and \
  // (and control characters) become "-"
  a.equal(D.fileSafeName('a\\b/c:d*e?f"g<h>i|j'), "a-b-c：d＊e？f＂g＜h＞i｜j");
  a.equal(D.fileSafeName("a\u0000b\u001fc\u007fd"), "a-b-c-d", "control characters too");
  a.equal(D.fileSafeName("周五:杂谈?"), "周五：杂谈？", "the last one too");
  a.equal(D.fileSafeName("周五杂谈：唱歌"), "周五杂谈：唱歌", "full-width already: kept as is");
  a.equal(D.fileSafeName("周五杂谈:唱歌"), "周五杂谈：唱歌");
  a.equal(D.fileSafeName("A/B\\C"), "A-B-C", "/ and \\ become -");
});

test("spaces collapse; no trailing spaces or dots; no leading dots", () => {
  a.equal(D.fileSafeName("  周五   杂谈\t 11-02  "), "周五 杂谈 11-02");
  a.equal(D.fileSafeName("名字. . "), "名字");
  a.equal(D.fileSafeName("..隐藏"), "隐藏");
});

test("Windows' reserved names are avoided, with or without an extension; COM0 / LPT0 and longer names are not reserved", () => {
  for (const n of ["CON", "prn", "Aux", "NUL", "COM1", "com9", "LPT1", "lpt9", "con.mp4", "COM3.srt", "nul.tar.gz"])
    a.notEqual(D.fileSafeName(n).toLowerCase().split(".")[0], n.toLowerCase().split(".")[0], n);
  a.equal(D.fileSafeName("CON"), "CON-");
  a.equal(D.fileSafeName("con.mp4"), "con-.mp4");
  for (const n of ["COM0", "LPT0", "CONSOLE", "console.mp4", "com10"]) a.equal(D.fileSafeName(n), n, n);
});

test("long names are cut by characters, never through a surrogate pair, leaving room for a suffix", () => {
  a.equal(D.fileSafeName("x".repeat(300)).length, 120);
  a.equal(Array.from(D.fileSafeName("直".repeat(300))).length, 120);
  const emoji = "😀".repeat(200), cut = D.fileSafeName(emoji);
  a.equal(Array.from(cut).length, 120); a.ok(!/[\uD800-\uDBFF]$/.test(cut), "no lone high surrogate at the end");
  a.ok(!/^[\uDC00-\uDFFF]/.test(cut));
  const room = " 竖屏 (2)", base = D.fileSafeName("直".repeat(300), "export", { reserve: Array.from(room).length });
  a.equal(Array.from(base + room).length, 120, "the suffix fits within the limit");
  a.equal(D.fileSafeName("名字很长".repeat(40), "export", { max: 10 }), "名字很长名字很长名字");
  a.equal(D.fileSafeName("abc    ".repeat(30), "export", { max: 6 }), "abc ab".trim(), "and no trailing space after the cut");
});

test("empty or nothing left: the fallback", () => {
  a.equal(D.fileSafeName("", "export"), "export");
  a.equal(D.fileSafeName("   ", "captions"), "captions");
  a.equal(D.fileSafeName(null), "export");
});

// VV's checks on e80a77d (Deja, 2026-11-03): direction controls and zero-width characters are removed, not replaced —
// with them 「录像‮gnp.exe」 shows in Explorer as a name ending in .exe; and a name that is only "-", spaces and dots
// after cleaning counts as empty, so the caller's fallback is used.
test("direction controls are removed: an RLO name cannot pose as another extension", () => {
  a.equal(D.fileSafeName("录像‮gnp.exe"), "录像gnp.exe");
  for (const c of ["‪", "‫", "‬", "‭", "‮", "⁦", "⁧", "⁨", "⁩", "‎", "‏"])
    a.equal(D.fileSafeName("直播" + c + "切片"), "直播切片", "U+" + c.charCodeAt(0).toString(16));
});

test("zero-width characters are removed", () => {
  a.equal(D.fileSafeName("直​播‌切‍片"), "直播切片");
  a.equal(D.fileSafeName("a​b"), "ab", "removed, not replaced with -");
});

// QQ (review of b7a9e19): every format character goes (\p{Cf}), not a list of ranges — U+2060 WORD JOINER, U+061C,
// U+2061–2064, U+206A–206F, U+00AD, U+180E and U+FFF9–FFFB stayed in the name before ("a\u2060b" came back as it was).
// A ZWJ is one of them, so an emoji sequence joined with ZWJ falls apart into its single emoji (Deja: accepted, noted).
test("every format character (\\p{Cf}) is removed, wherever it is", () => {
  a.equal(D.fileSafeName("a\u2060b"), "ab");
  for (const c of ["\u061C", "\u2061", "\u2064", "\u206A", "\u206F", "\u00AD", "\u180E", "\uFFF9", "\uFFFB"])
    a.equal(D.fileSafeName("直播" + c + "切片"), "直播切片", "U+" + c.codePointAt(0).toString(16).toUpperCase());
  let n = 0;
  for (let cp = 0; cp <= 0x10FFFF; cp++) {
    if (cp >= 0xD800 && cp <= 0xDFFF) continue;
    const c = String.fromCodePoint(cp);
    if (!/\p{Cf}/u.test(c)) continue;
    n++;
    const out = D.fileSafeName("a" + c + "b");
    a.ok(!/\p{Cf}/u.test(out), "U+" + cp.toString(16).toUpperCase() + " left in " + JSON.stringify(out));
    a.equal(out, "ab", "U+" + cp.toString(16).toUpperCase());
  }
  a.ok(n > 150, "the scan saw " + n + " format characters");
  a.equal(D.fileSafeName("👩\u200D💻"), "👩💻", "a ZWJ sequence falls apart into its emoji");
});

test("CONIN$ and CONOUT$ are reserved too", () => {
  a.equal(D.fileSafeName("CONIN$"), "CONIN$-");
  a.equal(D.fileSafeName("conout$.mp4"), "conout$-.mp4");
  a.equal(D.fileSafeName("CONIN$X"), "CONIN$X", "a longer name is not reserved");
});

test("the MCP captions and mapping names go through fileSafeName's own limit, not a cut afterwards", () => {
  const mcp = read("mcp-server.js");
  a.doesNotMatch(mcp, /fileSafeName\([^)]*\)\)?\.slice\(0, ?80\)/);
  a.match(mcp, /Delivery\.fileSafeName\(String\(proj\.name \|\| ""\), "captions", \{ max: 80 \}\)/);
});

test("a BOM at the start (or anywhere) is removed", () => {
  a.equal(D.fileSafeName("﻿周五杂谈"), "周五杂谈");
  a.equal(D.fileSafeName("周五﻿杂谈"), "周五杂谈");
});

test("「///」 leaves only - : the caller's fallback; 「???」 is now 「？？？」, a name", () => {
  a.equal(D.fileSafeName("///"), "export");
  a.equal(D.fileSafeName("///", "直播切片 11-02"), "直播切片 11-02");
  a.equal(D.fileSafeName("\\/ \\"), "export");
  a.equal(D.fileSafeName("???"), "？？？", "changed with the full-width rule (was the fallback)");
  a.equal(D.fileSafeName("‮​", "export"), "export", "nothing but invisible characters");
});

test("「- -」 (only -, spaces and dots) is empty too", () => {
  a.equal(D.fileSafeName("- -"), "export");
  a.equal(D.fileSafeName("- -", "直播切片 11-02"), "直播切片 11-02");
  a.equal(D.fileSafeName(" . - . "), "export");
  a.equal(D.fileSafeName("名字. . "), "名字", "trailing spaces and dots still go");
  a.equal(D.fileSafeName("nul.mp4"), "nul-.mp4", "reserved names still get -");
  a.equal(D.fileSafeName("-a-"), "-a-", "a real character keeps the name");
});

test("the delivery template names files by the same rule (one rule, written once)", () => {
  const src = read("delivery.js");
  a.equal((src.match(/function fileSafeName\(/g) || []).length, 1, "one rule");
  a.equal((src.match(/＊/g) || []).length, 1, "the full-width forms are listed in one place");
  const spec = D.normalize("master").spec;
  a.equal(D.renderFilename("{project}_{preset}", spec, { project: "周五:杂谈" }), "周五：杂谈_master");
});

test("every place that names an exported file uses it: export, captions, mapping, the page's downloads", () => {
  const app = read("app.js"), server = read("server.js"), mcp = read("mcp-server.js");
  a.doesNotMatch(app, /replace\(\/\[\^\\w\\- \]\+\/g/, "app.js: no name reduced to [A-Za-z0-9_- ]");
  a.doesNotMatch(mcp, /replace\(\/\[\^\\w\\- \]\+\/g/, "mcp-server.js: captions and mapping keep Chinese");
  // the fallback for a name with nothing usable is 直播切片 {月-日} in Chinese (第四批, test/default-names.test.js)
  a.match(app, /const exportBaseName = \(fallback\) => Delivery\.fileSafeName\(project\.name, MontClipView\.exportFallback\(mcView\.get\(\)\.language, fallback\)\);/);
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
  // the check after the export (ffprobe and loudness on the Chinese path) ran and passed
  const o = (end.outputs || [])[0] || {};
  a.equal(o.ok, true); a.equal(o.report && o.report.ok, true, JSON.stringify(o.report));
  const got = await fetch(base + end.src);
  a.equal(got.status, 200); await got.arrayBuffer();
});
