/* QQ's ruling on #219: inside Cindy (?host=cindy) the built-in assistant sends nothing, and its approval card — which
   could not be seen there — is 「不同意」 at once. Two layers:
   1. the assistant sends nothing: its pane is not mounted, so the assistant service (the desktop bridge: key, AI service,
      messages) is never called, its mode and sound facts are not read; the desktop main process refuses its requests
      from such a page too, and its preload gives such a page no assistant service;
   2. agentApprovals.ask() inside Cindy settles 「不同意」 at once with code HOST_EMBEDDED: no card, nothing waits, nothing
      runs. Her line about it is own.ap-embedded-declined, JJ's words (2026-11-07), word for word.
   Outside Cindy the approval card is #120's, unchanged (test/approval-card.test.js). The lyrics card (#164) is the page's
   own dialog and still shows inside Cindy. The page checks run in a real headless browser (test/browser-contrast.js),
   with stand-ins for the desktop bridges that count every call; skipped where there is none. */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { ROOT, makeDataDir, startServer, seedProject } = require("./helpers");
const Approval = require("../agent-approval");
const Host = require("../host-embed");
const View = require("../ui-preferences");
const { withPage } = require("./browser-contrast");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
const browser = (() => { try { return require("../server/export-jobs").findBrowser(); } catch { return null; } })();
const skip = !browser ? "no Chrome / Edge to run the page in" : typeof WebSocket !== "function" ? "needs Node's WebSocket (Node 22)" : false;

const decision = (o = {}) => ({ ticket: "t1", choices: ["once", "session", "deny"], label: "保留所选范围", risk: "undoable", ...o });
const HUNG = Symbol("hung");
const settledNow = (p) => Promise.race([p, new Promise((r) => setImmediate(() => r(HUNG)))]);

test("embedded: ask() is 「不同意」 at once with code HOST_EMBEDDED — no card, nothing waits, no 「只批准这次」 / 「都批准」", async () => {
  let redraws = 0, told = 0;
  const cards = Approval.create({ embedded: () => true, onChange: () => { redraws++; }, onEmbedded: () => { told++; } }), result = {};
  for (const d of [decision(), decision({ choices: ["once", "deny"] }), decision({ risk: "external", target: "openrouter.ai" }), null]) {
    const p = cards.ask(d, { result });
    assert.equal(p.code, "HOST_EMBEDDED");
    assert.equal(p.code, Approval.HOST_EMBEDDED);
    assert.equal(await settledNow(p), "deny", "settled before anything else runs: " + JSON.stringify(d));
  }
  assert.equal(cards.waiting(), false, "nothing waits");
  assert.equal(cards.answer("approval-1", "once"), false, "no card to approve once");
  assert.equal(cards.answer("approval-1", "session"), false, "no card to approve for the chat");
  assert.deepEqual(cards.view(result, (k) => k), [], "no card in the stream");
  assert.equal(redraws, 0);
  assert.equal(told, 4, "each one is told to the editor (her line, once JJ has written it)");
});

test("not embedded: ask() is #120's card — it waits for a button; no HOST_EMBEDDED", async () => {
  for (const cards of [Approval.create(), Approval.create({ embedded: () => false })]) {
    const result = {}, p = cards.ask(decision(), { result });
    assert.equal(p.code, undefined);
    assert.equal(await settledNow(p), HUNG, "waits for her");
    assert.equal(cards.waiting(), true);
    assert.equal(cards.view(result, (k) => k)[0].actions.map((a) => a.id).join(), "once,session,deny");
    assert.equal(cards.answer(cards.view(result, (k) => k)[0].id, "once"), true);
    assert.equal(await p, "once");
  }
});

// JJ定稿 (2026-11-07, via Deja), word for word, punctuation too
const DECLINED = {
  "zh-CN": "这一步没有做，什么都没改。在 Cindy 里用 AI，请直接在 Cindy 的对话里说你想做什么。",
  en: "This step was not done; nothing was changed. In Cindy, ask the AI in Cindy's own chat instead.",
};
test("her line about it: own.ap-embedded-declined, JJ's words exactly, in Chinese", () => {
  assert.equal(View.t("zh-CN", "own.ap-embedded-declined"), DECLINED["zh-CN"]);
});
test("her line about it: own.ap-embedded-declined, JJ's words exactly, in English", () => {
  assert.equal(View.t("en", "own.ap-embedded-declined"), DECLINED.en);
});
test("her line names none of the code's words: agentApprovals, embedded, 内置, 嵌入", () => {
  for (const lang of ["zh-CN", "en"]) {
    const line = View.t(lang, "own.ap-embedded-declined");
    assert.ok(line.length > 0, lang);
    for (const word of ["agentApprovals", "embedded", "内置", "嵌入"]) assert.ok(!line.toLowerCase().includes(word.toLowerCase()), `${lang}: ${word}`);
  }
});
test("the editor shows her line when ask() is denied inside Cindy — held like a 〔撤销〕 toast (VV, #221)", () => {
  const app = read("app.js");
  assert.match(app, /embedded:\(\)=>agentEmbedded,onEmbedded:\(\)=>toastHeld\(uiText\('own\.ap-embedded-declined'\)\)\}\);/);
  assert.ok(Number(app.match(/const UNDO_TOAST_MS = (\d+);/)[1]) >= 8000, "it stays 8 s or more");
  const held = app.slice(app.indexOf("function toastHeld("), app.indexOf("function toast(msg)"));
  assert.match(held, /toastHold = holdToast\(els\.toast, hideHeldToast\)/, "the pointer on it stops the time");
  assert.match(held, /toastHold\.start\(\)/);
  assert.match(read("style.css"), /#toast\.held \{ pointer-events: auto; \}/, "the pointer can rest on it");
});

test("the desktop: no assistant service for an embedded page, and the main process refuses its requests", () => {
  assert.equal(Host.embeddedUrl("http://127.0.0.1:5000/?host=cindy&theme=light"), true);
  for (const u of ["http://127.0.0.1:5000/", "http://127.0.0.1:5000/?host=evil", "not a url", "", null, undefined])
    assert.equal(Host.embeddedUrl(u), false, String(u));
  const main = read("desktop/main.js");
  const guard = main.indexOf("if(HostEmbed.embeddedUrl(event.senderFrame&&event.senderFrame.url))return {ok:false,code:'HOST_EMBEDDED'};");
  assert.ok(guard > main.indexOf("ipcMain.handle('montclip:agent:'+operation") && guard < main.indexOf("return agentService[operation](value);"),
    "every assistant operation (get, configure, send, …) checks first");
  assert.match(read("desktop/view-preload.js"), /if\(new URLSearchParams\(location\.search\)\.get\('host'\)!=='cindy'\)contextBridge\.exposeInMainWorld\('montclipAgentService'/);
});

/* The desktop bridges, as stand-ins that count every call. The service answers as a configured one would, so a pane
   that is mounted reads it at once. */
const STUBS = String.raw`(() => {
  const calls = window.__mcCalls = [], fetches = window.__mcFetches = [];
  const counted = (name, answer) => new Proxy({}, { get: (_, k) => typeof k !== "string" || k === "then" ? undefined : (...a) => { calls.push(name + "." + k); return answer(k, a); } });
  window.montclipAgentService = counted("service", () => Promise.resolve({ ok: true, configured: true, provider: "openai", model: "m", enabled: true, accepted: true }));
  window.montclipAgentPolicy = counted("policy", (k) => Promise.resolve(k === "decide" ? { ok: true, action: "ask", ticket: "t", choices: ["once", "deny"], label: "x" } : { ok: true, mode: "manual" }));
  window.montclipAgentSessions = counted("sessions", () => ({ ok: true, value: null }));
  window.montclipPaneSettings = counted("paneSettings", () => ({ ok: true, value: { width: 340 } }));
  const f = window.fetch; window.fetch = (...a) => { fetches.push(String(a[0] && a[0].url || a[0])); return f.apply(window, a); };
})()`;
const project = seedProject({ name: "嵌入", revision: 1,
  media: [{ id: "m1", name: "rec.mp4", kind: "video", src: "/media/rec.mp4", duration: 7200, width: 1920, height: 1080, fps: 30, codec: "h264" }],
  clips: [{ id: "v1", mediaId: "m1", kind: "video", track: "V1", start: 0, in: 0, duration: 30 }] });
/* What a streamer (or a stray path) could do to reach the assistant inside Cindy, all at once. */
const POKE = String.raw`(async () => {
  document.getElementById("mcAssistant").click(); setSideTab("assistant"); setSelection(["v1"]);
  mcAgent.render(); mcAgent.sync(); await agentSoundFacts();
  document.getElementById("btnSettings")?.click(); document.getElementById("btnCloseSettings")?.click();
  await new Promise((r) => setTimeout(r, 1500));   // the pane's 500 ms sync runs a few times
  return true;
})()`;

test("inside Cindy the built-in assistant sends nothing: no bridge call, no request — the lyrics card still shows", { skip, timeout: 120000 }, async (t) => {
  const { base } = await startServer(t, makeDataDir(t, project), { FABLECUT_NO_FS_WATCH: "1" });
  const out = await withPage({ browser, url: base + "/?host=cindy&theme=light", settleMs: 1500, init: STUBS }, async ({ evaluate, requests }) => {
    const before = requests.length, fetchesBefore = await evaluate("window.__mcFetches.length");
    await evaluate(POKE);
    const r = {
      embedded: await evaluate("MontClipHost.embedded === true && agentEmbedded === true"),
      calls: await evaluate("window.__mcCalls.filter((c) => !c.startsWith('policy.decide') && !c.startsWith('policy.answer'))"),
      newRequests: requests.slice(before), newFetches: await evaluate(`window.__mcFetches.slice(${fetchesBefore})`),
      foreign: requests.filter((u) => !u.startsWith(base) && !u.startsWith("data:") && !u.startsWith("blob:")),
      assistantFetches: await evaluate("window.__mcFetches.filter((u) => /\\/api\\/(signals|songs)/.test(u))"),
      paneMounted: await evaluate("document.getElementById('mcAgentContent').childElementCount"),
      panelHidden: await evaluate("getComputedStyle(document.getElementById('mcAssistantPanel')).display === 'none'"),
    };
    // the fallback: ask() in the page settles at once, with HOST_EMBEDDED; nothing waits
    r.ask = await evaluate(`(async () => { const p = askAgentApproval({ ticket: "t", choices: ["once", "session", "deny"], label: "x" }, {});
      const v = await Promise.race([p, new Promise((res) => setTimeout(() => res("HUNG"), 200))]);
      return { v, code: p.code, waiting: agentApprovals.waiting(), line: document.getElementById("toast").textContent, lang: mcView.get().language }; })()`);
    // her line stays past a plain toast's 3.2 s, and while the pointer is on it, past UNDO_TOAST_MS too (VV, #221)
    r.held = await evaluate(`(async () => { const el = document.getElementById("toast"), on = () => el.classList.contains("show");
      await new Promise((res) => setTimeout(res, 3600)); const at36 = on();
      el.dispatchEvent(new MouseEvent("mouseenter")); await new Promise((res) => setTimeout(res, UNDO_TOAST_MS - 3600 + 600)); const hovered = on();
      el.dispatchEvent(new MouseEvent("mouseleave")); return { at36, hovered, pointer: getComputedStyle(el).pointerEvents }; })()`);
    // the lyrics card (#164): its own <dialog>, shown and answered as before
    r.lyrics = await evaluate(`(async () => { const p = lyricsCard({ k: 1, n: 2, m: 1, lines: [{ text: "第一句", matched: true }, { text: "第二句", matched: false }] }, null);
      await new Promise((res) => setTimeout(res, 100));
      const d = document.querySelector("dialog.lt-card"), shown = !!d && d.open && getComputedStyle(d).display !== "none" && d.getBoundingClientRect().height > 0;
      const lines = d ? d.querySelectorAll("[data-lt-lines] li").length : 0;
      d?.querySelector('[data-lt-choice="place"]')?.click();
      return { shown, lines, answer: await p }; })()`);
    return r;
  });
  assert.equal(out.embedded, true);
  t.diagnostic(`embedded: ${out.calls.length} bridge calls, ${out.newRequests.length} requests and ${out.newFetches.length} fetches while poking the assistant, ${out.foreign.length} to another origin, ${out.assistantFetches.length} sound-fact fetches`);
  assert.deepEqual(out.calls, [], "the assistant's bridges: no key read, no service, no message, no mode");
  assert.deepEqual(out.newRequests, [], "no request at all while the assistant is poked");
  assert.deepEqual(out.newFetches, [], "no fetch while the assistant is poked");
  assert.deepEqual(out.foreign, [], "nothing to another origin, from load on");
  assert.deepEqual(out.assistantFetches, [], "no sound facts read");
  assert.equal(out.paneMounted, 0, "the pane is not mounted");
  assert.equal(out.panelHidden, true);
  assert.deepEqual([out.ask.v, out.ask.code, out.ask.waiting], ["deny", "HOST_EMBEDDED", false]);
  assert.deepEqual(out.held, { at36: true, hovered: true, pointer: "auto" }, "her line: still there at 3.6 s, and while the pointer is on it");
  assert.equal(out.ask.line, DECLINED[out.ask.lang === "en" ? "en" : "zh-CN"], "her line is shown, in the editor's language");
  assert.deepEqual(out.lyrics, { shown: true, lines: 2, answer: "place" });
});

test("outside Cindy (the control): the same stand-ins are read — the pane is mounted and its card waits as in #120", { skip, timeout: 120000 }, async (t) => {
  const { base } = await startServer(t, makeDataDir(t, project), { FABLECUT_NO_FS_WATCH: "1" });
  const out = await withPage({ browser, url: base + "/", settleMs: 1500, init: STUBS }, async ({ evaluate }) => ({
    embedded: await evaluate("typeof MontClipHost !== 'undefined' && MontClipHost.embedded"),
    calls: await evaluate("window.__mcCalls"),
    paneMounted: await evaluate("document.getElementById('mcAgentContent').childElementCount"),
    ask: await evaluate(`(async () => { const p = askAgentApproval({ ticket: "t", choices: ["once", "session", "deny"], label: "x" }, {});
      const v = await Promise.race([p, new Promise((res) => setTimeout(() => res("HUNG"), 200))]);
      const waiting = agentApprovals.waiting(); agentApprovals.leave();
      return { v, code: p.code ?? null, waiting, after: await p }; })()`),
  }));
  t.diagnostic(`not embedded: ${out.calls.length} bridge calls (${[...new Set(out.calls)].join(", ")})`);
  assert.equal(out.embedded, false);
  assert.ok(out.calls.some((c) => c.startsWith("service.")), "the stand-in service is read here, so the embedded 0 means something");
  assert.ok(out.paneMounted > 0);
  assert.deepEqual(out.ask, { v: "HUNG", code: null, waiting: true, after: "deny" });
});
