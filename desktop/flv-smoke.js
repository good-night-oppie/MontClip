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
    const chineseCopy = cancelDialog.querySelector('p').textContent === MontClipView.flvMessage('FLV_TRANSCODE_REQUIRED','zh-CN');
    cancelDialog.querySelector('button').click();
    await canceled;
    const canceledUnchanged = before === JSON.stringify(projectJSON());
    updateMontClipView({language:'en'});
    const accepted = importFiles([legacy]);
    const acceptDialog = await waitDialog();
    const english = acceptDialog.textContent.includes('Create compatible copy') && acceptDialog.querySelector('p').textContent === MontClipView.flvMessage('FLV_TRANSCODE_REQUIRED','en');
    acceptDialog.querySelectorAll('button')[1].click();
    const converted = await accepted;
    const transcode = converted.length === 1 && converted[0].preparation === 'transcode';
    let batchCancelOnlyOne = true;
    for (const language of ['zh-CN','en']) {
      updateMontClipView({language});
      const priorCount = project.media.length;
      const compatible = await file('flv-compatible.flv');
      const batch = importFiles([legacy, compatible]);
      const dialog = await waitDialog(); dialog.querySelector('button').click();
      const added = await batch;
      batchCancelOnlyOne &&= added.length === 1 && added[0].name === compatible.name && project.media.length === priorCount + 1;
    }
    const priorSingleCount = project.media.length;
    const singleEnglishCancel = importFiles([legacy]);
    (await waitDialog()).querySelector('button').click();
    const singleEnglishSkipped = (await singleEnglishCancel).length === 0 && project.media.length === priorSingleCount;
    // Finish real import metadata/save work before injecting service failures.
    // Fault cases must not temporarily disconnect an unrelated pending save.
    const settleDeadline = Date.now() + 10000;
    while (mediaInfoBusy && Date.now() < settleDeadline) await new Promise(r => setTimeout(r, 20));
    if (mediaInfoBusy || !await flushSave()) throw Error('Imports did not settle before failure injection');
    const beforeFaults = await (await fetch('/api/project')).json();
    if (!imported.concat(converted).every(m => beforeFaults.media.some(d => d.id === m.id && d.originalSrc === m.originalSrc && d.src === m.src)))
      throw Error('Import provenance missing before failure injection');
    const realFetch = window.fetch, realToast = toast;
    let localizedErrors = true;
    try {
      for (const language of ['zh-CN','en']) {
        updateMontClipView({language});
        for (const code of ['FLV_PROBE_FAILED','FLV_STREAMS_UNSUPPORTED','FLV_PREPARATION_FAILED','FLV_COMPONENT_MISSING','UNKNOWN']) {
          let shown;
          toast = message => { shown = message; };
          window.fetch = (url, options) => String(url).startsWith('/api/upload') ? Promise.resolve(new Response(JSON.stringify({code,error:'C:/private/secret path'}), {status:500, headers:{'Content-Type':'application/json'}})) : realFetch(url, options);
          await importFiles([legacy]);
          localizedErrors &&= shown === MontClipView.flvMessage(code,language) && !shown.includes('private');
        }
        let shown;
        toast = message => {shown=message;};
        window.fetch = (url, options) => String(url).startsWith('/api/upload') ? Promise.reject(new TypeError('Failed to fetch internal path')) : realFetch(url,options);
        await importFiles([legacy]);
        localizedErrors &&= shown === MontClipView.flvMessage('FLV_SERVICE_UNAVAILABLE',language);
        const connected = state.connected;
        try {
          state.connected=false;
          await importFiles([legacy]);
          localizedErrors &&= shown === MontClipView.flvMessage('FLV_SERVICE_UNAVAILABLE',language);
        } finally {state.connected=connected;}
      }
    } finally {window.fetch = realFetch; toast = realToast;}
    updateMontClipView(originalView);
    const saved = await flushSave();
    const disk = await (await fetch('/api/project')).json();
    const provenanceSaved = imported.concat(converted).every(m => disk.media.some(d => d.id === m.id && d.originalSrc === m.originalSrc && d.src === m.src));
    return {remux:true, cancelDefault, chineseCopy, canceledUnchanged, english, transcode, batchCancelOnlyOne, singleEnglishSkipped, localizedErrors, saved, provenanceSaved};
  })()`);
  process.stdout.write("MONTCLIP_FLV " + JSON.stringify(result) + "\n");
  if (!Object.values(result).every(x => x === true)) throw new Error("FLV smoke failed");
};
