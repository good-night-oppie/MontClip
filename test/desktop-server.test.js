"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { fork } = require("node:child_process");
const { once } = require("node:events");
const path = require("node:path");
const crypto = require("node:crypto");
const { makeDataDir, rawGet } = require("./helpers");

async function desktop(t) {
  const token = crypto.randomBytes(32).toString("hex");
  const child = fork(path.join(__dirname, "../server.js"), [], {
    env: { ...process.env, PORT: "0", HOST: "127.0.0.1", FABLECUT_DATA_DIR: makeDataDir(t),
      FABLECUT_NO_FS_WATCH: "1", MONTCLIP_DESKTOP: "1", MONTCLIP_SESSION_TOKEN: token },
    stdio: ["ignore", "ignore", "pipe", "ipc"],
  });
  const stop = async () => {
    if (child.exitCode !== null) return;
    const done = once(child, "exit");
    child.send({ type: "shutdown" });
    await done;
  };
  t.after(stop);
  const ac = new AbortController(), timer = setTimeout(() => ac.abort(), 20000);
  let msg;
  try { [msg] = await once(child, "message", { signal: ac.signal }); }
  finally { clearTimeout(timer); }
  assert.equal(msg.type, "montclip-ready");
  assert.match(msg.origin, /^http:\/\/127\.0\.0\.1:[1-9]\d*$/);
  return { origin: msg.origin, token, port: Number(new URL(msg.origin).port), stop };
}

test("desktop binds an ephemeral port and requires its session and exact origin", async (t) => {
  const s = await desktop(t);
  const headers = { "X-MontClip-Session": s.token, Origin: s.origin };
  assert.equal((await fetch(s.origin + "/api/project", { headers })).status, 200);
  for (const Origin of ["null", s.origin.replace("http:", "https:"), "http://127.0.0.1:1", "http://localhost:" + s.port]) {
    assert.equal((await fetch(s.origin + "/api/project", { headers: { ...headers, Origin } })).status, 403);
  }
  assert.equal((await fetch(s.origin + "/api/project")).status, 403);
  assert.equal((await fetch(s.origin + "/api/project", { headers: { ...headers, "X-MontClip-Session": "wrong" } })).status, 403);
  assert.equal((await rawGet(s.port, "/api/project", { ...headers, Host: "127.0.0.1:1" })).status, 403);
  const response = await fetch(s.origin + "/api/import-url", { method: "POST", headers,
    body: JSON.stringify({ url: "https://example.com/private.mp4" }) });
  assert.equal(response.status, 403);
  assert.equal((await response.json()).code, "NETWORK_DISABLED");
});

test("desktop shutdown leaves another instance alive and tokens cannot cross instances", async (t) => {
  const a = await desktop(t), b = await desktop(t);
  assert.notEqual(a.port, b.port);
  assert.equal((await fetch(b.origin + "/api/project", { headers: { "X-MontClip-Session": a.token } })).status, 403);
  await a.stop();
  assert.equal((await fetch(b.origin + "/api/project", { headers: { "X-MontClip-Session": b.token } })).status, 200);
});
