/* Local signals of a media file, read on the server (P2 highlight cards; the first piece of P1's media index).
 *
 * loudness(file): the file's first audio stream, decoded once by ffmpeg as a stream (8 kHz mono 16-bit, never the
 * whole file in memory), one dBFS value per 0.5 s. Cached in analysis/signals/ by the file's name, size and
 * modification time, so a replaced file is read again. Two requests for the same file share one decode.
 * loudness(file, {track}) reads that audio stream instead (the media entry's audioTrack); stream 0 keeps its old key. */
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { spawn } = require("child_process");

const STEP = 0.5, RATE = 8000, PER = STEP * RATE, FLOOR = -90;

function createSignals({ dir, ffmpeg = require("./ffmpeg-path").path("ffmpeg") }) {
  const pending = new Map();
  const keyOf = (file, track = 0) => {
    const st = fs.statSync(file);
    return crypto.createHash("sha256").update(path.basename(file) + "\0" + st.size + "\0" + Math.round(st.mtimeMs) + (track > 0 ? "\0a" + track : ""))
      .digest("hex").slice(0, 32);
  };
  function decode(file, track) {
    return new Promise((resolve, reject) => {
      const values = [];
      let acc = 0, n = 0, carry = null;
      const proc = spawn(typeof ffmpeg === "function" ? ffmpeg() : ffmpeg, ["-v", "error", "-nostdin", "-i", file, "-vn", "-map", "0:a:" + track, "-ac", "1", "-ar", String(RATE), "-f", "s16le", "-"],
        { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
      let err = "";
      proc.stderr.on("data", (d) => { if (err.length < 4000) err += d; });
      proc.stdout.on("data", (chunk) => {
        if (carry) { chunk = Buffer.concat([carry, chunk]); carry = null; }
        const whole = chunk.length - (chunk.length % 2);
        for (let i = 0; i < whole; i += 2) {
          const x = chunk.readInt16LE(i) / 32768;
          acc += x * x;
          if (++n === PER) { values.push(Math.max(FLOOR, 10 * Math.log10(acc / n + 1e-12))); acc = 0; n = 0; }
        }
        if (whole < chunk.length) carry = chunk.subarray(whole);
      });
      proc.on("error", reject);
      proc.on("close", (code) => {
        if (code !== 0) return reject(Object.assign(new Error("ffmpeg could not read the sound: " + err.trim().split("\n").pop()), { code: "SIGNALS_FAILED" }));
        if (n) values.push(Math.max(FLOOR, 10 * Math.log10(acc / n + 1e-12)));
        resolve(values.map((v) => Math.round(v * 10) / 10));
      });
    });
  }
  async function loudness(file, { track = 0 } = {}) {
    const key = keyOf(file, track), out = path.join(dir, key + ".loudness.json");
    try { return JSON.parse(fs.readFileSync(out, "utf8")); } catch { /* not cached yet */ }
    if (pending.has(key)) return pending.get(key);
    const job = (async () => {
      const values = await decode(file, track);
      const doc = { v: 1, step: STEP, values, duration: Math.round(values.length * STEP * 1000) / 1000 };
      fs.mkdirSync(dir, { recursive: true });
      const tmp = out + "." + crypto.randomUUID() + ".tmp";
      fs.writeFileSync(tmp, JSON.stringify(doc), { flag: "wx" });
      fs.renameSync(tmp, out);
      return doc;
    })();
    pending.set(key, job);
    try { return await job; } finally { pending.delete(key); }
  }
  return { loudness, STEP };
}
module.exports = { createSignals, STEP };
