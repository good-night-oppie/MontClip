'use strict';
// The offline transcription benchmark (Deja, 2026-11-03): synthetic speech made with Windows' own TTS (OneCore voices),
// soft background music mixed in (about 11 dB under the voice), then each model through desktop/offline-transcribe-smoke.cjs
// (fresh profile, hidden window, every request logged). Writes <out>/<lang>-<minutes>min-<model>.json and prints a summary.
//   node docs/validation/2026-11-03-offline-transcribe/bench.cjs --lang zh-CN --minutes 10 --models base,small --out <dir>
//     [--electron <electron.exe>]   (default: the one in desktop/node_modules)
// Needs: the OneCore voice for the language (Chinese: Settings → Time & language → Speech, or as administrator
// Add-WindowsCapability -Online -Name "Language.TextToSpeech~~~zh-CN~0.0.1.0"), MONTCLIP_FFMPEG_DIR, vendor/transcribe.
// Every Electron it starts runs to the end of its own smoke; a time limit kills it.
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), cp = require('node:child_process');
const ROOT = path.join(__dirname, '..', '..', '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const LANG = arg('--lang', 'zh-CN'), MIN = Number(arg('--minutes', 10)), MODELS = arg('--models', 'base,small').split(','), OUT = path.resolve(arg('--out', '.'));
const ELECTRON = arg('--electron', path.join(ROOT, 'desktop', 'node_modules', 'electron', 'dist', 'electron.exe'));
const ffmpeg = require(path.join(ROOT, 'ffmpeg-path')).path('ffmpeg');
fs.mkdirSync(OUT, { recursive: true });
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-bench-'));
const tag = `${LANG.slice(0, 2)}-${MIN}min`;
try {
  // text: about 4.5 characters a second in Chinese, 15 in English
  const text = path.join(OUT, tag + '.txt');
  if (LANG.startsWith('zh')) cp.execFileSync(process.execPath, [path.join(__dirname, 'make-zh-text.cjs'), text, String(Math.round(MIN * 60 * 4.6))], { stdio: 'inherit' });
  else throw Error('only zh-CN text is generated here');
  cp.execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, 'make-speech.ps1'), '-Text', text, '-Wav', path.join(work, 'v.wav'), '-Lang', LANG], { stdio: 'inherit' });
  const pieces = fs.readdirSync(work).filter((f) => /^v\.wav\.\d+\.wav$/.test(f)).sort();
  fs.writeFileSync(path.join(work, 'list.txt'), pieces.map((f) => `file '${path.join(work, f).replace(/\\/g, '/')}'`).join('\n'));
  const voice = path.join(work, 'voice.wav'), mixed = path.join(OUT, tag + '.wav');
  cp.execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', path.join(work, 'list.txt'), '-ac', '1', '-ar', '16000', voice]);
  cp.execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-i', voice, '-f', 'lavfi', '-i',
    'aevalsrc=0.05*sin(2*PI*220*t)+0.04*sin(2*PI*277.2*t)+0.04*sin(2*PI*329.6*t)+0.03*sin(2*PI*110*t)*(0.5+0.5*sin(2*PI*0.5*t)):s=16000',
    '-filter_complex', '[1:a]volume=0.5[m];[0:a][m]amix=inputs=2:duration=first:normalize=0', '-ac', '1', '-ar', '16000', mixed]);
  const summary = [];
  for (const model of MODELS) {
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-bench-p-')), out = path.join(OUT, `${tag}-${model}.json`);
    const r = cp.spawnSync(ELECTRON, [path.join(ROOT, 'desktop', 'offline-transcribe-smoke.cjs'), '--montclip-smoke', '--user-data-dir=' + profile],
      { env: { ...process.env, MONTCLIP_ASR_AUDIO: mixed, MONTCLIP_ASR_TEXT: text, MONTCLIP_ASR_MODEL: model, MONTCLIP_ASR_LANG: LANG.slice(0, 2), MONTCLIP_ASR_OUT: out },
        encoding: 'utf8', timeout: Math.max(30, MIN * 6) * 60 * 1000, windowsHide: true });
    fs.rmSync(profile, { recursive: true, force: true });
    const line = (r.stdout || '').split(/\r?\n/).find((l) => l.startsWith('ASR_')) || ('ASR_FAIL ' + JSON.stringify({ status: r.status, signal: r.signal }));
    summary.push({ model, line });
    console.log(model, line);
  }
  fs.writeFileSync(path.join(OUT, tag + '-summary.json'), JSON.stringify(summary, null, 2) + '\n');
} finally { fs.rmSync(work, { recursive: true, force: true }); }
