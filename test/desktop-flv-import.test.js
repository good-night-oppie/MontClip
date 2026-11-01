"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path");
const {execFileSync} = require("node:child_process");
const {makeDataDir} = require("./helpers");
const {createFlvImports} = require("../desktop/flv-import");
test("native FLV probes before copying; cancellation owns no historical media", async t => {
  const root = makeDataDir(t), media = path.join(root,"media"); fs.mkdirSync(media);
  const source = path.join(root,"中文 original.flv");
  execFileSync("ffmpeg", ["-v","error","-f","lavfi","-i","testsrc2=size=64x64:rate=30","-t","0.3","-c:v","flv",source]);
  const original = fs.readFileSync(source);
  fs.writeFileSync(path.join(media,"other-project.flv"),"keep");
  const service = createFlvImports(media); t.after(() => service.shutdown());
  for (let i=0;i<3;i++) {
    const probe = await service.inspect(source); assert.equal(probe.compatible,false);
    assert.deepEqual(fs.readdirSync(media),["other-project.flv"]);
    service.cancel(probe.id);
    assert.deepEqual(fs.readdirSync(media),["other-project.flv"]);
  }
  const refused = await service.inspect(source);
  await assert.rejects(service.prepare(refused.id,false),{code:"FLV_TRANSCODE_REQUIRED"});
  assert.deepEqual(fs.readdirSync(media),["other-project.flv"]);
  const changed = await service.inspect(source); fs.appendFileSync(source,"changed");
  await assert.rejects(service.prepare(changed.id,true),{code:"FLV_SOURCE_CHANGED"});
  assert.deepEqual(fs.readdirSync(media),["other-project.flv"]); fs.writeFileSync(source,original);
  const accepted = await service.inspect(source);
  const prepared = await service.prepare(accepted.id,true);
  assert.equal(prepared.preparation,"transcode"); assert.equal(fs.readdirSync(media).length,3);
  service.cancel(accepted.id); assert.deepEqual(fs.readdirSync(media),["other-project.flv"]);
  const active = await service.inspect(source);
  const pending = service.prepare(active.id,true); service.cancel(active.id);
  await assert.rejects(pending,{code:"FLV_IMPORT_CANCELED"});
  assert.deepEqual(fs.readdirSync(media),["other-project.flv"]);
  const shutting = await service.inspect(source);
  const interrupted = service.prepare(shutting.id,true);
  const rejected = assert.rejects(interrupted,{code:"FLV_IMPORT_CANCELED"});
  await service.shutdown(); await rejected;
  assert.deepEqual(fs.readdirSync(media),["other-project.flv"]);
  const cleanup = await service.inspect(source); await service.prepare(cleanup.id,true);
  const remove = fs.rmSync;
  try {
    fs.rmSync = () => {throw Object.assign(Error('locked'),{code:'EPERM'});};
    assert.throws(()=>service.cancel(cleanup.id),{code:'FLV_CLEANUP_FAILED'});
  } finally {fs.rmSync=remove;}
  await service.shutdown(); // retained owned paths are retried, not forgotten
  assert.deepEqual(fs.readdirSync(media),["other-project.flv"]);
  const durable = await service.inspect(source); await service.prepare(durable.id,true); service.finish(durable.id);
  const duplicate = await service.inspect(source); assert.equal(duplicate.duplicate,true); service.cancel(duplicate.id);
  service.shutdown(); assert.equal(fs.readdirSync(media).length,3);
  assert.deepEqual(fs.readFileSync(source),original);
  assert.equal(fs.readFileSync(path.join(media,"other-project.flv"),"utf8"),"keep");
});
