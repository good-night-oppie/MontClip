'use strict';
// VV / Deja 2026-11-02: the sentence-selection dialog spoke both languages at once ("按句选择保留片段 /
// Keep sentences"). It now says each line in the interface language, through own.* keys (JJ to review).
// The range planner's errors keep their bilingual message for agents and MCP, and carry a code the
// dialog says in the interface language.
const test = require('node:test'), a = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const V = require('../ui-preferences'), Plan = require('../range-plan');
const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const at = app.indexOf('async function showSentenceSelection()'), body = app.slice(at, app.indexOf('\n}\n', at));
const KEYS = ['sd-busy', 'sd-no-captions', 'sd-title', 'sd-intro', 'sd-ranges', 'sd-preview', 'sd-apply', 'sd-cancel', 'sd-range-line',
  'sd-summary', 'sd-partial', 'sd-partial-many', 'sd-changed', 'sd-done', 'rp-invalid', 'rp-exceeds', 'rp-locked', 'rp-nested', 'rp-short-media', 'rp-source-changed', 'rp-source-invalid', 'rp-source-loop'];

test('the dialog has no line in both languages: every string comes from a key', () => {
  const literals = body.match(/"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`/g) || [];
  for (const s of literals) a.ok(!/[一-鿿]/.test(s), 'no Chinese written into the dialog: ' + s.slice(0, 80));
  for (const k of KEYS.filter((k) => k.startsWith('sd-'))) a.ok(body.includes(`"own.${k}"`), 'uses own.' + k);
  a.match(body, /uiText\("own\.rp-" \+ error\.code|ownError\(error\)/, 'planner errors are said by code');
});

test('each key exists in both languages; Chinese has no English sentence, English no Chinese', () => {
  for (const k of KEYS) {
    const zh = V.text['zh-CN']['own.' + k], en = V.text.en['own.' + k];
    a.ok(zh && en, k);
    a.equal(zh.replace(/SRT|\{\w+\}/g, '').match(/[A-Za-z]{2,}/), null, 'zh ' + k + ': ' + zh);
    a.ok(!/[一-鿿]/.test(en), 'en ' + k + ': ' + en);
  }
  // the old Chinese wording is kept where it was already right
  a.equal(V.text['zh-CN']['own.sd-title'], '按句选择保留片段');
  a.equal(V.text['zh-CN']['own.sd-partial'], '{n} 句只保留了一部分声音，请检查字幕和开头结尾。');
});

test("the planner's errors carry a code; the message stays as it was for agents", () => {
  const d = { fps: 30, clips: [{ id: 'v', kind: 'video', mediaId: 'm', track: 'V1', start: 0, in: 0, duration: 2, props: {} }], media: [{ id: 'm', kind: 'video', src: '/media/a.mp4', duration: 10 }] };
  const code = (ranges, doc = d) => { try { Plan.create(doc, ranges); return null; } catch (e) { return [e.code, e.message]; } };
  a.deepEqual(code([{ from: 1, to: 0.5 }]), ['invalid', 'Select valid ordered ranges / 请选择有效的有序区间']);
  a.equal(code([{ from: 0, to: 5 }])[0], 'exceeds');
  a.equal(code([{ from: 0, to: 1 }], { ...d, lockedTracks: ['V1'] })[0], 'locked');
  a.equal(code([{ from: 0, to: 1 }], { ...d, clips: [{ ...d.clips[0], parent: 'x' }] })[0], 'nested');
  a.equal(code([{ from: 0, to: 1 }], { ...d, media: [{ ...d.media[0], duration: 1 }] })[0], 'source-loop');
  a.equal(code([{ from: 1.97, to: 2 }])[0], 'short-media', 'a 30 ms piece of the clip: above the boundary tolerance, below the shortest clip');
});
