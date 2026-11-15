'use strict';
// The root of the one-segment failure (Rea, #93 ADR §10): paraformer-zh-2023-09-14-int8's tokens.txt has a token that
// is exactly "@" (line 7252, "@ 7251"). sherpa-onnx 2.0.1 (gitSha1 af2d8d81) takes 2 off the length of a token ending in
// "@" in OfflineRecognizerParaformerImpl::DecodeStreams; for "@" alone that underflows and throws std::length_error —
// basic_string::_S_create with libstdc++, "string too long" with MSVC. The synchronous decode() aborts the whole
// process on it, so the product only ever calls decodeAsync.
// The fix at the root: the recognizer reads a copy of tokens.txt with that token as the full-width 「＠」, kept in a cache
// and named by the source's SHA-256; the model's own file is never changed. A 「＠」 in the result never reaches the
// words. The segment-by-segment guard (test/asr-gaps.test.js) stays for anything else a model may do.
const {test}=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const ROOT=path.join(__dirname,'..');
const L=require('../server/asr-local');
const sha=(f)=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const tmp=()=>fs.mkdtempSync(path.join(os.tmpdir(),'montclip-tokens-'));

test('a tokens file with a token that is exactly "@": a copy with 「＠」, in the cache, named by the source\'s SHA-256; the source untouched',()=>{
 const d=tmp();try{
  const src=path.join(d,'tokens.txt'),cache=path.join(d,'cache');
  fs.writeFileSync(src,'<blank> 0\n你 1\n@ 2\nab@@ 3\n@@ 4\n嗯 5\n');const before=fs.readFileSync(src,'utf8');
  const out=L.safeTokens(src,cache);
  a.equal(path.dirname(out),cache);a.equal(path.basename(out),'tokens-'+sha(src)+'.txt');
  a.equal(fs.readFileSync(out,'utf8'),'<blank> 0\n你 1\n＠ 2\nab@@ 3\n@@ 4\n嗯 5\n','only the token that is exactly "@" changes');
  a.equal(fs.readFileSync(src,'utf8'),before,'the model\'s own file is not changed');
  // again: the same copy, not written again
  const t0=fs.statSync(out).mtimeMs;a.equal(L.safeTokens(src,cache),out);a.equal(fs.statSync(out).mtimeMs,t0);
  // the source changes: another copy
  fs.writeFileSync(src,'<blank> 0\n@ 1\n');const out2=L.safeTokens(src,cache);
  a.notEqual(out2,out);a.equal(fs.readFileSync(out2,'utf8'),'<blank> 0\n＠ 1\n');
  // Windows line ends are kept
  fs.writeFileSync(src,'<blank> 0\r\n@ 1\r\n');a.equal(fs.readFileSync(L.safeTokens(src,cache),'utf8'),'<blank> 0\r\n＠ 1\r\n');
  // nothing to fix: the file itself, nothing written
  const ok=path.join(d,'ok.txt');fs.writeFileSync(ok,'<blank> 0\n你 1\n');const c2=path.join(d,'c2');
  a.equal(L.safeTokens(ok,c2),ok);a.ok(!fs.existsSync(c2));
 }finally{fs.rmSync(d,{recursive:true,force:true});}
});

test('the recognizer is made with the safe copy; 「＠」 never reaches the words',async()=>{
 const src=fs.readFileSync(path.join(ROOT,'server/asr-local.js'),'utf8');
 a.match(src,/tokens: safeTokens\(path\.join\(dir, "tokens\.txt"\), cacheDir\)/);
 // a recognizer that says 「＠」 among the words
 const rec={createStream:()=>({acceptWaveform(){}}),decodeAsync:async()=>({tokens:['你','＠','好'],timestamps:[0,0.3,0.6]})};
 const r=await L.segmentWords(rec,new Float32Array(16000),10,null);
 a.deepEqual(r.words.map(w=>w[0]),['你','好']);a.deepEqual(r.gaps,[]);
});

test('only decodeAsync: the synchronous decode() aborts the whole process on this token',()=>{
 const src=fs.readFileSync(path.join(ROOT,'server/asr-local.js'),'utf8').replace(/\/\*[\s\S]*?\*\//g,'').replace(/\/\/.*$/gm,'');
 a.ok(/\.decodeAsync\(/.test(src));a.ok(!/\.decode\(/.test(src),'no decode() call');
});

// Rea's reproduction on the real engine and model: a temporary tokens.txt whose 「嗯」 (what 0.5 s of silence decodes to;
// id 7477 in this model) is "@", and 0.5 s of silence. Needs vendor/asr with the model (node desktop/fetch-asr.cjs
// --models asr), or MONTCLIP_ASR_DIR pointing at one; skipped where it is not there (CI has no model).
const VENDOR=path.resolve(process.env.MONTCLIP_ASR_DIR||path.join(ROOT,'vendor','asr'));
const MODEL=path.join(VENDOR,'models','asr','model.int8.onnx');
test('the real engine: "@" in place of 「嗯」 throws on 0.5 s of silence; the safe copy decodes it, without 「＠」',{skip:!fs.existsSync(MODEL)&&'no speech model here (vendor/asr/models/asr not fetched; CI has none)'},async()=>{
 const S=require(path.join(VENDOR,'engine','node_modules','sherpa-onnx-node'));
 const make=(tokens)=>S.OfflineRecognizer.createAsync({featConfig:{sampleRate:16000,featureDim:80},modelConfig:{paraformer:{model:MODEL},tokens,numThreads:1,provider:'cpu',debug:0}});
 const d=tmp();try{
  const lines=fs.readFileSync(path.join(VENDOR,'models','asr','tokens.txt'),'utf8').split('\n');
  const k=lines.findIndex(l=>/^嗯 \d+\r?$/.test(l));a.ok(k>=0,'嗯 is in the tokens');
  lines[k]=lines[k].replace(/^嗯/,'@');
  const bad=path.join(d,'tokens.txt');fs.writeFileSync(bad,lines.join('\n'));
  const decode=async(tokens)=>{const r=await make(tokens),s=r.createStream();s.acceptWaveform({sampleRate:16000,samples:new Float32Array(8000)});return r.decodeAsync(s);};
  await a.rejects(decode(bad),/basic_string::_S_create|string too long/,'the baseline: it throws');
  const res=await decode(L.safeTokens(bad,path.join(d,'cache')));
  a.ok(Array.isArray(res.tokens));
  const r=await L.segmentWords(await make(L.safeTokens(bad,path.join(d,'cache'))),new Float32Array(8000),0,null);
  a.deepEqual(r.gaps,[]);a.ok(!r.words.some(w=>/＠/.test(w[0])),'no 「＠」 in the words');
 }finally{fs.rmSync(d,{recursive:true,force:true});}
});
