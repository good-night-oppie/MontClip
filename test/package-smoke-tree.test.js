'use strict';
// The package smoke watches only the packaged app's own process tree (Deja, 2026-11-03). An FFmpeg someone else runs on the
// same computer at the same time (another session's synthetic video) made the smoke fail although the app used only its
// own; and the check must still fail when the app itself runs an FFmpeg from the system PATH — judged by the exe's full
// path, never by its name.
const {test}=require('node:test'),a=require('node:assert/strict');
const NP=require('../desktop/smoke-no-path.cjs');
const PKG='C:\\Users\\x\\AppData\\Local\\Temp\\MontClip 包测试 1\\MontClip\\resources\\ffmpeg';
const packaged=[PKG+'\\ffmpeg.exe',PKG+'\\ffprobe.exe'];
const WINGET='C:\\Users\\x\\AppData\\Local\\Microsoft\\WinGet\\Links\\ffmpeg.exe';
const APP=100;   // MontClip.exe, as the smoke started it
const ours=(pid,path,ancestors=[101,APP,4])=>({pid,path,ancestors});

test('a. an unrelated FFmpeg running beside the app does not fail the smoke; it is listed apart',()=>{
 const r=NP.ffmpegInTree({root:APP,packaged,procs:[ours(102,PKG+'\\ffmpeg.exe'),{pid:201,path:WINGET,ancestors:[200,7,4]}]});
 a.equal(r.ok,true,r.why);a.deepEqual(r.ours,[PKG+'\\ffmpeg.exe']);a.deepEqual(r.others,[WINGET]);
});
test('b. the app running FFmpeg from the system PATH fails the smoke, even with the packaged one beside it',()=>{
 const r=NP.ffmpegInTree({root:APP,packaged,procs:[ours(102,PKG+'\\ffmpeg.exe'),ours(103,WINGET)]});
 a.equal(r.ok,false);a.match(r.why,/WinGet/);
 // a grandchild counts as the app's
 a.equal(NP.ffmpegInTree({root:APP,packaged,procs:[ours(104,WINGET,[103,102,101,APP,4])]}).ok,false);
});
test('by the full path, never the name: a copy named ffmpeg.exe elsewhere fails; case and slashes do not matter',()=>{
 a.equal(NP.ffmpegInTree({root:APP,packaged,procs:[ours(102,'C:\\Temp\\resources\\ffmpeg\\ffmpeg.exe')]}).ok,false);
 a.equal(NP.ffmpegInTree({root:APP,packaged,procs:[ours(102,(PKG+'\\FFMPEG.EXE').replace(/\\/g,'/').toLowerCase())]}).ok,true);
 a.equal(NP.ffmpegInTree({root:APP,packaged,procs:[ours(102,PKG+'\\ffprobe.exe')]}).ok,true,'the packaged ffprobe too');
});
test('an FFmpeg of the app whose path cannot be read fails; none of the app at all fails',()=>{
 a.equal(NP.ffmpegInTree({root:APP,packaged,procs:[ours(102,null)]}).ok,false);
 const none=NP.ffmpegInTree({root:APP,packaged,procs:[{pid:201,path:WINGET,ancestors:[200,4]}]});
 a.equal(none.ok,false);a.match(none.why,/no FFmpeg of the app/);
});
test('the smoke uses it: the watcher reads each FFmpeg with its parents, and the verdict is ffmpegInTree',()=>{
 const src=require('node:fs').readFileSync(require('node:path').join(__dirname,'..','desktop','package-smoke.cjs'),'utf8');
 a.match(src,/NP\.ffmpegInTree\(\{ root: pid,/);
 a.match(src,/ParentProcessId/);
 a.ok(!/every ffmpeg was the packaged one/.test(src),'the old whole-computer check is gone');
});
