'use strict';
// Explicit development entry (docs/validation/2026-11-02-review-body). Fresh profile, hidden window,
// no network: configures OpenRouter with a dummy key, opens the review dialog for one draft and
// reads what it shows — the readable sections, the count and the raw request. The dialog is
// cancelled, so nothing is sent. The unit test test/agent-review-body.test.js proves the raw request
// is the body the service sends; this proves the dialog's sections and count match that raw request.
const {app,BrowserWindow}=require('electron'),fs=require('node:fs'),path=require('node:path');
if(!process.argv.includes('--montclip-smoke'))throw Error('Explicit smoke required');
const profileArg=process.argv.find(a=>a.startsWith('--user-data-dir='));
if(!profileArg||!profileArg.slice('--user-data-dir='.length).trim())throw Error('A fresh --user-data-dir is required');
const out=process.env.MONTCLIP_REVIEW_OUT||null;if(out&&!path.isAbsolute(out))throw Error('MONTCLIP_REVIEW_OUT must be an absolute folder');
// JJ's final words for the left-out line (2026-11-03), as written; checked as whole sentences
const OMITTED={'zh-CN':{one:'有 1 个片段这次没附上时间信息，AI 看不到它在哪。不影响发送。',two:'有 2 个片段这次没附上时间信息，AI 看不到它们在哪。不影响发送。'},
 en:{one:"Timing for 1 clip wasn't included, so the AI won't see where it is. Sending still works.",two:"Timing for 2 clips wasn't included, so the AI won't see where they are. Sending still works."}};
const original=BrowserWindow.prototype.loadURL;
BrowserWindow.prototype.loadURL=async function(...args){await original.apply(this,args);const win=this,read=s=>win.webContents.executeJavaScript(s),wait=ms=>new Promise(r=>setTimeout(r,ms));
 const result={};let passed=false;
 try{await read(`(async()=>{const until=Date.now()+15000;while(!state.connected&&Date.now()<until)await new Promise(r=>setTimeout(r,25));})()`);
  win.setContentSize(1270,800);
  // one synthetic clip (no file is read), so the message carries timeline facts for the box to show
  await read(`(()=>{const doc=projectJSON();doc.media.push({id:'m_syn',src:'/media/none.mp4',kind:'video',name:'合成.mp4',duration:120});doc.clips.push({id:'c_syn',kind:'video',mediaId:'m_syn',track:'V1',start:0,in:0,duration:120,props:{volume:0}});
   // Deja (on #87): two clips whose ids are not short ids — a web address and Chinese; left out, and the box says so
   doc.clips.push({id:'https://example.com/v/直播.mp4',kind:'audio',mediaId:'m_syn',track:'A3',start:0,in:0,duration:30,props:{}},{id:'片段二',kind:'audio',mediaId:'m_syn',track:'A4',start:40,in:0,duration:30,props:{}});applyProject(doc);scheduleSave();})()`);
  await read(`(async()=>{if(!await flushSave())throw Error('SAVE');return true;})()`);await wait(300);
  for(const language of ['zh-CN','en']){
   await read(`updateMontClipView({language:${JSON.stringify(language)}});setSideTab('assistant');mcAgent.render();true`);await wait(300);
   const conf=await read(`montclipAgentService.configure({provider:'openrouter',model:'vendor/model-x:free',apiKey:'sk-dummy-not-a-key'})`);
   await read(`mcAgent.render();true`);await wait(300);
   await read(`(()=>{const e=document.querySelector('[data-cindy-draft]');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,'只保留第一句');e.dispatchEvent(new Event('input',{bubbles:true}));return true;})()`);await wait(200);
   await read(`document.querySelector('.cindy-send button').click();true`);await wait(500);
   const r=await read(`(()=>{const d=document.querySelector('.cindy-confirm[open]');if(!d)return null;
    const raw=JSON.parse(d.querySelector('[data-raw-request] pre').textContent);
    const sections=[...d.querySelectorAll('.cindy-review-text > section')];
    return {configured:montclipAgentService.get().configured,summary:d.querySelectorAll('p')[1].textContent,
     sections:sections.map(s=>({formatNote:s.hasAttribute('data-format-note'),label:(s.querySelector('summary')||s.querySelector('strong')).textContent,text:(s.querySelector('pre')||s.querySelector('p')).textContent})),
     explain:(()=>{const e=d.querySelector('[data-format-explain]');return e?{text:e.textContent,visible:e.offsetHeight>0}:null;})(),
     folded:!d.querySelector('[data-format-details]')?.open,
     raw,expectedNote:MontClipFormat.FORMAT_NOTE,
     // what a message reads as in the box: the text without the trailing {"references","facts"} JSON (#71, ce86d17), which
     // the box names in its facts note instead; the exact JSON is in the raw request
     shown:raw.messages.map(m=>MontClipAgentPane.displayMessage(m.content).text),facts:MontClipAgentPane.messageFacts(raw.messages.at(-1).content),
     factsNote:!!d.querySelector('[data-facts-note]'),
     // read before the fold is opened: the line is seen without opening anything
     omitted:(()=>{const e=d.querySelector('[data-facts-omitted]');return e?{text:e.textContent,visible:e.offsetHeight>0,inFold:!!e.closest('[data-facts-note]')}:null;})(),
     rawText:d.querySelector('[data-raw-request] pre').textContent,
     // Deja (on #87): the owner wants what is sent shown first — one click on the facts sentence opens the facts' exact text
     factsOpen:(()=>{const n=d.querySelector('[data-facts-note]');if(!n)return null;const closed=!n.open;d.querySelector('[data-facts-note] summary').click();
      const pre=n.querySelector('[data-facts-raw]'),ex=n.querySelector('[data-facts-explain]');return {closed,open:n.open,visible:!!pre&&pre.offsetHeight>0,text:pre?pre.textContent:null,
      explain:n.querySelector('[data-facts-explain]')?.textContent||null,explainFirst:!!ex&&!!pre&&!!(ex.compareDocumentPosition(pre)&Node.DOCUMENT_POSITION_FOLLOWING),title:n.querySelector('summary').textContent};})()};})()`);
   if(!r)throw Error('review dialog did not open');
   const checks={
    sameCount:r.sections.length===r.raw.messages.length,
    noteFirst:r.sections[0].formatNote&&r.raw.messages[0].role==='system'&&r.raw.messages[0].content===r.expectedNote&&r.sections[0].text===r.expectedNote,
    messagesInOrder:r.raw.messages.slice(1).every((m,i)=>m.role==='user'&&r.sections[i+1].text.trim()===r.shown[i+1].trim()),
    // and nothing else is hidden: what is left out of the text is the JSON at the end, and the box says it is sent
    onlyEnvelopeHidden:r.raw.messages.slice(1).every((m,i)=>{const t=r.shown[i+1];if(m.content===t)return true;const rest=m.content.slice(m.content.indexOf(t)+t.length).trim();
      try{const o=JSON.parse(rest);return m.content.startsWith(t)&&Object.keys(o).every(k=>k==='references'||k==='facts');}catch{return false;}}),
    factsNamed:!r.facts||r.factsNote,
    factsExpand:!!r.facts&&!!r.factsOpen&&r.factsOpen.closed&&r.factsOpen.open&&r.factsOpen.visible&&r.factsOpen.text===JSON.stringify(r.facts,null,2),
    // JJ's words: the title, and the explanation above the facts once opened
    factsWords:!!r.factsOpen&&r.factsOpen.title===require("../ui-preferences").text[language].officialPane_factsTitle&&r.factsOpen.explain===require("../ui-preferences").text[language].officialPane_factsExplain&&r.factsOpen.explainFirst,
    // Deja (on #87): the two left-out clips are counted in the box, in JJ's words, outside the fold; their ids are not sent
    omittedShown:!!r.omitted&&r.omitted.visible&&!r.omitted.inFold&&r.omitted.text===OMITTED[language].two,
    omittedNotSent:!/example.com|片段二|直播/.test(r.rawText)&&!/example.com|片段二/.test(JSON.stringify(r.facts)),
    // QQ 2026-11-02: the summary names the format note; the earlier-message count it states is the real one
    summaryNamesNote:/格式说明|formatting note/i.test(r.summary)&&r.summary.includes(String(r.raw.messages.length-2)),
    rawFields:JSON.stringify(Object.keys(r.raw).sort())==='["max_tokens","messages","model","stream"]'&&r.raw.model==='vendor/model-x:free'&&r.raw.stream===false&&r.raw.max_tokens===2048,
    noKeyShown:!JSON.stringify(r).includes('sk-dummy'),
    // JJ 2026-11-02: an explanation above the note, the note itself folded by default
    explainAboveFoldedNote:!!r.explain&&r.explain.visible&&r.explain.text===require("../ui-preferences").text[language].officialPane_formatNoteExplain&&r.folded,
   };
   result[language]={summary:r.summary,sections:r.sections.map(s=>s.label),checks};
   process.stdout.write('REVIEW '+language+' '+JSON.stringify(checks)+'\n');
   await read(`(()=>{const d=document.querySelector('.cindy-confirm[open]');[...d.querySelectorAll('button')].at(-1).click();return true;})()`);await wait(200);
   // one clip left out (the Chinese id taken off the timeline for this look): the sentence for one; then it is put back
   const one=await read(`(async()=>{const doc=projectJSON();doc.clips=doc.clips.filter(c=>c.id!=='片段二');applyProject(doc);await new Promise(r=>setTimeout(r,300));
     document.querySelector('.cindy-send button').click();await new Promise(r=>setTimeout(r,500));const d=document.querySelector('.cindy-confirm[open]');
     const e=d&&d.querySelector('[data-facts-omitted]'),r={open:!!d,text:e?e.textContent:null,visible:!!e&&e.offsetHeight>0,inFold:!!e&&!!e.closest('[data-facts-note]')};
     if(d)[...d.querySelectorAll('button')].at(-1).click();
     const back=projectJSON();back.clips.push({id:'片段二',kind:'audio',mediaId:'m_syn',track:'A4',start:40,in:0,duration:30,props:{}});applyProject(back);await new Promise(r=>setTimeout(r,300));return r;})()`);
   checks.omittedOne=one.open&&one.visible&&!one.inFold&&one.text===OMITTED[language].one;
   checks.omittedNoIds=!/编号|IDs?\b/.test(String(r.omitted&&r.omitted.text)+String(one.text));
   process.stdout.write('REVIEW '+language+' n=1 '+JSON.stringify({omittedOne:checks.omittedOne,omittedNoIds:checks.omittedNoIds})+'\n');
  }
  const ok=Object.values(result).every(x=>Object.values(x.checks).every(Boolean));
  if(out)fs.writeFileSync(path.join(out,'review-dialog.json'),JSON.stringify(result,null,1)+'\n');
  passed=ok;
  process.stdout.write((ok?'REVIEW_PASS':'REVIEW_FAIL')+'\n');
 }catch(e){process.stdout.write('REVIEW_FAIL '+e.message+'\n');}finally{process.exitCode=passed?0:1;setTimeout(()=>app.exit(passed?0:1),300);}};
require('./main');
