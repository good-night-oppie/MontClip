"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");
const { makeDataDir, startServer, startMcp, readProject } = require("./helpers");
// the bundled ffmpeg/ffprobe (ffmpeg-path.js), never PATH (#28)
const FF = require("../server/ffmpeg-path");
const available = () => FF.available("ffmpeg") && FF.available("ffprobe");
const hash = file => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
// The H.264 encoders that work here (prepare-media.js usableH264: graphics card, then Windows' h264_mf). QQ (#28,
// 5c986adf): on Windows there is always h264_mf, so an empty list there is a broken check and fails the test; elsewhere
// (a Linux runner without a graphics card) the test is skipped.
async function h264Here(t) {
  const encoders = await require("../server/prepare-media").usableH264();
  if (encoders.length) return encoders;
  if (process.platform === "win32") assert.fail("usableH264() found no H.264 encoder on Windows (h264_mf should always work)");
  t.skip("no H.264 encoder works here, so this H.264 path cannot run");
  return null;
}
test("public preparation errors sanitize unknown paths and distinguish confirmed disk errors", () => {
  const {publicPreparationError} = require("../server/prepare-media");
  const error = Object.assign(new Error("C:/private/user/file failed"), {code:"EACCES"});
  assert.deepEqual(publicPreparationError(error), {code:"IMPORT_FAILED", error:"IMPORT_FAILED"});
  assert.equal(publicPreparationError({code:"ENOSPC"}).code, "FLV_DISK_FULL");
  for (const code of ["FLV_PROBE_FAILED","FLV_STREAMS_UNSUPPORTED","FLV_TRANSCODE_REQUIRED","FLV_PREPARATION_FAILED","FLV_COMPONENT_MISSING"]) assert.deepEqual(publicPreparationError({code}), {code,error:code});
});
test("FLV probe, unsupported layout and missing component return stable codes", async t => {
  if (!available()) { t.skip("ffmpeg/ffprobe unavailable"); return; }
  const dir = makeDataDir(t);
  const {base} = await startServer(t, dir, {FABLECUT_NO_FS_WATCH:"1"});
  const upload = (root, bytes) => fetch(root + "/api/upload?name=test.flv", {method:"POST", body:bytes});
  const bad = await (await upload(base, Buffer.from("not a video"))).json();
  assert.equal(bad.code,"FLV_PROBE_FAILED"); assert.equal(bad.error,bad.code);
  const audio = path.join(dir,"audio.flv");
  execFileSync(FF.path("ffmpeg"), ["-v","error","-f","lavfi","-i","sine=frequency=440","-t","0.1","-c:a","aac",audio]);
  const unsupported = await (await upload(base,fs.readFileSync(audio))).json();
  assert.equal(unsupported.code,"FLV_STREAMS_UNSUPPORTED"); assert.equal(unsupported.error,unsupported.code);
  // nothing anywhere: not the bundled build, not PATH (JJ P1 looks there), no saved choice
  const noTools = await startServer(t, makeDataDir(t), {FABLECUT_NO_FS_WATCH:"1",MONTCLIP_FFMPEG:path.join(dir,"missing","ffmpeg.exe"),MONTCLIP_FFPROBE:path.join(dir,"missing","ffprobe.exe"),PATH:path.join(dir,"missing"),Path:path.join(dir,"missing"),MONTCLIP_EXTERNAL_FFMPEG_SETTINGS:path.join(dir,"missing","x.json")});
  const missing = await (await upload(noTools.base,Buffer.from("no tool needed to expose missing tool"))).json();
  assert.equal(missing.code,"FLV_COMPONENT_MISSING"); assert.equal(missing.error,missing.code);
});
test("FLV upload remuxes compatible streams without modifying the original", async t => {
  if (!available()) { t.skip("ffmpeg/ffprobe unavailable"); return; }
  // the H.264 fixture comes from an encoder that works here (QQ, #28: libx264 is not in the LGPL build, so this most
  // common path for recorder FLVs was skipped everywhere); 320×180 so a graphics-card encoder's minimum size is met
  const encoders = await h264Here(t);
  if (!encoders) return;
  const dir = makeDataDir(t);
  const original = path.join(dir, "中文 空格.flv");
  execFileSync(FF.path("ffmpeg"), ["-v", "error", "-f", "lavfi", "-i", "testsrc2=size=320x180:rate=30", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000", "-t", "0.5", "-pix_fmt", "nv12", "-c:v", encoders[0], "-b:v", "1M", "-c:a", "aac", original]);
  const before = hash(original);
  const { base } = await startServer(t, dir, { FABLECUT_NO_FS_WATCH: "1" });
  let res = await fetch(base + "/api/upload?name=" + encodeURIComponent("中文 空格.flv"), { method: "POST", body: fs.readFileSync(original) });
  let body = await res.json();
  if(body.code === "FLV_READABLE_CONSENT_REQUIRED") { assert.equal(res.status,409); res=await fetch(base+"/api/prepare-media",{method:"POST",body:JSON.stringify({src:body.originalSrc,acceptReadable:true})});body=await res.json(); }
  assert.equal(res.status, 200);
  assert.equal(body.preparation, "remux");
  assert.match(body.src, /\.mp4$/);
  assert.match(body.originalSrc, /\.flv$/);
  assert.equal(hash(original), before);
  assert.equal(crypto.createHash("sha256").update(Buffer.from(await (await fetch(base + body.originalSrc)).arrayBuffer())).digest("hex"), before);
  const packets = file => execFileSync(FF.path("ffmpeg"), ["-v", "error", "-i", file, "-map", "0:v:0", "-f", "framemd5", "-"], {encoding:"utf8"}).split("\n").filter(x => x && !x.startsWith("#")).map(x => x.split(",").at(-1).trim());
  assert.deepEqual(packets(path.join(dir, "media", decodeURIComponent(body.src.slice(7)))), packets(original));
});
test("legacy FLV requires explicit transcode consent and retains its source", async t => {
  if (!available()) { t.skip("ffmpeg/ffprobe unavailable"); return; }
  // transcoding needs an H.264 encoder that works here (graphics card or Windows' h264_mf); a Linux runner has none,
  // and the import is then refused with FLV_ENCODER_MISSING (test/flv-transcode-encoder.test.js)
  if (!(await h264Here(t))) return;
  const dir = makeDataDir(t), original = path.join(dir, "legacy.flv");
  execFileSync(FF.path("ffmpeg"), ["-v", "error", "-f", "lavfi", "-i", "testsrc2=size=64x64:rate=30", "-t", "0.3", "-c:v", "flv", original]);
  const before = hash(original);
  const { base } = await startServer(t, dir, { FABLECUT_NO_FS_WATCH: "1" });
  const response = await fetch(base + "/api/upload?name=legacy.flv", {method:"POST", body:fs.readFileSync(original)});
  let pending = await response.json();
  assert.equal(response.status, 409);
  if(pending.code === "FLV_READABLE_CONSENT_REQUIRED") {
    assert.ok(pending.range.needsConsent);
    const denied=await fetch(base+"/api/prepare-media",{method:"POST",body:JSON.stringify({src:pending.originalSrc,allowTranscode:true})});
    assert.equal((await denied.json()).code,"FLV_READABLE_CONSENT_REQUIRED");
    pending=await (await fetch(base+"/api/prepare-media",{method:"POST",body:JSON.stringify({src:pending.originalSrc,acceptReadable:true})})).json();
  }
  assert.equal(pending.code, "FLV_TRANSCODE_REQUIRED");
  assert.equal(fs.readdirSync(path.join(dir, "media")).filter(x => x.endsWith(".mp4")).length, 0);
  const post = body => fetch(base + "/api/prepare-media", {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({acceptReadable:true,...body})});
  assert.equal((await post({src:pending.originalSrc, allowTranscode:"true"})).status, 409);
  const res = await post({src:pending.originalSrc, allowTranscode:true});
  assert.equal(res.status, 200);
  assert.equal((await res.json()).preparation, "transcode");
  assert.equal(hash(original), before);
  assert.equal((await post({src:"/media/../project.json", allowTranscode:true})).status, 400);
});
test("MCP FLV import shares the explicit conversion gate", async t => {
  if (!available()) { t.skip("ffmpeg/ffprobe unavailable"); return; }
  // transcoding needs an H.264 encoder that works here (graphics card or Windows' h264_mf); a Linux runner has none,
  // and the import is then refused with FLV_ENCODER_MISSING (test/flv-transcode-encoder.test.js)
  if (!(await h264Here(t))) return;
  const dir = makeDataDir(t), original = path.join(dir, "legacy.flv");
  execFileSync(FF.path("ffmpeg"), ["-v", "error", "-f", "lavfi", "-i", "testsrc2=size=64x64:rate=30", "-t", "0.3", "-c:v", "flv", original]);
  const mcp = startMcp(t, dir);
  await mcp.request("initialize", { protocolVersion: "2025-11-25" });
  const before = readProject(dir);
  const denied = await mcp.callTool("fablecut_import_media", {path:original});
  assert.equal(denied.isError, true);
  assert.deepEqual(readProject(dir), before);
  // a transcode probes the graphics-card encoders and decodes the whole source strictly (Rea's rule ⑥): with the whole
  // suite running in parallel that can pass the 15 s a plain tool call gets, so this one waits up to 60 s
  const res = await mcp.request("tools/call", {name:"fablecut_import_media", arguments:{path:original, acceptReadable:true, allowTranscode:true}}, {timeout:60_000});
  const result = {isError:res.result.isError, text:((res.result.content || []).find(c => c.type === "text") || {}).text || ""};
  assert.ok(!result.isError, result.text);
  const entry = readProject(dir).media.at(-1);
  assert.equal(entry.preparation, "transcode");
  assert.match(entry.originalSrc, /\.flv$/);
  assert.match(entry.src, /\.mp4$/);
});
