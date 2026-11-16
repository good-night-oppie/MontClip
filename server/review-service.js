"use strict";
/* #321 — the steps of one check of a stretch of the timeline: render a small sample, stage what would leave the machine (an mp4
   without sound and a 48 kHz stereo WAV, video-bridge.js), send it only on the streamer's click (a one-time token and the snapshot
   hash, checked again in the desktop main process; nothing is shown before a send: owner, #321 6888246693), keep the result apart
   from the project.
   Where it goes is fixed (OpenRouter, google/gemini-4-carbon, only Google AI Studio: openrouter-review.js). This file has no key and
   opens no connection: `sender` is the desktop main process (server.js passes it), and it is asked only after the ledger counted the
   bytes. A receipt from anyone else stops this project's later sends until the streamer confirms again (DESTINATION_MISMATCH).

   Nothing here changes the project: not its revision, IN / OUT, undo, nor project.json. A project's own text only goes along
   when she chose "with the project's text" (scope:"full"). */
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const httpError = (code, message, extra = {}) => Object.assign(new Error(message), { status: code, ...extra });
const num = (v) => (typeof v === "number" || (typeof v === "string" && v.trim() !== "")) && Number.isFinite(Number(v)) ? Number(v) : null;

const OR = require("./openrouter-review");
const MAX_SPAN_S = 30;     // one check looks at most this much (the compact copy has to stay small)
const MAX_LEAD_S = 10;
const DEFAULT_LEAD_S = 3;
const TOKEN_TTL_MS = 10 * 60 * 1000;
const RENDER_TIMEOUT_MS = 10 * 60 * 1000;
const CONTEXT_MAX = 6000;
/* #321 (PG 6922461279): the budget. Nothing an answer says about cost is trusted, so every request is counted at a conservative estimate: one
   request carries at most ~40 s of compact video, its WAV and the fixed prompt (under 16 MB), well under $0.10 at Gemini's published prices, so $1 a request leaves more than
   10x room. It is an estimate, never checked against a bill. A check is at most 2 requests (two_pass) = $2 = the per-check limit; a day is
   at most $10 = 10 requests, every project and both paths (agent and streamer) together, counted before anything leaves. */
const BUDGET = Object.freeze({ usdPerRequest: 1, usdPerCheck: 2, usdPerDay: 10 });
const dailyLimitText = (spent) => `今天的检查额度用完了：每天最多 $${BUDGET.usdPerDay}（每次发送按 $${BUDGET.usdPerRequest} 保守估算，今天已用 $${spent}）。明天再检查；导出照常可以写 bypassReason 继续。`;

/** What the rendered sample shows, known from the project itself (C7): the times the project's own text clips start and end inside
 *  [from, to] (a burned-in subtitle changes there) and their words, in the sample's own seconds. The model's claims about the picture
 *  are checked against this, not against what it says. */
function framesOf(doc, from, to) {
  const clips = Array.isArray(doc && doc.clips) ? doc.clips : [];
  const changes = new Set(), text = [];
  for (const c of clips) {
    if (!c || !c.props || typeof c.props.text !== "string" || !c.props.text) continue;
    const s = Number(c.start), e = s + Number(c.duration);
    if (!Number.isFinite(s) || !Number.isFinite(e) || e <= from || s >= to) continue;
    for (const x of [s, e]) if (x > from && x < to) changes.add(+(x - from).toFixed(2));
    const words = c.props.text.replace(/\s+/g, " ").slice(0, 200);
    text.push({ t: +(Math.max(s, from) - from).toFixed(2), text: words });
    if (e - s > 1) text.push({ t: +((Math.max(s, from) + Math.min(e, to)) / 2 - from).toFixed(2), text: words });
  }
  return { subtitleChanges: [...changes].sort((a, b) => a - b), text };
}

/** The project's own words and cut points inside [from, to], as one plain text (reference for the model, never an instruction). */
function skeleton(doc, from, to) {
  const lines = [];
  const clips = Array.isArray(doc && doc.clips) ? doc.clips : [];
  const inside = (c) => { const s = Number(c.start), d = Number(c.duration); return Number.isFinite(s) && Number.isFinite(d) && s < to && s + d > from; };
  const words = clips.filter((c) => c && c.props && typeof c.props.text === "string" && c.props.text && inside(c)).sort((a, b) => a.start - b.start);
  for (const c of words) lines.push(`${(+c.start).toFixed(2)}-${(+c.start + +c.duration).toFixed(2)}s text: ${c.props.text.replace(/\s+/g, " ").slice(0, 200)}`);
  /* a composition's own text clips, placed by the composition clip's start (trim and speed are not followed: the words are reference, not timing) */
  for (const c of clips) {
    if (!c || c.kind !== "comp" || !inside(c)) continue;
    const comp = (Array.isArray(doc.comps) ? doc.comps : []).find((x) => x && x.id === (c.compId || c.comp || c.compositionId));
    for (const sub of (comp && Array.isArray(comp.clips) ? comp.clips : [])) {
      if (!sub || !sub.props || typeof sub.props.text !== "string" || !sub.props.text) continue;
      const a = +c.start + (+sub.start || 0), b = a + (+sub.duration || 0);
      if (a < to && b > from) lines.push(`${a.toFixed(2)}-${b.toFixed(2)}s text (in a composition): ${sub.props.text.replace(/\s+/g, " ").slice(0, 200)}`);
    }
  }
  const cuts = clips.filter((c) => c && c.kind !== "text" && Number.isFinite(Number(c.start)) && c.start >= from && c.start <= to).map((c) => +c.start).sort((a, b) => a - b);
  if (cuts.length) lines.push("clip starts (cut points): " + [...new Set(cuts.map((t) => t.toFixed(2)))].join(", ") + " s");
  return lines.join("\n").slice(0, CONTEXT_MAX);
}

function createReviewService({ store, bridge, readProject, activeProject, requestSample, getJob, cancelJob, sampleFile, ffmpeg, ffprobe, env = process.env,
  sender = null, cancelSend = () => { }, sendSwitch = () => false, sendCapBytes = 104857600, now = () => Date.now(), pollMs = 400,
  tmpRoot = undefined, onChange = () => { } }) {
  const reviews = new Map();           // reviewId → in-flight state (finished ones live in the store)
  /* a check that was shown but never confirmed does not hold the project forever: after its token ran out it is expired and its sample removed */
  const sweep = () => { for (const r of reviews.values()) if (r.state === "ready" && now() > r.tokenExp) { r.state = "expired"; r.reason = "EXPIRED"; r.token = null; dropSample(r); onChange(r); } };
  const busy = (project) => { sweep(); return [...reviews.values()].find((r) => r.project === project && (r.state === "rendering" || r.state === "ready" || r.state === "sending")); };
  /* ONE decision about where it goes: what is shown, what is checked again at the moment of sending, and what the record says */
  const destination = () => ({ ...bridge.destination() });
  const sameDestination = (a, b) => a && b && a.service === b.service && a.host === b.host;
  const what = (r) => [r.audio ? "a short video clip of this stretch (no sound in the video) and its sound as a separate WAV (48 kHz, stereo)" : "a short video clip of this stretch, picture only (no sound sent)",
    r.scope === "full" ? "plus the subtitles and cut points that touch it (a subtitle goes whole, so it may include text from before or after the clip)" : "No subtitle text, edit points, or good/bad examples are attached; subtitles already burned into the picture still go out with the video.",
    r.lead > 0 ? `including a lead-in of ${r.lead} s (${(r.range.start - r.lead).toFixed(2)}-${r.range.start.toFixed(2)} s) before the part you chose` : "",
    r.scope === "full" && r.taste ? `plus your ${r.taste} saved taste note${r.taste === 1 ? "" : "s"} (what you approved or rejected before)` : "",
    r.mode === "two_pass" ? "sent in 2 requests: a blind first look, then the full check" : ""].filter(Boolean).join("; ");
  const view = (r) => ({
    reviewId: r.id, state: r.state, project: r.project, range: r.range, lead: r.lead, scope: r.scope, mode: r.mode, revision: r.revision, progress: r.progress ?? null,
    willSend: r.state === "ready" ? { what: what(r), to: r.destination, requests: r.mode === "two_pass" ? 2 : 1, tasteNotes: r.taste,
      videoBytes: r.staged ? r.staged.video.bytes : 0, audioBytes: r.staged && r.staged.audio ? r.staged.audio.bytes : 0, audio: !!(r.staged && r.staged.audio), hash: r.hash || null,
      /* the words themselves, as they will go: the project's subtitles and cut points (scope full) and the taste notes */
      projectText: r.ctx || "", /* the fixed standards and questions: the very strings the request is built from (video-bridge.js), shown so the page can list them */
      standards: { rules: [...bridge.RUBRIC], questions: [...bridge.QUESTIONS], ask: bridge.QUESTIONS_ASK, carriedBy: r.mode === "two_pass" ? "second" : "only" },
      tasteLost: r.tasteLost || 0, tasteNotice: r.taste || r.tasteLost ? "文字只在本次运行保留，重启后需重新填写" : "", notes: (r.tasteSnap || []).map((t) => ({ kind: t.kind, aspect: t.aspect, text: t.text })),
      leadIn: r.lead > 0 ? { from: +(r.range.start - r.lead).toFixed(2), to: r.range.start, seconds: r.lead } : null,
      seconds: +(r.range.end - r.range.start + r.lead).toFixed(2), tokenExpiresAt: new Date(r.tokenExp).toISOString() } : undefined,
    previewSrc: r.file ? "/previews/" + encodeURIComponent(path.basename(r.file)) : undefined, result: r.result || undefined, reason: r.reason || undefined,
  });

  async function waitRender(r) {
    const t0 = now();
    while (r.state === "rendering") {
      if (now() - t0 > RENDER_TIMEOUT_MS) { r.state = "failed"; r.reason = "RENDER_TIMEOUT"; try { cancelJob(r.job); } catch { } break; }
      let j = null; try { j = getJob(r.job); } catch { }
      if (!j) { r.state = "failed"; r.reason = "RENDER_LOST"; break; }
      r.progress = j.progress ?? r.progress;
      if (j.status === "done") {
        const file = j.src ? sampleFile(j.src) : null;
        if (!file) { r.state = "failed"; r.reason = "RENDER_FAILED"; break; }
        /* the sample was rendered from the project as it is now: the words, the notes and the key are taken from that same moment, shown as they are,
           and a later edit makes the picture stale (refused at send) */
        { const doc = readProject() || {}; r.key = store.contentKey(doc); r.revision = doc.revision ?? null;
          r.ctx = r.scope === "full" ? skeleton(doc, Math.max(0, r.range.start - r.lead), r.range.end) : ""; r.tasteSnap = r.scope === "full" ? store.tasteSendable(r.project) : []; r.taste = r.tasteSnap.length; r.tasteLost = r.scope === "full" ? store.tasteList(r.project).filter((x) => !x.textAvailable).length : 0; }
        r.file = file;
        /* what will go is made now, shown with its sizes, and named by its hash: the page and the main process's box confirm THIS, and a send
           whose hash is not this one is refused */
        try {
          r.staged = await bridge.stage({ ffmpeg: ffmpeg(), ffprobe: ffprobe(), sampleFile: file, withAudio: r.audio, ...(tmpRoot ? { tmpRoot } : {}) });
          r.audio = !!r.staged.audio;
          r.firstPrompt = r.mode === "two_pass" ? bridge.buildBlindPrompt({ durationSec: r.staged.durationSec, leadSec: r.lead, withAudio: r.audio })
            : bridge.buildPrompt({ durationSec: r.staged.durationSec, leadSec: r.lead, contextText: r.ctx, digests: [], taste: r.tasteSnap, observation: "", withAudio: r.audio });
          r.hash = bridge.snapshotHash(r.staged, r.firstPrompt);
          r.bodyBytes = bridge.bodyFor(r.staged, r.firstPrompt).length;   // over 16 MB is refused here, before anything could go
        } catch (e) { r.state = "failed"; r.reason = e && e.code === "BODY_TOO_LARGE" ? "BODY_TOO_LARGE" : e && e.code === "LOCK_FAILED" ? "LOCK_FAILED" : "BAD_SAMPLE"; dropSample(r); break; }
        if (r.cancelled) { r.state = "cancelled"; r.reason = "CANCELLED"; dropSample(r); break; }
        r.state = "ready"; r.token = crypto.randomBytes(24).toString("hex"); r.tokenExp = now() + TOKEN_TTL_MS; r.progress = 1; break;
      }
      if (j.status === "failed" || j.status === "cancelled" || j.status === "error") { r.state = r.cancelled ? "cancelled" : "failed"; r.reason = r.cancelled ? "CANCELLED" : "RENDER_FAILED"; break; }
      await new Promise((res) => setTimeout(res, pollMs));
    }
    onChange(r);
    if (r.state === "ready" && r.autoSend) { try { await doSend(r); } catch { } }
  }

  /** The rendered sample is only there for this check: removed once it was sent or the check ended without it. */
  function dropSample(r) {
    if (r.file) { try { fs.rmSync(r.file, { force: true }); } catch { } }
    if (r.staged && r.staged.dir) { const d = r.staged.dir; r.staged = null; bridge.rmForceAsync(d).catch(() => { }); }
  }

  async function doSend(r) {
    if (r.state !== "ready") throw httpError(409, "that check is not waiting to be sent", { code: "NOT_READY" });
    const fail = (code, status, message) => { r.state = "failed"; r.reason = code; r.token = null; dropSample(r); onChange(r); return httpError(status, message, { code }); };
    if (!sendSwitch()) throw fail("REVIEW_SEND_OFF", 409, "sending clips for review is switched off in settings");
    if (activeProject() !== r.project) throw fail("PROJECT_CHANGED", 409, "another project is open now; prepare again");
    if (store.contentKey(readProject() || {}) !== r.key) throw fail("PROJECT_EDITED", 409, "the project was edited after this sample was made, so it no longer matches; prepare again");
    /* a ledger that cannot be read: nothing is sent (it would go out with no record and no count) */
    let sentSoFar, blocked;
    try { sentSoFar = store.sentTotal(r.project); blocked = store.blocked(r.project); } catch (e) { r.state = "failed"; r.reason = "LEDGER_UNREADABLE"; r.token = null; dropSample(r); onChange(r); throw e; }
    if (blocked) throw fail("DESTINATION_BLOCKED", 409, "an earlier answer for this project came from somewhere else than Google AI Studio; sending is stopped until the streamer confirms again");
    if (sentSoFar + (r.mode === "two_pass" ? 2 : 1) * (r.bodyBytes || OR.MAX_BODY_BYTES) > sendCapBytes) throw fail("SEND_LIMIT", 409, "this project has reached its limit for what is sent out");
    /* kept (PG #321 6921163328, item 4): where it goes is checked again at the moment of sending; not confirmed, or not the one shown → nothing goes */
    if (destination().confirmed !== true || !sameDestination(r.destination, destination())) throw fail("DESTINATION_CHANGED", 409, "where this goes changed since it was shown; prepare again");
    if (typeof sender !== "function") throw fail("NO_SENDER", 409, "only the desktop app can send a check");
    /* the files on disk are still the ones shown (a changed file changes the hash) */
    try {
      const now2 = { video: { sha256: OR.hashOf(fs.readFileSync(r.staged.video.file)) }, audio: r.staged.audio ? { sha256: OR.hashOf(fs.readFileSync(r.staged.audio.file)) } : null };
      if (bridge.snapshotHash(now2, r.firstPrompt) !== r.hash) throw new Error("changed");
    } catch { throw fail("SAMPLE_CHANGED", 409, "what would be sent changed after it was shown; prepare again"); }
    /* #321 budget (PG 6922461279), at the moment of sending: still within today's $10, and counted BEFORE anything goes; a count that
       cannot be read or written means nothing goes out */
    { const requests = r.mode === "two_pass" ? 2 : 1, usd = requests * BUDGET.usdPerRequest;
      let spent; try { spent = store.spentToday(); } catch (e) { throw fail(e.code || "LEDGER_UNREADABLE", e.status || 500, e.message); }
      if (spent.usd + usd > BUDGET.usdPerDay) { const err = fail("DAILY_LIMIT", 409, dailyLimitText(spent.usd)); err.budget = { ...BUDGET, spentToday: spent.usd }; throw err; }
      try { store.reserveSpend({ requests, usd }); } catch (e) { throw fail(e.code || "LEDGER_UNWRITABLE", e.status || 500, e.message); } }
    r.state = "sending"; r.token = null; onChange(r);
    let res;
    const from = r.range.start - r.lead;
    /* ledger first (#339): the bytes are counted before each request leaves; a ledger that cannot be read stops it */
    const beforeSend = (bytes) => {
      const total = store.sentTotal(r.project);
      if (total + bytes > sendCapBytes) throw httpError(409, "send limit", { code: "SEND_LIMIT" });
      store.countSent(r.project, bytes);
    };
    try {
      res = await bridge.checkSample({ staged: r.staged, offset: from, leadSec: r.lead, rangeStart: r.range.start, contextText: r.ctx, digests: [], taste: r.tasteSnap, mode: r.mode,
        frames: r.frames, send: (body, { kind }) => sender(body, { reviewId: r.id, kind, agent: r.source === "agent" }), beforeSend, isCancelled: () => r.cancelled });
    } catch (e) { res = { status: "no_result", reason: "FAILED", findings: [], summary: "", windowDigest: "", dimensions: null, mode: r.mode, observation: "", states: [], receipts: [], sentBytes: 0 }; }
    dropSample(r);
    if (res.reason === "DESTINATION_MISMATCH") { try { store.block(r.project, { reason: "DESTINATION_MISMATCH" }); } catch { } }
    if (r.cancelled) res = { ...res, status: "no_result", reason: "CANCELLED", findings: [], summary: "", windowDigest: "", dimensions: null, observation: "", states: [] };
    let rec;
    try { rec = store.add(r.project, {
      reviewId: r.id, status: res.status, reason: res.reason || null, range: r.range, lead: r.lead, revision: r.revision, contentKey: r.key, scope: r.scope,
      source: r.source, at: new Date(now()).toISOString(), findings: res.findings, summary: res.summary, windowDigest: res.windowDigest,
      dimensions: res.dimensions || null, mode: r.mode, requests: r.mode === "two_pass" ? 2 : 1, observation: res.observation || "", tasteNotes: r.taste, audio: r.audio === true,
      destination: r.destination, sentBytes: res.sentBytes || 0, passes: res.passes || [], states: res.states || [], reviewed: res.reviewed || null,
      audioVerified: res.audioVerified === true, receipts: res.receipts || [],
    }); } catch (e) {
      /* the clip may already have gone out; the check must not stay "sending" and block the project: it is failed, with a fixed code */
      r.state = "failed"; r.reason = "STORE_FAILED"; onChange(r);
      throw httpError(500, "the check ran but its record could not be saved", { code: "STORE_FAILED" });
    }
    r.result = rec; r.state = r.cancelled ? "cancelled" : "done"; r.reason = res.reason || null; onChange(r);
    return rec;
  }

  return {
    skeleton,
    /** Renders the sample. For a person at the editor this is all that happens: she sees what would be sent and clicks. */
    prepare({ start, end, lead, scope = "window", mode = "single", audio = true, where, agent = false, autoSend = false, recheck = false }) {
      sweep();
      const s = num(start), e = num(end);
      if (s == null || e == null || s < 0 || e <= s) throw httpError(400, "start and end are seconds with 0 <= start < end", { code: "BAD_RANGE" });
      if (e - s > MAX_SPAN_S) throw httpError(400, `one check looks at most ${MAX_SPAN_S} seconds; pass a shorter stretch`, { code: "TOO_LONG" });
      const l = lead == null ? DEFAULT_LEAD_S : num(lead);
      if (l == null || l < 0 || l > MAX_LEAD_S) throw httpError(400, `lead is 0 to ${MAX_LEAD_S} seconds`, { code: "BAD_LEAD" });
      if (scope !== "window" && scope !== "full") throw httpError(400, 'scope is "window" or "full"', { code: "BAD_SCOPE" });
      if (mode !== "single" && mode !== "two_pass") throw httpError(400, 'mode is "single" or "two_pass"', { code: "BAD_MODE" });
      if (typeof audio !== "boolean") throw httpError(400, "audio is true (picture and sound) or false (picture only)", { code: "BAD_AUDIO" });
      if (autoSend && !agent) throw httpError(403, "only a person's click at the editor sends a sample", { code: "CLICK_REQUIRED" });
      /* the streamer's own switch, kept by the desktop main process; off by default, and nothing is rendered while it is off */
      if (!sendSwitch()) throw httpError(409, "sending clips for review is switched off in settings", { code: "REVIEW_SEND_OFF" });
      /* an agent's send:true needs no switch any more: the owner's word (2026-11-16, PG #321 6921163328) removed MONTCLIP_REVIEW_AGENT_SEND.
         Every check below, and every check doSend makes, still applies to it. */
      const project = activeProject();
      /* #321 (PG 6922461279): the same stretch of the same content, asked the same way, that already has a result is not sent again: the result is
         used. Only the streamer's own 重新检查 (recheck, from the page; an agent's recheck counts for nothing) sends it again. */
      if (!(recheck === true && !agent)) {
        const doc0 = readProject() || {}, from0 = Math.max(0, s - l);
        const prev = store.findResult(project, { key: store.contentKey(doc0), start: s, end: e, lead: +(s - from0).toFixed(3), scope, mode, audio });
        if (prev) return { reviewId: prev.reviewId, state: "done", reused: true, reason: "ALREADY_CHECKED", project, range: prev.range, result: prev,
          note: "这一段这份内容已经检查过，用的是上次的结果，没有再发送；要再发一次，请主播在页面上点「重新检查」。" };
      }
      if (busy(project)) throw httpError(409, "another check of this project is still running; cancel it or wait", { code: "BUSY", busy: view(busy(project)) });
      /* fail closed: the address is fixed in server/openrouter-review.js and confirmed by the owner's authorisation (video-bridge.js destination) */
      if (destination().confirmed !== true) throw httpError(409, "where this would be sent has not been confirmed, so nothing is prepared or sent", { code: "DESTINATION_UNVERIFIED", destination: destination() });
      if (typeof sender !== "function") throw httpError(409, "only the desktop app can send a check", { code: "NO_SENDER" });
      if (store.blocked(project)) throw httpError(409, "an earlier answer for this project came from somewhere else than Google AI Studio; sending is stopped until the streamer confirms again", { code: "DESTINATION_BLOCKED" });
      /* a request over 16 MB is refused here, before anything is rendered: the largest compact video plus the WAV of this stretch */
      if (OR.estimateBytes({ seconds: e - s + l, videoBytes: bridge.MAX_SAMPLE_BYTES, audio }) > OR.MAX_BODY_BYTES) throw httpError(400, "this stretch would make a request over 16 MB; choose a shorter one", { code: "BODY_TOO_LARGE" });
      /* #321 budget: refused before anything is rendered; checked again, and counted, at the moment of sending */
      { const usd = (mode === "two_pass" ? 2 : 1) * BUDGET.usdPerRequest;
        if (usd > BUDGET.usdPerCheck) throw httpError(409, `一次检查最多 $${BUDGET.usdPerCheck}，这次估算要 $${usd}，不发送。`, { code: "CHECK_BUDGET" });
        const spent = store.spentToday();   // a record that cannot be read throws LEDGER_UNREADABLE: nothing is guessed, nothing is sent
        if (spent.usd + usd > BUDGET.usdPerDay) throw httpError(409, dailyLimitText(spent.usd), { code: "DAILY_LIMIT", budget: { ...BUDGET, spentToday: spent.usd } }); }
      const doc = readProject() || {};
      const from = Math.max(0, s - l);
      const range = { start: s, end: e };
      const tasteSnap = scope === "full" ? store.tasteSendable(project) : [];   // "only these seconds" carries no saved notes either   // taken again when the sample is ready, and that is what is shown and sent
      const id = "r_" + crypto.randomBytes(6).toString("hex");
      const job = requestSample({ project, range: { start: from, end: e }, where, revision: doc.revision ?? null });
      const r = { id, project, range, lead: +(s - from).toFixed(3), scope, mode, audio, frames: framesOf(doc, from, e), tasteSnap: tasteSnap, taste: tasteSnap.length, ctx: scope === "full" ? skeleton(doc, from, e) : "", destination: destination(), revision: doc.revision ?? null, key: store.contentKey(doc), state: "rendering", job: job.id,
        source: agent ? "agent" : "streamer", autoSend: !!autoSend, progress: 0, token: null, tokenExp: 0, cancelled: false };
      reviews.set(id, r);
      waitRender(r).catch(() => { r.state = "failed"; r.reason = "FAILED"; });
      return view(r);
    },
    status(id) {
      const r = id ? reviews.get(id) : [...reviews.values()].pop();
      if (!r) { const rec = id ? store.get(activeProject(), id) : null; if (rec) return { reviewId: id, state: "done", result: rec }; throw httpError(404, "no such check", { code: "NO_SUCH_REVIEW" }); }
      return view(r);
    },
    /** The token is on the response of status() only for a person's page; see `tokenFor`. */
    tokenFor(id) { const r = reviews.get(id); return r && r.state === "ready" && now() < r.tokenExp ? r.token : null; },
    async send(id, token, hash) {
      const r = reviews.get(id);
      if (!r) throw httpError(404, "no such check", { code: "NO_SUCH_REVIEW" });
      if (r.state !== "ready") throw httpError(409, "that check is not waiting to be sent", { code: "NOT_READY" });
      const ok = typeof token === "string" && r.token && token.length === r.token.length && crypto.timingSafeEqual(Buffer.from(token), Buffer.from(r.token));
      if (!ok || now() > r.tokenExp) throw httpError(403, "the send was not confirmed (or the confirmation ran out); prepare again", { code: "NOT_CONFIRMED" });
      if (typeof hash !== "string" || !r.hash || hash !== r.hash) throw httpError(403, "what was confirmed is not what would be sent; prepare again", { code: "HASH_MISMATCH" });
      return doSend(r);
    },
    cancel(id) {
      const r = reviews.get(id);
      if (!r) throw httpError(404, "no such check", { code: "NO_SUCH_REVIEW" });
      if (r.state === "done" || r.state === "failed" || r.state === "cancelled") return view(r);
      r.cancelled = true; r.token = null;
      if (r.state === "rendering") { try { cancelJob(r.job); } catch { } r.state = "cancelled"; r.reason = "CANCELLED"; }
      else if (r.state === "ready") { r.state = "cancelled"; r.reason = "CANCELLED"; dropSample(r); }
      else if (r.state === "sending") { try { cancelSend(r.id); } catch { } }
      onChange(r);
      return view(r);
    },
    destination,
    /** The streamer confirms again after a DESTINATION_MISMATCH (a person's click only; server.js checks that). */
    unblock() { return store.unblock(activeProject()); },
    limits: { MAX_SPAN_S, MAX_LEAD_S, DEFAULT_LEAD_S, TOKEN_TTL_MS, CONTEXT_MAX, BUDGET },
  };
}

module.exports = { createReviewService, skeleton, framesOf, MAX_SPAN_S, DEFAULT_LEAD_S, BUDGET };
