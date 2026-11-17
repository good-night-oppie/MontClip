/* #375 (#370 fact list row 6; PG 6937788935). (1) "Import from a URL" is refused wherever the desktop app is the engine —
   the server's /api/import-url and MCP's fablecut_import_media answer NETWORK_DISABLED by the same judgment
   (server/url-import-policy.js). (2) Embedded in Cindy, the assistant's URL import asks the streamer first on her editor
   window, 「下载」 / 「不要」: no answer, 「不要」 or no editor → nothing is downloaded, and a 「不要」 is never asked again.
   "Nothing is downloaded" is counted, not assumed: the URL points at a stand-in on 127.0.0.1 that counts every TCP
   connection made to it (it answers none, so a download that does start fails — its connection is what we count).
   Synthetic data only; no browser, nothing leaves this computer. */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const net = require("node:net");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const http = require("node:http");
const Policy = require("../server/url-import-policy");
const { createExportJobs } = require("../server/export-jobs");
const { makeDataDir, freePort, endTree, startMcp } = require("./helpers");

const ROOT = path.join(__dirname, "..");
const hex = () => crypto.randomBytes(32).toString("hex");

/** A stand-in "website" on 127.0.0.1 that counts connections and closes each one. */
async function standIn(t) {
  let hits = 0;
  const srv = net.createServer((s) => { hits++; s.destroy(); });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  t.after(() => srv.close());
  return { url: (name = "clip.mp4") => `https://127.0.0.1:${srv.address().port}/${name}`, hits: () => hits };
}
const lock = (dir, shell) => fs.writeFileSync(path.join(dir, ".montclip-writer.lock"), JSON.stringify({ pid: process.pid, shell, port: null, started: new Date().toISOString() }));

/* ── the one judgment ── */
test("#375: the desktop app is the engine when this process is it, or when a live desktop engine holds the data folder", (t) => {
  const dir = makeDataDir(t);
  assert.deepEqual(Policy.urlImportRefusal({ env: { MONTCLIP_DESKTOP: "1" } }), { status: 403, code: "NETWORK_DISABLED", error: "Offline mode: import a local file." });
  assert.equal(Policy.urlImportRefusal({ env: {}, dataDir: dir }), null, "no lock: a plain server");
  lock(dir, "server");
  assert.equal(Policy.urlImportRefusal({ env: {}, dataDir: dir }), null, "held by a plain server");
  lock(dir, "desktop");
  assert.equal(Policy.urlImportRefusal({ env: {}, dataDir: dir }).code, "NETWORK_DISABLED", "held by the desktop app");
  fs.writeFileSync(path.join(dir, ".montclip-writer.lock"), JSON.stringify({ pid: 2 ** 30, shell: "desktop" }));
  assert.equal(Policy.urlImportRefusal({ env: {}, dataDir: dir }), null, "a lock left by a process that is gone does not count");
  assert.equal(Policy.importHost("https://cdn.example.org/a.mp4?x=1"), "cdn.example.org");
  for (const bad of ["http://example.org/a.mp4", "file:///C:/a.mp4", "not a url", ""]) assert.equal(Policy.importHost(bad), null, bad);
  assert.equal(Policy.confirmNeeded({ MONTCLIP_HOST: "cindy" }), true);
  assert.equal(Policy.confirmNeeded({}), false);
  const server = fs.readFileSync(path.join(ROOT, "server/server.js"), "utf8");
  const route = server.slice(server.indexOf('if (p === "/api/import-url" && req.method === "POST")'));
  assert.ok(/UrlImportPolicy\.urlImportRefusal\(/.test(route.slice(0, 400)), "the server route asks the same function first");
});

test("#375 (1): MCP fablecut_import_media on the desktop app's data folder → NETWORK_DISABLED, and no connection is made", async (t) => {
  const site = await standIn(t);
  const dir = makeDataDir(t);
  lock(dir, "desktop");
  const mcp = startMcp(t, dir, { FABLECUT_TEST_IMPORT_ALLOW_PRIVATE: "1" });
  await mcp.request("initialize", { protocolVersion: "2025-11-25" });
  const r = await mcp.callTool("fablecut_import_media", { path: site.url() });
  assert.equal(r.isError, true);
  assert.match(r.text, /^(Error: )?NETWORK_DISABLED: /);
  assert.equal(site.hits(), 0, "nothing reached the site");
  // the same call on a plain server's folder does reach it (the stand-in closes it, so the import fails after connecting)
  lock(dir, "server");
  const r2 = await mcp.callTool("fablecut_import_media", { path: site.url() });
  assert.equal(r2.isError, true);
  assert.doesNotMatch(r2.text, /NETWORK_DISABLED/);
  assert.ok(site.hits() >= 1, "the control reached the site: " + site.hits());
});

/* ── embedded in Cindy: the streamer says yes first ── */
async function engine(t) {
  let stop = () => { };
  t.after(() => stop());
  const token = hex(), port = await freePort(), dir = makeDataDir(t);
  const child = spawn(process.execPath, [path.join(ROOT, "server/server.js")], {
    cwd: ROOT, stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, PORT: String(port), HOST: "127.0.0.1", FABLECUT_DATA_DIR: dir, FABLECUT_NO_FS_WATCH: "1",
      FABLECUT_CHROME: path.join(dir, "no-such-browser"), MONTCLIP_DESKTOP: "", MONTCLIP_HOST: "cindy", MONTCLIP_EMBED_TOKEN: token,
      FABLECUT_TEST_IMPORT_ALLOW_PRIVATE: "1" },
  });
  child.stdout.resume(); child.stderr.resume();
  const exited = new Promise((r) => child.on("exit", r));
  stop = async () => { endTree(child); await exited; };
  const base = `http://127.0.0.1:${port}`, worker = { "X-MontClip-Session": token };
  for (let i = 0; i < 400; i++) {
    try { if ((await fetch(base + "/api/project", { headers: worker })).status === 200) break; } catch { }
    await new Promise((r) => setTimeout(r, 50));
  }
  const boot = await fetch(base + "/?token=" + token, { redirect: "manual" });
  const page = { Cookie: boot.headers.get("set-cookie").split(";")[0] };
  return { base, worker, page, token, port, dir };
}
/** The editor page: its event stream with the page's cookie; answer(ticket) → the card's answer (or null: never answers). */
function editorPage(t, e, answer) {
  const seen = [];
  let buf = "";
  const req = http.get(e.base + "/api/events", { headers: e.page }, (res) => {
    res.setEncoding("utf8");
    res.on("data", async (chunk) => {
      buf += chunk;
      let i;
      while ((i = buf.indexOf("\n\n")) >= 0) {
        const block = buf.slice(0, i); buf = buf.slice(i + 2);
        if (/^event: (.*)$/m.exec(block)?.[1] !== "export") continue;
        const ticket = JSON.parse(/^data: (.*)$/m.exec(block)[1]);
        seen.push(ticket);
        const a = answer(ticket);
        if (a == null) continue;
        const post = (p, b) => fetch(e.base + p, { method: "POST", headers: e.page, body: JSON.stringify(b) });
        await post("/api/export/job/claim?id=" + ticket.id, { tabId: "tab-1", hidden: false });
        await post("/api/export/job/report?id=" + ticket.id, { status: "done", result: { allowed: a === "download" }, tabId: "tab-1" });
      }
    });
  });
  req.on("error", () => { });
  t.after(() => req.destroy());
  return { seen, ready: async () => { for (let i = 0; i < 100 && !req.socket; i++) await new Promise((r) => setTimeout(r, 20)); await new Promise((r) => setTimeout(r, 200)); } };
}

test("#375 (2): embedded in Cindy — no editor, 「不要」 → nothing downloaded; a 「不要」 is not asked again; 「下载」 goes and is remembered", async (t) => {
  const site = await standIn(t);
  const e = await engine(t);
  const mcp = startMcp(t, e.dir, { FABLECUT_PORT: String(e.port), MONTCLIP_HOST: "cindy", MONTCLIP_EMBED_TOKEN: e.token, FABLECUT_TEST_IMPORT_ALLOW_PRIVATE: "1" });
  await mcp.request("initialize", { protocolVersion: "2025-11-25" });

  // no editor window: the question cannot be shown, nothing goes
  const none = await mcp.callTool("fablecut_import_media", { path: site.url("a.mp4") });
  assert.equal(none.isError, true); assert.match(none.text, /EDITOR_NOT_READY/); assert.match(none.text, /nothing was downloaded/);
  assert.equal(site.hits(), 0);

  // the streamer says 「不要」
  const page = editorPage(t, e, (tk) => (tk.importUrl.url.endsWith("/b.mp4") ? "no" : "download"));
  await page.ready();
  const no = await mcp.callTool("fablecut_import_media", { path: site.url("b.mp4") });
  assert.equal(no.isError, true); assert.match(no.text, /^(Error: )?IMPORT_URL_DECLINED: /); assert.match(no.text, /127\.0\.0\.1/);
  assert.equal(site.hits(), 0, "「不要」: nothing reached the site");
  assert.equal(page.seen.length, 1);
  assert.deepEqual([page.seen[0].kind, page.seen[0].importUrl.host], ["importurl", "127.0.0.1"], "the card shows the site's name");
  const again = await mcp.callTool("fablecut_import_media", { path: site.url("b.mp4") });
  assert.match(again.text, /^(Error: )?IMPORT_URL_DECLINED: /);
  assert.equal(page.seen.length, 1, "a 「不要」 is not asked again (no retry)");
  assert.equal(site.hits(), 0);

  // 「下载」: the download starts (the stand-in closes it, so it fails after connecting); the yes holds for that URL
  const yes = await mcp.callTool("fablecut_import_media", { path: site.url("c.mp4") });
  assert.doesNotMatch(yes.text, /IMPORT_URL_DECLINED|NETWORK_DISABLED/);
  assert.ok(site.hits() >= 1, "after 「下载」 the site was reached: " + site.hits());
  assert.equal(page.seen.length, 2);
  await mcp.callTool("fablecut_import_media", { path: site.url("c.mp4") });
  assert.equal(page.seen.length, 2, "the same URL is not asked twice once she said yes");
  // a URL the streamer pastes herself (「+ URL」, the page's own request): no card, it goes as before
  const before = site.hits();
  const own = await fetch(e.base + "/api/import-url", { method: "POST", headers: e.page, body: JSON.stringify({ url: site.url("own.mp4") }) });
  assert.notEqual(own.status, 403);
  assert.equal(page.seen.length, 2, "no card for her own URL");
  assert.ok(site.hits() > before, "her own URL was fetched");
});

test("#375 (2): only the plugin worker can put the question up; a page cannot, and a plain server has no such route", async (t) => {
  const e = await engine(t);
  const ask = (headers) => fetch(e.base + "/api/import-url/confirm", { method: "POST", headers, body: JSON.stringify({ url: "https://example.org/a.mp4" }) }).then((r) => r.status);
  assert.equal(await ask(e.page), 403, "the page's cookie");
  assert.equal(await ask({}), 403, "no token");
  assert.equal(await ask(e.worker), 409, "the worker: no editor open → EDITOR_NOT_READY");
  const bad = await fetch(e.base + "/api/import-url/confirm", { method: "POST", headers: e.worker, body: JSON.stringify({ url: "http://example.org/a.mp4" }) });
  assert.equal(bad.status, 400, "not https");
  // the queue: a download question is tab-only and needs {url, host}
  const jobs = createExportJobs({ editors: () => 1, broadcast() {} });
  t.after(() => jobs.shutdown());
  assert.throws(() => jobs.request({ kind: "importurl", where: "headless", importUrl: { url: "https://a.b/c", host: "a.b" } }), /EDITOR|editor window/);
  assert.throws(() => jobs.request({ kind: "importurl", where: "tab" }), /needs \{url, host\}/);
  const j = jobs.request({ kind: "importurl", where: "tab", session: "task-A", importUrl: { url: "https://a.b/c", host: "a.b" } });
  assert.deepEqual(jobs.ticket(j.id).importUrl, { url: "https://a.b/c", host: "a.b" });
  assert.equal(jobs.ticket(j.id).session, "task-A");
});

test("#375 (2): the card — 「不要」 has the focus, Esc / closing is 「不要」, built with textContent only; the words are placeholders for JJ", () => {
  const app = fs.readFileSync(path.join(ROOT, "app/app.js"), "utf8");
  const card = app.slice(app.indexOf("function importUrlCard(host)"), app.indexOf("async function runImportUrlJob"));
  assert.ok(card.length > 100);
  assert.ok(/let answer = "no";/.test(card) && /no\.focus\(\)/.test(card), "default 「不要」, focus on it");
  assert.ok(!/innerHTML/.test(card), "no markup");
  assert.ok(/textContent = uiText\("own\.iu-ask", \{ host \}\)/.test(card));
  const run = app.slice(app.indexOf("async function runImportUrlJob"), app.indexOf("async function runTrackJob"));
  assert.ok(/allowed: answer === "download"/.test(run));
  const src = fs.readFileSync(path.join(ROOT, "ui-preferences.js"), "utf8");
  assert.ok(src.includes('"iu-ask": ["The assistant wants to download a video from {host} to your computer. Download it?", "助手想从 {host} 下载一个录像到你的电脑，要下载吗？"]'));
  assert.ok(src.includes('"iu-yes": ["Download", "下载"]') && src.includes('"iu-no": ["Don\'t", "不要"]'));
});
