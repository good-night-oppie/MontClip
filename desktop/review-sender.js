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
         (b) it is the team's own agent on the dev side and the owner set MONTCLIP_REVIEW_AGENT_SEND=1 on this process (no click, no box:
             owner's decision, #341 6882174429).
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
  const agentSend = () => env.MONTCLIP_REVIEW_AGENT_SEND === "1";

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
    /** The streamer's click let reviewId go: its `requests` requests may go in the next 15 minutes. */
    permit(reviewId, requests) { permits.set(reviewId, { left: requests, exp: now() + 15 * 60 * 1000 }); },
    revoke(reviewId) { permits.delete(reviewId); },
    cancel(reviewId) { permits.delete(reviewId); const c = inFlight.get(reviewId); if (c) c.abort(); },
    /** One body from the engine server → {ok, receipt} | {ok:false, reason}. */
    async send({ reviewId, agent, body }) {
      if (!sw.get().on) return { ok: false, reason: "REVIEW_SEND_OFF" };
      if (typeof reviewId !== "string" || !reviewId) return { ok: false, reason: "NOT_CONFIRMED" };
      if (agent === true) { if (!agentSend()) return { ok: false, reason: "AGENT_SEND_OFF" }; }
      else {
        const p = permits.get(reviewId);
        if (!p || p.left <= 0 || now() > p.exp) return { ok: false, reason: "NOT_CONFIRMED" };
        p.left--;
      }
      const buf = Buffer.isBuffer(body) ? body : body instanceof Uint8Array ? Buffer.from(body.buffer, body.byteOffset, body.byteLength) : null;
      if (!buf) return { ok: false, reason: "FAILED" };
      const k = key.open();
      if (!k) return { ok: false, reason: "NO_KEY" };
      const ctrl = new AbortController(); inFlight.set(reviewId, ctrl);
      try {
        return await OR.post({ body: buf, key: k, request: request || (standin ? http.request : https.request), endpoint: standin, signal: ctrl.signal });
      } finally { inFlight.delete(reviewId); }
    },
  };
}

/** The unblock box (wording to be finalized by JJ). Nothing is shown before a send (owner's decision 2026-11-15, #321 6888246693). */
const BOX = Object.freeze({ cancel: "取消", unblock: "重新允许", unblockTitle: "审片",
  unblockMessage: "发往：" + OR.HOST + "\n上次的回执不是 Google AI Studio 或不是指定模型，这个工程的发送已停下。要重新允许发送吗？" });

module.exports = { createReviewSender, BOX, KEY_FILE, SWITCH_FILE };
