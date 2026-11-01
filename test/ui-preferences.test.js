"use strict";
const { test } = require("node:test"), assert = require("node:assert/strict");
const View = require("../ui-preferences");
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
