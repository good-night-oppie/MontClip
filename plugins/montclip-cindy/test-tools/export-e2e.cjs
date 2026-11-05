// node plugins/montclip-cindy/test-tools/export-e2e.cjs <repo root> <folder with the pinned ffmpeg.exe + ffprobe.exe>   (after build.cjs; Windows, Chrome or Edge)
// Headless export through the plugin worker, then delivery into a picked folder. A synthetic project (two titles on a
// colour background), the pinned LGPL ffmpeg copied into a temp data dir; the worker's environment trimmed the way
// Cindy 0.1.122 trims it (no PROGRAMFILES), so headless export works only if the worker puts it back.
const { spawn } = require("child_process"), fs = require("fs"), os = require("os"), path = require("path");
const [ROOT, FFDIR] = process.argv.slice(2);
const data = fs.mkdtempSync(path.join(os.tmpdir(), "mc-export-")), dest = fs.mkdtempSync(path.join(os.tmpdir(), "mc-dest-"));
fs.mkdirSync(path.join(data, "ffmpeg", "win32-x64"), { recursive: true });
for (const f of ["ffmpeg.exe", "ffprobe.exe"]) fs.copyFileSync(path.join(FFDIR, f), path.join(data, "ffmpeg", "win32-x64", f));
const t = (id, s, d, x) => ({ id, kind: "text", mediaId: null, track: "V2", start: s, in: 0, duration: d, props: { text: x } });
fs.writeFileSync(path.join(data, "project.json"), JSON.stringify({ name: "Export e2e", width: 640, height: 360, fps: 30, revision: 1, background: "#204060", media: [], clips: [t("a", 0, 1, "合成一"), t("b", 1, 1, "合成二")] }));
const keep = ["SystemRoot", "SystemDrive", "USERPROFILE", "PATH", "Path", "TEMP", "TMP", "COMPUTERNAME", "USERNAME", "windir", "OS", "NUMBER_OF_PROCESSORS", "PROCESSOR_ARCHITECTURE", "HOMEDRIVE", "HOMEPATH", "APPDATA", "ComSpec"];
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => keep.includes(k)));
Object.assign(env, { MONTCLIP_CINDY_APP: path.join(ROOT, "plugins/montclip-cindy/node/app"), MONTCLIP_CINDY_DATA: data, MONTCLIP_CINDY_PORT: "0", FABLECUT_NO_FS_WATCH: "1" });
const w = spawn(process.execPath, [path.join(ROOT, "plugins/montclip-cindy/node/worker.cjs")], { env, stdio: ["pipe", "pipe", "ignore"] });
let id = 0; const pend = new Map(); let buf = "";
w.stdout.on("data", (c) => { buf += c; let i; while ((i = buf.indexOf("\n")) >= 0) { const m = JSON.parse(buf.slice(0, i)); buf = buf.slice(i + 1); pend.get(m.id)?.(m); } });
const rpc = (method, params = {}) => new Promise((r) => { const n = ++id; pend.set(n, r); w.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: n, method, params }) + "\n"); });
(async () => {
  const out = { envCount: Object.keys(env).length };
  const s = (await rpc("montclip/start")).result; out.start = { envFilled: s.envFilled, browser: s.browser, ffmpeg: s.ffmpeg };
  const t0 = Date.now();
  let job = (await rpc("montclip/export-start", { preset: "web", where: "headless" }));
  if (job.error) { out.error = job.error; } else {
    job = job.result;
    while (job.status === "pending" || job.status === "running") { await new Promise((r) => setTimeout(r, 1500)); job = (await rpc("montclip/export-job", { id: job.id })).result; }
    out.job = { status: job.status, via: job.via, error: job.error || null, secs: Math.round((Date.now() - t0) / 1000), report: (job.result?.outputs || []).map((o) => o.report?.line) };
    if (job.status === "done") out.delivered = (await rpc("montclip/export-deliver", { id: job.id, dir: dest })).result;
    out.destFiles = fs.readdirSync(dest);
  }
  console.log(JSON.stringify(out));
  w.kill();
  setTimeout(() => { try { fs.rmSync(data, { recursive: true, force: true }); fs.rmSync(dest, { recursive: true, force: true }); } catch {} process.exit(0); }, 1500);
})();
