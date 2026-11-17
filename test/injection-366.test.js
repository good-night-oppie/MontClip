"use strict";
/* #366 part A, against synthetic hostile files only (nothing here is a real project or a real streamer's file):
   - load validation (②): a project's sizes, times and track ids, and a template's tracks, are checked before anything is drawn;
   - in a real headless browser (Chrome / Edge; skipped where there is none), a project whose values carry markup — a keyframe
     name (S6, drawn the moment the project loads), a colour written into an attribute (S7), the text box (S1), a font (S2), a
     composition's size and length (S5), a track id (S3 / S9) — draws as text: no element of its own, no script. This branch has no
     page policy (that is part B), so an unescaped value would really run here. */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const { makeDataDir, startServer, seedProject } = require("./helpers");
const ROOT = path.join(__dirname, "..");

/* sanitizeLoaded() from app.js, run on its own */
function loader() {
  const src = fs.readFileSync(path.join(ROOT, "app/app.js"), "utf8");
  const a = src.indexOf("const LOAD_TRACK_ID"), b = src.indexOf("function applyProject(data, opts = {}) {");
  assert.ok(a > 0 && b > a, "the load checks sit right above applyProject");
  assert.match(src.slice(b, b + 120), /function applyProject\(data, opts = \{\}\) \{\s*data = sanitizeLoaded\(data\);/, "applyProject checks first");
  const ctx = {}; vm.createContext(ctx); vm.runInContext(src.slice(a, b) + "\nthis.sanitizeLoaded = sanitizeLoaded;", ctx);
  return ctx.sanitizeLoaded;
}

test("② a project's sizes, times, track ids and compositions are checked as it loads", () => {
  const load = loader();
  const evil = '"><img src=x onerror=alert(1)>';
  const out = load({
    width: evil, height: "720", tracks: [{ id: "V1", kind: "video" }, { id: evil, kind: "audio" }, { id: "A2", kind: "audio" }],
    clips: [{ id: "a", kind: "video", track: evil, start: evil, in: "2", duration: "x" }, { id: "b", kind: "audio", track: "A2<b>", start: 1, in: 0, duration: 3 }, null],
    comps: [{ id: evil, width: 100, height: 100, duration: 1, clips: [] }, { id: "ok", width: evil, height: 1e9, duration: evil, tracks: [{ id: "V9<i>" }, { id: "V2" }], clips: [{ id: "c", kind: "text", track: "V2", start: 0, duration: 1 }] }],
  });
  assert.equal(out.width, 1280); assert.equal(out.height, 720);
  assert.deepEqual(out.tracks.map((t) => t.id), ["V1", "A2"]);
  assert.deepEqual(out.clips.map((c) => [c.track, c.start, c.in, c.duration]), [["V1", 0, 2, 1], ["A1", 1, 0, 3]]);
  assert.equal(out.comps.length, 1); assert.equal(out.comps[0].id, "ok");
  assert.deepEqual([out.comps[0].width, out.comps[0].height, out.comps[0].duration], [1280, 720, 5]);
  assert.deepEqual(out.comps[0].tracks.map((t) => t.id), ["V2"]);
  // a sound project is left as it was
  const fine = { width: 1920, height: 1080, clips: [{ id: "a", kind: "video", track: "V1", start: 0, in: 1.5, duration: 4 }], tracks: [{ id: "V1", kind: "video" }] };
  assert.deepEqual(JSON.parse(JSON.stringify(load(fine))), fine);
});

test("② a template whose clip sits on a track id that is not V<n> / A<n> is refused; its track list keeps only real ids", () => {
  const Tpl = require("../templates");
  const base = { name: "T", width: 640, height: 360, duration: 2, clips: [{ id: "t", kind: "text", track: "V1", start: 0, duration: 2, props: { text: "x" } }], fields: [] };
  assert.ok(Tpl.normalizeTemplate(base));
  assert.equal(Tpl.normalizeTemplate({ ...base, clips: [{ ...base.clips[0], track: 'V1"><img src=x onerror=1>' }] }), null);
  assert.throws(() => Tpl.normalizeTemplate({ ...base, clips: [{ ...base.clips[0], track: "X1" }] }, true), /track is V1/);
  const t = Tpl.normalizeTemplate({ ...base, tracks: [{ id: "V1", kind: "video" }, { id: "<b>", kind: "video" }] });
  assert.deepEqual(t.tracks.map((x) => x.id), ["V1"]);
});

/* ── a real browser ── */
const browser = (() => { try { return require("../server/export-jobs").findBrowser(); } catch { return null; } })();
const skip = !browser ? "no Chrome / Edge to run the page in" : typeof WebSocket !== "function" ? "needs Node's WebSocket (Node 22)" : false;
const PWN = (n) => `"><img src=x data-pwn="${n}" onerror="window.__pwn=(window.__pwn||[]).concat('${n}')"><b data-pwn="${n}">`;
const hostile = seedProject({
  name: "hostile " + PWN("name"), revision: 1, width: 1280, height: 720,
  media: [], tracks: [{ id: "V2", kind: "video" }, { id: "V1", kind: "video" }, { id: "A1", kind: "audio" }],
  clips: [
    { id: "t1", kind: "text", mediaId: null, track: "V1", start: 0, in: 0, duration: 6, name: "title " + PWN("clipname"),
      props: { text: "hello " + PWN("text"), font: "Anton" + PWN("font"), color: "#ffffff" + PWN("color"), strokeColor: PWN("stroke"), bgColor: PWN("bg"), glowColor: PWN("glow"), highlightColor: PWN("hl") },
      keyframes: { ["opacity" + PWN("kfkey")]: [{ t: 1, v: 0.5 }, { t: 2, v: 1 }], x: [{ t: 1, v: 0 }, { t: 3, v: 100 }] } },
    { id: "cc", kind: "comp", compId: "c1", mediaId: null, track: "V2", start: 0, in: 0, duration: 4 },
  ],
  comps: [{ id: "c1", name: "comp " + PWN("compname"), width: "640" + PWN("cw"), height: 360, duration: "4" + PWN("cd"), clips: [] }],
});
test("in a real browser, a project whose values carry markup draws them as text — on load (S6), in the inspector (S1, S2, S7), the bin (S5) and the mixer", { skip, timeout: 120000 }, async (t) => {
  const { base } = await startServer(t, makeDataDir(t, hostile), { FABLECUT_NO_FS_WATCH: "1" });
  const { withPage } = require("./browser-contrast");
  const out = await withPage({ browser, url: base + "/", settleMs: 1500 }, async ({ evaluate }) => {
    const seen = {};
    const look = async (k) => { seen[k] = await evaluate(`({ el: document.querySelectorAll("[data-pwn]").length, ran: (window.__pwn || []).slice(), drawn: document.querySelectorAll(".track-head").length })`); };
    await look("load");                                                           // S6: the keyframe marks are drawn now
    await evaluate(`setSelection(["t1"]); true`); await new Promise((r) => setTimeout(r, 600)); await look("inspector");
    await evaluate(`setSideTab("mixer"); true`); await new Promise((r) => setTimeout(r, 600)); await look("mixer");
    await evaluate(`setSideTab("inspector"); setSelection(["cc"]); true`); await new Promise((r) => setTimeout(r, 600)); await look("comp");
    seen.kfTitle = await evaluate(`[...document.querySelectorAll(".clip-kf")].map((e) => e.title).join("|")`);
    return seen;
  });
  assert.ok(out.load.drawn > 0, "the editor drew the hostile project");
  assert.match(out.kfTitle, /data-pwn="kfkey"/, "S6: the keyframe name is shown as text in its mark's title");
  for (const k of ["load", "inspector", "mixer", "comp"]) {
    assert.equal(out[k].el, 0, `${k}: no element made from a project value`);
    assert.deepEqual(out[k].ran, [], `${k}: no script ran`);
  }
});
