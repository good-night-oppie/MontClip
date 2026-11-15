'use strict';
// #321 (ADR #341) — the streamer's path on a real Windows desktop, for SOP 13: a fresh profile in a new temporary folder, the review switch off
// by default, switched on in Settings, a synthetic clip prepared, and sent. Nothing is shown before a send (owner's decision 2026-11-15, #321
// 6888246693): the streamer's click is the consent. The assistant's request in the default (manual) mode is refused (NEEDS_CLICK) and reaches
// nothing; the streamer's request goes once. The person running it presses nothing on the desktop: the window stays hidden. The "outside" here is
// only a local stand-in on 127.0.0.1 that counts what reaches it, honoured only in an unpackaged --montclip-smoke run (desktop/review-sender.js).
// Nothing leaves the computer.
// Run: electron desktop/review-send-smoke.cjs --montclip-smoke --user-data-dir=<new empty folder>
// Prints REVIEW_SEND_PASS {…} or REVIEW_SEND_FAIL <why>.
const { app } = require('electron'), fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const { execFileSync } = require('node:child_process');
if (!process.argv.includes('--montclip-smoke')) throw Error('Explicit smoke required');
const profileArg=process.argv.find(a=>a.startsWith('--user-data-dir='));
if(!profileArg||!profileArg.slice('--user-data-dir='.length).trim())throw Error('A fresh --user-data-dir is required');
const profile = profileArg.slice('--user-data-dir='.length);
if (fs.existsSync(profile) && fs.readdirSync(profile).length) throw Error('--user-data-dir must be a new, empty folder');
app.setPath('userData', profile);

/* the local stand-in for openrouter.ai: counts requests, answers like a receipt from Google AI Studio */
const hits = [];
const standin = http.createServer((req, res) => {
  const chunks = []; req.on('data', (c) => chunks.push(c));
  req.on('end', () => { hits.push({ path: req.url, bytes: Buffer.concat(chunks).length });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ provider: 'Google AI Studio', model: 'google/gemini-4-carbon', usage: { prompt_tokens_details: { audio_tokens: 40 } },
      choices: [{ message: { content: JSON.stringify({ verdict: 'pass', summary: 'stand-in', windowDigest: '', findings: [], dimensions: { fact: { state: 'passed' }, subtitle: { state: 'passed' }, pacing: { state: 'passed' }, packaging: { state: 'passed' } } }) } }] })); });
});
standin.listen(0, '127.0.0.1', () => {
  process.env.MONTCLIP_REVIEW_STANDIN = 'http://127.0.0.1:' + standin.address().port;
  process.env.MONTCLIP_REVIEW_DEST_CONFIRMED = 'openrouter.ai';   // this run's own process only; the owner's real setting is untouched
  delete process.env.MONTCLIP_REVIEW_AGENT_SEND;
  start();
});

function start() {
  const { BrowserWindow } = require('electron');
  const original = BrowserWindow.prototype.loadURL;
  BrowserWindow.prototype.loadURL = async function (...args) {
    await original.apply(this, args);
    const win = this, read = (s) => win.webContents.executeJavaScript(s), wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const steps = []; let passed = false;
    const step = (s) => { steps.push(s); process.stdout.write('REVIEW_STEP ' + s + '\n'); };
    try {
      await read(`(async()=>{const until=Date.now()+20000;while(!state.connected&&Date.now()<until)await new Promise(r=>setTimeout(r,50));return state.connected;})()`);
      win.setContentSize(1280, 800);
      win.webContents.setBackgroundThrottling(false);   // the window stays hidden; its render must not be throttled (export-jobs.js ends a silent hidden tab's job)
      /* 1. Settings: the switch is off by default; the streamer turns it on and saves a key (a dummy: only the stand-in sees it) */
      await read(`document.getElementById('btnSettings').click();true`); await wait(600);
      const before = await read(`({on:document.getElementById('setReviewEnabled').checked,shown:!document.getElementById('setReview').classList.contains('hidden')})`);
      if (!before.shown || before.on) throw Error('SWITCH_NOT_OFF_BY_DEFAULT ' + JSON.stringify(before));
      step('设置里「审片时把片段发到 openrouter.ai」默认关');
      await read(`document.getElementById('setReviewEnabled').click();true`); await wait(400);
      await read(`(()=>{const f=document.getElementById('setReviewKey');f.value='sk-or-v1-dummy-standin-only';document.getElementById('btnReviewKeySave').click();return true;})()`); await wait(400);
      const after = await read(`({on:document.getElementById('setReviewEnabled').checked,key:document.getElementById('setReviewKeyState').textContent})`);
      if (!after.on) throw Error('SWITCH_DID_NOT_TURN_ON');
      step('打开开关，保存密钥（' + after.key + '）');
      await wait(1500);   // a person looks at the switch
      await read(`document.getElementById('btnCloseSettings').click();true`); await wait(300);
      /* 2. a synthetic 6 s clip (test pattern + tone), no streamer material */
      const FF = require('../server/ffmpeg-path');
      const mediaDir = path.join(profile, 'workspace', 'media'); fs.mkdirSync(mediaDir, { recursive: true });
      /* a hidden window decodes no video frames (they come out black, and the export rightly refuses a black file): the picture is a title, the
         sound a synthetic tone on A1 */
      execFileSync(FF.path('ffmpeg'), ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'sine=f=440:duration=6', '-ac', '2', '-ar', '48000', path.join(mediaDir, 'synthetic.wav')], { windowsHide: true });
      await read(`(async()=>{const doc=projectJSON();doc.media.push({id:'m_syn',src:'/media/synthetic.wav',kind:'audio',name:'合成.wav',duration:6});
        doc.clips.push({id:'c_title',kind:'text',mediaId:null,track:'V1',start:0,in:0,duration:6,props:{text:'合成片段',fontSize:96,color:'#ffffff'}},
          {id:'c_syn',kind:'audio',mediaId:'m_syn',track:'A1',start:0,in:0,duration:6,props:{volume:1}});applyProject(doc);scheduleSave();if(!await flushSave())throw Error('SAVE');return true;})()`);
      await wait(800);
      step('合成片段 6 秒（标题字＋提示音）');
      /* 3. prepare 0–3 s (the page's own request) and wait until it is ready */
      await read(`(()=>{const f=window.fetch;window.__jobs=[];window.fetch=(u,...a)=>{const k='/api/export/job/claim?id=',x=String(u),i=x.indexOf(k);if(i>=0)window.__jobs.push(decodeURIComponent(x.slice(i+k.length).split('&')[0]));return f(u,...a);};return true;})()`);
      const prep = await read(`fetch('/api/review/prepare',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({start:0,end:3,lead:0})}).then(r=>r.json())`);
      if (!prep.reviewId) throw Error('PREPARE ' + JSON.stringify(prep));
      let st = null;
      for (const until = Date.now() + 900000; Date.now() < until;) {
        st = await read(`fetch('/api/review/status?id=${prep.reviewId}').then(r=>r.json())`);
        if (st.state !== 'rendering') break; await wait(500);
        if (process.env.MONTCLIP_REVIEW_SMOKE_DEBUG) process.stdout.write('REVIEW_DEBUG ' + JSON.stringify(await read(`({exporting:!!state.exporting,bg:typeof bgExportBusy==='function'?bgExportBusy():null,hidden:document.hidden,connected:state.connected})`)) + ' progress=' + st.progress + '\n');
      }
      if (!st || st.state !== 'ready') { const jobs = await read(`Promise.all((window.__jobs||[]).map(id=>fetch('/api/export/job?id='+encodeURIComponent(id)).then(r=>r.json()).then(j=>({status:j.status,error:j.error,errorCode:j.errorCode,via:j.via}))))`); process.stdout.write('REVIEW_JOBS ' + JSON.stringify(jobs) + '\n'); }
      if (!st || st.state !== 'ready') throw Error('NOT_READY ' + JSON.stringify(st && { state: st.state, reason: st.reason }));
      step('准备好：发往 ' + st.willSend.to.host + '，视频 ' + st.willSend.videoBytes + ' 字节（不带声音），声音 ' + st.willSend.audioBytes + ' 字节（WAV）');
      /* 4. the assistant asks in the default mode (not approve-all, not Yolo): refused, nothing reaches the stand-in */
      const args = `{reviewId:${JSON.stringify(prep.reviewId)},token:${JSON.stringify(st.sendToken)},hash:${JSON.stringify(st.willSend.hash)}`;
      const ra = await read(`window.montclipReview.send(${args},assistant:true})`);
      if (!(ra && ra.ok === false && ra.code === 'NEEDS_CLICK' && hits.length === 0)) throw Error('ASSISTANT_NOT_REFUSED ' + JSON.stringify({ ra, hits: hits.length }));
      step('助手在默认模式下要发：' + ra.code + '，本地替身收到 ' + hits.length + ' 个请求');
      /* 5. the streamer clicks: no box, it goes once */
      const r = await read(`window.montclipReview.send(${args}})`);
      const end = await read(`fetch('/api/review/status?id=${prep.reviewId}').then(r=>r.json())`);
      const ok = r && r.ok === true && hits.length === 1 && hits[0].path === '/api/v1/chat/completions';
      if (!ok) throw Error('EXPECTED_ONE_SEND ' + JSON.stringify({ r: r && { ok: r.ok, code: r.code }, hits, state: end.state }));
      step('主播点击后：没有弹框，直接发出；本地替身收到 ' + hits.length + ' 个请求（' + hits[0].bytes + ' 字节），状态 ' + end.state);
      passed = true;
      process.stdout.write('REVIEW_SEND_PASS ' + JSON.stringify({ steps, standinHits: hits.length }) + '\n');
    } catch (e) { process.stdout.write('REVIEW_SEND_FAIL ' + e.message + '\n'); }
    finally { process.exitCode = passed ? 0 : 1; setTimeout(() => { standin.close(); app.exit(passed ? 0 : 1); }, 1500); }
  };
  require('./main');
}
