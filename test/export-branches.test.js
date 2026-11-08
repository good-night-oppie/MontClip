'use strict';
/* #229 verify (PG's closure condition, after #238): every branch of the per-piece self-check, through the real routes
   (/api/export/begin → audio → frames → /api/export/end, a profile export, the bundled ffmpeg), on generated media.
   For each one the outcome the streamer sees: the file kept or not, the code, and never a plain pass.
     1. the source is quiet too       → kept, EXPORT_CLIP_SILENT, the report not ok
     2. the source can't be decoded   → stopped, EXPORT_AUDIO_FAILED, no file (a truncated MP4 here; random bytes:
                                        export-check.test.js)
     3. the source read runs out of time, on a source WITH sound → kept, EXPORT_CLIP_UNCHECKED, the report not ok, never
                                        lost (a quiet source: export-check.test.js; a partial max_volume printed by a read
                                        stopped for time: the stand-in runner in export-check.test.js, any OS)
     controls: sound lost in the export while the source has it → stopped, no file; a normal audible export → passes.
   Synthetic media only: a sine with digital silence after it, a truncated MP4, a fragmented MP4 with a tone. */
const test = require('node:test'), a = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { execFileSync } = require('node:child_process');
const FF = require('../ffmpeg-path');
const noFf = !FF.available('ffmpeg') && 'bundled ffmpeg not installed';
const ff = (args, opts) => execFileSync(FF.path('ffmpeg'), ['-v', 'error', '-y', ...args], { windowsHide: true, ...opts });

function tmp(t, name) {
  const dir = fs.mkdtempSync(path.join(require('os').tmpdir(), name));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}
/** 12 s mono: a 440 Hz tone for 0–5 s, digital silence 5–12 s. */
function toneThenSilence(file) {
  ff(['-f', 'lavfi', '-i', "aevalsrc='if(lt(t,5),0.3*sin(2*PI*440*t),0)':s=48000:d=12", '-c:a', 'pcm_s16le', file]);
}
/** One profile export through the real routes, its source files copied into media/ and its plan as given.
 *  → {status, out (the /api/export/end reply), exports (finished files)} */
async function profileExport(t, { files, check, env = {} }) {
  const { makeDataDir, seedProject, startServer } = require('./helpers');
  const data = makeDataDir(t, seedProject({ revision: 1 }));
  fs.mkdirSync(path.join(data, 'media'), { recursive: true });
  for (const [name, from] of Object.entries(files)) fs.copyFileSync(from, path.join(data, 'media', name));
  const { base } = await startServer(t, data, { FABLECUT_NO_FS_WATCH: '1', MONTCLIP_EXPORT_CHECK_TIMEOUT_MS: '120000', ...env });
  const post = (route, b, json = true) => fetch(base + route, { method: 'POST', ...(json ? { headers: { 'Content-Type': 'application/json' } } : {}), body: json ? JSON.stringify(b) : b });
  const jpeg = ff(['-f', 'lavfi', '-i', 'color=c=gray:size=320x180', '-frames:v', '1', '-c:v', 'mjpeg', '-f', 'image2pipe', '-']);
  // the mix the page sends: loud all through, as music over the whole export would be
  const wav = ff(['-f', 'lavfi', '-i', 'sine=f=440:r=48000:d=1', '-f', 'wav', '-']);
  const begin = await (await post('/api/export/begin', { fps: 30, frames: 30, profile: 'prores422', name: 'branch', hasAudio: true, check })).json();
  a.ok(begin.id, JSON.stringify(begin));
  a.equal((await post('/api/export/audio?id=' + begin.id, wav, false)).status, 200);
  a.equal((await post('/api/export/frame?id=' + begin.id, Buffer.concat(Array(30).fill(jpeg)), false)).status, 200);
  const res = await post('/api/export/end?id=' + begin.id, {});
  const out = await res.json();
  return { status: res.status, out, exports: fs.readdirSync(path.join(data, 'exports')).filter((f) => /\.mov$/.test(f)) };
}
const codes = (out) => (out.report ? out.report.checks.map((c) => [c.code || 'ok', c.n, c.t]) : []);

test('#229 branch 1 — the source is quiet too: kept, 「是无声的」 (EXPORT_CLIP_SILENT), not a pass', { skip: noFf, timeout: 120_000 }, async (t) => {
  const dir = tmp(t, 'mc229q-'), rec = path.join(dir, 'rec.wav');
  toneThenSilence(rec);
  const r = await profileExport(t, { files: { 'rec.wav': rec },
    check: { video: [], audio: [{ src: '/media/rec.wav', at: 0, dur: 4 }], silent: [{ n: 2, t: 10, src: '/media/rec.wav', at: 6, dur: 5 }] } });
  a.equal(r.status, 200, 'not a failure: ' + JSON.stringify(r.out));
  a.equal(r.out.ok, true); a.equal(r.out.code, undefined);
  a.deepEqual(r.exports, ['branch.mov'], 'the file is kept');
  a.ok(r.out.report, 'a report: the warning is not dropped');
  a.equal(r.out.report.ok, false, 'not a pass: the loud mix does not hide the silent piece');
  a.deepEqual(codes(r.out), [['EXPORT_CLIP_SILENT', 2, 10]]);
});

test('#229 branch 2 — the source can\'t be decoded (a truncated MP4): the export stops, EXPORT_AUDIO_FAILED, no file', { skip: noFf, timeout: 120_000 }, async (t) => {
  const dir = tmp(t, 'mc229d-'), whole = path.join(dir, 'whole.mp4'), cut = path.join(dir, 'cut.mp4');
  // a tone in an MP4 whose index (moov) is written at the end; cut in half, the index is gone
  ff(['-f', 'lavfi', '-i', 'sine=f=440:r=48000:d=10', '-c:a', 'aac', '-b:a', '64k', whole]);
  const bytes = fs.readFileSync(whole);
  fs.writeFileSync(cut, bytes.subarray(0, bytes.length >> 1));
  a.throws(() => ff(['-i', cut, '-map', '0:a:0', '-f', 'null', '-'], { stdio: 'pipe' }), 'ffmpeg can\'t read the truncated file');
  const r = await profileExport(t, { files: { 'rec.mp4': cut },
    check: { video: [], audio: [], silent: [{ n: 3, t: 72, src: '/media/rec.mp4', at: 1, dur: 5 }] } });
  a.equal(r.status, 500, JSON.stringify(r.out));
  a.notEqual(r.out.ok, true); a.equal(r.out.code, 'EXPORT_AUDIO_FAILED');
  a.deepEqual(r.out.params, { clips: [{ n: 3, t: 72 }] });
  a.deepEqual(r.exports, [], 'no file kept as a usable export');
});

test('#229 branch 3 — the read of a source with sound runs out of time: kept, EXPORT_CLIP_UNCHECKED, never lost, not a pass', { skip: noFf, timeout: 180_000 }, async (t) => {
  const dir = tmp(t, 'mc229t-'), frag = path.join(dir, 'frag.mp4');
  // a fragmented MP4 (thousands of moof boxes, slow to open) with a tone all through: read to its end it is loud, so a
  // read that ran out of time and were taken as finished would say the export lost it and delete the file
  ff(['-f', 'lavfi', '-i', 'sine=f=440:r=48000:d=600', '-ac', '1', '-c:a', 'aac', '-b:a', '24k',
    '-movflags', '+frag_keyframe+empty_moov+default_base_moof', '-frag_duration', '100000', frag]);
  const check = { video: [], audio: [], silent: [{ n: 2, t: 10, src: '/media/rec.mp4', at: 300, dur: 5 }] };
  const slow = await profileExport(t, { files: { 'rec.mp4': frag }, check, env: { MONTCLIP_EXPORT_CHECK_TIMEOUT_MS: '1' } });
  a.equal(slow.status, 200, 'out of time is not a failure: ' + JSON.stringify(slow.out));
  a.equal(slow.out.ok, true); a.equal(slow.out.code, undefined);
  a.deepEqual(slow.exports, ['branch.mov'], 'the file is kept');
  a.equal(slow.out.report.ok, false, 'not a pass');
  a.deepEqual(codes(slow.out), [['EXPORT_CLIP_UNCHECKED', 2, 10]]);
  // the same plan given time to read: the source has sound there, so the export lost it — stops, no file
  const read = await profileExport(t, { files: { 'rec.mp4': frag }, check });
  a.equal(read.status, 500, JSON.stringify(read.out)); a.equal(read.out.code, 'EXPORT_AUDIO_FAILED');
  a.deepEqual(read.exports, []);
});

test('#229 negative control — sound lost in the export while the source has it: the export stops, no file', { skip: noFf, timeout: 120_000 }, async (t) => {
  const dir = tmp(t, 'mc229n-'), rec = path.join(dir, 'rec.wav');
  toneThenSilence(rec);
  const r = await profileExport(t, { files: { 'rec.wav': rec },
    check: { video: [], audio: [], silent: [{ n: 4, t: 30, src: '/media/rec.wav', at: 0.5, dur: 4 }] } });
  a.equal(r.status, 500, JSON.stringify(r.out));
  a.notEqual(r.out.ok, true); a.equal(r.out.code, 'EXPORT_AUDIO_FAILED');
  a.deepEqual(r.out.params, { clips: [{ n: 4, t: 30 }] });
  a.deepEqual(r.exports, [], 'no file');
});

test('#229 positive control — a normal audible export passes: kept, no code, no warning', { skip: noFf, timeout: 120_000 }, async (t) => {
  const dir = tmp(t, 'mc229p-'), rec = path.join(dir, 'rec.wav');
  toneThenSilence(rec);
  const r = await profileExport(t, { files: { 'rec.wav': rec },
    check: { video: [], audio: [{ src: '/media/rec.wav', at: 0, dur: 4 }], silent: [] } });
  a.equal(r.status, 200, JSON.stringify(r.out));
  a.equal(r.out.ok, true); a.equal(r.out.code, undefined);
  a.equal(r.out.report, undefined, 'nothing to warn about');
  a.deepEqual(r.exports, ['branch.mov']);
});
