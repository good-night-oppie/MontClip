'use strict';
// The corrections never leave this computer (Deja, 2026-11-03, ADR 补记 fb2e6964…): the AI assistant, the song-name
// lookup and cloud transcription never read them — the earlier 「numbers-only summary when the streamer agrees」 is void.
// Locked two ways: no code outside the corrections' own files names them, and a request built the way the assistant
// builds it (facts + format note + messages) holds none of their fields while a full store sits beside it.
const {test}=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const ROOT=path.join(__dirname,'..');
const read=f=>fs.readFileSync(path.join(ROOT,f),'utf8');

// the only files that may name them: their own modules, the main process that keeps them, the preload that reaches them,
// and the two local evaluations (off unless asked). The page joins this list when the search uses them (interface, v12) —
// and only its search may then read them.
const OWN=new Set(['corrections.js','segment-edits.js','desktop/corrections-store.js','desktop/main.js','desktop/view-preload.js',
 'real-tests/songs-golden.cjs','real-tests/corrections-loso.cjs','desktop/corrections-smoke.cjs',
 // v12: the page's 自动出切片 search and its 记住我的剪辑习惯 block (one block: test/corrections-ui.test.js), and its smoke
 'app.js','desktop/corrections-ui-smoke.cjs']);
const FIELDS=/corrections|montclipCorrections|startShift|endShift|songOptions|BAR_BASE/;

test('no other code names them — the assistant, its context and its request builders, MCP, the server',()=>{
 const files=[];
 const walk=(dir)=>{for(const n of fs.readdirSync(path.join(ROOT,dir))){const rel=dir?dir+'/'+n:n;
  if(/^(node_modules|vendor|docs|test|\.git|media|exports|analysis|projects|library|agent-ui)$/.test(n))continue;
  const st=fs.statSync(path.join(ROOT,rel));if(st.isDirectory()){if(['desktop','real-tests'].includes(rel))walk(rel);}else if(/\.(c?js|tsx?)$/.test(n))files.push(rel);}};
 walk('');
 for(const must of ['agent-facts.js','agent-format.js','agent-conversation.js','agent-pane.js','chat-proposal.js','desktop/agent-service.js','mcp-server.js','mcp-tools.js','server.js','app.js','cindy-official.js'])
  a.ok(files.includes(must),'scanned: '+must);
 const named=files.filter(f=>!OWN.has(f)&&FIELDS.test(read(f)));
 a.deepEqual(named,[],'named outside their own files');
});

test('a request built as the assistant builds it holds none of their fields, with a full store beside it',()=>{
 const Store=require('../desktop/corrections-store'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'montclip-corr-'));
 const s=Store.create({dir});
 for(let i=0;i<5;i++)s.append({type:'trim',kind:'song',startShift:-4,endShift:3,duration:3600});
 s.append({type:'kind',from:'song',to:'other',duration:3600,features:{len:120,level:-25,pause:0.05}});
 const Facts=require('../agent-facts'),Format=require('../agent-format');
 const doc={media:[{id:'m1',src:'/media/a.mp4',kind:'video',duration:600}],clips:[{id:'c1',kind:'video',mediaId:'m1',track:'V1',start:0,in:0,duration:600,props:{}}]};
 const facts=Facts.build(doc,{highlights:[{from:10,to:40,score:0.7}]});
 const body=Format.body('m',Format.withFormat([{role:'user',content:'把我唱歌的部分剪出来\n\n'+JSON.stringify({references:[],facts})}]));
 const sent=JSON.stringify(body);
 a.ok(!FIELDS.test(sent)&&!/"pause"|"habit"|"bar"/.test(sent),sent.slice(0,300));
 a.equal(s.status().count,6,'the store was full while the request was built');
});

// Deja (2026-11-03): neither the assistant's context nor the outgoing preview (the review box, its raw request) shows them
test('the outgoing preview never names them: the review box, its bundle and the pane store',()=>{
 for(const f of ['agent-ui/pane.tsx','cindy-official.js','agent-pane.js','agent-conversation.js','agent-facts.js','agent-format.js'])
  a.ok(!FIELDS.test(read(f)),f);
});
