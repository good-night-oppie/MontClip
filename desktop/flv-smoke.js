"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
exports.run = async function (win, dataDir) {
  const media = path.join(dataDir, "media");
  fs.mkdirSync(media, { recursive:true });
  for (const [name, codec] of [["flv-compatible", "libx264"], ["flv-legacy", "flv"]]) {
    execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "testsrc2=size=64x64:rate=30", "-t", "0.5", "-c:v", codec, path.join(media, name + ".flv")], {windowsHide:true});
  }
  const result = await win.webContents.executeJavaScript(`(async () => {
    const file = async name => new File([await (await fetch('/media/' + name)).blob()], name, {type:''});
    const imported = await importFiles([await file('flv-compatible.flv')]);
    if (imported.length !== 1 || imported[0].preparation !== 'remux') throw Error('FLV remux import failed');
    const infoDeadline = Date.now() + 5000;
    while (mediaInfoBusy && Date.now() < infoDeadline) await new Promise(r => setTimeout(r, 20));
    if (mediaInfoBusy) throw Error('Media info did not settle');
    await flushSave();
    const originalView = mcView.get();
    updateMontClipView({language:'zh-CN'});
    const before = JSON.stringify(projectJSON());
    const legacy = await file('flv-legacy.flv');
    const canceled = importFiles([legacy]);
    const waitDialog = async () => {
      const until = Date.now() + 10000;
      while (!document.querySelector('dialog[aria-label]') && Date.now() < until) await new Promise(r => setTimeout(r, 20));
      const d = document.querySelector('dialog[aria-label]');
      if (!d) throw Error('No FLV confirmation dialog');
      return d;
    };
    const cancelDialog = await waitDialog();
    const cancelDefault = document.activeElement === cancelDialog.querySelector('button');
    cancelDialog.querySelector('button').click();
    await canceled;
    const canceledUnchanged = before === JSON.stringify(projectJSON());
    updateMontClipView({language:'en'});
    const accepted = importFiles([legacy]);
    const acceptDialog = await waitDialog();
    const english = acceptDialog.textContent.includes('Create compatible copy');
    acceptDialog.querySelectorAll('button')[1].click();
    const converted = await accepted;
    const transcode = converted.length === 1 && converted[0].preparation === 'transcode';
    updateMontClipView(originalView);
    const saved = await flushSave();
    const disk = await (await fetch('/api/project')).json();
    const provenanceSaved = imported.concat(converted).every(m => disk.media.some(d => d.id === m.id && d.originalSrc === m.originalSrc && d.src === m.src));
    return {remux:true, cancelDefault, canceledUnchanged, english, transcode, saved, provenanceSaved};
  })()`);
  process.stdout.write("MONTCLIP_FLV " + JSON.stringify(result) + "\n");
  if (!Object.values(result).every(x => x === true)) throw new Error("FLV smoke failed");
};
