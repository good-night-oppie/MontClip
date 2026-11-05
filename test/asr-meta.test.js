'use strict';
// Meta's open speech model beside Paraformer (the owner, 2026-11-04: "SenseVoice / Paraformer 不用动，加入 Meta 对应的开源模型").
// Meta Omnilingual ASR (CTC 300M, Apache-2.0, 1600+ languages) in sherpa-onnx's int8 export is an optional second model:
// chosen in the Transcript tab, downloaded or imported like Paraformer (every file checked by size and SHA-256), read by
// the same engine (sherpa-onnx-node 2.0.1, modelConfig.omnilingual). Paraformer stays the default and is read as before.
// The engine here is a stand-in: no real model, no network.
const {test}=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const ROOT=path.join(__dirname,'..'),read=f=>fs.readFileSync(path.join(ROOT,f),'utf8');
const {manifest,allowedUrl}=require('../asr-models'),W=require('../asr-words');
const {wav}=require('./songs-synth');
const RATE=16000;

test('the manifest: Meta Omnilingual is an optional model with pinned files from GitHub; Paraformer is unchanged',()=>{
 const m=manifest.models.asrMeta,p=manifest.models.asr;
 a.equal(m.id,'omnilingual-asr-1600-languages-300M-ctc-int8-2025-11-12');a.equal(m.required,false);a.equal(m.engine,'omnilingual');
 a.match(m.license,/^Apache-2\.0 \(Copyright 2025 Meta Platforms/);
 // the model's own LICENSE comes with it (ADR #122 §6: the licence text travels with the model; asr-consent.js)
 a.deepEqual(Object.keys(m.files).sort(),['LICENSE','model.int8.onnx','tokens.txt']);
 for(const f of Object.values(m.files)){a.ok(f.size>0);a.match(f.sha256,/^[0-9a-f]{64}$/);}
 a.equal(m.sources.length,1);a.equal(m.sources[0].kind,'archive');a.match(m.sources[0].sha256,/^[0-9a-f]{64}$/);
 for(const s of m.sources)a.ok(allowedUrl(s.base||s.url),'from a host the manifest already allows');
 a.equal(p.id,'paraformer-zh-2023-09-14-int8');a.equal(p.required,true);
 a.equal(p.files['model.int8.onnx'].sha256,'f36a0433bcf096bd6d6f11b80a3ac8bed110bdca632fe0d731df8d1a84475945','Paraformer untouched');
});

test('one token per character: letters make a word up to a space, Chinese characters a word each',()=>{
 const r={tokens:['a','s','k',' ','n','o','t',' ','对','我',' ','O','K'],timestamps:[0.1,0.2,0.3,0.4,0.5,0.6,0.7,0.8,1.0,1.2,1.3,1.4,1.5]};
 a.deepEqual(W.letterWords(r,{offset:10,end:12}),[['ask',10.1,10.5],['not',10.5,11],['对',11,11.2],['我',11.2,11.4],['OK',11.4,12]]);
 a.deepEqual(W.letterWords({tokens:['a'],timestamps:[]}),[],'tokens without times give nothing');
 // Paraformer's own reading is unchanged: each token a word, "@@" glues English pieces
 a.deepEqual(W.words({tokens:['hel@@','lo','你'],timestamps:[0,0.2,0.4]},{end:1}).map(w=>w[0]),['hello','你']);
});

// a stand-in engine: one VAD segment, a recognizer that remembers its config and writes "hi 你" with times
function fake(){
 const configs=[],lens=[];
 class Vad{constructor(){this.buf=[];this.q=[];}acceptWaveform(f){for(const x of f)this.buf.push(x);}flush(){if(this.buf.length)this.q.push({start:0,samples:Float32Array.from(this.buf.splice(0))});}isEmpty(){return !this.q.length;}front(){return this.q[0];}pop(){this.q.shift();}}
 const rec={createStream:()=>({acceptWaveform({samples}){lens.push(samples.length);}}),async decodeAsync(){return{text:'hi 你',tokens:['h','i',' ','你'],timestamps:[0.1,0.2,0.3,0.5]};}};
 return {configs,lens,sherpa:{Vad,OfflineRecognizer:{createAsync:async(c)=>{configs.push(c);return rec;}},OfflinePunctuation:class{}}};
}
function setup(){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'montclip-asr-meta-'));
 const pkg=path.join(dir,'engine','node_modules','sherpa-onnx-node');fs.mkdirSync(pkg,{recursive:true});fs.writeFileSync(path.join(pkg,'package.json'),'{}');
 const vad=path.join(dir,manifest.engine.vad.file);fs.writeFileSync(vad,'');fs.truncateSync(vad,manifest.engine.vad.size);
 const dirs={asr:path.join(dir,'para'),asrMeta:path.join(dir,'meta')};for(const d of Object.values(dirs)){fs.mkdirSync(d);fs.writeFileSync(path.join(d,'tokens.txt'),'a 0\n');}
 const store={dir:(k)=>dirs[k]||null,status:()=>({asr:{ready:true,missing:[],bad:[]},asrMeta:{ready:true,missing:[],bad:[]},punct:{ready:false,missing:[],bad:[]}})};
 const file=path.join(dir,'rec.wav');fs.writeFileSync(file,wav([['talk',2]]));
 return {dir,dirs,store,file,done:()=>fs.rmSync(dir,{recursive:true,force:true})};
}
const ffmpeg=()=>require('../ffmpeg-path').path('ffmpeg');
const haveFfmpeg=(()=>{try{return fs.existsSync(ffmpeg());}catch{return false;}})();

test('model "asrMeta" reads with the omnilingual config and letter words; the default is still Paraformer',{skip:!haveFfmpeg&&'needs the bundled ffmpeg (CI fetches it)'},async()=>{
 const S=setup();try{
  const {sherpa,configs,lens}=fake(),asr=require('../asr-local').createAsr({asrDir:S.dir,store:S.store,ffmpeg:ffmpeg(),sherpa,cacheDir:path.join(S.dir,'cache')});
  const m=await asr.transcribe(S.file,{model:'asrMeta'});
  a.deepEqual(Object.keys(configs[0].modelConfig).filter(k=>k==='omnilingual'||k==='paraformer'),['omnilingual']);
  a.equal(configs[0].modelConfig.omnilingual.model,path.join(S.dirs.asrMeta,'model.int8.onnx'));
  a.equal(m.model,'omnilingual-asr-1600-languages-300M-ctc-int8-2025-11-12');a.equal(m.language,'auto');
  a.deepEqual(m.words.map(w=>w[0]),['hi','你']);
  a.ok(m.words.every(w=>w[1]>=0&&w[2]>=w[1]),'times taken back to the file (the padding is not counted)');
  const p=await asr.transcribe(S.file,{});
  a.deepEqual(Object.keys(configs[1].modelConfig).filter(k=>k==='omnilingual'||k==='paraformer'),['paraformer'],'a new recognizer for the other model');
  a.equal(configs[1].modelConfig.paraformer.model,path.join(S.dirs.asr,'model.int8.onnx'));
  a.equal(p.model,'paraformer-zh-2023-09-14-int8');a.equal(p.language,'zh');
  a.deepEqual(p.words.map(w=>w[0]),['h','i','你'],'Paraformer reads tokens as before');
  a.equal(lens[0]-lens[1],2*Math.round(require('../asr-local').META_PAD*RATE),'the Meta segments get a quarter second of silence on each side, the Paraformer ones none');
  a.equal(asr.status().meta,'omnilingual-asr-1600-languages-300M-ctc-int8-2025-11-12');
 }finally{S.done();}
});

test('the server, the desktop app and the page: "meta" picks the model; only names, never paths or addresses',()=>{
 const server=read('server.js');
 a.match(server,/const key = body\.model === "meta" \? "asrMeta" : "asr";/);
 a.match(server,/model: key === "asrMeta" \? "omnilingual-meta" : TR\.DEFAULT_MODEL/);
 a.match(read('desktop/main.js'),/which !== "asr" && which !== "asrMeta" && which !== "punct"/);
 a.match(read('desktop/view-preload.js'),/which==='punct'\?'punct':which==='asrMeta'\?'asrMeta':'asr'/);
 const app=read('app.js');
 a.match(app,/<select data-tr-asr-model><option value="asr"[^>]*>.*<option value="asrMeta"/);
 a.match(app,/JSON\.stringify\(asrKey\(\) === "asrMeta" \? \{ src, model: "meta" \} : \{ src \}\)/);
 a.match(app,/window\.montclipAsr\.download\(which\)/);
 // Meta's model goes through its licence and then the site box (asr-consent.js, test/asr-consent.test.js); Paraformer's
 // question is the one it always was
 const t=require('../desktop/asr-text').asrDownloadText;
 a.match(t('zh-CN','asr').message,/听写模型，大约 230 MB/,'Paraformer\'s question is unchanged');
});

test('the words, in both languages',()=>{
 const src=read('ui-preferences.js');
 for(const k of ['asr-model','asr-model-paraformer','asr-model-meta','asr-download-meta','asr-missing-meta'])a.match(src,new RegExp('"'+k+'": \\["[^"]+", "[^"]+"\\]'),k);
 a.match(src,/"asr-model-meta": \["Meta Omnilingual \(1,600\+ languages\)", "Meta 多语言模型（1600 多种语言）"\]/);
});
