'use strict';
/* The tester notes as they go into the zip (desktop/package-win.cjs): placeholders filled ({version} this build,
   {exe} the program, {repo} the repository); when the packaged app hides + URL (#58), JJ's alternative URL line
   (url-hidden.json) replaces v3's, and nothing else changes; UTF-8 with a BOM and CRLF so Notepad shows it right. */
const fs = require('node:fs'), path = require('node:path');
const ALT = require('./url-hidden.json');
/** Does this app.js hide + URL in the desktop app? */
const hidesUrl = (appJs) => appJs.includes(ALT.marker);
/** → {text (with BOM and CRLF), variant: "v3" | "v3 + JJ's URL line"} */
function render(raw, { lang, buildId, urlHidden }) {
  let text = raw.replace(/\r\n/g, '\n').replace(/\{version\}/g, buildId).replace(/\{exe\}/g, 'MontClip.exe')
    .replace(/\{repo\}/g, 'https://github.com/good-night-oppie/MontClip');
  let variant = 'v3';
  if (urlHidden) {
    const { from, to } = ALT[lang];
    if (text.split(from).length !== 2) throw Error(`the URL line to replace is not in the ${lang} notes exactly once`);
    text = text.replace(from, to); variant = "v3 + JJ's URL line";
  }
  if (/\{[a-z0-9]+\}/.test(text)) throw Error(lang + ' notes still have a placeholder');
  if (/落地前|实施侧/.test(text)) throw Error(lang + ' notes hold the internal checklist');
  return { text: '\uFEFF' + text.replace(/\n/g, '\r\n'), variant };
}
const read = (lang) => fs.readFileSync(path.join(__dirname, lang + '.txt'), 'utf8');
module.exports = { render, hidesUrl, read, ALT };
