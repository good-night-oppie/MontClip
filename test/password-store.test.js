'use strict';
// Deja (2026-11-05, after P9): the Linux desktop app asks for the system keyring itself, so the user never has to add
// --password-store. One the user passes is kept; Windows and macOS are not touched.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {passwordStoreSwitch}=require('../desktop/password-store');

test('Linux: the system keyring is asked for by default',()=>{
 assert.equal(passwordStoreSwitch({platform:'linux',argv:['electron','.']}),'gnome-libsecret');
 assert.equal(passwordStoreSwitch({platform:'linux',argv:['electron','.','--montclip-smoke','--user-data-dir=/tmp/p','--no-sandbox']}),'gnome-libsecret');
});

test('Linux: a --password-store the user passes is kept, in either form',()=>{
 for(const argv of [['electron','.','--password-store=kwallet5'],['electron','.','--password-store=basic'],['electron','--password-store','gnome-libsecret','.'],['electron','--password-store=']])
  assert.equal(passwordStoreSwitch({platform:'linux',argv}),null,argv.join(' '));
 assert.equal(passwordStoreSwitch({platform:'linux',argv:['electron','--password-storeX=1']}),'gnome-libsecret','only the real switch counts');
});

test('Windows and macOS: nothing is added',()=>{
 for(const platform of ['win32','darwin'])assert.equal(passwordStoreSwitch({platform,argv:['electron','.']}),null,platform);
});

test('main.js applies it before the app is ready, as a command-line switch',()=>{
 const main=fs.readFileSync(path.join(__dirname,'../desktop/main.js'),'utf8');
 const at=main.indexOf('app.commandLine.appendSwitch("password-store", store)');
 assert.ok(at>0,'the switch is appended');
 assert.match(main,/const store = require\("\.\/password-store"\)\.passwordStoreSwitch\(\); if \(store\) app\.commandLine\.appendSwitch\("password-store", store\);/);
 assert.ok(at<main.indexOf('app.whenReady()'),'before whenReady');
 assert.doesNotMatch(main,/setUsePlainTextEncryption|password-store", "basic"/,'never the plain-text store');
});
