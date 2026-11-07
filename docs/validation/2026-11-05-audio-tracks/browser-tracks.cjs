// Which audio track does Chromium use for decodeAudioData and for <video> playback? node browser-tracks.cjs <dir> <file>...
"use strict";
const http = require("http"), fs = require("fs"), path = require("path"), os = require("os"), { spawn } = require("child_process");
const dir = path.resolve(process.argv[2]), files = process.argv.slice(3);
const CHROME = process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const page = `<!doctype html><script>
const files=${JSON.stringify(files)};
const freq=(d,rate)=>{let z=0;for(let i=1;i<d.length;i++)if((d[i-1]<0)!==(d[i]<0))z++;return z/2/(d.length/rate);};
const rms=(d)=>{let s=0;for(const x of d)s+=x*x;return 10*Math.log10(s/d.length+1e-12);};
(async()=>{const out=[];const ctx=new AudioContext();
for(const f of files){const r={file:f};
 try{const b=await ctx.decodeAudioData(await (await fetch('/m/'+f)).arrayBuffer());const d=b.getChannelData(0);
  const at=(t)=>d.subarray(Math.floor(t*b.sampleRate),Math.floor((t+0.5)*b.sampleRate));
  r.decode={ch:b.numberOfChannels,hz10:Math.round(freq(at(10),b.sampleRate)),db2:Math.round(rms(at(2))),db10:Math.round(rms(at(10)))};}catch(e){r.decode='ERR '+e.message;}
 try{const v=document.createElement('video');v.src='/m/'+f;v.muted=false;document.body.appendChild(v);
  await new Promise((res,rej)=>{v.onloadedmetadata=res;v.onerror=()=>rej(new Error('media error '+(v.error&&v.error.code)));});
  const src=ctx.createMediaElementSource(v),an=ctx.createAnalyser();an.fftSize=32768;src.connect(an);
  await ctx.resume();
  const probe=async(t)=>{v.currentTime=t;await new Promise(r=>v.onseeked=r);await v.play();await new Promise(r=>setTimeout(r,600));const d=new Float32Array(an.fftSize);an.getFloatTimeDomainData(d);v.pause();return{hz:Math.round(freq(d,ctx.sampleRate)),db:Math.round(rms(d))};};
  r.play={at2:await probe(2),at10:await probe(10),tracks:v.audioTracks?v.audioTracks.length:'n/a'};v.remove();}catch(e){r.play='ERR '+e.message;}
 out.push(r);}
await fetch('/result',{method:'POST',body:JSON.stringify(out)});})();
</script>`;
let chrome;
const srv = http.createServer((req, res) => {
  if (req.url === "/") { res.writeHead(200, { "Content-Type": "text/html" }); return res.end(page); }
  if (req.url.startsWith("/m/")) {
    const f = path.join(dir, decodeURIComponent(req.url.slice(3))); const st = fs.statSync(f);
    const type = f.endsWith(".mkv") ? "video/x-matroska" : "video/mp4";
    const m = /bytes=(\d+)-(\d*)/.exec(req.headers.range || "");
    if (m) { const a = +m[1], b = m[2] ? +m[2] : st.size - 1; res.writeHead(206, { "Content-Type": type, "Content-Range": `bytes ${a}-${b}/${st.size}`, "Content-Length": b - a + 1, "Accept-Ranges": "bytes" }); return fs.createReadStream(f, { start: a, end: b }).pipe(res); }
    res.writeHead(200, { "Content-Type": type, "Content-Length": st.size, "Accept-Ranges": "bytes" }); return fs.createReadStream(f).pipe(res);
  }
  if (req.url === "/result") { let b = ""; req.on("data", (d) => b += d); req.on("end", () => { for (const r of JSON.parse(b)) console.log(JSON.stringify(r)); res.end(); chrome.kill(); srv.close(); }); return; }
  res.writeHead(404); res.end();
});
srv.listen(0, "127.0.0.1", () => {
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), "mc-chrome-"));
  chrome = spawn(CHROME, ["--headless=new", "--no-first-run", "--autoplay-policy=no-user-gesture-required", "--user-data-dir=" + prof, "http://127.0.0.1:" + srv.address().port + "/"], { stdio: "ignore" });
  console.error("chrome pid", chrome.pid);
  setTimeout(() => { console.error("timeout"); chrome.kill(); srv.close(); }, 90000).unref();
});
