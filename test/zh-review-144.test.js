'use strict';
/* DD's review of PR #144: the export dialog's real renderer must show the v2 engine notes;
   help search matches both the shown language and the saved English source; narrow timecode
   labels never wrap one character per line. These tests call the real functions, not just keys. */
const test = require('node:test'), a = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const ROOT = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'style.css'), 'utf8');
const view = require('../ui-preferences');
const Z = require('./zh-shown');
const strip = (s) => String(s).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const fn = (name, next) => app.slice(app.indexOf(`function ${name}(`), app.indexOf(next, app.indexOf(`function ${name}(`)));

test('renderExportEngineText() really writes the fast and WebCodecs notes into the dialog (#263: they say what the export does)', () => {
  const BgExport = require('../bg-export');
  for (const [blocker, fast] of [[null, '用 FFmpeg 导出，每一帧都准。开始后可以收起进度窗口，接着剪，导出会继续做。成片是你点「导出」那一刻的样子，之后的改动不会进这个文件。'],
    ['BG_REMOVE', '这次没法一边导出一边剪（用了 AI 抠像）。导出期间请别关闭 MontClip 窗口，等它做完再接着剪。']]) {
    const nodes = { engineFastNote: { textContent: '' }, engineWebCodecsNote: { textContent: '' } };
    const render = new Function('state', 'getExportFrame', 'uiText', '$', 'els', 'MontClipBgExport', 'fastExportBlocker',
      fn('renderExportEngineText', '\nasync function openExportSetup') + '\nreturn renderExportEngineText;')(
        { connected: true, ffmpeg: true, webCodecs: true }, () => null,
        (key) => view.t('zh-CN', key), (id) => nodes[id], { engineRealtime: null }, BgExport, () => blocker);
    render();
    a.equal(nodes.engineFastNote.textContent, fast);
    a.equal(nodes.engineWebCodecsNote.textContent, '每一帧都准。画面由浏览器编码，再由 MontClip 打包成视频文件。需要较新的 Chromium 内核浏览器，也要装好 FFmpeg。导出期间请别关闭 MontClip 窗口，等它做完再接着剪。');
  }
});

test('the running Fast and WebCodecs exports use their notes: in this window, or in the background (#263)', () => {
  a.ok(app.includes('MontClipBgExport.noteKey("fast", fastExportBlocker() || "NO_WORKER")'));
  a.match(app, /els\.exportNote\.textContent = uiText\("own\.bg-progress-note"\);/);
  a.match(app, /els\.exportNote\.textContent = uiText\("term\.engine-webcodecs-note"\);/);
});

function helpWorld(language) {
  const sections = [];
  for (const sm of html.matchAll(/<section class="keys-sec">([\s\S]*?)<\/section>/g)) {
    const body = sm[1], hm = body.match(/<h3([^>]*)>([\s\S]*?)<\/h3>/);
    const key = (hm[1].match(/data-i18n="([^"]+)"/) || [])[1], tail = (hm[1].match(/data-i18n-tail="([^"]+)"/) || [])[1];
    const head = key ? view.t(language, key) : Z.shown(hm[0], language).map((x) => x.text).join(' ');
    const h3 = { textContent: head, dataset: key ? { i18n: key } : tail ? { i18nTail: tail } : {},
      querySelectorAll: () => [...hm[2].matchAll(/<span[^>]*data-i18n="([^"]+)"/g)].map((m) => ({ dataset: { i18n: m[1] } })) };
    const rows = [];
    for (const rm of body.matchAll(/<tr><td(?:\s[^>]*)?>[\s\S]*?<\/td>(<td[^>]*>)([\s\S]*?)<\/td><\/tr>/g)) {
      // the left cell as the page shows it (its data-i18n markers applied, #145), and its keyed parts
      const leftHtml = rm[0].slice(4, rm[0].indexOf(rm[1]));
      const left = Z.shown(leftHtml, language).map((x) => x.text).join(' ');
      const marked = [...leftHtml.matchAll(/<(?:span|b)[^>]*data-i18n="([^"]+)"/g)].map((m) => ({ dataset: { i18n: m[1] } }));
      const own = (rm[1].match(/data-i18n-html="([^"]+)"/) || [])[1];
      const shown = own && language === 'zh-CN' ? view.t('zh-CN', own) : strip(rm[2]);
      const keyTd = { textContent: left, dataset: { i18n: (leftHtml.match(/^<td[^>]*data-i18n="([^"]+)"/) || [])[1] }, querySelectorAll: () => marked };
      const td = { textContent: shown, dataset: { i18nHtmlOrig: rm[2] }, querySelectorAll: () => [] };
      const cls = new Set();
      rows.push({ classList: { toggle(c, off) { off ? cls.add(c) : cls.delete(c); } },
        hidden: () => cls.has('hidden'), querySelectorAll: (sel) => sel === 'td' ? [keyTd, td] : [] });
    }
    const cls = new Set();
    sections.push({ querySelector: (sel) => sel === 'h3' ? h3 : null, querySelectorAll: (sel) => sel === 'tr' ? rows : [],
      classList: { toggle(c, off) { off ? cls.add(c) : cls.delete(c); } }, rows });
  }
  const filter = { value: '' }, empty = { classList: { toggle() {} } };
  const run = new Function('$', 'MontClipView', fn('filterHelp', '\n$("helpFilter").addEventListener') + '\nreturn filterHelp;')(
    (id) => id === 'helpFilter' ? filter : id === 'helpKeys' ? { querySelectorAll: () => sections } : empty, view);
  return (query) => { filter.value = query; run(); return sections.flatMap((s) => s.rows).filter((r) => !r.hidden()).length; };
}

test('help search also reads the saved English source: English words do not regress in the Chinese UI', () => {
  const zh = helpWorld('zh-CN'), en = helpWorld('en');   // the en count is main's behaviour, before translation
  for (const word of ['marker', 'trim', 'ripple'])
    a.ok(zh(word) >= en(word), `${word}: zh-CN finds ${zh(word)} rows, the English UI finds ${en(word)}`);
  a.ok(en('marker') >= 9, 'marker on main behaviour: ' + en('marker'));
});

test('Rea\'s examples find at least one row in each language, including English words in the Chinese UI', () => {
  a.equal(view.t('zh-CN', 'term.filter-e-g-marker-trim-mask'), '筛选 — 例如：标记、关键帧、字幕');
  a.equal(view.t('en', 'term.filter-e-g-marker-trim-mask'), 'Filter — e.g. marker, keyframe, caption');
  const zh = helpWorld('zh-CN'), en = helpWorld('en');
  for (const word of ['标记', '关键帧', '字幕']) a.ok(zh(word) >= 1, 'zh-CN search ' + word);
  for (const word of ['marker', 'keyframe', 'caption']) {
    a.ok(en(word) >= 1, 'en search ' + word);
    a.ok(zh(word) >= 1, 'zh-CN search English source ' + word);
  }
});

test('the IN / DUR / OUT labels never wrap one character per line', () => {
  const block = css.slice(css.indexOf('.tc-io-lab {'), css.indexOf('}', css.indexOf('.tc-io-lab {')));
  a.match(block, /white-space:\s*nowrap;/);
});
