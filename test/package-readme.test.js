'use strict';
// The tester notes in the internal package (desktop/package-readme): JJ's notes with their placeholders filled, and two
// switches that follow the packaged app, each changing exactly its own line and nothing else:
//  - the app hides + URL (#58): JJ's alternative URL line instead of the written one (url-hidden.json);
//  - the app no longer keeps a hidden copy of each export (#58's export-downloads.js): the line under 导出视频要注意 /
//    the export notes on deleting those copies goes, or gives way to JJ's replacement (export-copy.json; Deja,
//    2026-11-02: JJ supplies the wording). The four combinations are all tested, and BUILD-INFO.json records which.
const test = require('node:test'), a = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const R = require('../desktop/package-readme/render.js');
const ROOT = path.join(__dirname, '..');
const CASES = [
  { urlHidden: false, copyGone: false, variant: 'as written' },
  { urlHidden: true, copyGone: false, variant: "JJ's URL line" },
  { urlHidden: false, copyGone: true, variant: 'no export-copy line' },
  { urlHidden: true, copyGone: true, variant: "JJ's URL line + no export-copy line" },
];

for (const lang of ['zh-CN', 'en']) {
  test(`${lang}: placeholders filled, BOM and CRLF, no internal checklist`, () => {
    const { text, variant } = R.render(R.read(lang), { lang, buildId: '20261103-abc1234', urlHidden: false, copyGone: false });
    a.equal(variant, 'as written');
    a.equal(text.charCodeAt(0), 0xfeff);
    a.ok(!/[^\r]\n/.test(text), 'CRLF only');
    a.ok(text.includes('20261103-abc1234') && text.includes('MontClip.exe'));
    a.doesNotMatch(text, /\{[a-z0-9]+\}|落地前|实施侧/);
  });
  for (const c of CASES) {
    test(`${lang}: url hidden ${c.urlHidden}, export copy gone ${c.copyGone} — only those lines change`, () => {
      const base = R.render(R.read(lang), { lang, buildId: 'X', urlHidden: false, copyGone: false }).text.split('\r\n');
      const got = R.render(R.read(lang), { lang, buildId: 'X', urlHidden: c.urlHidden, copyGone: c.copyGone });
      a.equal(got.variant, c.variant);
      const lines = got.text.split('\r\n');
      // what is left of the written notes, line by line
      const expected = [];
      for (const l of base) {
        if (c.urlHidden && l === R.ALT[lang].from) expected.push(R.ALT[lang].to);
        else if (c.copyGone && l === R.COPY[lang].from) { if (R.COPY[lang].to != null) expected.push(R.COPY[lang].to); }
        else expected.push(l);
      }
      a.deepEqual(lines, expected);
      a.equal(got.text.includes(R.ALT[lang].from), !c.urlHidden);
      a.equal(got.text.includes(R.COPY[lang].from), !c.copyGone);
      // the copy line's folder is only there while the app keeps copies
      a.equal(got.text.includes('%APPDATA%\\MontClip\\workspace\\exports'), !c.copyGone || (R.COPY[lang].to || '').includes('workspace\\exports'));
    });
  }
}

test("JJ's alternative URL lines word for word (Deja, 2026-11-02)", () => {
  a.equal(R.ALT['zh-CN'].to, '- 这一版不能从网址导入素材，请导入电脑里的文件。');
  a.equal(R.ALT.en.to, '- This build cannot import media from a URL. Import files from your computer instead.');
});

test('the export-copy line is in the notes exactly once per language, and its replacement waits for JJ', () => {
  for (const lang of ['zh-CN', 'en']) {
    const lines = R.read(lang).replace(/\r\n/g, '\n').split('\n');
    a.equal(lines.filter((l) => l === R.COPY[lang].from).length, 1, lang);
    a.ok(R.COPY[lang].from.includes('%APPDATA%\\MontClip\\workspace\\exports'), lang);
  }
  // until JJ sends the wording, the whole line goes (Deja); the json says so
  a.match(R.COPY.pending || '', /JJ/);
});

test('the switches follow the app: + URL hidden (app.js), no export copy (desktop/main.js)', () => {
  const app = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8'), main = fs.readFileSync(path.join(ROOT, 'desktop', 'main.js'), 'utf8');
  a.equal(R.hidesUrl(app), app.includes('if (window.montclipViewSettings) { const urlButton = $("btnImportUrl"); if (urlButton) urlButton.hidden = true; }'));
  a.equal(R.hidesUrl('x\n' + R.ALT.marker + '\ny'), true);
  a.equal(R.hidesUrl('$("btnImportUrl")?.addEventListener("click", openImportUrl);'), false);
  a.equal(R.dropsExportCopy(main), main.includes('require("./export-downloads").attach(item,'));
  a.equal(R.dropsExportCopy('x\n    require("./export-downloads").attach(item, { origin });\n'), true);
  a.equal(R.dropsExportCopy('ses.on("will-download", (event, item, contents) => {});'), false);
});

test('the package records which of the four it used, and its smoke checks both lines against the app', () => {
  const win = fs.readFileSync(path.join(ROOT, 'desktop', 'package-win.cjs'), 'utf8');
  a.match(win, /copyGone = Readme\.dropsExportCopy\(/);
  a.match(win, /exportCopyGone: copyGone/);
  const smoke = fs.readFileSync(path.join(ROOT, 'desktop', 'package-smoke.cjs'), 'utf8');
  a.match(smoke, /out\.readmeCopyLine/);
  a.match(smoke, /the export-copy line matches the app/);
});
