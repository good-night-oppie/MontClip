"use strict";
const test = require("node:test"), a = require("node:assert/strict"), fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const FF = require("../ffmpeg-path"), { samples } = require("../scripts/packet-timestamps-bench");
const have = FF.available("ffmpeg") && FF.available("ffprobe");
let dir, fixture;
test.before(() => { if (have) { dir = fs.mkdtempSync(path.join(os.tmpdir(), "mc-gap-repair-")); fixture = samples(dir); } });
test.after(() => { if (dir) fs.rmSync(dir, { recursive: true, force: true }); });
for (const ext of ["flv", "mkv"]) test(`${ext}: explicit repair skips gaps, verifies the new copy and preserves the original`, { skip: !have }, async () => {
  const file = fixture.rows.find(r => r.file.endsWith(ext)).file, before = fs.readFileSync(file);
  const result = await require("../make-editable").makeEditable(file, { outDir: dir, skipGaps: true });
  a.ok(result.duration > 9 && result.duration < 10.2, JSON.stringify(result));
  a.ok(result.gapMap.gaps[0].to - result.gapMap.gaps[0].from > 290);
  a.equal(result.preparation, "transcode"); a.notEqual(result.file, file);
  a.deepEqual(fs.readFileSync(file), before);
});
test("annotation conflict stops before writing a copy; the original and output directory stay unchanged", { skip: !have }, async () => {
  const file = fixture.rows[0].file, before = fs.readdirSync(dir).sort(), bytes = fs.readFileSync(file);
  await a.rejects(require("../make-editable").makeEditable(file, { outDir: dir, skipGaps: true,
    beforeGapRepair: map => require("../gap-remap").transcript({ words: [["inside", 20, 21]] }, file, map),
  }), e => e.code === "GAP_EDIT_CONFLICT");
  a.deepEqual(fs.readdirSync(dir).sort(), before); a.deepEqual(fs.readFileSync(file), bytes);
});
