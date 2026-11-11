'use strict';
// How steadily Muse Spark answers in the product's keep_sentences format (Deja, 2026-11-04: record it as it is; the
// product flow is not changed for this). Each run is one request through the product's own path (desktop/agent-service.js
// httpsRequest, the fixed format note first, the quoted subtitles as references, as the pane sends them); the reply is
// read the way the pane reads it (agent-conversation parseProposal / proposalSummary) and checked the way Apply checks
// it (chat-proposal prepare against the project). Synthetic subtitles only.
//   MONTCLIP_REAL_MODELS=1 node dev/real-tests/meta-format-stability.cjs        (MONTCLIP_STABILITY_RUNS per prompt, default 5)
// Key only from ~/.meta-montclip, mode 600 (dev/real-tests/meta-key-file.cjs). Writes docs/validation/meta-format-stability.json.
// Exit 0 = every reply usable, 1 = some were not (the report says which and why), 2 = skipped.
const path=require('node:path'),fs=require('node:fs');
const S=require('../../desktop/agent-service'),F=require('../../agent-format'),V=require('../../agent-conversation'),P=require('../../chat-proposal'),C=require('../../captions'),K=require('./meta-key-file.cjs');
if(process.env.MONTCLIP_REAL_MODELS!=='1'){console.log('STABILITY SKIPPED: real-model tests are off (set MONTCLIP_REAL_MODELS=1)');process.exit(2);}
const found=K.readKey();if(!found.key){console.log('STABILITY SKIPPED: '+found.skip);process.exit(2);}
const KEY=found.key,hide=K.scrubber(KEY),MODEL=process.env.MONTCLIP_E2E_MODEL||S.DEFAULT_MODELS.meta,RUNS=Math.max(1,Math.min(20,Number(process.env.MONTCLIP_STABILITY_RUNS)||5));
const doc={revision:1,fps:30,width:1280,height:720,media:[{id:'m',src:'/media/synthetic.mp4',kind:'video',duration:10}],
 clips:[{id:'v',kind:'video',mediaId:'m',track:'V1',start:0,in:0,duration:10,props:{volume:0}},
  ...C.parse('1\n00:00:00,000 --> 00:00:03,000\n大家好，今天讲三个剪辑技巧。\n\n2\n00:00:03,000 --> 00:00:05,000\n嗯，这句我说错了，不要。\n\n3\n00:00:05,000 --> 00:00:10,000\n第一个技巧是删掉停顿。\n').map((c,i)=>C.clip(c,{id:'c'+i,track:'V2'}))]};
const ref=c=>({type:'caption',projectId:'p_s',sequenceId:'main',revision:1,gen:0,clipId:c.id,sourceCaptionId:c.id,text:c.props.text,start:c.start,end:c.start+c.duration});
const caps=doc.clips.filter(C.isCaption);
// what the streamer says, which subtitles are quoted, and which should be kept
const PROMPTS=[
 {say:'只保留这两句',quote:['c0','c2'],keep:['c0','c2']},
 {say:'这三句里，删掉说错的那一句，其他的留着',quote:['c0','c1','c2'],keep:['c0','c2']},
 {say:'只要第一句',quote:['c0','c1','c2'],keep:['c0']}
];
(async()=>{
 const runs=[];
 for(const p of PROMPTS)for(let i=0;i<RUNS;i++){
  const refs=caps.filter(c=>p.quote.includes(c.id)).map(ref);
  const messages=F.withFormat([{role:'user',content:p.say+'\n\n'+JSON.stringify({references:refs})}]);
  const t0=Date.now(),run={prompt:p.say,n:i+1};
  try{
   const r=await S.httpsRequest({provider:'meta',model:MODEL,key:KEY},{messages},AbortSignal.timeout(60000));
   run.ms=Date.now()-t0;const text=r.text;run.reply=hide(text).slice(0,400);
   const parsed=V.parseProposal(text);run.json=!!parsed;run.fenced=/^\s*```/.test(text);
   run.summary=!!V.proposalSummary(text,refs);
   if(parsed){try{const q=P.prepare(parsed,{doc:JSON.parse(JSON.stringify(doc)),context:{projectId:'p_s',sequenceId:'main',generation:0,revision:1},references:refs});
    run.kept=q.sentences?q.sentences.map(s=>s.clipId):null;run.valid=true;run.right=JSON.stringify(run.kept)===JSON.stringify(p.keep);}
   catch(e){run.valid=false;run.why=e.message;}}else run.valid=false;
  }catch(e){run.ms=Date.now()-t0;run.error=e.message;}
  runs.push(run);console.log('STABILITY_RUN '+hide(JSON.stringify({prompt:run.prompt,n:run.n,ms:run.ms,json:run.json,valid:run.valid,right:run.right,why:run.why||run.error||null})));
 }
 const by=p=>{const r=runs.filter(x=>x.prompt===p.say);return{prompt:p.say,runs:r.length,usable:r.filter(x=>x.valid).length,asked:r.filter(x=>x.right).length,fenced:r.filter(x=>x.fenced).length,errors:r.filter(x=>x.error).map(x=>x.error),medianMs:r.map(x=>x.ms).sort((a,b)=>a-b)[Math.floor(r.length/2)]};};
 const report={model:MODEL,date:new Date().toISOString(),runsPerPrompt:RUNS,summary:PROMPTS.map(by),runs};
 const text=JSON.stringify(report,null,1);if(text.includes(KEY))throw Error('key would be written');
 const out=process.env.MONTCLIP_STABILITY_OUT||path.join(__dirname,'..','docs','validation','meta-format-stability.json');fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,text+'\n');
 console.log('STABILITY '+JSON.stringify(report.summary));
 process.exit(runs.every(x=>x.valid)?0:1);
})();
