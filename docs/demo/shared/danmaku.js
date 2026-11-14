/* MontClip — Bilibili danmaku from a recording's XML, kept in project.danmaku (not in the transcript).
 *
 * Reads the two common XML forms: the one 录播姬 (BililiveRecorder) writes beside a live recording, and Bilibili's
 * own video danmaku XML. Both carry one <d p="…">text</d> per danmaku. The parser is incremental: push() takes the
 * file in pieces of any size (a piece may end in the middle of a tag), so a large file is never held whole.
 *
 * Each danmaku keeps two times apart:
 *   - when it shows: `t` (seconds into the recording, the first field of p) for `dur` seconds — MontClip's display
 *     length by mode (scrolling 8 s, top / bottom 4 s), not a value read from Bilibili;
 *   - when it was sent: `sent`, the absolute send time in epoch milliseconds (the fifth field of p: milliseconds in
 *     录播姬's files, seconds in Bilibili's), or null when the file has none.
 * Stored per recording (mediaId), in the recording's own seconds; toTimeline() maps them through the clips.
 * User names and ids are not kept. Gifts, super chats and guard events are counted, not kept.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.MontClipDanmaku = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const V = 1;
  const FIELDS = Object.freeze(["t", "dur", "sent", "mode", "color", "text"]);
  const SCROLL_SECONDS = 8, FIXED_SECONDS = 4;
  const MAX_ITEMS = 400000;      // per recording; more is refused rather than cut short (the tail would look quiet)
  const MAX_TEXT = 100;          // characters kept per danmaku
  const MAX_TAG = 1 << 20;       // one tag or one danmaku's text larger than this is a broken file
  const OTHER = new Set(["gift", "sc", "guard", "toast"]);

  const durFor = (mode) => (mode === 4 || mode === 5 ? FIXED_SECONDS : SCROLL_SECONDS);
  const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
  function decode(s) {
    return s.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|amp|lt|gt|quot|apos);/g, (m, e) => {
      if (e[0] !== "#") return ENT[e];
      const n = e[1] === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff) ? String.fromCodePoint(n) : "";
    });
  }
  function attrs(tag) {
    const out = {}, re = /([\w:.-]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
    let m;
    while ((m = re.exec(tag))) out[m[1]] = decode(m[3] != null ? m[3] : m[4]);
    return out;
  }
  const cleanText = (s) => Array.from(decode(s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim()).slice(0, MAX_TEXT).join("");
  const r3 = (x) => Math.round(x * 1000) / 1000;

  /** An incremental parser. push(text) any number of times, then end() → {format, recordStart, items, counts}. */
  function createParser() {
    let buf = "", skipUntil = null, done = false, format = "bilibili", recordStart = null, sawRoot = false;
    const items = [], counts = { danmaku: 0, special: 0, invalid: 0, gift: 0, sc: 0, guard: 0, toast: 0 };
    function fail(code, message) { throw Object.assign(new Error(message), { code }); }
    function onDanmaku(tag, body) {
      const p = attrs(tag).p;
      const f = p == null ? [] : p.split(",");
      const t = +f[0], mode = parseInt(f[1], 10), color = parseInt(f[3], 10), stamp = +f[4];
      if (f.length < 4 || !Number.isFinite(t) || t < 0 || !(mode >= 1 && mode <= 9)) { counts.invalid++; return; }
      // positioned (7), code (8) and BAS (9) danmaku carry a script, not words: counted, not kept
      if (mode >= 7) { counts.special++; return; }
      if (items.length >= MAX_ITEMS) fail("DANMAKU_TOO_MANY", `More than ${MAX_ITEMS} danmaku in one file — not imported`);
      // the fifth field: epoch milliseconds (录播姬) or seconds (Bilibili); 0 or missing = unknown
      const sent = Number.isFinite(stamp) && stamp > 0 ? Math.round(stamp > 1e11 ? stamp : stamp * 1000) : null;
      items.push([r3(t), durFor(mode), sent, mode, Number.isFinite(color) && color >= 0 ? color & 0xffffff : 0xffffff, cleanText(body)]);
      counts.danmaku++;
    }
    // buf holds the text not yet read from pos on; it is cut down only between pushes, so a large piece is not
    // copied again for every tag in it
    let pos = 0;
    function step() {
      // returns false when it needs more text
      if (skipUntil) {
        const at = buf.indexOf(skipUntil, pos);
        if (at < 0) { pos = Math.max(pos, buf.length - skipUntil.length); return false; }
        pos = at + skipUntil.length; skipUntil = null; return true;
      }
      const lt = buf.indexOf("<", pos);
      if (lt < 0) { pos = buf.length; return false; }
      pos = lt;
      if (buf.length - pos < 9 && !done) return false;
      if (buf.startsWith("<!--", pos)) { skipUntil = "-->"; pos += 4; return true; }
      if (buf.startsWith("<![CDATA[", pos)) { skipUntil = "]]>"; pos += 9; return true; }
      if (buf.startsWith("<?", pos) || buf.startsWith("<!", pos)) { skipUntil = ">"; pos += 2; return true; }
      // a tag: up to the first > outside quotes
      let q = null, end = -1;
      for (let i = pos + 1; i < buf.length; i++) {
        const c = buf.charCodeAt(i);
        if (q) { if (c === q) q = null; } else if (c === 34 || c === 39) q = c; else if (c === 62) { end = i; break; }
      }
      if (end < 0) { if (buf.length - pos > MAX_TAG) fail("DANMAKU_BAD_XML", "A tag is too long — not a danmaku XML file"); return false; }
      const tag = buf.slice(pos, end + 1), name = (/^<\/?([\w:.-]+)/.exec(tag) || [])[1] || "";
      const closing = tag[1] === "/", selfClosing = /\/\s*>$/.test(tag);
      if (closing) { pos = end + 1; return true; }
      if (name === "i") sawRoot = true;
      if (name === "d") {
        if (selfClosing) { onDanmaku(tag, ""); pos = end + 1; return true; }
        const close = buf.indexOf("</d>", end + 1);
        if (close < 0) { if (buf.length - pos > MAX_TAG) fail("DANMAKU_BAD_XML", "A danmaku is too long — not a danmaku XML file"); return false; }
        onDanmaku(tag, buf.slice(end + 1, close)); pos = close + 4; return true;
      }
      if (name === "BililiveRecorder" || name === "BililiveRecorderRecordInfo") format = "bililive-recorder";
      if (name === "BililiveRecorderRecordInfo") {
        const st = Date.parse(attrs(tag).start_time || "");
        if (Number.isFinite(st)) recordStart = st;
      }
      // 录播姬 embeds its own stylesheet: nothing in it is a danmaku
      if (name === "BililiveRecorderXmlStyle" && !selfClosing) { skipUntil = "</BililiveRecorderXmlStyle>"; pos = end + 1; return true; }
      if (OTHER.has(name)) counts[name]++;
      pos = end + 1;
      return true;
    }
    const run = () => { while (pos < buf.length && step()) { /* keep going */ } buf = buf.slice(pos); pos = 0; };
    return {
      push(text) {
        if (done) throw new Error("push after end");
        buf += String(text);
        run();
      },
      end() {
        done = true;
        run();
        if (!sawRoot && !counts.danmaku) fail("DANMAKU_BAD_XML", "Not a Bilibili danmaku XML file (no <i> root and no <d> danmaku)");
        items.sort((a, b) => a[0] - b[0]);
        return { format, recordStart, items, counts };
      },
    };
  }

  /** Parse a whole string (tests, small files). */
  function parse(text) { const p = createParser(); p.push(text); return p.end(); }

  /** The project entry for one recording. */
  function entry({ id, mediaId, name, parsed, imported = new Date().toISOString() }) {
    const { danmaku, ...other } = parsed.counts;
    return { id, mediaId, name: String(name || "").slice(0, 200), format: parsed.format, recordStart: parsed.recordStart,
      imported, count: parsed.items.length, skipped: other, v: V, fields: FIELDS.slice(), items: parsed.items };
  }

  /** project.danmaku as stored: well-formed entries of known media only, one per recording (the last wins). */
  function normalize(list, mediaIds) {
    if (!Array.isArray(list)) return [];
    const known = mediaIds ? new Set(mediaIds) : null, byMedia = new Map();
    for (const e of list) {
      if (!e || typeof e !== "object" || typeof e.mediaId !== "string" || !Array.isArray(e.items)) continue;
      if (known && !known.has(e.mediaId)) continue;
      const items = e.items.filter((x) => Array.isArray(x) && Number.isFinite(x[0]) && x[0] >= 0).slice(0, MAX_ITEMS);
      byMedia.set(e.mediaId, { ...e, count: items.length, items });
    }
    return [...byMedia.values()];
  }

  /** Danmaku on the timeline: timeline seconds (sorted) at which each one starts to show, through every clip that
   *  plays its recording — clip.start + (t − in) / speed, while t is inside the clip's window of the file. Linked
   *  stems of one shot count once. Clips with a speed ramp are left out (their file time doesn't map linearly). */
  function toTimeline(list, clips) {
    const out = [];
    const byMedia = new Map((list || []).map((e) => [e.mediaId, e]));
    const seen = new Set();
    for (const c of clips || []) {
      const e = byMedia.get(c.mediaId);
      if (!e || !(c.duration > 0)) continue;
      if (c.keyframes && Array.isArray(c.keyframes.speed) && c.keyframes.speed.length) continue;
      const speed = c.props && c.props.speed > 0 ? c.props.speed : 1, from = c.in || 0, to = from + c.duration * speed;
      const key = c.linkGroup ? "g:" + c.linkGroup : "c:" + c.id;
      if (seen.has(key)) continue;
      seen.add(key);
      for (const x of e.items) if (x[0] >= from && x[0] < to) out.push(r3(c.start + (x[0] - from) / speed));
    }
    return out.sort((a, b) => a - b);
  }

  return { V, FIELDS, SCROLL_SECONDS, FIXED_SECONDS, MAX_ITEMS, MAX_TEXT, createParser, parse, entry, normalize, toTimeline };
});
