'use strict';
const test = require('node:test'), a = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { makeDataDir, readProject } = require('./helpers');
test('MC-12: actual captions tool replay after process exit creates only one revision and caption', t => {
  const dir = makeDataDir(t);
  const script = `const m=require('./server/mcp-server'); (async()=>{ const r=await m.callTool('fablecut_captions', {import:'1\\n00:00:00,000 --> 00:00:01,000\\nhello',replace:false,idempotency_key:'one',wait_ms:1000}); console.log(r); })().catch(e=>{console.error(e);process.exitCode=1});`;
  const run = () => JSON.parse(execFileSync(process.execPath, ['-e', script], { cwd: path.join(__dirname, '..'), encoding: 'utf8', env: { ...process.env, FABLECUT_DATA_DIR: dir } }));
  const first = run(), again = run();
  a.equal(first.status, 'complete'); a.deepEqual(again, first);
  a.equal(readProject(dir).revision, 2);
  a.equal(readProject(dir).clips.filter(x => x.kind === 'text').length, 1);
});

test('MC-04: a completed task in A cannot authorize a stale full-document edit in B', t => {
  const dir = makeDataDir(t, require('./helpers').seedProject({ revision: 2 }));
  const script = `const fs=require('node:fs'), a=require('node:assert/strict'), paths=require('./server/paths');
    const p=require('./server/projects').createProjects({dataDir:paths.DATA_DIR,projectFile:paths.PROJECT_FILE,libraryDir:paths.LIBRARY_DIR});
    const m=require('./server/mcp-server');
    (async()=>{
      const origin=p.activeId(); p.create({name:'B'});
      const old=p.readRoot(); old.revision=2; fs.writeFileSync(paths.PROJECT_FILE,JSON.stringify(old));
      await m.callTool('fablecut_get_project',{});
      fs.writeFileSync(paths.PROJECT_FILE,JSON.stringify({...old,revision:3,name:'B updated'}));
      const r=JSON.parse(await m.callTool('fablecut_captions',{import:'1\\n00:00:00,000 --> 00:00:01,000\\nhello',idempotency_key:'background-a',wait_ms:1000},{project:origin}));
      a.equal(r.status,'complete',r.error);
      await a.rejects(m.callTool('fablecut_set_project',{project:old}),/CONFLICT/);
      a.equal(p.readRoot().name,'B updated');
    })().catch(e=>{console.error(e);process.exitCode=1});`;
  execFileSync(process.execPath, ['-e', script], { cwd: path.join(__dirname, '..'), encoding: 'utf8', env: { ...process.env, FABLECUT_DATA_DIR: dir } });
});

test('MC-12: crash after caption mutation but before receipt commit never repeats the mutation', t => {
  const dir = makeDataDir(t);
  const script = `const fs=require('node:fs'), m=require('./server/mcp-server');
    const rename=fs.renameSync;
    fs.renameSync=function(from,to){
      if(process.env.CRASH_RECEIPT==='1' && String(to).includes('tool-tasks') && JSON.parse(fs.readFileSync(from,'utf8')).status==='complete') process.exit(17);
      return rename.apply(this,arguments);
    };
    m.callTool('fablecut_captions',{import:'1\\n00:00:00,000 --> 00:00:01,000\\nkept',replace:false,idempotency_key:'crash',wait_ms:1000}).then(console.log);`;
  const run = crash => require('node:child_process').spawnSync(process.execPath, ['-e', script], {
    cwd: path.join(__dirname, '..'), encoding: 'utf8', env: { ...process.env, FABLECUT_DATA_DIR: dir, CRASH_RECEIPT: crash ? '1' : '0' },
  });
  a.equal(run(true).status, 17);
  a.equal(readProject(dir).revision, 2);
  const replay = run(false);
  a.equal(replay.status, 0, replay.stderr);
  a.equal(JSON.parse(replay.stdout).status, 'interrupted');
  a.equal(readProject(dir).revision, 2);
  a.equal(readProject(dir).clips.filter(c => c.kind === 'text').length, 1);
});
