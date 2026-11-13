"use strict";
// VV on europa (#130, 2026-11-06): every recording longer than 10 minutes failed to import. prepare-media.js gave
// execFile timeout = max(15 min, 1.5 × duration) in ms, which has a fraction for most lengths (10817587.500000002 for
// 7211.725 s), and Node refuses that: ERR_OUT_OF_RANGE, "timeout must be an unsigned integer". The synthetic fixtures
// are all under 10 minutes, so nothing caught it. The same kind of timeout was in mcp-server.js (reframe's frame
// sampling, max(120 s, 2 s per second of clip)), for spawnSync. Both are rounded up to whole milliseconds now.
const test = require("node:test"), a = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const cp = require("node:child_process");
const P = require("../server/prepare-media");

const accepted = (timeout) => {   // what Node itself says of this timeout, with a child that exits at once
  try { cp.spawnSync(process.execPath, ["-e", "0"], { timeout }); return true; } catch (e) { if (e.code === "ERR_OUT_OF_RANGE") return false; throw e; }
};

test("Node refuses a fractional child timeout (the failure VV saw)", () => {
  a.equal(accepted(10817587.500000002), false);
  a.equal(accepted(10817588), true);
});

test("prepare-media: the conversion's timeout is a whole number of ms, at least 15 minutes, for any length", () => {
  a.equal(typeof P.timeoutMs, "function");
  for (const d of [0, 1, 59.9, 600, 600.0333, 7211.725, 7211.692, 7865.123456, 36000.5]) {
    const t = P.timeoutMs(d);
    a.ok(Number.isInteger(t) && t >= 15 * 60 * 1000, `${d} s → ${t}`);
    a.ok(t >= 1.5 * d * 1000, `${d} s → ${t}: still 1.5 × the length`);
    a.ok(accepted(t), `${d} s → ${t}: Node takes it`);
  }
  a.equal(P.timeoutMs(7211.725), 10817588);
  const src = fs.readFileSync(path.join(__dirname, "..", "server/prepare-media.js"), "utf8");
  a.match(src, /const timeout = timeoutMs\(range\.duration\);/, "prepareMedia uses it");
});

test("mcp-server: reframe's frame sampling timeout is a whole number of ms", () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "server/mcp-server.js"), "utf8");
  const at = src.indexOf("function sampleTimeoutMs(");
  a.ok(at >= 0, "sampleTimeoutMs is there");
  const ctx = {}; vm.createContext(ctx); vm.runInContext(src.slice(at, src.indexOf("\n}", at) + 2), ctx);
  for (const len of [0.5, 60, 61.0333, 179.99, 600.04]) {
    const t = ctx.sampleTimeoutMs(len);
    a.ok(Number.isInteger(t) && t >= 120000 && t >= len * 2000, `${len} s → ${t}`);
    a.ok(accepted(t), `${len} s → ${t}: Node takes it`);
  }
  a.match(src, /spawnSync\(FF\.path\("ffmpeg"\), args, \{ maxBuffer: 1 << 29, timeout: sampleTimeoutMs\(len\) \}\)/, "sampleFrames uses it");
});

test("a recording longer than 10 minutes imports (a synthetic 12-minute FLV: a 700 s break, so the file stays small)", async (t) => {
  const FF = require("../server/ffmpeg-path");
  if (!FF.available("ffmpeg") || !FF.available("ffprobe")) { t.skip("ffmpeg/ffprobe unavailable"); return; }
  const os = require("node:os"), dir = fs.mkdtempSync(path.join(os.tmpdir(), "montclip-long-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const { make } = require("./flv-fixtures");
  const { file } = make(dir, "long.flv", [["jump", { at: 30000, len: 700000 }]]);
  const r = await P.prepareMedia(file, { fixGaps: true, acceptReadable: true, allowTranscode: true }).catch((e) => e);
  a.ok(r && r.src, `imported (${r && r.code} ${r && r.cause && r.cause.code || ""})`);
  a.equal(r.preparation, "remux"); a.equal(r.audio, "filled");
});
