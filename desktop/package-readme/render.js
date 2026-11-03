'use strict';
/* The tester notes as they go into the zip (desktop/package-win.cjs): placeholders filled ({version} this build,
   {exe} the program, {repo} the repository); when the packaged app hides + URL (#58), JJ's alternative URL line
   (url-hidden.json) replaces the written one; when the packaged app really has the fix that removes each export's
   hidden copy, the line on deleting those copies goes with its line break (exports-fixed.json; JJ: no replacement).
   Nothing else changes. UTF-8 with a BOM and CRLF so Notepad shows it right. */
const fs = require('node:fs'), path = require('node:path');
const ALT = require('./url-hidden.json'), COPY = require('./exports-fixed.json');
/** Does this app.js hide + URL in the desktop app? */
const hidesUrl = (appJs) => appJs.includes(ALT.marker);
/** Is the registered-export fix really there? desktop/main.js wires export-downloads.js and takes the page's
 *  expectation, that module removes the copy, and server.js registers each export it makes. Not a PR number. */
const dropsExportCopy = (mainJs, exportDownloadsJs, serverJs) => { const m = String(mainJs || ''); return m.includes(COPY.marker) && m.includes(COPY.expects) &&
  String(exportDownloadsJs || '').includes(COPY.removes) && String(serverJs || '').includes(COPY.registers); };
/** → {text (with BOM and CRLF), variant: "as written" | "JJ's URL line" | "no export-copy line" | both, joined by " + "} */
function render(raw, { lang, buildId, urlHidden, copyGone }) {
  let text = raw.replace(/\r\n/g, '\n').replace(/\{version\}/g, buildId).replace(/\{exe\}/g, 'MontClip.exe')
    .replace(/\{repo\}/g, 'https://github.com/good-night-oppie/MontClip');
  const variant = [];
  if (urlHidden) {
    const { from, to } = ALT[lang];
    if (text.split(from).length !== 2) throw Error(`the URL line to replace is not in the ${lang} notes exactly once`);
    text = text.replace(from, to); variant.push("JJ's URL line");
  }
  if (copyGone) {
    const { from, to } = COPY[lang], lines = text.split('\n');
    if (lines.filter((l) => l === from).length !== 1) throw Error(`the export-copy line is not in the ${lang} notes exactly once`);
    text = lines.flatMap((l) => (l === from ? (to ? [to] : []) : [l])).join('\n');   // empty: the line and its break go
    variant.push(to ? "JJ's export-copy line" : 'no export-copy line');
  }
  if (/\{[a-z0-9]+\}/.test(text)) throw Error(lang + ' notes still have a placeholder');
  if (/落地前|实施侧/.test(text)) throw Error(lang + ' notes hold the internal checklist');
  return { text: '\uFEFF' + text.replace(/\n/g, '\r\n'), variant: variant.join(' + ') || 'as written' };
}
const read = (lang) => fs.readFileSync(path.join(__dirname, lang + '.txt'), 'utf8');
module.exports = { render, hidesUrl, dropsExportCopy, read, ALT, COPY };
