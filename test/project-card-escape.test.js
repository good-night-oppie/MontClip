/* QQ (review of #65 4a0c45a): the project card put width, height and fps into innerHTML as they were in the project file,
   which an agent, another tool or someone's backup can write. A width of "<b>x</b>" drew that HTML on the dashboard (the
   desktop CSP stops scripts, but not fake interface elements). The summary now carries numbers only, and the page escapes
   what it puts in the card anyway. */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createProjects } = require("../projects");
const { makeDataDir } = require("./helpers");

test("the project summary carries width, height and fps as numbers, or null", (t) => {
  const dir = makeDataDir(t);
  const file = path.join(dir, "project.json");
  const P = createProjects({ dataDir: dir, projectFile: file, libraryDir: path.join(dir, "library") });
  P.activeId();
  const doc = JSON.parse(fs.readFileSync(file, "utf8"));
  Object.assign(doc, { width: "<b>x</b>", height: "<img src=x>", fps: "30<i>" });
  fs.writeFileSync(file, JSON.stringify(doc));
  const [p] = P.list().projects;
  assert.equal(p.width, null); assert.equal(p.height, null); assert.equal(p.fps, null);
  Object.assign(doc, { width: "1920", height: 1080, fps: 29.97 });
  fs.writeFileSync(file, JSON.stringify(doc));
  const [q] = P.list().projects;
  assert.equal(q.width, 1920, "a number in a string is still that number"); assert.equal(q.height, 1080); assert.equal(q.fps, 29.97);
  Object.assign(doc, { width: Infinity, height: -5, fps: 0 });
  fs.writeFileSync(file, JSON.stringify({ ...doc, width: "Infinity", height: -5 }));
  const [r] = P.list().projects;
  assert.equal(r.width, null, "not finite"); assert.equal(r.height, null, "not positive");
});

test("the dashboard escapes width, height and fps wherever it puts them in the page", () => {
  const app = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
  assert.doesNotMatch(app, /\$\{p\.width\}×\$\{p\.height\}/, "no bare ${p.width}×${p.height}");
  assert.doesNotMatch(app, /\$\{pjFps\(p\.fps\)\}/, "no bare ${pjFps(p.fps)}");
  assert.match(app, /function pjCanvas\(p\) \{ return escapeHtml\(/);
});
