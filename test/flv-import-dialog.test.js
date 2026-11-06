"use strict";
// The desktop FLV import dialog, decision A (Deja, 2026-11-04) with JJ's v2 wording: progress with time left while the
// original is checked; small drops import without a question; a recording that has to be converted gets JJ's sentence
// and 〔帮我转〕〔先不转〕, and afterwards JJ's 「已经转好了…」; a refusal or failure is a dialog that waits for an answer
// (VV saw the reason flash past in a toast). The page code runs here on a small fake DOM.
const test = require("node:test"), assert = require("node:assert/strict"), vm = require("node:vm"), fs = require("node:fs"), path = require("node:path");
const V = require("../ui-preferences");
const source = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");

function el(tag) {
  return { tag, dataset: {}, children: [], hidden: false, disabled: false, textContent: "", className: "", listeners: {},
    setAttribute(k, v) { this[k] = v; }, append(...c) { this.children.push(...c); }, replaceChildren(...c) { this.children = c; },
    showModal() { this.open = true; }, close() { this.open = false; }, remove() { this.removed = true; }, focus() {},
    addEventListener(k, f) { this.listeners[k] = f; } };
}
function world(bridge) {
  const made = [], toasts = [];
  const document = { createElement: (t) => { const e = el(t); made.push(e); return e; }, body: { append() {} } };
  const context = { document, toast: (m) => toasts.push(m), MontClipView: V, mcView: { get: () => ({ language: "zh-CN" }) },
    globalThis: { montclipFlv: bridge }, crypto: { randomUUID: () => "0b5c3a0e-8d55-4f62-9d55-4e0a8d2b6a11" }, setInterval, clearInterval, setTimeout, Promise };
  vm.createContext(context);
  vm.runInContext(source.slice(source.indexOf("async function desktopFlvImport("), source.indexOf("async function importFiles(")), context);
  const notices = () => made.filter((e) => e.dataset.flvNotice !== undefined && e.open);
  const reason = (d) => d.children.find((e) => e.dataset.flvReason !== undefined).textContent;
  const button = (d, key) => d.children.at(-1).children.find((b) => b.dataset[key] !== undefined);
  return { context, made, toasts, notices, reason, button };
}
const until = async (f) => { for (let i = 0; i < 400; i++) { const v = f(); if (v) return v; await new Promise((r) => setTimeout(r, 5)); } throw new Error("timed out"); };
const BIG = [{ stream: "video", at: 1800, len: 2, big: true }, { stream: "audio", at: 1800, len: 2, big: true }];

test("a recording that has to be converted: JJ's sentence, 〔帮我转〕〔先不转〕, then 「已经转好了…」", async () => {
  const calls = [];
  const bridge = {
    inspect: async (file, id) => { calls.push(["inspect", id]); return { ok: true, id, compatible: true, needsReadableConsent: false, gaps: BIG, fix: ["break"] }; },
    status: async () => ({ ok: true, status: { phase: "inspect", done: 50, size: 100, remaining: 130 } }),
    prepare: async (v) => { calls.push(["prepare", v]); return { ok: true, src: "/media/compat.mp4", originalSrc: "/media/a.flv", preparation: "remux", gapsHeld: true, gaps: BIG }; },
    cancel: async () => {},
  };
  const w = world(bridge);
  const pending = w.context.desktopFlvImport({ name: "早早晴 11-03.flv" });
  const go = await until(() => w.made.find((b) => b.dataset.flvContinue !== undefined && !b.hidden));
  assert.match(calls[0][1], /^[0-9a-f-]{36}$/, "the page names the import, so its progress shows during the check");
  assert.equal(go.textContent, "帮我转");
  assert.equal(w.made.find((b) => b.dataset.flvCancel !== undefined).textContent, "先不转");
  assert.equal(w.made.find((e) => e.dataset.flvAsk !== undefined).textContent, V.t("zh-CN", "flvTimingUnverified"), "JJ's sentence, verbatim");
  go.onclick();
  const r = await pending;
  assert.equal(r.preparation, "remux");
  assert.deepEqual(r.gaps, BIG, "the breaks go to the media entry for the timeline");
  assert.equal(calls[1][1].fixGaps, true);
  const done = await until(() => w.notices()[0]);
  assert.equal(w.reason(done), "已经转好了。30:00 这里录像断了约 2 秒：这几秒画面会停住、没有声音，前后的时间是对的。不想要可以剪掉。");
  assert.deepEqual(w.toasts, []);
});

test("desktop: a conversion that reports drift does not say the timing is right (Rea, 5804186201)", async () => {
  const bridge = {
    inspect: async (file, id) => ({ ok: true, id, compatible: true, needsReadableConsent: false, gaps: BIG, fix: ["break"] }),
    status: async () => null,
    prepare: async () => ({ ok: true, src: "/media/compat.mp4", originalSrc: "/media/a.flv", preparation: "remux", audio: "filled", gapsHeld: true, gaps: BIG, drift: 0.067 }),
    cancel: async () => {},
  };
  const w = world(bridge);
  const pending = w.context.desktopFlvImport({ name: "断过又错开.flv" });
  (await until(() => w.made.find((b) => b.dataset.flvContinue !== undefined && !b.hidden))).onclick();
  await pending;
  const said = w.reason(await until(() => w.notices()[0]));
  assert.equal(said, V.flvConvertedMessage("zh-CN", BIG, 0.067));
  assert.doesNotMatch(said, /前后的时间是对的/);
});

test("small drops import without a question, and without 「已经转好了」", async () => {
  const small = [{ stream: "video", at: 30, len: 0.034, big: false }];
  const bridge = {
    inspect: async (file, id) => ({ ok: true, id, compatible: true, needsReadableConsent: false, gaps: small, fix: [] }),
    status: async () => null,
    prepare: async (v) => ({ ok: true, src: "/media/x.mp4", originalSrc: "/media/a.flv", preparation: "remux", gaps: small, fixGaps: v.fixGaps }),
    cancel: async () => {},
  };
  const w = world(bridge);
  const r = await w.context.desktopFlvImport({ name: "a.flv" });
  assert.equal(r.preparation, "remux");
  assert.ok(w.made.every((e) => e.dataset.flvContinue === undefined || e.hidden), "nothing asked");
  assert.deepEqual(w.notices(), []);
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
  release({ ok: true, id: "x", compatible: true, needsReadableConsent: false, gaps: [], fix: [] });
  await pending;
});

test("a failure is a dialog that waits; a failed plain remux offers 〔帮我转〕; what cannot be converted says 「现在导不进来」", async () => {
  let prepares = 0;
  const bridge = {
    inspect: async (file, id) => ({ ok: true, id, compatible: true, needsReadableConsent: false, gaps: [], fix: [] }),
    status: async () => null,
    prepare: async () => (++prepares === 1 ? { ok: false, code: "FLV_PREPARATION_FAILED" } : { ok: false, code: "FLV_FIX_UNVERIFIED", check: { durationDiff: 2.04, avOffset: 0.012 } }),
    cancel: async () => {},
  };
  const w = world(bridge);
  const pending = w.context.desktopFlvImport({ name: "a.flv" });
  const first = await until(() => w.notices()[0]);
  assert.match(w.reason(first), /没导进来/);
  assert.match(w.reason(first), /替你转/);
  assert.equal(w.button(first, "flvConvert").textContent, "帮我转");
  assert.equal(w.button(first, "flvOk").textContent, "先不转");
  w.button(first, "flvConvert").onclick();
  const second = await until(() => w.notices()[0] !== first && w.notices()[0]);
  assert.match(w.reason(second), /和原片对不上/);
  assert.match(w.reason(second), /时长 2 秒，声音和画面 12 毫秒/);
  assert.equal(w.button(second, "flvConvert").hidden, true, "no second conversion offered");
  assert.equal(w.button(second, "flvOk").textContent, "知道了");
  w.button(second, "flvOk").onclick();
  assert.equal(await pending, null);
  assert.deepEqual(w.toasts, [], "nothing said only in a toast");

  const streams = world({ inspect: async () => ({ ok: false, code: "FLV_STREAMS_UNSUPPORTED" }), status: async () => null, cancel: async () => {} });
  const p = streams.context.desktopFlvImport({ name: "b.flv" });
  const n = await until(() => streams.notices()[0]);
  assert.match(streams.reason(n), /^这个录像现在导不进来：/);
  assert.equal(streams.button(n, "flvConvert").hidden, true, "no 〔帮我转〕 for what the conversion cannot do");
  streams.button(n, "flvOk").onclick();
  assert.equal(await p, null);
});

test("new FLV strings: both languages, Chinese without English words, English without Chinese", () => {
  const keys = ["flvPct", "flvEta", "flvEtaMin", "flvEtaSec", "flvPhaseCheck", "flvConvert", "flvNotNow", "flvGotIt", "flvConverted", "flvConvertedMany",
    "flvStreamsUnsupported", "flvFixUnverified", "flvFixBy", "flvRetryConvert", "flvGapMark", "flvDropMark", "flvSourceDamaged", "exportSourceDamaged"];
  for (const k of keys) {
    const zh = V.text["zh-CN"][k], en = V.text.en[k];
    assert.ok(zh && en, k);
    assert.equal(zh.replace(/\{\w+\}|FLV|MP4|MontClip/g, "").match(/[A-Za-z]{2,}/), null, "zh " + k + ": " + zh);
    assert.ok(!/[一-鿿]/.test(en), "en " + k);
  }
  assert.equal(V.flvGapMark("zh-CN", { stream: "video", len: 2.04, big: true }), "这里录像断了约 2 秒");
  assert.equal(V.flvGapMark("en", { stream: "video", len: 0.034, big: false }), "A little of the recording dropped here (about 0.1 s); imported as it is");
  assert.equal(V.flvEta("zh-CN", 42), "，还要约 42 秒");
  assert.equal(V.flvEta("en", null), "");
});

test("the timeline draws a clip's own stream's breaks: faint for a small drop, labelled for a converted one", () => {
  const ctx = { MontClipView: V, mcView: { get: () => ({ language: "zh-CN" }) }, state: { pps: 10 },
    escapeHtml: (s) => String(s).replace(/</g, "&lt;"), getMedia: () => ({ gaps: [{ stream: "video", at: 12, len: 0.1, big: false }, { stream: "audio", at: 13, len: 0.07, big: false }, { stream: "video", at: 30, len: 2, big: true }] }) };
  vm.createContext(ctx);
  const at = source.indexOf("function gapMarksHtml("), end = source.indexOf("\nfunction transitionMarksHtml(", at);
  vm.runInContext(source.slice(at, end), ctx);
  const html = ctx.gapMarksHtml({ kind: "video", mediaId: "m", in: 10, duration: 30, start: 0, props: {} });
  assert.equal((html.match(/gap-mark small/g) || []).length, 1, "the picture's small drop, not the sound's");
  assert.match(html, /gap-mark small" style="left:20px"/, "at media 12 s, 2 s into the clip");
  assert.match(html, /gap-mark big" style="left:200px;width:20px"[^>]*><span>这里录像断了约 2 秒<\/span>/);
  assert.equal(ctx.gapMarksHtml({ kind: "video", mediaId: "m", in: 0, duration: 30, start: 0, props: {}, keyframes: { speed: [{ t: 0, v: 1 }] } }), "", "a keyed speed shows none");
});
