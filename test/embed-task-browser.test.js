/* E5b A/B end to end in a real browser (MontClip-Cindy#18, QQ issuecomment-6723202388 item 6): a parent page on another
   site (as Cindy's cindy-ghost:// page frames http://127.0.0.1) frames two task editors of ONE engine on ONE port, each
   with its own one-time ticket. Both frames share one cookie jar; the engine still keeps them apart, because each
   editor's event-stream connection is bound to its task. B's seek moves B and never A. The parent page also answers a
   frame asking for a new ticket (montclip-need-ticket), as the plugin's frame.js will. Synthetic project; headless
   Chrome / Edge, skipped where there is none. Run it at normal privilege on Windows (an elevated Chrome exits at once). */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const { makeDataDir, freePort, seedProject, endTree } = require("./helpers");
const { makeProfile, dropProfile, sweepLeftovers, noteCleanupError } = require("./browser-procs");

const ROOT = path.join(__dirname, "..");
const browser = (() => { try { return require("../server/export-jobs").findBrowser(); } catch { return null; } })();

test("A/B in a real browser: two task editors on one engine and port, B's command never reaches A", { skip: browser ? false : "no Chrome / Edge", timeout: 120000 }, async (t) => {
  const token = crypto.randomBytes(32).toString("hex");
  const port = await freePort(), parentPort = await freePort();
  // stopped before the data folder is removed: hooks run in the order they are added, and the folder's own hook comes
  // next (helpers.js, #233 — a running engine keeps the folder, and a throwing hook would leave everything running)
  const stops = [];
  t.after(async () => { for (const stop of stops.reverse()) try { await stop(); } catch { } });
  const dir = makeDataDir(t, seedProject({ media: [], clips: [{ id: "c_t", kind: "text", mediaId: null, track: "V1", start: 0, duration: 8, props: { text: "synthetic" } }] }));
  const engine = spawn(process.execPath, [path.join(ROOT, "server/server.js")], {
    cwd: ROOT, stdio: "ignore",
    env: { ...process.env, PORT: String(port), HOST: "127.0.0.1", FABLECUT_DATA_DIR: dir, FABLECUT_NO_FS_WATCH: "1",
      MONTCLIP_DESKTOP: "", MONTCLIP_HOST: "cindy", MONTCLIP_EMBED_TOKEN: token },
  });
  const engineGone = new Promise((r) => engine.on("exit", r));
  stops.push(async () => { endTree(engine); await engineGone; });
  const base = `http://127.0.0.1:${port}`, worker = { "X-MontClip-Session": token, "Content-Type": "application/json" };
  const call = (p, body) => fetch(base + p, { method: "POST", headers: worker, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
  for (let i = 0; i < 400; i++) {
    try { if ((await fetch(base + "/api/project", { headers: worker })).status === 200) break; } catch { }
    await new Promise((r) => setTimeout(r, 50));
  }
  const project = (await fetch(base + "/api/projects", { headers: worker }).then((r) => r.json())).active;
  const ticket = async (session) => (await call("/api/embed/ticket", { project, session })).body.ticket;

  // the parent page: another site; it gets tickets from "the worker" (this test) and hands them only to its own frames
  let asked = 0;
  const parent = http.createServer(async (req, res) => {
    const u = new URL(req.url, "http://x");
    if (u.pathname === "/ticket") { asked++; res.end(await ticket(u.searchParams.get("s"))); return; }
    const src = async (s) => `${base}/?host=cindy&theme=dark&token=${token}&ticket=${await ticket(s)}`;
    res.setHeader("Content-Type", "text/html");
    res.end(`<!doctype html><iframe id=a width=900 height=600 src="${await src("task-A")}"></iframe>
      <iframe id=b width=900 height=600 src="${await src("task-B")}"></iframe><script>
      addEventListener("message", async (e) => {
        if (!e.data || e.data.type !== "montclip-need-ticket" || e.origin !== ${JSON.stringify(base)}) return;
        const s = e.source === a.contentWindow ? "task-A" : e.source === b.contentWindow ? "task-B" : null;
        if (!s) return;
        const t = await fetch("/ticket?s=" + s).then((r) => r.text());
        e.source.postMessage({ type: "montclip-host-ticket", ticket: t }, ${JSON.stringify(base)});
      });</script>`);
  });
  await new Promise((r) => parent.listen(parentPort, "127.0.0.1", r));
  stops.push(() => parent.close());

  // the browser is put away by its folder, not by the child we spawned (browser-procs.js, MontClip#243)
  try { await sweepLeftovers(); } catch (err) { noteCleanupError("sweep", err); }
  const profile = makeProfile(os.tmpdir(), "montclip-e2e-");
  const chrome = spawn(browser, ["--headless=new", "--disable-gpu", `--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check",
    "--disable-extensions", "--mute-audio", "--window-size=1900,700", `http://localhost:${parentPort}/`], { stdio: "ignore", windowsHide: true });
  stops.push(async () => { endTree(chrome); await dropProfile(profile); });

  const state = (session) => call("/api/ui/command", { cmd: "state", session, project });
  const deadline = Date.now() + 90_000;
  let a, b;
  do {
    [a, b] = await Promise.all([state("task-A"), state("task-B")]);
    if (a.status === 200 && b.status === 200) break;
    await new Promise((r) => setTimeout(r, 500));
  } while (Date.now() < deadline);
  assert.equal(a.status, 200, "editor A bound to task-A");
  assert.equal(b.status, 200, "editor B bound to task-B");

  const seek = await call("/api/ui/command", { cmd: "seek", t: 2.5, session: "task-B", project });
  assert.equal(seek.status, 200);
  assert.equal(seek.body.time, 2.5, "B moved");
  assert.equal((await state("task-A")).body.time, 0, "A did not");
  assert.equal((await state("task-B")).body.time, 2.5);
  assert.equal((await call("/api/ui/command", { cmd: "state", session: "task-C", project })).status, 409, "no third task");
  assert.equal(asked, 0, "no frame needed a second ticket: each used the one in its first address");
});
