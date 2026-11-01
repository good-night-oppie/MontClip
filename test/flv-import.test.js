"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");
const { makeDataDir, startServer, startMcp, readProject } = require("./helpers");
const available = () => {
  try { for (const name of ["ffmpeg", "ffprobe"]) execFileSync(name, ["-version"], {stdio:"ignore"}); return true; } catch { return false; }
};
const hash = file => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
test("public preparation errors sanitize unknown paths and distinguish confirmed disk errors", () => {
  const {publicPreparationError} = require("../prepare-media");
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
  execFileSync("ffmpeg", ["-v","error","-f","lavfi","-i","sine=frequency=440","-t","0.1","-c:a","aac",audio]);
  const unsupported = await (await upload(base,fs.readFileSync(audio))).json();
  assert.equal(unsupported.code,"FLV_STREAMS_UNSUPPORTED"); assert.equal(unsupported.error,unsupported.code);
  const noTools = await startServer(t, makeDataDir(t), {FABLECUT_NO_FS_WATCH:"1",Path:"",PATH:""});
  const missing = await (await upload(noTools.base,Buffer.from("no tool needed to expose missing tool"))).json();
  assert.equal(missing.code,"FLV_COMPONENT_MISSING"); assert.equal(missing.error,missing.code);
});
test("FLV upload remuxes compatible streams without modifying the original", async t => {
  if (!available()) { t.skip("ffmpeg/ffprobe unavailable"); return; }
  const dir = makeDataDir(t);
  const original = path.join(dir, "中文 空格.flv");
  execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "testsrc2=size=64x64:rate=30", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000", "-t", "0.5", "-c:v", "libx264", "-c:a", "aac", original]);
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
  const packets = file => execFileSync("ffmpeg", ["-v", "error", "-i", file, "-map", "0:v:0", "-f", "framemd5", "-"], {encoding:"utf8"}).split("\n").filter(x => x && !x.startsWith("#")).map(x => x.split(",").at(-1).trim());
  assert.deepEqual(packets(path.join(dir, "media", decodeURIComponent(body.src.slice(7)))), packets(original));
});
test("legacy FLV requires explicit transcode consent and retains its source", async t => {
  if (!available()) { t.skip("ffmpeg/ffprobe unavailable"); return; }
  const dir = makeDataDir(t), original = path.join(dir, "legacy.flv");
  execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "testsrc2=size=64x64:rate=30", "-t", "0.3", "-c:v", "flv", original]);
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
  const dir = makeDataDir(t), original = path.join(dir, "legacy.flv");
  execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "testsrc2=size=64x64:rate=30", "-t", "0.3", "-c:v", "flv", original]);
  const mcp = startMcp(t, dir);
  await mcp.request("initialize", { protocolVersion: "2025-11-25" });
  const before = readProject(dir);
  const denied = await mcp.callTool("fablecut_import_media", {path:original});
  assert.equal(denied.isError, true);
  assert.deepEqual(readProject(dir), before);
  const result = await mcp.callTool("fablecut_import_media", {path:original, acceptReadable:true, allowTranscode:true});
  assert.ok(!result.isError, result.text);
  const entry = readProject(dir).media.at(-1);
  assert.equal(entry.preparation, "transcode");
  assert.match(entry.originalSrc, /\.flv$/);
  assert.match(entry.src, /\.mp4$/);
});
