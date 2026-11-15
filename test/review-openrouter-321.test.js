"use strict";
/* MontClip#321 (ADR docs/decisions/2026-11-14-review-openrouter-outbound.md): the OpenRouter request, the main process's sender, and the
   doors an agent must not have. Every network request here goes to an in-process stand-in; nothing leaves the computer. Synthetic data only. */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { EventEmitter } = require("node:events");
const { execFileSync, spawnSync } = require("node:child_process");
const OR = require("../server/openrouter-review");
const VB = require("../server/video-bridge");
const { createReviewSender } = require("../desktop/review-sender");

/** A request body exactly as the engine builds it (server/openrouter-review.js), and its snapshot hash (server/video-bridge.js). */
const bodyOf = (video = "video-bytes", audio = "wav-bytes", prompt = "check this") => {
  const vb = Buffer.from(video), ab = audio === null ? null : Buffer.from(audio);
  const body = OR.serialize(OR.buildBody({ prompt, videoB64: vb.toString("base64"), audioB64: ab ? ab.toString("base64") : null }));
  return { body, hash: OR.hashOf("montclip-review-v2", OR.hashOf(vb), ab ? OR.hashOf(ab) : "-", prompt) };
};

const FAKE_KEY = "sk-or-v1-FAKEKEYSENTINEL0123456789abcdef";   // a fake key: it must never show up anywhere but the Authorization header
const NICK = "合成昵称哨兵_小测试";                                  // a synthetic viewer nickname: it must never reach the disk
const tmp = (t) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), "mcor-")); t.after(() => VB.rmForce(d)); return d; };
const RECEIPT = (o = {}) => ({ id: "gen-x", provider: "Google AI Studio", model: "google/gemini-4-carbon", choices: [{ message: { content: '{"verdict":"pass"}' } }],
  usage: { prompt_tokens: 100, prompt_tokens_details: { audio_tokens: 50 } }, ...o });

/** A stand-in for https.request: records the options and the body, answers with status/json (or never answers). */
function standin({ status = 200, json = RECEIPT(), hang = false, fail = false } = {}) {
  const calls = [];
  const request = (opts, onRes) => {
    const req = new EventEmitter();
    const call = { opts, body: null };
    calls.push(call);
    req.destroy = () => { req.destroyed = true; };
    req.end = (body) => {
      call.body = body;
      if (fail) { setImmediate(() => req.emit("error", new Error("ECONNRESET"))); return; }
      if (hang) return;
      setImmediate(() => {
        const res = new EventEmitter(); res.statusCode = status;
        onRes(res);
        res.emit("data", Buffer.from(typeof json === "string" ? json : JSON.stringify(json))); res.emit("end");
      });
    };
    return req;
  };
  return { request, calls };
}
const fakeSafeStorage = (backend = "dpapi") => ({ isEncryptionAvailable: () => true, getSelectedStorageBackend: () => backend,
  encryptString: (s) => Buffer.from("enc:" + Buffer.from(s).toString("base64")), decryptString: (b) => Buffer.from(String(b).slice(4), "base64").toString() });

/* ---- the request ---- */
test("the request: model fixed, provider locked to google-ai-studio, no fallbacks, data_collection deny; video without sound + a WAV", () => {
  const body = OR.buildBody({ prompt: "p", videoB64: "AAAA", audioB64: "BBBB" });
  assert.equal(body.model, "google/gemini-4-carbon");
  assert.deepEqual(body.provider, { order: ["google-ai-studio"], allow_fallbacks: false, data_collection: "deny" });
  assert.equal(body.stream, false);
  const c = body.messages[0].content;
  assert.equal(c[1].type, "video_url"); assert.ok(c[1].video_url.url.startsWith("data:video/mp4;base64,"));
  assert.deepEqual(c[2], { type: "input_audio", input_audio: { data: "BBBB", format: "wav" } });
  assert.equal(OR.buildBody({ prompt: "p", videoB64: "AAAA" }).messages[0].content.length, 2, "picture only: no audio part");
  assert.equal(OR.HOST, "openrouter.ai"); assert.equal(OR.AUDIO.sampleRate, 48000); assert.equal(OR.AUDIO.channels, 2);
});

test("one request body is at most 16 MB: over it is refused before anything is sent", () => {
  const big = "A".repeat(OR.MAX_BODY_BYTES);
  assert.throws(() => OR.serialize(OR.buildBody({ prompt: "p", videoB64: big })), (e) => e.code === "BODY_TOO_LARGE");
  assert.ok(OR.serialize(OR.buildBody({ prompt: "p", videoB64: "A".repeat(1000) })).length < OR.MAX_BODY_BYTES);
  assert.ok(OR.estimateBytes({ seconds: 40, videoBytes: VB.MAX_SAMPLE_BYTES }) <= OR.MAX_BODY_BYTES, "30 s + 10 s lead-in fits");
  assert.ok(OR.estimateBytes({ seconds: 60, videoBytes: VB.MAX_SAMPLE_BYTES }) > OR.MAX_BODY_BYTES, "a minute of 48 kHz stereo does not");
});

/* ---- one POST ---- */
test("post: https to openrouter.ai, the key only in the Authorization header, TLS left as Node checks it", async () => {
  const s = standin();
  const r = await OR.post({ body: Buffer.from("{}"), key: FAKE_KEY, request: s.request });
  assert.equal(r.ok, true);
  assert.equal(s.calls.length, 1);
  const o = s.calls[0].opts;
  assert.equal(o.protocol, "https:"); assert.equal(o.hostname, "openrouter.ai"); assert.equal(o.port, 443); assert.equal(o.path, "/api/v1/chat/completions");
  assert.equal(o.headers.Authorization, "Bearer " + FAKE_KEY);
  for (const k of ["rejectUnauthorized", "ca", "agent", "checkServerIdentity"]) assert.equal(k in o, false, `no ${k}`);
  assert.ok(!JSON.stringify(r).includes(FAKE_KEY), "the key is not in the answer");
});

test("post: no retry — 500, 401, 429, a network error and a timeout each end after ONE request with a fixed code", async () => {
  for (const [opt, code] of [[{ status: 500 }, "FAILED"], [{ status: 401 }, "AUTH_FAILED"], [{ status: 403 }, "AUTH_FAILED"], [{ status: 429 }, "RATE_LIMITED"], [{ fail: true }, "FAILED"], [{ json: "not json" }, "BAD_OUTPUT"]]) {
    const s = standin(opt);
    const r = await OR.post({ body: Buffer.from("{}"), key: FAKE_KEY, request: s.request });
    assert.deepEqual([r.ok, r.reason, s.calls.length], [false, code, 1], JSON.stringify(opt));
  }
  const h = standin({ hang: true });
  const r = await OR.post({ body: Buffer.from("{}"), key: FAKE_KEY, request: h.request, timeoutMs: 50 });
  assert.deepEqual([r.reason, h.calls.length], ["TIMEOUT", 1]);
  const c = standin({ hang: true }), ac = new AbortController();
  const p = OR.post({ body: Buffer.from("{}"), key: FAKE_KEY, request: c.request, signal: ac.signal });
  ac.abort();
  assert.equal((await p).reason, "CANCELLED");
  assert.equal(OR.TIMEOUT_MS, 360000);
});

test("receipt: another provider, no provider, or another model is a DESTINATION_MISMATCH", async () => {
  for (const json of [RECEIPT({ provider: "Google Vertex" }), RECEIPT({ provider: undefined }), RECEIPT({ model: "google/gemini-2.5-pro" }), RECEIPT({ model: undefined })]) {
    const s = standin({ json });
    const r = await OR.post({ body: Buffer.from("{}"), key: FAKE_KEY, request: s.request });
    assert.deepEqual([r.ok, r.reason], [false, "DESTINATION_MISMATCH"], JSON.stringify(json.provider) + " " + json.model);
  }
  assert.equal(OR.readReceipt(RECEIPT()).ok, true);
  assert.equal(OR.audioTokens({ prompt_tokens_details: { audio_tokens: 0 } }), 0);
  assert.equal(OR.audioTokens(null), null);
});

/* ---- the main process's sender ---- */
test("sender: the switch is OFF by default; off means nothing goes", async (t) => {
  const d = tmp(t), s = standin();
  const snd = createReviewSender({ root: d, safeStorage: fakeSafeStorage(), request: s.request });
  assert.deepEqual(snd.switch.get(), { ok: true, on: false });
  const b = bodyOf();
  snd.key.set(FAKE_KEY); snd.permit("r_000000000001", 1, b.hash);
  assert.equal((await snd.send({ reviewId: "r_000000000001", body: b.body })).reason, "REVIEW_SEND_OFF");
  assert.equal(s.calls.length, 0);
  assert.equal(snd.switch.set("yes").ok, false, "a boolean only");
});

test("sender: only a check the streamer clicked to send goes (a permit from the main process), and only as many requests as it has", async (t) => {
  const d = tmp(t), s = standin();
  const snd = createReviewSender({ root: d, safeStorage: fakeSafeStorage(), request: s.request });
  snd.switch.set(true); snd.key.set(FAKE_KEY);
  const b = bodyOf();
  assert.equal((await snd.send({ reviewId: "r_000000000002", body: b.body })).reason, "NOT_CONFIRMED");
  snd.permit("r_000000000002", 1, b.hash);
  assert.equal((await snd.send({ reviewId: "r_000000000002", body: b.body })).ok, true);
  assert.equal((await snd.send({ reviewId: "r_000000000002", body: b.body })).reason, "NOT_CONFIRMED", "the permit is used up");
  assert.equal(s.calls.length, 1);
});

test("sender: the team's agent sends without a box only when the owner set MONTCLIP_REVIEW_AGENT_SEND=1 on this process", async (t) => {
  const d = tmp(t), s = standin();
  const off = createReviewSender({ root: d, safeStorage: fakeSafeStorage(), request: s.request, env: {} });
  off.switch.set(true); off.key.set(FAKE_KEY);
  assert.equal((await off.send({ reviewId: "r_000000000003", agent: true, body: bodyOf().body })).reason, "AGENT_SEND_OFF");
  const on = createReviewSender({ root: d, safeStorage: fakeSafeStorage(), request: s.request, env: { MONTCLIP_REVIEW_AGENT_SEND: "1" } });
  assert.equal((await on.send({ reviewId: "r_000000000003", agent: true, body: bodyOf().body })).ok, true);
  assert.equal(s.calls.length, 1);
});

test("reverse (QQ, #347 review): the main process sends only a body it would build itself, for the check the click confirmed — a changed body reaches the stand-in 0 times", async (t) => {
  const d = tmp(t), s = standin();
  const snd = createReviewSender({ root: d, safeStorage: fakeSafeStorage(), request: s.request, env: { MONTCLIP_REVIEW_AGENT_SEND: "1" } });
  snd.switch.set(true); snd.key.set(FAKE_KEY);
  const good = bodyOf(), j = () => JSON.parse(good.body.toString("utf8"));
  const changed = [
    ["another model", Object.assign(j(), { model: "openai/other-model" })],
    ["another provider order", Object.assign(j(), { provider: { order: ["other"], allow_fallbacks: false, data_collection: "deny" } })],
    ["fallbacks allowed", Object.assign(j(), { provider: { order: ["google-ai-studio"], allow_fallbacks: true, data_collection: "deny" } })],
    ["data collection allowed", Object.assign(j(), { provider: { order: ["google-ai-studio"], allow_fallbacks: false, data_collection: "allow" } })],
    ["an extra top-level field", Object.assign(j(), { transforms: ["middle-out"] })],
    ["an extra provider field", Object.assign(j(), { provider: { ...j().provider, ignore: [] } })],
    ["an extra message", (() => { const x = j(); x.messages.push({ role: "user", content: "and this" }); return x; })()],
    ["no model", (() => { const x = j(); delete x.model; return x; })()],
  ];
  for (const [what, obj] of changed) {
    const body = Buffer.from(JSON.stringify(obj), "utf8");
    snd.permit("r_00000000000a", 1, good.hash);
    assert.equal((await snd.send({ reviewId: "r_00000000000a", body })).reason, "BODY_NOT_ALLOWED", what);
    assert.equal((await snd.send({ reviewId: "r_00000000000b", agent: true, body })).reason, "BODY_NOT_ALLOWED", what + " (the dev-side agent too)");
  }
  assert.equal((await snd.send({ reviewId: "r_00000000000a", body: Buffer.from("not json") })).reason, "BODY_NOT_ALLOWED");
  /* a well-formed body for another check than the one the click confirmed (other picture, other sound, other prompt) */
  for (const other of [bodyOf("other-video"), bodyOf("video-bytes", "other-wav"), bodyOf("video-bytes", "wav-bytes", "another prompt"), bodyOf("video-bytes", null)]) {
    snd.permit("r_00000000000c", 1, good.hash);
    assert.equal((await snd.send({ reviewId: "r_00000000000c", body: other.body })).reason, "HASH_MISMATCH");
    assert.equal((await snd.send({ reviewId: "r_00000000000c", body: good.body })).reason, "NOT_CONFIRMED", "a mismatch ends the permit");
  }
  assert.equal(s.calls.length, 0, "nothing reached the stand-in");
  /* two_pass: the second request has its own prompt, but must carry the same picture and sound as the first */
  const second = bodyOf("video-bytes", "wav-bytes", "the second look");
  snd.permit("r_00000000000d", 2, good.hash);
  assert.equal((await snd.send({ reviewId: "r_00000000000d", body: good.body })).ok, true);
  assert.equal((await snd.send({ reviewId: "r_00000000000d", body: bodyOf("other-video", "wav-bytes", "the second look").body })).reason, "HASH_MISMATCH");
  snd.permit("r_00000000000e", 2, good.hash);
  assert.equal((await snd.send({ reviewId: "r_00000000000e", body: good.body })).ok, true);
  assert.equal((await snd.send({ reviewId: "r_00000000000e", body: second.body })).ok, true);
  assert.equal(s.calls.length, 3);
  for (const c of s.calls) { const sent = JSON.parse(c.body.toString("utf8")); assert.equal(sent.model, OR.MODEL); assert.deepEqual(sent.provider, OR.buildBody({ prompt: "p", videoB64: "v" }).provider); }
});

test("sender: the key is sealed (refused without encryption), never returned, and a fake-key sentinel appears nowhere on disk in clear", async (t) => {
  const d = tmp(t);
  assert.equal(createReviewSender({ root: d, safeStorage: fakeSafeStorage("basic_text") }).key.set(FAKE_KEY).code, "KEY_STORE_UNAVAILABLE");
  const snd = createReviewSender({ root: d, safeStorage: fakeSafeStorage() });
  assert.equal(snd.key.status().configured, false);
  const r = snd.key.set(FAKE_KEY);
  assert.deepEqual(r, { ok: true, configured: true });
  assert.ok(!JSON.stringify(snd.key.status()).includes(FAKE_KEY));
  for (const f of fs.readdirSync(d)) assert.ok(!fs.readFileSync(path.join(d, f), "utf8").includes(FAKE_KEY), f);
  assert.equal(snd.key.set("x").code, "KEY_INVALID");
  snd.key.clear(); assert.equal(snd.key.status().configured, false);
});

test("sender: a local stand-in is honoured only in an unpackaged smoke run, and only on 127.0.0.1", (t) => {
  const d = tmp(t), env = { MONTCLIP_REVIEW_STANDIN: "http://127.0.0.1:4567" };
  assert.equal(createReviewSender({ root: d, safeStorage: fakeSafeStorage(), env, isPackaged: false, smoke: true }).standin, "http://127.0.0.1:4567");
  assert.equal(createReviewSender({ root: d, safeStorage: fakeSafeStorage(), env, isPackaged: true, smoke: true }).standin, null, "packaged: never");
  assert.equal(createReviewSender({ root: d, safeStorage: fakeSafeStorage(), env, isPackaged: false, smoke: false }).standin, null, "not a smoke run: never");
  assert.equal(createReviewSender({ root: d, safeStorage: fakeSafeStorage(), env: { MONTCLIP_REVIEW_STANDIN: "http://evil.example:80" }, isPackaged: false, smoke: true }).standin, null);
});

test("the send: no box before it (owner's decision 2026-11-15, #321 6888246693); the click is the consent, the assistant needs approve-all or Yolo", () => {
  const main = fs.readFileSync(path.join(__dirname, "..", "desktop", "main.js"), "utf8");
  const a = main.indexOf('ipcMain.handle("montclip:review:send"'), b = main.indexOf('ipcMain.handle("montclip:review:unblock"');
  assert.ok(a > 0 && b > a);
  const h = main.slice(a, b);
  assert.ok(!/showMessageBox/.test(h), "nothing is shown before a send");
  assert.ok(!/confirmText/.test(h));
  assert.match(h, /st\.json\.sendToken !== v\.token \|\| w\.hash !== v\.hash/, "only the prepared check, by token and hash");
  /* QQ, #347 review 5909445232: the assistant goes only when the permission modes say run (auto is not approve-all) */
  assert.match(h, /v\.assistant === true[\s\S]{0,120}agentPolicy\.decide\(\{ sessionId: "review", capability: "fablecut_review", target: \{ kind: "origin"/);
  assert.match(h, /d\.action !== "run"\) return \{ ok: false, code: "NEEDS_CLICK" \}/);
  assert.ok(!/mode !== "auto"/.test(h), "the auto mode no longer lets the assistant send");
  /* the streamer's own send needs a real input this window got in the 2 s before; a script's call is not a click */
  assert.match(h, /\} else if \(!takeReviewGesture\(\)\) return \{ ok: false, code: "NEEDS_CLICK" \};/);
  assert.match(main, /win\.webContents\.on\("input-event", \(_e, input\) => \{[\s\S]{0,260}input\.type === "mouseUp" \|\| \(input\.type === "keyUp"[\s\S]{0,120}reviewGesture = Date\.now\(\);/);
  assert.match(main, /const takeReviewGesture = \(\) => \{ const ok = reviewGesture > 0 && Date\.now\(\) - reviewGesture <= 2000; reviewGesture = 0; return ok; \};/);
  assert.ok(h.indexOf("reviewSender.permit(") < h.indexOf('"/api/review/send"') && h.indexOf('"/api/review/send"') < h.indexOf("reviewSender.revoke("));
});

test("Settings › 审片发送: the one line under the switch is JJ's, word for word in both languages, on the interface language switch", () => {
  const root = path.join(__dirname, "..");
  const ZH = "默认关。开启后，点检查按钮时，这段画面和声音（包括里面的弹幕和观众昵称）会发给你设置的 AI 服务，发送前不再另外询问。";
  const EN = "Off by default. When this is on, clicking the check button sends that stretch of picture and sound (including any chat messages and viewer names on screen) to the AI service you set up, with no further prompt before it goes.";
  for (const f of ["ui-preferences.js", "docs/demo/ui-preferences.js"]) {
    const ui = fs.readFileSync(path.join(root, f), "utf8");
    assert.ok(ui.includes('"rv-set-note": [' + JSON.stringify(EN) + ", " + JSON.stringify(ZH) + "]"), f);
  }
  for (const f of ["index.html", "docs/demo/index.html"]) {
    const html = fs.readFileSync(path.join(root, f), "utf8");
    const box = html.slice(html.indexOf('id="setReview"'), html.indexOf('id="setSlices"'));
    assert.ok(box.includes('<span class="settings-hint" data-i18n="own.rv-set-note">' + EN + "</span>"), f);
    assert.ok(!/收不回|检查这 10 秒/.test(box), f + ": the replaced sentence is gone");
  }
});

test("Settings › 审片发送: every other string of the section is JJ's (#347), English added and the Chinese unchanged, on the language switch", () => {
  const root = path.join(__dirname, "..");
  const T = {
    "rv-set-title": ["Send for review", "审片发送"],
    "rv-set-enabled": ["Send the clip to openrouter.ai when reviewing", "审片时把片段发到 openrouter.ai"],
    "rv-set-key-ph": ["OpenRouter key (used only for review)", "OpenRouter 密钥（只用于审片）"],
    "rv-set-key-save": ["Save key", "保存密钥"],
    "rv-set-key-clear": ["Delete key", "删除密钥"],
    "rv-key-saved": ["Key saved", "已保存密钥"],
    "rv-key-none": ["No key yet", "还没有密钥"],
    "rv-key-unsealed": ["This computer can't store the key encrypted, so it was not saved.", "这台电脑不能加密保存密钥，没有保存"],
    "rv-key-bad": ["The key format is not valid, so it was not saved.", "密钥格式不对，没有保存"]
  };
  for (const f of ["ui-preferences.js", "docs/demo/ui-preferences.js"]) {
    const ui = fs.readFileSync(path.join(root, f), "utf8");
    for (const [k, [en, zh]] of Object.entries(T)) assert.ok(ui.includes('"' + k + '": [' + JSON.stringify(en) + ", " + JSON.stringify(zh) + "]"), f + " " + k);
  }
  for (const f of ["index.html", "docs/demo/index.html"]) {
    const html = fs.readFileSync(path.join(root, f), "utf8");
    const box = html.slice(html.indexOf('id="setReview"'), html.indexOf('id="setSlices"'));
    for (const k of ["rv-set-title", "rv-set-enabled", "rv-set-key-save", "rv-set-key-clear"]) assert.ok(box.includes('data-i18n="own.' + k + '">' + T[k][0] + "<"), f + " " + k);
    assert.ok(box.includes('placeholder="' + T["rv-set-key-ph"][0] + '" data-i18n-placeholder="own.rv-set-key-ph"'), f);
    assert.ok(!/[一-鿿]/.test(box.replace(/<!--[\s\S]*?-->/g, "")), f + ": no Chinese left hard-coded in the section");
  }
  for (const f of ["app/app.js", "docs/demo/app/app.js"]) {
    const app = fs.readFileSync(path.join(root, f), "utf8");
    const i = app.indexOf('const box=$("setReview")'), block = app.slice(i, app.indexOf("void show();", i));
    assert.ok(i > 0 && !/[一-鿿]/.test(block), f + ": the key states come from uiText, none hard-coded");
    for (const k of ["rv-key-saved", "rv-key-none", "rv-key-unsealed", "rv-key-bad"]) assert.ok(block.includes('"own.' + k + '"'), f + " " + k);
  }
});

test("reverse: the review key is used only for review — only review-sender opens it, and only to send a review request", () => {
  const root = path.join(__dirname, "..");
  const skip = new Set(["node_modules", ".git", "test", "dist", "out", "vendor", "docs", ".cindy-worktrees"]);
  const files = [];
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (e.isDirectory()) { if (!skip.has(e.name)) walk(path.join(d, e.name)); }
    else if (/\.(c?js|mjs|html)$/.test(e.name)) files.push(path.join(d, e.name)); } };
  walk(root);
  const sender = path.join(root, "desktop", "review-sender.js");
  for (const f of files) {
    if (f === sender) continue;
    const t = fs.readFileSync(f, "utf8");
    assert.ok(!t.includes("review-openrouter-key"), path.relative(root, f) + " names the review key file");
    assert.ok(!/\bkey\.open\(/.test(t) && !/reviewSender\.key\.open/.test(t), path.relative(root, f) + " opens the review key");
  }
  const s = fs.readFileSync(sender, "utf8");
  assert.equal((s.match(/\bkey\.open\(\)/g) || []).length, 1, "review-sender opens the key in one place");
  const send = s.slice(s.indexOf("async send("));
  assert.ok(send.indexOf("key.open()") > 0 && send.indexOf("key.open()") < send.indexOf("OR.post("), "the one place is the review send, right before the one review request");
  /* the page can only ask whether a key is saved, store one or delete it — never read it */
  const preload = fs.readFileSync(path.join(root, "desktop", "view-preload.js"), "utf8");
  assert.ok(!/montclip:review:key(Get|Open|Read)/.test(preload));
  assert.deepEqual([...preload.matchAll(/montclip:review:(key\w+)/g)].map((m) => m[1]).sort(), ["keyClear", "keySet", "keyStatus"]);
  const { createReviewSender } = require("../desktop/review-sender");
  const tmpd = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "rk-"));
  try {
    const st = createReviewSender({ root: tmpd, safeStorage: { isEncryptionAvailable: () => true, encryptString: (v) => Buffer.from("x" + v), decryptString: (b) => b.toString().slice(1) }, env: {}, isPackaged: true, smoke: false });
    st.key.set("sk-or-v1-sentinel-key-0123456789abcdef");
    assert.deepEqual(Object.keys(st.key.status()).sort(), ["configured", "ok"], "status says only whether one is saved");
  } finally { fs.rmSync(tmpd, { recursive: true, force: true }); }
});

/* ---- doors an agent must not have (reverse tests) ---- */
test("reverse: no HTTP route, MCP tool, page bridge or preload can set DEST_CONFIRMED, AGENT_SEND, the review switch or key from an agent", () => {
  const root = path.join(__dirname, "..");
  const read = (f) => fs.readFileSync(path.join(root, f), "utf8");
  const server = read("server/server.js"), mcp = read("server/mcp-server.js"), preload = read("desktop/view-preload.js");
  /* the server only reads them from its own environment */
  for (const name of ["MONTCLIP_REVIEW_DEST_CONFIRMED", "MONTCLIP_REVIEW_AGENT_SEND"]) {
    assert.ok(!new RegExp("process\\.env\\." + name + "\\s*=(?!=)").test(server), `server.js never assigns ${name}`);
    assert.ok(!mcp.includes(name + '"') || !/inputSchema[\s\S]{0,400}MONTCLIP_REVIEW_/.test(mcp), `no MCP tool takes ${name}`);
    assert.ok(!preload.includes(name), `the page bridge has no ${name}`);
  }
  /* the review routes: no settings endpoint; send and unblock need the main process's secret */
  const routes = [...server.matchAll(/action === "([a-z/]+)"/g)].map((m) => m[1]);
  for (const bad of ["config", "settings", "confirm", "destination", "agent-send", "switch", "key"]) assert.ok(!routes.includes(bad), `no /api/review/${bad}`);
  assert.match(server, /action === "send"[\s\S]{0,400}isMainReq\(req\)/);
  assert.match(server, /action === "unblock"[\s\S]{0,300}isMainReq\(req\)/);
  /* the switch reaches the server only from the main process (parentPort), never over HTTP */
  assert.match(server, /data\?\.type === "review-switch"/);
  assert.ok(!/reviewSendSwitch\s*=\s*(?:body|req|q\()/.test(server));
  /* the page's review bridge passes only an id, a token, a hash and a boolean */
  assert.match(preload, /send:v=>ipcRenderer\.invoke\('montclip:review:send',\{reviewId:String\(v\?\.reviewId\|\|''\),token:String\(v\?\.token\|\|''\),hash:String\(v\?\.hash\|\|''\),assistant:v\?\.assistant===true\}\)/);
  /* the agy path is gone */
  for (const f of ["server/video-bridge.js", "server/review-service.js", "server/server.js"]) assert.ok(!/findAgy|runAgy|MONTCLIP_AGY_BIN/.test(read(f)), f);
  assert.equal(fs.existsSync(path.join(root, "test", "fixtures", "fake-agy.js")), false);
});

test("reverse: whatever an agent puts in a prepare request, it cannot confirm the destination or turn sending on", (t) => {
  const { createReviewStore } = require("../server/review-store");
  const { createReviewService } = require("../server/review-service");
  const d = tmp(t);
  const mk = (env, on) => createReviewService({ store: createReviewStore({ dir: d }), bridge: VB, readProject: () => ({}), activeProject: () => "p1",
    requestSample: () => { throw new Error("must not render"); }, getJob: () => null, cancelJob() { }, sampleFile: () => null, ffmpeg: () => "x", ffprobe: () => "x",
    env, sender: async () => ({ ok: true }), sendSwitch: () => on, agentSendEnabled: () => env.MONTCLIP_REVIEW_AGENT_SEND === "1" });
  const req = { start: 0, end: 5, destConfirmed: true, MONTCLIP_REVIEW_DEST_CONFIRMED: "openrouter.ai", agentSend: true, MONTCLIP_REVIEW_AGENT_SEND: "1" };
  assert.throws(() => mk({}, false).prepare(req), (e) => e.code === "REVIEW_SEND_OFF");
  assert.throws(() => mk({}, true).prepare(req), (e) => e.code === "DESTINATION_UNVERIFIED");
  assert.throws(() => mk({ MONTCLIP_REVIEW_DEST_CONFIRMED: "daily-cloudcode-pa.googleapis.com" }, true).prepare(req), (e) => e.code === "DESTINATION_UNVERIFIED", "the old address confirms nothing");
  assert.throws(() => mk({ MONTCLIP_REVIEW_DEST_CONFIRMED: "openrouter.ai" }, true).prepare({ ...req, agent: true, autoSend: true }), (e) => e.code === "AGENT_SEND_OFF" || e.code === "CLICK_REQUIRED");
});

/* ---- sentinels ---- */
test("sentinel: a synthetic viewer nickname the model quotes is shown for this check but never written to the record on disk", (t) => {
  const { createReviewStore } = require("../server/review-store");
  const d = tmp(t), store = createReviewStore({ dir: d });
  const v = VB.parseVerdict(JSON.stringify({ verdict: "issues", summary: `弹幕里 ${NICK} 说了话`, windowDigest: NICK, dimensions: { fact: { state: "issues", reason: NICK }, subtitle: { state: "passed", reason: "" }, pacing: { state: "passed", reason: "" }, packaging: { state: "passed", reason: "" } },
    findings: [{ t: 2, type: "speaker_swapped", dimension: "fact", text: `${NICK} 的名牌`, suggestion: NICK }] }), { durationSec: 10, sentAudio: true, usage: { prompt_tokens_details: { audio_tokens: 9 } } });
  const rec = store.add("p1", { reviewId: "r_1", status: "issues", range: { start: 0, end: 10 }, findings: v.findings.map((f, id) => ({ id, ...f })), summary: v.summary, windowDigest: v.windowDigest, dimensions: v.dimensions, states: v.states });
  assert.ok(JSON.stringify(rec).includes(NICK), "shown for this check");
  for (const f of fs.readdirSync(d)) assert.ok(!fs.readFileSync(path.join(d, f), "utf8").includes(NICK), "never on disk: " + f);
});

/* the synthetic fixture for the V23 first send: the pass-phrase is ONLY in the sound. Here the stand-in "hears" it by reading the WAV that
   went with the request; the mp4 that went has no sound stream at all. Whether the real model hears it is V23's job (not run here). */
const FF = require("../server/ffmpeg-path");
let HAS_FFMPEG = false;
try { HAS_FFMPEG = spawnSync(FF.path("ffmpeg"), ["-version"], { stdio: "ignore" }).status === 0; } catch { }
test("fixture: a pass-phrase only in the sound — the mp4 that goes has no sound, the WAV is 48 kHz stereo and carries it", { skip: HAS_FFMPEG ? false : "needs ffmpeg" }, async (t) => {
  const d = tmp(t), src = path.join(d, "fixture.mp4");
  /* the pass-phrase: three tones (880, 1320, 660 Hz) in the sound only; the picture is a test pattern with no text */
  execFileSync(FF.path("ffmpeg"), ["-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=size=640x360:rate=25:duration=6",
    "-f", "lavfi", "-i", "sine=f=880:duration=2", "-f", "lavfi", "-i", "sine=f=1320:duration=2", "-f", "lavfi", "-i", "sine=f=660:duration=2",
    "-filter_complex", "[1:a][2:a][3:a]concat=n=3:v=0:a=1[a]", "-map", "0:v", "-map", "[a]", "-c:v", "mpeg4", "-c:a", "aac", "-shortest", src], { windowsHide: true });
  const staged = await VB.stage({ ffmpeg: FF.path("ffmpeg"), ffprobe: FF.path("ffprobe"), sampleFile: src, tmpRoot: d });
  t.after(() => VB.rmForce(staged.dir));
  const probe = JSON.parse(execFileSync(FF.path("ffprobe"), ["-v", "error", "-show_streams", "-of", "json", staged.video.file], { encoding: "utf8" }));
  assert.deepEqual(probe.streams.map((s) => s.codec_type), ["video"], "the mp4 that goes carries no sound");
  const wav = fs.readFileSync(staged.audio.file);
  assert.equal(wav.toString("ascii", 0, 4), "RIFF"); assert.equal(wav.readUInt16LE(22), 2, "stereo"); assert.equal(wav.readUInt32LE(24), 48000, "48 kHz");
  /* the stand-in model: it can only know the phrase from the WAV in the request (zero crossings per second of each 2 s third) */
  const heard = [];
  const send = async (body) => {
    const req = JSON.parse(body.toString("utf8"));
    const parts = req.messages[0].content;
    assert.equal(parts.filter((p) => p.type === "input_audio").length, 1);
    const pcm = Buffer.from(parts.find((p) => p.type === "input_audio").input_audio.data, "base64");
    const data = pcm.subarray(44), frames = Math.floor(data.length / 4);
    for (let k = 0; k < 3; k++) {
      let z = 0, prev = 0;
      for (let i = Math.floor(frames * k / 3) + 4800; i < Math.floor(frames * (k + 1) / 3) - 4800; i++) { const s = data.readInt16LE(i * 4); if ((s >= 0) !== (prev >= 0)) z++; prev = s; }
      heard.push(Math.round(z / 2 / ((frames / 3 - 9600) / 48000) / 220) * 220);
    }
    return { ok: true, receipt: { text: JSON.stringify({ verdict: "pass", summary: "口令 " + heard.join("-"), windowDigest: "", findings: [],
      dimensions: { fact: { state: "passed" }, subtitle: { state: "passed" }, pacing: { state: "passed" }, packaging: { state: "passed" } } }),
      provider: "Google AI Studio", model: "google/gemini-4-carbon", usage: { prompt_tokens_details: { audio_tokens: 150 } } } };
  };
  const r = await VB.checkSample({ staged, offset: 0, rangeStart: 0, send });
  assert.deepEqual(heard, [880, 1320, 660], "the phrase is in the WAV that went");
  assert.equal(r.audioVerified, true);
  assert.equal(r.status, "passed");
  assert.match(r.summary, /880-1320-660/);
});
