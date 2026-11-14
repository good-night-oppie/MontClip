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
const TASTE_ASPECTS = Object.freeze(["pacing", "caption", "packaging", "fact", "subtitle", "other"]);
const TASTE_MAX = 30;
const SAFE_ID = /^[A-Za-z0-9_-]{1,80}$/;
const clip = (s, n) => String(s == null ? "" : s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, n);

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

function createReviewStore({ dir, now = () => Date.now() }) {
  const fileOf = (projectId) => path.join(dir, (SAFE_ID.test(String(projectId || "")) ? projectId : "default") + ".json");
  function read(projectId) {
    try { const d = JSON.parse(fs.readFileSync(fileOf(projectId), "utf8")); if (d && Array.isArray(d.records)) return d; } catch { }
    return { version: 1, records: [] };
  }
  function write(projectId, doc) {
    fs.mkdirSync(dir, { recursive: true });
    const f = fileOf(projectId), tmp = f + "." + process.pid + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(doc));
    fs.renameSync(tmp, f);
  }
  /** What a caller may see: no content hash. */
  const view = (r) => { if (!r) return null; const { contentKey: _k, ...rest } = r; return rest; };
  return {
    contentKey,
    add(projectId, rec) {
      const doc = read(projectId);
      doc.records.push({ ...rec, marks: [], correction: null });
      if (doc.records.length > MAX_RECORDS) doc.records.splice(0, doc.records.length - MAX_RECORDS);
      write(projectId, doc);
      return view(doc.records[doc.records.length - 1]);
    },
    get(projectId, id) { return view(read(projectId).records.find((r) => r.reviewId === id)); },
    /** newest first */
    list(projectId, limit = 20) { return read(projectId).records.slice(-Math.max(1, Math.min(MAX_RECORDS, limit | 0 || 20))).reverse().map(view); },
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
      const entry = { id: f ? f.id : null, mark, note: clip(note, 200), at: new Date(now()).toISOString() };
      rec.marks.push(entry);
      if (f) f.mark = mark;
      write(projectId, doc);
      return view(rec);
    },
    /** The project's taste notes (PG #321 v4 B10): what the streamer approved and rejected before, so every check judges by the same
     *  measure. A positive example must say WHAT was approved (pacing, caption, ...), never "this whole clip is fine". */
    tasteList(projectId) { return (read(projectId).taste || []).map((t) => ({ ...t })); },
    tasteAdd(projectId, { kind, aspect, text }) {
      if (!TASTE_KINDS.includes(kind)) throw httpError(400, "kind is positive or negative", { code: "BAD_TASTE" });
      const t = clip(text, 200);
      if (!t) throw httpError(400, "text is needed", { code: "BAD_TASTE" });
      if (kind === "positive" && !TASTE_ASPECTS.includes(aspect)) throw httpError(400, "a positive example says what was approved: aspect is one of " + TASTE_ASPECTS.join(", "), { code: "BAD_TASTE" });
      const doc = read(projectId); doc.taste = doc.taste || [];
      if (doc.taste.length >= TASTE_MAX) throw httpError(400, "at most " + TASTE_MAX + " notes; remove one first", { code: "TASTE_FULL" });
      const e = { id: "t_" + crypto.randomBytes(4).toString("hex"), kind, aspect: kind === "positive" ? aspect : null, text: t, at: new Date(now()).toISOString() };
      doc.taste.push(e); write(projectId, doc);
      return { ...e };
    },
    tasteRemove(projectId, id) {
      const doc = read(projectId), n = (doc.taste || []).length;
      doc.taste = (doc.taste || []).filter((t) => t.id !== id);
      if (doc.taste.length === n) throw httpError(404, "no such note", { code: "NO_SUCH_TASTE" });
      write(projectId, doc);
      return { removed: id };
    },
    /** A person's (or an agent's) correction of what the model took the stretch to be. It does not make anything pass. */
    correct(projectId, { id, digest }) {
      const doc = read(projectId), rec = doc.records.find((r) => r.reviewId === id);
      if (!rec) throw httpError(404, "no such check", { code: "NO_SUCH_REVIEW" });
      rec.correction = { text: clip(digest, 300), at: new Date(now()).toISOString() };
      write(projectId, doc);
      return view(rec);
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
