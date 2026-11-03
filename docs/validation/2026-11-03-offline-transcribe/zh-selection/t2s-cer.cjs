// eval only: CER of a Whisper result file, raw and after traditional→simplified (opencc-js, tw→cn)
const fs=require('fs'),{cer}=require('./cer.cjs'),OpenCC=require('opencc-js');
const t2s=OpenCC.Converter({from:'tw',to:'cn'});
const [json,ref]=process.argv.slice(2);const j=JSON.parse(fs.readFileSync(json,'utf8'));const r=fs.readFileSync(ref,'utf8');
console.log(JSON.stringify({file:json.split(/[\/]/).pop(),raw:cer(r,j.text),t2s:cer(r,j.text,t2s),ms:j.transcribeMs,audio:j.audioSeconds,perHour:j.secondsPerAudioHour,peak:j.memoryPeakMB}));
