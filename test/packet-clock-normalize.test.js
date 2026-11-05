"use strict";
const test = require("node:test"), a = require("node:assert/strict"), fs = require("node:fs"), os = require("node:os"), path = require("node:path"), cp = require("node:child_process");
const FF = require("../ffmpeg-path");
const { samples } = require("../scripts/packet-timestamps-bench");
const have = FF.available("ffmpeg") && FF.available("ffprobe");
let dir, input;
test.before(() => { if (have) { dir = fs.mkdtempSync(path.join(os.tmpdir(), "mc-normalize-test-")); input = samples(dir); } });
test.after(() => { if (dir) fs.rmSync(dir, { recursive: true, force: true }); });
const run = (tool, args) => cp.execFileSync(FF.path(tool), args, { windowsHide: true, timeout: 30000, maxBuffer: 8 << 20, stdio: ["ignore", "pipe", "pipe"] });
for (const ext of ["flv", "mkv"]) test(`${ext}: an explicitly normalized copy keeps the frame after the seam and aligned stream endpoints`, { skip: !have }, async () => {
  const file = input.rows.find(r => r.file.endsWith(ext)).file, original = fs.readFileSync(file);
  const result = await require("../scripts/packet-clock-normalize-bench").normalizeFixture(file, dir);
  a.ok(Number.isFinite(result.duration) && result.duration >= .5);
  a.ok(Math.abs(result.duration - result.coveredDuration) < 1 / 30, JSON.stringify(result));
  a.ok(result.duration > 9 && result.duration < 10.2);
  a.equal(result.strictDecode, true); a.deepEqual(fs.readFileSync(file), original);
  const output = ["-frames:v", "1", "-fps_mode", "passthrough", "-pix_fmt", "rgb24", "-f", "rawvideo", "pipe:1"];
  const reference = run("ffmpeg", ["-v", "error", "-i", file, "-vf", "select=eq(n\\,165)", ...output]);
  const normalized = run("ffmpeg", ["-v", "error", "-ss", "5.52", "-i", result.file, ...output]);
  a.ok(reference.length > 0); a.deepEqual(normalized, reference);
  const packets = JSON.parse(run("ffprobe", ["-v", "error", "-show_entries", "packet=stream_index,pts_time,duration_time", "-of", "json", result.file])).packets;
  const edges = [0, 1].map(index => {
    const rows = packets.filter(p => p.stream_index === index);
    for (let i = 1; i < rows.length; i++) {
      const delta = Number(rows[i].pts_time) - Number(rows[i - 1].pts_time);
      a.ok(delta >= 0 && delta < .1, "timestamps advance without a hole");
    }
    // Matroska omits duration on some interior PCM packets; the final packet has an explicit length.
    const last = rows[rows.length - 1]; a.ok(Number.isFinite(Number(last.duration_time)));
    return { start: Number(rows[0].pts_time), end: Number(last.pts_time) + Number(last.duration_time) };
  });
  a.ok(Math.abs(edges[0].start - edges[1].start) < 1 / 30);
  a.ok(Math.abs(edges[0].end - edges[1].end) < 1 / 30);
  const Clock = require("../packet-clock"), Remap = require("../gap-remap");
  const meta = JSON.parse(run("ffprobe", ["-v", "error", "-show_format", "-of", "json", file]));
  const map = Clock.repairMap(await Clock.scanFile(file), Number(meta.format.start_time));
  const after = map.gaps[0].to + .5, removed = map.gaps.reduce((n, g) => n + g.to - g.from, 0);
  const project = { media: [{ id: "old", src: file, duration: map.sourceDuration }], clips: [
    { id: "full", kind: "video", mediaId: "old", start: 0, in: 0, duration: map.sourceDuration },
    ...[2, after].map((t, i) => ({ id: "caption" + i, kind: "text", start: t, duration: .2, props: { caption: true } })),
    ...[2, after].map((t, i) => ({ id: "cut" + i, kind: "video", mediaId: "old", start: 400 + i, in: t, duration: .2 })),
  ], danmaku: [{ mediaId: "old", items: [[2, .2, 123], [after, .2, 456]] }] };
  const before = JSON.stringify(project), planned = Remap.plan(project, "old", "new", map, [{ from: after, to: after + .2 }]);
  a.equal(JSON.stringify(project), before, "replacement planning leaves the saved original intact");
  a.equal(planned.project.clips.find(c => c.id === "caption0").start, 2);
  a.equal(planned.project.clips.find(c => c.id === "cut0").in, 2);
  for (const t of [planned.project.clips.find(c => c.id === "caption1").start,
    planned.project.clips.find(c => c.id === "cut1").in, planned.project.danmaku[0].items[1][0], planned.highlights[0].from])
    a.ok(Math.abs(t - (after - removed)) < 1 / 30);
});
