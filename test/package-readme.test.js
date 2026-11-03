'use strict';
// The tester notes in the internal package (desktop/package-readme): JJ's v3 with its placeholders filled, and — only
// when the packaged app hides + URL (#58) — JJ's alternative URL line instead of v3's. Nothing else may change.
const test = require('node:test'), a = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const R = require('../desktop/package-readme/render.js');

for (const lang of ['zh-CN', 'en']) {
  test(`${lang}: placeholders filled, BOM and CRLF, no internal checklist`, () => {
    const { text, variant } = R.render(R.read(lang), { lang, buildId: '20261103-abc1234', urlHidden: false });
    a.equal(variant, 'v3');
    a.equal(text.charCodeAt(0), 0xfeff);
    a.ok(!/[^\r]\n/.test(text), 'CRLF only');
    a.ok(text.includes('20261103-abc1234') && text.includes('MontClip.exe'));
    a.doesNotMatch(text, /\{[a-z0-9]+\}|落地前|实施侧/);
  });
  test(`${lang}: with + URL hidden, exactly JJ's line changes and nothing else`, () => {
    const v3 = R.render(R.read(lang), { lang, buildId: 'X', urlHidden: false }).text.split('\r\n');
    const alt = R.render(R.read(lang), { lang, buildId: 'X', urlHidden: true });
    a.equal(alt.variant, "v3 + JJ's URL line");
    const lines = alt.text.split('\r\n');
    a.equal(lines.length, v3.length);
    const changed = lines.map((l, i) => [v3[i], l]).filter(([x, y]) => x !== y);
    a.deepEqual(changed, [[R.ALT[lang].from, R.ALT[lang].to]]);
  });
}

test("JJ's alternative lines word for word (Deja, 2026-11-02)", () => {
  a.equal(R.ALT['zh-CN'].to, '- 这一版不能从网址导入素材，请导入电脑里的文件。');
  a.equal(R.ALT.en.to, '- This build cannot import media from a URL. Import files from your computer instead.');
});

test('the switch follows the app: the marker is the line #58 adds to app.js', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  a.equal(R.hidesUrl(app), app.includes('if (window.montclipViewSettings) { const urlButton = $("btnImportUrl"); if (urlButton) urlButton.hidden = true; }'));
  a.equal(R.hidesUrl('x\n' + R.ALT.marker + '\ny'), true);
  a.equal(R.hidesUrl('$("btnImportUrl")?.addEventListener("click", openImportUrl);'), false);
});
