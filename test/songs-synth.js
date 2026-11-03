'use strict';
/* Synthetic material for the song tests (P2): no recording, no voice. A part is [kind, seconds]:
     song  — a held level (singing): a steady tone, swelling ±1.5 dB
     talk  — one second on, one second off (talk pauses every few words)
     quiet — the room between two numbers
     dips  — singing with eight short breaths, 3.5 s apart (what a merge across a short break looks like)
   track() gives the loudness every 0.5 s straight away; wav() renders the same plan as sound for ffmpeg. */
const STEP = 0.5;
function plan(parts) {
  let t = 0; const out = [];
  for (const [kind, len] of parts) { out.push({ kind, from: t, to: t + len }); t += len; }
  return out;
}
const songsOf = (p) => p.filter((x) => x.kind === 'song' || x.kind === 'dips').map((x) => [x.from, x.to]);
function levelAt(x, t, o) {
  const u = t - x.from;
  if (x.kind === 'song') return o.songDb + 1.5 * Math.sin(u / 7);
  if (x.kind === 'dips') { const k = Math.floor((u - 0.5) / 3.5), at = 0.5 + 3.5 * k; return k >= 0 && k < 8 && u >= at && u < at + 0.5 ? o.quietDb : o.songDb; }
  if (x.kind === 'talk') return Math.floor(u) % 2 === 0 ? o.talkDb : o.quietDb;
  return o.quietDb;
}
function track(parts, { songDb = -18, talkDb = -20, quietDb = -75 } = {}) {
  const p = plan(parts), end = p.length ? p[p.length - 1].to : 0, rms = [];
  for (let i = 0; i * STEP < end - 1e-9; i++) {
    const t = i * STEP, x = p.find((y) => t >= y.from && t < y.to);
    rms.push(Math.round(levelAt(x, t, { songDb, talkDb, quietDb }) * 100) / 100);
  }
  return { rms, songs: p.filter((x) => x.kind === 'song').map((x) => [x.from, x.to]), all: songsOf(p) };
}
/** The same plan as 16-bit mono sound: a sung tone with vibrato, talk as bursts of a buzzier tone, a faint hiss between. */
function wav(parts, rate = 16000, o = { songDb: -18, talkDb: -20, quietDb: -75 }) {
  const p = plan(parts), end = p.length ? p[p.length - 1].to : 0, n = Math.round(end * rate), data = Buffer.alloc(n * 2);
  let seed = 12345; const noise = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296) * 2 - 1;
  let k = 0, phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / rate; while (k < p.length - 1 && t >= p[k].to) k++;
    const x = p[k], db = levelAt(x, t, o), amp = Math.pow(10, db / 20) * Math.SQRT2;   // RMS of a sine = amp/√2
    let v;
    if (db <= o.quietDb + 1e-9) v = noise() * Math.pow(10, o.quietDb / 20) * Math.sqrt(3);
    else if (x.kind === 'talk') { phase += 2 * Math.PI * 180 / rate; v = amp * (0.8 * Math.sin(phase) + 0.6 * Math.sin(2 * phase)) / 1; v *= 1 / Math.hypot(0.8, 0.6); }
    else { phase += 2 * Math.PI * (330 + 6 * Math.sin(2 * Math.PI * 5 * t)) / rate; v = amp * Math.sin(phase); }
    data.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(v * 32767))), i * 2);
  }
  const h = Buffer.alloc(44); h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8); h.write('fmt ', 12); h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}
module.exports = { track, wav, STEP };
