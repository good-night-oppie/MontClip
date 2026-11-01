"use strict";
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
// Development-only, explicitly selected synthetic fixture. Never runs on user media.
async function run(win, origin, token, dataDir) {
  const input = process.env.MONTCLIP_M0_INPUT;
  if (!input) throw new Error("Set MONTCLIP_M0_INPUT to the independent synthetic bilingual-source.mp4");
  const bytes = fs.readFileSync(input), hash = crypto.createHash("sha256").update(bytes).digest("hex");
  const response = await fetch(origin + "/api/upload?name=" + encodeURIComponent("合成 source.mp4"), {
    method: "POST", headers: { "X-MontClip-Session": token }, body: bytes,
  });
  if (!response.ok) throw new Error("Fixture import failed: " + response.status);
  const { src } = await response.json();
  const srt = fs.readFileSync(path.join(__dirname, "../test/fixtures/m0/bilingual-manual.srt"), "utf8");
  const result = await win.webContents.executeJavaScript(`(${exercise.toString()})(${JSON.stringify({ src, srt })})`);
  if (crypto.createHash("sha256").update(fs.readFileSync(input)).digest("hex") !== hash) throw new Error("Source changed");
  const out = path.join(dataDir, "exports"); fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, "M0.srt"), result.srt);
  fs.writeFileSync(path.join(out, "M0.mapping.json"), JSON.stringify(result.map, null, 2));
  fs.writeFileSync(path.join(out, "M0.receipt.json"), JSON.stringify({ ...result, inputSha256: hash }, null, 2));
  process.stdout.write("MONTCLIP_M0 " + JSON.stringify({ output: out, export: result.export, inputSha256: hash }) + "\n");
}
async function exercise({ src, srt }) {
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  for (let i = 0; i < 200 && !runtime.projectId; i++) await wait(50);
  if (!await flushSave()) throw new Error("Initial save failed");
  const doc = projectJSON();
  Object.assign(doc, { name: "M0 reordered", width: 320, height: 180, fps: 30, inPoint: 1, outPoint: 10,
    media: [{ id: "m0", src, kind: "video", name: "合成 source.mp4", duration: 16, width: 320, height: 180 }],
    clips: [
      { id: "m0v", kind: "video", mediaId: "m0", track: "V1", start: 0, in: 0, duration: 16, props: { volume: 0 } },
      { id: "m0a", kind: "audio", mediaId: "m0", track: "A1", start: 0, in: 0, duration: 16, props: { volume: 1 } },
      ...FableCutCaptions.parse(srt).map((cue, i) => FableCutCaptions.clip(cue, { id: "m0s"+i, track: "V2", width: 320, height: 180 })),
    ],
  });
  applyProject(doc); scheduleSave(); if (!await flushSave()) throw new Error("Imported project save failed");
  const beforePreview = JSON.stringify(projectJSON());
  state.workAreaPlay = true; setPreviewRate(2);
  await showSentenceSelection();
  const dialog = document.querySelector(".sentence-dialog"), input = dialog.querySelector("[data-ranges]");
  input.value = "9,12\n1,4"; input.dispatchEvent(new Event("input"));
  if (dialog.querySelector("[data-apply]").disabled) throw new Error("Ordered range UI rejected fixture");
  dialog.querySelector("[data-preview]").click(); await wait(150);
  if (state.workAreaPlay || state.previewRate !== 1) throw new Error("Preview inherited old limits/rate");
  if (JSON.stringify(projectJSON()) !== beforePreview) throw new Error("Preview changed project");
  dialog.querySelector("[data-apply]").click();
  if (!state.workAreaPlay || state.previewRate !== 2) throw new Error("Preview settings not restored");
  const timing = () => project.clips.filter(c => c.kind === "video").map(c => [c.in,c.start,c.duration]);
  if (JSON.stringify(timing()) !== "[[9,0,3],[1,3,3]]") throw new Error("Order mismatch");
  undo(); if (JSON.stringify(timing()) !== "[[0,0,16]]") throw new Error("Undo mismatch");
  if (project.inPoint !== 1 || project.outPoint !== 10) throw new Error("Undo lost IN/OUT");
  redo(); if (JSON.stringify(timing()) !== "[[9,0,3],[1,3,3]]") throw new Error("Redo mismatch");
  if (project.inPoint != null || project.outPoint != null) throw new Error("Redo retained stale IN/OUT");
  scheduleSave(); if (!await flushSave()) throw new Error("Edited project save failed");
  const saved = await fetch("/api/project").then(r => r.json()); applyProject(saved);
  if (JSON.stringify(timing()) !== "[[9,0,3],[1,3,3]]") throw new Error("Save/reload mismatch");
  setTime(0); await fetchEncodeProfiles();
  const exported = await fastExport({ silent: true });
  if (!exported?.outputs?.length || exported.outputs.some(o => !o.ok)) throw new Error("Actual compositor export failed: " + JSON.stringify(exported));
  return { export: exported, srt: FableCutCaptions.toSRT(FableCutCaptions.fromClips(project.clips)), map: FableCutCaptions.sourceMap(projectJSON()), undoRedo: true, savedReloaded: true };
}
module.exports = { run };
