/* Redactions, 打码 (props.redactions, fablecut_blur_region — P4 of the 2026-11-05 europa trial, JJ's review):
   an area of a clip's picture drawn over with a mosaic (default) or a blur, that follows the clip.
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

test("normalizeCover: mask coordinates, defaults, clamped into the frame, strict errors", () => {
  assert.deepEqual(M.normalizeCover({ x: 0.6, y: 0.1, w: 0.3, h: 0.4 }), { x: 0.6, y: 0.1, w: 0.3, h: 0.4, style: "mosaic", strength: 60 });
  assert.deepEqual(M.normalizeCover({ x: 0.9, y: 0.8, w: 0.3, h: 0.3, style: "blur", strength: 400, name: " names " }),
    { x: 0.9, y: 0.8, w: 0.3, h: 0.3, style: "blur", strength: 100, name: "names" }, "x + w, y + h past 1 are kept as given (cut at the frame's edge when drawn)");
  assert.throws(() => M.normalizeCover({ x: -0.1, y: 0, w: 0.2, h: 0.2 }, true), /x, y \(the top-left corner\) must be 0…1/);
  assert.throws(() => M.normalizeCover({ x: 0.1, y: 0.1, w: 0.2 }, true), /\.h must be a number/);
  assert.throws(() => M.normalizeCover({ x: 1.2, y: 0.1, w: 0.2, h: 0.2 }, true), /must be 0…1/);
  assert.throws(() => M.normalizeCover({ x: 0.2, y: 0.1, w: 0, h: 0.2 }, true), /w, h must be > 0/);
  assert.throws(() => M.normalizeCover({ x: 0, y: 0, w: 0.2, h: 0.2, style: "pixel" }, true), /style must be mosaic \| blur/);
  assert.throws(() => M.normalizeCover({ x: 0, y: 0, w: 0.2, h: 0.2, colour: 1 }, true), /colour: unknown key/);
  assert.equal(M.normalizeCovers([]), null);
  // a time window, seconds from the clip's start
  const win = M.normalizeCover({ x: 0, y: 0, w: 0.2, h: 0.2, from: 1.5, to: 3 });
  assert.deepEqual([win.from, win.to], [1.5, 3]);
  assert.deepEqual([1.4, 1.5, 2.9, 3].map((t) => M.coverActive(win, t)), [false, true, true, false]);
  assert.equal(M.coverActive(M.normalizeCover({ x: 0, y: 0, w: 0.2, h: 0.2, to: 2 }), 0), true, "no from: from the clip's start");
  assert.throws(() => M.normalizeCover({ x: 0, y: 0, w: 0.2, h: 0.2, from: 3, to: 2 }, true), /\.to must be after \.from/);
  assert.throws(() => M.normalizeCover({ x: 0, y: 0, w: 0.2, h: 0.2, from: -1 }, true), /from must be seconds/);
  // never so fine that letters survive: a mosaic block is at least ~1.4 % of the frame width at the default strength
  assert.ok(M.coverGrain({ strength: 60 }, 30, 1920).block >= 25);
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
  assert.match(r.text, /c_a\.redactions\(1 redaction: mosaic 60 "co-host"/);
  assert.match(r.text, /follows the clip/);
  r = await mcp.callTool("fablecut_blur_region", { clipId: "c_a", rect: { x: 0.1, y: 0.8, w: 0.3, h: 0.05 }, style: "blur", strength: 40 });
  assert.equal(redactions("c_a").length, 2);
  r = await mcp.callTool("fablecut_blur_region", { clipId: "c_a", rect: { x: 0.55, y: 0.1, w: 0.35, h: 0.4 }, name: "co-host" });
  assert.equal(redactions("c_a").length, 2, "a name that is there replaces that area");
  assert.deepEqual(redactions("c_a")[0], { x: 0.55, y: 0.1, w: 0.35, h: 0.4, style: "mosaic", strength: 60, name: "co-host" });
  const compact = await mcp.callTool("fablecut_get_project", { compact: true });
  assert.match(compact.text, /\[2 redactions: mosaic 60 "co-host"/);
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
  assert.equal(r.isError, true); assert.match(r.text, /top-left corner/);
  r = await mcp.callTool("fablecut_patch_project", { ops: [{ op: "updateClip", id: "c_a", set: { props: { redactions: [{ x: 0, y: 0, w: 0.2, h: 0.2, style: "smudge" }] } } }] });
  assert.equal(r.isError, true, "props.redactions written wholesale is validated too"); assert.match(r.text, /style must be/);
});

