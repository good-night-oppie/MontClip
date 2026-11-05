"use strict";
const test = require("node:test"), a = require("node:assert/strict");
const fs = require("node:fs"), os = require("node:os"), path = require("node:path"), vm = require("node:vm");
const { EventEmitter } = require("node:events"), { PassThrough } = require("node:stream");
const localRequire = require("node:module").createRequire(require.resolve("../make-editable"));

// Exercise the repair pipeline with a successful process that reports a controlled header duration.
// A zero exit status must not turn a non-finite duration into a completed repair.
function harness(t, duration) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mc-genpts-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, "recording.mkv");
  fs.writeFileSync(file, "original");
  const calls = [], mod = { exports: {} };
  function spawn(bin, args) {
    calls.push({ bin, args: Array.from(args) });
    const child = new EventEmitter();
    child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.kill = () => {};
    process.nextTick(() => {
      if (bin === "ffprobe") child.stdout.end(JSON.stringify({ format: { duration }, streams: [{ codec_type: "video" }] }));
      else {
        const out = args[args.length - 1];
        if (out.endsWith(".part")) fs.writeFileSync(out, "fixed");
        child.stdout.end();
      }
      child.stderr.end(); child.emit("close", 0);
    });
    return child;
  }
  vm.runInNewContext(fs.readFileSync(require.resolve("../make-editable"), "utf8"), {
    module: mod, exports: mod.exports, require(id) {
      if (id === "child_process") return { spawn };
      if (id === "./ffmpeg-path") return { path: (name) => name };
      if (id === "./media-probe") return { probeFile: async () => ({ duration: 0 }) };
      return localRequire(id);
    },
  });
  return { calls, dir, file, repair: () => mod.exports.makeEditable(file, { encoders: async () => [] }) };
}

test("remux generates missing PTS at input; stream copy, faststart and strict decode stay enabled", async (t) => {
  const h = harness(t, "3.2"), result = await h.repair();
  a.equal(result.preparation, "remux");
  const args = h.calls[0].args, input = args.indexOf("-i");
  a.deepEqual(args.slice(input - 2, input), ["-fflags", "+genpts"]);
  a.equal(args[args.indexOf("-c") + 1], "copy");
  a.equal(args[args.indexOf("-movflags") + 1], "+faststart");
  const check = h.calls.find((x) => x.args.includes("-xerror"));
  a.ok(check, "the entire result must still decode without errors");
  a.equal(check.args[check.args.indexOf("-err_detect") + 1], "explode");
  a.equal(fs.readFileSync(h.file, "utf8"), "original");
});

test("exit 0 with Infinity in the output header cannot complete a repair", async (t) => {
  const h = harness(t, "Infinity");
  await a.rejects(h.repair(), (e) => e.code === "REPAIR_ENCODER_MISSING");
  a.deepEqual(fs.readdirSync(h.dir), ["recording.mkv"], "invalid result and temporary file removed");
});

const FF = require("../ffmpeg-path");
test("a real PTS jump and truncated tail: genpts does not bypass the duration guard", {
  skip: !(FF.available("ffmpeg") && FF.available("ffprobe")) && "no ffmpeg / ffprobe here",
}, async (t) => {
  const { sample, pipeline } = require("../scripts/repair-timestamps-bench");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mc-jump-test-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const input = sample(dir), original = fs.readFileSync(input.input);
  a.ok(input.bytes < input.completeBytes, "tail really truncated");
  a.ok(input.jumps.length > 0, "the muxer did not smooth away the large forward PTS jump");
  for (const flags of [[], ["-fflags", "+genpts"]]) {
    let fallback = 0;
    // Stop at the encoder boundary: both must reject the short remux, not report it as repaired.
    await a.rejects(pipeline(flags)(input.input, { outDir: dir, encoders: async () => { fallback++; return []; } }),
      (e) => e.code === "REPAIR_ENCODER_MISSING");
    a.equal(fallback, 1, "remux was rejected, and step 3 was reached");
    a.deepEqual(fs.readFileSync(input.input), original, "original bytes untouched");
    a.deepEqual(fs.readdirSync(dir), [path.basename(input.input)], "rejected output removed");
  }
});
