"use strict";
// #28 × main's FLV import: the bundled LGPL ffmpeg has no libx264, so an FLV that needs transcoding is encoded
// with the first H.264 encoder that works here — a graphics-card encoder, then Windows' h264_mf — as the ADR
// (docs/decisions/2026-11-02-h264-encoder.md) says for exports and proxies. With none, the import is refused
// with a code of its own instead of a failed encode.
const test = require("node:test"), a = require("node:assert/strict");
const P = require("../server/prepare-media");

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
  const src = require("node:fs").readFileSync(require("node:path").join(__dirname, "..", "server/prepare-media.js"), "utf8");
  // Deja, 2026-11-04: the encoders are asked for only when something has to be re-encoded, and none means a refusal first
  a.match(src, /const pick = async \(\) => \(encoders \?\?= \[\]\.concat\(await \(chooseEncoder \|\| usableH264\)\(\)\)\.filter\(Boolean\)\);\n  if \(reencode && !\(await pick\(\)\)\.length\) throw failure\("FLV_ENCODER_MISSING", originalSrc\);/);
  // QQ on #130 / Deja 2026-11-05: drift no longer re-encodes the picture (the sound is filled instead)
  a.match(src, /const reencode = !compatible;/, "the picture is re-encoded only for other codecs");
  a.match(src, /if \(!\(await pick\(\)\)\.length\) throw failure\("FLV_ENCODER_MISSING", originalSrc\);\n\s+try \{ fs\.rmSync\(part/, "a remux that fails its check is re-encoded only with an encoder");
  a.match(src, /if \(!list\[i\] \|\| i \+ 1 >= list\.length \|\| error\.missingTool/, "the next encoder is tried only for a re-encode, and only when one is left");
  a.doesNotMatch(src, /"-c:v", "libx264"/);
});

test("the page says FLV_ENCODER_MISSING in plain words, in both languages", () => {
  const view = require("../ui-preferences");
  for (const l of ["zh-CN", "en"]) {
    const s = view.flvImportMessage(l, "FLV_ENCODER_MISSING");
    a.ok(s && s !== view.flvImportMessage(l, "SOMETHING_ELSE"), l + ": its own message, not the generic failure");
  }
  // JJ v2 (2026-11-04), the conversion variant
  a.equal(view.flvImportMessage("zh-CN", "FLV_ENCODER_MISSING"), "这台电脑上找不到 MontClip 能用的视频编码器，所以这次没能转换。可以先更新显卡驱动再试。");
});
