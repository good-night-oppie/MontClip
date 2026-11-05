/* Explicit manual acceptance: synthetic flash/beep -> real repair handler -> Chrome preview -> fastExport.
 * Run node scripts/gap-chrome-acceptance.cjs. Only its own recorded child processes are closed.
 * Artifacts stay in a newly created temp folder; no user project or browser profile is opened. */
"use strict";
const fs = require("node:fs"), os = require("node:os"), path = require("node:path"), cp = require("node:child_process"), net = require("node:net");
const ROOT = path.resolve(__dirname, ".."), FF = require("../ffmpeg-path"), Clock = require("../packet-clock");
const Measure = require("../desktop/av-sync-measure.cjs"), { findBrowser } = require("../export-jobs");
const sleep = ms => new Promise(r => setTimeout(r, ms));
const run = (bin, args) => cp.execFileSync(bin, args, { windowsHide: true, timeout: 120000, maxBuffer: 64 << 20, stdio: ["ignore", "pipe", "pipe"] });
function measured(file, limit) {
  const d = Measure.decode(FF.path("ffmpeg"), file);
  const info = JSON.parse(run(FF.path("ffprobe"), ["-v", "error", "-select_streams", "v:0", "-show_entries", "frame=best_effort_timestamp_time", "-show_frames", "-of", "json", file]));
  if (info.frames.length !== d.luma.length) throw Error("decoded frame / PTS count mismatch");
  const flashes = d.luma.flatMap((v, i) => v > 128 && !(i && d.luma[i - 1] > 128) ? [Number(info.frames[i].best_effort_timestamp_time)] : []);
  const audio = JSON.parse(run(FF.path("ffprobe"), ["-v", "error", "-select_streams", "a:0", "-show_entries", "stream=start_time", "-of", "json", file]));
  const origin = Number(audio.streams[0]?.start_time || 0);
  const beeps = Measure.beepOnsets(d.samples, d.rate).map(t => t + origin);
  const result = Measure.pair(flashes, beeps, limit);
  return { ...result, duration: d.duration, limit, before: result.pairs.filter(p => p.flash < 5), after: result.pairs.filter(p => p.flash >= 5) };
}
function fixture(dir, encoder) {
  const ff = FF.path("ffmpeg"), source = path.join(dir, "signal.mp4");
  const video = "color=c=black:size=320x180:rate=30:duration=5,format=yuv420p,drawbox=x=0:y=0:w=iw:h=ih:color=white:t=fill:enable='gte(n\\,6)*eq(mod(n-6\\,15)\\,0)'";
  const audio = "aevalsrc=exprs='gte(t\\,0.2)*lt(mod(t-0.2\\,0.5)\\,0.02)*0.8*sin(2*PI*1000*t)':s=48000:d=5";
  run(ff, ["-v", "error", "-n", "-f", "lavfi", "-i", video, "-f", "lavfi", "-i", audio, "-c:v", encoder, "-b:v", "400k", "-bf", "0", "-g", "30", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", source]);
  const segment = offset => run(ff, ["-v", "error", "-i", source, "-c", "copy", "-output_ts_offset", String(offset), "-f", "mpegts", "pipe:1"]);
  const ts = path.join(dir, "jump.ts"); fs.writeFileSync(ts, Buffer.concat([segment(0), segment(300)]));
  const data = run(ff, ["-v", "error", "-copyts", "-i", ts, "-c:v", "copy", "-c:a", "aac", "-f", "matroska", "pipe:1"]);
  const file = path.join(dir, "media", "gap.mkv"); fs.mkdirSync(path.dirname(file)); fs.writeFileSync(file, data.subarray(0, data.length - 128));
  return { file, source };
}
async function cdp(url) {
  const ws = new WebSocket(url), calls = new Map(); let id = 0;
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && calls.has(m.id)) { const c = calls.get(m.id); calls.delete(m.id); m.error ? c.reject(Error(m.error.message)) : c.resolve(m.result); } };
  return { close: () => ws.close(), send: (method, params = {}) => new Promise((resolve, reject) => { calls.set(++id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })); }) };
}
async function exercise() {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const deadline = Date.now() + 20000;
  while ((!state.connected || !runtime.projectId) && Date.now() < deadline) await wait(50);
  if (!state.connected) throw Error("editor not connected");
  await repairMediaFile(project.media.find(m => m.id === "old"));
  if (project.media[0].id === "old") throw Error("repair did not replace the media: " + document.body.innerText.slice(-600));
  if (!await flushSave()) throw Error("repair save failed");
  const preview = [];
  for (const t of [1.0, 1.24, 6.0, 6.24]) {
    setTime(t); await seekVideosTo(t); drawFrame(t); await wait(80);
    const pixel = els.preview.getContext("2d").getImageData(els.preview.width / 2, els.preview.height / 2, 1, 1).data;
    const luma = (pixel[0] + pixel[1] + pixel[2]) / 3, white = t % 1 > .1;
    if (white ? luma < 200 : luma > 40) throw Error("preview marker mismatch at " + t + ": " + luma);
    preview.push({ time: t, luma, image: els.preview.toDataURL("image/png") });
  }
  await fetchEncodeProfiles();
  const result = await fastExport({ silent: true, delivery: { preset: "master", video: { codec: "h264", encoder: globalThis.acceptanceEncoder } } });
  if (!result?.outputs?.length || result.outputs.some(o => !o.ok)) throw Error("export failed: " + JSON.stringify(result));
  return { repaired: project.media[0].src, duration: project.media[0].duration, preview, exported: result.outputs[0].src };
}
async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mc-gap-chrome-")), processes = []; let server, chrome, client, browserClient;
  try {
    const encoders = await require("../prepare-media").usableH264(); const encoder = encoders[0];
    if (!encoder) throw Error("no usable H.264 encoder for acceptance fixture/export");
    const made = fixture(dir, encoder), baseline = measured(made.source, 1 / 30);
    if (!baseline.ok) throw Error("synthetic baseline itself is not aligned");
    const scan = await Clock.scanFile(made.file), map = Clock.repairMap(scan, scan.sourceOrigin);
    if (!map.gaps.length) throw Error("fixture lost its gap");
    fs.writeFileSync(path.join(dir, "project.json"), JSON.stringify({ name: "Gap sync acceptance", width: 320, height: 180, fps: 30, revision: 1,
      media: [{ id: "old", name: "gap.mkv", src: "/media/gap.mkv", kind: "video", duration: map.sourceDuration }],
      clips: [{ id: "v", kind: "video", mediaId: "old", track: "V1", start: 0, in: 0, duration: map.sourceDuration, props: { volume: 0 } },
        { id: "a", kind: "audio", mediaId: "old", track: "A1", start: 0, in: 0, duration: map.sourceDuration, props: { volume: 1 } }] }));
    const probe = net.createServer(); await new Promise(r => probe.listen(0, "127.0.0.1", r)); const port = probe.address().port; await new Promise(r => probe.close(r));
    const base = "http://127.0.0.1:" + port;
    server = cp.spawn(process.execPath, [path.join(ROOT, "server.js")], { cwd: ROOT, windowsHide: true, env: { ...process.env, PORT: String(port), FABLECUT_DATA_DIR: dir, FABLECUT_NO_FS_WATCH: "1" }, stdio: ["ignore", "pipe", "pipe"] });
    processes.push({ kind: "server", pid: server.pid }); const log = fs.createWriteStream(path.join(dir, "server.log")); server.stdout.pipe(log); server.stderr.pipe(log);
    for (let i = 0; ; i++) { try { if ((await fetch(base + "/api/project")).ok) break; } catch {} if (i > 100) throw Error("server not ready"); await sleep(100); }
    const profile = path.join(dir, "chrome-profile"); fs.mkdirSync(profile);
    chrome = cp.spawn(findBrowser(), ["--headless=new", "--remote-debugging-port=0", "--user-data-dir=" + profile, "--no-first-run", "--no-default-browser-check", "--autoplay-policy=no-user-gesture-required", "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--window-size=1600,900", "about:blank"], { windowsHide: true, stdio: "ignore" });
    processes.push({ kind: "chrome", pid: chrome.pid }); const active = path.join(profile, "DevToolsActivePort");
    for (let i = 0; !fs.existsSync(active); i++) { if (i > 150) throw Error("Chrome debug port unavailable"); await sleep(100); }
    const [debugPort, browserPath] = fs.readFileSync(active, "utf8").trim().split(/\r?\n/);
    browserClient = await cdp("ws://127.0.0.1:" + debugPort + browserPath);
    const target = await (await fetch("http://127.0.0.1:" + debugPort + "/json/new?" + encodeURIComponent(base), { method: "PUT" })).json(); client = await cdp(target.webSocketDebuggerUrl);
    await client.send("Runtime.enable"); await sleep(1500);
    const evaluated = await client.send("Runtime.evaluate", { expression: `globalThis.acceptanceEncoder=${JSON.stringify(encoder)};(${exercise.toString()})()`, awaitPromise: true, returnByValue: true, timeout: 240000 });
    if (evaluated.exceptionDetails) throw Error(JSON.stringify(evaluated.exceptionDetails));
    const result = evaluated.result.value;
    for (let i = 0; i < result.preview.length; i++) { const p = result.preview[i]; fs.writeFileSync(path.join(dir, "preview-" + i + ".png"), Buffer.from(p.image.split(",")[1], "base64")); delete p.image; }
    const local = src => path.join(dir, ...src.split("/").filter(Boolean).map(decodeURIComponent));
    const repaired = measured(local(result.repaired), 1 / 30), exported = measured(local(result.exported), .04);
    const ok = repaired.ok && exported.ok && repaired.before.length > 0 && repaired.after.length > 0 && exported.before.length > 0 && exported.after.length > 0;
    const report = { ok, encoder, processes, gapSeconds: map.gaps.reduce((n, g) => n + g.to - g.from, 0), preview: result.preview, repaired, exported };
    fs.writeFileSync(path.join(dir, "results.json"), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ dir, ...report }, null, 2)); if (!ok) process.exitCode = 1;
  } catch (e) { fs.writeFileSync(path.join(dir, "failure.txt"), String(e.stack || e)); console.error(JSON.stringify({ dir, error: String(e.message) })); process.exitCode = 1; }
  finally {
    if (browserClient) { try { await browserClient.send("Browser.close"); } catch {} browserClient.close(); }
    client?.close(); if (chrome && chrome.exitCode === null) chrome.kill(); if (server && server.exitCode === null) server.kill();
  }
}
if (require.main === module) main();
module.exports = { measured, fixture };
