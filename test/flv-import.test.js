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
test("FLV timestamp gaps are refused rather than silently collapsed", async t => {
  if (!available()) { t.skip("ffmpeg/ffprobe unavailable"); return; }
  const dir = makeDataDir(t), original = path.join(dir, "gap.flv");
  execFileSync("ffmpeg", ["-v","error","-f","lavfi","-i","testsrc2=size=64x64:rate=30","-vf","setpts=PTS+gte(T\\,0.15)*2/TB","-frames:v","12","-fps_mode","passthrough","-c:v","libx264",original]);
  const before = hash(original);
  const {probeTimeline} = require("../flv-timeline");
  const timeline = await probeTimeline(original);
  assert.ok(timeline.streams[0].maxGap > 1.9);
  assert.ok(timeline.end > 2);
  const {prepareMedia} = require("../prepare-media");
  await assert.rejects(prepareMedia(original, {allowTranscode:true}), {code:"FLV_TIMELINE_GAP"});
  assert.equal(hash(original), before);
  assert.deepEqual(fs.readdirSync(dir).filter(x=>x.endsWith(".mp4")), []);
});
test("FLV upload remuxes compatible streams without modifying the original", async t => {
  if (!available()) { t.skip("ffmpeg/ffprobe unavailable"); return; }
  const dir = makeDataDir(t);
  const original = path.join(dir, "中文 空格.flv");
  execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "testsrc2=size=64x64:rate=30", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000", "-t", "0.5", "-c:v", "libx264", "-c:a", "aac", original]);
  const before = hash(original);
  const { base } = await startServer(t, dir, { FABLECUT_NO_FS_WATCH: "1" });
  const res = await fetch(base + "/api/upload?name=" + encodeURIComponent("中文 空格.flv"), { method: "POST", body: fs.readFileSync(original) });
  const body = await res.json();
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
  const pending = await response.json();
  assert.equal(response.status, 409);
  assert.equal(pending.code, "FLV_TRANSCODE_REQUIRED");
  assert.equal(fs.readdirSync(path.join(dir, "media")).filter(x => x.endsWith(".mp4")).length, 0);
  const post = body => fetch(base + "/api/prepare-media", {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(body)});
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
  const result = await mcp.callTool("fablecut_import_media", {path:original, allowTranscode:true});
  assert.ok(!result.isError, result.text);
  const entry = readProject(dir).media.at(-1);
  assert.equal(entry.preparation, "transcode");
  assert.match(entry.originalSrc, /\.flv$/);
  assert.match(entry.src, /\.mp4$/);
});
