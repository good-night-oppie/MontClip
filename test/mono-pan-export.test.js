/* A mono recording must come out of the export in both ears.

   europa, preview.3 (main 4935d49a): a mono source got one linked audio stem with pan −1, because the default pan was
   picked per channel (channel 0 → hard left) without asking how many channels the file has. The export was then
   L −21.1 dB, R −91 dB. Many streamers record with a mono microphone, or their recorder writes mono.

   These run the real path: ffmpeg makes the source (a 440 Hz tone), fablecut_import_media registers it, the
   patch op `insert` puts it on the timeline (a video brings one stem per channel), fablecut_export renders it in a
   headless browser with the editor's own Fast export, and ffmpeg measures each channel of the file it wrote.
   They skip when the bundled ffmpeg or a Chromium-family browser is missing. */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync, spawnSync } = require("node:child_process");
const { makeDataDir, seedProject, startServer, startMcp, readProject } = require("./helpers");
const FF = require("../ffmpeg-path");
const { findBrowser } = require("../export-jobs");

const skip = !FF.available("ffmpeg") ? "bundled ffmpeg not installed (node desktop/fetch-ffmpeg.cjs)"
  : !findBrowser() ? "no Chromium-family browser for the headless export (set FABLECUT_CHROME)" : false;

/** A 2 s VP8 + Opus WebM: `channels` 1 → a 440 Hz tone; 2 → 440 Hz on the left, silence on the right. */
function makeSource(file, channels) {
  const expr = channels === 1 ? "0.5*sin(2*PI*440*t)" : "0.5*sin(2*PI*440*t)|0";
  execFileSync(FF.path("ffmpeg"), ["-v", "error", "-y",
    "-f", "lavfi", "-i", "testsrc2=s=160x90:r=30:d=2",
    "-f", "lavfi", "-i", `aevalsrc='${expr}':s=48000:d=2`,
    "-c:v", "libvpx", "-b:v", "200k", "-c:a", "libopus", "-b:a", "96k", "-shortest", file]);
}

/** Mean volume (dB) of one channel of `file`; −91 when it is silent. */
function channelDb(file, ch) {
  const r = spawnSync(FF.path("ffmpeg"), ["-hide_banner", "-nostats", "-i", file, "-vn",
    "-af", `pan=mono|c0=c${ch},volumedetect`, "-f", "null", "-"], { encoding: "utf8" });
  const m = /mean_volume:\s*(-?[\d.]+|-inf)\s*dB/.exec(r.stderr);
  assert.ok(m, `volumedetect said nothing for channel ${ch}:\n${r.stderr.slice(-800)}`);
  return m[1] === "-inf" ? -91 : Math.max(-91, +m[1]);
}

async function importPlaceExport(t, channels) {
  const dir = makeDataDir(t, seedProject({ width: 320, height: 180, fps: 30, panSchema: 1, media: [], clips: [] }));
  const src = path.join(dir, `tone-${channels}ch.webm`);
  makeSource(src, channels);
  const { base } = await startServer(t, dir, { FABLECUT_NO_FS_WATCH: "1" });
  const mcp = startMcp(t, dir, { FABLECUT_PORT: String(new URL(base).port), FABLECUT_NO_AUTOSTART: "1" });
  await mcp.request("initialize", { protocolVersion: "2025-11-25" });

  const imp = await mcp.callTool("fablecut_import_media", { path: src });
  assert.equal(imp.isError, false, imp.text);
  const m = readProject(dir).media.find((x) => /tone-/.test(x.name));
  assert.ok(m, "the file is registered");
  const ins = await mcp.callTool("fablecut_patch_project", { ops: [{ op: "insert", mediaId: m.id, at: 0 }] });
  assert.equal(ins.isError, false, ins.text);
  const stems = readProject(dir).clips.filter((c) => c.kind === "audio" && c.mediaId === m.id);
  assert.equal(stems.length, channels, `one stem per channel: ${JSON.stringify(stems.map((s) => s.props))}`);

  const out = await mcp.request("tools/call", { name: "fablecut_export", arguments: { where: "headless", preset: "archive" } }, { timeout: 240_000 });
  const text = (out.result.content.find((c) => c.type === "text") || {}).text || "";
  assert.ok(!out.result.isError, text);
  const rel = /exports[\\/][^\s"'`]+\.mkv/.exec(text);
  assert.ok(rel, `the reply names the file: ${text}`);
  const file = path.join(dir, decodeURIComponent(rel[0]));
  assert.ok(fs.existsSync(file), file);
  return { stems, L: channelDb(file, 0), R: channelDb(file, 1) };
}

test("a mono source exports in both ears: left and right within 1 dB", { skip, timeout: 300_000 }, async (t) => {
  const { stems, L, R } = await importPlaceExport(t, 1);
  t.diagnostic(`exported: L ${L} dB, R ${R} dB`);
  assert.ok(L > -40, `there is sound at all (L ${L} dB)`);
  assert.ok(Math.abs(L - R) < 1, `L ${L} dB, R ${R} dB`);
  assert.equal(stems[0].props.pan, 0, "the only stem of a mono file sits in the centre");
});

test("a stereo source still keeps its channels apart: left stays left, right stays right", { skip, timeout: 300_000 }, async (t) => {
  const { stems, L, R } = await importPlaceExport(t, 2);
  t.diagnostic(`exported: L ${L} dB, R ${R} dB`);
  const byCh = Object.fromEntries(stems.map((s) => [s.props.audioChannel, s.props.pan]));
  assert.deepEqual(byCh, { 0: -1, 1: 1 }, "channel 0 hard left, channel 1 hard right");
  assert.ok(L > -40, `the left channel has the tone (L ${L} dB)`);
  assert.ok(R < L - 40, `the right channel stays silent (L ${L} dB, R ${R} dB)`);
});
