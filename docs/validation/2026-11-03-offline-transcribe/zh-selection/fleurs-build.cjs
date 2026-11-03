// node fleurs-build.cjs <fleurs dir> <ffmpeg>: set100.wav (100 utterances, 1 s apart) + ref100.txt, ten.wav (600 s)
const fs = require('fs'), path = require('path'), cp = require('child_process');
const [dir, ff] = process.argv.slice(2);
const p = JSON.parse(fs.readFileSync(path.join(dir, 'pick100.json'), 'utf8'));
const q = (f) => "file '" + path.join(dir, f).replace(/\\/g, '/') + "'";
cp.execFileSync(ff, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'anullsrc=r=16000:cl=mono', '-t', '1', path.join(dir, 'gap.wav')]);
fs.writeFileSync(path.join(dir, 'list100.txt'), p.map((x) => q('test/' + x.file) + '\n' + q('gap.wav')).join('\n'));
fs.writeFileSync(path.join(dir, 'ref100.txt'), p.map((x) => x.norm.replace(/\s+/g, '')).join(''));
cp.execFileSync(ff, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', path.join(dir, 'list100.txt'), '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', path.join(dir, 'set100.wav')]);
cp.execFileSync(ff, ['-hide_banner', '-loglevel', 'error', '-y', '-stream_loop', '1', '-i', path.join(dir, 'set100.wav'), '-t', '600', '-c:a', 'pcm_s16le', path.join(dir, 'ten.wav')]);
const dur = (f) => (cp.spawnSync(ff, ['-i', path.join(dir, f)], { encoding: 'utf8' }).stderr.match(/Duration: [0-9:.]+/) || [''])[0];
console.log('set100', dur('set100.wav'), 'ten', dur('ten.wav'));
