"use strict";
// #285: synthetic 60 s A/B sources, 25 fps (one frame = exactly .04 s).
const test = require("node:test");
const assert = require("node:assert/strict");
const Edit = require("../edit-ops");
const Project = require("../project-ops");

function fixture(replace = "none", linked = true) {
  const doc = { fps: 25, media: ["A", "B"].map(id => ({ id, kind: "video", duration: 60 })),
    tracks: ["V1", "A1", "A2"].map(id => ({ id, kind: id === "V1" ? "video" : "audio" })), clips: [] };
  for (const [side, start] of [["before", 0], ["after", 30]]) {
    for (const [ch, track] of ["V1", "A1", "A2"].entries()) doc.clips.push({
      id: `${side}-${track}`, kind: ch ? "audio" : "video", track, mediaId: "A",
      start, in: start, duration: 30, ...(linked ? { linkGroup: side } : {}),
      props: ch ? { speed: 1, audioChannel: ch - 1, pan: ch === 1 ? -1 : 1 } : { speed: 1, volume: 0 },
    });
  }
  // The supported patch changes only the picture, keeping its original sound.
  for (const side of ["before", "after"]) if (replace === side || replace === "both")
    Project.applyPatch(doc, [{ op: "updateClip", id: `${side}-V1`, set: { mediaId: "B" } }]);
  return JSON.parse(JSON.stringify(doc)); // save + reopen, including the link metadata
}
const byId = (doc, id) => doc.clips.find(c => c.id === id);
const near = (actual, expected, label) => assert.ok(Math.abs(actual - expected) <= 1e-6,
  `${label}: ${actual} != ${expected}`);
function check(doc, delta) {
  for (const track of ["V1", "A1", "A2"]) {
    const l = byId(doc, `before-${track}`), r = byId(doc, `after-${track}`);
    near(l.start, 0, `${track} left start`);
    near(l.duration, 30 + delta, `${track} left duration`);
    near(r.start, 30 + delta, `${track} right start`);
    near(r.duration, 30 - delta, `${track} right duration`);
    near(r.start - l.start - l.duration, 0, `${track} gap/overlap`);
    near(r.in - l.in - l.duration, 0, `${track} source continuity`);
    near(r.start + r.duration, 60, `${track} total length`);
  }
}
for (const entry of ["edit", "patch"]) for (const replace of ["none", "before", "after", "both"])
  for (const side of ["out", "in"]) for (const delta of [-2, -.5, -.1, -.04, .04, .1, .5, 2]) {
    test(`${entry} ${replace} ${side} ${delta}: L/R geometry and source continuity`, () => {
      const doc = fixture(replace), id = `${side === "out" ? "before" : "after"}-V1`;
      if (entry === "edit") {
        const e = Edit.forDoc(doc); e.relinkClips();
        near(e.rollEdit(byId(doc, id), side, delta), delta, "applied delta");
      } else Project.applyPatch(doc, [{ op: "roll", id, side, delta }]);
      check(doc, delta);
      const reopened = JSON.parse(JSON.stringify(doc));
      Edit.forDoc(reopened).relinkClips();
      check(reopened, delta);
    });
  }
test("picture replacement first captures inferred links in older agent documents", () => {
  const doc = fixture("both", false);
  Project.applyPatch(doc, [{ op: "roll", id: "before-V1", side: "out", delta: .1 }]);
  check(doc, .1);
});
for (const replace of ["before", "after", "both"]) test(`lost legacy links refuse rather than move only one side: ${replace}`, () => {
  const doc = fixture(replace);
  for (const c of doc.clips) if (replace === "both" || c.id.startsWith(replace)) delete c.linkGroup;
  const e = Edit.forDoc(doc); e.relinkClips(); const before = JSON.stringify(doc);
  assert.match(e.rollEdit(byId(doc, "before-V1"), "out", .1), /声音保持连着/);
  assert.equal(JSON.stringify(doc), before);
});

for (const [name, change] of [
  ["locked left L", d => { byId(d, "before-A1").locked = true; }],
  ["locked right R track", d => { d.lockedTracks = ["A2"]; }],
  ["source exhausted", d => { d.media.find(m => m.id === "B").duration = 30.05; }],
  ["unequal sound speed", d => { byId(d, "after-A2").props.speed = 2; }],
  ["speed ramp", d => { byId(d, "before-A1").keyframes = { speed: [{ t: 0, v: 1 }, { t: 30, v: 2 }] }; }],
  ["discontinuous source", d => { byId(d, "after-A2").in += 1; }],
  ["missing right channel", d => { d.clips = d.clips.filter(c => c.id !== "after-A2"); }],
  ["one explicitly unlinked stem", d => { byId(d, "before-A1").unlinked = true; }],
]) test(`mixed roll refuses atomically: ${name}`, () => {
  const doc = fixture("before"); change(doc);
  const e = Edit.forDoc(doc); e.relinkClips();
  const before = JSON.stringify(doc);
  assert.equal(typeof e.rollEdit(byId(doc, "before-V1"), "out", .1), "string");
  assert.equal(JSON.stringify(doc), before);
});
test("explicit unlink leaves sound alone; coincident unrelated audio is not recruited", () => {
  const doc = fixture("both");
  for (const c of doc.clips) { c.unlinked = true; delete c.linkGroup; }
  doc.clips.push({ id: "music", kind: "audio", mediaId: "A", track: "A3", start: 0, in: 0, duration: 30, props: {} });
  const before = JSON.stringify(doc.clips.filter(c => c.kind === "audio"));
  Project.applyPatch(doc, [{ op: "roll", id: "before-V1", side: "out", delta: .1 }]);
  assert.equal(JSON.stringify(doc.clips.filter(c => c.kind === "audio")), before);
});
test("unrelated overlapping audio stays unchanged beside a preserved mixed group", () => {
  const doc = fixture("before");
  const music = { id: "music", kind: "audio", mediaId: "A", track: "A3", start: 0, in: 0, duration: 30, props: {} };
  doc.clips.push(music);
  const before = JSON.stringify(music);
  Project.applyPatch(doc, [{ op: "roll", id: "before-V1", side: "out", delta: .1 }]);
  check(doc, .1);
  assert.equal(JSON.stringify(music), before);
});
test("mixed roll keeps linked audio on untargeted lanes in step", () => {
  const doc = fixture("before"); doc.untargetedTracks = ["A1", "A2"];
  Project.applyPatch(doc, [{ op: "roll", id: "before-V1", side: "out", delta: .1 }]); check(doc, .1);
});
test("MCP refusal leaves the saved revision and all clips unchanged", async t => {
  const { makeDataDir, readProject, seedProject, startMcp } = require("./helpers");
  const doc = fixture("before"); doc.media.find(m => m.id === "B").duration = 30.05;
  for (const m of doc.media) Object.assign(m, { src: `/media/${m.id}.mp4`, name: `${m.id}.mp4` });
  const dir = makeDataDir(t, seedProject(doc)), before = readProject(dir), mcp = startMcp(t, dir);
  await mcp.request("initialize", { protocolVersion: "2025-11-25" });
  const r = await mcp.callTool("fablecut_patch_project", { ops: [{ op: "roll", id: "before-V1", side: "out", delta: .1 }] });
  assert.equal(r.isError, true); assert.match(r.text, /声音保持连着/);
  assert.deepEqual(readProject(dir), before);
});
test("MCP picture-only replacement without stored links survives separate patch/readback calls", async t => {
  const { makeDataDir, readProject, seedProject, startMcp } = require("./helpers");
  const doc = fixture("none", false);
  for (const m of doc.media) Object.assign(m, { src: `/media/${m.id}.mp4`, name: `${m.id}.mp4` });
  const dir = makeDataDir(t, seedProject(doc)), mcp = startMcp(t, dir);
  await mcp.request("initialize", { protocolVersion: "2025-11-25" });
  for (const side of ["before", "after"]) {
    const r = await mcp.callTool("fablecut_patch_project", { ops: [{ op: "updateClip", id: `${side}-V1`, set: { mediaId: "B" } }] });
    assert.equal(r.isError, false, r.text);
    assert.equal(byId(readProject(dir), `${side}-A1`).mediaId, "A");
  }
  const r = await mcp.callTool("fablecut_patch_project", { ops: [{ op: "roll", id: "before-V1", side: "out", delta: .1 }] });
  assert.equal(r.isError, false, r.text); check(readProject(dir), .1);
});
