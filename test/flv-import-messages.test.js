'use strict';
// JJ, review of #9 19377acd (2026-11-02): the FLV import failures were one bilingual line, and one of
// them asked for "explicit consent" that no screen can give yet. The server sends a reason code; the
// page says it in the interface language, one key per reason: timing, disk full, upload failed (and the
// others below), and "needs the desktop app" when no editor service runs.
const test = require('node:test'), a = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const V = require('../ui-preferences'), P = require('../prepare-media');
const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

// JJ v2, 2026-11-04: europa ~/montclip-labels/jj/2026-11-04-错误白话表-默认条数-发到手机-JJ.md, sha256
// d99c25d114f865bd6388bc98822b04308f6ca96c3e3ac02a802dd92cc736cb13 (v1, 68f8f88e…, kept beside it). The streamer cannot
// convert a file herself: where MontClip can, it says so and offers 〔帮我转〕〔先不转〕. Verbatim.
const JJ = {
  'zh-CN': {
    flvTimingUnverified: '这场录像中间断过（可能断过网，或者录制停过），要先转一下才能剪，MontClip 可以替你转。转好的是一份新文件，原片不动；要等几分钟。',
    flvNeedsConvert: '这个录像要先转一下格式才能剪，MontClip 可以替你转。转好的是一份新文件，原片不动；画质基本不变，要等几分钟。',
    flvNoEncoder: '这台电脑上找不到 MontClip 能用的视频编码器，所以这次没能转换。可以先更新显卡驱动再试。',
    // JJ 定稿 2026-11-05 (Deja 代贴 on #130, replacing 「已经接上」: the break is held — a still picture and silence — not squeezed out)
    flvConverted: '已经转好了。{time} 这里录像断了约 {N} 秒：这几秒画面会停住、没有声音，前后的时间是对的。不想要可以剪掉。',
    flvConvertedMany: '已经转好了。录像一共断了 {k} 处，加起来约 {N} 秒：这些地方画面会停住、没有声音，前后的时间是对的。不想要可以剪掉。',
    flvConvert: '帮我转', flvNotNow: '先不转',
    flvNeedsDesktop: '导入 FLV 需要用 MontClip 桌面版打开。',
    flvDiskFull: '电脑空间不够，这个文件没导进来。清理一些空间后再试。',
  },
  en: {
    flvTimingUnverified: 'This recording has a break in it (the stream or the recorder may have stopped for a moment), so it needs converting before you can edit it, and MontClip can do it for you. The result is a new file and the original stays as it is; it takes a few minutes.',
    flvNeedsConvert: 'This recording needs converting before you can edit it, and MontClip can do it for you. The result is a new file and the original stays as it is. The picture stays about the same; it takes a few minutes.',
    flvNoEncoder: "This computer has no video encoder MontClip can use, so it couldn't convert this time. Update the graphics driver and try again.",
    flvConverted: "Converted. The recording dropped out for about {N} s at {time}: for those seconds the picture freezes and there's no sound, and the timing before and after is right. You can cut it out if you don't want it.",
    flvConvertedMany: "Converted. The recording dropped out {k} times, about {N} s in total: in those places the picture freezes and there's no sound, and the timing around them is right. You can cut them out if you don't want them.",
    flvNeedsDesktop: 'Importing FLV needs the MontClip desktop app.',
  },
};
const CASES = {
  // a break, an unconfirmed end and a codec MontClip cannot cut are converted on her yes (JJ v2)
  FLV_TIMELINE_GAP: 'flvTimingUnverified', FLV_FIX_UNVERIFIED: 'flvFixUnverified', FLV_READABLE_CONSENT_REQUIRED: 'flvTimingUnverified',
  FLV_DISK_FULL: 'flvDiskFull', NO_SERVER: 'flvNeedsDesktop',
  // more than one picture or sound track: the conversion does not handle it, so 「现在导不进来」 and why
  FLV_TRANSCODE_REQUIRED: 'flvNeedsConvert', FLV_STREAMS_UNSUPPORTED: 'flvStreamsUnsupported', FLV_ENCODER_MISSING: 'flvNoEncoder',
  FLV_SOURCE_DAMAGED: 'flvSourceDamaged',
  FLV_COMPONENT_MISSING: 'flvComponentMissing',
  UPLOAD_FAILED: 'flvUploadFailed', IMPORT_FAILED: 'flvUploadFailed', FLV_PROBE_FAILED: 'flvUploadFailed',
  FLV_PREPARATION_FAILED: 'flvUploadFailed', SOMETHING_NEW: 'flvUploadFailed', '': 'flvUploadFailed',
};

test("JJ's wording, verbatim, with English for every key", () => {
  for (const [lang, keys] of Object.entries(JJ)) for (const [k, v] of Object.entries(keys)) a.equal(V.text[lang][k], v, lang + ' ' + k);
  for (const k of new Set(Object.values(CASES))) for (const lang of ['zh-CN', 'en']) a.ok(V.text[lang][k], lang + ' ' + k);
});

test('JJ v2: nothing tells the streamer to convert the file herself; JJ’s two removed v1 sentences are not there', () => {
  for (const lang of ['zh-CN', 'en']) for (const [k, s] of Object.entries(V.text[lang])) if (typeof s === 'string' && /^flv|^export/.test(k)) {
    a.ok(!/先把它转成 MP4|先转成 MP4 再导入|convert it to MP4 first|Convert it to MP4 first/.test(s), `${lang} ${k}: ${s}`);
    a.ok(!/媒体功能包|Media Feature Pack|同一场.*(分成|其他)文件/.test(s) || k.startsWith('h264'), `${lang} ${k}`);
  }
  a.match(V.t('zh-CN', 'flvStreamsUnsupported'), /^这个录像现在导不进来：/, 'what MontClip cannot convert says so');
  a.equal(V.flvConvertedMessage('zh-CN', [{ stream: 'video', at: 30, len: 2 }, { stream: 'audio', at: 30, len: 2 }]), '已经转好了。00:30 这里录像断了约 2 秒：这几秒画面会停住、没有声音，前后的时间是对的。不想要可以剪掉。', 'one break both streams share is one');
  a.equal(V.flvConvertedMessage('zh-CN', [{ stream: 'video', at: 3, len: 0.6 }, { stream: 'video', at: 40, len: 1.25 }]), '已经转好了。录像一共断了 2 处，加起来约 1.9 秒：这些地方画面会停住、没有声音，前后的时间是对的。不想要可以剪掉。');
  a.equal(V.flvConvertedMessage('en', [{ stream: 'video', at: 3, len: 0.6 }]), "Converted. The recording dropped out for about 0.6 s at 00:03: for those seconds the picture freezes and there's no sound, and the timing before and after is right. You can cut it out if you don't want it.");
  // QQ (#130 point 2): the conversion check allows ±0.1 s of length (±1 frame), said as such
  a.match(V.t('zh-CN', 'flvFixBy', { sec: '0.2', ms: '10' }), /要求时长差不超过 0\.1 秒、声音和画面差不超过 40 毫秒/);
  a.match(V.t('en', 'flvFixBy', { sec: '0.2', ms: '10' }), /at most 0\.1 s and 40 ms/);
});

test('zh-CN FLV and export strings: no English word of three letters or more except names', () => {
  for (const [k, s] of Object.entries(V.text['zh-CN'])) if (typeof s === 'string' && /^(flv|exportSource)/.test(k))
    a.equal(s.replace(/\{\w+\}|MontClip|FLV|MP4|H\.264/g, '').match(/[A-Za-z]{3,}/), null, k + ': ' + s);
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

// Rea's review of 064306bd (5804186201): a big break and drift together — the break is held, but picture and sound
// still move apart (drift is not corrected, Deja's decision), so the sentence must not say the timing is right.
const RIGHT = /前后的时间是对的|timing (before and after|around them) is right/;
test('after a conversion with drift, the sentence never says the timing is right; without drift it is JJ’s as before', () => {
  const one = [{ stream: 'video', at: 30, len: 2 }, { stream: 'audio', at: 30, len: 2 }], two = [{ stream: 'video', at: 3, len: 0.6 }, { stream: 'video', at: 40, len: 1.25 }];
  for (const lang of ['zh-CN', 'en']) for (const gaps of [one, two]) {
    const plain = V.flvConvertedMessage(lang, gaps), drifting = V.flvConvertedMessage(lang, gaps, 0.067);
    a.match(plain, RIGHT, lang + ': no drift keeps JJ’s sentence');
    a.doesNotMatch(drifting, RIGHT, lang + ': ' + drifting);
    a.equal(drifting, V.t(lang, gaps === one ? 'flvConvertedDrift' : 'flvConvertedDriftMany', gaps === one ? { N: '2', time: '00:30' } : { k: 2, N: '1.9' }));
  }
  a.equal(V.flvConvertedMessage('zh-CN', one, 0), V.flvConvertedMessage('zh-CN', one), 'drift 0 / missing: as before');
  a.equal(V.flvConvertedMessage('zh-CN', one, undefined), V.flvConvertedMessage('zh-CN', one));
});
