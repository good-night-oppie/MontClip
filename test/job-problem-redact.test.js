/* #132 on #129's rules (QQ on b6b5e726): when the queue ends a quiet tab's job, the tab says so in errorText's words
   with 〔复制问题信息〕, and what that button copies goes through problem-redact.js — by the server
   (POST /api/problem-details, with this computer's home folder) or by the page's copy of the rules when the server
   can't be reached. Viewer names, uids, danmaku user= / uid= and the home folder must not leave the computer.
   The page's own functions (sayError, copyProblem, jobProblem) run here as they are in app.js. Made-up names only. */
"use strict";
const test = require("node:test");
const a = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const V = require("../ui-preferences");
const R = require("../problem-redact");
const J = require("../export-jobs");
const { makeDataDir, startServer } = require("./helpers");

const ROOT = path.join(__dirname, "..");
const app = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
const fnBody = (head) => { const at = app.indexOf(head); a.ok(at >= 0, head); let d = 0, i = app.indexOf("{", at);
  for (; i < app.length; i++) { if (app[i] === "{") d++; else if (app[i] === "}" && --d === 0) break; } return app.slice(at, i + 1); };

const WIN = process.platform === "win32";
// a made-up home folder for the server child: os.homedir() reads USERPROFILE on Windows, HOME elsewhere
const HOME = WIN ? "C:\\Users\\bob" : "/home/bob";
const VIEWERS = ["小梨的粉丝", "小梨的粉丝二号", "bob的粉丝", "12345678", "87654321", "23456789", "34567890", "8f3a2b1c"];
/** A queue reply as the tab gets it, with viewer lines and paths in its raw error (what a raw error can carry). */
function replyWithViewers(reply) {
  return { ...reply, error: [reply.error,
    `<d p="12.3,1,25,16777215,1730000000,0,8f3a2b1c,0" user="小梨的粉丝" uid="12345678">好听</d>`,
    "danmaku user=小梨的粉丝二号 uid=87654321 text=晚上好",
    `{"uid":23456789,"uname":"bob的粉丝","msg":"来了"}`,
    "昵称：小梨的粉丝 uid: 34567890",
    `open ${HOME}${WIN ? "\\Videos\\直播 回放\\rec.flv" : "/Videos/直播 回放/rec.flv"}`,
    "and C:\\Users\\bob\\Desktop\\a.mp4 and /home/bob/b.mp4 and /Users/bob/c.mp4",
  ].join("\n") };
}
/** The queue ends a hidden tab's quiet job; the tab's next report is told why. */
function queueReply() {
  let now = 0;
  const q = J.createExportJobs({ editors: () => 1, url: () => "", broadcast() {}, now: () => now });
  const j = q.request({});
  q.claim(j.id, { tabId: "tab_a", hidden: true });
  now += J.TAB_SILENT_MS + 1; q.sweep();
  const r = q.report(j.id, { progress: 0.4, tabId: "tab_a" });
  q.shutdown();
  return { id: j.id, reply: r };
}
/** app.js's sayError, copyProblem and jobProblem in a page-like sandbox; fetch is the caller's. */
function page(fetch, language = "zh-CN") {
  const shown = [], warned = [], toasts = [];
  let copied = null;
  const ctx = {
    MontClipView: V, MontClipRedact: R, mcView: { get: () => ({ language }) },
    navigator: { platform: WIN ? "Win32" : "Linux x86_64", clipboard: { writeText: async (s) => { copied = s; } } },
    fetch, JSON, String, Set, console: { warn: (s) => warned.push(s) },
    toast: (s) => toasts.push(s),
    toastAction: (msg, label, onClick, note) => shown.push({ msg, label, onClick, note }),
  };
  vm.createContext(ctx);
  vm.runInContext([
    "const uiText = (key, vars) => MontClipView.t(mcView.get().language, key, vars);",
    fnBody("function sayError("), fnBody("async function copyProblem("),
    "const jobProblemShown = new Set();", fnBody("function jobProblem("),
    "this.jobProblem = jobProblem;",
  ].join("\n"), ctx);
  return { ctx, shown, warned, toasts, copied: () => copied };
}
function assertClean(out, { home }) {
  for (const gone of VIEWERS) a.ok(!out.includes(gone), `"${gone}" left in: ${out}`);
  a.ok(!/\bbob\b/.test(out.replace(/bob的粉丝/g, "")), "no user folder name in: " + out);
  a.match(out, /user="…"/); a.match(out, /uid="…"/); a.match(out, /user=…/); a.match(out, /uid=…/);
  a.match(out, /"uid":"…"/); a.match(out, /"uname":"…"/); a.match(out, /昵称：…/);
  a.match(out, /EDITOR_STOPPED_ANSWERING/, "the code stays");
  a.match(out, /the editor tab stopped answering for 20 s/, "the queue's own words stay");
  a.match(out, /rec\.flv/); a.match(out, /a\.mp4/);
  if (home) a.ok(out.includes(R.maskUserPath(`open ${HOME}`, { home: HOME, platform: process.platform })), "the home folder as maskUserPath has it");
  a.match(out, /%USERPROFILE%\\Desktop\\a\.mp4/); a.match(out, /~\/b\.mp4/); a.match(out, /~\/c\.mp4/);
}

test("the queue's reply: the code and why, for the tab to say", () => {
  const { reply } = queueReply();
  a.equal(reply.cancel, true); a.equal(reply.code, "EDITOR_STOPPED_ANSWERING"); a.match(reply.error, /stopped answering/);
});

test("the tab says errorText's words, with 〔复制问题信息〕 and the small print; the raw line goes to the log only", () => {
  for (const language of ["zh-CN", "en"]) {
    const { id, reply } = queueReply(), p = page(async () => { throw new Error("offline"); }, language);
    const raw = replyWithViewers(reply);
    p.ctx.jobProblem(id, raw);
    p.ctx.jobProblem(id, raw);
    a.equal(p.shown.length, 1, "once per job");
    const [s] = p.shown;
    a.equal(s.msg, V.t(language, "own.err-editor-stopped"), "the sentence this PR had for the code, unchanged");
    a.equal(s.msg, V.errorText(language, reply).text);
    a.equal(s.label, V.t(language, "btnCopyProblem")); a.equal(s.note, V.t(language, "copyProblemNote"));
    for (const gone of VIEWERS) a.ok(!s.msg.includes(gone));
    a.ok(!s.msg.includes(reply.error.slice(0, 20)), "no raw error on screen");
    a.equal(p.warned.length, 1); a.ok(p.warned[0].includes("小梨的粉丝") && p.warned[0].includes("EDITOR_STOPPED_ANSWERING"), "the log keeps it raw");
    p.ctx.jobProblem(id + "_other", { cancel: true });
    a.equal(p.shown.length, 1, "a cancel the agent asked for says nothing");
  }
});

test("offline: the page's copy of #129's rules takes viewers and user folders out", async () => {
  const { id, reply } = queueReply(), p = page(async () => { throw new Error("offline"); });
  p.ctx.jobProblem(id, replyWithViewers(reply));
  await p.shown[0].onClick();
  const out = p.copied();
  a.ok(out, "copied");
  assertClean(out, { home: false });
  a.deepEqual(p.toasts, [V.t("zh-CN", "own.copy-problem-done")]);
});

test("through the server: POST /api/problem-details masks viewers and this computer's home folder", async (t) => {
  const srv = await startServer(t, makeDataDir(t), { USERPROFILE: HOME, HOME });
  const calls = [];
  const fetchToServer = (url, init) => { calls.push(url); return fetch(srv.base + url, init); };
  const { id, reply } = queueReply(), p = page(fetchToServer);
  const raw = replyWithViewers(reply);
  p.ctx.jobProblem(id, raw);
  await p.shown[0].onClick();
  a.deepEqual(calls, ["/api/problem-details"]);
  const out = p.copied();
  assertClean(out, { home: true });
  a.equal(out, R.redactProblem(p.warned[0], { home: HOME, platform: process.platform }), "the server's answer is #129's rules with its home folder");
  a.ok(!out.includes(HOME), "the home folder is gone");
});

test("#132 keeps no scrub of its own", () => {
  a.equal(fs.existsSync(path.join(ROOT, "problem-details.js")), false);
  a.ok(!/MontClipProblem|showProblem|codeText\(/.test(app));
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  a.ok(!html.includes("problem-details.js"));
  a.ok(html.indexOf('src="problem-redact.js"') > 0 && html.indexOf('src="problem-redact.js"') < html.indexOf('src="app.js"'));
});
