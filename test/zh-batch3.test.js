'use strict';
// Chinese interface, batch 3 (JJ's final copy v2, 2026-11-03, P0 rows): the projects dashboard,
// one Settings hint, four main-window labels, the export dialog and the "Export failed" prefix.
// The zh strings are copied exactly from the JJ定稿 column; English stays for English mode.
const {test}=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..');
const view=require('../ui-preferences'),Delivery=require('../delivery');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8'),app=fs.readFileSync(path.join(root,'app.js'),'utf8');
const zh=(k,v)=>view.t('zh-CN','own.'+k,v),en=(k,v)=>view.t('en','own.'+k,v);

// key → [en, zh, where]: "html" = a data-i18n marker in index.html, "app" = uiText("own.key") in app.js
const KEYS={
 // 弹窗: 项目列表
 'pj-new':['+ New project','+ 新建项目','html'],
 'pj-open':['Open','打开','app'],
 'pj-currently-open':['Currently open','当前已打开','app'],
 'pj-open-now':['open now','当前已打开','app'],
 'pj-canvas':['Canvas','画面','app'],
 'pj-length':['Length','时长','app'],
 'pj-length-value':['{dur} · {clips} clips · {media} media','{dur} · {clips} 个片段 · {media} 个素材','app'],
 'pj-modified':['Modified','修改时间','app'],
 'pj-opened':['Opened','打开时间','app'],
 'pj-created':['Created','创建时间','app'],
 'pj-notes':['Notes','备注','app'],
 'pj-tags':['Tags','标签','app'],
 'pj-duplicate':['Duplicate','复制一份','app'],
 'pj-save-template':['Save as template','存成模板','app'],
 'pj-archive':['Archive','归档','app'],
 'pj-versions':['Versions…','历史版本…','app'],
 'pj-download-backup':['Download backup','下载备份','app'],
 'pj-when-opened':['Opened {when}','{when}打开过','app'],
 'pj-when-modified':['Modified {when}','{when}修改过','app'],
 'pj-when-created':['Created {when}','{when}创建','app'],
 // 弹窗: 设置
 'settings-link-hint':['Selecting a timeline clip highlights its media in Project, and the reverse. Off by default.','选中时间线上的片段时，素材区里对应的素材也会高亮，反过来也一样。默认关闭。','html'],
 // 主界面
 'clip-disable':['Disable clip','停用片段','app'],
 'clip-lock':['Lock clip','锁定片段','app'],
 'clip-parent-null':['Parent to a new null','绑定到新的空对象','app'],
 'meter-rms':['RMS','音量','app'],
 'media-kind-video':['video','视频','app'],
 'fps-value':['{n} fps','{n} 帧/秒','app'],
 // 弹窗: 导出窗口
 'export-range-full':['Full timeline · {from} → {to}','整条时间线 · {from} → {to}','app'],
 'engine-fast-note':['Frame-accurate. Server encodes from JPEG frames. Keeps going if you switch tabs.','逐帧准确。由本机程序一帧帧编码，切到别的页面也会继续导出。','app'],
 'engine-webcodecs':['WebCodecs (HW encode)','显卡加速编码','html'],
 // v2（JJ 定稿表 #119，2026-11-05）改了写法：括号里不再套括号
 'dlv-note-master':['Project size · H.264 CRF 16 · AAC 320k','和项目一样大 · 高画质 · H.264 恒定画质（CRF）16 · AAC 320k','app'],
 'dlv-resolution':['Resolution','分辨率','html'],
 'dlv-frame-rate':['Frame rate','帧率','html'],
 'dlv-codec':['Codec','视频编码','html'],
 'dlv-encoder':['Encoder','编码器','html'],
 'dlv-rate-control':['Rate control','码率控制','html'],
 'dlv-maxrate':['Max rate (Mb/s)','最高码率 (Mb/s)','html'],
 'dlv-keyint':['Keyframe every (s)','关键帧间隔（秒）','html'],
 'dlv-speed':['Encoder speed','编码速度','html'],
 'dlv-pixfmt':['Pixel format','像素格式','html'],
 'dlv-container':['Container','文件格式','html'],
 'dlv-abitrate':['Bitrate (kb/s)','码率 (kb/s)','html'],
 'dlv-sample-rate':['Sample rate','采样率','html'],
 'dlv-channels':['Channels','声道','html'],
 'dlv-loudness':['Loudness','响度','html'],
 'dlv-file-name':['File name','文件名','html'],
 'dlv-file-preview':['→ exports/{file}','文件名：{file}（导出后会让你选保存位置）','app'],
 'dlv-tokens':['Tokens: {tokens}','可用的占位符：{tokens}','app'],
 'dlv-meta-title':['Title','标题','html'],
 'dlv-meta-artist':['Artist / author','作者','html'],
 'dlv-meta-copyright':['Copyright','版权','html'],
 'dlv-meta-date':['Date','日期','html'],
 'dlv-meta-description':['Description','简介','html'],
 'dlv-meta-keywords':['Keywords','关键词','html'],
 'dlv-batch-outputs':['Batch outputs','一次导出多个版本','html'],
 'dlv-batch-add':['+ Add these settings','+ 加上这套设置','html'],
 'dlv-batch-typical':['+ Typical set','+ 常用组合','html'],
 'dlv-batch-hint':['One render, several files: every checked output is encoded from the same frames. Saved with the project.','渲染一次，导出多个文件：勾上的版本都用同一份画面。会跟项目一起保存。','html'],
 'dlv-batch-empty':['No batch outputs yet — add the settings above, or a typical set','还没有要一起导出的版本：把上面的设置加进来，或者选「常用组合」。','app'],
 'export-checked':['Export checked','导出勾选的版本','html'],
 'export-failed-prefix':['Export failed: ','导出失败：','app'],
};

test('every batch-3 key has the exact English and JJ final Chinese text',()=>{
 for(const [k,[e,z]] of Object.entries(KEYS)){a.equal(en(k),e,k+' en');a.equal(zh(k),z,k+' zh');}
 a.equal(zh('pj-length-value',{dur:'0:32',clips:12,media:2}),'0:32 · 12 个片段 · 2 个素材','the length is a variable too');
 a.equal(en('pj-length-value-1',{dur:'0:05',clips:1,media:1}),'0:05 · 1 clip · 1 media','English keeps its singular');
 a.equal(zh('pj-length-value-1',{dur:'0:05',clips:1,media:1}),'0:05 · 1 个片段 · 1 个素材');
 a.equal(zh('pj-when-opened',{when:'3 分钟前'}),'3 分钟前打开过','「打开过」 follows the time');
 a.equal(zh('fps-value',{n:30}),'30 帧/秒');
 a.equal(zh('export-range-full',{from:'00:00:00',to:'00:32:00'}),'整条时间线 · 00:00:00 → 00:32:00','timecodes stay as they are');
 a.equal(zh('dlv-tokens',{tokens:'{project} {preset}'}),'可用的占位符：{project} {preset}','placeholders are not translated');
 a.equal(zh('dlv-file-preview',{file:'Untitled Project_master_720p.mp4'}),'文件名：Untitled Project_master_720p.mp4（导出后会让你选保存位置）');
 a.equal(zh('export-checked-n',{n:3}),'导出勾选的版本（3）');a.equal(en('export-checked-n',{n:3}),'Export checked (3)');
});

test('the WebCodecs note names the Fast engine by its own Chinese label',()=>{
 const fast=view.t('zh-CN','term.fast-ffmpeg');
 a.equal(fast,'快速（FFmpeg）');   // FFmpeg in its own casing (JJ, 2026-11-04, #129)
 a.equal(zh('engine-webcodecs-note'),'逐帧准确。用显卡编码，比「'+fast+'」那一项更快。');
 a.equal(en('engine-webcodecs-note'),'Frame-accurate. Browser HW-encodes H.264; server muxes with audio. Faster upload than Fast.');
 a.ok(html.includes('data-i18n="term.fast-ffmpeg"'),'the Fast radio keeps that label');
});

test('the master preset note stays English in delivery.js for agents and is translated on display',()=>{
 a.equal(Delivery.PRESETS.master.note,'Project size · H.264 CRF 16 · AAC 320k');
 a.equal(en('dlv-note-master'),Delivery.PRESETS.master.note);
 a.ok(app.includes('uiText("own.dlv-note-master")'));
});

test('static labels carry data-i18n markers and dynamic strings go through uiText',()=>{
 for(const [k,[e,,where]] of Object.entries(KEYS)){
  // DD (PR #144): the export dialog's engine notes render from term.* (JJ's v2 wording); the own.* keys stay as JJ's earlier copy
  const ns=(k==='engine-fast-note'||k==='engine-webcodecs-note')?'term.':'own.';
  if(where==='html')a.ok(html.includes('data-i18n="'+ns+k+'"'),'index.html marks '+k);
  else a.ok(app.includes('uiText("'+ns+k+'"'),'app.js says '+k+' through uiText');
 }
 // a <label> wrapping a control: only the text is wrapped, so the control survives applyI18n
 for(const [id,k] of [['dlvRes','dlv-resolution'],['dlvFps','dlv-frame-rate'],['dlvCodec','dlv-codec'],['dlvEncoder','dlv-encoder'],['dlvRate','dlv-rate-control'],
  ['dlvMaxrate','dlv-maxrate'],['dlvKeyint','dlv-keyint'],['dlvSpeed','dlv-speed'],['dlvPixFmt','dlv-pixfmt'],['dlvContainer','dlv-container'],['dlvABitrate','dlv-abitrate'],
  ['dlvARate','dlv-sample-rate'],['dlvACh','dlv-channels'],['dlvLoud','dlv-loudness'],['dlvFilename','dlv-file-name'],['dlvMetaTitle','dlv-meta-title'],['dlvMetaArtist','dlv-meta-artist'],
  ['dlvMetaCopyright','dlv-meta-copyright'],['dlvMetaDate','dlv-meta-date'],['dlvMetaDescription','dlv-meta-description'],['dlvMetaKeywords','dlv-meta-keywords']]){
  const re=new RegExp('<span data-i18n="own\\.'+k+'">[^<]*</span>\\s*<(select|input|textarea)[^>]*id="'+id+'"');
  a.ok(re.test(html),id+' label text is a span before its control');
 }
 a.ok(/<span data-i18n="own\.dlv-batch-outputs">Batch outputs<\/span> <span class="dim" id="dlvBatchCount">/.test(html),'the batch count survives');
 a.ok(/id="btnBatchExport"[^>]*data-i18n="own\.export-checked"/.test(html));
 // the English literals are gone from app.js code paths
 for(const s of ['item(anyEnabled ? "Disable clip"','item(anyUnlocked ? "Lock clip"','item("Parent to a new null"','alert("Export failed: "','"→ exports/" +','"Tokens: " +',
  '`Full timeline ·','"Frame-accurate. Server encodes','"Frame-accurate. Browser HW-encodes','No batch outputs yet','"Currently open"','"open now"',' min ago`','fact("Canvas"','>Download backup<'])
  a.ok(!app.includes(s),'no literal: '+s);
 // both export paths say 导出失败：, then the failure in plain words (Deja, 2026-11-04: MontClipView.errorText), never the raw message;
 // so does realtime recording's AI background-removal refusal (#154; Deja, 2026-11-07: no export failure pops up)
 a.equal((app.match(/ sayExportFailure\(e\);/g)||[]).length,3,'both export paths and the realtime refusal say 导出失败：');
 a.match(app,/toastProblem\(sayError\(e, "export"\), uiText\("own\.export-failed-prefix"\)\)/);
 a.ok(/function refreshLocalizedViews\(\)/.test(app)&&/refreshLocalizedViews\(\)/.test(app.slice(app.indexOf('function updateMontClipView'))),'a language switch re-renders the dynamic texts');
});

test('relative time: 刚刚 / {n} 分钟前 / {n} 小时前 / 昨天 / {月}-{日}, with English equivalents',()=>{
 const now=new Date(2026,10,2,15,0,0),at=(ms)=>new Date(now.getTime()-ms),S=1000,M=60*S,H=60*M;
 const z=(t)=>view.ago('zh-CN',t,now),e=(t)=>view.ago('en',t,now);
 a.equal(typeof view.ago,'function');
 a.equal(z(now),'刚刚');a.equal(z(at(59*S)),'刚刚');a.equal(e(at(59*S)),'just now');
 a.equal(z(at(60*S)),'1 分钟前');a.equal(e(at(60*S)),'1 min ago');a.equal(z(at(59*M+59*S)),'59 分钟前');
 a.equal(z(at(H)),'1 小时前');a.equal(e(at(H)),'1 h ago');a.equal(z(at(23*H+59*M)),'23 小时前');
 // ≥ 24 h: the calendar day before is 昨天, anything earlier is the date
 a.equal(z(at(24*H)),'昨天');a.equal(e(at(24*H)),'yesterday');
 a.equal(z(new Date(2026,10,1,0,0,1)),'昨天','early yesterday is still 昨天');
 a.equal(z(new Date(2026,9,31,23,59,0)),'10-31','the day before yesterday is a date');
 a.equal(e(new Date(2026,9,31,23,59,0)),'Oct 31');
 a.equal(z(new Date(2026,0,5,9,0,0)),'01-05');
 a.equal(z(new Date(2025,10,2,9,0,0)),'2025-11-02','another year adds the year');a.equal(e(new Date(2025,10,2,9,0,0)),'Nov 2, 2025');
 a.equal(z(new Date(2026,10,3,9,0,0)),'11-03','a time in the future is a date, never 刚刚');
 a.equal(z(now.toISOString()),'刚刚','ISO strings work');
 a.equal(z('not a date'),'','an unreadable time says nothing');
 a.ok(/function pjAgo\(iso\)[\s\S]{0,200}MontClipView\.ago\(/.test(app),'the dashboard uses it');
});

// JJ (2026-11-03): in 「{when}打开过 / 修改过 / 创建」 a date is followed by a space (「11-02 打开过」); 刚刚, 昨天 and
// 「3 分钟前」 stay as they are
test('{when} sentences: a space after a date, none after 刚刚 / 昨天 / N 分钟前', () => {
 const now=new Date(2026,10,2,15,0,0),w=(t,l='zh-CN')=>view.when(l,t,now),zh=(k,v)=>view.t('zh-CN','own.'+k,v);
 a.equal(typeof view.when,'function');
 a.equal(zh('pj-when-opened',{when:w(new Date(2026,9,31,9,0,0))}),'10-31 打开过');
 a.equal(zh('pj-when-modified',{when:w(new Date(2026,9,31,9,0,0))}),'10-31 修改过');
 a.equal(zh('pj-when-created',{when:w(new Date(2025,10,2,9,0,0))}),'2025-11-02 创建');
 a.equal(zh('pj-when-opened',{when:w(new Date(2026,10,2,14,59,40))}),'刚刚打开过');
 a.equal(zh('pj-when-opened',{when:w(new Date(2026,10,2,14,57,0))}),'3 分钟前打开过');
 a.equal(zh('pj-when-opened',{when:w(new Date(2026,10,1,9,0,0))}),'昨天打开过');
 a.equal(view.t('en','own.pj-when-opened',{when:w(new Date(2026,9,31,9,0,0),'en')}),'Opened Oct 31','English unchanged');
 a.ok(/own\.pj-when-created", \{ when: pjWhen\(p\.created\) \}/.test(app),'the cards use it');
 a.ok(!/own\.pj-when-[a-z]+", \{ when: pjAgo\(/.test(app),'no {when} sentence takes the bare time');
});
