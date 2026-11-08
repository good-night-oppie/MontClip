'use strict';
const test = require('node:test'), a = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');

test('test server readiness rejects HTTP from a process that stole the reserved port', async t => {
  let child, port, settled = false;
  const proc = { ...process, platform: 'linux', kill: () => child.emit('exit', 0) };
  const mod = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'helpers.js'), 'utf8'), {
    module: mod, __dirname, process: proc, setTimeout, clearTimeout, console, Buffer,
    // A different process already answers HTTP 200 on the released free port.
    fetch: async () => ({status:200,text:async () => '{}'}),
    require: id => id === 'node:child_process' ? { spawn: (_exe, _args, opts) => {
      port = opts.env.PORT; child = new EventEmitter(); child.pid = 999999;
      child.stdout = new PassThrough(); child.stderr = new PassThrough();
      return child;
    } } : require(id),
  });
  const promise = mod.exports.startServer(t, 'synthetic-data').then(r => { settled = true; return r; });
  while (!child) await new Promise(r => setTimeout(r, 1));
  await new Promise(r => setTimeout(r, 20));
  const wronglyReady = settled;
  child.stdout.write(`MontClip running →  http://localhost:${port}\n`);
  await promise;
  a.equal(wronglyReady, false, 'HTTP 200 alone cannot identify the spawned server');
});
