// #281 stage 3 (A3.2): the scripts both the page and the server load live in shared/. Each one is named by the page
// (app/index.html <script src>) AND reached by a relative require / dep() from the server, the desktop shell or another
// shared/app script — and every such reference points at a file that is there. A reference changed on one side only
// (the page still asks for "captions.js", or a require still says "../captions") fails here; the reverse checks at the
// end prove it by breaking one side in memory.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
const list = (d) => fs.readdirSync(path.join(ROOT, d)).filter((f) => /\.(c?js)$/.test(f)).map((f) => d + "/" + f);

/** The code that loads shared scripts by require/dep: the server, the desktop shell (smokes too), the page's own and the shared ones. */
const NODE_SIDE = () => ["server", "desktop", "app", "shared"].flatMap(list);

/** What the page and the node side name, from file contents (so the reverse checks can feed altered copies). */
function references(files) {
  const page = [...files["app/index.html"].matchAll(/<script src="([^"?#]+)"/g)].map((m) => m[1]);
  const node = [];
  for (const [f, src] of Object.entries(files)) {
    if (!/\.c?js$/.test(f)) continue;
    for (const [, rel] of src.matchAll(/\b(?:require|dep)\(\s*["'](\.{1,2}\/[^"']+)["']/g)) {
      const target = path.posix.normalize(path.posix.join(path.posix.dirname(f), rel));
      node.push({ from: f, rel, target: /\.\w+$/.test(target) ? target : target + ".js" });
    }
  }
  return { page, node };
}

/** Problems with the shared scripts: [] when both sides agree. */
function problems(files, shared, exists) {
  const { page, node } = references(files);
  const out = [];
  const sharedNames = new Set(shared.map((f) => path.posix.basename(f)));
  for (const f of shared) {
    if (!page.includes(f)) out.push(`${f}: the page does not load it`);
    if (!node.some((r) => r.target === f && r.from !== f)) out.push(`${f}: nothing on the node side requires it`);
  }
  for (const s of page) if (!exists(s)) out.push(`page loads ${s}, which is not there`);
  for (const r of node) {
    const base = path.posix.basename(r.target);
    // a reference that still points at the old place (the root) of a shared script
    if (sharedNames.has(base) && !r.target.startsWith("shared/") && !exists(r.target)) out.push(`${r.from}: ${r.rel} points at the root, not shared/`);
    else if (r.target.startsWith("shared/") && !exists(r.target)) out.push(`${r.from}: ${r.rel} is not there`);
  }
  for (const s of page) if (sharedNames.has(s)) out.push(`page loads ${s} from the root, not shared/`);
  return out;
}

const exists = (f) => fs.existsSync(path.join(ROOT, f));
const shared = () => list("shared").filter((f) => f.endsWith(".js"));
const current = () => Object.fromEntries(["app/index.html", ...NODE_SIDE()].map((f) => [f, read(f)]));

test("every script in shared/ is loaded by the page and required by the node side, from shared/", () => {
  const s = shared();
  assert.equal(s.length, 34, "34 shared scripts (#281 stage 3 inventory)");
  assert.deepEqual(problems(current(), s, exists), []);
});

test("nothing the page or the server loads is left at the root under a shared script's name", () => {
  for (const f of shared()) assert.equal(exists(path.posix.basename(f)), false, path.posix.basename(f) + " is not at the root any more");
});

test("reverse check: the page changed on one side only — still asking for captions.js at the root — fails", () => {
  const files = current();
  files["app/index.html"] = files["app/index.html"].replace('<script src="shared/captions.js">', '<script src="captions.js">');
  const p = problems(files, shared(), exists);
  assert.ok(p.some((x) => /shared\/captions\.js: the page does not load it/.test(x)), p.join("\n"));
  assert.ok(p.some((x) => /page loads captions\.js/.test(x)), p.join("\n"));
});

test("reverse check: a require changed on one side only — the server still saying ../captions — fails", () => {
  const files = current();
  const re = /(\b(?:require|dep)\(\s*["'])\.\.\/shared\/captions(\.js)?(["'])/;
  const f = Object.keys(files).find((k) => k.startsWith("server/") && re.test(files[k]));
  assert.ok(f, "a server file requires ../shared/captions");
  files[f] = files[f].replace(new RegExp(re.source, "g"), "$1../captions$2$3");
  const p = problems(files, shared(), exists);
  assert.ok(p.some((x) => x.startsWith(`${f}: ../captions`) && x.endsWith("points at the root, not shared/")), p.join("\n"));
});

test("reverse check: a shared script the server stops requiring altogether is caught", () => {
  const files = current(), s = shared();
  // drop every node-side reference to ui-terms.js
  for (const k of Object.keys(files)) if (k !== "app/index.html") files[k] = files[k].replace(/\b(require|dep)\(\s*["'](\.{1,2}\/)+(shared\/)?ui-terms(\.js)?["']/g, '$1("./gone")');
  const p = problems(files, s, exists);
  assert.ok(p.includes("shared/ui-terms.js: nothing on the node side requires it"), p.join("\n"));
});
