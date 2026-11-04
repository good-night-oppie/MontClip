"use strict";
// The desktop FLV import dialog, decision A (Deja, 2026-11-04): progress with time left while the original is checked,
// a recording with breaks listed and offered as "Convert to MP4 and import", and a refusal or failure said in a dialog
// that waits for an answer (VV saw the reason flash past in a toast). The page code runs here on a small fake DOM.
const test = require("node:test"), assert = require("node:assert/strict"), vm = require("node:vm"), fs = require("node:fs"), path = require("node:path");
const V = require("../ui-preferences");
const source = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");

function el(tag) {
  const e = { tag, dataset: {}, children: [], hidden: false, disabled: false, textContent: "", className: "", listeners: {},
    setAttribute(k, v) { this[k] = v; }, append(...c) { this.children.push(...c); }, replaceChildren(...c) { this.children = c; },
    showModal() { this.open = true; }, close() { this.open = false; }, remove() { this.removed = true; }, focus() {},
    addEventListener(k, f) { this.listeners[k] = f; } };
  return e;
}
function world(bridge) {
  const made = [], toasts = [];
  const document = { createElement: (t) => { const e = el(t); made.push(e); return e; }, body: { append() {} } };
  const context = { document, toast: (m) => toasts.push(m), MontClipView: V, mcView: { get: () => ({ language: "zh-CN" }) },
    globalThis: { montclipFlv: bridge }, crypto: { randomUUID: () => "0b5c3a0e-8d55-4f62-9d55-4e0a8d2b6a11" }, setInterval, clearInterval, setTimeout, Promise };
  vm.createContext(context);
  vm.runInContext(source.slice(source.indexOf("async function desktopFlvImport("), source.indexOf("async function importFiles(")), context);
  const find = (pred) => made.filter((e) => e.tag === "button" && pred(e));
  return { context, made, toasts, find };
}
const until = async (f) => { for (let i = 0; i < 400; i++) { const v = f(); if (v) return v; await new Promise((r) => setTimeout(r, 5)); } throw new Error("timed out"); };

test("a recording with breaks: listed, offered as 转成 MP4 再导入, prepared with fixGaps", async () => {
  const calls = [];
  const bridge = {
    inspect: async (file, id) => { calls.push(["inspect", id]); return { ok: true, id, compatible: true, needsReadableConsent: false, gaps: [{ at: 62.5, length: 8 }, { at: 3725, length: 0.4 }] }; },
    status: async () => ({ ok: true, status: { phase: "inspect", done: 50, size: 100, remaining: 130 } }),
    prepare: async (v) => { calls.push(["prepare", v]); return { ok: true, src: "/media/compat.mp4", originalSrc: "/media/a.flv", preparation: "convert" }; },
    cancel: async () => {},
  };
  const w = world(bridge);
  const pending = w.context.desktopFlvImport({ name: "早早晴 11-03.flv" });
  const go = await until(() => w.find((b) => b.dataset.flvContinue !== undefined && !b.hidden)[0]);
  assert.match(calls[0][1], /^[0-9a-f-]{36}$/, "the page names the import, so its progress shows during the check");
  assert.equal(go.textContent, "转成 MP4 再导入");
  const ask = w.made.find((e) => e.dataset.flvAsk !== undefined), list = w.made.find((e) => e.dataset.flvGaps !== undefined);
  assert.match(ask.textContent, /这场录像中间断过 2 处/);
  assert.deepEqual(list.children.map((li) => li.textContent), ["01:02 这里录像断了约 8 秒", "1:02:05 这里录像断了约 0.4 秒"]);
  go.onclick();
  const r = await pending;
  assert.equal(r.preparation, "convert");
  assert.equal(calls[1][1].fixGaps, true);
  assert.deepEqual(w.toasts, []);
});

test("progress text: percent and time left while the original is checked", async () => {
  let release;
  const bridge = {
    inspect: () => new Promise((r) => { release = r; }),
    status: async () => ({ ok: true, status: { phase: "inspect", done: 42, size: 100, remaining: 130 } }),
    prepare: async () => ({ ok: true, src: "/media/x.mp4" }), cancel: async () => {},
  };
  const w = world(bridge);
  const pending = w.context.desktopFlvImport({ name: "a.flv" });
  const status = w.made.find((e) => e.dataset.flvStatus !== undefined);
  await until(() => /42%/.test(status.textContent));
  assert.equal(status.textContent, "正在检查原片… 42%，还要约 3 分钟");
  release({ ok: true, id: "x", compatible: true, needsReadableConsent: false, gaps: [] });
  await pending;
});

test("a failure is a dialog that waits; a failed plain remux offers the conversion", async () => {
  let prepares = 0;
  const bridge = {
    inspect: async (file, id) => ({ ok: true, id, compatible: true, needsReadableConsent: false, gaps: [] }),
    status: async () => null,
    prepare: async (v) => (++prepares === 1 ? { ok: false, code: "FLV_PREPARATION_FAILED" } : { ok: false, code: "FLV_FIX_UNVERIFIED", check: { durationDiff: 2.04, avOffset: 0.012 }, fixGaps: v.fixGaps }),
    cancel: async () => {},
  };
  const w = world(bridge);
  const pending = w.context.desktopFlvImport({ name: "a.flv" });
  const notice = () => w.made.filter((e) => e.dataset.flvNotice !== undefined && e.open);
  const first = await until(() => notice()[0]);
  const reason = first.children.find((e) => e.dataset.flvReason !== undefined);
  assert.match(reason.textContent, /没导进来/);
  assert.match(reason.textContent, /转成 MP4 再导入/);
  const convert = first.children.at(-1).children.find((b) => b.dataset.flvConvert !== undefined);
  assert.equal(convert.hidden, false);
  convert.onclick();
  const second = await until(() => notice()[0]);
  const why = second.children.find((e) => e.dataset.flvReason !== undefined).textContent;
  assert.match(why, /和原片对不上/);
  assert.match(why, /时长 2 秒，声音和画面 12 毫秒/);
  assert.equal(second.children.at(-1).children.find((b) => b.dataset.flvConvert !== undefined).hidden, true, "no second conversion offered");
  second.children.at(-1).children.find((b) => b.dataset.flvOk !== undefined).onclick();
  assert.equal(await pending, null);
  assert.deepEqual(w.toasts, [], "nothing said only in a toast");
});

test("new FLV strings: both languages, Chinese without English words, English without Chinese", () => {
  const keys = ["flvPct", "flvEta", "flvEtaMin", "flvEtaSec", "flvPhaseCheck", "flvGapAt", "flvGapMore", "flvConvert", "flvGotIt", "flvGapRefused", "flvFixUnverified", "flvFixBy", "flvRetryConvert"];
  for (const k of keys) {
    const zh = V.text["zh-CN"][k], en = V.text.en[k];
    assert.ok(zh && en, k);
    assert.equal(zh.replace(/\{\w+\}|FLV|MP4|MontClip/g, "").match(/[A-Za-z]{2,}/), null, "zh " + k + ": " + zh);
    assert.ok(!/[一-鿿]/.test(en), "en " + k);
  }
  assert.match(V.tp("zh-CN", "flvAskGaps", { n: 3 }, { n: 3 }), /断过 3 处/);
  assert.match(V.tp("en", "flvAskGaps", { n: 1 }, { n: 1 }), /broke once/);
  assert.match(V.tp("en", "flvAskGaps", { n: 3 }, { n: 3 }), /broke 3 times/);
  assert.deepEqual(V.flvGapLines("en", [{ at: 62.5, length: 12.4 }]), ["At 01:02 the recording broke for about 12 s"]);
  assert.equal(V.flvGapLines("zh-CN", Array.from({ length: 7 }, (_, i) => ({ at: i * 60, length: 1 }))).at(-1), "还有 2 处");
  assert.equal(V.flvEta("zh-CN", 42), "，还要约 42 秒");
  assert.equal(V.flvEta("en", null), "");
});
