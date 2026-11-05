'use strict';
// Deja (2026-11-05, after P9; QQ's review of #171): on a Linux desktop Electron does not recognise, the app asks for the
// system keyring itself, so the user never has to add --password-store. On a desktop Electron recognises its own choice
// stands (KDE → KWallet). One the user passes is kept; Windows and macOS are not touched.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {passwordStoreSwitch,desktopEnvironment}=require('../desktop/password-store');
const linux=(env,argv=['electron','.'])=>passwordStoreSwitch({platform:'linux',argv,env});

test('KDE: nothing added — Electron picks KWallet itself',()=>{
 for(const env of [{XDG_CURRENT_DESKTOP:'KDE'},{XDG_CURRENT_DESKTOP:'KDE',KDE_SESSION_VERSION:'5'},{XDG_CURRENT_DESKTOP:'KDE',KDE_SESSION_VERSION:'6'},
  {DESKTOP_SESSION:'kde-plasma'},{DESKTOP_SESSION:'kde',KDE_SESSION_VERSION:'5'},{KDE_FULL_SESSION:'true',KDE_SESSION_VERSION:'5'}])
  assert.equal(linux(env),null,JSON.stringify(env));
});

test('GNOME: nothing added — Electron picks libsecret itself; the same for the other desktops it knows',()=>{
 for(const xdg of ['GNOME','ubuntu:GNOME','Unity','X-Cinnamon','Deepin','Pantheon','XFCE','UKUI','COSMIC'])assert.equal(linux({XDG_CURRENT_DESKTOP:xdg}),null,xdg);
 for(const env of [{DESKTOP_SESSION:'gnome'},{DESKTOP_SESSION:'mate'},{DESKTOP_SESSION:'xubuntu'},{DESKTOP_SESSION:'xfce'},{GNOME_DESKTOP_SESSION_ID:'this-is-deprecated'}])
  assert.equal(linux(env),null,JSON.stringify(env));
});

test('no desktop or one Electron does not know (europa: openbox, no XDG_CURRENT_DESKTOP): the system keyring is asked for',()=>{
 for(const env of [{},{XDG_CURRENT_DESKTOP:''},{XDG_CURRENT_DESKTOP:'openbox'},{XDG_CURRENT_DESKTOP:'openbox',DESKTOP_SESSION:'openbox'},{DISPLAY:':1'},
  {XDG_CURRENT_DESKTOP:'LXQt'},{DESKTOP_SESSION:'kde'},{KDE_FULL_SESSION:'true'}])
  assert.equal(linux(env),'gnome-libsecret',JSON.stringify(env));
 // an unknown first entry falls through to the next one, as in Chromium
 assert.equal(linux({XDG_CURRENT_DESKTOP:'openbox:KDE'}),null);
 // an unknown XDG_CURRENT_DESKTOP still falls back to DESKTOP_SESSION, as in Chromium
 assert.equal(linux({XDG_CURRENT_DESKTOP:'openbox',DESKTOP_SESSION:'gnome'}),null);
});

test('a --password-store the user passes is kept, in either form, whatever the desktop',()=>{
 for(const env of [{},{XDG_CURRENT_DESKTOP:'openbox'},{XDG_CURRENT_DESKTOP:'KDE'}])
  for(const argv of [['electron','.','--password-store=kwallet5'],['electron','.','--password-store=basic'],['electron','--password-store','gnome-libsecret','.'],['electron','--password-store=']])
   assert.equal(linux(env,argv),null,JSON.stringify(env)+' '+argv.join(' '));
 assert.equal(linux({},['electron','--password-storeX=1']),'gnome-libsecret','only the real switch counts');
});

test('Windows and macOS: nothing is added',()=>{
 for(const platform of ['win32','darwin'])assert.equal(passwordStoreSwitch({platform,argv:['electron','.'],env:{}}),null,platform);
});

test('desktop detection follows Chromium\'s order',()=>{
 assert.equal(desktopEnvironment({XDG_CURRENT_DESKTOP:'Unity',DESKTOP_SESSION:'gnome-fallback-compiz'}),'GNOME');
 assert.equal(desktopEnvironment({XDG_CURRENT_DESKTOP:' KDE ',KDE_SESSION_VERSION:'6'}),'KDE6');
 assert.equal(desktopEnvironment({XDG_CURRENT_DESKTOP:'GNOME:KDE'}),'GNOME','first known entry wins');
});

test('main.js applies it before the app is ready, as a command-line switch',()=>{
 const main=fs.readFileSync(path.join(__dirname,'../desktop/main.js'),'utf8');
 const at=main.indexOf('app.commandLine.appendSwitch("password-store", store)');
 assert.ok(at>0,'the switch is appended');
 assert.match(main,/const store = require\("\.\/password-store"\)\.passwordStoreSwitch\(\); if \(store\) app\.commandLine\.appendSwitch\("password-store", store\);/);
 assert.ok(at<main.indexOf('app.whenReady()'),'before whenReady');
 assert.doesNotMatch(main,/setUsePlainTextEncryption|password-store", "basic"/,'never the plain-text store');
 assert.doesNotMatch(fs.readFileSync(path.join(__dirname,'../desktop/password-store.js'),'utf8'),/return 'basic'|setUsePlainTextEncryption/,'never asks for basic');
});
