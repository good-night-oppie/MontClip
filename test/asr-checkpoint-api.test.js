'use strict';
const test = require('node:test'), a = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const { makeDataDir, startServer } = require('./helpers');
test('production ASR endpoint persists a paragraph before cancellation and returns its actual path', async t => {
  const dir = makeDataDir(t), root = path.join(__dirname, '..');
  fs.mkdirSync(path.join(dir, 'media')); fs.writeFileSync(path.join(dir, 'media', 'a.wav'), 'synthetic');
  const bootstrap = path.join(dir, 'server-fixture.cjs');
  fs.writeFileSync(bootstrap, `
    const path = require('node:path'), root = ${JSON.stringify(root)};
    const asr = require.resolve(path.join(root, 'asr-local'));
    require.cache[asr] = { exports: { createAsr: () => ({
      status: () => ({ engine:{ready:true}, vad:{ready:true}, asr:{ready:true} }),
      transcribe: async (file, opts) => {
        opts.onCheckpoint({ words:[['kept',0,1]], gaps:[], duration:10, language:'en', spans:[[0,1]] });
        await new Promise(resolve => opts.signal.addEventListener('abort', resolve, {once:true}));
        throw Object.assign(new Error('cancelled'), {code:'ASR_CANCELLED'});
      }
    }) } };
    const probe = require(path.join(root, 'media-probe')); probe.probeFile = async () => ({duration:10});
    require(path.join(root, 'server.js'));
  `);
  const server = await startServer(t, dir, { FABLECUT_NO_FS_WATCH: '1' }, { serverJs: bootstrap });
  const pending = fetch(server.base + '/api/asr/transcribe', { method: 'POST', body: JSON.stringify({ src: '/media/a.wav' }) });
  let doc;
  for (let n = 0; n < 100; n++) {
    doc = (await (await fetch(server.base + '/api/transcript?src=/media/a.wav')).json()).transcript;
    if (doc) break;
    await new Promise(r => setTimeout(r, 10));
  }
  a.deepEqual(doc.words, [['kept', 0, 1]]);
  await fetch(server.base + '/api/asr/cancel', { method: 'POST' });
  const result = await (await pending).json();
  a.equal(result.status, 'incomplete'); a.match(result.error, /没听完/);
  a.deepEqual(JSON.parse(fs.readFileSync(result.saved, 'utf8')).words, doc.words);
});
