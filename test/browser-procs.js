/* The headless browsers the tests start, and how they are put away (MontClip#243, QQ's ruling issuecomment-6759965530).

   A browser started from an elevated session on Windows restarts itself without the elevation and the process we
   spawned exits at once, so `child.kill()` ends nothing and the real browser stays behind with its profile folder.
   The same happens to any browser whose test process is killed before its `finally` runs.

   So a browser is not known by the child we spawned, and never by its name or by a folder-name prefix. It is known by
   one thing only: its command line carries `--user-data-dir=` followed by the FULL path of the folder this process
   made with mkdtemp — the whole path, equal, nothing shorter or longer. Only processes named like Chrome or Edge are
   looked at. Before a process is ended its command line is read once more (a process id can be reused). The folder is
   removed only after no such process is left; a folder that will not go is left and reported, never retried forever.

   Each folder has an owner record next to it (<folder>.owner.json: the pid that made it). When a later run starts, the
   records whose owner is gone are swept by the same rule — that is what cleans up after a test that was killed. The
   folder a record stands for is taken from the record's own file name, never from what is written inside it.

   Never used: --do-not-de-elevate (a browser parsing pages with administrator rights), ending by process name. */
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFile } = require("child_process");

/** The folder names the tests make (mkdtemp adds six characters). Nothing else is ever handled here. */
const PREFIXES = ["montclip-contrast-", "montclip-e2e-"];
const PREFIX = PREFIXES[0];
const OURS = new RegExp("^(" + PREFIXES.join("|") + ")[A-Za-z0-9]{6}$");
/** Only an absolute path to a folder shaped like one of ours: a typo must never turn into "end and remove something else". */
function mustBeOurs(dir) {
  if (typeof dir !== "string" || !path.isAbsolute(dir) || !OURS.test(path.basename(dir))) throw new Error("not a test profile folder: " + dir);
  return dir;
}
const WIN = process.platform === "win32";
/** Chrome and Edge only (and what the same browsers are called on Linux and macOS; Linux keeps 15 characters of a
 *  process name, so chromium-browser is read as chromium-browse). The name only decides which processes are looked
 *  at; what makes one ours is still the whole folder path. */
const BROWSER_NAME = /^(chrome|msedge)\.exe$|^(chrome|chromium|chromium-browser|chromium-browse|msedge|microsoft-edge|Google Chrome|Microsoft Edge)$/i;

const run = (file, args, opts = {}) => new Promise((resolve) => {
  execFile(file, args, { windowsHide: true, maxBuffer: 64 * 1024 * 1024, timeout: 30000, ...opts }, (error, stdout) => resolve({ error, stdout: String(stdout || "") }));
});

/** Does this command line (a string on Windows, an argv array elsewhere) carry --user-data-dir=<exactly dir>? */
function hasProfileArg(commandLine, dir) {
  const want = WIN ? dir.toLowerCase() : dir;
  if (Array.isArray(commandLine)) return commandLine.some((a) => a.startsWith("--user-data-dir=") && a.slice(16) === dir);
  const line = WIN ? String(commandLine).toLowerCase() : String(commandLine);
  const key = "--user-data-dir=";
  for (let at = line.indexOf(key); at !== -1; at = line.indexOf(key, at + 1)) {
    let start = at + key.length;
    // quoted either as --user-data-dir="…" or as "--user-data-dir=…": then the path must end at the closing quote
    let quoted = line[at - 1] === '"';
    if (line[start] === '"') { quoted = true; start++; }
    if (!line.startsWith(want, start)) continue;
    const next = line[start + want.length];
    if (quoted ? next === '"' : (next === undefined || next === " " || next === "\t")) return true;
  }
  return false;
}

/** Every Chrome / Edge process: [{pid, name, commandLine}]. commandLine is a string on Windows, argv elsewhere. */
async function listBrowsers() {
  if (WIN) {
    // fixed command text; nothing from the caller is put into it
    const ps = "Get-CimInstance Win32_Process -Filter \"Name='chrome.exe' OR Name='msedge.exe'\" | " +
      "ForEach-Object { [pscustomobject]@{ p = [int]$_.ProcessId; n = $_.Name; c = [string]$_.CommandLine } } | ConvertTo-Json -Compress";
    const { error, stdout } = await run("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", ps]);
    if (error) throw new Error("could not list browser processes: " + error.message);
    const text = stdout.trim();
    if (!text) return [];
    const rows = JSON.parse(text);
    return (Array.isArray(rows) ? rows : [rows]).map((r) => ({ pid: r.p, name: r.n, commandLine: r.c || "" }));
  }
  if (process.platform === "linux") {
    const out = [];
    for (const d of fs.readdirSync("/proc")) {
      if (!/^\d+$/.test(d)) continue;
      try {
        const argv = fs.readFileSync(`/proc/${d}/cmdline`, "utf8").split("\0").filter(Boolean);
        const name = fs.readFileSync(`/proc/${d}/comm`, "utf8").trim();
        if (argv.length) out.push({ pid: Number(d), name, commandLine: argv });
      } catch { /* gone meanwhile, or not ours to read */ }
    }
    return out.filter((p) => BROWSER_NAME.test(p.name));
  }
  // macOS: ps does not keep argument boundaries; the line is matched like a Windows command line
  const { error, stdout } = await run("ps", ["-axo", "pid=,comm="]);
  if (error) throw new Error("could not list browser processes: " + error.message);
  const names = new Map(stdout.split("\n").map((l) => l.match(/^\s*(\d+)\s+(.*)$/)).filter(Boolean).map((m) => [Number(m[1]), path.basename(m[2].trim())]));
  const args = await run("ps", ["-axo", "pid=,args="]);
  return args.stdout.split("\n").map((l) => l.match(/^\s*(\d+)\s+(.*)$/)).filter(Boolean)
    .map((m) => ({ pid: Number(m[1]), name: names.get(Number(m[1])) || "", commandLine: m[2] }));
}

/** The browser processes whose --user-data-dir is exactly `dir`. `list`: for tests. → [{pid, name}] */
async function browsersOf(dir, { list = listBrowsers } = {}) {
  mustBeOurs(dir);
  return (await list()).filter((p) => BROWSER_NAME.test(p.name) && hasProfileArg(p.commandLine, dir)).map((p) => ({ pid: p.pid, name: p.name }));
}

async function endProcess(pid) {
  if (WIN) { await run("taskkill.exe", ["/PID", String(pid), "/T", "/F"]); return; }
  try { process.kill(pid, "SIGKILL"); } catch { /* already gone */ }
}

/** End every browser of `dir`. Each recorded process id is checked once more right before it is ended, so a process
 *  id that now belongs to something else is left alone. → {ended: [pid], left: [pid]} */
async function endBrowsersOf(dir, { list = listBrowsers, end = endProcess, rounds = 3 } = {}) {
  const ended = [];
  for (let round = 0; round < rounds; round++) {
    const found = await browsersOf(dir, { list });
    if (!found.length) return { ended, left: [] };
    for (const p of found) {
      const still = (await browsersOf(dir, { list })).some((q) => q.pid === p.pid);
      if (!still) continue;
      await end(p.pid);
      ended.push(p.pid);
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  return { ended, left: (await browsersOf(dir, { list })).map((p) => p.pid) };
}

const recordOf = (dir) => dir + ".owner.json";
/** How old an unreadable owner record must be before its folder is swept. */
const UNREADABLE_IS_STALE_MS = 10 * 60 * 1000;

/** A new profile folder of this process, with its owner record. */
function makeProfile(tmp = os.tmpdir(), prefix = PREFIX) {
  if (!PREFIXES.includes(prefix)) throw new Error("not a test profile prefix: " + prefix);
  const dir = fs.mkdtempSync(path.join(tmp, prefix));
  // written under another name and renamed: another test process sweeping at this moment sees no record or a whole
  // one, never an empty file it could take for a dead run's (QQ on #276)
  const tmpName = recordOf(dir) + "." + process.pid + ".tmp";
  fs.writeFileSync(tmpName, JSON.stringify({ pid: process.pid, at: new Date().toISOString() }));
  fs.renameSync(tmpName, recordOf(dir));
  return dir;
}

/** Put a profile away: end its browsers, and only when none is left remove the folder and its record.
 *  → {ended, left, removed}. A folder that will not go stays, with its record, for a later sweep. */
async function dropProfile(dir, opts = {}) {
  mustBeOurs(dir);
  const { ended, left } = await endBrowsersOf(dir, opts);
  let removed = false;
  if (!left.length) {
    for (let i = 0; i < 5 && !removed; i++) {
      try { fs.rmSync(dir, { recursive: true, force: true }); removed = !fs.existsSync(dir); } catch { /* a file is still held */ }
      if (!removed) await new Promise((r) => setTimeout(r, 300));
    }
    if (removed) try { fs.rmSync(recordOf(dir), { force: true }); } catch { /* the sweep takes it */ }
  }
  return { ended, left, removed };
}

const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === "EPERM"; } };

/** Clean up after earlier runs that never reached their own cleanup: every owner record in `tmp` whose owner process
 *  is gone. The folder is the record's own name without ".owner.json" — in `tmp`, mkdtemp-shaped — never a path read
 *  from inside the record. → [{dir, ended, left, removed}] */
async function sweepLeftovers({ tmp = os.tmpdir(), ...opts } = {}) {
  const done = [];
  let names = [];
  try { names = fs.readdirSync(tmp); } catch { return done; }
  for (const name of names) {
    const m = name.endsWith(".owner.json") && OURS.test(name.slice(0, -11)) ? [name, name.slice(0, -11)] : null;
    if (!m) continue;
    let owner = null, readable = true;
    try { owner = JSON.parse(fs.readFileSync(path.join(tmp, name), "utf8")).pid; } catch { readable = false; }
    if (Number.isInteger(owner) && owner > 0 && alive(owner)) continue;   // a run that is still going, or a reused pid: left alone
    // a record that cannot be read says nothing about its owner: only an old one is taken for a dead run's
    if (!readable) { let age = 0; try { age = Date.now() - fs.statSync(path.join(tmp, name)).mtimeMs; } catch { continue; } if (age < UNREADABLE_IS_STALE_MS) continue; }
    const dir = path.join(tmp, m[1]);
    const r = await dropProfile(dir, opts);
    if (r.removed) try { fs.rmSync(path.join(tmp, name), { force: true }); } catch { }
    done.push({ dir, ...r });
  }
  return done;
}

/** Cleaning up never fails a test, but a cleanup that went wrong must not be silent either. */
function noteCleanupError(where, e) {
  try { process.stderr.write(`[browser-procs] ${where}: ${e && e.message ? e.message : e}
`); } catch { }
}

module.exports = { PREFIX, PREFIXES, BROWSER_NAME, UNREADABLE_IS_STALE_MS, noteCleanupError, hasProfileArg, listBrowsers, browsersOf, endBrowsersOf, makeProfile, dropProfile, sweepLeftovers, recordOf };
