'use strict';
const {test}=require('node:test'),a=require('node:assert/strict'),crypto=require('node:crypto');
const A=require('../bgremove-assets');
const entries=Object.entries(A.FILES);
// Synthetic transport/digest oracle: no real model bytes or executable third-party code.
// Success-path fake bytes are all zero; the oracle supplies the independently pinned digest.
function platform({badName,oversize=false,redirect=false}={}){
 const requests=[],blobs=[],revoked=[];
 let current;
 const p={Blob,URL:{createObjectURL(blob){blobs.push(blob);return 'blob:local/'+blobs.length;},revokeObjectURL(u){revoked.push(u);}},
  crypto:{subtle:{async digest(alg,bytes){
   if(bytes.some(v=>v!==0))return crypto.webcrypto.subtle.digest(alg,bytes);
   return Uint8Array.from(Buffer.from(A.FILES[current].sha256,'base64'));
  }}},
  async fetch(url,options){
   requests.push({url,options});current=url.slice(A.BASE.length);
   const bytes=new Uint8Array(A.FILES[current].size+(badName===current&&oversize?1:0));
   if(badName===current&&!oversize&&bytes.length)bytes[0]=1;
   const r=new Response(bytes);Object.defineProperty(r,'url',{value:redirect?'https://other.invalid/x':url});
   return r;
  }};
 return {p,requests,blobs,revoked};
}
test('exact inventory includes entry, both WASM variants, both models, graph and data',()=>{
 a.equal(A.VERSION,'0.1.1675465747');a.equal(entries.length,9);
 a.equal(entries.reduce((s,[,f])=>s+f.size,0),12379063);
 for(const [n,f]of entries){a.match(A.source(n),/selfie_segmentation@0\.1\.1675465747\//);a.match(f.sha256,/^[A-Za-z0-9+/]{43}=$/);}
 for(const n of ['../x','selfie_segmentation.js?x','https://other.invalid/x','__proto__','selfie_segmentation.min.js'])a.throws(()=>A.source(n),/NOT_ALLOWED/);
});
test('no consent or missing WebCrypto makes zero requests and zero executable URLs',async()=>{
 const h=platform();for(const c of [false,undefined,'true'])await a.rejects(A.load(c,h.p),/CONSENT_REQUIRED/);
 await a.rejects(A.load(true,{...h.p,crypto:null}),/CRYPTO_UNAVAILABLE/);
 a.equal(h.requests.length,0);a.equal(h.blobs.length,0);
});
test('all nine synthetic resources verified before local resolution; fetch never follows redirects or sends credentials',async()=>{
 const h=platform(),assets=await A.load(true,h.p);
 a.equal(h.requests.length,9);a.equal(h.blobs.length,9);
 for(const [i,[name,spec]]of entries.entries()){
  a.equal(h.requests[i].url,A.source(name));
  a.deepEqual(h.requests[i].options,{integrity:'sha256-'+spec.sha256,credentials:'omit',redirect:'error',referrerPolicy:'no-referrer',cache:'no-store'});
  a.match(assets.locateFile(name),/^blob:local\//);
 }
 for(const n of ['../x','selfie_segmentation.js?x','https://other.invalid/x','__proto__'])a.throws(()=>assets.locateFile(n),/NOT_ALLOWED/);
 assets.dispose();a.equal(h.revoked.length,9);a.throws(()=>assets.locateFile('selfie_segmentation.js'),/NOT_ALLOWED/);
});
test('corruption of any JS/WASM/model/graph and oversize empty data releases no executable bytes',async()=>{
 for(const [name,spec]of entries){
  const h=platform({badName:name,oversize:!spec.size});
  await a.rejects(A.load(true,h.p),/INTEGRITY/);a.equal(h.blobs.length,0,name);
 }
});
test('redirected asset response is rejected before any execution',async()=>{
 const h=platform({redirect:true});await a.rejects(A.load(true,h.p),/RESPONSE/);a.equal(h.blobs.length,0);
});
test('real WebCrypto accepts the pinned empty data and rejects changed/shortened bytes',async()=>{
 const name='selfie_segmentation_solution_simd_wasm_bin.data';
 await A.verify(name,new Uint8Array(),crypto.webcrypto);
 await a.rejects(A.verify(name,Uint8Array.of(1),crypto.webcrypto),/INTEGRITY/);
 await a.rejects(A.verify('selfie_segmentation.js',new Uint8Array(44542),crypto.webcrypto),/INTEGRITY/);
 await a.rejects(A.verify('selfie_segmentation.tflite',new Uint8Array(),crypto.webcrypto),/INTEGRITY/);
});
