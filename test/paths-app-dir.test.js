"use strict";
// #281 stage 1 / A1.2: the server code moved into server/, but the user's data must stay in the repository root.
// APP_DIR used to be __dirname (the folder the file sits in). Read through paths.js and check the data folders land
// where they always did; with the old __dirname form this test would point at server/ and fail.
const { test } = require("node:test"), a = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const ROOT = path.join(__dirname, "..");
const P = require("../server/paths");

test("the data folders stay in the repository root, not in server/", () => {
  const env = process.env.FABLECUT_DATA_DIR;
  a.equal(P.APP_DIR, ROOT, "APP_DIR is the repository root");
  if (!env) a.equal(P.DATA_DIR, ROOT, "without FABLECUT_DATA_DIR the clone keeps its data beside the code");
  for (const d of [P.MEDIA_DIR, P.EXPORTS_DIR, P.LIBRARY_DIR, P.ANALYSIS_DIR]) {
    a.equal(path.dirname(d) === ROOT || d.startsWith(ROOT + path.sep), true, d + " is under the repository root");
    a.equal(d.startsWith(path.join(ROOT, "server") + path.sep), false, d + " is not inside server/");
  }
  a.equal(P.PROJECT_FILE, path.join(P.DATA_DIR, "project.json"));
});

test("the source of paths.js points APP_DIR one level above server/", () => {
  const src = fs.readFileSync(path.join(ROOT, "server", "paths.js"), "utf8");
  a.match(src, /const APP_DIR = path\.resolve\(__dirname, "\.\."\);/);
  a.doesNotMatch(src, /const APP_DIR = __dirname;/);
});
