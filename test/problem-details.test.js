/* What 〔复制问题信息〕 copies (#161; JJ, Deja). The streamer must see at a glance that nothing of hers is in it:
     1. the explanation is the plain sentence she saw — never the raw error, a call stack or a path; the error code alone,
        on its own line, as 「给开发者看：<错误码>」, with any path taken out;
     2. no file name, user name, account or key: a file only as its type and size (「一个 mp4 文件，1.2 GB」).
   Its first line is fixed (JJ: 「MontClip 问题信息 v1」), for the mail watcher. Synthetic errors carry every shape of path,
   name, account, key and token on purpose; the copy must hold none of them. */
"use strict";
const test = require("node:test"), a = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const R = require("../problem-redact");
const V = require("../ui-preferences");
const { makeDataDir, seedProject, startServer } = require("./helpers");

// a computer user "alice"; her files, account, keys and tokens, in a raw error with a call stack
const LOG = [
  `Error: probe C:\\Users\\alice\\Videos\\直播 录像\\小梨生日会.flv failed: Invalid data found when processing input`,
  `open "D:\\OBS Rec\\2026-11-04 20-00.mkv" and /home/alice/rec/b.flv and /Users/alice/Movies/c.mov and \\\\NAS-01\\share\\x.mp4`,
  `    at Object.<anonymous> (C:\\Users\\alice\\AppData\\Local\\MontClip\\resources\\app\\server.js:1234:56)`,
  `    at process.processTicksAndRejections (node:internal/process/task_queues:95:5)`,
  `host alice-PC user=alice login=alice_live account=alice2026 mail alice@example.com 账号：13812345678`,
  `Authorization: Bearer abc.DEF-123_xyz token=tk_live_998877 "apiKey":"sk-ABCDEF0123456789" ghp_ABCDEFGHIJKLMNOP1234`,
  `Cookie: SESSDATA=abcd1234%2C99; bili_jct=ffeeddcc eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0In0.c2lnbmF0dXJlMTIz password=hunter2`,
  `viewer uid=34567890 uname=小梨的粉丝`,
].join("\n");
const GONE = [
  // the raw error and its call stack
  "Error:", "Invalid data found", "at Object", "anonymous", "server.js", "1234:56", "task_queues", "node:internal",
  // paths and file names
  "C:\\", "D:\\", "\\\\NAS", "/home/", "/Users/", "AppData", "Videos", "Movies", "直播 录像", "小梨生日会", "OBS Rec", "2026-11-04 20-00", "b.flv", "c.mov", "x.mp4",
  // the user, her accounts, keys, tokens, viewers
  "alice", "alice_live", "alice2026", "example.com", "13812345678", "abc.DEF-123_xyz", "tk_live_998877", "sk-ABCDEF0123456789",
  "ghp_ABCDEFGHIJKLMNOP1234", "abcd1234", "ffeeddcc", "eyJhbGciOiJIUzI1NiJ9", "hunter2", "34567890", "小梨的粉丝",
];
const SERVER = { home: "C:\\Users\\alice", platform: "win32", user: "alice" };
/** The copy for an export that came out black, as copyProblem builds it from sayError's result. */
function copy(language, extra = {}) {
  const r = V.errorText(language, { code: "EXPORT_BLANK_PICTURE", error: LOG });
  return { r, out: R.problemDetails({ text: r.text, code: r.code, log: r.log, ...extra }, { ...SERVER, language }) };
}
/** Every line is one JJ allows: the first line, the plain sentence, a file as type and size, the code for developers. */
function shapes(out, language, sentence) {
  const w = language === "en" ? { file: /^File: an? [a-z0-9]{1,5} file, (\d+(\.\d)? [KMGT]?B|size unknown)$/, dev: /^For developers: [A-Za-z0-9_.-]+$/ }
    : { file: /^相关文件：一个 [a-z0-9]{1,5} 文件，(\d+(\.\d)? [KMGT]?B|大小不明)$/, dev: /^给开发者看：[A-Za-z0-9_.-]+$/ };
  const lines = out.split("\n");
  a.equal(lines[0], R.HEADER[language]);
  a.equal(lines[1], sentence, "the sentence she saw, as it is");
  for (const l of lines.slice(2, -1)) a.match(l, w.file, "a file only as its type and size: " + l);
  a.match(lines[lines.length - 1], w.dev);
  return lines;
}

test("JJ 1: the explanation in plain words — no raw error, call stack or path; the code alone, for developers", () => {
  for (const language of ["zh-CN", "en"]) {
    const { r, out } = copy(language);
    const lines = shapes(out, language, r.text);
    a.equal(lines[lines.length - 1], (language === "en" ? "For developers: " : "给开发者看：") + "EXPORT_BLANK_PICTURE");
    for (const g of GONE.slice(0, 8)) a.ok(!out.includes(g), `「${g}」 (the raw error) is in:\n${out}`);
  }
  // a code with a path or junk in it comes out as the code's own characters only
  const out = R.problemDetails({ text: "这次没有做完。", code: "C:\\Users\\alice\\ERR_X <b>" }, { ...SERVER, language: "zh-CN" });
  a.equal(out.split("\n").pop(), "给开发者看：UNKNOWN");
  a.doesNotMatch(out, /alice|ERR_X|<b>/);
});

test("JJ 2: nothing of hers — no file name, user name, account or key; a file as its type and size", () => {
  for (const language of ["zh-CN", "en"]) {
    const { out } = copy(language);
    for (const g of GONE) a.ok(!out.includes(g), `「${g}」 is in:\n${out}`);
    const files = out.split("\n").filter((l) => /^(相关文件：|File: )/.test(l));
    a.deepEqual(files.map((l) => /(?:一个|an?) ([a-z0-9]+) /.exec(l)[1]), ["flv", "mkv", "flv", "mov", "mp4"], "each file the error names, by type only");
  }
  // sizes, as the server looks them up
  a.equal(R.problemDetails({ text: "x", code: "E", files: [{ ext: "mp4", size: 1.2e9 }] }, { language: "zh-CN" }).split("\n")[2], "相关文件：一个 mp4 文件，1.2 GB");
  a.equal(R.problemDetails({ text: "x", code: "E", files: [{ ext: "mkv", size: 734e6 }] }, { language: "en" }).split("\n")[2], "File: an mkv file, 734 MB");
  a.equal(R.problemDetails({ text: "x", code: "E", files: [{ ext: "webm" }] }, { language: "en" }).split("\n")[2], "File: a webm file, size unknown");
  // a sentence that names a file (a UI text with {name}) says only its type
  const named = R.problemDetails({ text: "「小梨生日会.flv」里没写时长。", code: "E" }, { language: "zh-CN" });
  a.equal(named.split("\n")[1], "「一个 flv 文件」里没写时长。");
  // without the server (the page alone): the same, without the user name it can't know
  const page = R.problemDetails({ text: "x", code: "EXPORT_BLANK_PICTURE", log: LOG }, { language: "zh-CN" });
  for (const g of GONE.filter((x) => x !== "alice")) a.ok(!page.includes(g), `「${g}」 is in:\n${page}`);
});

test("the server looks each file's size up, and copies only its type and size", { timeout: 60_000 }, async (t) => {
  const dir = makeDataDir(t, seedProject({ media: [], clips: [] }));
  fs.mkdirSync(path.join(dir, "media"), { recursive: true });
  fs.writeFileSync(path.join(dir, "media", "小梨生日会.mp4"), Buffer.alloc(1_234_567));
  const { base } = await startServer(t, dir, { FABLECUT_NO_FS_WATCH: "1" });
  const res = await fetch(base + "/api/problem-details", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: "这次没有做完。", code: "FLV_PROBE_FAILED", log: `probe ${path.join(dir, "media", "小梨生日会.mp4")} and D:\\gone\\x.mkv failed`, language: "zh-CN" }) });
  const { text } = await res.json();
  a.equal(text, ["MontClip 问题信息 v1", "这次没有做完。", "相关文件：一个 mp4 文件，1.2 MB", "相关文件：一个 mkv 文件，大小不明", "给开发者看：FLV_PROBE_FAILED"].join("\n"));
  const app = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
  a.match(app, /const p = \{ text: r\.text \|\| "", code: r\.code \|\| "", log: r\.log \|\| "" \}/, "the page sends the sentence, the code and the raw error (read for its files only)");
  a.match(app, /MontClipRedact\.problemDetails\(p, \{ platform: [^}]*, language \}\)/, "the page's own fallback, the same rules");
});

test("redactProblem: no path on the computer, user name, account, key or token in what it gives back", () => {
  const out = R.redactProblem(LOG, SERVER);
  for (const g of GONE.slice(8).filter((g) => !["b.flv", "c.mov", "x.mp4"].includes(g))) a.ok(!out.includes(g), `「${g}」 is still in:\n${out}`);
  a.ok(out.includes("<path .flv>") && out.includes("<email>") && out.includes("<user>"));
  a.equal(R.redactProblem("src /media/a.mp4, /library/sfx/whoosh.mp3", {}), "src /media/a.mp4, /library/sfx/whoosh.mp3", "MontClip's own srcs are not paths on the computer");
});

test("the first line is fixed, in the interface language — the mail watcher knows a report by it", () => {
  a.deepEqual(R.HEADER, { "zh-CN": "MontClip 问题信息 v1", en: "MontClip problem details v1" });
  a.equal(R.problemDetails({ text: "x" }, { language: "en" }).split("\n")[0], "MontClip problem details v1");
  a.equal(R.problemDetails({ text: "x" }, {}).split("\n")[0], "MontClip 问题信息 v1", "no language: the Chinese one");
});

test("a sample of what is copied (the PR shows it)", (t) => {
  const r = V.errorText("zh-CN", { code: "EXPORT_BLANK_PICTURE", error: LOG });
  const out = R.problemDetails({ text: r.text, code: r.code, files: R.fileMentions(LOG).map((f, i) => ({ ext: f.ext, size: [1.2e9, 734e6, null, 2.5e8, null][i] })) }, { ...SERVER, language: "zh-CN" });
  t.diagnostic("\n" + out);
  shapes(out, "zh-CN", r.text);
});
