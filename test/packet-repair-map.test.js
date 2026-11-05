"use strict";
const test = require("node:test"), a = require("node:assert/strict");
const Clock = require("../packet-clock"), Remap = require("../gap-remap");
test("repair coordinates retain the file origin and remove only internal presentation gaps", () => {
  const scan = { missingDurations: 0, segments: [
    { sourceStart: 1.421, sourceEnd: 6.421 }, { sourceStart: 301.421, sourceEnd: 306.421 },
  ] };
  const map = Clock.repairMap(scan, 1.4), time = Remap.mapper(map);
  a.ok(Math.abs(map.duration - 10.021) < 1e-9);
  a.equal(time(2), 2, "initial audio/video offset is not treated as a removable gap");
  a.ok(Math.abs(time(302) - 7) < 1e-9);
  a.deepEqual(map.ranges.map(r => r.sourceStart), [1.4, 301.421]);
  a.throws(() => Clock.repairMap(scan, NaN), /origin/);
  a.throws(() => Clock.repairMap(scan, 2), /origin/);
});
