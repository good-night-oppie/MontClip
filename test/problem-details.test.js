/* JJ v2 (2026-11-04, section 1, rule 2) for what #132 shows a streamer: raw errors, error codes and English never on
   the page; first what happened, then what she can do; a 〔复制问题信息〕 button that copies the log line with the code
   and the raw error, user paths cut to the file name and no keys or tokens, and the small print under it. The raw
   line stays in the console. Synthetic errors only. */
"use strict";
const test = require("node:test");
const a = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const P = require("../problem-details");
const V = require("../ui-preferences");
const J = require("../export-jobs");

const ROOT = path.join(__dirname, "..");
const app = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
const TOKEN = "0123456789abcdef".repeat(4);   // 64 hex, like MONTCLIP_EMBED_TOKEN
const zh = (k) => V.text["zh-CN"]["own." + k], en = (k) => V.text.en["own." + k];

test("paths shrink to the file name; keys and tokens go", () => {
  const raw = [
    "could not open C:\\Users\\ada\\Videos\\直播 回放\\录像 1.flv",
    "and D:/OBS/2026-11-04 晚场/rec.mp4",
    "and %USERPROFILE%\\AppData\\Local\\Temp\\fablecut-dry-1\\probe0.mp4",
    "and \\\\nas\\share\\ada\\clip.mov",
    "and /home/ada/montclip/media/a.mp4 and ~/Movies/b.mov and /Users/ada/c.wav",
    `GET http://127.0.0.1:7777/?token=${TOKEN}&x=1`,
    `X-MontClip-Session: ${TOKEN}`,
    "Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.e30.abc_DEF-123",
    "key sk-or-v1-0a1b2c3d4e5f6a7b8c9d and api_key=hunter2",
  ].join("; ");
  const s = P.scrub(raw);
  for (const name of ["录像 1.flv", "rec.mp4", "probe0.mp4", "clip.mov", "a.mp4", "b.mov", "c.wav"]) a.ok(s.includes(name), name + " in: " + s);
  for (const gone of ["ada", "Users", "Videos", "直播 回放", "OBS", "晚场", "AppData", "USERPROFILE", "nas", "home", "Movies", TOKEN, "eyJhbG", "sk-or-v1-0a1b", "hunter2"])
    a.ok(!s.includes(gone), `"${gone}" left in: ${s}`);
  a.ok(s.includes("http://127.0.0.1:7777/"), "a URL is not a user path");
  a.equal(P.scrub("POST /api/export/job/cancel?id=x_ab12cd34"), "POST /api/export/job/cancel?id=x_ab12cd34", "the editor's own routes stay");
});

test("the copied line has the code and the raw error, scrubbed", () => {
  const error = `the editor tab stopped answering for 20 s — C:\\Users\\ada\\x.mp4 token=${TOKEN}`;
  const line = P.copyLine({ code: "EDITOR_STOPPED_ANSWERING", error }, new Date("2026-11-04T10:00:00Z"));
  a.match(line, /EDITOR_STOPPED_ANSWERING/);
  a.match(line, /the editor tab stopped answering for 20 s/);
  a.match(line, /x\.mp4/);
  a.ok(!/ada|Users/.test(line) && !line.includes(TOKEN), line);
  a.match(line, /2026-11-04T10:00:00/);
  a.match(P.copyLine({ error: "boom" }), /UNKNOWN: boom/, "no code still copies");
  a.equal(P.logLine({ code: "JOB_BUSY", error }, new Date(0)).includes("C:\\Users\\ada\\x.mp4"), true, "the console keeps it raw");
});

test("what the page says: plain words, no code, no raw English", () => {
  const job = J.createExportJobs({ editors: () => 1, url: () => "", broadcast() {}, now: () => 0 });
  let busy; job.request({ kind: "scopes" }); try { job.request({}); } catch (e) { busy = e; } job.shutdown();
  for (const [code, key] of [["JOB_BUSY", "err-job-busy"], ["EDITOR_STOPPED_ANSWERING", "err-editor-stopped"], [null, "err-unexpected"]]) {
    a.ok(app.includes(code ? `${code}: "own.${key}"` : `uiText("own.${key}")`), key + " is what the page says");
    for (const [lang, s] of [["zh", zh(key)], ["en", en(key)]]) {
      a.ok(s, lang + " " + key);
      a.ok(!/\b[A-Z][A-Z0-9]*_[A-Z0-9_]+\b/.test(s), `${lang} ${key} has a code: ${s}`);
      a.ok(!/fablecut_|\/api\/|where:|headless|x_[a-z0-9]{8}/.test(s), `${lang} ${key} has tool words: ${s}`);
      a.ok(!s.includes(busy.message.slice(0, 20)), `${lang} ${key} is not the raw error`);
    }
    a.equal(zh(key).replace(/MontClip/g, "").match(/[A-Za-z]{2,}/), null, "no English in " + zh(key));
    a.ok(!/助手/.test(zh(key)) && !/assistant/i.test(en(key)), "nothing she can't see does it for her: " + zh(key));
    a.match(zh(key), /复制问题信息/, "it says where to go if it keeps failing");
  }
  a.equal(zh("err-unexpected"), "这次没有做完，出了个我们没预料到的问题。原片没有改动。再试一次；还不行，点「复制问题信息」发给我们。", "JJ v2, as finalised");
  a.equal(en("err-unexpected"), "This didn't finish because of a problem we didn't expect. The original is unchanged. Try again; if it still fails, use \"Copy problem details\" and send it to us.");
  a.equal(zh("copy-problem"), "复制问题信息"); a.equal(en("copy-problem"), "Copy problem details");
  a.equal(zh("copy-problem-note"), "复制的内容不含你的文件夹路径、密钥和观众信息。");
  a.equal(en("copy-problem-note"), "What's copied leaves out your folder paths, keys and viewer details.");
});

test("the page logs the raw line, shows the words, copies the scrubbed line", () => {
  const at = app.indexOf("function showProblem(");
  a.ok(at > 0, "showProblem");
  const fn = app.slice(at, app.indexOf("\n}\n", at));
  a.match(fn, /console\.(warn|error)\(MontClipProblem\.logLine\(/, "the raw line goes to the console");
  a.match(fn, /codeText\(problem\) \|\| uiText\("own\.err-unexpected"\)/, "words for the code, else JJ's catch-all");
  a.match(fn, /MontClipProblem\.copyLine\(/, "the button copies the scrubbed line");
  a.match(fn, /own\.copy-problem-note/, "with the small print under it");
  a.ok(!/\.error\b(?!\))[^;]*textContent|textContent[^;]*\.error\b/.test(fn), "the raw error is never put on the page");
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  a.ok(html.indexOf('src="problem-details.js"') > 0 && html.indexOf('src="problem-details.js"') < html.indexOf('src="app.js"'), "loaded before app.js");
});

test("a tab whose job the queue ended is told why, and says so in plain words", () => {
  let now = 0;
  const q = J.createExportJobs({ editors: () => 1, url: () => "", broadcast() {}, now: () => now });
  const j = q.request({});
  q.claim(j.id, { hidden:true }); now += J.TAB_SILENT_MS + 1; q.sweep();
  const r = q.report(j.id, { progress: 0.3 });
  a.equal(r.cancel, true); a.equal(r.code, "EDITOR_STOPPED_ANSWERING"); a.match(r.error, /stopped answering/);
  const c = q.request({}); q.cancel(c.id);
  a.deepEqual(q.report(c.id, {}), { cancel: true }, "a cancel the agent asked for is not a problem to show");
  q.shutdown();
  const at = app.indexOf("async function runExportJob("), body = app.slice(app.indexOf("async function reportExportJob("), at + 2000);
  a.equal((body.match(/jobProblem\(/g) || []).length >= 2, true, "both the progress reply and the heartbeat reply show it");
});
