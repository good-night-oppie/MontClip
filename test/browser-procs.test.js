/* MontClip#243: a headless browser the tests start is put away even when the process we spawned is not the browser
   (an elevated Windows session: the browser restarts itself and the spawned one exits at once), and after a test that
   was killed before its cleanup. QQ's ruling (issuecomment-6759965530): a browser is known only by --user-data-dir being
   exactly the folder this run made; never by name, never by a prefix; a reused process id is left alone.

   The "browser" here is node under the name chrome: it exits at once and leaves a child with the same --user-data-dir,
   which is what Chrome does when it drops its elevation. No real browser, no user data. */
"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("fs"), os = require("os"), path = require("path");
const { spawn } = require("child_process");
const P = require("./browser-procs");

const WIN = process.platform === "win32";
const SUPPORTED = WIN || process.platform === "linux";   // the fake needs a process whose name is "chrome"
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** node, copied under a browser's name (the rule only looks at processes named like Chrome or Edge). */
function fakeExe(dir, name) {
  const exe = path.join(dir, WIN ? name + ".exe" : name);
  fs.copyFileSync(process.execPath, exe);
  if (!WIN) fs.chmodSync(exe, 0o755);
  return exe;
}
const FAKE = `
const { spawn } = require("child_process");
const arg = process.argv.find((a) => a.startsWith("--user-data-dir="));
if (process.argv.includes("--stay")) { setTimeout(() => {}, 120000); }
else {
  // what a browser dropping its elevation does: start itself again, and leave
  spawn(process.execPath, [__filename, arg, "--stay"], { detached: true, stdio: "ignore" }).unref();
  process.exit(0);
}`;

/** End the fakes, wait until they are gone (their exe is locked while they run), then remove the work folder. */
async function cleanup(work, kids = []) {
  for (const k of kids) try { k.kill(); } catch { }
  await Promise.all(kids.map((k) => (k.exitCode !== null || k.signalCode ? null : new Promise((r) => { k.once("exit", r); setTimeout(r, 5000); }))));
  for (let i = 0; i < 20; i++) {
    try { fs.rmSync(work, { recursive: true, force: true }); } catch { }
    if (!fs.existsSync(work)) return;
    await sleep(250);
  }
}

async function waitFor(fn, ms = 15000) {
  for (const until = Date.now() + ms; Date.now() < until;) { const v = await fn(); if (v) return v; await sleep(250); }
  return null;
}

test("--user-data-dir must be the whole path: a longer or shorter one is another browser's", () => {
  const dir = WIN ? "C:\\Temp\\montclip-contrast-abc123" : "/tmp/montclip-contrast-abc123";
  const line = (a) => (WIN ? `"C:\\x\\chrome.exe" --headless=new ${a} about:blank` : ["chrome", "--headless=new", a, "about:blank"]);
  assert.equal(P.hasProfileArg(line(`--user-data-dir=${dir}`), dir), true);
  assert.equal(P.hasProfileArg(line(`--user-data-dir=${dir}x`), dir), false, "one more character");
  assert.equal(P.hasProfileArg(line(`--user-data-dir=${dir.slice(0, -1)}`), dir), false, "one fewer");
  assert.equal(P.hasProfileArg(line(`--user-data-dir=${dir}${path.sep}Default`), dir), false, "a folder inside it");
  assert.equal(P.hasProfileArg(line(`--other=${dir}`), dir), false, "the path under another switch");
  if (WIN) {
    assert.equal(P.hasProfileArg(`chrome.exe --user-data-dir="${dir}" x`, dir), true, "quoted value");
    assert.equal(P.hasProfileArg(`chrome.exe "--user-data-dir=${dir}" x`, dir), true, "quoted argument");
    assert.equal(P.hasProfileArg(`chrome.exe --user-data-dir="${dir} two" x`, dir), false, "a quoted longer path that continues after a space");
    assert.equal(P.hasProfileArg(`chrome.exe "--user-data-dir=${dir} two" x`, dir), false);
    assert.equal(P.hasProfileArg(`chrome.exe --user-data-dir=${dir.toUpperCase()}`, dir), true, "Windows paths compare without case");
  }
});

test("only Chrome and Edge are looked at", () => {
  for (const n of ["chrome.exe", "msedge.exe", "chrome", "msedge", "chromium", "chromium-browser", "chromium-browse", "Google Chrome"]) assert.match(n, P.BROWSER_NAME);
  for (const n of ["node.exe", "node", "firefox.exe", "chromedriver.exe", "notchrome.exe", "chrome.exe.bak", "cmd.exe"]) assert.doesNotMatch(n, P.BROWSER_NAME);
});

test("a process id that now belongs to something else is not ended", async () => {
  const dir = WIN ? "C:\\Temp\\montclip-contrast-reuse1" : "/tmp/montclip-contrast-reuse1";
  const mine = WIN ? `chrome.exe --user-data-dir=${dir}` : ["chrome", `--user-data-dir=${dir}`];
  const other = WIN ? "chrome.exe --user-data-dir=C:\\Users\\someone\\Profile" : ["chrome", "--user-data-dir=/home/someone/profile"];
  let reads = 0; const ended = [];
  // first read: pid 4242 is ours; every later read: 4242 is somebody's own browser
  const list = async () => [{ pid: 4242, name: WIN ? "chrome.exe" : "chrome", commandLine: reads++ === 0 ? mine : other }];
  const r = await P.endBrowsersOf(dir, { list, end: async (pid) => { ended.push(pid); } });
  assert.deepEqual(ended, [], "nothing was ended");
  assert.deepEqual(r.ended, []);
});

test("the spawned process exits at once and leaves the browser behind: the browser is found by its folder and ended, then the folder goes", { skip: !SUPPORTED && "needs a process named chrome" }, async (t) => {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "mc243-"));
  t.after(() => cleanup(work));
  const exe = fakeExe(work, "chrome"), script = path.join(work, "fake.js");
  fs.writeFileSync(script, FAKE);
  const dir = P.makeProfile(work);
  assert.ok(fs.existsSync(P.recordOf(dir)), "the folder has its owner record");
  const child = spawn(exe, [script, `--user-data-dir=${dir}`], { stdio: "ignore" });
  const code = await new Promise((r) => child.on("exit", r));
  assert.equal(code, 0, "the process we started is gone at once");
  const left = await waitFor(async () => { const l = await P.browsersOf(dir); return l.length ? l : null; });
  assert.ok(left && left.length === 1, "one browser is still running with our folder");
  assert.notEqual(left[0].pid, child.pid, "and it is not the process we spawned: child.kill() could not have ended it");
  const r = await P.dropProfile(dir);
  assert.deepEqual(r.left, []);
  assert.equal(r.ended.length, 1);
  assert.equal(r.removed, true);
  assert.deepEqual(await P.browsersOf(dir), [], "no browser of ours is left");
  assert.equal(fs.existsSync(dir), false, "the folder is gone");
  assert.equal(fs.existsSync(P.recordOf(dir)), false, "and its record");
});

test("what must not be ended: a browser whose folder only starts the same, and a process that is not a browser", { skip: !SUPPORTED && "needs a process named chrome" }, async (t) => {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "mc243-"));
  const exe = fakeExe(work, "chrome"), notBrowser = fakeExe(work, "notchrome"), script = path.join(work, "fake.js");
  fs.writeFileSync(script, FAKE);
  const dir = P.makeProfile(work), longer = dir + "x";
  fs.mkdirSync(longer);
  const kids = [
    spawn(exe, [script, `--user-data-dir=${longer}`, "--stay"], { stdio: "ignore" }),       // another folder, one character longer
    spawn(notBrowser, [script, `--user-data-dir=${dir}`, "--stay"], { stdio: "ignore" }),   // our folder, but not a browser
  ];
  t.after(() => cleanup(work, kids));
  // the longer folder is not one of ours, so the helper refuses to be asked about it: look at the process list directly
  const withLonger = async () => (await P.listBrowsers()).filter((p) => P.hasProfileArg(p.commandLine, longer)).length;
  assert.ok(await waitFor(async () => (await withLonger()) === 1), "the other browser is up");
  const r = await P.endBrowsersOf(dir);
  assert.deepEqual(r.ended, [], "nothing of ours to end");
  await sleep(500);
  for (const k of kids) assert.equal(k.exitCode, null, "still running");
  assert.equal(await withLonger(), 1, "the browser with the longer folder was not touched");
});

test("a run that was killed before its cleanup: the next run sweeps its browser and folder; a run that is still going is left alone", { skip: !SUPPORTED && "needs a process named chrome" }, async (t) => {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "mc243-"));
  const exe = fakeExe(work, "chrome"), script = path.join(work, "fake.js");
  fs.writeFileSync(script, FAKE);
  const dead = P.makeProfile(work), living = P.makeProfile(work);
  // `dead` was made by a process that no longer exists; `living` by this one
  const gone = spawn(process.execPath, ["-e", ""], { stdio: "ignore" });
  await new Promise((r) => gone.on("exit", r));
  fs.writeFileSync(P.recordOf(dead), JSON.stringify({ pid: gone.pid, at: new Date().toISOString() }));
  const kids = [dead, living].map((d) => spawn(exe, [script, `--user-data-dir=${d}`, "--stay"], { stdio: "ignore" }));
  t.after(() => cleanup(work, kids));
  assert.ok(await waitFor(async () => (await P.browsersOf(dead)).length === 1 && (await P.browsersOf(living)).length === 1));
  // a record whose content points somewhere else is not followed: the folder comes from the record's own name
  const decoy = path.join(work, "keep-me"); fs.mkdirSync(decoy); fs.writeFileSync(path.join(decoy, "file"), "x");
  fs.writeFileSync(path.join(work, "montclip-contrast-zzzzzz.owner.json"), JSON.stringify({ pid: gone.pid, dir: decoy }));
  const swept = await P.sweepLeftovers({ tmp: work });
  assert.ok(swept.some((s) => s.dir === dead && s.removed && s.ended.length === 1), "the dead run's browser and folder are gone");
  assert.equal(fs.existsSync(dead), false);
  assert.equal(fs.existsSync(living), true, "the living run's folder stays");
  assert.equal((await P.browsersOf(living)).length, 1, "and its browser");
  assert.equal(fs.existsSync(path.join(decoy, "file")), true, "a path written inside a record is never touched");
});

test("a record another process is still writing is not a dead run's: an empty or unreadable record is left alone while it is new (QQ on #276)", async (t) => {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "mc243-"));
  t.after(() => cleanup(work));
  // what a sweeping process could see of another process's makeProfile if the record were written in place
  const fresh = fs.mkdtempSync(path.join(work, "montclip-contrast-"));
  fs.writeFileSync(P.recordOf(fresh), "");
  const garbled = fs.mkdtempSync(path.join(work, "montclip-contrast-"));
  fs.writeFileSync(P.recordOf(garbled), "{not json");
  const old = fs.mkdtempSync(path.join(work, "montclip-contrast-"));
  fs.writeFileSync(P.recordOf(old), "");
  const long = new Date(Date.now() - P.UNREADABLE_IS_STALE_MS - 60000);
  fs.utimesSync(P.recordOf(old), long, long);
  const swept = await P.sweepLeftovers({ tmp: work, list: async () => [] });
  assert.equal(fs.existsSync(fresh), true, "the folder with a new empty record stays");
  assert.equal(fs.existsSync(garbled), true, "so does the one with a new unreadable record");
  assert.equal(fs.existsSync(old), false, "an unreadable record that is old is a dead run's");
  assert.deepEqual(swept.map((s) => s.dir), [old]);
  // and makeProfile never leaves such a moment: no file by the record's name exists before it is whole
  const src = fs.readFileSync(path.join(__dirname, "browser-procs.js"), "utf8");
  assert.ok(src.includes("fs.renameSync(tmpName, recordOf(dir));"), "the record is renamed into place");
  const d = P.makeProfile(work);
  assert.equal(JSON.parse(fs.readFileSync(P.recordOf(d), "utf8")).pid, process.pid);
  assert.deepEqual(fs.readdirSync(work).filter((n) => n.endsWith(".tmp")), [], "no temporary record is left");
});

test("only an absolute path to one of the tests' own folders is ever handled: a typo is refused, not acted on", async () => {
  const bad = ["montclip-contrast-abc123", "C:Users" + "montclip-contrast-abc123", path.join(os.tmpdir(), "something-else"),
    path.join(os.tmpdir(), "montclip-contrast-abc12"), path.join(os.tmpdir(), "montclip-contrast-abc1234"), os.tmpdir(), os.homedir(), ""];
  for (const d of bad) {
    await assert.rejects(() => P.dropProfile(d), /not a test profile folder/, JSON.stringify(d));
    await assert.rejects(() => P.browsersOf(d), /not a test profile folder/, JSON.stringify(d));
  }
  assert.throws(() => P.makeProfile(os.tmpdir(), "anything-"), /not a test profile prefix/);
  const d = P.makeProfile(os.tmpdir(), "montclip-e2e-");
  assert.match(path.basename(d), /^montclip-e2e-[A-Za-z0-9]{6}$/);
  assert.deepEqual(await P.dropProfile(d), { ended: [], left: [], removed: true });
});

test("source: the contrast helper puts its browser away by folder, sweeps earlier leftovers, and never keeps the elevation", () => {
  const e2e = fs.readFileSync(path.join(__dirname, "embed-task-browser.test.js"), "utf8");
  assert.match(e2e, /makeProfile\(os\.tmpdir\(\), "montclip-e2e-"\)/, "the other browser test does the same");
  assert.match(e2e, /await dropProfile\(profile\)/);
  const src = fs.readFileSync(path.join(__dirname, "browser-contrast.js"), "utf8");
  assert.match(src, /makeProfile\(\)/, "the profile folder gets an owner record");
  assert.match(src, /dropProfile\(prof\)/, "cleanup goes by the folder, not by the spawned child alone");
  assert.match(src, /sweepLeftovers\(\)/, "earlier leftovers are swept");
  for (const f of ["browser-contrast.js", "browser-procs.js", "embed-task-browser.test.js"]) {
    const code = fs.readFileSync(path.join(__dirname, f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    assert.doesNotMatch(code, /do-not-de-elevate/, f + " never asks the browser to keep administrator rights");
  }
});
