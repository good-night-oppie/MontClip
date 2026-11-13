"use strict";
// Deja (2026-11-03, 第四批): a new project is called 未命名项目 (Untitled Project in English); when a project's name leaves
// nothing usable for a file name (all slashes), a Chinese export is called 直播切片 {月-日} instead of "export".
const test = require("node:test"), a = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), os = require("node:os");
const V = require("../ui-preferences"), D = require("../delivery");
const read = (f) => fs.readFileSync(path.join(__dirname, "..", f), "utf8");

test("the default project name follows the language", () => {
  a.equal(V.defaultProjectName("zh-CN"), "未命名项目");
  a.equal(V.defaultProjectName("en"), "Untitled project"); // JJ, 插件试用 P7
  a.equal(V.defaultProjectName(undefined), "未命名项目", "Chinese first");
});
test("a name with nothing usable for a file falls back to 直播切片 {月-日} in Chinese, the old word in English", () => {
  const day = new Date(2026, 10, 3);
  a.equal(V.exportFallback("zh-CN", "export", day), "直播切片 11-03");
  a.equal(V.exportFallback("zh-CN", "captions", new Date(2026, 0, 9)), "直播切片 01-09");
  a.equal(V.exportFallback("en", "export", day), "export");
  a.equal(D.fileSafeName("///", V.exportFallback("zh-CN", "export", day)), "直播切片 11-03");
  a.equal(D.fileSafeName("直播回放", V.exportFallback("zh-CN", "export", day)), "直播回放", "a usable name is kept");
});
test("the page uses them: new-project dialog, empty names, export and caption file names", () => {
  const app = read("app.js");
  a.match(app, /const exportBaseName = \(fallback\) => Delivery\.fileSafeName\(MontClipView\.exportProjectName\(project\.name, \(project\.media \|\| \[\]\)\.map\(\(m\) => m\.name\)\),\s*MontClipView\.exportFallback\(mcView\.get\(\)\.language, fallback\)\);/);
  a.match(app, /id="pjNewName" value="\$\{escapeHtml\(MontClipView\.defaultProjectName\(mcView\.get\(\)\.language\)\)\}"/);
  a.ok(!/\|\| "Untitled [Pp]roject"/.test(app), "no hard-coded English default left in the page");
});
test("a project made by the server or the project store without a name is 未命名项目", () => {
  a.ok(!/"Untitled Project"/.test(read("server/server.js")), "server/server.js");
  a.ok(!/"Untitled Project"/.test(read("server/projects.js")), "server/projects.js");
  const { createProjects } = require("../server/projects");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "montclip-names-"));
  try {
    fs.writeFileSync(path.join(dir, "project.json"), JSON.stringify({ revision: 1, width: 1280, height: 720, fps: 30, media: [], clips: [] }));
    const P = createProjects({ dataDir: dir, projectFile: path.join(dir, "project.json"), libraryDir: path.join(dir, "library") });
    P.activeId();
    a.equal(P.list().projects[0].name, "未命名项目");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
