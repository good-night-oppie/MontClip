/* MontClip#270 (the owner: 「面板的拖拽和大小控制只有下面可以用，其他面板都用不了」): the edge between the media panel and the
   preview, and the one between the preview and the inspector, can be dragged — each on its own; the preview takes
   what is left and keeps its shape. The edge above the timeline works as before. Dragging only resizes: nothing is
   selected, played or cut, and no "resizing" state stays behind. 「Layout」 brings the default widths back.
   A real Chrome / Edge, the browser's own mouse input (press, move in steps, release); an empty synthetic project. */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { makeDataDir, seedProject, startServer } = require("./helpers");
const { withPage } = require("./browser-contrast");
const L = require("../narrow-layout");

const browser = (() => { try { return require("../export-jobs").findBrowser(); } catch { return null; } })();
const skip = !browser ? "no Chrome / Edge to run the page in" : typeof WebSocket !== "function" ? "needs Node's WebSocket (Node 22)" : false;

const LAYOUT = `(() => {
  const r = (e) => { if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.left, y: b.top, w: Math.round(b.width), h: Math.round(b.height) }; };
  const q = (s) => document.querySelector(s), cv = q("#preview").getBoundingClientRect();
  return { bin: r(q(".upper > .bin")), monitor: r(q(".upper > .monitor")), inspector: r(q(".upper > .inspector")),
    left: r(q("#splitBinMonitor")), right: r(q("#splitMonitorInspector")), bottom: r(q("#splitUpperTimeline")),
    timeline: r(q("#timelinePanel")), picture: cv.height ? cv.width / cv.height : 0, pictureH: Math.round(cv.height), vh: innerHeight,
    transport: r(q("#monitorPanel .transport")),
    exportBtn: r(q("#btnExport")), bodyClass: document.body.className,
    playing: typeof state !== "undefined" && !!state.playing,
    selection: String(getSelection()) };
})()`;

test("the two side edges can be dragged, each on its own; the edge above the timeline as before (#270)", { skip, timeout: 180000 }, async (t) => {
  const dir = makeDataDir(t, seedProject({ media: [], clips: [{ id: "c_t", kind: "text", mediaId: null, track: "V1", start: 0, duration: 8, props: { text: "synthetic" } }] }));
  const { base } = await startServer(t, dir, { FABLECUT_NO_FS_WATCH: "1" });
  await withPage({ browser, url: base + "/", width: 1600, height: 900, settleMs: 1500 }, async ({ evaluate, send }) => {
    const layout = () => evaluate(LAYOUT);
    const mouse = (type, x, y, more = {}) => send("Input.dispatchMouseEvent", { type, x, y, ...more });
    const drag = async (x1, y1, x2, y2) => {
      await mouse("mouseMoved", x1, y1);
      await mouse("mousePressed", x1, y1, { button: "left", clickCount: 1 });
      for (let i = 1; i <= 10; i++) await mouse("mouseMoved", x1 + (x2 - x1) * i / 10, y1 + (y2 - y1) * i / 10, { button: "left", buttons: 1 });
      await mouse("mouseReleased", x2, y2, { button: "left", clickCount: 1 });
      await new Promise((r) => setTimeout(r, 300));
    };
    const mid = (r) => [Math.round(r.x + r.w / 2), Math.round(r.y + r.h / 2)];
    const cursorAt = (x, y) => evaluate(`getComputedStyle(document.elementFromPoint(${x}, ${y})).cursor`);
    const drawn = async () => {
      for (const until = Date.now() + 20000; Date.now() < until;) {
        if (await evaluate(`document.readyState === "complete" && document.querySelectorAll(".track-head").length > 0`)) break;
        await new Promise((r) => setTimeout(r, 250));
      }
      await new Promise((r) => setTimeout(r, 1200));
    };

    const saved = () => evaluate(`fetch("/api/project").then((r) => r.json()).then((p) => p.revision + " / " + p.clips.length + " clips")`);
    const project0 = await saved();
    const a = await layout();
    assert.ok(a && a.bin && a.monitor && a.inspector, "the three panels are there");
    assert.ok(a.left && a.right, "both side edges are there");
    assert.ok(a.left.w === 8 && a.right.w === 8 && a.left.h > 100 && a.right.h > 100, "each can be hit: 8 px wide (spec v3), as tall as the panels");
    const [lx, ly] = mid(a.left), [rx, ry] = mid(a.right);
    assert.ok(Math.abs(a.left.x + a.left.w / 2 - (a.monitor.x - 3)) <= 1 && Math.abs(a.right.x + a.right.w / 2 - (a.monitor.x + a.monitor.w + 3)) <= 1, "each is centred on the gap beside the preview");
    assert.equal(await cursorAt(lx, ly), "col-resize", "the cursor says the left edge can be dragged");
    assert.equal(await cursorAt(rx, ry), "col-resize", "and the right one");
    for (const id of ["splitBinMonitor", "splitMonitorInspector"])
      assert.equal(await evaluate(`document.getElementById("${id}").getAttribute("role") + " " + document.getElementById("${id}").getAttribute("aria-orientation")`), "separator vertical");

    // the left edge alone: the media panel grows by what the mouse moved, the inspector stays, the preview gives the room
    await drag(lx, ly, lx + 80, ly);
    const b = await layout();
    assert.equal(b.bin.w, a.bin.w + 80, "media panel +80");
    assert.equal(b.inspector.w, a.inspector.w, "inspector untouched");
    assert.equal(b.monitor.w, a.monitor.w - 80, "the preview takes what is left");
    assert.ok(Math.abs(b.picture - a.picture) < 0.01, `the picture keeps its shape (${a.picture} → ${b.picture})`);
    assert.doesNotMatch(b.bodyClass, /resizing/, "no resizing state after the release");
    assert.equal(b.playing, false, "nothing started playing");
    assert.equal(b.selection, "", "no text was selected");

    // the right edge alone
    const [rx2, ry2] = mid(b.right);
    await drag(rx2, ry2, rx2 - 80, ry2);
    const c = await layout();
    assert.equal(c.inspector.w, b.inspector.w + 80, "inspector +80");
    assert.equal(c.bin.w, b.bin.w, "media panel untouched");

    // dragged far: each panel and the preview keep their least width, the export button stays on the page
    const [lx3, ly3] = mid(c.left);
    await drag(lx3, ly3, lx3 + 3000, ly3);
    const d = await layout();
    const vw0 = await evaluate("innerWidth");
    assert.equal(d.bin.w, Math.floor(vw0 * L.SIDE_MAX_SHARE), `the media panel stops at 40% of the window (${vw0})`);
    assert.ok(d.monitor.w >= L.SIDE_CENTER_MIN, `the preview keeps at least ${L.SIDE_CENTER_MIN} px: ${d.monitor.w}`);
    // the other side to its limit too: the preview still has its least width
    const [rxm, rym] = mid(d.right);
    await drag(rxm, rym, 2, rym);
    const dm = await layout();
    assert.ok(dm.inspector.w <= Math.floor(vw0 * L.SIDE_MAX_SHARE), `the inspector at most 40%: ${dm.inspector.w}`);
    assert.ok(dm.monitor.w >= L.SIDE_CENTER_MIN, `both sides at their limit: the preview keeps ${L.SIDE_CENTER_MIN}: ${dm.monitor.w}`);
    assert.equal(dm.bin.w, d.bin.w, "and the media panel was not pushed");
    // Esc during a drag: the size from before the drag, no resizing state
    const [rxe, rye] = mid(dm.right);
    await mouse("mouseMoved", rxe, rye);
    await mouse("mousePressed", rxe, rye, { button: "left", clickCount: 1 });
    await mouse("mouseMoved", rxe + 90, rye, { button: "left", buttons: 1 });
    const during = await layout();
    assert.equal(during.inspector.w, dm.inspector.w - 90, "it follows while dragged");
    assert.match(during.bodyClass, /resizing-columns/);
    await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    await mouse("mouseReleased", rxe + 90, rye, { button: "left", clickCount: 1 });
    await new Promise((r) => setTimeout(r, 300));
    const esc = await layout();
    assert.equal(esc.inspector.w, dm.inspector.w, "Esc: back to the size before the drag");
    assert.doesNotMatch(esc.bodyClass, /resizing/, "and no resizing state");
    // back to where the next steps expect the inspector
    const [rxb, ryb] = mid(esc.right);
    await drag(rxb, ryb, rxb + (esc.inspector.w - c.inspector.w), ryb);
    assert.equal((await layout()).inspector.w, c.inspector.w, "(the inspector as before these two steps)");
    assert.equal(d.inspector.w, c.inspector.w, "the other side is not pushed");
    const [lx4, ly4] = mid(d.left);
    await drag(lx4, ly4, 2, ly4);
    const e = await layout();
    assert.equal(e.bin.w, L.SIDE_LEFT_MIN, "the media panel stops at its least width");
    const [rx4, ry4] = mid(e.right);
    const vw = await evaluate("innerWidth");   // the page is a little narrower than the window; a move outside it is not delivered
    await drag(rx4, ry4, vw - 2, ry4);
    const f = await layout();
    assert.equal(f.inspector.w, L.SIDE_RIGHT_MIN, "the inspector stops at its least width");
    assert.ok(f.exportBtn && f.exportBtn.w > 0 && f.exportBtn.x >= 0 && f.exportBtn.x + f.exportBtn.w <= vw, "the export button can still be reached");

    // the widths are remembered on this computer
    await send("Page.reload", {});
    await drawn();
    const g = await layout();
    assert.equal(g.bin.w, f.bin.w, "media panel width kept after a reload");
    assert.equal(g.inspector.w, f.inspector.w, "inspector width kept after a reload");

    // double-click one edge: that side's default; 「Layout」: both
    const [lx5, ly5] = mid(g.left);
    await drag(lx5, ly5, lx5 + 120, ly5);
    const [lx6, ly6] = mid((await layout()).left);
    await mouse("mousePressed", lx6, ly6, { button: "left", clickCount: 1 }); await mouse("mouseReleased", lx6, ly6, { button: "left", clickCount: 1 });
    await mouse("mousePressed", lx6, ly6, { button: "left", clickCount: 2 }); await mouse("mouseReleased", lx6, ly6, { button: "left", clickCount: 2 });
    await new Promise((r) => setTimeout(r, 300));
    const h = await layout();
    assert.equal(h.bin.w, a.bin.w, "double-click: the media panel's default width");
    assert.equal(h.inspector.w, g.inspector.w, "the other side stays as she left it");
    const [rx6, ry6] = mid(h.right);
    await drag(rx6, ry6, rx6 - 60, ry6);
    await evaluate(`document.getElementById("btnLayoutReset").click()`);
    await new Promise((r) => setTimeout(r, 300));
    const i = await layout();
    assert.deepEqual([i.bin.w, i.inspector.w], [a.bin.w, a.inspector.w], "「Layout」 brings both defaults back");

    // the edge above the timeline, as before
    const [bx, by] = mid(i.bottom);
    await drag(bx, by, bx, by + 40);
    const j = await layout();
    assert.equal(j.timeline.h, i.timeline.h - 40, "the timeline edge still drags");
    assert.deepEqual([j.bin.w, j.inspector.w], [i.bin.w, i.inspector.w], "and does not move the side edges");
    // …and now also up: the default is not the tallest it can be (PG on #270: 「可从默认高度继续向上拉大」)
    assert.ok(i.timeline.h <= Math.round(i.vh * 0.32) + 1, `the default is still at most 32% of the window: ${i.timeline.h} of ${i.vh}`);
    const [bx2, by2] = mid(j.bottom);
    await drag(bx2, by2, bx2, by2 - 160);
    const k = await layout();
    assert.equal(k.timeline.h, j.timeline.h + 160, "dragged up 160: the timeline is 160 taller");
    assert.ok(k.timeline.h > i.timeline.h, "taller than the default");
    assert.ok(Math.abs(k.picture - a.picture) < 0.01, "the picture keeps its shape");
    // dragged all the way up: the preview keeps its header, its player and a picture; the buttons stay on the page
    const [bx3, by3] = mid(k.bottom);
    await drag(bx3, by3, bx3, 2);
    const m = await layout();
    assert.ok(m.timeline.h > k.timeline.h, "it went further");
    assert.ok(m.monitor.h >= L.UPPER_MIN, `the upper row keeps at least ${L.UPPER_MIN} px: ${m.monitor.h}`);
    assert.ok(m.pictureH >= 60, `a picture is still shown: ${m.pictureH} px tall`);
    assert.ok(m.transport && m.transport.h > 0 && m.transport.y + m.transport.h <= m.bottom.y + 1, "the player's buttons are above the edge, not under the timeline");
    assert.ok(m.exportBtn.y >= 0 && m.exportBtn.h > 0, "the export button is still there");
    t.diagnostic(JSON.stringify({ window: m.vh, default: i.timeline.h, tallest: m.timeline.h, upperAtTallest: m.monitor.h, pictureAtTallest: m.pictureH }));
    // double-click the edge: the default again
    const [bx4, by4] = mid(m.bottom);
    await mouse("mousePressed", bx4, by4, { button: "left", clickCount: 1 }); await mouse("mouseReleased", bx4, by4, { button: "left", clickCount: 1 });
    await mouse("mousePressed", bx4, by4, { button: "left", clickCount: 2 }); await mouse("mouseReleased", bx4, by4, { button: "left", clickCount: 2 });
    await new Promise((r) => setTimeout(r, 300));
    assert.equal((await layout()).timeline.h, i.timeline.h, "double-click: the default height");
    assert.equal(await saved(), project0, "after all of it the project is as it was: nothing cut, added or saved");
    assert.match(project0, /^\d+ \/ 1 clips$/, "(and the project was read)");
    assert.equal(j.playing, false, "and nothing is playing");
  });
});

test("narrow windows: no side edge where a panel is hidden (#270)", { skip, timeout: 120000 }, async (t) => {
  const dir = makeDataDir(t, seedProject({ media: [], clips: [] }));
  const { base } = await startServer(t, dir, { FABLECUT_NO_FS_WATCH: "1" });
  await withPage({ browser, url: base + "/", width: 1000, height: 800, settleMs: 1500 }, async ({ evaluate }) => {
    const shown = await evaluate(`["splitBinMonitor", "splitMonitorInspector"].map((id) => { const e = document.getElementById(id); return e ? e.getBoundingClientRect().width > 0 : null; })`);
    assert.deepEqual(shown, [false, false], "at 1000 px the media panel is hidden and the window sets the two columns: the edges are there but not shown");
  });
});
