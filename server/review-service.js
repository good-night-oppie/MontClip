"use strict";
/* #321 — the steps of one check of a stretch of the timeline: render a small sample, show the streamer what would leave the
   machine, send it only on her click (a one-time token), keep the result apart from the project.

   Nothing here changes the project: not its revision, IN / OUT, undo, nor project.json. A project's own text only goes along
   when she chose "with the project's text" (scope:"full"). */
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const httpError = (code, message, extra = {}) => Object.assign(new Error(message), { status: code, ...extra });
const num = (v) => (typeof v === "number" || (typeof v === "string" && v.trim() !== "")) && Number.isFinite(Number(v)) ? Number(v) : null;

const MAX_SPAN_S = 30;     // one check looks at most this much (the compact copy has to stay small)
const MAX_LEAD_S = 10;
const DEFAULT_LEAD_S = 3;
const TOKEN_TTL_MS = 10 * 60 * 1000;
const RENDER_TIMEOUT_MS = 10 * 60 * 1000;
const CONTEXT_MAX = 6000;

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
  agyOverride = null, agentSendEnabled = () => false, sendCapBytes = 104857600, now = () => Date.now(), pollMs = 400, onChange = () => { } }) {
  const reviews = new Map();           // reviewId → in-flight state (finished ones live in the store)
  /* a check that was shown but never confirmed does not hold the project forever: after its token ran out it is expired and its sample removed */
  const sweep = () => { for (const r of reviews.values()) if (r.state === "ready" && now() > r.tokenExp) { r.state = "expired"; r.reason = "EXPIRED"; r.token = null; dropSample(r); onChange(r); } };
  const busy = (project) => { sweep(); return [...reviews.values()].find((r) => r.project === project && (r.state === "rendering" || r.state === "ready" || r.state === "sending")); };
  /* ONE decision about where it goes: what is shown, what is checked again at the moment of sending, and what the record says */
  const destination = () => ({ ...bridge.destination(env) });
  const sameDestination = (a, b) => a && b && a.service === b.service && a.host === b.host;
  const what = (r) => ["a short video clip (with its sound) of this stretch",
    r.scope === "full" ? "plus the subtitles and cut points that touch it (a subtitle goes whole, so it may include text from before or after the clip)" : "and nothing else from the project (no subtitles, no saved notes)",
    r.lead > 0 ? `including a lead-in of ${r.lead} s (${(r.range.start - r.lead).toFixed(2)}-${r.range.start.toFixed(2)} s) before the part you chose` : "",
    r.taste ? `plus your ${r.taste} saved taste note${r.taste === 1 ? "" : "s"} (what you approved or rejected before)` : "",
    r.mode === "two_pass" ? "sent in 2 requests: a blind first look, then the full check" : ""].filter(Boolean).join("; ");
  const view = (r) => ({
    reviewId: r.id, state: r.state, project: r.project, range: r.range, lead: r.lead, scope: r.scope, mode: r.mode, revision: r.revision, progress: r.progress ?? null,
    willSend: r.state === "ready" ? { what: what(r), to: r.destination, requests: r.mode === "two_pass" ? 2 : 1, tasteNotes: r.taste,
      /* the words themselves, as they will go: the project's subtitles and cut points (scope full) and the taste notes */
      projectText: r.ctx || "", tasteNotice: r.taste ? "文字只在本次运行保留，重启后需重新填写" : "", notes: (r.tasteSnap || []).map((t) => ({ kind: t.kind, aspect: t.aspect, text: t.text })),
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
          r.ctx = r.scope === "full" ? skeleton(doc, Math.max(0, r.range.start - r.lead), r.range.end) : ""; r.tasteSnap = r.scope === "full" ? store.tasteSendable(r.project) : []; r.taste = r.tasteSnap.length; }
        r.file = file; r.state = "ready"; r.token = crypto.randomBytes(24).toString("hex"); r.tokenExp = now() + TOKEN_TTL_MS; r.progress = 1; break;
      }
      if (j.status === "failed" || j.status === "cancelled" || j.status === "error") { r.state = r.cancelled ? "cancelled" : "failed"; r.reason = r.cancelled ? "CANCELLED" : "RENDER_FAILED"; break; }
      await new Promise((res) => setTimeout(res, pollMs));
    }
    onChange(r);
    if (r.state === "ready" && r.autoSend) { try { await doSend(r); } catch { } }
  }

  /** The rendered sample is only there for this check: removed once it was sent or the check ended without it. */
  function dropSample(r) { if (r.file) { try { fs.rmSync(r.file, { force: true }); } catch { } } }

  async function doSend(r) {
    if (r.state !== "ready") throw httpError(409, "that check is not waiting to be sent", { code: "NOT_READY" });
    if (activeProject() !== r.project) { r.state = "failed"; r.reason = "PROJECT_CHANGED"; r.token = null; dropSample(r); onChange(r); throw httpError(409, "another project is open now; prepare again", { code: "PROJECT_CHANGED" }); }
    if (store.contentKey(readProject() || {}) !== r.key) { r.state = "failed"; r.reason = "PROJECT_EDITED"; r.token = null; dropSample(r); onChange(r); throw httpError(409, "the project was edited after this sample was made, so it no longer matches; prepare again", { code: "PROJECT_EDITED" }); }
    { const need = (r.mode === "two_pass" ? 2 : 1) * bridge.MAX_SAMPLE_BYTES; if (store.sentTotal(r.project) + need > sendCapBytes) { r.state = "failed"; r.reason = "SEND_LIMIT"; r.token = null; dropSample(r); onChange(r); throw httpError(409, "this project has reached its limit for video sent out", { code: "SEND_LIMIT" }); } }
    if (!destination().verified || !sameDestination(r.destination, destination())) { r.state = "failed"; r.reason = "DESTINATION_CHANGED"; r.token = null; dropSample(r); onChange(r); throw httpError(409, "where this goes changed since it was shown; prepare again", { code: "DESTINATION_CHANGED" }); }
    r.state = "sending"; r.token = null; onChange(r);
    let res;
    const from = r.range.start - r.lead;
    try {
      /* the project's words and the taste notes are the ones that were there when the page showed what would be sent: a project that
         was switched or a note that was added since is not sent */
      const ctx = r.ctx;
      const digests = [];   // B9 (rolling digests of other stretches) is the next batch
      res = await bridge.checkSample({ ffmpeg: ffmpeg(), ffprobe: ffprobe(), sampleFile: r.file, offset: from, leadSec: r.lead, rangeStart: r.range.start,
        contextText: ctx, digests, taste: r.tasteSnap, mode: r.mode, env, agy: agyOverride || undefined, onChild: (c) => { r.child = c; }, isCancelled: () => r.cancelled });
    } catch (e) { res = { status: "no_result", reason: "FAILED", findings: [], summary: "", windowDigest: "", dimensions: null, mode: r.mode, observation: "" }; }
    r.child = null;
    dropSample(r);
    if (r.cancelled) res = { status: "no_result", reason: "CANCELLED", findings: [], summary: "", windowDigest: "", dimensions: null, mode: r.mode, observation: "" };
    let rec;
    try { rec = store.add(r.project, {
      reviewId: r.id, status: res.status, reason: res.reason || null, range: r.range, lead: r.lead, revision: r.revision, contentKey: r.key, scope: r.scope,
      source: r.source, at: new Date(now()).toISOString(), findings: res.findings, summary: res.summary, windowDigest: res.windowDigest,
      dimensions: res.dimensions || null, mode: r.mode, requests: r.mode === "two_pass" ? 2 : 1, observation: res.observation || "", tasteNotes: r.taste,
      destination: r.destination, sentBytes: res.sentBytes || 0, passes: res.passes || [],
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
    prepare({ start, end, lead, scope = "window", mode = "single", where, agent = false, autoSend = false }) {
      sweep();
      const s = num(start), e = num(end);
      if (s == null || e == null || s < 0 || e <= s) throw httpError(400, "start and end are seconds with 0 <= start < end", { code: "BAD_RANGE" });
      if (e - s > MAX_SPAN_S) throw httpError(400, `one check looks at most ${MAX_SPAN_S} seconds; pass a shorter stretch`, { code: "TOO_LONG" });
      const l = lead == null ? DEFAULT_LEAD_S : num(lead);
      if (l == null || l < 0 || l > MAX_LEAD_S) throw httpError(400, `lead is 0 to ${MAX_LEAD_S} seconds`, { code: "BAD_LEAD" });
      if (scope !== "window" && scope !== "full") throw httpError(400, 'scope is "window" or "full"', { code: "BAD_SCOPE" });
      if (mode !== "single" && mode !== "two_pass") throw httpError(400, 'mode is "single" or "two_pass"', { code: "BAD_MODE" });
      if (autoSend && !agent) throw httpError(403, "only a person's click at the editor sends a sample", { code: "CLICK_REQUIRED" });
      /* off until the owner's authorisation for an agent to send on the streamer's behalf is on file and QQ has verified it (Deja, #321) */
      if (autoSend && !agentSendEnabled()) throw httpError(403, "an agent may not send a sample yet: it is off until the owner's authorisation is verified; use prepare, and the streamer sends with her click", { code: "AGENT_SEND_OFF" });
      const project = activeProject();
      if (busy(project)) throw httpError(409, "another check of this project is still running; cancel it or wait", { code: "BUSY", busy: view(busy(project)) });
      /* fail closed: an address nobody has confirmed is not one anything is rendered for, let alone sent to */
      if (!destination().verified) throw httpError(409, "where this would be sent has not been confirmed (the owner's confirmation is missing), so nothing is prepared or sent", { code: "DESTINATION_UNVERIFIED", destination: destination() });
      if (!agyOverride && !bridge.findAgy(env)) throw httpError(409, "the video check tool is not installed on this computer", { code: "NO_BRIDGE" });
      const doc = readProject() || {};
      const from = Math.max(0, s - l);
      const range = { start: s, end: e };
      const tasteSnap = scope === "full" ? store.tasteSendable(project) : [];   // "only these seconds" carries no saved notes either   // taken again when the sample is ready, and that is what is shown and sent
      const id = "r_" + crypto.randomBytes(6).toString("hex");
      const job = requestSample({ project, range: { start: from, end: e }, where, revision: doc.revision ?? null });
      const r = { id, project, range, lead: +(s - from).toFixed(3), scope, mode, tasteSnap: tasteSnap, taste: tasteSnap.length, ctx: scope === "full" ? skeleton(doc, from, e) : "", destination: destination(), revision: doc.revision ?? null, key: store.contentKey(doc), state: "rendering", job: job.id,
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
    async send(id, token) {
      const r = reviews.get(id);
      if (!r) throw httpError(404, "no such check", { code: "NO_SUCH_REVIEW" });
      if (r.state !== "ready") throw httpError(409, "that check is not waiting to be sent", { code: "NOT_READY" });
      const ok = typeof token === "string" && r.token && token.length === r.token.length && crypto.timingSafeEqual(Buffer.from(token), Buffer.from(r.token));
      if (!ok || now() > r.tokenExp) throw httpError(403, "the send was not confirmed (or the confirmation ran out); prepare again", { code: "NOT_CONFIRMED" });
      return doSend(r);
    },
    cancel(id) {
      const r = reviews.get(id);
      if (!r) throw httpError(404, "no such check", { code: "NO_SUCH_REVIEW" });
      if (r.state === "done" || r.state === "failed" || r.state === "cancelled") return view(r);
      r.cancelled = true; r.token = null;
      if (r.state === "rendering") { try { cancelJob(r.job); } catch { } r.state = "cancelled"; r.reason = "CANCELLED"; }
      else if (r.state === "ready") { r.state = "cancelled"; r.reason = "CANCELLED"; dropSample(r); }
      else if (r.state === "sending" && r.child) { try { bridge.killTree(r.child, true); } catch { } }
      onChange(r);
      return view(r);
    },
    destination,
    limits: { MAX_SPAN_S, MAX_LEAD_S, DEFAULT_LEAD_S, TOKEN_TTL_MS, CONTEXT_MAX },
  };
}

module.exports = { createReviewService, skeleton, MAX_SPAN_S, DEFAULT_LEAD_S };
