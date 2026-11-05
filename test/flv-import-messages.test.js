'use strict';
// JJ, review of #9 19377acd (2026-11-02): the FLV import failures were one bilingual line, and one of
// them asked for "explicit consent" that no screen can give yet. The server sends a reason code; the
// page says it in the interface language, one key per reason: timing, disk full, upload failed (and the
// others below), and "needs the desktop app" when no editor service runs.
const test = require('node:test'), a = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const V = require('../ui-preferences'), P = require('../prepare-media');
const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

const JJ = {
  'zh-CN': {
    flvTimingUnverified: '这个 FLV 这次没导进来：MontClip 没法确认它的时间是否完整。换一个录完整的文件，或者先把它转成 MP4 再导入。',
    flvNeedsDesktop: '导入 FLV 需要用 MontClip 桌面版打开。',
  },
  en: {
    flvTimingUnverified: 'This FLV was not imported: MontClip could not confirm its timing is complete. Try a fully recorded file, or convert it to MP4 first.',
    flvNeedsDesktop: 'Importing FLV needs the MontClip desktop app.',
  },
};
const CASES = {
  FLV_TIMELINE_GAP: 'flvTimingUnverified', FLV_READABLE_CONSENT_REQUIRED: 'flvTimingUnverified',
  // JJ's error table v2 (2026-11-04, #129): disk full is its own row (errDiskFull); FLV_PROBE_FAILED says the recording
  // can't be read (flvUnreadable); anything else is the table's last row, which flvUploadFailed now says (test/error-text.test.js)
  FLV_DISK_FULL: 'errDiskFull', NO_SERVER: 'flvNeedsDesktop',
  FLV_TRANSCODE_REQUIRED: 'flvNeedsConvert', FLV_STREAMS_UNSUPPORTED: 'flvNeedsConvert',
  FLV_COMPONENT_MISSING: 'flvComponentMissing',
  UPLOAD_FAILED: 'flvUploadFailed', IMPORT_FAILED: 'flvUploadFailed', FLV_PROBE_FAILED: 'flvUnreadable',
  FLV_PREPARATION_FAILED: 'flvUploadFailed', SOMETHING_NEW: 'flvUploadFailed', '': 'flvUploadFailed',
};

test("JJ's wording, verbatim, with English for every key", () => {
  for (const [lang, keys] of Object.entries(JJ)) for (const [k, v] of Object.entries(keys)) a.equal(V.text[lang][k], v, lang + ' ' + k);
  for (const k of new Set(Object.values(CASES))) for (const lang of ['zh-CN', 'en']) a.ok(V.text[lang][k], lang + ' ' + k);
});

test('each reason has its own key; upload failure, disk full and timing are told apart', () => {
  for (const [code, key] of Object.entries(CASES)) for (const lang of ['zh-CN', 'en'])
    a.equal(V.flvImportMessage(lang, code), V.text[lang][key], `${lang} ${code}`);
  const zh = (c) => V.flvImportMessage('zh-CN', c);
  a.equal(new Set([zh('UPLOAD_FAILED'), zh('FLV_DISK_FULL'), zh('FLV_TIMELINE_GAP')]).size, 3);
});

test('zh-CN has no English sentence; nothing asks for consent no screen can give', () => {
  for (const key of new Set(Object.values(CASES))) {
    const zh = V.text['zh-CN'][key], en = V.text.en[key];
    a.equal(zh.replace(/FLV|MP4|MontClip/g, '').match(/[A-Za-z]{2,}/), null, 'zh ' + key + ': ' + zh);
    a.ok(!/[一-鿿]/.test(en), 'en ' + key);
    a.ok(!/授权|同意|consent|permission|authori[sz]e/i.test(zh + en), key + ' asks for nothing the user cannot give');
  }
});

test('the page shows the code the server sent, in the interface language', () => {
  const at = app.indexOf('async function importFiles('), body = app.slice(at, app.indexOf('\n}\n', at));
  a.ok(!/FLV 未导入|FLV not imported|明确授权|explicit consent/.test(body), 'the old bilingual lines are gone');
  a.match(body, /MontClipView\.flvImportMessage\(mcView\.get\(\)\.language, /);
  a.match(body, /flvFailure\("NO_SERVER"\)/, 'no editor service: needs the desktop app');
  a.match(body, /"UPLOAD_FAILED"/, 'a network failure has its own code');
});

test("the server's codes: disk full, consent-gated reasons and anything else", () => {
  a.equal(P.publicPreparationError(Object.assign(new Error('x'), { code: 'ENOSPC' })).code, 'FLV_DISK_FULL');
  a.equal(P.publicPreparationError(Object.assign(new Error('x'), { code: 'FLV_TIMELINE_GAP' })).code, 'FLV_TIMELINE_GAP');
  a.equal(P.publicPreparationError(Object.assign(new Error('x'), { code: 'EACCES' })).code, 'IMPORT_FAILED');
});

// JJ (8 PRs, documents/2026-11-03-MontClip-8个PR文案确认-JJ.md, sha256 3adc874a…): the preparing phase says what the
// streamer gets, not 兼容副本
test("JJ (8 PRs): 正在转成能剪的格式…", () => {
  a.equal(V.t('zh-CN', 'flvPhasePrepare'), '正在转成能剪的格式…');
  a.equal(V.t('en', 'flvPhasePrepare'), 'Converting to a format you can edit…');
  for (const l of ['zh-CN', 'en']) for (const s of Object.values(V.text[l])) a.ok(typeof s !== 'string' || !s.includes('兼容副本'), s);
});
