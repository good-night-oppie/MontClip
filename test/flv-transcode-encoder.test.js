"use strict";
// #28 × main's FLV import: the bundled LGPL ffmpeg has no libx264, so an FLV that needs transcoding is encoded
// with the first H.264 encoder that works here — a graphics-card encoder, then Windows' h264_mf — as the ADR
// (docs/decisions/2026-11-02-h264-encoder.md) says for exports and proxies. With none, the import is refused
// with a code of its own instead of a failed encode.
const test = require("node:test"), a = require("node:assert/strict");
const P = require("../prepare-media");

test("the transcode arguments name the chosen encoder and never libx264 or libopenh264", () => {
  for (const e of ["h264_nvenc", "h264_qsv", "h264_amf", "h264_videotoolbox", "h264_mf"]) {
    const args = P.transcodeVideoArgs(e);
    a.equal(args[args.indexOf("-c:v") + 1], e, e);
    a.ok(!args.some((x) => /libx264|libopenh264/i.test(x)), e);
  }
  a.equal(P.transcodeVideoArgs("libx264"), null, "not an encoder MontClip uses for this");
  a.equal(P.transcodeVideoArgs("libopenh264"), null);
});

test("the usable encoders: hardware first, then h264_mf, each one answering, never libx264", async () => {
  const pick = (listed, works) => P.usableH264({
    list: async () => new Set(listed),
    tryEncoder: async (e) => works.includes(e),
  });
  a.deepEqual(await pick(["libx264", "h264_nvenc", "h264_qsv", "h264_mf"], ["h264_nvenc", "h264_qsv", "h264_mf"]), ["h264_nvenc", "h264_qsv", "h264_mf"]);
  a.deepEqual(await pick(["h264_nvenc", "h264_qsv", "h264_mf"], ["h264_qsv"]), ["h264_qsv"], "a listed encoder that does not answer is left out");
  a.deepEqual(await pick(["libx264", "h264_nvenc", "h264_mf"], ["h264_mf"]), ["h264_mf"], "h264_mf when it answers (a Windows N edition may lack it)");
  a.deepEqual(await pick(["libx264"], ["libx264"]), [], "libx264 is never used");
  a.deepEqual(await pick([], []), []);
});

test("prepareMedia refuses with FLV_ENCODER_MISSING when no H.264 encoder works, before running ffmpeg", async () => {
  a.ok(P.PUBLIC_CODES.has("FLV_ENCODER_MISSING"));
  a.deepEqual(P.publicPreparationError({ code: "FLV_ENCODER_MISSING" }), { code: "FLV_ENCODER_MISSING", error: "FLV_ENCODER_MISSING" });
  const src = require("node:fs").readFileSync(require("node:path").join(__dirname, "..", "prepare-media.js"), "utf8");
  a.match(src, /const encoders = compatible \? \[null\] : \[\]\.concat\(await \(chooseEncoder \|\| usableH264\)\(\)\)\.filter\(Boolean\);\n  if \(!compatible && !encoders\.length\) throw failure\("FLV_ENCODER_MISSING", originalSrc\);/);
  a.match(src, /if \(compatible \|\| i \+ 1 >= encoders\.length \|\| error\.missingTool/, "the next encoder is tried only for a transcode, and only when one is left");
  a.doesNotMatch(src, /"-c:v", "libx264"/);
});

test("the page says FLV_ENCODER_MISSING in plain words, in both languages", () => {
  const view = require("../ui-preferences");
  for (const l of ["zh-CN", "en"]) {
    const s = view.flvImportMessage(l, "FLV_ENCODER_MISSING");
    a.ok(s && s !== view.flvImportMessage(l, "SOMETHING_ELSE"), l + ": its own message, not the generic failure");
  }
  a.match(view.flvImportMessage("zh-CN", "FLV_ENCODER_MISSING"), /H\.264 编码器/);
});
