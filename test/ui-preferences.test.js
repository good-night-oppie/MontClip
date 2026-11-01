"use strict";
const { test } = require("node:test"), assert = require("node:assert/strict");
const View = require("../ui-preferences");
test("simple shortcut boundaries match modifier combinations, not letters", () => {
  for (const event of [
    {key:"t",altKey:true}, {key:"T",altKey:true,shiftKey:true},
    {key:"E",shiftKey:true}, {key:"D",shiftKey:true},
    {key:"l",ctrlKey:true}, {key:"L",metaKey:true},
    {key:"[",ctrlKey:true}, {key:"]",altKey:true,shiftKey:true},
    ...["[", "]", "b", "r", "y", "u"].map(key=>({key})),
    {key:"z",code:"KeyZ",altKey:true},
  ]) assert.equal(View.advancedShortcut(event),true,JSON.stringify(event));
  for (const event of [
    ...["l", "e", "d", "v", "z", "s", "0", "ArrowUp", "ArrowDown"].map(key=>({key})),
    {key:"L",shiftKey:true}, {key:"Z",code:"KeyZ",shiftKey:true},
    {key:"z",ctrlKey:true}, {key:"Z",ctrlKey:true,shiftKey:true},
    {key:"y",ctrlKey:true}, {key:"ArrowLeft",ctrlKey:true}, {key:"ArrowRight",ctrlKey:true},
    ...["a", "s", "o"].map(key=>({key,ctrlKey:true})),
    {key:"l",ctrlKey:true,shiftKey:true}, {key:"t",altKey:true,ctrlKey:true},
    {key:"B",shiftKey:true}, {key:"r",altKey:true},
  ]) assert.equal(View.advancedShortcut(event),false,JSON.stringify(event));
});
test("simple mode blocks only the matching advanced shortcut group", () => {
  for (const key of [";", "'", ",", ".", "g", "G", "i", "O", "n", "m", "t", "T"]) {
    assert.equal(View.advancedShortcut({key}), true, key);
    assert.equal(View.advancedShortcut({key, ctrlKey:true}), false, "preserve command modifier");
  }
  assert.equal(View.advancedShortcut({key:"M",code:"KeyM",shiftKey:true,altKey:true}), true);
  assert.equal(View.advancedShortcut({key:"Delete",shiftKey:true}), true);
  assert.equal(View.advancedShortcut({key:"Backspace",shiftKey:true}), true);
  for (const key of [" ", "j", "k", "l", "ArrowLeft", "Home", "End", "s", "Delete", "Backspace", "+", "-", "Escape"]) assert.equal(View.advancedShortcut({key}), false, key);
  assert.equal(View.advancedShortcut({key:"z",ctrlKey:true}), false);
  assert.equal(View.advancedShortcut({key:"y",metaKey:true}), false);
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
