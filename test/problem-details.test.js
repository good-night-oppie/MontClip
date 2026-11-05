/* What 〔复制问题信息〕 copies (#161; JJ, Deja). The streamer must see at a glance that nothing of hers is in it:
     1. what happened, in the plain words she saw (not what to do) — never the raw error, a call stack or a path; the code,
        on its own line, as 「给开发者看（不用管）：<错误码>」; the version line, MontClip's and the system's family only;
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
const APP = { version: "1.18.0", platform: "win32", release: "10.0.22631" };
/** The copy for an export that came out black, as copyProblem builds it from sayError's result (r.what, not r.text). */
function copy(language, extra = {}) {
  const r = V.errorText(language, { code: "EXPORT_BLANK_PICTURE", error: LOG });
  return { r, out: R.problemDetails({ text: r.what, code: r.code, log: r.log, app: APP, ...extra }, { ...SERVER, language }) };
}
/** Every line is one of the five JJ allows: the first line, the version, what happened, a file as type and size, the code. */
function shapes(out, language, what) {
  const w = language === "en"
    ? { version: /^Version: MontClip (\d+\.\d+\.\d+(-[0-9A-Za-z.]+)?|version unknown)( · (Windows 11|Windows 10|Windows|macOS|Linux))?$/,
      file: /^File: an? [a-z0-9]{1,5} file, (\d+(\.\d)? [KMGT]?B|size unknown)$/, dev: /^For developers \(you can ignore this\): [A-Za-z0-9_.-]+$/ }
    : { version: /^版本：MontClip (\d+\.\d+\.\d+(-[0-9A-Za-z.]+)?|版本不明)( · (Windows 11|Windows 10|Windows|macOS|Linux))?$/,
      file: /^相关文件：一个 [a-z0-9]{1,5} 文件，(\d+(\.\d)? [KMGT]?B|大小不明)$/, dev: /^给开发者看（不用管）：[A-Za-z0-9_.-]+$/ };
  const lines = out.split("\n");
  a.equal(lines[0], R.HEADER[language]);
  a.match(lines[1], w.version);
  a.equal(lines[2], what, "what happened, as she saw it");
  for (const l of lines.slice(3, -1)) a.match(l, w.file, "a file only as its type and size: " + l);
  a.match(lines[lines.length - 1], w.dev);
  return lines;
}

test("JJ 1: what happened in plain words — not what to do, no raw error, call stack or path; the code, for developers", () => {
  for (const language of ["zh-CN", "en"]) {
    const { r, out } = copy(language);
    const lines = shapes(out, language, r.what);
    a.equal(lines[lines.length - 1], (language === "en" ? "For developers (you can ignore this): " : "给开发者看（不用管）：") + "EXPORT_BLANK_PICTURE");
    for (const g of GONE.slice(0, 8)) a.ok(!out.includes(g), `「${g}」 (the raw error) is in:\n${out}`);
  }
  // JJ's example: the screen keeps the whole sentence, the copy only what happened
  const zh = V.errorText("zh-CN", { code: "EXPORT_BLANK_PICTURE" });
  a.equal(zh.what, "导出出了问题：成片从头到尾都是黑屏，但时间线上的素材是有画面的。");
  a.ok(zh.text.startsWith(zh.what) && zh.text.length > zh.what.length, "the screen's sentence is unchanged");
  a.equal(V.errorText("en", { code: "EXPORT_BLANK_SOUND" }).what, "The export went wrong: the video has no sound from start to finish, but the clips on the timeline have sound.");
  // a code with a path or junk in it is not copied
  const out = R.problemDetails({ text: "这次没有做完。", code: "C:\\Users\\alice\\ERR_X <b>", app: APP }, { ...SERVER, language: "zh-CN" });
  a.equal(out.split("\n").pop(), "给开发者看（不用管）：UNKNOWN");
  a.doesNotMatch(out, /alice|ERR_X|<b>/);
});

test("what happened: each failure sentence has its part (never cut mid-sentence), and none asks for the button", () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "ui-preferences.js"), "utf8");
  // every sentence errorText can say has its entry: ERROR_TEXT's, the FLV reasons', the export / FFmpeg rows', v2's last row
  const keys = new Set(["errOther", "errDiskFullSize"]);
  for (const m of /const ERROR_TEXT = \{([\s\S]*?)\};/.exec(src)[1].matchAll(/:\s*"([^"]+)"/g)) keys.add(m[1]);
  for (const m of /const FLV_REASONS = \{([\s\S]*?)\};/.exec(src)[1].matchAll(/:\s*"([^"]+)"/g)) keys.add(m[1]);
  for (const k of ["h264NoneWin", "h264NoneOther", "extGone", "extNotFfmpeg", "extNoX264", "extSettingBad", "frameTooSmall", "ffmpegMissing", "extNeeded"]) keys.add(k);
  for (const k of keys) a.ok(Object.hasOwn(V.WHAT_SENTENCES, k), `${k}: which part says what happened?`);
  for (const k of Object.keys(V.WHAT_SENTENCES)) for (const l of ["zh-CN", "en"]) {
    const s = V.t(l, k), w = V.whatHappened(l, k, s);
    a.ok(w && s.startsWith(w), `${k} ${l}: a whole first part of the sentence: ${w}`);
    a.ok(/[。.！!？?]$/.test(w) || w === s, `${k} ${l}: ends where a sentence ends: ${w}`);
    a.ok(!/复制问题信息|Copy problem/.test(w), `${k} ${l}: no button in what happened`);
  }
  // a sentence not listed: everything but the half that asks for the button
  a.equal(V.whatHappened("zh-CN", "unlisted", "出了问题。原片没有改动。再试一次；还不行，点「复制问题信息」发给我们。"), "出了问题。原片没有改动。再试一次。");
  a.equal(V.whatHappened("en", "unlisted", "It failed. Try again; if it still fails, use \"Copy problem details\" and send it to us."), "It failed. Try again.");
});

test("JJ 2: nothing of hers — no file name, user name, account or key; a file as its type and size", () => {
  for (const language of ["zh-CN", "en"]) {
    const { out } = copy(language);
    for (const g of GONE) a.ok(!out.includes(g), `「${g}」 is in:\n${out}`);
    const files = out.split("\n").filter((l) => /^(相关文件：|File: )/.test(l));
    a.deepEqual(files.map((l) => /(?:一个|an?) ([a-z0-9]+) /.exec(l)[1]), ["flv", "mkv", "flv", "mov", "mp4"], "each file the error names, by type only");
  }
  // sizes, as the server looks them up
  const line = (files, language) => R.problemDetails({ text: "x", code: "E", files }, { language }).split("\n")[3];
  a.equal(line([{ ext: "mp4", size: 1.2e9 }], "zh-CN"), "相关文件：一个 mp4 文件，1.2 GB");
  a.equal(line([{ ext: "mkv", size: 734e6 }], "en"), "File: an mkv file, 734 MB");
  a.equal(line([{ ext: "webm" }], "en"), "File: a webm file, size unknown");
  // a sentence that names a file (a UI text with {name}) says only its type
  const named = R.problemDetails({ text: "「小梨生日会.flv」里没写时长。", code: "E" }, { language: "zh-CN" });
  a.equal(named.split("\n")[2], "「一个 flv 文件」里没写时长。");
  // without the server (the page alone): the same, without the user name it can't know
  const page = R.problemDetails({ text: "x", code: "EXPORT_BLANK_PICTURE", log: LOG }, { language: "zh-CN" });
  for (const g of GONE.filter((x) => x !== "alice")) a.ok(!page.includes(g), `「${g}」 is in:\n${page}`);
});

test("the version line: MontClip's version and the system's family — nothing slipped into them gets through", () => {
  a.equal(R.versionLine(APP, "zh-CN"), "版本：MontClip 1.18.0 · Windows 11");
  a.equal(R.versionLine({ version: "1.18.0", platform: "win32", release: "10.0.19045" }, "en"), "Version: MontClip 1.18.0 · Windows 10");
  a.equal(R.versionLine({ version: "1.19.0-rc.1", platform: "darwin", release: "24.1.0" }, "en"), "Version: MontClip 1.19.0-rc.1 · macOS");
  a.equal(R.versionLine({ version: "1.18.0", platform: "linux", release: "6.8.0-45-generic" }, "zh-CN"), "版本：MontClip 1.18.0 · Linux");
  a.equal(R.versionLine({}, "zh-CN"), "版本：MontClip 版本不明");
  // paths, a user name, a host, a build, a locale put into where the version and the system come from
  const dirty = [
    { version: "1.18.0 C:\\Users\\alice\\AppData\\Local\\MontClip", platform: "win32", release: "10.0.22631.4460 alice-PC" },
    { version: "/home/alice/montclip/1.18.0", platform: "linux alice", release: "6.8.0 (alice@build-host) zh_CN.UTF-8" },
    { version: "1.18.0\nalice@example.com", platform: "darwin /Users/alice", release: "24.1.0 /Users/alice/Library" },
    { version: "sk-ABCDEF0123456789", platform: "Win32 C:\\Users\\alice", release: "C:\\Users\\alice\\10.0.22631" },
  ];
  for (const app of dirty) for (const language of ["zh-CN", "en"]) {
    const out = R.problemDetails({ text: "x", code: "E", app }, { ...SERVER, language }), v = out.split("\n")[1];
    a.match(v, language === "en" ? /^Version: MontClip (\d+\.\d+\.\d+|version unknown)( · (Windows 11|Windows 10|Windows|macOS|Linux))?$/
      : /^版本：MontClip (\d+\.\d+\.\d+|版本不明)( · (Windows 11|Windows 10|Windows|macOS|Linux))?$/, v);
    for (const g of ["alice", "C:\\", "/home", "/Users", "AppData", "Library", "PC", "build", "4460", "zh_CN", "UTF", "example.com", "sk-", "generic"])
      a.ok(!v.includes(g), `「${g}」 in the version line: ${v}`);
  }
  // the server reads package.json and the system; the page alone has no version to say
  const server = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
  a.match(server, /return require\("\.\/package\.json"\)\.version;/);
  a.match(server, /const app = \{ version, platform: process\.platform, release: os\.release\(\) \};/);
});

test("the server looks each file's size up, and says the version", { timeout: 60_000 }, async (t) => {
  const dir = makeDataDir(t, seedProject({ media: [], clips: [] }));
  fs.mkdirSync(path.join(dir, "media"), { recursive: true });
  fs.writeFileSync(path.join(dir, "media", "小梨生日会.mp4"), Buffer.alloc(1_234_567));
  const { base } = await startServer(t, dir, { FABLECUT_NO_FS_WATCH: "1" });
  const res = await fetch(base + "/api/problem-details", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: "这次没有做完。", code: "FLV_PROBE_FAILED", log: `probe ${path.join(dir, "media", "小梨生日会.mp4")} and D:\\gone\\x.mkv failed`, language: "zh-CN" }) });
  const { text } = await res.json();
  const version = R.versionLine({ version: require("../package.json").version, platform: process.platform, release: require("node:os").release() }, "zh-CN");
  a.equal(text, ["MontClip 问题信息 v1", version, "这次没有做完。", "相关文件：一个 mp4 文件，1.2 MB", "相关文件：一个 mkv 文件，大小不明", "给开发者看（不用管）：FLV_PROBE_FAILED"].join("\n"));
  a.match(version, /^版本：MontClip \d+\.\d+\.\d+ · (Windows 11|Windows 10|Windows|macOS|Linux)$/);
  const app = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
  a.match(app, /const p = \{ text: r\.what \|\| r\.text \|\| "", code: r\.code \|\| "", log: r\.log \|\| "" \}/, "the page sends what happened, the code and the raw error (read for its files only)");
  a.match(app, /MontClipRedact\.problemDetails\(\{ \.\.\.p, app: \{ platform: navigator\.platform \|\| "" \} \}, \{ platform: [^}]*, language \}\)/, "the page's own fallback, the same rules");
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

test("samples of what is copied (the PR shows them)", (t) => {
  for (const language of ["zh-CN", "en"]) {
    const r = V.errorText(language, { code: "EXPORT_BLANK_PICTURE", error: "rec_web_720p.mp4: the exported file is black from start to end" });
    const a1 = R.problemDetails({ text: r.what, code: r.code, files: [{ ext: "mp4", size: 1.2e9 }], app: APP }, { ...SERVER, language });
    t.diagnostic("A " + language + "\n" + a1);
    shapes(a1, language, r.what);
  }
  const r = V.errorText("zh-CN", { code: "EXPORT_BLANK_PICTURE", error: LOG });
  const b = R.problemDetails({ text: r.what, code: r.code, app: APP, files: R.fileMentions(LOG).map((f, i) => ({ ext: f.ext, size: [1.2e9, 734e6, null, 2.5e8, null][i] })) }, { ...SERVER, language: "zh-CN" });
  t.diagnostic("B\n" + b);
  shapes(b, "zh-CN", r.what);
});
