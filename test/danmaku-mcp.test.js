'use strict';
// fablecut_danmaku: an agent imports a recording's danmaku XML from a local path (a Chinese folder here), lists and
// removes them. Synthetic XML only.
const test = require('node:test'), a = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const { makeDataDir, readProject, seedProject, startMcp } = require('./helpers');

const xml = (n, offset = 0) => '<?xml version="1.0" encoding="utf-8"?><i><BililiveRecorder version="synthetic"/>' +
  '<BililiveRecorderRecordInfo roomid="1" start_time="2026-11-01T20:00:00.0000000+08:00"/>' +
  Array.from({ length: n }, (_, i) => `<d p="${offset + i},1,25,16777215,${1761998400000 + i * 1000},0,1,0" user="合成用户">合成弹幕${i}</d>`).join('') + '</i>';

test('fablecut_danmaku imports, replaces, lists and removes a recording\'s danmaku', async (t) => {
  const dir = makeDataDir(t, seedProject({ media: [{ id: 'm_a', name: '录播.mp4', kind: 'video', src: '/media/录播.mp4', duration: 3600 }, { id: 'm_b', name: 'b.wav', kind: 'audio', src: '/media/b.wav', duration: 10 }] }));
  const mcp = startMcp(t, dir);
  await mcp.request('initialize', { protocolVersion: '2025-11-25' });
  const src = path.join(dir, '录播 文件夹');
  fs.mkdirSync(src);
  const file = path.join(src, '录播 合成.xml');
  fs.writeFileSync(file, xml(5));

  // two recordings in the project: which one must be said
  const which = await mcp.callTool('fablecut_danmaku', { path: file });
  a.equal(which.isError, true);
  a.match(which.text, /mediaId/);

  const r = await mcp.callTool('fablecut_danmaku', { path: file, mediaId: 'm_a' });
  a.equal(r.isError, false, r.text);
  a.match(r.text, /5 danmaku/);
  let doc = readProject(dir);
  a.equal(doc.revision, 2);
  a.equal(doc.danmaku.length, 1);
  a.deepEqual({ mediaId: doc.danmaku[0].mediaId, format: doc.danmaku[0].format, count: doc.danmaku[0].count, first: doc.danmaku[0].items[0] },
    { mediaId: 'm_a', format: 'bililive-recorder', count: 5, first: [0, 8, 1761998400000, 1, 16777215, '合成弹幕0'] });
  a.ok(!JSON.stringify(doc).includes('合成用户'), 'no user names');

  fs.writeFileSync(file, xml(3, 100));
  await mcp.callTool('fablecut_danmaku', { path: file, mediaId: 'm_a' });
  doc = readProject(dir);
  a.deepEqual([doc.danmaku.length, doc.danmaku[0].count, doc.danmaku[0].items[0][0]], [1, 3, 100], 'importing again replaces');

  const list = await mcp.callTool('fablecut_danmaku', {});
  a.match(list.text, /m_a .*3 danmaku/);

  const bad = path.join(src, 'not.xml');
  fs.writeFileSync(bad, '<html></html>');
  const refused = await mcp.callTool('fablecut_danmaku', { path: bad, mediaId: 'm_a' });
  a.equal(refused.isError, true);
  a.match(refused.text, /DANMAKU_BAD_XML/);
  a.equal(readProject(dir).revision, 3, 'a refused file changes nothing');

  const missing = await mcp.callTool('fablecut_danmaku', { path: file, mediaId: 'm_x' });
  a.equal(missing.isError, true);

  await mcp.callTool('fablecut_danmaku', { mediaId: 'm_a', remove: true });
  a.equal(readProject(dir).danmaku, undefined, 'removed');
});
