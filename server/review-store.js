"use strict";
/* #321 — the record of the checks a project has had. One file per project in reviews/, apart from project.json: writing
   here never changes the project's revision, IN / OUT or undo history.

   "passed" is written by one place only: server.js, when the video bridge itself came back with a pass for this stretch of
   this content of the project. Nothing that arrives over HTTP, MCP or a tool can write it (mark() refuses it), and a
   record stops counting the moment the project's content changes. */
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const MAX_RECORDS = 200;
const MARKS = Object.freeze(["fixed", "recheck_needed", "note"]);
const TASTE_KINDS = Object.freeze(["positive", "negative"]);
const TASTE_ASPECTS = Object.freeze(["fact", "subtitle", "pacing", "packaging"]);
/* the older word "caption" means subtitle; anything else is not an aspect */
const aspectOf = (a) => { const x = a === "caption" ? "subtitle" : a; return TASTE_ASPECTS.includes(x) ? x : null; };
const TASTE_MAX = 30;
const SAFE_ID = /^[A-Za-z0-9_-]{1,80}$/;
const clip = (s, n) => { let t = String(s == null ? "" : s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, n);
  if (/[\ud800-\udbff]$/.test(t)) t = t.slice(0, -1);   // limits are UTF-16 code units; never half a pair
  return t.trim(); };

/** A stable text of any JSON value (sorted keys), so two saves of the same content give the same hash. */
function canon(v) {
  if (Array.isArray(v)) return "[" + v.map(canon).join(",") + "]";
  if (v && typeof v === "object") return "{" + Object.keys(v).sort().filter((k) => v[k] !== undefined).map((k) => JSON.stringify(k) + ":" + canon(v[k])).join(",") + "}";
  return JSON.stringify(v === undefined ? null : v);
}
/** What the project is, without what only counts the saves: the revision and the event log. The editor page saves the project
 *  itself when it loads (the revision goes up by one), and that must not make a check stale. */
function contentKey(doc) {
  const { revision: _r, agentLog: _l, ...rest } = doc || {};
  return crypto.createHash("sha256").update(canon(rest)).digest("hex");
}
const httpError = (code, message, extra = {}) => Object.assign(new Error(message), { status: code, ...extra });

/* QQ (#328): what the model wrote about a clip (findings' words, the summary, the digest, the blind observation, the reasons) can quote
   what is on screen, nicknames of viewers included. None of it is written to disk. A record on disk keeps only structured fields (times,
   kinds, states, marks); the words live in this process's memory for the check just made, and are gone when it exits. Marks' notes and
   corrections are words too and are kept the same way. A file from before this rule is scrubbed the first time it is read. */
const MEM_MAX = 200;
function structured(r) {
  const o = { ...r };
  delete o.summary; delete o.windowDigest; delete o.observation;
  o.findings = (r.findings || []).map((f) => ({ id: f.id, t: f.t, type: f.type, inLead: !!f.inLead, mark: f.mark || null }));
  if (r.dimensions) o.dimensions = Object.fromEntries(Object.entries(r.dimensions).map(([k, v]) => [k, { state: v && v.state }]));
  o.marks = (r.marks || []).map((m) => ({ id: m.id, mark: m.mark, at: m.at }));
  o.correction = r.correction ? { at: r.correction.at } : null;
  return o;
}
const hasWords = (r) => "summary" in r || "windowDigest" in r || "observation" in r || (r.findings || []).some((f) => "text" in f || "suggestion" in f)
  || Object.values(r.dimensions || {}).some((v) => v && "reason" in v) || (r.marks || []).some((m) => "note" in m) || !!(r.correction && "text" in r.correction);

function createReviewStore({ dir, now = () => Date.now() }) {
  const fileOf = (projectId) => path.join(dir, (SAFE_ID.test(String(projectId || "")) ? projectId : "default") + ".json");
  const mem = new Map();   // "project\0reviewId" → the words of that check, this process only
  const tasteWords = new Map();   // "project\0noteId" → the words of a taste note, this process only (QQ: a nickname can be typed into one too)
  const memKey = (p, id) => p + "\u0000" + id;
  const memFor = (p, id) => { const k = memKey(p, id); let m = mem.get(k); if (!m) { m = { findings: {}, dims: {}, notes: [], correction: null }; mem.set(k, m); while (mem.size > MEM_MAX) mem.delete(mem.keys().next().value); } return m; };
  /* A ledger that cannot be read is an error, not an empty ledger: the next write would wipe what was there. The message names no path. */
  function read(projectId) {
    let d = null;
    try { d = JSON.parse(fs.readFileSync(fileOf(projectId), "utf8")); }
    catch (e) { if (e && e.code === "ENOENT") return { version: 1, records: [] }; throw httpError(500, "the review record could not be read", { code: "LEDGER_UNREADABLE" }); }
    if (!d || !Array.isArray(d.records)) throw httpError(500, "the review record could not be read", { code: "LEDGER_UNREADABLE" });
    let dirty = false;
    if (d.records.some(hasWords)) { d.records = d.records.map(structured); dirty = true; }   // scrub a file from before this rule
    if ((d.taste || []).some((t) => "text" in t)) { d.taste = d.taste.map(({ text: _t, ...rest }) => rest); dirty = true; }   // taste words too
    if (dirty) {
      try { write(projectId, d); }
      catch (e) {
        /* the old words must not stay: if the file cannot be rewritten it is removed; if even that fails, nothing is read from it */
        try { fs.rmSync(fileOf(projectId), { force: true }); return { version: 1, records: [] }; } catch { throw httpError(500, "the review record could not be cleaned", { code: "LEDGER_UNWRITABLE" }); }
      }
    }
    return d;
  }
  function write(projectId, doc) {
    try {
      fs.mkdirSync(dir, { recursive: true });
      const f = fileOf(projectId), tmp = f + "." + process.pid + ".tmp";
      fs.writeFileSync(tmp, JSON.stringify(doc));
      fs.renameSync(tmp, f);
    } catch { throw httpError(500, "the review record could not be written", { code: "LEDGER_UNWRITABLE" }); }
  }
  /** What a caller may see: no content hash. */
  const view = (r, projectId) => {
    if (!r) return null;
    const { contentKey: _k, ...rest } = r;
    const m = mem.get(memKey(projectId, r.reviewId));
    if (!m) return { ...rest, textAvailable: false };
    return { ...rest, textAvailable: true, summary: m.summary || "", windowDigest: m.windowDigest || "", observation: m.observation || "",
      findings: rest.findings.map((f) => ({ ...f, ...(m.findings[f.id] || {}) })),
      dimensions: rest.dimensions ? Object.fromEntries(Object.entries(rest.dimensions).map(([k, v]) => [k, { ...v, reason: m.dims[k] || "" }])) : rest.dimensions,
      marks: rest.marks.map((x, i) => ({ ...x, note: (m.notes[i] || "") })), correction: rest.correction ? { ...rest.correction, text: m.correction || "" } : null };
  };
  return {
    contentKey,
    /** Every ledger on disk, read once so that a file from before the no-words rule is cleaned whether or not its project is ever opened. */
    scrubAll() {
      let n = 0;
      let names = []; try { names = fs.readdirSync(dir).filter((x) => /^[A-Za-z0-9_-]{1,80}\.json$/.test(x)); } catch { return 0; }
      for (const x of names) { try { read(x.slice(0, -5)); n++; } catch { } }
      return n;
    },
    /** That an agent exported a long stretch without a passed check, when and which stretch. The reason it gave is not kept. */
    bypass(projectId, { start, end }) {
      const doc = read(projectId); doc.bypasses = doc.bypasses || [];
      doc.bypasses.push({ at: new Date(now()).toISOString(), start: +start, end: +end }); if (doc.bypasses.length > 200) doc.bypasses.splice(0, doc.bypasses.length - 200);
      write(projectId, doc); return { recorded: true };
    },
    bypasses(projectId) { return (read(projectId).bypasses || []).map((b) => ({ ...b })); },
    /** How much of this project's video has been sent so far (compact copies, bytes), for the per-project cap. */
    sentTotal(projectId) { return read(projectId).records.reduce((a, r) => a + (Number(r.sentBytes) || 0), 0); },
    add(projectId, rec) {
      const doc = read(projectId);
      const m = memFor(projectId, rec.reviewId);
      m.summary = rec.summary || ""; m.windowDigest = rec.windowDigest || ""; m.observation = rec.observation || "";
      for (const f of rec.findings || []) m.findings[f.id] = { text: f.text || "", suggestion: f.suggestion || "" };
      for (const [k, v] of Object.entries(rec.dimensions || {})) m.dims[k] = (v && v.reason) || "";
      doc.records.push(structured({ ...rec, marks: [], correction: null }));
      if (doc.records.length > MAX_RECORDS) doc.records.splice(0, doc.records.length - MAX_RECORDS);
      write(projectId, doc);
      return view(doc.records[doc.records.length - 1], projectId);
    },
    get(projectId, id) { return view(read(projectId).records.find((r) => r.reviewId === id), projectId); },
    /** newest first */
    list(projectId, limit = 20) { return read(projectId).records.slice(-Math.max(1, Math.min(MAX_RECORDS, limit | 0 || 20))).reverse().map((r) => view(r, projectId)); },
    /** Marks a record or one of its findings. "passed" is not a mark: 400. */
    mark(projectId, { id, finding = null, mark, note = "" }) {
      if (!MARKS.includes(mark)) throw httpError(400, "mark must be fixed, recheck_needed or note — a pass only comes from a check that really passed", { code: "MARK_REFUSED" });
      const doc = read(projectId), rec = doc.records.find((r) => r.reviewId === id);
      if (!rec) throw httpError(404, "no such check", { code: "NO_SUCH_REVIEW" });
      let f = null;
      if (finding != null) {
        f = rec.findings.find((x) => x.id === Number(finding));
        if (!f) throw httpError(404, "no such finding in that check", { code: "NO_SUCH_FINDING" });
      }
      const entry = { id: f ? f.id : null, mark, at: new Date(now()).toISOString() };
      rec.marks.push(entry);
      const m = memFor(projectId, id); m.notes[rec.marks.length - 1] = clip(note, 200);   // the words stay in memory
      if (f) f.mark = mark;
      write(projectId, doc);
      return view(rec, projectId);
    },
    /** The project's taste notes (PG #321 v4 B10): what the streamer approved and rejected before, so every check judges by the same
     *  measure. A positive example must say WHAT was approved (pacing, caption, ...), never "this whole clip is fine". */
    tasteList(projectId) { return (read(projectId).taste || []).map((t) => { const w = tasteWords.get(memKey(projectId, t.id)); return { ...t, aspect: aspectOf(t.aspect), text: w || "", textAvailable: !!w }; }); },
    /** What a check may send: only the notes whose words are still here (they are not on disk, so a restart empties this). */
    tasteSendable(projectId) { return this.tasteList(projectId).filter((t) => t.textAvailable); },
    tasteAdd(projectId, { kind, aspect, text }) {
      if (!TASTE_KINDS.includes(kind)) throw httpError(400, "kind is positive or negative", { code: "BAD_TASTE" });
      const t = clip(text, 200);
      if (!t) throw httpError(400, "text is needed", { code: "BAD_TASTE" });
      const asp = aspectOf(aspect);
      if (kind === "positive" && !asp) throw httpError(400, "a positive example says what was approved: aspect is one of " + TASTE_ASPECTS.join(", "), { code: "BAD_TASTE" });
      if (kind === "negative" && aspect != null && aspect !== "" && !asp) throw httpError(400, "aspect, when given, is one of " + TASTE_ASPECTS.join(", "), { code: "BAD_TASTE" });
      const doc = read(projectId); doc.taste = doc.taste || [];
      if (doc.taste.length >= TASTE_MAX) throw httpError(400, "at most " + TASTE_MAX + " notes; remove one first", { code: "TASTE_FULL" });
      const e = { id: "t_" + crypto.randomBytes(4).toString("hex"), kind, aspect: asp, at: new Date(now()).toISOString() };
      doc.taste.push(e); write(projectId, doc);   // the file gets the kind and the aspect, never the words
      tasteWords.set(memKey(projectId, e.id), t);
      return { ...e, text: t, textAvailable: true };
    },
    tasteRemove(projectId, id) {
      const doc = read(projectId), n = (doc.taste || []).length;
      doc.taste = (doc.taste || []).filter((t) => t.id !== id);
      tasteWords.delete(memKey(projectId, id));
      if (doc.taste.length === n) throw httpError(404, "no such note", { code: "NO_SUCH_TASTE" });
      write(projectId, doc);
      return { removed: id };
    },
    /** A person's (or an agent's) correction of what the model took the stretch to be. It does not make anything pass. */
    correct(projectId, { id, digest }) {
      const doc = read(projectId), rec = doc.records.find((r) => r.reviewId === id);
      if (!rec) throw httpError(404, "no such check", { code: "NO_SUCH_REVIEW" });
      rec.correction = { at: new Date(now()).toISOString() };
      memFor(projectId, id).correction = clip(digest, 300);
      write(projectId, doc);
      return view(rec, projectId);
    },
    /** Does the project, as it is now (key), have a real pass over every second of [start, end]? The newest check that says anything
     *  about a second decides it, so a later check of a smaller part that found a problem (or a person's recheck_needed) takes
     *  the pass away for that part. A check that could not be made (no_result) says nothing. */
    gate(projectId, { key, start, end }) {
      let segs = [];   // [{a, b, rec, ok}] — what the newest word is, over each piece
      for (const r of read(projectId).records) {
        if (r.contentKey !== key || !r.range || r.status === "no_result") continue;
        const ok = r.status === "passed" && !r.marks.some((m) => m.mark === "recheck_needed");
        const a0 = r.range.start, b0 = r.range.end, next = [];
        for (const g of segs) {
          if (g.b <= a0 || g.a >= b0) { next.push(g); continue; }
          if (g.a < a0) next.push({ ...g, b: a0 });
          if (g.b > b0) next.push({ ...g, a: b0 });
        }
        next.push({ a: a0, b: b0, rec: r, ok });
        segs = next;
      }
      const over = segs.filter((g) => g.b > start + 1e-6 && g.a < end - 1e-6).sort((x, y) => x.a - y.a);
      let at = start, passed = over.length > 0;
      for (const g of over) { if (g.a > at + 1e-6 || !g.ok) { passed = false; break; } at = Math.max(at, g.b); }
      if (at < end - 1e-6) passed = false;
      const last = over.map((g) => g.rec).sort((x, y) => (x.at < y.at ? 1 : -1))[0] || null;
      return { passed, recordId: passed && last ? last.reviewId : null, revision: last ? last.revision : null, covers: passed ? [start, end] : null };
    },
  };
}

module.exports = { createReviewStore, contentKey, canon, MARKS, MAX_RECORDS, TASTE_KINDS, TASTE_ASPECTS, TASTE_MAX };
