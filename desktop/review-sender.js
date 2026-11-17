"use strict";
/* #321 (ADR docs/decisions/2026-11-14-review-openrouter-outbound.md, QQ's rulings): the desktop main process is the only place a review
   sample leaves the computer from.
     - the key: the streamer's (or the team's) OpenRouter key, kept apart from the assistant's connection, sealed with Electron safeStorage
       (DPAPI on Windows); no encryption → it is not saved (KEY_STORE_UNAVAILABLE). It goes only into the Authorization header of the one
       request; never to the page, the server, a log or a record.
     - the switch: 「审片时把片段发到 openrouter.ai」, OFF by default, set only by the streamer in Settings (the page's IPC, boolean only).
     - the destination: fixed in server/openrouter-review.js (host, path, model, provider lock). A test stand-in (http://127.0.0.1:<port>)
       is honoured only in an unpackaged --montclip-smoke run with MONTCLIP_REVIEW_STANDIN set; a packaged app never reads it.
     - what may go: the engine server hands over one body at a time (review-send). It goes only when
         (a) the streamer clicked to check THIS check (reviewId) and this process let it go — a permit for its requests (nothing is shown
             before a send: owner's decision 2026-11-15, #321 6888246693), or
         (b) it is the team's own agent on the dev side (no click, no box: owner's decision, #341 6882174429). The owner's start-up
             switch for it, MONTCLIP_REVIEW_AGENT_SEND, is gone (owner 2026-11-16, PG #321 6921163328); the review-send switch, the
             body check, the key and the receipt check below still apply to it.
       Anything else is refused (NOT_CONFIRMED). No retry; TLS checked as Node does; one request per message. */
const fs = require("node:fs");
const path = require("node:path");
const https = require("node:https");
const http = require("node:http");
const OR = require("../server/openrouter-review");

const KEY_FILE = "review-openrouter-key-v1.json";
const SWITCH_FILE = "review-send-v1.json";

function createReviewSender({ root, safeStorage, env = process.env, isPackaged = true, smoke = false, request = null, now = () => Date.now() }) {
  const keyPath = path.join(root, KEY_FILE), switchPath = path.join(root, SWITCH_FILE);
  const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };
  const writeJson = (p, v) => { fs.mkdirSync(path.dirname(p), { recursive: true }); const tmp = p + "." + process.pid + ".tmp"; fs.writeFileSync(tmp, JSON.stringify(v)); fs.renameSync(tmp, p); };
  const permits = new Map();        // reviewId → {left, exp}
  const inFlight = new Map();       // reviewId → AbortController
  /* only an unpackaged smoke run may point at a local stand-in, and only at 127.0.0.1 */
  const standin = !isPackaged && smoke && /^http:\/\/127\.0\.0\.1:\d{2,5}$/.test(env.MONTCLIP_REVIEW_STANDIN || "") ? env.MONTCLIP_REVIEW_STANDIN : null;

  const key = {
    status() { const j = readJson(keyPath); return { ok: true, configured: !!(j && j.sealed) }; },
    set(value) {
      if (typeof value !== "string" || !/^[\x21-\x7e]{8,300}$/.test(value)) return { ok: false, code: "KEY_INVALID" };
      let backend = null; try { backend = safeStorage.getSelectedStorageBackend?.(); } catch { }
      if (!safeStorage.isEncryptionAvailable() || backend === "basic_text") return { ok: false, code: "KEY_STORE_UNAVAILABLE" };
      writeJson(keyPath, { v: 1, sealed: safeStorage.encryptString(value).toString("base64") });
      return { ok: true, configured: true };
    },
    clear() { try { fs.rmSync(keyPath, { force: true }); } catch { } return { ok: true, configured: false }; },
    /** only for the request; never returned to any caller */
    open() { const j = readJson(keyPath); if (!j || !j.sealed) return null; try { return safeStorage.decryptString(Buffer.from(j.sealed, "base64")); } catch { return null; } },
  };
  const sw = {
    get() { const j = readJson(switchPath); return { ok: true, on: !!(j && j.on === true) }; },
    set(on) { if (typeof on !== "boolean") return { ok: false, code: "SWITCH_INVALID" }; writeJson(switchPath, { v: 1, on }); if (!on) { permits.clear(); for (const c of inFlight.values()) c.abort(); } return { ok: true, on }; },
  };

  return {
    key, switch: sw, standin,
    /** The streamer's click let reviewId go: its `requests` requests may go in the next 15 minutes, and only the prepared check whose
     *  snapshot hash this process confirmed (its first request must hash to it; a second one must carry the same picture and sound). */
    permit(reviewId, requests, hash) { permits.set(reviewId, { left: requests, hash: typeof hash === "string" ? hash : null, files: null, exp: now() + 15 * 60 * 1000 }); },
    revoke(reviewId) { permits.delete(reviewId); },
    cancel(reviewId) { permits.delete(reviewId); const c = inFlight.get(reviewId); if (c) c.abort(); },
    /** One body from the engine server → {ok, receipt} | {ok:false, reason}. */
    async send({ reviewId, agent, body }) {
      if (!sw.get().on) return { ok: false, reason: "REVIEW_SEND_OFF" };
      if (typeof reviewId !== "string" || !reviewId) return { ok: false, reason: "NOT_CONFIRMED" };
      const buf = Buffer.isBuffer(body) ? body : body instanceof Uint8Array ? Buffer.from(body.buffer, body.byteOffset, body.byteLength) : null;
      if (!buf) return { ok: false, reason: "FAILED" };
      /* the body must be one this process would build itself (QQ, #347 review): otherwise nothing goes, whoever asked */
      const chk = checkBody(buf);
      if (!chk) return { ok: false, reason: "BODY_NOT_ALLOWED" };
      if (agent !== true) {
        const p = permits.get(reviewId);
        if (!p || p.left <= 0 || now() > p.exp) return { ok: false, reason: "NOT_CONFIRMED" };
        const files = chk.videoSha + "/" + (chk.audioSha || "-");
        /* the first request is the prepared check the streamer's click named (its snapshot hash); a later one (two_pass) the same picture and sound */
        if (p.files === null ? snapshotOf(chk) !== p.hash : files !== p.files) { permits.delete(reviewId); return { ok: false, reason: "HASH_MISMATCH" }; }
        p.files = files;
        p.left--;
      }
      const k = key.open();
      if (!k) return { ok: false, reason: "NO_KEY" };
      const ctrl = new AbortController(); inFlight.set(reviewId, ctrl);
      try {
        return await OR.post({ body: chk.body, key: k, request: request || (standin ? http.request : https.request), endpoint: standin, signal: ctrl.signal });
      } finally { inFlight.delete(reviewId); }
    },
  };
}

/** A request body → {body, prompt, videoSha, audioSha} when it is exactly what this process builds from its own constants (host, path,
 *  model, provider: server/openrouter-review.js) around a prompt, an mp4 and a WAV; else null. Its prompt, video and sound are taken out
 *  and the request is built again here: another model or provider, an extra field or anything else changed makes the bytes differ. */
function checkBody(buf) {
  let j; try { j = JSON.parse(buf.toString("utf8")); } catch { return null; }
  if (!j || typeof j !== "object" || j.model !== OR.MODEL) return null;
  const m = Array.isArray(j.messages) && j.messages.length === 1 ? j.messages[0] : null, c = m && Array.isArray(m.content) ? m.content : null;
  if (!c) return null;
  const text = c.find((x) => x && x.type === "text"), vid = c.find((x) => x && x.type === "video_url"), aud = c.find((x) => x && x.type === "input_audio");
  const pre = "data:video/mp4;base64,", url = vid && vid.video_url && vid.video_url.url;
  if (!text || typeof text.text !== "string" || typeof url !== "string" || !url.startsWith(pre)) return null;
  const parts = { prompt: text.text, videoB64: url.slice(pre.length), audioB64: aud && aud.input_audio && typeof aud.input_audio.data === "string" ? aud.input_audio.data : null };
  let again; try { again = OR.serialize(OR.buildBody(parts)); } catch { return null; }
  if (!again.equals(buf)) return null;
  return { body: again, prompt: parts.prompt, videoSha: OR.hashOf(Buffer.from(parts.videoB64, "base64")),
    audioSha: parts.audioB64 ? OR.hashOf(Buffer.from(parts.audioB64, "base64")) : null };
}
/** The snapshot hash of a checked body: the same as server/video-bridge.js snapshotHash (both files and the first request's text). */
const snapshotOf = (chk) => OR.hashOf("montclip-review-v2", chk.videoSha, chk.audioSha || "-", chk.prompt);

/** The unblock box (wording to be finalized by JJ). Nothing is shown before a send (owner's decision 2026-11-15, #321 6888246693). */
const BOX = Object.freeze({ cancel: "取消", unblock: "重新允许", unblockTitle: "审片",
  unblockMessage: "发往：" + OR.HOST + "\n上次的回执不是 Google AI Studio 或不是指定模型，这个工程的发送已停下。要重新允许发送吗？" });

/** #326: what the page may ask of the one-click check (montclip:review:check) — the stretch, the 「只发这 N 秒」 switch (JJ 6928950807 (5))
 *  and recheck; anything else is dropped. → the engine's prepare body, or null for a stretch that is not one. */
function checkRequest(value) {
  const v = value && typeof value === "object" ? value : {};
  const start = Number(v.start), end = Number(v.end);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start) return null;
  return { start, end, scope: v.scope === "window" ? "window" : "full", ...(v.recheck === true ? { recheck: true } : {}) };
}

module.exports = { createReviewSender, checkBody, checkRequest, snapshotOf, BOX, KEY_FILE, SWITCH_FILE };
