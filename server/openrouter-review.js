"use strict";
/* #321 — where a review sample goes now: OpenRouter (openrouter.ai), model google/gemini-4-carbon, handed only to Google AI Studio
   (ADR docs/decisions/2026-11-14-review-openrouter-outbound.md, QQ's rulings). This file builds the one request, checks its size,
   and reads the receipt. It has no key and makes no connection by itself: the desktop main process holds the key and calls post()
   (desktop/review-sender.js); the engine server only prepares the body.

   Fixed here, not settable from outside:
     - the host and path (HOST, PATH) and the model (MODEL);
     - provider: { order: ["google-ai-studio"], allow_fallbacks: false, data_collection: "deny" } — OpenRouter's provider-routing
       options, https://openrouter.ai/docs/features/provider-routing ("order", "allow_fallbacks", "data_collection": "deny"); the
       provider slug google-ai-studio is the one that page lists for Google AI Studio;
     - one request body at most MAX_BODY_BYTES (16 MiB, base64 included), refused before anything is sent;
     - no retry, a 360 s time limit, TLS checked as Node checks it (no agent, no CA, no rejectUnauthorized here).
   The receipt says who answered: a provider other than Google AI Studio, no provider, or another model is a DESTINATION_MISMATCH
   (the caller stops that project's later sends). */
const crypto = require("node:crypto");

const HOST = "openrouter.ai";
const PATH = "/api/v1/chat/completions";
const MODEL = "google/gemini-4-carbon";
const PROVIDER = Object.freeze({ order: Object.freeze(["google-ai-studio"]), allow_fallbacks: false, data_collection: "deny" });
const EXPECTED_PROVIDER = "Google AI Studio";
const MAX_BODY_BYTES = 16 * 1024 * 1024;
const TIMEOUT_MS = 360_000;
const MAX_TOKENS = 4096;
const AUDIO = Object.freeze({ sampleRate: 48000, channels: 2, format: "wav", codec: "pcm_s16le" });
const REASONS = Object.freeze(["TIMEOUT", "AUTH_FAILED", "RATE_LIMITED", "FAILED", "CANCELLED", "DESTINATION_MISMATCH", "BAD_OUTPUT", "BODY_TOO_LARGE", "NO_KEY", "BODY_NOT_ALLOWED", "HASH_MISMATCH"]);

/** The destination as the record and the status keep it (nothing is shown before a send: owner, #321 6888246693). One object for all of them. */
const DESTINATION_INFO = Object.freeze({ service: "OpenRouter", host: HOST, model: MODEL, provider: EXPECTED_PROVIDER,
  note: "已要求对方只交给 Google AI Studio、不收集数据，是否遵守无法核实" });

/** → the request as an object. video: base64 of an mp4 WITHOUT sound; audio: base64 of a 48 kHz stereo WAV, or null (picture only). */
function buildBody({ prompt, videoB64, audioB64 = null }) {
  if (typeof prompt !== "string" || !prompt) throw Object.assign(new Error("no prompt"), { code: "BAD_REQUEST" });
  if (typeof videoB64 !== "string" || !videoB64) throw Object.assign(new Error("no video"), { code: "BAD_REQUEST" });
  const content = [{ type: "text", text: prompt }, { type: "video_url", video_url: { url: "data:video/mp4;base64," + videoB64 } }];
  if (audioB64) content.push({ type: "input_audio", input_audio: { data: audioB64, format: AUDIO.format } });
  return { model: MODEL, stream: false, max_tokens: MAX_TOKENS, temperature: 0, provider: { order: [...PROVIDER.order], allow_fallbacks: false, data_collection: "deny" },
    messages: [{ role: "user", content }] };
}
/** → the bytes that go out, or BODY_TOO_LARGE before anything is sent. */
function serialize(body) {
  const buf = Buffer.from(JSON.stringify(body), "utf8");
  if (buf.length > MAX_BODY_BYTES) throw Object.assign(new Error("the request would be over 16 MB; choose a shorter stretch"), { code: "BODY_TOO_LARGE", bytes: buf.length });
  return buf;
}
/** A worst-case size before rendering (prepare): base64 of the largest compact video plus the WAV of `seconds` plus room for the text. */
function estimateBytes({ seconds, videoBytes, audio = true, textBytes = 64 * 1024 }) {
  const b64 = (n) => Math.ceil(n / 3) * 4;
  const wav = audio ? 44 + Math.ceil(seconds * AUDIO.sampleRate) * AUDIO.channels * 2 : 0;
  return b64(videoBytes) + b64(wav) + textBytes;
}
const hashOf = (...parts) => { const h = crypto.createHash("sha256"); for (const p of parts) h.update(Buffer.isBuffer(p) ? p : Buffer.from(String(p), "utf8")).update("\u0000"); return h.digest("hex"); };

/** The receipt (OpenRouter's JSON answer) → {ok:true, text, provider, model, usage} or {ok:false, reason}. Pure. */
function readReceipt(json) {
  if (!json || typeof json !== "object") return { ok: false, reason: "BAD_OUTPUT" };
  const provider = typeof json.provider === "string" ? json.provider : null;
  const model = typeof json.model === "string" ? json.model : null;
  const usage = json.usage && typeof json.usage === "object" ? json.usage : null;
  if (provider !== EXPECTED_PROVIDER || !model || !(model === MODEL || model.startsWith(MODEL + "-") || model.startsWith(MODEL + ":")))
    return { ok: false, reason: "DESTINATION_MISMATCH", provider, model, usage };
  const msg = Array.isArray(json.choices) && json.choices[0] && json.choices[0].message;
  const text = msg && typeof msg.content === "string" ? msg.content : null;
  if (!text) return { ok: false, reason: "BAD_OUTPUT", provider, model, usage };
  return { ok: true, text: text.slice(0, 60_000), provider, model, usage };
}
/** How many audio tokens the receipt counted; null when it does not say (which counts as not heard). */
function audioTokens(usage) {
  const d = usage && usage.prompt_tokens_details;
  const n = d && Number(d.audio_tokens);
  return Number.isFinite(n) ? n : null;
}

/** One POST. Never retried. request: https.request (tests pass a stand-in). endpoint: only a test stand-in may set it, and only an
 *  http://127.0.0.1:<port> one (the desktop decides whether that is allowed; see desktop/review-sender.js). → {ok, receipt} | {ok:false, reason}. */
function post({ body, key, request, endpoint = null, timeoutMs = TIMEOUT_MS, signal = null }) {
  return new Promise((resolve) => {
    if (!key || typeof key !== "string") { resolve({ ok: false, reason: "NO_KEY" }); return; }
    if (!Buffer.isBuffer(body) || body.length > MAX_BODY_BYTES) { resolve({ ok: false, reason: "BODY_TOO_LARGE" }); return; }
    let done = false, req = null, timer = null;
    const finish = (r) => { if (done) return; done = true; clearTimeout(timer); if (signal) signal.removeEventListener?.("abort", onAbort); resolve(r); };
    const onAbort = () => { try { req && req.destroy(); } catch { } finish({ ok: false, reason: "CANCELLED" }); };
    if (signal && signal.aborted) { finish({ ok: false, reason: "CANCELLED" }); return; }
    if (signal) signal.addEventListener?.("abort", onAbort);
    const target = endpoint ? new URL(endpoint) : null;
    const opts = target
      ? { protocol: "http:", hostname: "127.0.0.1", port: Number(target.port), path: PATH, method: "POST" }
      : { protocol: "https:", hostname: HOST, port: 443, path: PATH, method: "POST" };
    opts.headers = { "Content-Type": "application/json", "Content-Length": body.length, Authorization: "Bearer " + key };
    try {
      req = request(opts, (res) => {
        const chunks = []; let size = 0;
        res.on("data", (c) => { size += c.length; if (size <= 8 << 20) chunks.push(c); });
        res.on("end", () => {
          const status = res.statusCode || 0;
          if (status === 401 || status === 403) return finish({ ok: false, reason: "AUTH_FAILED" });
          if (status === 429) return finish({ ok: false, reason: "RATE_LIMITED" });
          if (status !== 200) return finish({ ok: false, reason: "FAILED" });
          let json = null; try { json = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { return finish({ ok: false, reason: "BAD_OUTPUT" }); }
          const r = readReceipt(json);
          finish(r.ok ? { ok: true, receipt: r } : { ok: false, reason: r.reason, provider: r.provider || null, model: r.model || null });
        });
        res.on("error", () => finish({ ok: false, reason: "FAILED" }));
      });
    } catch { finish({ ok: false, reason: "FAILED" }); return; }
    timer = setTimeout(() => { try { req.destroy(); } catch { } finish({ ok: false, reason: "TIMEOUT" }); }, timeoutMs);
    req.on("error", () => finish({ ok: false, reason: "FAILED" }));
    req.end(body);
  });
}

module.exports = { HOST, PATH, MODEL, PROVIDER, EXPECTED_PROVIDER, MAX_BODY_BYTES, TIMEOUT_MS, AUDIO, REASONS, DESTINATION_INFO,
  buildBody, serialize, estimateBytes, hashOf, readReceipt, audioTokens, post };
