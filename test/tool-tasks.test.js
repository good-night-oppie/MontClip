"use strict";
const test = require('node:test');
const a = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { tmpDir } = require('./helpers');
const { createToolTasks } = require('../server/tool-tasks');

test('MC-04: a simulated 65 second job returns a ticket before the 60 second host limit', async t => {
  if (Number(process.versions.node.split('.')[0]) >= 20) t.mock.timers.enable({ apis: ['setTimeout'] });
  else t.mock.timers.enable(['setTimeout']);
  const tasks = createToolTasks({ dir: tmpDir(t) });
  const input = { scope: 'session', name: 'transcribe', args: {}, wait_ms: 0 };
  const first = await tasks.call(input, async update => {
    update({ done: 1, total: 2, scannedSeconds: 3 });
    await new Promise(r => setTimeout(r, 65000));
    return 'saved';
  });
  a.equal(first.status, 'running');
  a.equal((await tasks.call({ ...input, taskId: first.taskId }, () => a.fail('replayed'))).progress.scannedSeconds, 3);
  t.mock.timers.tick(65000);
  const done = await tasks.call({ ...input, taskId: first.taskId, waitForCompletion: true }, () => a.fail('replayed'));
  a.equal(done.status, 'complete'); a.equal(done.result, 'saved');
});

test('bounded wait detaches a slow operation; retries and reopened result never repeat a revision', async t => {
  const dir = tmpDir(t), tasks = createToolTasks({ dir });
  let finish, revisions = 0;
  const run = async update => { update({ done: 1, total: 2 }); await new Promise(r => { finish = r; }); return { revision: ++revisions, captions: 1 }; };
  const input = { scope: 'session:p_one', name: 'captions', args: { replace: false }, key: 'once', wait_ms: 0 };
  const one = await tasks.call(input, run);
  a.equal(one.status, 'running'); a.ok(one.taskId);
  const two = await tasks.call(input, run);
  a.equal(two.taskId, one.taskId); a.equal(revisions, 0);
  finish();
  const done = await tasks.call({ ...input, taskId: one.taskId, wait_ms: 1000 }, run);
  a.equal(done.status, 'complete'); a.equal(done.result.revision, 1);
  const reopened = createToolTasks({ dir });
  a.deepEqual(await reopened.call(input, run), done); a.equal(revisions, 1);
  await a.rejects(tasks.call({ ...input, args: { replace: true } }, run), /different/);
  await a.rejects(tasks.call({ ...input, scope: 'another', taskId: one.taskId }, run), /scope/);
});

test('a receipt without an execution owner is uncertain and never repeated', async t => {
  const dir = tmpDir(t), tasks = createToolTasks({ dir });
  const input = { scope: 'a', name: 'captions', args: {}, key: 'k', wait_ms: 0 };
  const first = await tasks.call(input, () => new Promise(() => {}));
  const file = path.join(dir, first.taskId + '.json');
  const record = JSON.parse(fs.readFileSync(file, 'utf8'));
  delete record.pid;
  fs.writeFileSync(file, JSON.stringify(record));
  const recovered = await createToolTasks({ dir }).call(input, () => { throw new Error('must not run'); });
  a.equal(recovered.taskId, first.taskId); a.equal(recovered.status, 'interrupted');
  a.equal(fs.readdirSync(dir).filter(x => x.endsWith('.json')).length, 1);
});

test('another reader preserves a live task and rejected scope queries cannot change its receipt', async t => {
  const dir = tmpDir(t), tasks = createToolTasks({ dir });
  let finish;
  const input = { scope: 'project-a', name: 'captions', args: { replace: false }, key: 'same', wait_ms: 0 };
  const first = await tasks.call(input, () => new Promise(r => { finish = r; }));
  const file = path.join(dir, first.taskId + '.json'), before = fs.readFileSync(file, 'utf8');
  const reader = createToolTasks({ dir });
  await a.rejects(reader.call({ ...input, scope: 'project-b', taskId: first.taskId }, () => a.fail('replayed')), /scope/);
  a.equal(fs.readFileSync(file, 'utf8'), before);
  a.equal((await reader.call(input, () => a.fail('replayed'))).status, 'running');
  finish('saved');
  await tasks.call({ ...input, waitForCompletion: true }, () => a.fail('replayed'));
  a.equal((await reader.call(input, () => a.fail('replayed'))).status, 'complete');
  const other = await reader.call({ ...input, scope: 'project-b', waitForCompletion: true }, () => 'other project');
  a.notEqual(other.taskId, first.taskId);
});

test('terminal receipt write failure stays uncertain without exposing unrelated paths or replaying', async t => {
  const dir = tmpDir(t), mod = { exports: {} };
  const io = Object.create(fs);
  io.renameSync = () => { throw Object.assign(new Error('disk full at C:/Users/private-account/unrelated'), {code:'ENOSPC'}); };
  require('node:vm').runInNewContext(fs.readFileSync(path.join(__dirname, '../server/tool-tasks.js'), 'utf8'), {
    module: mod, require: id => id === 'node:fs' ? io : id === './tool-error' ? require('../server/tool-error') : require(id), process, setTimeout, clearTimeout,
  });
  const tasks = mod.exports.createToolTasks({dir});
  let mutations = 0;
  const input = {scope:'p',name:'captions',args:{},key:'disk-full',waitForCompletion:true};
  const first = await tasks.call(input, () => ++mutations);
  a.equal(first.status,'interrupted'); a.equal(first.code,'TASK_RECEIPT_SAVE_FAILED');
  a.doesNotMatch(JSON.stringify(first),/private-account|unrelated/);
  a.equal((await tasks.call(input, () => ++mutations)).code,'TASK_RECEIPT_SAVE_FAILED');
  a.equal(mutations,1);
});

test('a Windows reader briefly holding the receipt does not fail a successful mutation', async t => {
  const dir = tmpDir(t), mod = {exports:{}}, io = Object.create(fs);
  let attempts = 0, mutations = 0;
  io.renameSync = (...args) => {
    if (++attempts <= 2) throw Object.assign(new Error('reader still holds destination'), {code:'EPERM'});
    return fs.renameSync(...args);
  };
  require('node:vm').runInNewContext(fs.readFileSync(path.join(__dirname, '../server/tool-tasks.js'), 'utf8'), {
    module:mod, require:id => id === 'node:fs' ? io : id === './tool-error' ? require('../server/tool-error') : require(id), process, setTimeout, clearTimeout,
  });
  const input = {scope:'p',name:'captions',args:{},key:'reader',waitForCompletion:true};
  const r = await mod.exports.createToolTasks({dir}).call(input, update => { update({done:1,total:1}); return ++mutations; });
  a.equal(r.status,'complete'); a.equal(mutations,1);
  a.equal(JSON.parse(fs.readFileSync(path.join(dir,r.taskId+'.json'),'utf8')).status,'complete');
  a.equal((await createToolTasks({dir}).call(input, () => ++mutations)).status,'complete');
  a.equal(mutations,1);
});
