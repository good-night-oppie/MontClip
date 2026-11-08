'use strict';
const test = require('node:test'), a = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const { makeDataDir, startServer } = require('./helpers');
for (const partial of [false, true]) test('ASR cancellation keeps relative paths private, partial=' + partial, async t => {
  const parent = makeDataDir(t), dir = path.join(parent, 'Users', 'someone', 'data'), root = path.join(__dirname, '..');
  fs.mkdirSync(dir, {recursive:true});
  fs.mkdirSync(path.join(dir, 'media')); fs.writeFileSync(path.join(dir, 'media', 'a.wav'), 'synthetic');
  const bootstrap = path.join(dir, 'server-fixture.cjs');
  fs.writeFileSync(bootstrap, `
    const path = require('node:path'), root = ${JSON.stringify(root)};
    const asr = require.resolve(path.join(root, 'asr-local'));
    require.cache[asr] = { exports: { createAsr: () => ({
      status: () => ({ engine:{ready:true}, vad:{ready:true}, asr:{ready:true} }),
      transcribe: async (file, opts) => {
        if (${partial}) opts.onCheckpoint({ words:[['kept',0,1]], gaps:[], duration:10, language:'en', spans:[[0,1]] });
        require('node:fs').writeFileSync(${JSON.stringify(path.join(dir, 'started'))}, 'ready');
        await new Promise(resolve => opts.signal.addEventListener('abort', resolve, {once:true}));
        throw Object.assign(new Error('cancelled while reading C:/Users/synthetic-private/other/model.bin'), {code:'ASR_CANCELLED'});
      }
    }) } };
    const probe = require(path.join(root, 'media-probe')); probe.probeFile = async () => ({duration:10});
    require(path.join(root, 'server.js'));
  `);
  const server = await startServer(t, dir, { FABLECUT_NO_FS_WATCH: '1' }, { serverJs: bootstrap });
  const request = new AbortController();
  const pending = fetch(server.base + '/api/asr/transcribe', { method: 'POST', signal: request.signal,
    body: JSON.stringify({ src: '/media/a.wav' }) }).then(response => response.json());
  // Observe readiness before reading the snapshot: a response obtained before
  // the checkpoint can still be null when the started marker becomes visible.
  // Join both requests immediately, and cancel even when a readiness check fails,
  // so cleanup never stops the server with an unobserved transcribe rejection.
  const settled = await Promise.allSettled([pending, (async () => {
    try {
      for (let n = 0; n < 100 && !fs.existsSync(path.join(dir, 'started')); n++) {
        await new Promise(r => setTimeout(r, 10));
      }
      a.ok(fs.existsSync(path.join(dir, 'started')), 'ASR fixture reached its checkpoint');
      return (await (await fetch(server.base + '/api/transcript?src=/media/a.wav')).json()).transcript;
    } finally {
      const cancelled = await fetch(server.base + '/api/asr/cancel', { method: 'POST' });
      a.equal(cancelled.status, 200);
      await cancelled.json();
    }
  })().catch(error => { request.abort(); throw error; })]);
  // Preserve the readiness/cancel error if it caused the client abort. Never
  // ignore a rejected result, and finish both requests before after hooks run.
  if (settled[1].status === 'rejected') throw settled[1].reason;
  if (settled[0].status === 'rejected') throw settled[0].reason;
  const result = settled[0].value, doc = settled[1].value;
  if (partial) a.deepEqual(doc.words, [['kept', 0, 1]]);
  a.equal(result.status, 'incomplete'); a.match(result.error, /没听完/);
  a.doesNotMatch(result.error, /synthetic-private/);
  a.doesNotMatch(JSON.stringify(result), /someone|synthetic-private/);
  if (partial) {
    a.equal(path.posix.dirname(result.saved), 'analysis/transcripts');
    a.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, result.saved), 'utf8')).words, doc.words);
  } else {
    a.equal(result.saved, null); a.match(result.error, /analysis\/transcripts/);
  }
});
