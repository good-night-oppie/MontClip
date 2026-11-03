'use strict';
// Manual: node docs/validation/2026-11-02-h264/compare.cjs [path-to-a-local-ffmpeg-with-libx264]
// Synthetic 1080p30 source (testsrc2 + moving mandelbrot overlay, 10 s), encoded at 6 Mb/s
// and at "constant quality" by every H.264 encoder that works here; SSIM / PSNR against the
// source with the bundled ffmpeg, frames paired by index (the MKV source keeps
// millisecond timestamps, so pairing by time would compare neighbouring frames);
// wall-clock time per encode. Writes results.json.
const fs=require('fs'),os=require('os'),path=require('path'),{spawnSync}=require('child_process');
const FF=require('../../../ffmpeg-path'),bundled=FF.path('ffmpeg');
const local=process.argv[2]||null;
const work=fs.mkdtempSync(path.join(os.tmpdir(),'mc-h264-'));
const src=path.join(work,'src.mkv');
const run=(bin,args)=>{const t0=process.hrtime.bigint();const r=spawnSync(bin,args,{encoding:'utf8',maxBuffer:64<<20});return{ok:r.status===0,ms:Number(process.hrtime.bigint()-t0)/1e6,err:(r.stderr||'').trim().split('\n').slice(-2).join(' ')};};
let r=run(bundled,['-v','error','-y','-f','lavfi','-i','testsrc2=s=1920x1080:r=30:d=10','-f','lavfi','-i','mandelbrot=s=640x360:r=30','-filter_complex','[0][1]overlay=x=t*120:y=200:shortest=1,format=yuv420p','-t','10','-c:v','ffv1',src]);
if(!r.ok)throw Error('source: '+r.err);
const rates={'6M':['-b:v','6M','-maxrate','6M','-bufsize','12M']};
const jobs=[
 ['h264_nvenc','NVIDIA NVENC',bundled,{q:['-preset','p5','-rc','vbr','-cq','23','-b:v','0'],b:['-preset','p5','-rc','vbr']},'yuv420p'],
 ['h264_qsv','Intel Quick Sync',bundled,{q:['-preset','medium','-global_quality','23'],b:['-preset','medium']},'nv12'],
 ['h264_amf','AMD AMF',bundled,{q:['-rc','cqp','-qp_i','23','-qp_p','23','-qp_b','23'],b:['-rc','vbr_peak']},'nv12'],
 ['h264_mf','Windows Media Foundation (software MFT)',bundled,{q:['-rate_control','quality','-quality','55'],b:['-rate_control','u_vbr']},'nv12'],
 ['h264_mf','Windows Media Foundation (hw_encoding)',bundled,{q:['-hw_encoding','1','-rate_control','quality','-quality','55'],b:['-hw_encoding','1','-rate_control','u_vbr']},'nv12'],
];
if(local)jobs.push(['libx264','x264 via your local FFmpeg (reference)',local,{q:['-preset','medium','-crf','23'],b:['-preset','medium']},'yuv420p']);
const metric=(file)=>{const s=spawnSync(bundled,['-hide_banner','-i',file,'-i',src,'-lavfi','[0:v]settb=AVTB,setpts=N/30/TB,split[a][c];[1:v]settb=AVTB,setpts=N/30/TB,split[b][d];[a][b]ssim;[c][d]psnr','-f','null','-'],{encoding:'utf8'}).stderr||'';
 return{ssim:+(/SSIM.*All:([\d.]+)/.exec(s)||[])[1]||null,psnr:+(/PSNR.*average:([\d.inf]+)/.exec(s)||[])[1]||null};};
const out=[];
for(const [enc,label,bin,modes,pix] of jobs)for(const [mode,extra] of [['quality',modes.q],['6 Mb/s',[...modes.b,...rates['6M']]]]){
 const file=path.join(work,`${enc}-${out.length}.mp4`);
 const e=run(bin,['-v','error','-y','-i',src,'-c:v',enc,...extra,'-pix_fmt',pix,'-g','60','-an',file]);
 const row={encoder:enc,label,mode,ok:e.ok,seconds:+(e.ms/1000).toFixed(2),fpsx:e.ok?+(300/(e.ms/1000)).toFixed(1):null};
 if(e.ok){row.sizeMB=+(fs.statSync(file).size/1e6).toFixed(2);row.kbps=Math.round(fs.statSync(file).size*8/10/1000);Object.assign(row,metric(file));}else row.error=e.err;
 out.push(row);console.log(JSON.stringify(row));
}
fs.writeFileSync(path.join(__dirname,'results.json'),JSON.stringify({source:'testsrc2 1920x1080 30 fps 10 s + moving mandelbrot overlay (synthetic)',cpu:os.cpus()[0].model,platform:`${process.platform} ${os.release()}`,results:out},null,1)+'\n');
fs.rmSync(work,{recursive:true,force:true});
