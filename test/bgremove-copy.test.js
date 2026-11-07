'use strict';
// JJ's five finalized strings, relayed verbatim by Deja on 2026-11-06 for PR #154. bgremove-export-realtime says
// 「快速（FFmpeg）」 / “Fast (FFmpeg)” since #129: the Fast label's casing, both languages (JJ, #129 issuecomment-6700295581;
// the English label too: Deja, 2026-11-07).
const {test}=require('node:test'),a=require('node:assert/strict');
const V=require('../ui-preferences.js');
const expected={
  "bgremove-assets-failed": ["AI background removal isn't ready: the downloaded files didn't all pass the check, so it wasn't turned on and the background stays for now. Turn AI background removal off and on again to retry; it may still fail.","AI 抠像没能准备好：下载的文件没有全部通过检查，所以没有启用，画面先保留背景。把 AI 抠像关掉再开一次，可以重试，但不一定成功。"],
  "bgremove-net-what": ["AI background removal uses Google's MediaPipe: each time you reopen MontClip, the first use downloads its program and model, and MontClip checks every file first. It's only used if all of them pass.","AI 抠像要用 Google 的 MediaPipe：每次重新打开 MontClip 后第一次用，都要下载它的程序和模型，并先检查文件，全部通过才使用。"],
  "bgremove-net-no": ["Without the download, AI background removal can't run and the preview keeps the background. To export with the original background, turn it off on these clips first.","不下载的话，AI 抠像用不了，预览会保留背景。想保留背景导出，请先关闭这些片段的 AI 抠像。"],
  "bgremove-export-unavailable": ["This clip's AI background removal isn't ready, so it can't be exported yet. Go back to the browser editor and follow the download prompt, or turn the clip's AI background removal off and on again. When it's ready, export from that same tab. To keep the original background, turn it off on this clip first.","现在不能导出：这个片段的 AI 抠像还没准备好。请回到浏览器剪辑器，按提示下载，或把这个片段的 AI 抠像关掉再开一次；准备好后在同一页导出。想保留背景，先关闭这个片段的 AI 抠像。"],
  "bgremove-export-realtime": ["Realtime recording doesn't support AI background removal. Choose “Fast (FFmpeg)” or “WebCodecs (HW encode)”, or turn off AI background removal on these clips first.","边播边录这种导出方式不支持 AI 抠像。请改用「快速（FFmpeg）」或「显卡加速编码」，或者先关闭这些片段的 AI 抠像。"],
};
test('JJ PR154: five background-removal messages match the final bilingual copy exactly',()=>{
 for(const [key,pair] of Object.entries(expected))
  for(const [i,language] of ['en','zh-CN'].entries())
   a.equal(V.t(language,'own.'+key),pair[i],language+' '+key);
});
test('the realtime guidance names the actual export choices',()=>{
 const T=require('../ui-terms.js');
 for(const language of ['en','zh-CN']){
  const message=V.t(language,'own.bgremove-export-realtime');
  a.ok(message.includes(V.t(language,'own.engine-webcodecs')));
  a.ok(message.includes(T.rows['fast-ffmpeg'][language==='en'?0:1]));
 }
});
