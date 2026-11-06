'use strict';
// The Meta key file follows #124's rules: only ~/.meta-montclip (or MONTCLIP_META_KEY_FILE), refused when wider than 600,
// another user's or on Windows; reasons never contain the key. Temporary files with a made-up key only.
const {test}=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const K=require('../real-tests/meta-key-file.cjs');
const FAKE='made-up-meta-key-for-this-test';
function home(mode){const d=fs.mkdtempSync(path.join(os.tmpdir(),'meta-key-'));if(mode!=null){const f=path.join(d,K.DEFAULT_NAME);fs.writeFileSync(f,FAKE+'\n');fs.chmodSync(f,mode);}return d;}
const posix=process.platform!=='win32';

test('missing file: skipped, with the path',()=>{const h=home(null),r=K.readKey({env:{},home:h,platform:'linux'});a.match(r.skip,/no key file at .*\.meta-montclip$/);a.equal(r.key,undefined);});
test('on Windows the file is never read',()=>{const h=home(0o600),r=K.readKey({env:{},home:h,platform:'win32'});a.match(r.skip,/Windows/);a.ok(!JSON.stringify(r).includes(FAKE));});
test('mode 600 is read; 644 / 640 are refused and say how to fix it',{skip:!posix&&'POSIX permissions only'},()=>{
 const ok=K.readKey({env:{},home:home(0o600),platform:'linux'});a.equal(ok.key,FAKE);
 for(const m of [0o644,0o640,0o604]){const r=K.readKey({env:{},home:home(m),platform:'linux'});a.match(r.skip,/wider than 600: not read \(chmod 600 /);a.ok(!JSON.stringify(r).includes(FAKE));}
});
test('another user\'s file is refused',{skip:!posix&&'POSIX owners only'},()=>{const r=K.readKey({env:{},home:home(0o600),platform:'linux',uid:process.getuid()+1});a.match(r.skip,/another user/);});
test('MONTCLIP_META_KEY_FILE overrides the place; the scrubber hides the key',()=>{
 a.equal(K.keyFilePath({MONTCLIP_META_KEY_FILE:'x/k'},'/h'),path.resolve('x/k'));a.equal(K.keyFilePath({},'/h'),path.join('/h','.meta-montclip'));
 a.equal(K.scrubber(FAKE)('a '+FAKE+' b '+FAKE),'a <key> b <key>');a.equal(K.scrubber(null)('x'),'x');
});
