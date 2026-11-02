'use strict';
// The README, the docs home and the docs/start page say only what JJ's copy says
// (test/fixtures/montclip-public-copy-v1.md), word for word, in Chinese and English.
// Rule 7 of that copy: the optional AI assistant is a verified ability only once PR #26
// (desktop/agent-service.js) is on this branch; until then it sits under "Planned".
const {test}=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const src=require('./public-copy-source'),copy=src.parse();
const root=path.join(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8').replace(/\r\n/g,'\n');
const AI_MERGED=fs.existsSync(path.join(root,'desktop','agent-service.js'));
const PAGES={zh:{home:'docs/index.html',start:'docs/start/index.html'},en:{home:'docs/en/index.html',start:'docs/en/start/index.html'}};
const READMES={en:'README.md',zh:'docs/i18n/README.zh-CN.md'};

// The README as JJ wrote it, with the AI bullet placed per rule 7 and one language link.
function expectedReadme(lang){
 let lines=copy.readme[lang].split('\n');
 if(!AI_MERGED){
  const ai=lines.findIndex(l=>/^- \*\*(可选的 AI 助手|Optional AI assistant)\*\*/.test(l)),bullet=lines[ai];lines.splice(ai,1);
  const planned=lines.findIndex(l=>l==='## 计划中'||l==='## Planned');let end=planned+1;
  while(end<lines.length&&!/^## /.test(lines[end]))end++;
  let last=end-1;while(!/^- /.test(lines[last]))last--;lines.splice(last+1,0,bullet);
 }
 const credit=lines.findIndex(l=>/^(基于|Based on) \[ronak-create\/FableCut\]/.test(l));
 lines.splice(credit+1,0,'',lang==='en'?'[简体中文](docs/i18n/README.zh-CN.md)':'[English](../../README.md)');
 let text=lines.join('\n')+'\n';
 if(lang==='zh')text=text.replace('[LICENSE](LICENSE)','[LICENSE](../../LICENSE)');
 return text;
}
const decode=s=>s.replace(/&nbsp;/g,' ').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&');
const visible=html=>decode(html.replace(/<script[\s\S]*?<\/script>/g,' ').replace(/<style[\s\S]*?<\/style>/g,' ').replace(/<!--[\s\S]*?-->/g,' ').replace(/<head>[\s\S]*?<\/head>/,' ').replace(/<\/?(a|b|strong|em|code)\b[^>]*>/g,'').replace(/<[^>]+>/g,' ')).replace(/\s+/g,' ').trim();
// "Title / body", "label → `url`", "a · b · c", and "(`{upstream-docs}`)" link notes → the words shown.
function pieces(rows){
 const out=[];
 for(const [pos,raw] of rows){
  let text=raw.replace(/\s*[（(](链接 )?`\{upstream-docs\}`[）)]/,'');
  if(/<title>/.test(pos)||/^meta description$/.test(pos))continue;
  if(/→/.test(text)){out.push({pos,text:text.split(' → ')[0].trim(),href:src.fill(text.split(' → ')[1].replace(/`/g,'').trim())});continue;}
  if(/ \/ /.test(text)&&/卡|Card/.test(pos)){const [t,b]=text.split(' / ');out.push({pos,text:t,card:true},{pos,text:b,card:true,body:true});continue;}
  if(/列表|list/i.test(pos)){for(const p of text.split(' · '))out.push({pos,text:p});continue;}
  out.push({pos,text});
 }
 return out;
}
// Deja 2026-11-02 (JJ found the start page out of step): until #26 is merged, the start page's A3 says the AI
// assistant is still planned (JJ to review this wording); JJ's own A3 returns with #26.
const AI_PLANNED_A3={zh:'剪辑本身不需要。AI 助手还在计划中，以后用它时，才需要你自己的 AI 服务账号。',en:'Not for editing. The AI assistant is still planned; you will only need your own AI service account once you use it.'};
const isA3=p=>/^(答 3|A3)$/.test(p.pos);
const isAiCard=p=>/卡 4|Card 4/.test(p.pos),isAiNote=p=>/^(AI 说明|AI note)$/.test(p.pos)||/^(关于 AI 助手|About the AI assistant)$/.test(p.text);

test('the copy file is the one JJ delivered',()=>{a.equal(src.sha(),src.SHA256);});

test('README (English) and README.zh-CN are JJ\'s text, word for word',()=>{
 for(const lang of ['en','zh'])a.equal(read(READMES[lang]),expectedReadme(lang),READMES[lang]);
});

test('home and start pages show every sentence of the copy, links where it says so',()=>{
 for(const lang of ['zh','en'])for(const page of ['home','start']){
  const f=PAGES[lang][page],html=read(f),text=visible(html),rows=copy[page][lang];
  a.match(html,new RegExp('<title>'+rows.find(r=>/<title>/.test(r[0]))[1].replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'</title>'),f+' title');
  const meta=rows.find(r=>r[0]==='meta description');if(meta)a.ok(html.includes('<meta name="description" content="'+meta[1]+'">'),f+' meta description');
  for(const p of pieces(rows)){
   if(!AI_MERGED&&page==='start'&&isAiNote(p)){a.ok(!text.includes(p.text),f+': AI note waits for #26: '+p.text);continue;}
   if(!AI_MERGED&&page==='start'&&isA3(p)){a.ok(!text.includes(p.text),f+': A3 waits for #26');a.ok(text.includes(AI_PLANNED_A3[lang]),f+': A3 says the assistant is planned');continue;}
   a.ok(text.includes(p.text),f+' shows: '+p.text);
   if(p.href)a.ok(html.includes('href="'+p.href+'"'),f+' links '+p.text+' to '+p.href);
  }
 }
});

test('rule 7: the AI assistant is listed as available only once PR #26 is merged',()=>{
 for(const lang of ['zh','en']){
  const html=read(PAGES[lang].home),ai=pieces(copy.home[lang]).find(p=>isAiCard(p)&&!p.body).text;
  const can=html.match(/<section[^>]*id="now"[\s\S]*?<\/section>/)[0],planned=html.match(/<section[^>]*id="planned"[\s\S]*?<\/section>/)[0];
  a.equal(can.includes(ai),AI_MERGED,lang+' AI in "what it can do": '+AI_MERGED);a.equal(planned.includes(ai),!AI_MERGED,lang+' AI in "planned"');
  const readme=read(READMES[lang]),plannedMd=readme.split(/^## /m).find(s=>/^(计划中|Planned)\n/.test(s));
  a.equal(plannedMd.includes(lang==='zh'?'可选的 AI 助手':'Optional AI assistant'),!AI_MERGED,READMES[lang]);
 }
});

test('rule 1: the pages carry nothing but the copy (no upstream pitch, quotes, sponsors, badges, demo)',()=>{
 const NAV=['MontClip','English','简体中文'];
 for(const lang of ['zh','en'])for(const page of ['home','start']){
  const f=PAGES[lang][page];let rest=' '+visible(read(f))+' ';
  const ps=pieces(copy[page][lang]).map(p=>p.text).concat(!AI_MERGED&&page==='start'?[AI_PLANNED_A3[lang]]:[]).sort((x,y)=>y.length-x.length);
  for(const t of ps)rest=rest.split(t).join(' ');for(const n of NAV)rest=rest.split(n).join(' ');
  a.equal(rest.replace(/[\s·|←→:：,，.。]/g,''),'',f+' has text outside the copy');
 }
});

test('rule 5: no download button before there is an installer',()=>{
 for(const lang of ['zh','en']){const html=read(PAGES[lang].start);
  a.ok(!/<a\b[^>]*>[^<]*(下载|Download)/i.test(html)&&!/\bdownload\b/i.test(html.replace(/<script[\s\S]*?<\/script>/g,''))&&!/releases/.test(html),PAGES[lang].start);}
});

test('rule 6: structured data names MontClip and our repository; no free-of-charge field',()=>{
 for(const lang of ['zh','en']){
  const m=read(PAGES[lang].home).match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);a.ok(m,'JSON-LD');const d=JSON.parse(m[1]);
  a.equal(d.name,'MontClip');for(const k of ['url','downloadUrl','codeRepository'])a.equal(d[k],src.VALUES['{repo}'],k);
  a.ok(!('isAccessibleForFree' in d)&&!/fablecut\.space/.test(m[1]));
 }
});

test('no banned words in README, docs home or download page, Chinese or English',()=>{
 const BANNED=[/免费/,/无需安装/,/零依赖/,/在浏览器(里|中)运行/,/逐词删除/,/选词删除/,/准确率/,
  /\bfree\b/i,/nothing to install/i,/no install\b/i,/zero (npm )?dependenc/i,/runs? (entirely )?in (your|the) browser/i,/word deletion/i,/delete (individual )?words/i,/word-level delet/i,/\baccuracy\b/i,/\d+(\.\d+)?\s*%/];
 const files=[READMES.en,READMES.zh,...Object.values(PAGES.zh),...Object.values(PAGES.en)];
 for(const f of files){const t=f.endsWith('.html')?visible(read(f))+' '+(read(f).match(/<head>[\s\S]*?<\/head>/)||[''])[0]:read(f);
  for(const b of BANNED)a.ok(!b.test(t),f+' contains '+b+': '+((t.match(b)||[])[0]));}
});

test('the two languages link to each other',()=>{
 a.ok(read(PAGES.zh.home).includes('href="./en/"'));a.ok(read(PAGES.en.home).includes('href="../"'));
 a.ok(read(PAGES.zh.start).includes('href="../en/start/"'));a.ok(read(PAGES.en.start).includes('href="../../start/"'));
});
