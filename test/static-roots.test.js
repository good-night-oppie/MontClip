// #281 stage 2 (A2.2, AS.1, AS.2): the editor page's own files moved to app/. Every file the page loads (index.html's
// <script src> / <link href>, and the workers app.js starts by name) is served with its bytes, and the local service's
// own code (server/) is never handed to the page, however the path is spelled.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { ROOT, makeDataDir, startServer, rawGet } = require("./helpers");

const NO_WATCH = { FABLECUT_NO_FS_WATCH: "1" };
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");

/** What the editor page asks the static route for: index.html's local src/href and app.js's workers (page-relative). */
function pageFiles() {
  const html = read("index.html"), out = new Set();
  for (const [, f] of html.matchAll(/(?:src|href)="\/?([^"#:?]+)"/g)) if (!/^https?:/.test(f)) out.add(f);
  for (const [, f] of read("app/app.js").matchAll(/(?:addModule|new Worker)\(\s*["']\/?([^"'?]+\.js)(?:\?[^"']*)?["']/g)) out.add(f);
  return [...out];
}

test("the page's files sit where index.html and app.js ask for them (app/ for the page's own code)", () => {
  const files = pageFiles();
  const scripts = [...read("index.html").matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(scripts.length, 54, "index.html loads 54 scripts");
  assert.equal(scripts.filter((s) => s.startsWith("app/")).length, 20, "20 of them are the page's own, in app/");
  for (const w of ["app/ruler-worker.js", "app/fx-worklet.js", "app/meter-worklet.js"]) assert.ok(files.includes(w), w + " is started by name");
  const missing = files.filter((f) => !fs.existsSync(path.join(ROOT, f)));
  assert.deepEqual(missing, [], "every file the page loads exists");
  // nothing the page loads is under server/ (AS.1: the page's prefixes are the root, app/, icons/)
  assert.deepEqual(files.filter((f) => /^server\//.test(f)), []);
});

test("the static route serves every page file with its own bytes, and refuses server/ in any spelling", async (t) => {
  const dir = makeDataDir(t);
  const { port } = await startServer(t, dir, NO_WATCH);
  const host = { Host: `127.0.0.1:${port}` };

  const files = pageFiles();
  for (const f of files) {
    const res = await rawGet(port, "/" + f, host);
    assert.equal(res.status, 200, `/${f} → ${res.status}`);
    if (/\.(js|css)$/.test(f)) assert.equal(res.body, read(f), `/${f} is the file's own content`);
  }
  const index = await rawGet(port, "/", host);
  assert.equal(index.status, 200);
  assert.equal(index.body, read("index.html"));

  // the files that moved are no longer at the root
  for (const f of ["app.js", "agent-pane.js", "ruler-worker.js"]) assert.equal((await rawGet(port, "/" + f, host)).status, 404, "/" + f);

  // AS.2: the local service's code is never a page file
  const refused = ["/server/server.js", "/server/paths.js", "/server/", "/SERVER/server.js", "/Server/mcp-server.js",
    "/app/../server/server.js", "/app/..%2fserver/server.js", "/%73erver/server.js", "/server%2fserver.js"];
  if (process.platform === "win32") refused.push("/server./server.js", "/server%20/server.js", "/server%5cserver.js");
  for (const p of refused) {
    const res = await rawGet(port, p, host);
    assert.notEqual(res.status, 200, `${p} was served`);
    assert.doesNotMatch(res.body, /createServer|APP_DIR/, `${p} leaked server code`);
  }
  assert.equal((await rawGet(port, "/server/server.js", host)).status, 403);
});

test("reverse check: without the server/ refusal the static route would hand out server code", () => {
  const src = read("server/server.js");
  const i = src.indexOf("/* Static app files. ");
  assert.ok(i > 0, "the static section is where it was");
  const section = src.slice(i, src.indexOf("\n}\n", i));
  assert.match(section, /if \(top === "server"\) \{ res\.writeHead\(403\)/, "server/ is refused before serveFile");
  assert.ok(section.indexOf('top === "server"') < section.indexOf("serveFile("), "the refusal comes before the file is served");
});
