'use strict';
// QQ's review of #130: prepare-media.js logged every FLV import's breaks and drift with path.basename(file). The desktop
// import copies a recording under its own name's stem (desktop/flv-import.js), and a streamer's recording is often
// named after their account or nickname, so the name went to stderr. The log now names an import only by a random id
// made for it, and says how many breaks, where, how long, and the drift — never any part of the file's name or path.
const { test } = require('node:test'), a = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const os = require('node:os');
const root = path.join(__dirname, '..');

const DIR = path.join(os.tmpdir(), '录像-账号123456');
const NAME = '账号123456-主播昵称-2026直播.flv';
/** Every piece of the name and of its folder a log line must not hold: the whole, each part, the stem. */
const PIECES = [NAME, path.basename(NAME, '.flv'), '账号123456', '账号', '123456', '主播昵称', '2026直播', '录像-账号123456'];
const leaks = (text) => PIECES.filter((p) => text.includes(p));

/** prepare-media.js with ffmpeg, the file system and the packet scan faked: an H.264 + AAC recording whose packet scan
 *  reports `range`. Its console is captured. */
function world(range) {
  const lines = [];
  const fakeFs = { statSync: () => ({ size: 12 }), renameSync() {}, rmSync() {} };
  const streams = [{ codec_type: 'video', codec_name: 'h264', pix_fmt: 'yuv420p' }, { codec_type: 'audio', codec_name: 'aac' }];
  const child = { execFile(cmd, args, opts, cb) { cb(null, JSON.stringify({ streams, format: { duration: range.duration } }), ''); return { once() {}, stdout: null }; } };
  const mod = { exports: {} };
  const console = { error: (...x) => lines.push(x.join(' ')), log: (...x) => lines.push(x.join(' ')), warn: (...x) => lines.push(x.join(' ')), info: (...x) => lines.push(x.join(' ')) };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'prepare-media.js'), 'utf8'), {
    module: mod, exports: mod.exports, console,
    require: (id) => id === './ffmpeg-path' ? { path: (n) => n, available: () => true } : id === 'fs' ? fakeFs
      : id === 'node:child_process' ? child
      : id === './flv-readable-range' ? { MARK: 0.005, async scanReadableRange() { return range; } } : require(id),
  });
  return { prepareMedia: mod.exports.prepareMedia, lines };
}
const RANGE = {
  duration: 60, needsConsent: false, fix: [], drifting: true, drift: 0.123,
  gaps: [{ stream: 'video', at: 12.5, len: 0.067, big: false }, { stream: 'audio', at: 41.25, len: 0.058, big: false }],
  tracks: { video: { start: 0, end: 60 }, audio: { start: 0, end: 59.877 } },
};

test('an FLV import with breaks and drift logs no part of the file name or its folder (faked ffmpeg)', async () => {
  const ids = new Set();
  for (let i = 0; i < 2; i++) {
    const w = world(RANGE);
    const r = await w.prepareMedia(path.join(DIR, NAME));
    a.equal(r.preparation, 'remux'); a.equal(r.gaps.length, 2); a.equal(r.drift, 0.123);
    const log = w.lines.join('\n');
    a.equal(w.lines.length, 2, 'one line for the drift, one for the breaks');
    a.deepEqual(leaks(log), [], 'the log holds no piece of the name or folder:\n' + log);
    a.ok(!log.includes(DIR) && !log.includes(os.tmpdir()), 'no path');
    // what it does say: the import's id, how many breaks, where, how long, and the drift
    const id = /FLV import ([0-9a-f]{8}):/.exec(w.lines[0]);
    a.ok(id, 'names the import by a random id: ' + w.lines[0]);
    a.ok(w.lines.every((l) => l.includes(`FLV import ${id[1]}:`)), 'the same id on both lines of one import');
    ids.add(id[1]);
    a.match(log, /123 ms apart/);
    a.match(log, /2 break\(s\) \(imported as is\) — video 0:12\.500 \+67ms, audio 0:41\.250 \+58ms/);
  }
  a.equal(ids.size, 2, 'each import gets its own id');
});

test('a real FLV import with breaks and drift writes no part of the file name to stderr (synthetic recording)', async (t) => {
  const FF = require('../ffmpeg-path');
  if (!FF.available('ffmpeg') || !FF.available('ffprobe')) { t.skip('ffmpeg/ffprobe unavailable'); return; }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), '账号123456-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const { make, V, A } = require('./flv-fixtures');
  // small picture and sound drops, and the sound's clock creeping 120 ms behind the picture: imported as is, logged
  const { file } = make(dir, NAME, [V(9500, 67), V(22500, 34), A(31600, 58), ['creep', { from: 35000, to: 45000, by: 120 }]]);
  const P = require('../prepare-media');
  const lines = [], orig = { error: console.error, warn: console.warn, log: console.log, write: process.stderr.write };
  console.error = console.warn = console.log = (...x) => lines.push(x.join(' '));
  process.stderr.write = (chunk, ...rest) => { lines.push(String(chunk)); return true; };
  let r;
  try { r = await P.prepareMedia(file, { acceptReadable: true }).catch((e) => e); }
  finally { Object.assign(console, { error: orig.error, warn: orig.warn, log: orig.log }); process.stderr.write = orig.write; }
  a.ok(r && r.src, `imported (${r && r.code})`);
  a.ok(r.gaps && r.gaps.length >= 2, 'breaks were found');
  const log = lines.join('\n');
  a.match(log, /FLV import [0-9a-f]{8}: \d+ break\(s\)/, 'the breaks are logged:\n' + log);
  a.deepEqual(leaks(log), [], 'stderr holds no piece of the name or folder:\n' + log);
  a.ok(!log.includes(dir), 'no path');
  for (const f of fs.readdirSync(dir)) if (f.startsWith('compat-')) fs.rmSync(path.join(dir, f), { force: true });
});
