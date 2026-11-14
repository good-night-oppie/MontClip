/* 「检查这 10 秒」 (#321 step 2, Deja, 2026-11-14): the streamer's own check of a short stretch of the edit.
   Interface: Cindy's v0 on #321 (6867768988), with Deja's decisions (6867787475). Spec: JJ v1 + v2 + v3 + v3.1, adopted
   by PG (6867587684). QQ's red line (PG 6867627361): before 「发送检查」 or 「只发这 10 秒」 the box shows what is sent,
   who receives it (the service and its domain, from status / prepare) and that it may be used for training — every
   time, whatever the assistant's approval mode is. This file never reads that mode.

   The page itself goes nowhere but its own server:
     prepare  → makes the clip on this computer (no network);   prewarm → the same, ahead of time, once the playhead rests
     preview  → a same-origin /previews/… address to play;      cancel  → 「不发了」, drops the token and the clip
     send     → the only call that leads off this computer, and only from a click on one of the two send buttons,
                carrying the one-time sendToken prepare gave.
   The answer is untrusted (it comes from a model): fixed fields, cut to length, drawn as text — never as HTML, never run.
   「no_result」 is never shown as a pass; 「passed」 with a problem inside the checked stretch is shown as problems. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.MontClipReviewCheck = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const SPAN = 10;          // seconds checked around the playhead
  const MIN_SPAN = 1;       // JJ #326: under 1 s can't be checked
  const MAX_SPAN = 30;      // JJ v1 R1b: a check is at most 30 s (an IN–OUT longer than that falls back to 10 s)
  const PREWARM_DELAY = 1500;   // ms the playhead has to rest before the clip is made ahead of time

  // zh-CN: JJ's first pass on #326 (comment 6868600043, head d5872c56): the v2 / v3 / v3.1 sentences word for word, the
  // rest as JJ wrote them there (marked 「JJ #326」). Still a DRAFT for JJ's re-check on the new head. 「10」 is {n}: a marked
  // IN–OUT of 1–30 s is checked as it is (JJ: allowed; whole seconds; under 1 s it can't be clicked).
  // en: DRAFT — Rea checks it against the final Chinese.
  const text = {
    "zh-CN": {
      button: "检查这 {n} 秒",                                     // v2 §6
      buttonTip: "让 AI 看一看、听一听这 {n} 秒有没有问题。发出去之前会先给你看要发什么。",   // JJ #326
      title: "检查这 {n} 秒",                                      // JJ #326: kept
      preparing: "正在这台电脑上准备这 {n} 秒，还没有发出去。",     // JJ #326: kept
      cancelPrep: "取消",                                           // JJ #326: the button while preparing
      // v3.1 §3, word for word (n = 10)
      intro: "联网只发生在你自己打开的功能里，发之前先给你看。点「发送检查」后，这 {n} 秒的画面和声音，还有整条片子的字幕文字和剪辑时间点，会发给 AI 做检查，可能用于训练。",
      whatFull: "点「发送检查」会发出去：{from}–{to} 的画面和声音（{sec} 秒），整条片子的字幕文字 {chars} 字，和 {cuts} 个剪辑时间点。",   // JJ #326
      whatFullLead: "两个按钮发的画面和声音里，都有前面多带的 {leadSec} 秒（{from}–{lead}），让 AI 知道前面在说什么。",   // JJ #326 (after whatWindow)
      whatWindow: "点「只发这 {n} 秒」只发出去：{from}–{to} 的画面和声音（{sec} 秒），不发整条片子的字幕文字和剪辑时间点。",   // JJ #326
      whatDanmaku: "画面里如果有观众昵称、弹幕，会原样发出去。",       // JJ #326
      truncatedBefore: "整条片子的字幕文字太长，点「发送检查」时只带这 {n} 秒附近的部分。",   // draft (Deja) for JJ: JJ #326 asked for it before sending
      to: "发给：{service}（{host}）",                             // Deja 6867787475; JJ #326: kept
      training: "对方可能用这段内容训练模型",                       // Deja 6867787475; JJ #326: kept
      noDestination: "不知道这次会发到哪里，所以先不发。",           // JJ #326: kept
      noPayload: "说不清这次具体会发出去什么，所以先不发。",           // draft (Deja) for JJ: QQ #326 item 1 — the box can't say what is sent
      previewBtn: "先看要发的内容",                                 // v3 §5
      sendFull: "发送检查",                                         // v3 §5
      sendWindow: "只发这 {n} 秒",                                  // v3 §5
      cancel: "不发了",                                             // v3 §5
      previewNote: "这就是要发出去的画面和声音。",                   // JJ #326: kept (preview and send use one reviewId — interface v0)
      sending: "正在发给 AI 并等它检查，请稍等……",                   // JJ #326
      unavailable: "这台电脑上暂时用不了这个检查。",                 // v2 §6
      busy: "现在正在忙别的，等它忙完再点一次。",                      // JJ #326
      issues: "检查完了，发现 {count} 处可能有问题。",               // v2 §6
      passed: "这 {n} 秒检查没有发现问题。这只是 AI 的判断，请你自己也看一遍、听一遍。",   // JJ #326 (v2 §6, reworded by JJ)
      noResult: "这次没有检查出结果。这不代表没问题。",               // v2 §6
      prepareFailed: "这 {n} 秒没能在这台电脑上准备好，什么都没有发出去。",   // JJ #326
      sendFailed: "检查没做成。不确定内容有没有已经发到对方那边。这不代表没问题。",   // JJ #326
      rangeTooLong: "你标的范围超过 30 秒，这次检查的是播放头附近的 {n} 秒。",   // JJ #326
      windowOnly: "这次只检查了这 {n} 秒，没有结合整条片子。",        // v3 §5
      truncated: "整条片子的文字太长，这次只带了这 {n} 秒附近的部分。",   // v3 §5
      inLead: "（在前面多带的那几秒里）",                              // JJ #326
      jump: "跳到这里",                                             // v2 §6
      fixed: "已修好",                                              // v2 §6
      fixedDone: "已标记为修好",                                     // JJ #326
      recheck: "重新检查",                                          // v2 §6
      close: "关闭",                                                // JJ #326: kept
      suggestion: "建议：{text}",                                   // JJ #326: kept
      type_speaker_swapped: "说话人可能标反了",                      // v2 §6
      type_cut_jump: "这里接得可能太突然",                           // JJ #326
      type_subtitle_mismatch: "字幕和说的话可能对不上",              // JJ #326: kept
      type_audio: "声音可能有问题",                                  // JJ #326: kept
      type_continuity: "前后两段可能接不上",                         // JJ #326
      type_other: "这里可能有问题",                                  // JJ #326: kept
    },
    en: {
      button: "Check these {n} s",
      buttonTip: "Have AI watch and listen to these {n} seconds for problems. Before anything is sent, you see what would go.",
      title: "Check these {n} seconds",
      preparing: "Getting these {n} seconds ready on this computer. Nothing has been sent.",
      cancelPrep: "Cancel",
      intro: "Going online only happens in features you open yourself, and you see what goes first. When you click “Send for check”, the picture and sound of these {n} seconds, plus the whole video's subtitle text and cut points, go to an AI for checking and may be used for training.",
      whatFull: "“Send for check” sends out: picture and sound from {from} to {to} ({sec} s), the whole video's subtitle text ({chars} characters), and {cuts} cut points.",
      whatFullLead: "With either button, the picture and sound include {leadSec} s from just before ({from} to {lead}), so the AI knows what came first.",
      whatWindow: "“Send only these {n} s” sends out only: picture and sound from {from} to {to} ({sec} s), without the whole video's subtitle text and cut points.",
      whatDanmaku: "Viewer names and chat messages in the picture are sent as they are.",
      truncatedBefore: "The whole video's subtitle text is too long: “Send for check” takes only the part near these {n} seconds.",
      to: "Sent to: {service} ({host})",
      training: "They may use this content to train models",
      noDestination: "It isn't clear where this would be sent, so nothing will be sent.",
      noPayload: "It isn't clear exactly what this would send, so nothing will be sent.",
      previewBtn: "See what will be sent",
      sendFull: "Send for check",
      sendWindow: "Send only these {n} s",
      cancel: "Don't send",
      previewNote: "This is the picture and sound that would be sent.",
      sending: "Sending to the AI and waiting for its check…",
      unavailable: "This check isn't available on this computer right now.",
      busy: "Busy with something else right now. Click again when it's done.",
      issues: "Done. Found {count} possible problem(s).",
      passed: "The check found no problems in these {n} seconds. This is only the AI's judgement — please watch it and listen to it yourself too.",
      noResult: "This check gave no result. That doesn't mean there's no problem.",
      prepareFailed: "These {n} seconds couldn't be got ready on this computer. Nothing was sent.",
      sendFailed: "The check didn't complete. It's not certain whether the content already reached them. That doesn't mean there's no problem.",
      rangeTooLong: "The range you marked is over 30 seconds, so this checks the {n} seconds around the playhead.",
      windowOnly: "Only these {n} seconds were checked, without the rest of the video.",
      truncated: "The whole video's text was too long, so only the part near these {n} seconds was included.",
      inLead: "(in the extra seconds just before)",
      jump: "Go here",
      fixed: "Fixed",
      fixedDone: "Marked as fixed",
      recheck: "Check again",
      close: "Close",
      suggestion: "Suggestion: {text}",
      type_speaker_swapped: "Speakers may be swapped",
      type_cut_jump: "This may join too abruptly",
      type_subtitle_mismatch: "Subtitles may not match what's said",
      type_audio: "The sound may have a problem",
      type_continuity: "The two parts may not follow on",
      type_other: "There may be a problem here",
    },
  };
  const TYPES = ["speaker_swapped", "cut_jump", "subtitle_mismatch", "audio", "continuity", "other"];
  const STATUSES = ["passed", "issues", "no_result"];

  function lang_(l) { return text[l] ? l : (String(l || "").startsWith("zh") ? "zh-CN" : "en"); }
  function t(lang, key, vars) {
    const s = text[lang_(lang)][key];
    if (s == null) throw new Error("review-check: no text " + key);
    return s.replace(/\{(\w+)\}/g, (m, k) => (vars && vars[k] != null ? String(vars[k]) : m));
  }
  const num = (v) => (typeof v === "number" && isFinite(v) ? v : null);
  const clip = (s, n) => (typeof s === "string" ? (s.length > n ? s.slice(0, n) + "…" : s) : "");
  /** 74.4 → "1:14"; one decimal under a minute's precision is not needed for 「跳到这里」. */
  function fmtTime(sec) {
    const s = Math.max(0, Math.floor(num(sec) || 0));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
    return (h ? h + ":" + String(m).padStart(2, "0") : String(m)) + ":" + String(r).padStart(2, "0");
  }
  const round1 = (v) => Math.round(v * 10) / 10;
  const secs = (v) => String(round1(v)).replace(/\.0$/, "");

  /** What 「检查这 10 秒」 checks: a marked IN–OUT of at most 30 s, else 10 s around the playhead, inside the timeline. */
  function pickRange({ time, duration, inPoint, outPoint } = {}) {
    const dur = num(duration);
    if (!dur || dur <= 0) return null;
    const a = num(inPoint), b = num(outPoint);
    if (a != null && b != null && b > a && b - a <= MAX_SPAN && a >= 0 && b <= dur + 1e-6)
      return { start: round1(a), end: round1(Math.min(b, dur)) };
    const span = Math.min(SPAN, dur);
    const tt = Math.min(Math.max(num(time) || 0, 0), dur);
    const start = Math.min(Math.max(tt - span / 2, 0), dur - span);
    return { start: round1(start), end: round1(Math.min(start + span, dur)) };
  }
  const spanOf = (r) => Math.max(1, Math.round(r.end - r.start));

  /** The receiver, as status / prepare report it. Both a name and a host, or nothing (then nothing can be sent). */
  function destinationOf(d) {
    if (!d || typeof d !== "object") return null;
    const service = clip(String(d.service || "").trim(), 60), host = clip(String(d.host || "").trim(), 120);
    if (!service || !host || /[\s/\\]/.test(host)) return null;
    return { service, host };
  }

  /** The confirm box. `canSend` is false without a destination or a token: the send buttons are then off. */
  function confirmModel(prep, lang, statusDest) {
    const range = prep && prep.range && num(prep.range.start) != null ? prep.range : null;
    const n = range ? spanOf(range) : SPAN;
    const ws = (prep && prep.willSend) || {};
    const dest = destinationOf(ws.destination) || destinationOf(statusDest);
    const video = ws.video && num(ws.video.start) != null && num(ws.video.end) != null ? ws.video : range;
    const textInfo = ws.text || {};
    const lead = prep && prep.lead && num(prep.lead.start) != null && num(prep.lead.end) != null && prep.lead.end > prep.lead.start ? prep.lead : null;
    const lines = [t(lang, "intro", { n })];
    if (video) {
      lines.push(t(lang, "whatFull", { from: fmtTime(video.start), to: fmtTime(video.end), sec: secs(video.end - video.start),
        chars: Math.max(0, Math.round(num(textInfo.subtitleChars) || 0)), cuts: Math.max(0, Math.round(num(textInfo.cutPoints) || 0)) }));
      if (lead) lines.push(t(lang, "whatFullLead", { from: fmtTime(lead.start), lead: fmtTime(lead.end), leadSec: secs(lead.end - lead.start) }));
      // 「只发这 10 秒」: the same picture and sound (the lead included), no whole-video text
      lines.push(t(lang, "whatWindow", { n, from: fmtTime(video.start), to: fmtTime(video.end), sec: secs(video.end - video.start) }));
    }
    const canSend = !!(dest && prep && prep.reviewId && prep.sendToken);
    return {
      title: t(lang, "title", { n }), n, lines,
      to: dest ? t(lang, "to", dest) : t(lang, "noDestination"),
      training: t(lang, "training"),
      destination: dest, canSend,
      buttons: [
        { id: "preview", label: t(lang, "previewBtn"), enabled: !!(prep && prep.reviewId) },
        { id: "full", label: t(lang, "sendFull"), enabled: canSend },
        { id: "window", label: t(lang, "sendWindow", { n }), enabled: canSend },
        { id: "cancel", label: t(lang, "cancel"), enabled: true },
      ],
    };
  }

  /** The engine's answer, checked: three statuses only, findings with a time on the timeline, text cut to length. */
  function cleanResult(r) {
    if (!r || typeof r !== "object") return { status: "no_result", reason: "BAD_OUTPUT", findings: [] };
    const status = STATUSES.includes(r.status) ? r.status : "no_result";
    const findings = (Array.isArray(r.findings) ? r.findings : []).slice(0, 50).map((f, i) => ({
      id: Number.isInteger(f && f.id) ? f.id : i,
      t: num(f && f.t),
      type: TYPES.includes(f && f.type) ? f.type : "other",
      text: clip(f && f.text, 200), suggestion: clip(f && f.suggestion, 200),
      inLead: !!(f && f.inLead === true), mark: f && typeof f.mark === "string" ? clip(f.mark, 20) : null,
    })).filter((f) => f.t != null);
    return { reviewId: typeof r.reviewId === "string" ? r.reviewId : null, status, reason: typeof r.reason === "string" ? clip(r.reason, 30) : null,
      scope: r.scope === "window" ? "window" : "full", contextTruncated: r.contextTruncated === true,
      range: r.range && num(r.range.start) != null && num(r.range.end) != null ? { start: r.range.start, end: r.range.end } : null,
      summary: clip(r.summary, 600), findings };
  }

  /** What the result box says. A pass only when the engine said passed and nothing inside the checked stretch was found. */
  function resultModel(raw, lang, n) {
    const r = cleanResult(raw);
    const span = n || (r.range ? spanOf(r.range) : SPAN);
    const main = r.findings.filter((f) => !f.inLead);
    let status = r.status;
    if (status === "passed" && main.length) status = "issues";
    if (status === "issues" && !r.findings.length) status = "no_result";   // 「有问题」 with nothing to show is no answer
    const notes = [];
    let headline;
    if (status === "no_result") headline = r.reason === "NO_BRIDGE" ? t(lang, "unavailable") : r.reason === "BUSY" ? t(lang, "busy") : t(lang, "noResult");
    else if (status === "passed") headline = t(lang, "passed", { n: span });
    else headline = t(lang, "issues", { count: main.length || r.findings.length });
    if (status !== "no_result" && r.scope === "window") notes.push(t(lang, "windowOnly", { n: span }));
    if (status !== "no_result" && r.contextTruncated) notes.push(t(lang, "truncated", { n: span }));
    const items = r.findings.slice().sort((a, b) => a.t - b.t).map((f) => ({
      id: f.id, t: f.t, time: fmtTime(f.t), label: t(lang, "type_" + f.type) + (f.inLead ? t(lang, "inLead") : ""),
      detail: f.text, suggestion: f.suggestion ? t(lang, "suggestion", { text: f.suggestion }) : "", inLead: f.inLead, mark: f.mark,
    }));
    return { status, passed: status === "passed", headline, notes, items, reviewId: r.reviewId };
  }

  /** The page's own server, interface v0. A route that isn't there (an engine without #321) reads as 「not present」. */
  function httpApi(fetchImpl) {
    const f = fetchImpl || (typeof fetch === "function" ? fetch.bind(globalThis) : null);
    const post = async (path, body) => {
      const res = await f(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}), cache: "no-store" });
      let j = null;
      try { j = await res.json(); } catch { j = null; }
      if (!res.ok) { const e = new Error((j && j.error) || "HTTP " + res.status); e.status = res.status; e.code = j && j.code; e.body = j; throw e; }
      return j;
    };
    return {
      async status() {
        let res;
        try { res = await f("/api/review/status", { cache: "no-store" }); } catch { return null; }
        if (!res.ok) return null;
        let j; try { j = await res.json(); } catch { return null; }
        return j && typeof j.available === "boolean" ? j : null;
      },
      prepare: (b) => post("/api/review/prepare", b),
      async preview(reviewId) {
        const res = await f("/api/review/preview?id=" + encodeURIComponent(reviewId), { cache: "no-store" });
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      },
      send: (b) => post("/api/review/send", b),
      cancel: (reviewId) => post("/api/review/cancel", { reviewId }),
      mark: (b) => post("/api/review/mark", b),
      prewarm: (b) => post("/api/review/prewarm", b),
    };
  }

  /** Only a same-origin managed preview is played; anything else from the server is refused. */
  function safePreviewSrc(j) {
    const s = j && typeof j.src === "string" ? j.src : "";
    return /^\/previews\/[\w.\-]+(\?[\w=&.\-]*)?$/.test(s) ? s : null;
  }

  /**
   * One check, as a small state machine (no DOM): idle → preparing → confirm → sending → result; any step → closed.
   * `send` can only run from `confirm` with a token and a destination, i.e. after the box with all three lines was shown.
   */
  function createSession(api, opts = {}) {
    const listeners = new Set();
    const s = { phase: "idle", range: null, prep: null, statusDest: null, result: null, raw: null, error: null, previewSrc: null, scope: null, gen: 0 };
    const emit = () => { for (const fn of listeners) fn(s); };
    const set = (patch) => { Object.assign(s, patch); emit(); };
    async function check(range, statusDest) {
      const gen = ++s.gen;
      set({ phase: "preparing", range, prep: null, statusDest: statusDest || null, result: null, raw: null, error: null, previewSrc: null, scope: null });
      let prep;
      try { prep = await api.prepare({ start: range.start, end: range.end }); }
      catch (e) {
        if (gen !== s.gen) return;
        const reason = e && e.code === "BUSY" ? "BUSY" : e && e.code === "NO_BRIDGE" ? "NO_BRIDGE" : "PREPARE_FAILED";
        set({ phase: "result", raw: { status: "no_result", reason, findings: [] } });
        return;
      }
      if (gen !== s.gen) { if (prep && prep.reviewId) api.cancel(prep.reviewId).catch(() => {}); return; }
      if (!prep || !prep.reviewId) { set({ phase: "result", raw: { status: "no_result", reason: "PREPARE_FAILED", findings: [] } }); return; }
      set({ phase: "confirm", prep });
    }
    async function preview() {
      if (s.phase !== "confirm" || !s.prep) return null;
      let src = null;
      try { src = safePreviewSrc(await api.preview(s.prep.reviewId)); } catch { src = null; }
      if (s.phase === "confirm") set({ previewSrc: src });
      return src;
    }
    async function send(scope) {
      if (s.phase !== "confirm" || !s.prep) return false;
      if (scope !== "full" && scope !== "window") return false;
      const m = confirmModel(s.prep, "zh-CN", s.statusDest);
      if (!m.canSend) return false;
      const gen = s.gen, prep = s.prep;
      set({ phase: "sending", scope });
      let raw;
      try { raw = await api.send({ reviewId: prep.reviewId, sendToken: prep.sendToken, scope }); }
      catch (e) { raw = { status: "no_result", reason: (e && e.code) || "SEND_FAILED", findings: [] }; }
      if (gen !== s.gen) return false;
      set({ phase: "result", raw: { ...raw, scope: raw && raw.scope ? raw.scope : scope } });
      return true;
    }
    async function cancel() {
      const prep = s.prep, phase = s.phase;
      s.gen++;
      set({ phase: "closed", previewSrc: null });
      if (prep && prep.reviewId && (phase === "confirm" || phase === "preparing")) { try { await api.cancel(prep.reviewId); } catch { /* the token runs out on its own */ } }
    }
    function close() {
      if (s.phase === "confirm" || s.phase === "preparing") return cancel();
      s.gen++;
      set({ phase: "closed", previewSrc: null });
    }
    async function markFixed(findingId) {
      const id = s.raw && s.raw.reviewId;
      if (!id) return false;
      try { await api.mark({ id, finding: findingId, mark: "fixed" }); } catch { return false; }
      const findings = (s.raw.findings || []).map((f) => (f && f.id === findingId ? { ...f, mark: "fixed" } : f));
      set({ raw: { ...s.raw, findings } });
      return true;
    }
    /** No check possible (no bridge on this computer, or one already running): say so, nothing is prepared or sent. */
    function noResult(range, reason) { s.gen++; set({ phase: "result", range, prep: null, previewSrc: null, raw: { status: "no_result", reason, findings: [] } }); }
    return { state: s, check, preview, noResult, send, cancel, close, markFixed, recheck: (statusDest) => (s.range ? check(s.range, statusDest || s.statusDest) : null),
      on(fn) { listeners.add(fn); return () => listeners.delete(fn); } };
  }

  /**
   * Prewarm once the playhead rests: `tick(time, playing, blocked)` from a timer; after `delay` ms at the same time, not
   * playing and not blocked (an export running, a check open), it asks the server to make that clip ahead of time —
   * on this computer, one at a time, never again for the same stretch until it changes.
   */
  function createPrewarmer({ api, delay = PREWARM_DELAY, now, range = (tm) => tm } = {}) {
    if (typeof now !== "function") now = () => Date.now();
    let lastT = null, since = 0, inFlight = false, doneKey = null;
    return {
      tick(time, playing, blocked) {
        const tt = num(time);
        if (tt == null || playing) { lastT = null; return false; }
        if (lastT == null || Math.abs(tt - lastT) > 1e-3) { lastT = tt; since = now(); return false; }
        if (blocked || inFlight || now() - since < delay) return false;
        const r = range(tt);
        if (!r) return false;
        const key = r.start + "-" + r.end;
        if (key === doneKey) return false;
        inFlight = true; doneKey = key;
        Promise.resolve().then(() => api.prewarm({ start: r.start, end: r.end })).catch(() => { doneKey = null; }).finally(() => { inFlight = false; });
        return true;
      },
      reset() { doneKey = null; },
    };
  }

  /** A stand-in for the engine (interface v0) until #325 and Cindy's step 1 are in: tests and nothing else. No network. */
  function stubApi(opts = {}) {
    const calls = [];
    const dest = opts.destination === undefined ? { service: "Gemini", host: "generativelanguage.googleapis.com" } : opts.destination;
    let n = 0;
    const live = new Map();
    const result = opts.result || ((scope, range) => ({ status: "issues", range, scope, revision: 8, findings: [
      { id: 0, t: range.start + 4.2, type: "speaker_swapped", text: "左边的人说话时，字幕标成了右边的名字。", suggestion: "把这两句字幕的说话人对调。", inLead: false, mark: null }],
    summary: "", windowDigest: "", contextTruncated: false }));
    return {
      calls,
      async status() { calls.push(["status"]); return opts.status || { available: true, destination: dest }; },
      async prepare(b) {
        calls.push(["prepare", b]);
        if (opts.prepareError) { const e = new Error(opts.prepareError); e.code = opts.prepareError; throw e; }
        const reviewId = "r_" + (++n), sendToken = "tok_" + n;
        const range = { start: b.start, end: b.end }, lead = b.start > 0 ? { start: Math.max(0, b.start - 1.5), end: b.start } : null;
        live.set(reviewId, { sendToken, range });
        return { reviewId, sendToken, expiresAt: "2026-11-14T00:10:00Z", range, lead, durationSec: b.end - (lead ? lead.start : b.start), bytes: 2_400_000, cacheHit: false,
          willSend: { video: { start: lead ? lead.start : b.start, end: b.end, sec: b.end - (lead ? lead.start : b.start) }, text: { scope: "full", subtitleChars: 1824, cutPoints: 37, truncated: false }, destination: dest } };
      },
      async preview(id) { calls.push(["preview", id]); return { src: "/previews/preview_" + id + ".mp4" }; },
      async send(b) {
        calls.push(["send", b]);
        const r = live.get(b.reviewId);
        if (!r || r.sendToken !== b.sendToken) { const e = new Error("bad token"); e.code = "TOKEN"; throw e; }
        live.delete(b.reviewId);
        return { reviewId: b.reviewId, source: "streamer", ...result(b.scope, r.range) };
      },
      async cancel(id) { calls.push(["cancel", id]); live.delete(id); return { ok: true }; },
      async mark(b) { calls.push(["mark", b]); if (b.mark === "passed") { const e = new Error("no"); e.status = 400; throw e; } return { ok: true }; },
      async prewarm(b) { calls.push(["prewarm", b]); return { queued: true }; },
    };
  }

  /* ── the page ── */
  function el(doc, tag, cls, txt) { const e = doc.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }

  /**
   * Wire the button and the box into the editor. env: {doc, button, lang(), time(), playing(), duration(), inOut(),
   * seek(t), blocked(), api?, setInterval?, now?}. Returns {session, refresh, prewarmer}.
   */
  function mount(env) {
    const doc = env.doc, api = env.api || httpApi(), btn = env.button;
    const session = createSession(api);
    let status = null;
    const L = () => lang_(env.lang ? env.lang() : "zh-CN");
    const rangeNow = () => pickRange({ time: env.time(), duration: env.duration(), ...(env.inOut ? env.inOut() : {}) });
    const prewarmer = createPrewarmer({ api, now: env.now, range: (tm) => pickRange({ time: tm, duration: env.duration(), ...(env.inOut ? env.inOut() : {}) }) });

    const overlay = el(doc, "div", "overlay hidden review-overlay");
    const box = el(doc, "div", "dialog review-dialog");
    box.setAttribute("role", "dialog"); box.setAttribute("aria-modal", "true"); box.id = "reviewDialog"; box.tabIndex = -1;
    overlay.appendChild(box);
    (doc.body || doc.documentElement).appendChild(overlay);

    function labelButton() {
      if (!btn) return;
      const r = rangeNow(), n = r ? spanOf(r) : SPAN;
      btn.textContent = t(L(), "button", { n });
      btn.title = t(L(), "buttonTip", { n });
      btn.disabled = !r;
    }
    async function refresh() {
      status = await api.status().catch(() => null);
      if (btn) btn.classList.toggle("hidden", !status);   // no review routes on this server: no button
      labelButton();
      return status;
    }
    function render(s) {
      const lang = L();
      box.textContent = "";
      if (s.phase === "idle" || s.phase === "closed") { overlay.classList.add("hidden"); return; }
      const opening = overlay.classList.contains("hidden");
      overlay.classList.remove("hidden");
      if (opening && typeof box.focus === "function") box.focus();
      const n = s.range ? spanOf(s.range) : SPAN;
      const h = el(doc, "h2", null, t(lang, "title", { n })); h.id = "reviewTitle"; box.setAttribute("aria-labelledby", "reviewTitle");
      box.appendChild(h);
      const actions = el(doc, "div", "dialog-actions review-actions");
      const add = (id, label, on, cls) => { const b = el(doc, "button", "btn" + (cls ? " " + cls : ""), label); b.dataset.review = id; b.addEventListener("click", on); actions.appendChild(b); return b; };
      if (s.phase === "preparing") {
        box.appendChild(el(doc, "p", "dim", t(lang, "preparing", { n })));
        add("cancel", t(lang, "cancel"), () => session.cancel());
      } else if (s.phase === "confirm") {
        const m = confirmModel(s.prep, lang, s.statusDest);
        for (const line of m.lines) box.appendChild(el(doc, "p", "review-line", line));
        const to = el(doc, "p", "review-to" + (m.destination ? "" : " review-warn"), m.to); to.dataset.review = "to"; box.appendChild(to);
        const tr = el(doc, "p", "review-training", m.training); tr.dataset.review = "training"; box.appendChild(tr);
        if (s.previewSrc) {
          const v = el(doc, "video", "review-preview"); v.controls = true; v.preload = "metadata"; v.src = s.previewSrc;
          box.appendChild(el(doc, "p", "dim", t(lang, "previewNote"))); box.appendChild(v);
        }
        for (const b of m.buttons) {
          const on = b.id === "preview" ? () => session.preview() : b.id === "cancel" ? () => session.cancel() : () => session.send(b.id);
          const node = add(b.id, b.label, on, b.id === "full" ? "primary" : "");
          node.disabled = !b.enabled;
        }
      } else if (s.phase === "sending") {
        box.appendChild(el(doc, "p", "dim", t(lang, "sending")));
      } else if (s.phase === "result") {
        const m = resultModel(s.raw, lang, n);
        const head = el(doc, "p", "review-headline review-" + m.status, m.headline); head.dataset.review = "headline"; box.appendChild(head);
        for (const note of m.notes) box.appendChild(el(doc, "p", "dim", note));
        if (m.items.length) {
          const ul = el(doc, "ul", "review-list");
          for (const it of m.items) {
            const li = el(doc, "li", "review-item" + (it.inLead ? " lead" : ""));
            const go = el(doc, "button", "btn review-jump", it.time + " " + it.label);
            go.dataset.review = "jump"; go.dataset.t = String(it.t);
            go.addEventListener("click", () => env.seek(it.t));
            li.appendChild(go);
            if (it.detail) li.appendChild(el(doc, "div", "dim review-detail", it.detail));
            if (it.suggestion) li.appendChild(el(doc, "div", "dim review-detail", it.suggestion));
            const row = el(doc, "div", "review-item-actions");
            const j = el(doc, "button", "btn review-small", t(lang, "jump")); j.addEventListener("click", () => env.seek(it.t)); row.appendChild(j);
            if (m.reviewId && !it.inLead) {
              const fx = el(doc, "button", "btn review-small", it.mark === "fixed" ? t(lang, "fixedDone") : t(lang, "fixed"));
              fx.dataset.review = "fixed"; fx.disabled = it.mark === "fixed";
              fx.addEventListener("click", () => session.markFixed(it.id));
              row.appendChild(fx);
            }
            li.appendChild(row); ul.appendChild(li);
          }
          box.appendChild(ul);
        }
        if (!(s.raw && s.raw.reason === "NO_BRIDGE")) add("recheck", t(lang, "recheck"), () => { void start(s.range); }, m.status === "passed" ? "" : "primary");
        add("close", t(lang, "close"), () => session.close());
      }
      box.appendChild(actions);
    }
    session.on(render);
    /** 「检查这 10 秒」 and 「重新检查」: the receiver is read again each time, never remembered from when the page opened. */
    async function start(r) {
      if (!r || session.state.phase === "preparing" || session.state.phase === "sending") return;
      await refresh();
      if (!status) return;
      if (!status.available) { session.noResult(r, status.reason === "BUSY" ? "BUSY" : "NO_BRIDGE"); return; }
      await session.check(r, status.destination);
    }
    if (btn) btn.addEventListener("click", () => { void start(rangeNow()); });
    overlay.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.stopPropagation(); void session.close(); } });
    const every = env.setInterval || ((fn, ms) => setInterval(fn, ms));
    every(() => {
      labelButton();
      const open = session.state.phase !== "idle" && session.state.phase !== "closed";
      if (status && status.available) prewarmer.tick(env.time(), env.playing(), open || (env.blocked ? env.blocked() : false));
    }, 500);
    void refresh();
    return { session, refresh, prewarmer, overlay, render: () => render(session.state) };
  }

  return { text, t, fmtTime, pickRange, destinationOf, confirmModel, cleanResult, resultModel, httpApi, safePreviewSrc,
    createSession, createPrewarmer, stubApi, mount, SPAN, MAX_SPAN, PREWARM_DELAY };
});
