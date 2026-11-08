"use strict";
const test = require('node:test');
const a = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { tmpDir } = require('./helpers');
const { createToolTasks } = require('../tool-tasks');

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

test('a process interruption leaves a tombstone instead of repeating an uncertain mutation', async t => {
  const dir = tmpDir(t), tasks = createToolTasks({ dir });
  const input = { scope: 'a', name: 'captions', args: {}, key: 'k', wait_ms: 0 };
  const first = await tasks.call(input, () => new Promise(() => {}));
  const recovered = await createToolTasks({ dir }).call(input, () => { throw new Error('must not run'); });
  a.equal(recovered.taskId, first.taskId); a.equal(recovered.status, 'interrupted');
  a.equal(fs.readdirSync(dir).filter(x => x.endsWith('.json')).length, 1);
});
