/* MontClip#364: the Windows half of #320's export memory limit (#353 measured it on Linux only, from /proc).

   Windows has no /proc, and Node cannot read another process's memory, so one Windows PowerShell is started next to each
   headless export's browser and stays for as long as that browser runs. Every few seconds it asks Windows (CIM,
   Win32_Process) for the processes with the browser's own image name, walks down from the browser's process id to
   everything under it, and writes one line: the sum of their private bytes (PrivatePageCount: memory only that process
   uses, the Windows counterpart of Linux's RssAnon; file and shared pages are not counted), and how many processes that
   was. The engine keeps the latest line; reading it costs nothing.

   Only the tree the engine started is measured. A process counts as a child only when it was created after its parent,
   so a process left behind by an older program whose id the browser happens to reuse is never taken for one. The watcher
   ends by itself when the browser or the engine is gone, and the engine stops it when the job ends. It starts nothing
   else, kills nothing, and never goes through a shell: fixed arguments only; the script goes in on stdin and the
   browser's id in the environment.

   QQ on #365: a reading that cannot be had must not quietly switch the limit off. A CIM query that fails (WMI busy,
   refused, timed out — likeliest when memory is short, which is when the limit matters) writes "err" and the loop goes
   on; only a query that worked and no longer finds the browser (its id, born at the time first seen, so a reused id is
   not followed) writes "gone" and ends it. health() tells the engine which it is: ok, starting, stale (no reading for
   STALE_MS), exited (the watcher ended while not stopped), gone, unavailable (PowerShell could not be started). The
   engine says so once per job and goes on (export-jobs.js memoryUnknown); an unknown size never stops an export. */
"use strict";
const cp = require("child_process");   // late-bound (cp.spawn at call time): tests stand a browser in for spawn
const path = require("path");

const WATCH_EVERY_MS = 3_000;
/* A reading older than this is not used: the watcher has stalled (a busy machine, CIM slow), and an old number may be
   somebody else's moment. Unknown, so nothing is stopped — and the engine says so (health() "stale"). */
const STALE_MS = 15_000;

const SCRIPT = String.raw`$ErrorActionPreference = 'Stop'
$root = [int]$env:MONTCLIP_WATCH_ROOT; $engine = [int]$env:MONTCLIP_WATCH_ENGINE; $every = [int]$env:MONTCLIP_WATCH_EVERY_MS
$name = $null; $born = $null
while ($true) {
  if (-not (Get-Process -Id $engine -ErrorAction SilentlyContinue)) { exit 0 }
  try {
    if ($null -eq $name) {
      $r = @(Get-CimInstance Win32_Process -Filter "ProcessId=$root" -Property ProcessId,Name,CreationDate)
      if ($r.Count -eq 0) { [Console]::Out.WriteLine('gone'); [Console]::Out.Flush(); exit 0 }
      $born = $r[0].CreationDate
      $name = ([string]$r[0].Name) -replace '\\', '\\' -replace "'", "\'"
    }
    $all = @(Get-CimInstance Win32_Process -Filter "Name='$name'" -Property ProcessId,ParentProcessId,PrivatePageCount,CreationDate)
  } catch { [Console]::Out.WriteLine('err'); [Console]::Out.Flush(); Start-Sleep -Milliseconds $every; continue }
  $top = $all | Where-Object { $_.ProcessId -eq $root -and $_.CreationDate -eq $born } | Select-Object -First 1
  if (-not $top) { [Console]::Out.WriteLine('gone'); [Console]::Out.Flush(); exit 0 }
  $sum = [uint64]0; $n = 0; $todo = New-Object System.Collections.Queue; $todo.Enqueue($top); $seen = @{}
  while ($todo.Count -gt 0 -and $n -lt 2000) {
    $p = $todo.Dequeue()
    if ($seen.ContainsKey([int]$p.ProcessId)) { continue }
    $seen[[int]$p.ProcessId] = $true; $sum += [uint64]$p.PrivatePageCount; $n++
    foreach ($c in $all) { if ($c.ParentProcessId -eq $p.ProcessId -and $c.ProcessId -ne $p.ProcessId -and $c.CreationDate -ge $p.CreationDate) { $todo.Enqueue($c) } }
  }
  [Console]::Out.WriteLine("mem $sum $n"); [Console]::Out.Flush()
  Start-Sleep -Milliseconds $every
}`;
/* (WQL string literals escape with a backslash, so the name's \ and ' get one: QQ on #365, a name with ' made the query
   fail.) The loop stops on purpose only when the engine is gone or a query that worked no longer finds the browser. */

function powershellPath(env = process.env) {
  return path.join(env.SystemRoot || env.windir || "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
}

/** Start watching the memory of process `pid` and everything under it. Returns {read() → bytes | null, procs() → how
 *  many processes the last reading counted, health() → ok | starting | stale | exited | gone | unavailable, errors() →
 *  failed queries so far, stop()}. Windows only; elsewhere read() is always null and health() "unavailable".
 *  opts: {platform, env, every (ms), now(), spawn (tests)} */
function watchTreeMemory(pid, opts = {}) {
  const platform = opts.platform || process.platform, env = opts.env || process.env, now = opts.now || Date.now;
  const started = now();
  let last = null, lastAt = 0, count = 0, child = null, stopped = false, buf = "", errs = 0, gone = false;
  let ended = null;   // "exited" | "gone" | "unavailable"
  const handle = {
    read() { return last != null && now() - lastAt <= STALE_MS ? last : null; },
    procs() { return count; },
    errors() { return errs; },
    health() {
      if (ended) return ended;
      if (last != null && now() - lastAt <= STALE_MS) return "ok";
      return now() - (lastAt || started) > STALE_MS ? "stale" : "starting";
    },
    stop() {
      stopped = true;
      const c = child;
      child = null;
      if (c && c.exitCode === null && c.signalCode === null) { try { c.kill(); } catch {} }
    },
    get pid() { return child ? child.pid : null; },
  };
  if (platform !== "win32" || !Number.isInteger(pid) || pid <= 0) { ended = "unavailable"; return handle; }
  try {
    // the script goes in on stdin (a blank line ends its last block): the command line holds fixed switches only
    child = (opts.spawn || cp.spawn)(powershellPath(env), ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", "-"], {
      stdio: ["pipe", "pipe", "ignore"], windowsHide: true,
      env: { ...env, MONTCLIP_WATCH_ROOT: String(pid), MONTCLIP_WATCH_ENGINE: String(process.pid), MONTCLIP_WATCH_EVERY_MS: String(opts.every || WATCH_EVERY_MS) },
    });
  } catch { child = null; ended = "unavailable"; return handle; }
  const c = child;
  c.on("error", () => { if (!stopped && !ended) ended = "unavailable"; if (child === c) child = null; });
  c.on("exit", () => { if (!stopped && !ended) ended = gone ? "gone" : "exited"; if (child === c) child = null; });
  c.stdout.setEncoding("utf8");
  c.stdout.on("data", (s) => {
    buf += s;
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (stopped) continue;
      const m = /^mem (\d+) (\d+)$/.exec(line);
      if (m && +m[2] > 0) { last = Number(m[1]); count = +m[2]; lastAt = now(); }
      else if (line === "err") errs++;
      else if (line === "gone") gone = true;
    }
    if (buf.length > 4096) buf = "";
  });
  if (c.stdin) { c.stdin.on("error", () => {}); try { c.stdin.end(SCRIPT + "\n\n"); } catch {} }
  return handle;
}

module.exports = { watchTreeMemory, powershellPath, WATCH_EVERY_MS, STALE_MS, SCRIPT };
