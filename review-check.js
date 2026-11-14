/* 「检查这 10 秒」 (#321 step 2, Deja, 2026-11-14): the streamer's own check of a short stretch of the edit.
   Interface: Cindy's step 1, MontClip#328 (/api/review/*, docs/decisions/2026-11-14-video-bridge-outbound.md), with
   Deja's decisions (6867787475 and the #328 alignment). Spec: JJ v1 + v2 + v3 + v3.1, adopted by PG (6867587684). QQ's
   red line (PG 6867627361): before 「发送检查」 or 「只发这 10 秒」 the box shows what is sent, who receives it (the service
   and its domain, from the engine — with 「未验证」 beside a domain nobody confirmed) and that it may be used for training
   — every time, whatever the assistant's approval mode is. This file never reads that mode.

   The page itself goes nowhere but its own server:
     prepare  → makes the clip on this computer (no network); scope "full" (with this stretch's subtitles and cut points)
                or "window" (picture and sound only) is fixed here, so 「只发这 10 秒」 makes a clip of its own
     status   → polled until the clip is ready: willSend {to, requests, tasteNotes, seconds}, previewSrc, the one-time sendToken
     cancel   → 「不发了」, drops the token and the clip;  previewSrc → a same-origin /previews/… address to play
     send     → the only call that leads off this computer, and only from a click on one of the two send buttons.
   No prewarm (the next batch, B8). The answer is untrusted (it comes from a model): fixed fields, cut to length, drawn as
   text — never as HTML, never run. 「no_result」 is never shown as a pass; 「passed」 with a problem inside the checked stretch,
   or with any of the four dimensions not passed, is never shown as a pass. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.MontClipReviewCheck = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const SPAN = 10;          // seconds checked around the playhead
  const MIN_SPAN = 1;       // JJ #326: under 1 s can't be checked
  const MAX_SPAN = 30;      // JJ v1 R1b: a check is at most 30 s (an IN–OUT longer than that falls back to 10 s)

  // zh-CN: JJ's passes on #326 (6868600043, 6869383846; all passed on 82b09f82). 「10」 is {n}: a marked IN–OUT of 1–30 s
  // is checked as it is. Lines marked 「draft (#328)」 are new or changed for Cindy's step-1 interface (#328) and wait for JJ:
  // what is sent is now this stretch's subtitles (not the whole video's), there are no counts, taste notes go with both
  // buttons, an unconfirmed domain says 「未验证」, and the result has four dimensions. JJ's first pass on these
  // (6871754149) and second pass (6871859408: subtitles overlapping this stretch, whatTwice) are applied.
  // en: Rea's review on #326 (6869597666, 6869664676); for the #328 lines, Rea's provisional pass (6871768896) on 1678c837,
  // with whatTaste, unverifiedBlock, dimState_* and the two new finding types following JJ's later Chinese (6871754149).
  const text = {
    "zh-CN": {
      button: "检查这 {n} 秒",                                     // v2 §6
      buttonTip: "让 AI 看一看、听一听这 {n} 秒有没有问题。发出去之前会先给你看要发什么。",   // JJ #326
      tooShort: "这一段不到 1 秒，没法检查",                         // JJ #326 recheck 6869383846: the tip on the greyed-out button
      title: "检查这 {n} 秒",                                      // JJ #326: kept
      preparing: "正在这台电脑上准备这 {n} 秒，还没有发出去。",     // JJ #326: kept
      cancelPrep: "取消",                                           // JJ #326: the button while preparing
      // v3.1 §3 with one change (JJ #326 6871859408): the engine sends the subtitles overlapping this stretch, not the whole video's
      intro: "联网只发生在你自己打开的功能里，发之前先给你看。点「发送检查」后，这 {n} 秒的画面和声音，还有和这一段有重叠的字幕文字和剪辑时间点，会发给 AI 做检查，可能用于训练。",   // JJ #326 6871859408
      whatFull: "点「发送检查」会发出去：{from}–{to} 的画面和声音（{sec} 秒），和这一段有重叠的字幕文字、剪辑时间点。",   // JJ #326 6871859408: a subtitle across the edge goes whole
      whatFullLead: "两个按钮发的画面和声音里，都有前面多带的 {leadSec} 秒（{from}–{lead}），让 AI 知道前面在说什么。",   // JJ #326 (after whatWindow)
      whatWindow: "点「只发这 {n} 秒」会发出去：{from}–{to} 的画面和声音（{sec} 秒），不发字幕文字和剪辑时间点。",   // JJ #326: no 只 — whatTaste says the examples
      whatTaste: "两个按钮都会把之前记下的 {k} 条好坏例子（认可的和不认可的）一起发出去。",   // JJ #326 6871754149: willSend.tasteNotes
      whatTwice: "会分 {k} 次发出去，第一次只有画面和声音，后面几次会多带上面说的其余内容。",   // JJ #326 6871859408: willSend.requests > 1 (#328: 1 or 2; two_pass looks blind first)
      whatDanmaku: "画面里如果有观众昵称、弹幕，会原样发出去。",       // JJ #326
      to: "发给：{service}（{host}）",                             // Deja 6867787475; JJ #326: kept
      toUnverified: "发给：{service}（{host}，未验证）",            // Deja (#328): an unconfirmed domain is never shown as confirmed
      unverifiedBlock: "这个地址还没有人确认过，所以先不发。请等有人确认后再试。",        // JJ #326 6871754149: the engine refuses until the owner confirms it
      training: "对方可能用这段内容训练模型",                       // Deja 6867787475; JJ #326: kept
      noDestination: "不知道这次会发到哪里，所以先不发。",           // JJ #326: kept
      noPayload: "说不清这次具体会发出去什么，所以先不发。",           // JJ #326 recheck: passed
      changedRecheck: "要发的内容和刚才说的不一样了，请再看一遍再决定。",   // JJ #326 6871754149 passed: 「只发这 10 秒」 made a clip that differs
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
      insufficient: "这次有的方面没法判断，没有检查出结果。这不代表没问题。",   // JJ #326 6871754149: no_result INSUFFICIENT_EVIDENCE
      prepareFailed: "这 {n} 秒没能在这台电脑上准备好，什么都没有发出去。",   // JJ #326
      sendFailed: "检查没做成。不确定内容有没有已经发到对方那边。这不代表没问题。",   // JJ #326
      rangeTooLong: "你标的范围超过 30 秒，这次检查的是播放头附近的 {n} 秒。",   // JJ #326
      windowOnly: "这次只检查了这 {n} 秒，没有结合字幕文字。",          // JJ #326 6871754149 passed: window scope sends no subtitles
      textGone: "这条记录的原话没有保存，只剩时间和类别。",             // JJ #326 6871754149 passed: textAvailable:false after a restart
      dimLine: "{label}：{state}",                                   // JJ #326 6871754149 passed: the four dimensions
      dimReason: "。{text}",
      dim_fact: "人和事",                                           // JJ #326 6871754149 passed: fact — who is who, what was said
      dim_subtitle: "字幕",                                          // JJ #326 6871754149 passed
      dim_pacing: "节奏",                                            // JJ #326 6871754149 passed
      dim_packaging: "包装（花字、名牌）",                              // JJ #326 6871754149 passed
      dimState_passed: "没发现问题",                                  // JJ #326 6871754149 passed
      dimState_issues: "可能有问题",                                 // JJ #326 6871754149
      dimState_insufficient_evidence: "没法判断",                     // JJ #326 6871754149
      dimState_unknown: "没有结论",                                   // JJ #326 6871754149: a dimension the answer left out
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
      type_over_explained_caption: "这里的花字可能说得太多了（画面和声音已经讲清楚了）",   // JJ #326 6871754149
      type_punchline_spoiled: "笑点可能被提前说破了",                  // JJ #326 6871754149 passed
      type_protected_region_occluded: "可能挡住了不该挡的内容（比如公屏弹幕）",   // JJ #326 6871754149
      type_other: "这里可能有问题",                                  // JJ #326: kept
    },
    en: {
      button: "Check these {n} s",
      buttonTip: "Have AI watch and listen to these {n} seconds for problems. You'll see what will be sent before anything is sent.",
      tooShort: "This stretch is under 1 second, so it can't be checked",
      title: "Check these {n} seconds",
      preparing: "Getting these {n} seconds ready on this computer. Nothing has been sent.",
      cancelPrep: "Cancel",
      intro: "Only features you open yourself connect to the internet. You'll see what will be sent first. When you click “Send for a check”, the picture and sound of these {n} seconds, along with the subtitle text overlapping this section and the cut points, will be sent to AI for a check and may be used for training.",
      whatFull: "Clicking “Send for a check” will send: picture and sound from {from} to {to} ({sec} s), and the subtitle text overlapping this section, plus the cut points.",
      whatFullLead: "With either button, the picture and sound include an extra {leadSec} s before the checked section ({from} to {lead}), to give the AI context about what was being said.",
      whatWindow: "Clicking “Send only these {n} s” will send picture and sound from {from} to {to} ({sec} s). It will not send subtitle text or cut points.",
      whatTaste: "Either button also sends the {k} saved examples of good and bad edits (ones approved and ones rejected).",
      whatTwice: "This will be sent {k} times: the first time with only the picture and sound, and the later times also with the other content described above.",
      whatDanmaku: "Viewer names and chat messages in the picture are sent as they are.",
      to: "Send to: {service} ({host})",
      toUnverified: "Send to: {service} ({host}, not verified)",
      unverifiedBlock: "Nobody has confirmed this address yet, so nothing will be sent. Please try again once someone has confirmed it.",
      training: "They may use this content to train models",
      noDestination: "It isn't clear where this would be sent, so nothing will be sent.",
      noPayload: "It isn't clear exactly what this would send, so nothing will be sent.",
      changedRecheck: "What will be sent is different from what was described earlier. Please check it again before deciding.",
      previewBtn: "See what will be sent",
      sendFull: "Send for a check",
      sendWindow: "Send only these {n} s",
      cancel: "Don't send",
      previewNote: "This is the picture and sound that would be sent.",
      sending: "Sending to the AI and waiting for the check. Please wait…",
      unavailable: "This check isn't available on this computer right now.",
      busy: "Busy with something else right now. Click again when it's done.",
      issues: "Done. Found {count} possible problem(s).",
      passed: "The check found no problems in these {n} seconds. This is only the AI's judgement — please watch it and listen to it yourself too.",
      noResult: "This check gave no result. That doesn't mean there's no problem.",
      insufficient: "Some things couldn't be judged, so this check gave no result. That doesn't mean there's no problem.",
      prepareFailed: "Couldn't prepare these {n} seconds on this computer. Nothing was sent.",
      sendFailed: "The check didn't complete. It's not certain whether the content already reached them. That doesn't mean there's no problem.",
      rangeTooLong: "The range you marked is over 30 seconds, so this checks the {n} seconds around the playhead.",
      windowOnly: "Only these {n} seconds were checked, without the subtitle text.",
      textGone: "The original text of this record wasn't saved; only timestamps and categories remain.",
      dimLine: "{label}: {state}",
      dimReason: ". {text}",
      dim_fact: "People and events",
      dim_subtitle: "Subtitles",
      dim_pacing: "Pacing",
      dim_packaging: "On-screen graphics (styled text, name labels)",
      dimState_passed: "no problems found",
      dimState_issues: "possible problems",
      dimState_insufficient_evidence: "couldn't be judged",
      dimState_unknown: "no conclusion provided",
      inLead: "(in the extra seconds just before)",
      jump: "Go here",
      fixed: "Fixed",
      fixedDone: "Marked as fixed",
      recheck: "Check again",
      close: "Close",
      suggestion: "Suggestion: {text}",
      type_speaker_swapped: "The speaker labels may be swapped",
      type_cut_jump: "The cut here may feel too abrupt",
      type_subtitle_mismatch: "Subtitles may not match what's said",
      type_audio: "The sound may have a problem",
      type_continuity: "The two sections may not connect smoothly",
      type_over_explained_caption: "The added on-screen text here may say too much (the picture and sound already make it clear)",
      type_punchline_spoiled: "The punchline may be given away early",
      type_protected_region_occluded: "Something that shouldn't be covered may be covered (such as on-screen chat)",
      type_other: "There may be a problem here",
    },
  };
  const TYPES = ["speaker_swapped", "cut_jump", "subtitle_mismatch", "audio", "continuity", "over_explained_caption", "punchline_spoiled",
    "protected_region_occluded", "other"];   // #328 video-bridge.js FINDING_TYPES
  const DIMENSIONS = ["fact", "subtitle", "pacing", "packaging"];             // #328 video-bridge.js DIMENSIONS
  const DIM_STATES = ["passed", "issues", "insufficient_evidence"];
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

  /**
   * What 「检查这 10 秒」 checks: a marked IN–OUT of 1–30 s as it is, else 10 s around the playhead, inside the timeline.
   * A marked IN–OUT over 30 s falls back to the playhead and says so (`fellBack`, JJ #326 rangeTooLong); a stretch
   * under 1 s — marked, or the whole timeline — can't be checked (null: the button is off).
   */
  function pickRange({ time, duration, inPoint, outPoint } = {}) {
    const dur = num(duration);
    if (!dur || dur < MIN_SPAN) return null;
    const a = num(inPoint), b = num(outPoint);
    const marked = a != null && b != null && b > a && a >= 0 && b <= dur + 1e-6;
    if (marked && b - a < MIN_SPAN) return null;
    if (marked && b - a <= MAX_SPAN) return { start: round1(a), end: round1(Math.min(b, dur)) };
    const span = Math.min(SPAN, dur);
    const tt = Math.min(Math.max(num(time) || 0, 0), dur);
    const start = Math.min(Math.max(tt - span / 2, 0), dur - span);
    const r = { start: round1(start), end: round1(Math.min(start + span, dur)) };
    return marked ? { ...r, fellBack: true } : r;
  }
  /** The whole seconds the button, the title and every 「这 N 秒」 say — and {sec} too when there is no lead (JJ #326). */
  const spanOf = (r) => Math.max(1, Math.round(r.end - r.start));

  const span_ = (r) => (r && typeof r === "object" && num(r.start) != null && num(r.end) != null && r.start >= 0 && r.end > r.start ? r : null);
  const near_ = (a, b, eps = 0.011) => Math.abs(a - b) <= eps;   // the engine rounds seconds to 2 decimals
  const count_ = (v) => (Number.isInteger(v) && v >= 0 ? v : null);
  /**
   * What the engine says will be sent (#328: status → willSend {what, to, requests, tasteNotes, seconds}), checked field by
   * field (QQ #326 item 1): the checked range, the lead before it, the scope, and that the seconds sent are exactly lead +
   * range. Anything missing or odd → null: the box can't say what goes, so nothing can be sent. Never filled in from the
   * request or with 0. `what` is the engine's own English sentence and is not shown; the box says it from these fields.
   */
  function payloadOf(view) {
    const range = span_(view && view.range), ws = view && view.willSend;
    if (!range || !ws || typeof ws !== "object") return null;
    const lead = num(view.lead), seconds = num(ws.seconds), requests = count_(ws.requests), taste = count_(ws.tasteNotes);
    if (lead == null || lead < 0 || lead > range.start + 1e-6 || seconds == null || requests == null || requests < 1 || taste == null) return null;
    if (view.scope !== "full" && view.scope !== "window") return null;
    // QQ #326 (5900512724 item 1): the clip is exactly the lead + the range — nothing unnamed before or after
    if (!near_(seconds, range.end - range.start + lead)) return null;
    const video = { start: range.start - lead, end: range.end };
    return { range, video, lead: lead > 0 ? { start: video.start, end: range.start } : null, scope: view.scope, requests, taste, seconds };
  }

  /** The receiver, as the engine reports it: a name and a host, and whether anyone confirmed that host (#328: verified). */
  function destinationOf(d) {
    if (!d || typeof d !== "object") return null;
    const service = clip(String(d.service || "").trim(), 60), host = clip(String(d.host || "").trim(), 120);
    if (!service || !host || /[\s/\\]/.test(host)) return null;
    return { service, host, verified: d.verified === true };
  }
  /** 「发给：…」 — with 「未验证」 next to the domain unless the engine says it was confirmed (Deja, #328: never shown as confirmed). */
  const toLine = (lang, dest) => (dest ? t(lang, dest.verified ? "to" : "toUnverified", dest) : t(lang, "noDestination"));

  /** The confirm box. `canSend` needs a full description of what is sent, a confirmed destination and a token. */
  function confirmModel(view, lang, opts = {}) {
    const pay = payloadOf(view);
    const range = pay ? pay.range : span_(view && view.range);
    const n = range ? spanOf(range) : SPAN;
    const dest = destinationOf(view && view.willSend && view.willSend.to);
    const lines = [];
    if (opts.fellBack) lines.push(t(lang, "rangeTooLong", { n }));
    lines.push(t(lang, "intro", { n }));
    if (opts.changed) lines.push(t(lang, "changedRecheck"));
    if (pay) {
      const v = pay.video, sec = pay.lead ? secs(v.end - v.start) : String(n);
      const at = { n, from: fmtTime(v.start), to: fmtTime(v.end), sec };
      if (pay.scope === "full") lines.push(t(lang, "whatFull", at));
      lines.push(t(lang, "whatWindow", at));
      if (pay.lead) lines.push(t(lang, "whatFullLead", { from: fmtTime(pay.lead.start), lead: fmtTime(pay.lead.end), leadSec: secs(pay.lead.end - pay.lead.start) }));
      if (pay.taste) lines.push(t(lang, "whatTaste", { k: pay.taste }));
      if (pay.requests > 1) lines.push(t(lang, "whatTwice", { k: pay.requests }));
      lines.push(t(lang, "whatDanmaku"));
    } else lines.push(t(lang, "noPayload"));
    if (dest && !dest.verified) lines.push(t(lang, "unverifiedBlock"));
    const token = view && typeof view.sendToken === "string" && view.sendToken ? view.sendToken : null;
    const id = view && typeof view.reviewId === "string" && view.reviewId ? view.reviewId : null;
    const canSend = !!(pay && dest && dest.verified && id && token && view.state === "ready");
    return {
      title: t(lang, "title", { n }), n, lines, payload: pay,
      blocked: !pay ? "noPayload" : !dest ? "noDestination" : !dest.verified ? "unverified" : null,
      to: toLine(lang, dest), warn: !dest || !dest.verified,
      training: t(lang, "training"),
      destination: dest, canSend,
      buttons: [
        { id: "preview", label: t(lang, "previewBtn"), enabled: !!(canSend && safePreviewSrc(view && view.previewSrc)) },
        { id: "full", label: t(lang, "sendFull"), enabled: !!(canSend && pay.scope === "full") },
        { id: "window", label: t(lang, "sendWindow", { n }), enabled: canSend },
        { id: "cancel", label: t(lang, "cancel"), enabled: true },
      ],
    };
  }

  /** prepare refused because nobody confirmed where it goes (#328: 409 DESTINATION_UNVERIFIED): nothing was made, nothing goes. */
  function unverifiedModel(dest, lang, range) {
    const d = destinationOf(dest), n = range ? spanOf(range) : SPAN;
    return { title: t(lang, "title", { n }), n, lines: [t(lang, "intro", { n }), t(lang, "unverifiedBlock")],
      to: toLine(lang, d ? { ...d, verified: false } : null), warn: true, training: t(lang, "training"), destination: d, canSend: false,
      buttons: [
        { id: "preview", label: t(lang, "previewBtn"), enabled: false },
        { id: "full", label: t(lang, "sendFull"), enabled: false },
        { id: "window", label: t(lang, "sendWindow", { n }), enabled: false },
        { id: "cancel", label: t(lang, "cancel"), enabled: true },
      ] };
  }

  /** The engine's answer (#328 record), checked: three statuses, findings with a time on the timeline, four dimensions, text cut. */
  function cleanResult(r) {
    if (!r || typeof r !== "object") return { status: "no_result", reason: "BAD_OUTPUT", findings: [], dimensions: null, textAvailable: true };
    const status = STATUSES.includes(r.status) ? r.status : "no_result";
    const findings = (Array.isArray(r.findings) ? r.findings : []).slice(0, 50).map((f, i) => ({
      id: Number.isInteger(f && f.id) ? f.id : i,
      t: num(f && f.t),
      type: TYPES.includes(f && f.type) ? f.type : "other",
      text: clip(f && f.text, 200), suggestion: clip(f && f.suggestion, 200),
      inLead: !!(f && f.inLead === true), mark: f && typeof f.mark === "string" ? clip(f.mark, 20) : null,
    })).filter((f) => f.t != null);
    let dimensions = null;
    if (r.dimensions && typeof r.dimensions === "object") {
      dimensions = {};
      for (const k of DIMENSIONS) {
        const d = r.dimensions[k];
        dimensions[k] = { state: d && DIM_STATES.includes(d.state) ? d.state : null, reason: clip(d && d.reason, 200) };
      }
    }
    return { reviewId: typeof r.reviewId === "string" ? r.reviewId : null, status, reason: typeof r.reason === "string" ? clip(r.reason, 30) : null,
      scope: r.scope === "window" ? "window" : "full", textAvailable: r.textAvailable !== false,
      range: r.range && num(r.range.start) != null && num(r.range.end) != null ? { start: r.range.start, end: r.range.end } : null,
      summary: clip(r.summary, 600), findings, dimensions };
  }

  /** What the result box says. A pass only when the engine said passed, all four dimensions passed and nothing inside the checked stretch was found. */
  function resultModel(raw, lang, n, opts = {}) {
    const r = cleanResult(raw);
    const span = n || (r.range ? spanOf(r.range) : SPAN);
    const main = r.findings.filter((f) => !f.inLead);
    const dimIssue = !!(r.dimensions && DIMENSIONS.some((k) => r.dimensions[k].state === "issues"));
    const allPassed = !!(r.dimensions && DIMENSIONS.every((k) => r.dimensions[k].state === "passed"));
    let status = r.status;
    if (status === "passed" && (main.length || !allPassed)) status = main.length || dimIssue ? "issues" : "no_result";
    if (status === "issues" && !r.findings.length && !dimIssue) status = "no_result";   // 「有问题」 with nothing to show is no answer
    const notes = opts.fellBack ? [t(lang, "rangeTooLong", { n: span })] : [];
    let headline;
    // a send that was called and failed may have reached the receiver: that comes first, whatever its code says (QQ #326 5900512724 item 2)
    if (status === "no_result") headline = raw && raw.sendError === true ? t(lang, "sendFailed")
      : r.reason === "NO_BRIDGE" ? t(lang, "unavailable") : r.reason === "BUSY" ? t(lang, "busy")
      : r.reason === "PREPARE_FAILED" ? t(lang, "prepareFailed", { n: span })
      : r.reason === "INSUFFICIENT_EVIDENCE" ? t(lang, "insufficient") : t(lang, "noResult");
    else if (status === "passed") headline = t(lang, "passed", { n: span });
    else headline = t(lang, "issues", { count: main.length || r.findings.length || DIMENSIONS.filter((k) => r.dimensions[k].state === "issues").length });
    if (status !== "no_result" && r.scope === "window") notes.push(t(lang, "windowOnly", { n: span }));
    if (!r.textAvailable) notes.push(t(lang, "textGone"));
    const dims = r.dimensions && !(raw && raw.sendError === true) ? DIMENSIONS.map((k) => ({ key: k, state: r.dimensions[k].state,
      line: t(lang, "dimLine", { label: t(lang, "dim_" + k), state: t(lang, "dimState_" + (r.dimensions[k].state || "unknown")) })
        + (r.dimensions[k].reason ? t(lang, "dimReason", { text: r.dimensions[k].reason }) : "") })) : [];
    const items = r.findings.slice().sort((a, b) => a.t - b.t).map((f) => ({
      id: f.id, t: f.t, time: fmtTime(f.t), label: t(lang, "type_" + f.type) + (f.inLead ? t(lang, "inLead") : ""),
      detail: f.text, suggestion: f.suggestion ? t(lang, "suggestion", { text: f.suggestion }) : "", inLead: f.inLead, mark: f.mark,
    }));
    return { status, passed: status === "passed", headline, notes, dims, items, reviewId: r.reviewId };
  }

  /** Only a same-origin managed preview is played; anything else from the server is refused. */
  function safePreviewSrc(src) {
    const s = typeof src === "string" ? src : src && typeof src.src === "string" ? src.src : "";
    return /^\/previews\/[\w.%\-]+(\?[\w=&.\-]*)?$/.test(s) ? s : null;
  }

  /** The page's own server, #328's /api/review/* routes. A route that isn't there (an engine without #321) reads as 「not present」. */
  function httpApi(fetchImpl) {
    const f = fetchImpl || (typeof fetch === "function" ? fetch.bind(globalThis) : null);
    const req = async (path, init) => {
      const res = await f(path, { cache: "no-store", ...init });
      let j = null;
      try { j = await res.json(); } catch { j = null; }
      if (!res.ok) { const e = new Error((j && j.error) || "HTTP " + res.status); e.status = res.status; e.code = j && j.code; e.body = j; throw e; }
      return j;
    };
    const post = (path, body) => req(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}) });
    return {
      /** the routes are there (GET /api/review/taste answers on any engine with #328); says nothing about the bridge */
      async available() {
        try { const res = await f("/api/review/taste", { cache: "no-store" }); return !!res.ok; } catch { return false; }
      },
      prepare: (b) => post("/api/review/prepare", b),
      status: (id) => req("/api/review/status?id=" + encodeURIComponent(id)),
      send: (id, token) => post("/api/review/send", { id, token }),
      cancel: (id) => post("/api/review/cancel", { id }),
      mark: (b) => post("/api/review/mark", b),
    };
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const errReason = (e) => {
    const c = e && e.code;
    return c === "BUSY" || c === "NO_BRIDGE" || c === "DESTINATION_UNVERIFIED" ? c : "PREPARE_FAILED";
  };

  /**
   * One check, as a small state machine (no DOM): idle → preparing → confirm → sending → result; any step → closed;
   * preparing → unverified when the engine refuses because nobody confirmed the receiver (#328 DESTINATION_UNVERIFIED).
   * `send` can only run from `confirm` with a token and a confirmed destination, i.e. after the box with all lines was shown.
   */
  function createSession(api, opts = {}) {
    const pollMs = opts.pollMs == null ? 400 : opts.pollMs, wait = opts.wait || sleep;
    const listeners = new Set();
    const s = { phase: "idle", range: null, prep: null, raw: null, previewSrc: null, scope: null, dest: null, changed: false, gen: 0 };
    const emit = () => { for (const fn of listeners) fn(s); };
    const set = (patch) => { Object.assign(s, patch); emit(); };
    /** prepare (renders on this computer, nothing leaves), then read the status until the clip is ready → the view, or why not */
    async function prepareView(range, scope, gen) {
      let v;
      try { v = await api.prepare({ start: range.start, end: range.end, scope }); }
      catch (e) { return gen !== s.gen ? { stale: true } : { failed: errReason(e), dest: e && e.body && e.body.destination }; }
      if (gen !== s.gen) { if (v && v.reviewId) api.cancel(v.reviewId).catch(() => {}); return { stale: true }; }
      if (!v || typeof v.reviewId !== "string") return { failed: "PREPARE_FAILED" };
      s.prep = v;   // what 「不发了」 cancels while it renders
      while (v && v.state === "rendering") {
        await wait(pollMs);
        if (gen !== s.gen) return { stale: true };
        try { v = await api.status(v.reviewId); } catch { return { failed: "PREPARE_FAILED" }; }
        if (gen !== s.gen) return { stale: true };
      }
      if (!v || v.state !== "ready") return { failed: "PREPARE_FAILED" };
      return { view: v };
    }
    function fail(reason, dest) {
      if (reason === "DESTINATION_UNVERIFIED") set({ phase: "unverified", prep: null, dest: dest || null });
      else set({ phase: "result", prep: null, raw: { status: "no_result", reason, findings: [] } });
    }
    async function check(range) {
      const gen = ++s.gen;
      set({ phase: "preparing", range, prep: null, raw: null, previewSrc: null, scope: null, dest: null, changed: false });
      const got = await prepareView(range, "full", gen);
      if (got.stale || gen !== s.gen) return;
      if (got.failed) return fail(got.failed, got.dest);
      set({ phase: "confirm", prep: got.view });
    }
    function preview() {
      if (s.phase !== "confirm" || !s.prep) return null;
      const src = safePreviewSrc(s.prep.previewSrc);   // the clip that was made for this box: the one the send buttons send
      set({ previewSrc: src });
      return src;
    }
    /** 「只发这 10 秒」 needs the clip without the project's text, which is a check of its own (#328: scope is fixed at prepare). */
    async function switchToWindow(gen) {
      const old = s.prep;
      set({ phase: "preparing", previewSrc: null });
      api.cancel(old.reviewId).catch(() => {});
      const got = await prepareView(s.range, "window", gen);
      if (got.stale || gen !== s.gen) return null;
      if (got.failed) { fail(got.failed, got.dest); return null; }
      const a = payloadOf(old), b = payloadOf(got.view);
      const da = destinationOf(old.willSend && old.willSend.to), db = destinationOf(got.view.willSend && got.view.willSend.to);
      // what 「只发这 10 秒」 said in the box is what goes: the same seconds, receiver, number of requests and notes — else show the box again
      const same = !!(a && b && b.scope === "window" && near_(a.video.start, b.video.start) && near_(a.video.end, b.video.end) && a.requests === b.requests
        && a.taste === b.taste && da && db && da.service === db.service && da.host === db.host && da.verified && db.verified);
      if (!same) { set({ phase: "confirm", prep: got.view, changed: true }); return null; }
      s.prep = got.view;
      return got.view;
    }
    async function send(scope) {
      if (s.phase !== "confirm" || !s.prep) return false;
      if (scope !== "full" && scope !== "window") return false;
      const m = confirmModel(s.prep, "zh-CN");
      const btn = m.buttons.find((b) => b.id === scope);
      if (!m.canSend || !btn || !btn.enabled) return false;
      const gen = s.gen;
      let view = s.prep;
      if (scope === "window" && view.scope !== "window") { view = await switchToWindow(gen); if (!view) return false; }
      if (gen !== s.gen) return false;
      set({ phase: "sending", scope, previewSrc: null });
      let raw;
      try { raw = await api.send(view.reviewId, view.sendToken); }
      // the request itself failed: it may or may not have reached the receiver (JJ #326 sendFailed) — never 「没发出去」
      catch (e) { raw = { status: "no_result", reason: (e && e.code) || "SEND_FAILED", sendError: true, findings: [] }; }
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
      const raw = s.raw, gen = s.gen, id = raw && raw.reviewId;   // QQ #326 item 4: only the result it was written for
      if (!id || s.phase !== "result") return false;
      try { await api.mark({ id, finding: findingId, mark: "fixed" }); } catch { return false; }
      if (gen !== s.gen || s.phase !== "result" || s.raw !== raw) return false;
      const findings = (raw.findings || []).map((f) => (f && f.id === findingId ? { ...f, mark: "fixed" } : f));
      set({ raw: { ...raw, findings } });
      return true;
    }
    return { state: s, check, preview, send, cancel, close, markFixed, recheck: () => (s.range ? check(s.range) : null),
      on(fn) { listeners.add(fn); return () => listeners.delete(fn); } };
  }

  /** A stand-in for the engine (#328's /api/review/* shapes): tests and nothing else. No network. */
  function stubApi(opts = {}) {
    const calls = [];
    const dest = opts.destination === undefined ? { service: "Google Gemini", host: "daily-cloudcode-pa.googleapis.com", source: "owner-confirmed", verified: true } : opts.destination;
    let n = 0;
    const live = new Map();
    const result = opts.result || ((scope, range) => ({ status: "issues", range, scope, findings: [
      { id: 0, t: range.start + 4.2, type: "speaker_swapped", text: "左边的人说话时，字幕标成了右边的名字。", suggestion: "把这两句字幕的说话人对调。", inLead: false, mark: null }],
    dimensions: { fact: { state: "issues", reason: "名牌和说话的人对不上。" }, subtitle: { state: "passed", reason: "" }, pacing: { state: "passed", reason: "" }, packaging: { state: "passed", reason: "" } },
    summary: "", textAvailable: true }));
    const view = (r) => ({ reviewId: r.id, state: r.state, range: r.range, lead: r.lead, scope: r.scope, mode: "single",
      willSend: r.state === "ready" ? { what: "a short video clip (with its sound) of this stretch", to: dest, requests: 1, tasteNotes: opts.taste || 0,
        seconds: +(r.range.end - r.range.start + r.lead).toFixed(2), tokenExpiresAt: "2026-11-14T00:10:00Z" } : undefined,
      previewSrc: r.state === "ready" ? "/previews/preview_" + r.id + ".mp4" : undefined,
      sendToken: r.state === "ready" ? r.token : undefined });
    return {
      calls, live,
      async available() { calls.push(["available"]); return opts.available !== false; },
      async prepare(b) {
        calls.push(["prepare", b]);
        if (opts.prepareError) { const e = new Error(opts.prepareError); e.code = opts.prepareError; if (opts.prepareError === "DESTINATION_UNVERIFIED") e.body = { destination: dest }; throw e; }
        const id = "r_" + (++n), lead = +Math.min(3, b.start).toFixed(3);
        const r = { id, range: { start: b.start, end: b.end }, lead, scope: b.scope || "window", state: "rendering", token: "tok_" + n, polls: opts.renderPolls == null ? 1 : opts.renderPolls };
        live.set(id, r);
        return view(r);
      },
      async status(id) {
        calls.push(["status", id]);
        const r = live.get(id);
        if (!r) { const e = new Error("no such check"); e.code = "NO_SUCH_REVIEW"; throw e; }
        if (r.state === "rendering" && --r.polls <= 0) r.state = opts.renderFails ? "failed" : "ready";
        return view(r);
      },
      async send(id, token) {
        calls.push(["send", id, token]);
        const r = live.get(id);
        if (!r || r.state !== "ready" || r.token !== token) { const e = new Error("not confirmed"); e.code = "NOT_CONFIRMED"; throw e; }
        r.state = "done"; live.delete(id);
        return { reviewId: id, source: "streamer", ...result(r.scope, r.range) };
      },
      async cancel(id) { calls.push(["cancel", id]); const r = live.get(id); if (r) { r.state = "cancelled"; live.delete(id); } return { reviewId: id, state: "cancelled" }; },
      async mark(b) { calls.push(["mark", b]); if (b.mark === "passed") { const e = new Error("no"); e.status = 400; throw e; } return { ok: true }; },
    };
  }

  /* ── the page ── */
  function el(doc, tag, cls, txt) { const e = doc.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }

  /**
   * Wire the button and the box into the editor. env: {doc, button, lang(), time(), duration(), inOut(), seek(t), api?,
   * setInterval?, pollMs?, wait?}. Returns {session, refresh, overlay, render}. (Prewarm is the next batch — #328 B8.)
   */
  function mount(env) {
    const doc = env.doc, api = env.api || httpApi(), btn = env.button;
    const session = createSession(api, { pollMs: env.pollMs, wait: env.wait });
    let present = false;
    const L = () => lang_(env.lang ? env.lang() : "zh-CN");
    const rangeNow = () => pickRange({ time: env.time(), duration: env.duration(), ...(env.inOut ? env.inOut() : {}) });

    const overlay = el(doc, "div", "overlay hidden review-overlay");
    const box = el(doc, "div", "dialog review-dialog");
    box.setAttribute("role", "dialog"); box.setAttribute("aria-modal", "true"); box.id = "reviewDialog"; box.tabIndex = -1;
    overlay.appendChild(box);
    (doc.body || doc.documentElement).appendChild(overlay);

    function labelButton() {
      if (!btn) return;
      const r = rangeNow(), n = r ? spanOf(r) : SPAN;
      btn.textContent = t(L(), "button", { n });
      // 「不到 1 秒」 only when there is a timeline and the stretch really is under 1 s — never with nothing loaded (JJ #326, 833f73e4)
      const dur = num(env.duration());
      btn.title = r ? t(L(), "buttonTip", { n }) : dur && dur > 0 ? t(L(), "tooShort") : "";
      btn.disabled = !r;
    }
    async function refresh() {
      present = await Promise.resolve().then(() => api.available()).catch(() => false);
      if (btn) btn.classList.toggle("hidden", !present);   // no review routes on this server: no button
      labelButton();
      return present;
    }
    function boxLines(m) {
      for (const line of m.lines) box.appendChild(el(doc, "p", "review-line", line));
      const to = el(doc, "p", "review-to" + (m.warn ? " review-warn" : ""), m.to); to.dataset.review = "to"; box.appendChild(to);
      const tr = el(doc, "p", "review-training", m.training); tr.dataset.review = "training"; box.appendChild(tr);
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
      const add = (id, label, on, cls) => { const b = el(doc, "button", "btn review-action" + (cls ? " " + cls : ""), label); b.dataset.review = id; b.addEventListener("click", on); actions.appendChild(b); return b; };
      const fellBack = !!(s.range && s.range.fellBack);
      if (s.phase === "preparing") {
        box.appendChild(el(doc, "p", "dim review-note", t(lang, "preparing", { n })));
        add("cancel", t(lang, "cancelPrep"), () => session.cancel());
      } else if (s.phase === "confirm" || s.phase === "unverified") {
        const m = s.phase === "confirm" ? confirmModel(s.prep, lang, { fellBack, changed: s.changed }) : unverifiedModel(s.dest, lang, s.range);
        boxLines(m);
        if (s.previewSrc) {
          const v = el(doc, "video", "review-preview"); v.controls = true; v.preload = "metadata"; v.src = s.previewSrc;
          box.appendChild(el(doc, "p", "dim review-note", t(lang, "previewNote"))); box.appendChild(v);
        }
        for (const b of m.buttons) {
          const on = b.id === "preview" ? () => session.preview() : b.id === "cancel" ? () => session.cancel() : () => session.send(b.id);
          const node = add(b.id, b.label, on, b.id === "full" ? "review-send" : "");
          node.disabled = !b.enabled;
        }
      } else if (s.phase === "sending") {
        box.appendChild(el(doc, "p", "dim review-note", t(lang, "sending")));
      } else if (s.phase === "result") {
        const m = resultModel(s.raw, lang, n, { fellBack });
        const head = el(doc, "p", "review-headline review-" + m.status, m.headline); head.dataset.review = "headline"; box.appendChild(head);
        for (const note of m.notes) box.appendChild(el(doc, "p", "dim review-note", note));
        if (m.dims.length) {
          const ul = el(doc, "ul", "review-dims");
          for (const d of m.dims) { const li = el(doc, "li", "review-dim review-dim-" + (d.state || "unknown"), d.line); li.dataset.review = "dim"; li.dataset.dim = d.key; ul.appendChild(li); }
          box.appendChild(ul);
        }
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
        if (!(s.raw && s.raw.reason === "NO_BRIDGE")) add("recheck", t(lang, "recheck"), () => { void start(s.range); }, m.status === "passed" ? "" : "review-send");
        add("close", t(lang, "close"), () => session.close());
      }
      box.appendChild(actions);
    }
    session.on(render);
    /** 「检查这 10 秒」 and 「重新检查」: each press is a new check (prepare again; the receiver is read from the engine each time). */
    function start(r) {
      if (!r || !present || session.state.phase === "preparing" || session.state.phase === "sending") return null;
      return session.check(r);
    }
    if (btn) btn.addEventListener("click", () => { void start(rangeNow()); });
    overlay.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.stopPropagation(); void session.close(); } });
    const every = env.setInterval || ((fn, ms) => setInterval(fn, ms));
    every(() => labelButton(), 500);
    void refresh();
    return { session, refresh, overlay, render: () => render(session.state) };
  }

  return { text, t, fmtTime, pickRange, destinationOf, payloadOf, confirmModel, unverifiedModel, cleanResult, resultModel, httpApi, safePreviewSrc,
    createSession, stubApi, mount, SPAN, MAX_SPAN, DIMENSIONS };
});
