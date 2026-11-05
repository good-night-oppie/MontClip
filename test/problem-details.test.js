/* What 〔复制问题信息〕 copies (#161; JJ, Deja): before JJ's sentence may say 「（文件路径和账号已经去掉）」, these tests show
   that nothing of the computer or of a person is left in it. Synthetic lines carry every shape of path, user name,
   account, key and token on purpose; the copy must hold none of them. Its first line is fixed, for the mail watcher. */
"use strict";
const test = require("node:test"), a = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const R = require("../problem-redact");

// a computer user "alice" (Windows profile alice, Linux /home/alice, macOS /Users/alice); her account, keys and tokens
const LINE = [
  `[export] EXPORT_BLANK_PICTURE: rec.mkv: probe C:\\Users\\alice\\Videos\\直播 录像\\a b.flv failed`,
  `open "D:\\OBS Rec\\2026-11-04 20-00.mkv" and D:/Streams/alice/night.flv and E:\\素材\\开场.mp4`,
  `linux /home/alice/rec/b.flv mac /Users/alice/Movies/c.flv tmp /tmp/montclip-x/a.wav vol /Volumes/Disk/x.mov cwd=~/Movies/x.mov`,
  `share \\\\NAS-01\\share\\alice\\x.mp4 url file:///C:/Users/alice/x.mp4 data dir C:\\Users\\alice\\AppData\\Roaming\\MontClip`,
  `host alice-PC user=alice login=alice_live account=alice2026 "email":"alice@example.com" mail alice@example.com 账号：13812345678 手机号: 13987654321`,
  `Authorization: Bearer abc.DEF-123_xyz token=tk_live_998877 "apiKey":"sk-ABCDEF0123456789" x-api-key: k_55aa66bb sk-proj-ZZZZZZZZZZZZ`,
  `Cookie: SESSDATA=abcd1234%2C99; bili_jct=ffeeddcc gh ghp_ABCDEFGHIJKLMNOP1234 jwt eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0In0.c2lnbmF0dXJlMTIz`,
  `google AIzaSyA1234567890abcdefghijklmnop aws AKIAABCDEFGHIJKLMNOP password=hunter2 secret: s3cr3t client_secret=cs_123456`,
  `viewer uid=34567890 uname=小梨的粉丝 用户名：某某某`,
  `kept: src /media/a.mp4, /library/sfx/whoosh.mp3, exit code 1, ffmpeg n9.0.2, 3600 s`,
].join("\n");
const GONE = [
  // paths, Windows / UNC / file: / Linux / macOS / home-relative
  "C:\\Users", "D:\\OBS", "D:/Streams", "E:\\素材", "直播 录像", "OBS Rec", "2026-11-04 20-00", "Streams", "开场", "NAS-01", "\\share",
  "file:///", "/home/", "/Users/", "/tmp/", "/Volumes/", "~/Movies", "AppData", "Roaming", "Videos", "Movies",
  // the user's name, wherever it is
  "alice",
  // accounts
  "alice_live", "alice2026", "alice@example.com", "example.com", "13812345678", "13987654321",
  // keys and tokens
  "abc.DEF-123_xyz", "tk_live_998877", "sk-ABCDEF0123456789", "k_55aa66bb", "sk-proj-ZZZZZZZZZZZZ", "SESSDATA=abcd", "abcd1234", "ffeeddcc",
  "ghp_ABCDEFGHIJKLMNOP1234", "eyJhbGciOiJIUzI1NiJ9", "c2lnbmF0dXJlMTIz", "AIzaSyA1234567890", "AKIAABCDEFGHIJKLMNOP", "hunter2", "s3cr3t", "cs_123456",
  // viewers (#129)
  "34567890", "小梨的粉丝", "某某某",
];
const PATHLIKE = [/\b[A-Za-z]:[\\/]/, /\\\\[^\s\\]/, /(^|\s)\/(home|Users|tmp|Volumes)\//m, /~\//, /file:/i, /[^\s<>]*\\[^\s<>]*/];

test("the copy holds no path on the computer, no user name, account, key or token — the server's way (home and user known)", () => {
  const out = R.problemDetails(LINE, { home: "C:\\Users\\alice", platform: "win32", user: "alice", language: "zh-CN" });
  for (const g of GONE) a.ok(!out.includes(g), `「${g}」 is still in:\n${out}`);
  for (const re of PATHLIKE) a.doesNotMatch(out, re, "a path is still in:\n" + out);
  // what helps stays: the code, the extension, MontClip's own srcs
  for (const keep of ["EXPORT_BLANK_PICTURE", "<path .flv>", "<path .mkv>", "/media/a.mp4", "/library/sfx/whoosh.mp3", "exit code 1", "ffmpeg n9.0.2", "<email>", "<user>"])
    a.ok(out.includes(keep), `「${keep}」 should stay:\n${out}`);
});

test("the same without the home folder or the user name (the page alone, the server offline): still nothing left", () => {
  const out = R.problemDetails(LINE, { language: "en" });
  // only the user name on its own (alice-PC, user=… is masked by its key) can't be known without the server
  for (const g of GONE.filter((x) => x !== "alice")) a.ok(!out.includes(g), `「${g}」 is still in:\n${out}`);
  for (const re of PATHLIKE) a.doesNotMatch(out, re, "a path is still in:\n" + out);
  // the server answers the page with this computer's home folder and user name
  const server = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
  a.match(server, /Redact\.problemDetails\(String\(body\.text \|\| ""\)\.slice\(0, 8000\), \{ home: os\.homedir\(\), platform: process\.platform, user: userName\(\), language: body\.language \}\)/);
});

test("the first line is fixed, in the interface language — the mail watcher knows a report by it", () => {
  a.deepEqual(R.HEADER, { "zh-CN": "MontClip 问题信息 v1", en: "MontClip problem details v1" });
  a.equal(R.problemDetails("x", { language: "zh-CN" }).split("\n")[0], "MontClip 问题信息 v1");
  a.equal(R.problemDetails("x", { language: "en" }).split("\n")[0], "MontClip problem details v1");
  a.equal(R.problemDetails("x", {}).split("\n")[0], "MontClip 问题信息 v1", "no language: the Chinese one");
  const app = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
  a.match(app, /MontClipRedact\.problemDetails\(r\.line \|\| "", \{ platform: [^}]*, language: mcView\.get\(\)\.language \}\)/, "the page's own fallback starts with it too");
  a.match(app, /body: JSON\.stringify\(\{ text: r\.line \|\| "", language: mcView\.get\(\)\.language \}\)/);
});

test("a sample of what is copied (the PR shows it)", (t) => {
  const out = R.problemDetails(LINE, { home: "C:\\Users\\alice", platform: "win32", user: "alice", language: "zh-CN" });
  t.diagnostic("\n" + out);
  a.equal(out.split("\n").length, LINE.split("\n").length + 1);
});
