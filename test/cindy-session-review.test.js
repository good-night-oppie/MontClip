"use strict";
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const root = path.join(__dirname, '..', 'plugins/montclip-cindy');
function page() {
  let current, release, picked;
  const waiting = new Promise(r => { picked = r; });
  const calls = [], cards = [];
  const ctx = { console, Map, Promise, setTimeout:f => { f(); return 0; }, clearTimeout() {},
    BroadcastChannel:class { postMessage() {} },
    cindy:{ onHostMessage() {}, send:m => cards.push(m), pick:() => { picked(); return new Promise(r => { release = r; }); },
      node:{ request:async r => {
        calls.push(r); const p = r.params;
        if (r.method === 'montclip/bind') { current = p.session; return { ok:true, result:{ project:current, name:current } }; }
        if (r.method === 'montclip/ui') return { ok:true, result:{ status:p.session === 'A' ? 200 : 409 } };
        if (r.method === 'montclip/export-start') {
          if (p.expectedProject && current !== p.expectedProject) return { ok:false, message:'changed', data:{ code:'EXPORT_PROJECT_CHANGED' } };
          return { ok:true, result:{ id:'job', status:'done', src:'clip.mp4' } };
        }
        return { ok:true, result:{} };
      } } } };
  vm.runInNewContext(fs.readFileSync(path.join(root,'main.js'),'utf8')+'\nthis.handlers=HANDLERS;',ctx);
  const msg = session => ({ callId:session, args:{ session_context:{ session_id:session } } });
  return { ctx, calls, cards, waiting, msg, release:() => release({ ok:true, path:'C:\\out', name:'out' }) };
}
test('A waiting for a folder cannot export B after B binds', async () => {
  const p = page(); const pending = p.ctx.handlers.montclip_export({},p.msg('A'));
  await p.waiting; await p.ctx.handlers.montclip_status({},p.msg('B')); p.release();
  const out = await pending;
  assert.equal(out.code,'EXPORT_PROJECT_CHANGED');
  const start = p.calls.find(r=>r.method==='montclip/export-start');
  assert.equal(start.params.session,'A'); assert.equal(start.params.expectedProject,'A');
  assert.doesNotMatch(out.error,/EXPORT_PROJECT_CHANGED|changed/);
});
test('B status does not claim that the open A editor belongs to B', async () => {
  const p = page(); await p.ctx.handlers.montclip_status({},p.msg('A')); await p.ctx.handlers.montclip_status({},p.msg('B'));
  assert.match(p.cards.at(-1).html,/没有打开/);
  assert.equal(p.calls.filter(r=>r.method==='montclip/ui').at(-1).params.session,'B');
});
test('overview hover does not contain the local data path', () => {
  const s = fs.readFileSync(path.join(root,'main-view.js'),'utf8');
  assert.doesNotMatch(s,/\.title\s*=\s*where\.path/);
});

test('automatic export uses headless when only another task has an editor', async () => {
  const src=fs.readFileSync(path.join(root,'node/worker.cjs'),'utf8');
  const begin=src.indexOf('async "montclip/export-start"(p) {');
  const end=src.indexOf('  async "montclip/export-job"',begin);
  const piece=src.slice(begin,end).replace(/,\s*$/, '');
  const calls=[];
  const context={start:async()=>({}),api:async(method,url,body)=>{
    calls.push({url,body}); return url==='/api/ui/command' ? {status:409,body:{code:'NO_EDITOR'}} : {status:200,body:{id:'job'}};
  }};
  vm.runInNewContext('this.methods={'+piece+'};',context);
  await context.methods['montclip/export-start']({session:'A',project:'p_a'});
  assert.equal(calls[0].body.session,'A');
  assert.equal(calls.at(-1).body.where,'headless');
  assert.equal(calls.at(-1).body.project,'p_a');
});
