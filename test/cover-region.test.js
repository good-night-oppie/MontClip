/* Redactions, 打码 (props.redactions, fablecut_blur_region — P4 of the 2026-11-05 europa trial, JJ's review):
   an area of a clip's picture drawn over with an opaque black block, that follows the clip. Team rule (#186): a
   redaction is an opaque block, never a mosaic or a blur — those can leave text readable, and #163 had both.
     · validation and the setRedaction / removeRedaction ops, the agent tool, locks;
     · pixels, on both render paths (the fablecut_frame still and a real Fast export): a striped source,
       a cover on a clip pushed in with keyframes, checked at the push's start, middle and end; a cover on
       a cropped clip (same coordinates as crop and masks: 0…1 of the clip's original frame, x, y the
       top-left corner). Where the cover is, the stripes are gone (flat); everywhere else they remain.
   The pixel test is in render-geometry.test.js (one headless browser at a time keeps the suite steady). */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const M = require("../mask.js");
const { makeDataDir, readProject, seedProject, startMcp } = require("./helpers");

test("normalizeCover: mask coordinates (centre, fractions of the picture), defaults, strict errors", () => {
  assert.deepEqual(M.normalizeCover({ x: 0.6, y: 0.1, w: 0.3, h: 0.4 }), { x: 0.6, y: 0.1, w: 0.3, h: 0.4 });
  assert.deepEqual(M.normalizeCover({ x: 0.9, y: 0.8, w: 0.3, h: 0.3, name: " names " }),
    { x: 0.9, y: 0.8, w: 0.3, h: 0.3, name: "names" }, "as given: the part past the picture's edge is not drawn");
  // an opaque block, never a mosaic or a blur (#186): an agent asking for one is told so…
  assert.throws(() => M.normalizeCover({ x: 0, y: 0, w: 0.2, h: 0.2, style: "blur" }, true), /opaque block.*no style/);
  assert.throws(() => M.normalizeCover({ x: 0, y: 0, w: 0.2, h: 0.2, style: "mosaic" }, true), /opaque block.*no style/);
  assert.throws(() => M.normalizeCover({ x: 0, y: 0, w: 0.2, h: 0.2, strength: 60 }, true), /opaque block.*no .*strength/);
  // …but one saved by an earlier build of this branch with style / strength is still drawn — as a block — never dropped
  assert.deepEqual(M.normalizeCovers([{ x: 0.5, y: 0.5, w: 0.2, h: 0.2, style: "blur", strength: 20 }]), [{ id: 1, x: 0.5, y: 0.5, w: 0.2, h: 0.2 }]);
  assert.equal(M.COVER_STYLES, undefined, "no styles to pick from");
  assert.equal(M.coverGrain, undefined, "no mosaic cells or blur radius any more");
  assert.throws(() => M.normalizeCover({ x: -0.1, y: 0, w: 0.2, h: 0.2 }, true), /x, y \(its centre\) must be 0…1/);
  assert.throws(() => M.normalizeCover({ x: 0.1, y: 0.1, w: 0.2 }, true), /\.h must be a number/);
  assert.throws(() => M.normalizeCover({ x: 1.2, y: 0.1, w: 0.2, h: 0.2 }, true), /must be 0…1/);
  assert.throws(() => M.normalizeCover({ x: 0.2, y: 0.1, w: 0, h: 0.2 }, true), /w, h must be > 0/);
  assert.throws(() => M.normalizeCover({ x: 0, y: 0, w: 0.2, h: 0.2, colour: 1 }, true), /colour: unknown key/);
  assert.equal(M.normalizeCovers([]), null);
  // a time window, seconds from the clip's start
  const win = M.normalizeCover({ x: 0, y: 0, w: 0.2, h: 0.2, from: 1.5, to: 3 });
  assert.deepEqual([win.from, win.to], [1.5, 3]);
  assert.deepEqual([1.4, 1.5, 2.9, 3].map((t) => M.coverActive(win, t)), [false, true, true, false]);
  assert.equal(M.coverActive(M.normalizeCover({ x: 0, y: 0, w: 0.2, h: 0.2, to: 2 }), 0), true, "no from: from the clip's start");
  assert.throws(() => M.normalizeCover({ x: 0, y: 0, w: 0.2, h: 0.2, from: 3, to: 2 }, true), /\.to must be after \.from/);
  assert.throws(() => M.normalizeCover({ x: 0, y: 0, w: 0.2, h: 0.2, from: -1 }, true), /from must be seconds/);
});

test("fablecut_blur_region adds, names, replaces and removes redactions; refuses locked and non-picture clips", async (t) => {
  const dir = makeDataDir(t, seedProject({
    clips: [
      { id: "c_a", mediaId: "m_a", kind: "video", track: "V1", start: 0, in: 0, duration: 5 },
      { id: "c_lock", mediaId: "m_a", kind: "video", track: "V2", start: 0, in: 0, duration: 5, locked: true },
      { id: "c_txt", mediaId: null, kind: "text", track: "V3", start: 0, duration: 5, props: { text: "Hi" } },
    ],
  }));
  const mcp = startMcp(t, dir);
  await mcp.request("initialize", { protocolVersion: "2025-11-25" });
  const redactions = (id) => readProject(dir).clips.find((c) => c.id === id).props?.redactions;
  let r = await mcp.callTool("fablecut_blur_region", { clipId: "c_a", rect: { x: 0.6, y: 0.1, w: 0.3, h: 0.4 }, name: "co-host" });
  assert.equal(r.isError, false, r.text);
  assert.match(r.text, /c_a\.redactions\(1 redaction: #1 "co-host"/);
  assert.match(r.text, /follows the clip/);
  r = await mcp.callTool("fablecut_blur_region", { clipId: "c_a", rect: { x: 0.1, y: 0.8, w: 0.3, h: 0.05 }, style: "blur", strength: 40 });
  assert.equal(r.isError, true, "no blur (#186)"); assert.match(r.text, /opaque block/);
  assert.equal(redactions("c_a").length, 1, "nothing written");
  assert.ok(!("style" in require("../mcp-tools").find((x) => x.name === "fablecut_blur_region").inputSchema.properties), "the tool offers no style");
  assert.ok(!("strength" in require("../mcp-tools").find((x) => x.name === "fablecut_blur_region").inputSchema.properties), "nor a strength");
  r = await mcp.callTool("fablecut_blur_region", { clipId: "c_a", rect: { x: 0.1, y: 0.8, w: 0.3, h: 0.05 } });
  assert.equal(redactions("c_a").length, 2);
  r = await mcp.callTool("fablecut_blur_region", { clipId: "c_a", rect: { x: 0.55, y: 0.1, w: 0.35, h: 0.4 }, name: "co-host" });
  assert.equal(redactions("c_a").length, 2, "a name that is there replaces that area");
  assert.deepEqual(redactions("c_a")[0], { id: 1, x: 0.55, y: 0.1, w: 0.35, h: 0.4, name: "co-host" });
  const compact = await mcp.callTool("fablecut_get_project", { compact: true });
  assert.match(compact.text, /\[2 redactions: #1 "co-host"/);
  r = await mcp.callTool("fablecut_blur_region", { clipId: "c_a", rect: { x: 0.1, y: 0.1, w: 0.1, h: 0.1 }, name: "popup", from: 1, to: 2.5 });
  assert.match(r.text, /"popup" at 0\.1,0\.1 0\.1×0\.1 1–2\.5 s/);
  r = await mcp.callTool("fablecut_blur_region", { clipId: "c_a", remove: "popup" });
  r = await mcp.callTool("fablecut_blur_region", { clipId: "c_a", remove: "co-host" });
  assert.equal(redactions("c_a").length, 1);
  r = await mcp.callTool("fablecut_blur_region", { clipId: "c_a", remove: "all" });
  assert.equal(redactions("c_a"), undefined);
  r = await mcp.callTool("fablecut_blur_region", { clipId: "c_lock", rect: { x: 0, y: 0, w: 0.2, h: 0.2 } });
  assert.equal(r.isError, true); assert.match(r.text, /locked/);
  r = await mcp.callTool("fablecut_blur_region", { clipId: "c_lock", rect: { x: 0, y: 0, w: 0.2, h: 0.2 }, force: true });
  assert.equal(r.isError, false, r.text);
  r = await mcp.callTool("fablecut_blur_region", { clipId: "c_txt", rect: { x: 0, y: 0, w: 0.2, h: 0.2 } });
  assert.equal(r.isError, true); assert.match(r.text, /text clip/);
  r = await mcp.callTool("fablecut_blur_region", { clipId: "c_a", rect: { x: 0, y: 0 } });
  assert.equal(r.isError, true); assert.match(r.text, /x, y its centre/);
  r = await mcp.callTool("fablecut_patch_project", { ops: [{ op: "updateClip", id: "c_a", set: { props: { redactions: [{ x: 0, y: 0, w: 0.2, h: 0.2, style: "blur" }] } } }] });
  assert.equal(r.isError, true, "props.redactions written wholesale is validated too"); assert.match(r.text, /opaque block/);
});


/* VV's review of #163: a redaction is found again (numbered, counted on the clip and in the panel title) and can be
   re-drawn. The real window (menu order, scroll into view, highlight, Esc, one-step undo) is desktop/cover-region-smoke.cjs. */
test("re-drawing a redaction keeps its number, name, time window and on; only the area changes", () => {
  const cv = M.normalizeCover({ id: 3, x: 0.7, y: 0.3, w: 0.3, h: 0.4, name: "co-host", from: 1, to: 4, on: false });
  const next = M.normalizeCover(M.replaceCoverArea(cv, { x: 0.2, y: 0.25, w: 0.2, h: 0.1 }));
  assert.deepEqual(next, { ...cv, x: 0.2, y: 0.25, w: 0.2, h: 0.1 });
  assert.deepEqual(cv, M.normalizeCover({ id: 3, x: 0.7, y: 0.3, w: 0.3, h: 0.4, name: "co-host", from: 1, to: 4, on: false }), "the old one is not touched");
});

test("JJ's final copy (2026-11-05), word for word in both languages; the English says Hide / Hidden, never Cover", () => {
  const V = require("../ui-preferences"), fs = require("node:fs"), path = require("node:path");
  const zh = (k, v) => V.t("zh-CN", "own." + k, v), en = (k, v) => V.t("en", "own." + k, v);
  const JJ = {   // key: [中文, English] — JJ定稿
    "cover-badge": ["打码·3", "Hidden · 3"],
    "cover-section-n": ["打码区域（3）", "Hidden areas (3)"],
    "cover-area-n": ["第 3 块", "Area 3"],
    "cover-redo": ["重新框选", "Redraw"],
    // DRAFT (Deja, 2026-11-06): JJ's sentence without 「样式和强度不变」 — there is no style or strength any more (#186); JJ to sign off
    "cover-redo-tip": ["在画面上给这一块重新拖一个框。按 Esc 取消。", "Drag a new box for this area on the monitor. Press Esc to cancel."],
    "cover-redo-drag": ["在画面上给第 3 块重新拖一个框。按 Esc 取消，原来那块不变。", "Drag a new box for area 3 on the monitor. Press Esc to cancel and keep the old box."],
    "cover-pick-tip": ["在画面上标出这一块", "Show this area's box on the monitor"],
    "cover-remove": ["去掉", "Remove"],
    "cover-area": ["给这块打码", "Hide this area"],   // the right-click menu item
    // the rest, JJ定稿 later the same day
    "cover-area-tip": ["给这一块打码，片段放大、移动时码会跟着走。适合挡连麦的人和观众昵称。", "Hides this area, and the cover follows when the clip is zoomed or moved. Good for hiding a co-host and viewers' names."],
    "cover-drag": ["在画面上拖一个框，框住要打码的地方。按 Esc 取消。", "Drag a box on the monitor over what to hide. Press Esc to cancel."],
    "cover-not-here": ["先把播放头移到这个片段上，再在画面上拖一个框。", "Move the playhead over the clip, then drag a box on the monitor."],
    "cover-outside": ["框拖到片段画面外面了，请拖在这个片段的画面上。", "The box is outside the clip's picture. Drag it over the clip."],
    "cover-add": ["+ 再打一块", "+ Hide another area"],
    "cover-max": ["这个片段已经打了 3 块码，最多就是 3 块。要再打，先去掉一块。", "This clip already has 3 hidden areas, the most allowed. Remove one to add another."],
    "clip-locked-tip": ["片段锁住了，先解锁才能改。", "The clip is locked. Unlock it to make changes."],
  };
  for (const [k, [c, e]] of Object.entries(JJ)) { assert.equal(zh(k, { n: 3 }), c, k + " 中文"); assert.equal(en(k, { n: 3 }), e, k + " English"); }
  // 第 5 句: the menu item's name comes from the menu item's own uiText, so the two can never drift apart
  assert.equal(zh("cover-none", { menu: zh("cover-area") }), "还没有打码。在片段上点右键 →〔给这块打码〕，再在画面上拖一个框。");
  assert.equal(en("cover-none", { menu: en("cover-area") }), "Nothing hidden yet. Right-click the clip → “Hide this area”, then drag a box on the monitor.");
  for (const l of ["zh-CN", "en"]) assert.ok(!/给这块打码|Hide this area/.test(V.t(l, "own.cover-none")), "cover-none must not carry its own copy of the menu name");
  const app0 = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
  assert.match(app0, /uiText\("own\.cover-none", \{ menu: uiText\("own\.cover-area"\) \}\)/);
  assert.doesNotMatch(app0, /uiText\("own\.cover-none"\)/);
  // a button named in a sentence is the button's own text: 去掉 / Remove in cover-max
  assert.ok(zh("cover-max", { n: 3 }).includes(zh("cover-remove")) && en("cover-max", { n: 3 }).includes(en("cover-remove")));
  // every English 打码 string says Hide / Hidden: "cover" only as the noun JJ chose ("the cover follows"), never the verb
  const src = fs.readFileSync(path.join(__dirname, "..", "ui-preferences.js"), "utf8"), keys = [...src.matchAll(/"(cover-[a-z-]+)":/g)].map((m) => m[1]);
  assert.ok(keys.length >= 15, keys.join(","));
  for (const k of ["cover-mosaic", "cover-blur", "cover-strength"]) assert.ok(!keys.includes(k), k + ": no mosaic / blur / strength to pick (#186)");
  for (const k of keys) assert.doesNotMatch(en(k, { n: 2 }).replace("the cover follows", ""), /\bcover(ed|s)?\b/i, k + ": " + en(k, { n: 2 }));
  // and every Chinese one says 打码, never 盖住 / 遮住 (JJ): the panel, the menu, the locked hint and the tool's sentence
  for (const k of [...keys, "clip-locked-tip"]) assert.doesNotMatch(zh(k, { n: 2 }), /盖住|遮住|盖上|打上马赛克/, k + ": " + zh(k, { n: 2 }));
  assert.equal(require("../capabilities").get("fablecut_blur_region").summary["zh-CN"], "给画面里的一块打码，片段放大、移动时码会跟着走");
  for (const f of ["capabilities.js", "manifest.json"]) assert.doesNotMatch(fs.readFileSync(path.join(__dirname, "..", f), "utf8").match(/fablecut_blur_region.*/)[0], /\bCover\b/, f);
  // DRAFT (Deja, 2026-11-06): "a mosaic" → "a solid block" (#186); JJ to sign off
  assert.equal(require("../capabilities").get("fablecut_blur_region").summary.en, "Hide an area of the picture with a solid black block that follows the clip when it zooms or moves");
  const tool = require("../mcp-tools").find((t) => t.name === "fablecut_blur_region");
  assert.match(tool.description, /^Hide an area of a clip's picture in one step/);
  const app = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
  // the timeline badge and the panel title count the same list the rows are numbered from
  assert.match(app, /const nCovers = Mask\.COVER_KINDS\.includes\(c\.kind\) \? clipCovers\(c\)\.length : 0;/);
  assert.match(app, /uiText\("own\.cover-badge", \{ n: nCovers \}\)\) \+ \(label \? " · " : ""\)/, "no separator after 打码·N when the clip has no name");
  assert.match(app, /uiText\("own\.cover-section-n", \{ n: list\.length \}\)/);
  assert.match(app, /const list = clipCovers\(c\)[^\n]*\n  const rows = list\.map/);
  // the menu entry sits right after enable / lock, in its own group
  const menu = app.slice(app.indexOf("function showClipCtxMenu"), app.indexOf("function showClipCtxMenu") + 4000);
  assert.ok(menu.indexOf('uiText("own.clip-lock")') < menu.indexOf('uiText("own.cover-area")') && menu.indexOf('uiText("own.cover-area")') < menu.indexOf("own.clip-parent-null"));
});

/* Numbers stay (Deja, 2026-11-05): each redaction gets its number when it is made — the largest on the clip + 1 —
   and keeps it; removing another never renumbers; a list saved without numbers gets them in order when read. */
test("redaction numbers: given once, kept for good, filled in for old lists", () => {
  const box = { x: 0.5, y: 0.5, w: 0.2, h: 0.2 };
  assert.deepEqual(M.normalizeCovers([box, box, box]).map((c) => c.id), [1, 2, 3], "an old list: numbered in order");
  assert.deepEqual(M.normalizeCovers([{ ...box, id: 2 }, box]).map((c) => c.id), [2, 3], "one removed: the rest keep theirs, a new one is the largest + 1");
  assert.deepEqual(M.normalizeCovers([{ ...box, id: 5 }, { ...box, id: 5 }, { ...box, id: 1 }]).map((c) => c.id), [5, 6, 1], "a duplicate counts as missing");
  assert.equal(M.replaceCoverArea({ ...box, id: 4 }, { x: 0.1, y: 0.1, w: 0.1, h: 0.1 }).id, 4, "re-drawing keeps the number");
  assert.throws(() => M.normalizeCover({ ...box, id: 0 }, true), /id must be a whole number/);
  assert.match(M.describeCovers(M.normalizeCovers([{ ...box, id: 2 }])), /#2 at 0\.5,0\.5/);
});

test("agents: the patch ops keep the numbers (remove one → the other keeps its number; a new one is the largest + 1)", async (t) => {
  const dir = makeDataDir(t, seedProject({ clips: [{ id: "c_a", mediaId: "m_a", kind: "video", track: "V1", start: 0, in: 0, duration: 5,
    props: { redactions: [{ x: 0.3, y: 0.3, w: 0.2, h: 0.2 }, { x: 0.7, y: 0.7, w: 0.2, h: 0.2 }] } }] }));
  const mcp = startMcp(t, dir);
  await mcp.request("initialize", { protocolVersion: "2025-11-25" });
  const ids = () => (readProject(dir).clips[0].props.redactions || []).map((r) => r.id);
  let r = await mcp.callTool("fablecut_blur_region", { clipId: "c_a", remove: 0 });
  assert.equal(r.isError, false, r.text);
  assert.deepEqual(ids(), [2], "an old list is numbered when read; removing the first leaves the second as #2");
  r = await mcp.callTool("fablecut_blur_region", { clipId: "c_a", rect: { x: 0.5, y: 0.5, w: 0.1, h: 0.1 } });
  assert.deepEqual(ids(), [2, 3]);
  assert.match(r.text, /#2 at .*#3 at /);
});

/* The right-click menu's locked hint follows the interface language (Deja, 2026-11-05; JJ定稿 the same day). */
test("the clip menu's locked hint is a uiText key, not English written into app.js", () => {
  const V = require("../ui-preferences"), fs = require("node:fs"), path = require("node:path");
  assert.equal(V.t("zh-CN", "own.clip-locked-tip"), "片段锁住了，先解锁才能改。");   // JJ定稿
  assert.equal(V.t("en", "own.clip-locked-tip"), "The clip is locked. Unlock it to make changes.");
  const app = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
  assert.doesNotMatch(app, /"Locked — unlock to change"|"The clip is locked/);
  assert.equal(app.match(/locked \? uiText\("own\.clip-locked-tip"\) : null/g).length, 7);
});

/* The opaque block, in app.js: the picture is never drawn where a redaction is (so a clip at opacity < 1, or with a blend
   mode, never lets it through), and the block is filled there. No mosaic cells, no smoothing, no style / strength controls. */
test("app.js: redactions are an opaque block the picture is never drawn under; no mosaic, blur, style or strength", () => {
  const fs = require("node:fs"), path = require("node:path");
  const app = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
  const draw = app.slice(app.indexOf("function drawCovers"), app.indexOf("function drawCovers") + 1500);
  assert.match(draw, /fillRect/);
  assert.doesNotMatch(draw, /coverGrain|imageSmoothing|drawImage/);
  // the picture is drawn with the redactions clipped out (one clip per area, so overlapping areas stay out too)
  assert.match(app, /function clipOutCovers\(/);
  assert.match(app, /clip\(hole, "evenodd"\)/);
  assert.doesNotMatch(app, /data-cover-style|data-cover-strength|own\.cover-strength|"own\.cover-" \+ st/);
});

/* #163's covers → redactions rename (461fbc76) also turned `p.fit === "cover"` into "redaction", so fit:"cover" (Reframe
   uses it) fell back to contain. Every fit test in app.js names a documented fit. */
test("app.js: fit:\"cover\" still fills the canvas (not caught by the redactions rename)", () => {
  const fs = require("node:fs"), path = require("node:path");
  const app = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
  const fits = [...app.matchAll(/p\.fit === "([a-z-]+)"/g)].map((m) => m[1]);
  for (const f of fits) assert.ok(["contain", "cover", "stretch", "none"].includes(f), "unknown fit " + f);
  assert.ok(fits.filter((f) => f === "cover").length >= 3, "the three fit-to-size places all know cover");
});
