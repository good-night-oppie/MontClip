/* A reload answer older than this page's own document must not replace it.
   The page bumps project.revision before it saves; a GET /api/project sent before that
   save can be answered after it with the older document. Disk revisions only go up
   (PUT refuses a revision at or below the disk's; opening a project, version or
   sequence writes a higher one), so such an answer is stale, not an outside edit.
   Seen as the desktop close-fault smoke's rare close refusal (the close snapshot
   changed while saving: the page had reverted to the document before the edit). */
"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const path = require("node:path");
const fs = require("node:fs");
const vm = require("node:vm");
const { ROOT } = require("./helpers");

const SRC = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
const a = SRC.indexOf("async function syncFromServer(force) {");
const b = SRC.indexOf("/** Populate a media entry's duration", a);
assert.ok(a >= 0 && b > a, "syncFromServer is where this test expects it");
const FN = SRC.slice(a, b);

function run({ local, disk, force, pid = "p_1" }) {
  const applied = [];
  const ctx = {
    state: { gesture: false, exporting: false, binTab: "project", compCtx: null },
    runtime: { projectId: "p_1", saveTimer: null, undo: [], redo: [], audioBufs: new Map() },
    project: { revision: local, clips: [{ id: "mine" }], media: [] },
    pj: { verOf: null, verDiff: new Map() },
    fetchSaved: () => Promise.resolve(), loadLibraryFonts() {}, fetchEncodeProfiles() {},
    fetch: async () => ({ ok: true, headers: { get: (h) => (h === "X-FableCut-Project" ? pid : null) }, json: async () => ({ revision: disk, clips: [], media: [] }) }),
    SeqLib: { activeId: () => "main" }, undoSnapshot: () => ({}), outsideEditStep: () => null, pushUndo() {},
    applyProject(d) { applied.push(d.revision); ctx.project = d; },
    toast() {}, syncCompCrumb() {}, pjDropDiffs() {}, projectsOpen: () => false, renderProjectGrid() {},
    probeMissingMeta: async () => {}, onProjectSwitched() {}, setTime() {}, pjLoad() {},
  };
  vm.createContext(ctx);
  vm.runInContext(FN + "\nthis.__sync = syncFromServer;", ctx);
  return ctx.__sync(force).then((result) => ({ result, applied, revision: ctx.project.revision }));
}

test("an answer older than the page's own document is ignored", async () => {
  const r = await run({ local: 1, disk: 0 });
  assert.deepEqual(r.applied, [], "the older document was applied over the page's newer one");
  assert.equal(r.revision, 1);
});

test("an outside edit (a higher revision) still replaces the page's document", async () => {
  const r = await run({ local: 1, disk: 2 });
  assert.deepEqual(r.applied, [2]);
});

test("the page's own save (the same revision) is still left alone", async () => {
  const r = await run({ local: 3, disk: 3 });
  assert.deepEqual(r.applied, []);
});

test("a forced reload (after a 409) still takes the disk's document, whatever its revision", async () => {
  const r = await run({ local: 4, disk: 3, force: true });
  assert.deepEqual(r.applied, [3]);
});

test("another project opened elsewhere still switches the page, whatever its revision", async () => {
  const r = await run({ local: 9, disk: 1, pid: "p_2" });
  assert.deepEqual(r.applied, [1]);
});
