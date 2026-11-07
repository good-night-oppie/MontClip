'use strict';
// JJ, review of #28 0744468 (2026-11-02): the H.264 explanations reach the page as reason codes
// with parameters, and the page says them in the interface language. No English sentence in the
// Chinese interface; the English reasons stay for agents, logs and development only.
const test=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const V=require('../ui-preferences'),X=require('../external-ffmpeg'),FF=require('../ffmpeg-path');
const ROOT=path.join(__dirname,'..'),server=fs.readFileSync(path.join(ROOT,'server.js'),'utf8'),app=fs.readFileSync(path.join(ROOT,'app.js'),'utf8');
const zh=V.text['zh-CN'],en=V.text.en;

// JJ's wording, verbatim
const JJ={
 h264NoneWin:'这台电脑上找不到能用的 H.264 编码器：显卡编码器没有响应，Windows 自带的编码器也用不了。你可以在下面选一个带 x264 的 FFmpeg，或者导出时换一种格式。',
 h264NoneOther:'这台电脑上找不到能用的 H.264 编码器。你可以在下面选一个带 x264 的 FFmpeg，或者导出时换一种格式。',
 // h264NeedFeaturePack (the Windows "N" / Media Feature Pack line) was a guess: JJ took it out (2026-11-04, #129)
 extNotFullPath:'请选 FFmpeg 程序文件本身（ffmpeg.exe）。',
 extGone:'之前选的 FFmpeg 已经不在原来的位置了。请重新选一次，或者点「不再使用这个 FFmpeg」。',
 extNotFfmpeg:'选的程序打不开，或者它不是 FFmpeg。请重新选。',
 extNoX264:'这个 FFmpeg 里没有 x264，用它导出画质不会更好。可以换一个带 x264 的，或者直接用内置编码。',
 extSettingBad:'之前保存的 FFmpeg 设置读不出来了。请在设置里重新选一次。',
 frameTooSmall:'导出的画面太小（{w}×{h}），这台电脑的显卡编码器处理不了。请把导出尺寸调大一点，或者换一种格式。',
 extNotUsedNote:'这次没用你选的 FFmpeg（{reason}），改用了 {encoder}。',
 ffmpegMissing:'MontClip 自带的 FFmpeg 找不到了，导出和预览用不了。请重新安装 MontClip。',
 h264Hint:'默认会用你的显卡或 Windows 自带的编码器导出，不用设置也能正常导出。想要画质更好，可以另外选一个你电脑上带 x264 的 FFmpeg：它只用来导出 H.264，预览和其他格式还用内置的。MontClip 不会去网上下载，也不会自己到处找。',
 h264Clear:'不再使用这个 FFmpeg',
};
const JJ_EN={
 h264Hint:"By default MontClip exports with your graphics card or Windows' built-in encoder, so export works without any setup. For better quality you can also choose an FFmpeg on this computer that has x264: it is used only for H.264 export, and preview and other formats keep the built-in one. MontClip does not download anything or search for it.",
 h264Clear:'Stop using this FFmpeg',
};
const CODES=['h264NoneWin','h264NoneOther','extNotFullPath','extGone','extNotFfmpeg','extNoX264','extSettingBad','frameTooSmall','extNotUsedNote','ffmpegMissing'];
const ENCODERS=['h264_nvenc','h264_mf','h264_qsv','h264_amf','libx264','h264_videotoolbox'];
// proper names allowed in the Chinese interface
const ALLOWED=/FFmpeg|ffmpeg\.exe|x264|H\.264|Media Feature Pack|MontClip|Windows|NVIDIA|Intel|AMD|Apple|N/g;
const englishIn=(s)=>String(s).replace(ALLOWED,'').match(/[A-Za-z]{2,}/g);

test("JJ's Chinese wording is used verbatim, with an English counterpart for every key",()=>{
 for(const [k,v] of Object.entries(JJ))a.equal(zh[k],v,k);
 for(const [k,v] of Object.entries(JJ_EN))a.equal(en[k],v,k);
 for(const k of CODES)a.ok(typeof en[k]==='string'&&en[k].length>10,'en.'+k);
 a.ok(!/libx264/.test(Object.entries(zh).filter(([k])=>/^h264|^ext|^enc/.test(k)).map(([,v])=>v).join('')),'zh says x264, not libx264');
});

test('encoders get plain names in Chinese and their technical names in English',()=>{
 a.equal(V.h264Encoder('zh-CN','h264_nvenc'),'显卡编码（NVIDIA）');
 a.equal(V.h264Encoder('zh-CN','h264_mf'),'Windows 自带编码');
 a.equal(V.h264Encoder('zh-CN','h264_qsv'),'显卡编码（Intel）');
 a.equal(V.h264Encoder('zh-CN','h264_amf'),'显卡编码（AMD）');
 a.equal(V.h264Encoder('zh-CN','libx264'),'你选的 FFmpeg（x264）');
 const D=require('../delivery');for(const e of ENCODERS)a.equal(V.h264Encoder('en',e),D.ENCODERS[e].label,e);
});

test('every reason code reads in the interface language; zh-CN has no English sentence',()=>{
 const cases=[
  {code:'h264NoneWin'},{code:'h264NoneWin',featurePack:true},{code:'h264NoneOther'},
  ...['extNotFullPath','extGone','extNotFfmpeg','extNoX264','extSettingBad','ffmpegMissing'].map(code=>({code})),
  {code:'frameTooSmall',params:{w:120,h:40}},
  ...['extGone','extNotFfmpeg','extNoX264','extSettingBad','extNotFullPath'].flatMap(reason=>ENCODERS.map(encoder=>({code:'extNotUsedNote',params:{reason,encoder}}))),
 ];
 for(const c of cases){
  const z=V.h264Message('zh-CN',c),e=V.h264Message('en',c);
  a.ok(z&&e,JSON.stringify(c));a.equal(englishIn(z),null,`zh ${JSON.stringify(c)}: ${z}`);a.ok(!/\{\w+\}/.test(z+e),'no placeholder left: '+z+' / '+e);
 }
 a.equal(V.h264Message('zh-CN',{code:'h264NoneWin',featurePack:true}),JJ.h264NoneWin,'no Media Feature Pack guess (JJ, #129)');
 a.equal(V.h264Message('zh-CN',{code:'frameTooSmall',params:{w:120,h:40}}),'导出的画面太小（120×40），这台电脑的显卡编码器处理不了。请把导出尺寸调大一点，或者换一种格式。');
 a.equal(V.h264Message('zh-CN',{code:'extNotUsedNote',params:{reason:'extGone',encoder:'h264_mf'}}),'这次没用你选的 FFmpeg（'+JJ.extGone.replace(/。$/,'')+'），改用了 Windows 自带编码。','the reason inside the brackets drops its final full stop');
 a.equal(V.h264Message('zh-CN',{code:'nonsense'}),null,'an unknown code is not shown as text');
 for(const k of ['h264Title','h264Using','h264None','h264External','h264ExternalFailed','h264Hint','h264Choose','h264Clear'])a.equal(englishIn(zh[k].replace(/\{\w+\}/g,'')),null,'zh.'+k+': '+zh[k]);
});

test('the local FFmpeg check returns codes, and the page gets codes, not English reasons',async t=>{
 const d=fs.mkdtempSync(path.join(os.tmpdir(),'mc-code-'));t.after(()=>fs.rmSync(d,{recursive:true,force:true}));
 const exe=path.join(d,'ffmpeg.exe');fs.writeFileSync(exe,'x',{mode:0o755});
 a.equal((await X.check('ffmpeg')).code,'extNotFullPath');
 a.equal((await X.check(path.join(d,'gone.exe'))).code,'extGone');
 a.equal((await X.check(exe,{run:async()=>({code:1,stdout:''})})).code,'extNotFfmpeg');
 a.equal((await X.check(exe,{run:async(f,args)=>({code:0,stdout:args.includes('-version')?'ffmpeg version 7':' V....D h264_mf  H.264'})})).code,'extNoX264');
 const settings=path.join(d,'s.json');fs.writeFileSync(settings,'{bad');
 a.equal((await X.createExternal({settingsFile:settings,setup:'settings'}).current()).code,'extSettingBad');
 const page=X.forPage(await X.check(path.join(d,'gone.exe')));
 a.deepEqual(Object.keys(page).sort(),['code','ok','path'],'no English reason reaches the page');
 a.deepEqual(X.noH264({platform:'win32',mediaFoundation:false}),{code:'h264NoneWin',featurePack:true});
 a.deepEqual(X.noH264({platform:'linux'}),{code:'h264NoneOther',featurePack:false});
});

test('server: H.264 status and export refusals carry codes; the page shows them by code',async t=>{
 // /api/export/h264 sends codes only
 const h=server.slice(server.indexOf('async function h264Status()'),server.indexOf('\n}',server.indexOf('async function h264Status()')));
 a.match(h,/external: ext\.ok \? \{ ok: true, source: ext\.source \} : \{ ok: false, code: ext\.code \}/);a.match(h,/reason: list\.length \? null : X\.noH264\(/);a.ok(!/maskUserPath|noH264Reason/.test(h),'no English in the status');
 a.match(server,/code: "frameTooSmall",[^]{0,200}params: \{ w: frame\.outW, h: frame\.outH, n: /);   // n: the smallest side (#129)
 a.match(server,/noteCodes/);a.match(server,/code: "extNotUsedNote", params: \{ reason: ext\.code, encoder: o\.spec\.video\.encoder \}/);
 a.match(server,/\{ error: String\(e\.message \|\| e\), code: e\.code, params: e\.params \}|code: e\.code/);
 a.ok(!/FFMPEG_MISSING \}/.test(server),'every "ffmpeg missing" answer also carries its code');
 // the page: settings and export use the codes
 const r=app.slice(app.indexOf('async function renderH264Settings'),app.indexOf('$("btnH264Choose")?.addEventListener'));
 a.match(r,/MontClipView\.h264Message\(/);a.match(r,/MontClipView\.h264Encoder\(/);a.ok(!/ext\.reason|\(st && st\.reason\) \|\|/.test(r),'no English reason in the settings text');
 a.ok((app.match(/h264Refusal\(mcView\.get\(\)\.language, begin\)/g)||[]).length>=2,'both export paths say a refusal in the interface language (export words, test/export-h264-precheck.test.js)');
 a.ok(!app.includes('"MontClip\'s bundled FFmpeg is not available — export needs it"'),'the queue says it by code too');
});

test('the development-only English reasons cannot be reached in the packaged app',()=>{
 const env={MONTCLIP_FFMPEG_PACKAGED:'1',MONTCLIP_FFMPEG_DIR:path.join(os.tmpdir(),'nope'),MONTCLIP_FFMPEG:'C:\\x\\ffmpeg.exe',MONTCLIP_FFPROBE:'relative'};
 for(const name of FF.TOOLS){
  const r=FF.resolveTool(name,{env,exists:()=>false});a.equal(r.source,'packaged',name);
  const ok=FF.resolveTool(name,{env,exists:()=>true});a.equal(ok.source,'packaged');
  a.equal(FF.resolveTool(name,{env:{MONTCLIP_FFMPEG_PACKAGED:'1'},exists:()=>false}).source,'packaged','no dir → still packaged');
 }
 a.equal(FF.missingCode({source:'packaged'}),'ffmpegMissing');
 for(const s of ['env','env-dir','vendor'])a.equal(FF.missingCode({source:s}),'ffmpegDev');
 // the desktop app always sets packaged mode once packaged, and drops the per-tool overrides
 const main=fs.readFileSync(path.join(ROOT,'desktop/main.js'),'utf8');const at=main.indexOf('if (app.isPackaged) {');
 a.ok(at>0);const body=main.slice(at,main.indexOf('}',at));
 for(const s of ['delete env.MONTCLIP_FFMPEG;','delete env.MONTCLIP_FFPROBE;','env.MONTCLIP_FFMPEG_PACKAGED = "1";'])a.ok(body.includes(s),s);
});

test("JJ (2026-11-02): extRemoveFailed says the FFmpeg could not be turned off", () => {
 a.equal(zh.extRemoveFailed, '没能停用这个 FFmpeg，请再试一次。');
 a.equal(en.extRemoveFailed, 'Could not stop using this FFmpeg. Try again.');
});
