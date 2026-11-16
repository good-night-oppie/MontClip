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
   else, kills nothing, and never goes through a shell: fixed arguments, the browser's id passed in the environment.
   Anything that goes wrong (no PowerShell, CIM refused, a line that does not parse) leaves the size unknown, and an
   unknown size never stops an export. */
"use strict";
const cp = require("child_process");   // late-bound (cp.spawn at call time): tests stand a browser in for spawn
const path = require("path");

const WATCH_EVERY_MS = 3_000;
/* A reading older than this is not used: the watcher has stalled (a busy machine, CIM slow), and an old number may be
   somebody else's moment. Unknown, so nothing is stopped. */
const STALE_MS = 15_000;

const SCRIPT = [
  "$ErrorActionPreference = 'SilentlyContinue'",
  "$root = [int]$env:MONTCLIP_WATCH_ROOT; $engine = [int]$env:MONTCLIP_WATCH_ENGINE; $every = [int]$env:MONTCLIP_WATCH_EVERY_MS",
  "$r = Get-CimInstance Win32_Process -Filter \"ProcessId=$root\" -Property ProcessId,Name",
  "if (-not $r) { exit 0 }",
  "$name = ([string]$r.Name) -replace \"'\", \"''\"",
  "while ($true) {",
  "  if (-not (Get-Process -Id $engine -ErrorAction SilentlyContinue)) { exit 0 }",
  "  $all = @(Get-CimInstance Win32_Process -Filter \"Name='$name'\" -Property ProcessId,ParentProcessId,PrivatePageCount,CreationDate)",
  "  $top = $all | Where-Object { $_.ProcessId -eq $root } | Select-Object -First 1",
  "  if (-not $top) { exit 0 }",
  "  $sum = [uint64]0; $n = 0; $todo = New-Object System.Collections.Queue; $todo.Enqueue($top); $seen = @{}",
  "  while ($todo.Count -gt 0 -and $n -lt 2000) {",
  "    $p = $todo.Dequeue()",
  "    if ($seen.ContainsKey([int]$p.ProcessId)) { continue }",
  "    $seen[[int]$p.ProcessId] = $true; $sum += [uint64]$p.PrivatePageCount; $n++",
  "    foreach ($c in $all) { if ($c.ParentProcessId -eq $p.ProcessId -and $c.ProcessId -ne $p.ProcessId -and $c.CreationDate -ge $p.CreationDate) { $todo.Enqueue($c) } }",
  "  }",
  "  [Console]::Out.WriteLine(\"mem $sum $n\"); [Console]::Out.Flush()",
  "  Start-Sleep -Milliseconds $every",
  "}",
].join("\n");
const ENCODED = Buffer.from(SCRIPT, "utf16le").toString("base64");

function powershellPath(env = process.env) {
  return path.join(env.SystemRoot || env.windir || "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
}

/** Start watching the memory of process `pid` and everything under it. Returns {read() → bytes | null, procs() → how
 *  many processes the last reading counted, stop()}. Windows only; elsewhere (or when it cannot start) read() is always
 *  null. opts: {platform, env, every (ms), now() (tests)} */
function watchTreeMemory(pid, opts = {}) {
  const platform = opts.platform || process.platform, env = opts.env || process.env, now = opts.now || Date.now;
  let last = null, lastAt = 0, count = 0, child = null, stopped = false, buf = "";
  const handle = {
    read() { return last != null && now() - lastAt <= STALE_MS ? last : null; },
    procs() { return count; },
    stop() {
      stopped = true;
      const c = child;
      child = null;
      if (c && c.exitCode === null && c.signalCode === null) { try { c.kill(); } catch {} }
    },
    get pid() { return child ? child.pid : null; },
  };
  if (platform !== "win32" || !Number.isInteger(pid) || pid <= 0) return handle;
  try {
    child = cp.spawn(powershellPath(env), ["-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", ENCODED], {
      stdio: ["ignore", "pipe", "ignore"], windowsHide: true,
      env: { ...env, MONTCLIP_WATCH_ROOT: String(pid), MONTCLIP_WATCH_ENGINE: String(process.pid), MONTCLIP_WATCH_EVERY_MS: String(opts.every || WATCH_EVERY_MS) },
    });
  } catch { child = null; return handle; }
  const c = child;
  c.on("error", () => { if (child === c) child = null; });
  c.on("exit", () => { if (child === c) child = null; });
  c.stdout.setEncoding("utf8");
  c.stdout.on("data", (s) => {
    buf += s;
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      const m = /^mem (\d+) (\d+)$/.exec(line);
      if (m && !stopped && +m[2] > 0) { last = Number(m[1]); count = +m[2]; lastAt = now(); }
    }
    if (buf.length > 4096) buf = "";
  });
  return handle;
}

module.exports = { watchTreeMemory, powershellPath, WATCH_EVERY_MS, STALE_MS, SCRIPT };
