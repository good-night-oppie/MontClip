// #281 stage 2 (ReviewInbox on #323): the Windows packager reads files out of a copy of this repository (`src`) and the
// package smoke reads them out of the packaged app (`resources/app`, laid out like the repository root). A path written
// with only string literals must name a file that exists here, or packaging stops with ENOENT on a machine that runs it
// (`path.join(src, 'app', 'app/app.js')` did). Reads the two scripts; builds nothing, so it costs no disk.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");

/** Every `path.join(<base>, 'a', "b", …)` whose other arguments are all string literals: their joined relative path. */
function literalJoins(src, base) {
  const out = [];
  const re = new RegExp("path\\.join\\(\\s*" + base.replace(/[,\s]+/g, "\\s*,\\s*") + "\\s*,\\s*((?:['\"][^'\"]+['\"]\\s*,?\\s*)+)\\)", "g");
  for (const m of src.matchAll(re)) out.push([...m[1].matchAll(/['"]([^'"]+)['"]/g)].map((x) => x[1]).join("/"));
  return out;
}

test("package-win.cjs: every literal path it reads from the repository copy exists in the repository", () => {
  const rels = literalJoins(read("desktop/package-win.cjs"), "src");
  assert.ok(rels.length >= 8, "found the packager's reads (" + rels.length + ")");
  assert.ok(rels.includes("app/app.js"), "it reads the editor page (app/app.js) for the notes' URL line");
  const missing = rels.filter((r) => !fs.existsSync(path.join(ROOT, r)));
  assert.deepEqual(missing, [], "paths the packager would not find");
});

test("package-smoke.cjs: every literal path it reads from the packaged app exists in the repository it was packaged from", () => {
  const rels = literalJoins(read("desktop/package-smoke.cjs"), "appDir, 'resources', 'app'");
  assert.ok(rels.includes("app/app.js"), "it reads the packaged editor page");
  const missing = rels.filter((r) => !fs.existsSync(path.join(ROOT, r)));
  assert.deepEqual(missing, [], "paths the smoke would not find in the package");
});

test("reverse check: a doubled app/ folder is caught", () => {
  const rels = literalJoins("fs.readFileSync(path.join(src, 'app', 'app/app.js'))", "src");
  assert.deepEqual(rels, ["app/app/app.js"]);
  assert.equal(fs.existsSync(path.join(ROOT, rels[0])), false);
});
