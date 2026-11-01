// Read only fixture inputs; retain small derived evidence in a new temp folder.
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const {execFileSync} = require('node:child_process');
const {createHash} = require('node:crypto');
const {prepareMedia} = require('../../prepare-media');
const hash = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function inspect(file) {
  const data = JSON.parse(execFileSync('ffprobe', ['-v','error','-show_packets','-show_streams','-show_format','-of','json',file], {maxBuffer:16*1024*1024,windowsHide:true}));
  const tracks = data.streams.filter(s => ['video','audio'].includes(s.codec_type)).map(s => {
    const packets = data.packets.filter(p => p.stream_index === s.index && p.pts_time != null).sort((a,b) => Number(a.pts_time)-Number(b.pts_time));
    let gap=0;
    for(let i=1;i<packets.length;i++) gap=Math.max(gap, Number(packets[i].pts_time)-Number(packets[i-1].pts_time)-Number(packets[i-1].duration_time||0));
    return {kind:s.codec_type, first:Number(packets[0].pts_time), end:Math.max(...packets.map(p => Number(p.pts_time)+Number(p.duration_time||0))), maxGap:gap, packets:packets.length};
  });
  const pcm = execFileSync('ffmpeg',['-v','error','-i',file,'-vn','-ac','1','-ar','48000','-f','s16le','-'],{maxBuffer:16*1024*1024,windowsHide:true});
  return {sha256:hash(file), formatDuration:Number(data.format.duration), tracks, decodedPcmSeconds:pcm.length/2/48000};
}
(async()=>{
  const fixtures = process.argv[2]; if(!fixtures) throw Error('Pass the synthetic fixture directory');
  const out = fs.mkdtempSync(path.join(os.tmpdir(),'MontClip FLV PTS '));
  const receipt={scope:'Compatibility preparation only; not compositor export, UI, ASR or package acceptance', sourceCodeHash:hash(path.join(__dirname,'../../prepare-media.js')), timelineCodeHash:hash(path.join(__dirname,'../../flv-timeline.js')), cases:[]};
  for(const name of fs.readdirSync(fixtures).filter(n=>n.endsWith('.flv'))) {
    const input=path.join(fixtures,name), copy=path.join(out,name);
    fs.copyFileSync(input,copy);
    const before=inspect(input);
    try {
      const result=await prepareMedia(copy);
      receipt.cases.push({name,before,result,after:inspect(path.join(out,decodeURIComponent(result.src.slice(7))))});
    } catch(error) { receipt.cases.push({name,before,error:{code:error.code,message:error.message}}); }
    if(hash(input)!==before.sha256 || hash(copy)!==before.sha256) throw Error('Original changed');
  }
  fs.writeFileSync(path.join(out,'receipt.json'),JSON.stringify(receipt,null,2));
  console.log(JSON.stringify({out,receipt},null,2));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
