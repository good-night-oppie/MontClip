"use strict";
/* #315: launch() in test/helpers.js is what several end-to-end files start their server with. These two tests use a
   stand-in server.js so they need no ffmpeg and no real server, and they live in their own file so node --test runs
   them beside the other files instead of adding their 12 s to one that is already near its time limit. */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { makeDataDir, launch } = require("./helpers");

test("a server that listens late still counts as started", { timeout: 60_000 }, async (t) => {
  const dir = makeDataDir(t);
  const standIn = path.join(dir, "slow-stand-in.js");
  fs.writeFileSync(standIn, `
    setTimeout(() => {
      require("http").createServer((q, s) => { s.writeHead(200, { "Content-Type": "application/json" }); s.end("{}"); })
        .listen(process.env.PORT, "127.0.0.1");
    }, 12000);`);
  const started = Date.now();
  const base = await launch(t, dir, crypto.randomBytes(32).toString("hex"), {}, { serverJs: standIn });
  const took = Date.now() - started;
  assert.match(base, /^http:\/\/127\.0\.0\.1:\d+$/);
  assert.ok(took >= 12000, "it waited for the stand-in: " + took + " ms");
});

test("a server that exits while starting fails at once, with its output", { timeout: 60_000 }, async (t) => {
  const dir = makeDataDir(t);
  const standIn = path.join(dir, "dead-stand-in.js");
  fs.writeFileSync(standIn, 'console.error("boom: cannot start"); process.exit(3);');
  const started = Date.now();
  await assert.rejects(launch(t, dir, crypto.randomBytes(32).toString("hex"), {}, { serverJs: standIn }), (e) => {
    assert.match(e.message, /exit code 3/, e.message);
    assert.match(e.message, /boom: cannot start/, e.message);
    return true;
  });
  assert.ok(Date.now() - started < 5000, "fails at once, not after the deadline: " + (Date.now() - started) + " ms");
});
