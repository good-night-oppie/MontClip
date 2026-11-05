"use strict";
const test = require("node:test"), assert = require("node:assert/strict"), fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const FF = require("../ffmpeg-path"), MP = require("../media-probe");
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
  test(`${ext}: streamed primary scan sees two spans without counting audio twice`, { skip: !have }, async () => {
    const result = await require("../packet-clock").scanFile(fixture.rows.find(r => r.file.endsWith(ext)).file);
    assert.equal(result.kind, "video"); assert.equal(result.streamIndex, 0);
    assert.equal(result.segments.length, 2); assert.equal(result.timestampJump, true);
    assert.ok(result.gaps[0].duration > 290);
    assert.ok(result.packets > 200 && result.packets <= 300);
  });
  // Executed failing assertions, not skipped. Remove TODO only with source-clock integration.
  test(`${ext}: registered duration excludes the 295-second timestamp hole`, { skip: !have, todo: "source mapping and background integration pending" }, async () => {
    const info = await MP.probeFile(fixture.rows.find(r => r.file.endsWith(ext)).file);
    assert.ok(info.duration > 9 && info.duration < 10.2, `duration=${info.duration}`);
  });
}
