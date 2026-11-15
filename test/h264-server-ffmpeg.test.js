'use strict';
// Web / server mode (node server.js, no desktop app): there is no Settings file dialog, so the person who starts
// the server names an FFmpeg with libx264 in MONTCLIP_EXTERNAL_FFMPEG (an absolute path; never PATH, never a guess —
// ADR 2026-11-02). Three cases, with faked `ffmpeg -encoders` answers:
//   1. the bundled FFmpeg has an H.264 encoder          → it is used; the server's FFmpeg is not needed;
//   2. the bundled one has none, the named one has x264 → libx264 from the named FFmpeg;
//   3. neither                                          → refused, and the reason names what exists in this mode.
const test=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const Delivery=require('../delivery'),X=require('../server/external-ffmpeg'),V=require('../ui-preferences');

function tmp(t){const d=fs.mkdtempSync(path.join(os.tmpdir(),'mc-srvx264-'));t.after(()=>fs.rmSync(d,{recursive:true,force:true}));return d;}
const withX264=async(file,args)=>args.includes('-encoders')?{code:0,stdout:' V....D libx264              libx264 H.264 / AVC\n'}:{code:0,stdout:'ffmpeg version 5.1.8-0+deb12u1\n'};
const withoutX264=async(file,args)=>args.includes('-encoders')?{code:0,stdout:' V....D mpeg4\n'}:{code:0,stdout:'ffmpeg version 5.1.8\n'};
const h264=async(ext,bundled)=>Delivery.encodersFor('h264',await ext.available(new Set(bundled)));
// the bundled LGPL build on Linux: no libx264, no usable graphics card
const LGPL_LINUX=['ffv1','prores_ks','libvpx-vp9','aac','flac'];

test('case 1: the bundled FFmpeg has an H.264 encoder — used as before, the server FFmpeg is not needed',async t=>{
 const ext=X.createExternal({settingsFile:null,envPath:null,run:async()=>{throw new Error('must not run');}});
 a.deepEqual(await h264(ext,['h264_nvenc','h264_mf']),['h264_nvenc','h264_mf']);
 a.equal(ext.setup,'server');
});

test('case 2: the bundled one has none, MONTCLIP_EXTERNAL_FFMPEG names an FFmpeg with libx264 — export uses it',async t=>{
 const d=tmp(t),exe=path.join(d,'ffmpeg');fs.writeFileSync(exe,'x',{mode:0o755});
 const ext=X.createExternal({settingsFile:null,envPath:exe,run:withX264});
 a.deepEqual(await h264(ext,LGPL_LINUX),['libx264']);
 const cur=await ext.current();a.equal(cur.ok,true);a.equal(cur.path,exe);a.equal(cur.source,'env');
 const spec=Delivery.normalize({preset:'youtube'},{available:await ext.available(new Set(LGPL_LINUX))}).spec;
 a.equal(spec.video.encoder,'libx264');a.equal(X.isExternalJob(spec),true,'encoded by the named FFmpeg, not the bundled one');
});

test('case 2, desktop: a program the user chose in Settings goes ahead of the server variable',async t=>{
 const d=tmp(t),mine=path.join(d,'mine.exe'),env=path.join(d,'env.exe'),settings=path.join(d,'external-ffmpeg.json');
 fs.writeFileSync(mine,'x');fs.writeFileSync(env,'x');fs.writeFileSync(settings,JSON.stringify({version:1,path:mine}));
 const ext=X.createExternal({settingsFile:settings,envPath:env,run:withX264,setup:'settings'});
 a.equal((await ext.current()).path,mine);a.equal((await ext.current()).source,'settings');a.equal(ext.setup,'settings');
 fs.rmSync(settings);
 a.equal((await ext.current()).path,env,'no choice saved: the variable still counts');
});

test('case 3: neither — refused, and in server mode the reason does not point at a Settings dialog that is not there',async t=>{
 const none=X.createExternal({settingsFile:null,envPath:null,findOnPath:()=>null,run:async()=>{throw new Error('must not run');}});
 a.deepEqual(await h264(none,LGPL_LINUX),[]);
 a.deepEqual(await none.current(),{ok:false,code:'none',reason:'none'});
 const r=X.noH264({platform:'linux',setup:'server'});
 a.deepEqual(r,{code:'h264NoneOther',featurePack:false,setup:'server'});
 const why=X.noH264Reason({platform:'linux',setup:'server'});
 a.match(why,/MONTCLIP_EXTERNAL_FFMPEG/);a.ok(!/Settings|below/.test(why),why);
 a.match(X.noH264Reason({platform:'linux'}),/in Settings/,'desktop wording unchanged');
 // a named FFmpeg without x264 does not help either, and says so in server words
 const d=tmp(t),exe=path.join(d,'ffmpeg');fs.writeFileSync(exe,'x',{mode:0o755});
 const bad=X.createExternal({settingsFile:null,envPath:exe,run:withoutX264});
 a.deepEqual(await h264(bad,LGPL_LINUX),[]);
 const cur=await bad.current();a.equal(cur.ok,false);a.equal(cur.code,'extEnvUnusable');a.match(cur.reason,/MONTCLIP_EXTERNAL_FFMPEG/);a.match(cur.reason,/libx264/);
 const rel=X.createExternal({settingsFile:null,envPath:'ffmpeg',run:withX264});
 a.equal((await rel.current()).code,'extEnvUnusable','a bare name is not looked up on PATH');
});

test('the page says it in this mode: web refusals never mention Settings or "below"',()=>{
 for(const lang of ['zh-CN','en']){
  const web=V.h264Refusal(lang,{code:'h264NoneOther',setup:'server'});
  a.ok(web,lang);a.ok(!/设置里|在下面|Settings|below|显卡驱动|graphics driver/.test(web),web);
  a.equal(V.h264Refusal(lang,{code:'h264NoneOther'}),V.text[lang].h264Refuse,'desktop keeps JJ\'s sentence');
  const need=V.h264Refusal(lang,{code:'extNeeded',setup:'server'});a.ok(!/设置里|Settings/.test(need),need);
  a.ok(V.h264Message(lang,{code:'extEnvUnusable'}),lang+' extEnvUnusable');
 }
});

// End to end, synthetic frames (lavfi): the bundled encoders are hidden (MONTCLIP_TEST_NO_H264, as on europa), no
// desktop Settings file, and the server is started with MONTCLIP_EXTERNAL_FFMPEG = an FFmpeg with libx264 found here
// by the test (the product never looks on PATH). Skipped when this machine has none.
const { execFileSync } = require('node:child_process');
function systemX264() {
  if (process.env.MONTCLIP_TEST_X264_FFMPEG) return process.env.MONTCLIP_TEST_X264_FFMPEG;
  try {
    const found = execFileSync(process.platform === 'win32' ? 'where' : 'which', ['ffmpeg'], { encoding: 'utf8' }).split(/\r?\n/).filter(Boolean);
    for (const f of found) {
      const real = fs.realpathSync(f);
      if (/^\s*V\S*\s+libx264\b/m.test(execFileSync(real, ['-hide_banner', '-encoders'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }))) return real;
    }
  } catch { }
  return null;
}

test('server mode end to end: MONTCLIP_EXTERNAL_FFMPEG makes an H.264 export work where the bundled FFmpeg cannot', async (t) => {
  const { makeDataDir, seedProject, startServer } = require('./helpers'), FF = require('../server/ffmpeg-path');
  if (!FF.available('ffmpeg')) return t.skip('bundled ffmpeg not installed');
  const x264 = systemX264();
  if (!x264) return t.skip('no FFmpeg with libx264 on this machine');
  const dir = makeDataDir(t, seedProject({ revision: 1 }));
  const env = { FABLECUT_NO_FS_WATCH: '1', MONTCLIP_TEST_NO_H264: '1', MONTCLIP_EXTERNAL_FFMPEG_SETTINGS: '', MONTCLIP_EXTERNAL_FFMPEG: x264 };
  const { base } = await startServer(t, dir, env);
  const st = await (await fetch(base + '/api/export/h264')).json();
  a.equal(st.setup, 'server'); a.equal(st.encoder, 'libx264', JSON.stringify(st)); a.deepEqual(st.external, { ok: true, source: 'env' });
  const jpg = path.join(dir, 'f.jpg');
  execFileSync(FF.path('ffmpeg'), ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=s=320x180', '-frames:v', '1', '-q:v', '2', jpg]);
  const begin = await fetch(base + '/api/export/begin', { method: 'POST', body: JSON.stringify({ fps: 30, duration: 0.2, canvasW: 320, canvasH: 180, hasAudio: false, deliveries: [{ delivery: { preset: 'web' }, name: 'srv' }] }) });
  const sess = await begin.json(); a.equal(begin.status, 200, JSON.stringify(sess)); a.equal(sess.spec.video.encoder, 'libx264');
  await fetch(base + '/api/export/frame?id=' + sess.id, { method: 'POST', body: Buffer.concat(Array(6).fill(fs.readFileSync(jpg))) });
  const end = await (await fetch(base + '/api/export/end?id=' + sess.id, { method: 'POST' })).json();
  a.match(end.src || '', /\/exports\/srv\.mp4$/, JSON.stringify(end));
  const probe = execFileSync(FF.path('ffprobe'), ['-v', 'error', '-show_entries', 'stream=codec_name,nb_frames', '-of', 'csv=p=0', path.join(dir, 'exports', 'srv.mp4')], { encoding: 'utf8' });
  a.match(probe, /^h264,6/m);
});

test('server mode end to end: neither encoder — refused at begin with setup:"server", worded without Settings', async (t) => {
  const { makeDataDir, seedProject, startServer } = require('./helpers');
  if (!require('../server/ffmpeg-path').available('ffmpeg')) return t.skip('bundled ffmpeg not installed');
  const dir = makeDataDir(t, seedProject({ revision: 1 }));
  // nothing on PATH either (JJ P1 looks there)
  const nowhere = path.join(dir, 'no-such-folder');
  const { base } = await startServer(t, dir, { FABLECUT_NO_FS_WATCH: '1', MONTCLIP_TEST_NO_H264: '1', MONTCLIP_EXTERNAL_FFMPEG_SETTINGS: '', MONTCLIP_EXTERNAL_FFMPEG: '', PATH: nowhere, Path: nowhere });
  const st = await (await fetch(base + '/api/export/h264')).json();
  a.equal(st.encoder, null); a.equal(st.reason.setup, 'server');
  const r = await fetch(base + '/api/export/begin', { method: 'POST', body: JSON.stringify({ fps: 30, duration: 1, canvasW: 640, canvasH: 360, hasAudio: false, deliveries: [{ delivery: { preset: 'youtube' }, name: 'a' }] }) });
  a.equal(r.status, 400); const j = await r.json();
  a.equal(j.setup, 'server'); a.match(j.error, /MONTCLIP_EXTERNAL_FFMPEG/); a.ok(!/Settings/.test(j.error), j.error);
  a.equal(V.h264Refusal('zh-CN', j), V.text['zh-CN'].h264RefuseServer);
});

// Deja, 2026-11-04: the desktop app, web / server mode and the Cindy plugin use ONE detection and fallback. The run mode
// only decides how the reason is worded (what the user can do there); which encoder export uses never depends on it.
const MODES = { settings: { MONTCLIP_DESKTOP: '1' }, server: {}, plugin: { MONTCLIP_HOST: 'cindy' } };
test('run mode comes from how MontClip was started, not from whether a settings file is configured', () => {
  a.equal(X.setupFor({ MONTCLIP_DESKTOP: '1' }), 'settings');
  a.equal(X.setupFor({ MONTCLIP_HOST: 'cindy' }), 'plugin');
  a.equal(X.setupFor({ MONTCLIP_HOST: 'cindy', MONTCLIP_DESKTOP: '1' }), 'plugin');
  a.equal(X.setupFor({}), 'server');
  a.equal(X.setupFor({ MONTCLIP_EXTERNAL_FFMPEG_SETTINGS: '/x/external-ffmpeg.json' }), 'server', 'a hand-made settings file on a server is still server mode');
});

test('the same three cases give the same encoders in every run mode', async (t) => {
  const d = tmp(t), exe = path.join(d, 'ffmpeg'), settings = path.join(d, 'external-ffmpeg.json'); fs.writeFileSync(exe, 'x', { mode: 0o755 });
  for (const [setup, env] of Object.entries(MODES)) {
    const mk = (o) => X.createExternal({ settingsFile: settings, envPath: null, run: withX264, setup: X.setupFor(env), findOnPath: () => null, ...o });
    fs.rmSync(settings, { force: true });
    a.deepEqual(await h264(mk({}), ['h264_nvenc']), ['h264_nvenc'], setup + ': bundled has one');
    a.deepEqual(await h264(mk({}), LGPL_LINUX), [], setup + ': neither');
    a.deepEqual(await h264(mk({ envPath: exe }), LGPL_LINUX), ['libx264'], setup + ': the variable');
    await X.saveChoice(settings, exe, { run: withX264 });
    a.deepEqual(await h264(mk({}), LGPL_LINUX), ['libx264'], setup + ': a saved choice');
    a.equal(mk({}).setup, setup);
    a.deepEqual(X.noH264({ platform: 'linux', setup }), setup === 'settings' ? { code: 'h264NoneOther', featurePack: false } : { code: 'h264NoneOther', featurePack: false, setup });
  }
});

test('saving a choice is one shared routine: checked first, written atomically, cleared on request', async (t) => {
  const d = tmp(t), exe = path.join(d, 'ffmpeg'), settings = path.join(d, 'sub', 'external-ffmpeg.json'); fs.writeFileSync(exe, 'x', { mode: 0o755 });
  const no = await X.saveChoice(settings, exe, { run: withoutX264 });
  a.equal(no.ok, false); a.equal(no.code, 'extNoX264'); a.equal(fs.existsSync(settings), false, 'nothing saved when the check fails');
  a.equal((await X.saveChoice(settings, 'ffmpeg', { run: withX264 })).code, 'extNotFullPath', 'no bare names');
  const yes = await X.saveChoice(settings, exe, { run: withX264 });
  a.equal(yes.ok, true); a.deepEqual(JSON.parse(fs.readFileSync(settings, 'utf8')), { version: 1, path: exe });
  a.equal((await X.savedStatus(settings, { run: withX264 })).ok, true);
  a.deepEqual(X.clearChoice(settings), { ok: false, code: 'none' }); a.equal(fs.existsSync(settings), false);
  a.deepEqual(await X.savedStatus(settings, { run: withX264 }), { ok: false, code: 'none' });
  const main = fs.readFileSync(path.join(__dirname, '..', 'desktop', 'main.js'), 'utf8');
  a.match(main, /External\.saveChoice\(externalFile, pick\.filePaths\[0\]\)/, 'the desktop app saves through it');
  a.match(main, /External\.clearChoice\(externalFile\)/); a.match(main, /External\.savedStatus\(externalFile\)/);
});

test('the plugin says it in plugin words: no Settings, no "below", no environment variable', () => {
  for (const lang of ['zh-CN', 'en']) {
    for (const code of ['h264NoneOther', 'h264NoneWin', 'extNeeded']) {
      const s = V.h264Refusal(lang, { code, setup: 'plugin' });
      a.ok(s, lang + ' ' + code); a.ok(!/设置里|在下面|Settings|below|MONTCLIP_|显卡驱动|graphics driver/.test(s), s);
    }
  }
  const why = X.noH264Reason({ platform: 'linux', setup: 'plugin' });
  a.match(why, /Cindy/); a.ok(!/Settings|below/.test(why), why);
});

test('outside the desktop app a saved choice that fails is said without pointing at desktop Settings', async (t) => {
  const d = tmp(t), exe = path.join(d, 'ffmpeg'), settings = path.join(d, 'external-ffmpeg.json'); fs.writeFileSync(exe, 'x', { mode: 0o755 });
  fs.writeFileSync(settings, JSON.stringify({ version: 1, path: exe }));
  for (const setup of ['plugin', 'server']) {
    const c = await X.createExternal({ settingsFile: settings, envPath: null, run: withoutX264, setup }).current();
    a.equal(c.code, 'extSavedUnusable', setup); a.ok(!/Settings/.test(c.reason), c.reason);
  }
  a.equal((await X.createExternal({ settingsFile: settings, envPath: null, run: withoutX264, setup: 'settings' }).current()).code, 'extNoX264', 'desktop unchanged');
  fs.writeFileSync(settings, '{bad');
  a.equal((await X.createExternal({ settingsFile: settings, setup: 'plugin', run: withX264 }).current()).code, 'extSavedUnusable');
  for (const lang of ['zh-CN', 'en']) a.ok(V.h264Message(lang, { code: 'extSavedUnusable' }), lang);
});

/* Deja 2026-11-05: the six refusals point at the FFmpeg card, never at a configuration. The environment variable stays
   as an advanced setting, in the docs only (CLAUDE.md "Run"), and in the English reasons agents and logs read. */
test('the six refusals name no configuration, and every 「X」 they mention is on the FFmpeg card or in the preset list', () => {
  const Card = require('../app/ffmpeg-card');
  const KEYS = ['h264RefuseServer', 'extNeededServer', 'extEnvUnusable', 'h264RefusePlugin', 'extNeededPlugin', 'extSavedUnusable'];
  for (const lang of ['zh-CN', 'en']) {
    const card = Card.model({ state: 'noH264', platform: 'linux', picker: false }, lang);
    const onCard = [card.title, ...card.buttons.map((b) => b.label), card.copy];
    const presets = lang === 'en' ? ['Archive', 'Master'] : ['存档', 'Master'];
    for (const k of KEYS) {
      const s = V.text[lang][k];
      a.ok(s, lang + ' ' + k);
      a.ok(!/MONTCLIP_|环境变量|变量|environment|variable|配置文件|config|重新启动|restart|设置里|Settings/i.test(s), `${lang} ${k}: ${s}`);
      for (const q of [...s.matchAll(/[「『“]([^」』”]+)[」』”]/g)].map((m) => m[1]))
        a.ok(onCard.includes(q) || presets.includes(q), `${lang} ${k}: 「${q}」 is not on the card (${onCard.join(' / ')})`);
    }
    for (const k of ['h264RefuseServer', 'h264RefusePlugin']) a.ok(V.text[lang][k].includes(card.title.replace(/[。.]$/, '')), `${lang} ${k} names the card`);
  }
});
