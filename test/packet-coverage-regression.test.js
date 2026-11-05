"use strict";
const test = require("node:test"), assert = require("node:assert/strict"), fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const FF = require("../ffmpeg-path"), MP = require("../media-probe"), cp = require("node:child_process");
const { samples, packets } = require("../scripts/packet-timestamps-bench");
const have = FF.available("ffmpeg") && FF.available("ffprobe");
let dir, fixture;
test.before(() => { if (have) { dir = fs.mkdtempSync(path.join(os.tmpdir(), "mc-coverage-test-")); fixture = samples(dir); } });
test.after(() => { if (dir) fs.rmSync(dir, { recursive: true, force: true }); });
for (const ext of ["flv", "mkv"]) {
  test(`${ext}: synthetic recording retains a DTS discontinuity`, { skip: !have }, () => {
    const file = fixture.rows.find(r => r.file.endsWith(ext)).file;
    const rows = packets(file);
    assert.ok(rows.length > 200);
    assert.ok(rows.some((p, i) => i && Number(p.dts_time) - Number(rows[i - 1].dts_time) > 290));
  });
  test(`${ext}: mapped seek after the gap decodes the exact reference frame`, { skip: !have }, async () => {
    const clock = require("../packet-clock"), file = fixture.rows.find(r => r.file.endsWith(ext)).file;
    const map = clock.coverage(await clock.scanFile(file));
    const run = (tool, args) => cp.execFileSync(FF.path(tool), args, { windowsHide: true, timeout: 20000, maxBuffer: 8 << 20, stdio: ["ignore", "pipe", "pipe"] });
    const raw = JSON.parse(run("ffprobe", ["-v", "quiet", "-select_streams", "v:0", "-show_frames", "-show_entries", "frame=best_effort_timestamp_time", "-show_format", "-of", "json", file]));
    const index = raw.frames.findIndex(f => Number(f.best_effort_timestamp_time) >= map.ranges[1].sourceStart) + 15;
    const source = Number(raw.frames[index].best_effort_timestamp_time);
    const local = map.ranges[1].start + (source - map.ranges[1].sourceStart);
    // ffmpeg -ss is relative to format.start_time, unlike packet PTS and HTML video.
    const seek = clock.toSource(map, local) - Number(raw.format.start_time);
    assert.ok(Math.abs(seek + Number(raw.format.start_time) - source) < 1 / 30);
    const output = ["-frames:v", "1", "-fps_mode", "passthrough", "-pix_fmt", "rgb24", "-f", "rawvideo", "pipe:1"];
    const reference = run("ffmpeg", ["-v", "error", "-i", file, "-vf", `select=eq(n\\,${index})`, ...output]);
    const mapped = run("ffmpeg", ["-v", "error", "-ss", String(seek), "-i", file, ...output]);
    assert.ok(reference.length > 0); assert.deepEqual(mapped, reference);
  });
  test(`${ext}: streamed primary scan sees two spans without counting audio twice`, { skip: !have }, async () => {
    const result = await require("../packet-clock").scanFile(fixture.rows.find(r => r.file.endsWith(ext)).file);
    assert.equal(result.kind, "video"); assert.equal(result.streamIndex, 0);
    assert.equal(result.segments.length, 2); assert.equal(result.timestampJump, true);
    assert.ok(result.gaps[0].duration > 290);
    assert.ok(result.packets > 200 && result.packets <= 300);
    const covered = require("../packet-clock").coverage(result);
    assert.ok(covered.coveredDuration > 9 && covered.coveredDuration < 10.2, JSON.stringify(covered));
    assert.ok(covered.sourceDuration > 300);
    const clock = require("../packet-clock"), pts = packets(fixture.rows.find(r => r.file.endsWith(ext)).file).map(p => Number(p.pts_time));
    const after = pts.filter(t => t >= covered.ranges[1].sourceStart).sort((a, b) => a - b);
    for (const sourceTime of after.slice(0, 20)) {
      const local = covered.ranges[1].start + sourceTime - covered.ranges[1].sourceStart;
      assert.ok(Math.abs(clock.toSource(covered, local) - sourceTime) < 1 / 30);
      assert.ok(Math.abs(clock.fromSource(covered, sourceTime) - local) < 1 / 30);
    }
    const seam = covered.ranges[1].start;
    const cuts = clock.sourceRanges(covered, seam - .5, seam + .5);
    assert.equal(cuts.length, 2);
    assert.ok(Math.abs(cuts.reduce((n, r) => n + r.sourceEnd - r.sourceStart, 0) - 1) < 1 / 30);
  });
  // Executed failing assertions, not skipped. Remove TODO only with source-clock integration.
  test(`${ext}: registered duration excludes the 295-second timestamp hole`, { skip: !have, todo: "source mapping and background integration pending" }, async () => {
    const info = await MP.probeFile(fixture.rows.find(r => r.file.endsWith(ext)).file);
    assert.ok(info.duration > 9 && info.duration < 10.2, `duration=${info.duration}`);
  });
}
