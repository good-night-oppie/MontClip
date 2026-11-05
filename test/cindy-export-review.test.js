"use strict";
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), vm = require('node:vm');
const root = path.join(__dirname, '..', 'plugins', 'montclip-cindy');
const { deliverFiles } = require(path.join(root, 'node/lib.cjs'));
test('publishing an export preserves a file created while copying', async (t) => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-publish-'));
  t.after(() => fs.rmSync(d, { recursive: true, force: true }));
  const src = path.join(d, 'clip.mp4'), dest = path.join(d, 'out'); fs.mkdirSync(dest);
  fs.writeFileSync(src, Buffer.alloc(200000, 8));
  let created = false;
  const result = await deliverFiles([src], dest, () => {
    if (!created) { created = true; fs.writeFileSync(path.join(dest, 'clip.mp4'), 'keep these bytes'); }
  });
  assert.equal(fs.readFileSync(path.join(dest, 'clip.mp4'), 'utf8'), 'keep these bytes');
  assert.equal(result[0].name, 'clip (2).mp4');
  assert.deepEqual(fs.readFileSync(result[0].file), fs.readFileSync(src));
});
function harness(request, advance = 0) {
  let clock = 0, handler; const cards = [], calls = [];
  const context = { console, Map, Promise, Date: class extends Date { static now() { clock += advance; return clock; } },
    setTimeout: (f) => { f(); return 0; }, clearTimeout() {},
    BroadcastChannel: class { postMessage() {} addEventListener() {} },
    cindy: { onHostMessage(f) { handler = f; }, send(m) { cards.push(m); }, pick: async () => ({ ok:true, path:'C:\\private\\chosen', name:'chosen' }),
      node: { request: async r => { calls.push(r); return { ok:true, result: await request(r) }; } } } };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'main.js'), 'utf8') + '\nthis.handlers=HANDLERS;this.failure=plainFailure;', context);
  return { context, cards, calls, click: m => handler({ type:'event', name:'card-action', ...m }) };
}
test('unknown copy failure uses JJ other sentence without raw diagnostic', () => {
  const h = harness(async () => ({}));
  const result = h.context.failure({ phase:'copyFailed', code:'UNKNOWN_COPY', reason:'secret C:\\private\\file.mp4' });
  assert.match(result.error, /这次没有做完，出了个我们没预料到的问题/);
  assert.doesNotMatch(result.error, /secret|private/);
});
test('successful export tool result contains file names only', async () => {
  const h = harness(async r => r.method === 'montclip/export-start' ? { id:'job', status:'done' } :
    r.method === 'montclip/export-deliver' ? { files:[{ name:'clip.mp4', file:'C:\\private\\chosen\\clip.mp4' }] } : {});
  const result = await h.context.handlers.montclip_export({}, { callId:'export' });
  assert.deepEqual(JSON.parse(JSON.stringify(result.files)), ['clip.mp4']);
});
test('long export retry delivers the same job to the original chosen folder', async () => {
  let finished = false;
  const h = harness(async r => r.method === 'montclip/export-start' || r.method === 'montclip/export-job' ? { id:'job', status:finished ? 'done' : 'running' } :
    r.method === 'montclip/export-deliver' ? { files:[{ name:'clip.mp4' }] } : {}, 900000);
  await h.context.handlers.montclip_export({}, { callId:'export' });
  assert.match(h.cards.at(-1).html, /data-ghost-action="retry-delivery"/);
  finished = true;
  await h.click({ callId:'export', actionId:'retry-delivery' });
  assert.equal(h.calls.filter(r => r.method === 'montclip/export-start').length, 1);
  const deliver = h.calls.find(r => r.method === 'montclip/export-deliver');
  assert.equal(deliver.params.id, 'job'); assert.equal(deliver.params.dir, 'C:\\private\\chosen');
});
