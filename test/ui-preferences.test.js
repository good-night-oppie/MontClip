"use strict";
const { test } = require("node:test"), assert = require("node:assert/strict");
const View = require("../ui-preferences");
test("FLV errors use the selected language and never surface arbitrary server detail", () => {
  for (const code of ["FLV_PROBE_FAILED", "FLV_STREAMS_UNSUPPORTED", "FLV_TRANSCODE_REQUIRED", "FLV_PREPARATION_FAILED", "FLV_DISK_FULL", "FLV_COMPONENT_MISSING", "FLV_SERVICE_UNAVAILABLE", "FLV_OPEN_FULL_APP"]) {
    assert.match(View.flvMessage(code, "zh-CN"), /[\u4e00-\u9fff]/);
    assert.doesNotMatch(View.flvMessage(code, "en"), /[\u4e00-\u9fff]/);
    assert.doesNotMatch(View.flvMessage(code, "zh-CN"), /FFmpeg|FFprobe| \/ /);
  }
  assert.equal(View.flvMessage("C:/private/path error", "en"), View.flvMessage("UNKNOWN", "en"));
  assert.doesNotMatch(View.flvMessage("FLV_PREPARATION_FAILED", "zh-CN"), /空间|磁盘|详细/);
  assert.doesNotMatch(View.flvMessage("FLV_PREPARATION_FAILED", "en"), /space|disk|details/i);
  assert.match(View.flvMessage("FLV_DISK_FULL", "zh-CN"), /清出空间后再试/);
  assert.match(View.flvMessage("FLV_DISK_FULL", "en"), /Free up space and try again/);
  assert.match(View.flvMessage("FLV_TRANSCODE_REQUIRED", "en"), /Cancel to skip importing this file/);
  assert.equal(View.flvDisconnectedCode({protocol:"file:", desktop:false}), "FLV_OPEN_FULL_APP");
  assert.equal(View.flvDisconnectedCode({protocol:"http:", desktop:true}), "FLV_SERVICE_UNAVAILABLE");
  assert.equal(View.flvDisconnectedCode({protocol:"http:", desktop:false}), "FLV_OPEN_FULL_APP");
  assert.equal(View.flvDisconnectedCode({desktop:false, everConnected:true}), "FLV_SERVICE_UNAVAILABLE");
});
test("view mode/language persist independently of editor data", () => {
  const data = new Map([["project", "keep project bytes"], ["draft", "聊天草稿"]]);
  const storage = { getItem: k => data.get(k), setItem: (k, v) => data.set(k, v) };
  const view = View.create(storage);
  assert.deepEqual(view.get(), { mode: "simple", language: "zh-CN" });
  view.set({ mode: "advanced" }); view.set({ language: "en" });
  assert.deepEqual(View.create(storage).get(), { mode: "advanced", language: "en" });
  assert.equal(data.get("project"), "keep project bytes"); assert.equal(data.get("draft"), "聊天草稿");
  const copy = view.get(); copy.mode = "simple"; assert.equal(view.get().mode, "advanced");
  assert.throws(() => view.set({ mode: "unknown" }));
});
test("unavailable preference storage leaves current view usable and reports failure", () => {
  const view = View.create({ getItem() { throw Error("denied"); }, setItem() { throw Error("full"); } });
  assert.equal(view.set({ mode: "advanced" }), false);
  assert.equal(view.get().mode, "advanced");
  assert.deepEqual(Object.keys(View.text.en).sort(), Object.keys(View.text["zh-CN"]).sort());
});
