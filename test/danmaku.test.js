'use strict';
// Bilibili recording danmaku (Deja, 2026-11-02): 录播姬's XML and Bilibili's own, read in pieces, kept per recording
// in project.danmaku with the send time and the display interval apart, mapped onto the timeline for P2. Only
// synthetic XML written here — no real danmaku.
const test = require('node:test'), a = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const D = require('../danmaku');
const { readDanmakuFile } = require('../danmaku-file');
const H = require('../highlight-candidates');

const START = Date.parse('2026-11-01T20:00:00.000+08:00');
// the shape of a 录播姬 file: header elements, its own stylesheet (with markup that is not danmaku), danmaku with
// a millisecond send time and user attributes, and gifts / super chats / guard events between them
function recorderXml(list) {
  return '﻿<?xml version="1.0" encoding="utf-8"?>\n<?xml-stylesheet type="text/xsl" href="#s"?>\n<i>' +
    '<chatserver>chat.bilibili.com</chatserver><chatid>0</chatid><mission>0</mission><maxlimit>1000</maxlimit><state>0</state><real_name>0</real_name><source>0</source>\n' +
    '<BililiveRecorder version="0.0.0-synthetic" />\n' +
    '<BililiveRecorderRecordInfo roomid="1" shortid="0" name="合成主播" title="合成标题" areanameparent="a" areanamechild="b" start_time="2026-11-01T20:00:00.0000000+08:00" />\n' +
    '<BililiveRecorderXmlStyle><z:stylesheet version="1.0" id="s" xml:id="s" xmlns:z="http://www.w3.org/1999/XSL/Transform"><z:template match="/"><html><body><d p="99,1,25,1,1,0,0,0">样式里的不是弹幕</d><div>表</div></body></html></z:template></z:stylesheet></BililiveRecorderXmlStyle>\n' +
    list.map(([t, text, mode = 1]) => `<d p="${t.toFixed(3)},${mode},25,16777215,${START + Math.round(t * 1000) + 700},0,12345,0" user="合成用户" uid="12345" raw="[[0,1,25,16777215,0,0,0,&quot;&quot;,0,0,0,&quot;&quot;,0,&quot;{}&quot;],&quot;x&quot;]">${text}</d>`).join('\n') +
    '\n<gift ts="3.000" user="合成用户" uid="1" giftname="合成礼物" giftcount="1" raw="{}" />\n<sc ts="4.000" user="合成用户" uid="1" price="30" time="60" raw="{}">合成醒目留言</sc>\n<guard ts="5.000" user="u" uid="1" level="3" count="1" raw="{}" />\n</i>';
}
// Bilibili's own video danmaku XML: send time in seconds, no recorder header
function bilibiliXml(list) {
  return '<?xml version="1.0" encoding="UTF-8"?><i><chatserver>chat.bilibili.com</chatserver><chatid>1</chatid><mission>0</mission><maxlimit>3000</maxlimit><state>0</state><real_name>0</real_name><source>k-v</source>' +
    list.map(([t, text, mode = 1, color = 16777215]) => `<d p="${t},${mode},25,${color},1761998400,0,abcd1234,1000000000000000000,10">${text}</d>`).join('') + '</i>';
}

test('录播姬 XML: danmaku kept with display interval and send time apart; stylesheet, gifts and users left out', () => {
  const r = D.parse(recorderXml([[1.5, '你好'], [2.25, '<script>&amp;'.replace('<', '&lt;')], [3, '顶部', 5], [3.5, '高级', 7]]));
  a.equal(r.format, 'bililive-recorder');
  a.equal(r.recordStart, START);
  a.deepEqual(r.items.map((x) => x[0]), [1.5, 2.25, 3], 'the stylesheet\'s <d> is not a danmaku; mode 7 is skipped');
  const [t, dur, sent, mode, color, text] = r.items[0];
  a.deepEqual({ t, dur, sent, mode, color, text }, { t: 1.5, dur: D.SCROLL_SECONDS, sent: START + 1500 + 700, mode: 1, color: 0xffffff, text: '你好' },
    'shows at 1.5 s for 8 s; was sent 0.7 s before it reached the recording, an absolute time');
  a.equal(r.items[1][5], '<script>&', 'entities decoded, kept as plain text');
  a.equal(r.items[2][1], D.FIXED_SECONDS, 'a top danmaku shows for 4 s');
  a.deepEqual(r.counts, { danmaku: 3, special: 1, invalid: 0, gift: 1, sc: 1, guard: 1, toast: 0 });
  a.ok(!JSON.stringify(r).includes('合成用户') && !JSON.stringify(r).includes('12345,') && !JSON.stringify(r).includes('合成主播'), 'no user names, ids or streamer name');
});

test('Bilibili XML: send time in seconds becomes epoch milliseconds; colour kept; bad rows counted', () => {
  const r = D.parse(bilibiliXml([[10, 'a'], [5.5, 'b', 4, 0xff0000]]).replace('</i>', '<d p="x,1">bad</d><d p="1,0,25,1">bad mode</d></i>'));
  a.equal(r.format, 'bilibili');
  a.equal(r.recordStart, null);
  a.deepEqual(r.items, [[5.5, D.FIXED_SECONDS, 1761998400000, 4, 0xff0000, 'b'], [10, D.SCROLL_SECONDS, 1761998400000, 1, 0xffffff, 'a']], 'sorted by display time');
  a.equal(r.counts.invalid, 2);
});

test('pieces of any size give the same result, a character or a tag split between pieces included', () => {
  const xml = recorderXml(Array.from({ length: 40 }, (_, i) => [i * 0.37, '弹幕' + i + '😀']));
  const whole = D.parse(xml);
  for (const size of [1, 2, 3, 7, 64, 1000]) {
    const p = D.createParser();
    for (let i = 0; i < xml.length; i += size) p.push(xml.slice(i, i + size));
    a.deepEqual(p.end(), whole, 'piece size ' + size);
  }
});

test('not danmaku XML, a runaway tag and too many danmaku are refused with a code', () => {
  a.throws(() => D.parse('just text'), { code: 'DANMAKU_BAD_XML' });
  a.throws(() => D.parse('<html><body>x</body></html>'), { code: 'DANMAKU_BAD_XML' });
  const p = D.createParser();
  a.throws(() => { p.push('<i><d p="1,1,25,1,1"'); p.push(' x="' + 'a'.repeat((1 << 20) + 10)); }, { code: 'DANMAKU_BAD_XML' });
  const many = D.createParser();
  many.push('<i>');
  a.throws(() => { for (let i = 0; i <= D.MAX_ITEMS; i++) many.push('<d p="1,1,25,1,0">x</d>'); }, { code: 'DANMAKU_TOO_MANY' });
});

test('a text longer than the limit is cut; control characters dropped', () => {
  const r = D.parse(bilibiliXml([[1, '长'.repeat(300) + '&#7;']]));
  a.equal(Array.from(r.items[0][5]).length, D.MAX_TEXT);
});

test('a file in a Chinese folder, read in 7-byte pieces, matches the whole text', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'montclip-弹幕-'));
  try {
    const file = path.join(dir, '录播 2026-11-01 合成.xml');
    const xml = recorderXml(Array.from({ length: 25 }, (_, i) => [i, '第' + i + '条 中文弹幕']));
    fs.writeFileSync(file, xml, 'utf8');
    a.deepEqual(await readDanmakuFile(file, { highWaterMark: 7 }), D.parse(xml.replace(/^﻿/, '')));
    await a.rejects(readDanmakuFile(path.join(dir, '不存在.xml')), { code: 'ENOENT' });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('the project entry: one per recording, the last import wins, unknown media dropped', () => {
  const parsed = D.parse(bilibiliXml([[1, 'a'], [2, 'b']]));
  const e = D.entry({ id: 'dm1', mediaId: 'm1', name: '录播.xml', parsed, imported: '2026-11-02T00:00:00.000Z' });
  a.deepEqual({ ...e, items: undefined }, { id: 'dm1', mediaId: 'm1', name: '录播.xml', format: 'bilibili', recordStart: null, imported: '2026-11-02T00:00:00.000Z',
    count: 2, skipped: { special: 0, invalid: 0, gift: 0, sc: 0, guard: 0, toast: 0 }, v: 1, fields: ['t', 'dur', 'sent', 'mode', 'color', 'text'], items: undefined });
  const again = { ...e, id: 'dm2', items: e.items.slice(0, 1) };
  a.deepEqual(D.normalize([e, again, { ...e, mediaId: 'gone' }, null, { mediaId: 'm1' }], ['m1']).map((x) => [x.id, x.count]), [['dm2', 1]]);
});

test('onto the timeline: through start, in point and speed; linked stems count once; speed ramps left out', () => {
  const list = [{ mediaId: 'rec', items: [[5, 8, null, 1, 0, ''], [12, 8, null, 1, 0, ''], [30, 8, null, 1, 0, '']] }];
  a.deepEqual(D.toTimeline(list, [
    { id: 'v', mediaId: 'rec', linkGroup: 'g', start: 100, in: 10, duration: 10 },
    { id: 'a1', mediaId: 'rec', linkGroup: 'g', start: 100, in: 10, duration: 10 },
    { id: 'fast', mediaId: 'rec', start: 0, in: 0, duration: 10, props: { speed: 2 } },
    { id: 'ramp', mediaId: 'rec', start: 200, in: 0, duration: 40, keyframes: { speed: [{ t: 0, v: 1 }] } },
    { id: 'other', mediaId: 'x', start: 0, in: 0, duration: 50 },
  ]), [2.5, 6, 102]);
});

test('P2: danmaku from an import give a card its danmaku reason', () => {
  // a 10-minute recording with a burst at 300–310 s, one danmaku every 20 s elsewhere; the card is the sentence 300–308 s, which holds 33 of them
  const rows = [];
  for (let t = 0; t < 600; t += 20) rows.push([t + 1, '平常']);
  for (let i = 0; i < 40; i++) rows.push([300 + i * 0.25, '高能！']);
  const parsed = D.parse(recorderXml(rows));
  const list = [D.entry({ id: 'dm', mediaId: 'rec', name: 'x.xml', parsed })];
  const danmaku = D.toTimeline(list, [{ id: 'v', mediaId: 'rec', start: 0, in: 0, duration: 600 }]);
  const sentences = Array.from({ length: 60 }, (_, i) => ({ id: 's' + i, start: i * 10, end: i * 10 + 8, text: '一句普通的话' }));
  const cards = H.candidates({ duration: 600, sentences, danmaku });
  a.ok(cards.length >= 1);
  a.equal(cards[0].from, 300);
  a.ok(cards[0].reasons.some((r) => r.signal === 'danmaku' && r.count >= 30));
});
