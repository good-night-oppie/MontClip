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
      buttonTip: "让 AI 看一看、听一听这 {n} 秒有没有问题。点下去就会发出去。",   // JJ #326 6928950807 final (1)
      tooShort: "这一段不到 1 秒，没法检查",                         // JJ #326 recheck 6869383846: the tip on the greyed-out button
      title: "检查这 {n} 秒",                                      // JJ #326: kept
      preparing: "正在这台电脑上准备这 {n} 秒，还没有发出去。",     // JJ #326: kept
      cancelPrep: "取消",                                           // JJ #326: the button while preparing
      // v3.1 §3 with one change (JJ #326 6871859408): the engine sends the subtitles overlapping this stretch, not the whole video's
      intro: "点「检查这 {n} 秒」就会发出去，不会再问你一次。这 {n} 秒的画面和声音，还有和这一段有重叠的字幕文字和剪辑时间点，会发给 AI 做检查。",   // JJ #326 6928950807 final (1)
      whatFull: "点「发送检查」会发出去：{from}–{to} 的画面和声音（{sec} 秒），和这一段有重叠的字幕文字、剪辑时间点。",   // JJ #326 6871859408: a subtitle across the edge goes whole
      whatFullLead: "两个按钮发的画面和声音里，都有前面多带的 {leadSec} 秒（{from}–{lead}），让 AI 知道前面在说什么。",   // JJ #326 (after whatWindow)
      whatWindow: "打开「只发这 {n} 秒」后，会发出去的是：{from}–{to} 的画面和声音（{sec} 秒），不额外附带字幕文字、剪辑时间点和好坏例子；画面里已有的字幕仍会随视频发出。",   // JJ #326 (PG v4.1 6871970875 with 字幕文字); opening per JJ #326 6928950807 final (5)
      whatEdge: "与这段画面相交的字幕会整条发送，可能包含片段前后的文字。",   // PG #321 6871888446 (2), word for word; JJ to confirm
      whatTaste: "点「发送检查」还会把之前记下的 {k} 条好坏例子（认可的和不认可的）一起发出去。",   // draft (PG 6871888446: 「只发这 N 秒」 sends none): willSend.tasteNotes
      noPage: "要发送，请在 MontClip 窗口里点「发送检查」或「只发这 {n} 秒」。这里只能先看会发什么，或者点「不发了」。",   // JJ #326 final (PG #321 6872395398: view-only in the Cindy plugin / a browser, no button added)
      tasteLost: "有 {k} 条好坏例子的文字在重启后没有保留，这次不会发出去；需要的话请重新填写。",   // JJ #326 6872283674 (#328 willSend.tasteLost)
      fixedTitle: "会一起发给 AI 的固定标准和问题",                // JJ #326 6872283674: folded in 「先看要发的内容」
      fixedTwice: "分次发出时，第一次不带，从后面几次起带上。",   // JJ #326 6872283674: only when requests > 1, right under the folded title
      fixedStandards: "审片标准：",                                  // JJ #326 6872283674
      fixedQuestions: "要 AI 回答的问题：",                          // JJ #326 6872283674
      tasteMemory: "好坏例子的文字只在这次打开 MontClip 期间保留，关掉就没了，下次要重新填。",   // JJ #326 6928950807 final (4)
      whatTwice: "会分 {k} 次发出去，第一次只有画面和声音，后面几次会多带上面说的其余内容。",   // JJ #326 6871859408: willSend.requests > 1 (#328: 1 or 2; two_pass looks blind first)
      whatDanmaku: "画面里如果有观众昵称、弹幕，会原样发出去。",       // JJ #326
      to: "发给：{service}（{host}）",                             // Deja 6867787475; JJ #326: kept
      toUnverified: "发给：{service}（{host}，未验证）",            // Deja (#328): an unconfirmed domain is never shown as confirmed
      unverifiedBlock: "这个地址还没有人确认过，所以先不发。请等有人确认后再试。",        // JJ #326 6871754149: the engine refuses until the owner confirms it
      training: "发的时候会要求对方不拿这段内容训练模型。这是发出去时带上的要求，我们没法核实对方一定照做。",   // JJ #326 6928950807 final (2): provider.data_collection deny is a request, not verified
      noDestination: "不知道这次会发到哪里，所以先不发。",           // JJ #326: kept
      noPayload: "说不清这次具体会发出去什么，所以先不发。",           // JJ #326 recheck: passed
      changedRecheck: "要发的内容和刚才说的不一样了，请再看一遍再决定。",   // JJ #326 6871754149 passed: 「只发这 10 秒」 made a clip that differs
      previewBtn: "先看要发的内容",                                 // v3 §5
      sendFull: "发送检查",                                         // v3 §5
      sendWindow: "只发这 {n} 秒",                                  // v3 §5
      cancel: "不发了",                                             // v3 §5
      why_PROJECT_EDITED: "准备好以后项目又改过，和要发的内容对不上了。请重新检查。",   // JJ #326 6872083423 / 6872139855
      why_PROJECT_CHANGED: "现在打开的是别的项目。请回到这个项目再检查。",   // JJ #326 6872083423 / 6872139855
      why_SEND_LIMIT: "这个项目能发出去的视频已经到上限了，这次不能再发。",   // JJ #326 6872083423 / 6872139855
      why_NOT_LOCAL: "这个检查只能在运行 MontClip 的这台电脑上用。",   // JJ #326 6872083423 / 6872139855
      why_LEDGER_UNREADABLE: "检查记录读不出来，所以这次先不检查。如果一直这样，请反馈给我们。",   // JJ #326 6872083423 / 6872139855
      why_LEDGER_UNWRITABLE: "检查记录写不进去，所以这次先不检查。如果一直这样，请反馈给我们。",   // JJ #326 6872083423 / 6872139855
      why_STORE_FAILED: "再检查一次，内容会再发出去一次。",   // JJ #326 (STORE_FAILED final)
      storeFailed: "内容可能已经发到对方那边了，但检查的结果没能保存下来，这次没有结果可看。这不代表没问题。",   // JJ #326: the headline when #328 says STORE_FAILED (after the clip may have gone out)
      why_DESTINATION_CHANGED: "要发去的地址变了。请重新检查。",   // JJ #326 6872083423 / 6872139855
      why_REVIEW_SEND_OFF: "设置里的「审片发送」没有打开，什么都没有发出去。",   // JJ #326 6928950807 final (4)
      why_NO_KEY: "还没有保存审片用的密钥，什么都没有发出去。",   // JJ #326 6928950807 final (4)
      why_NO_SENDER: "要在 MontClip 桌面窗口里才能发送，什么都没有发出去。",   // JJ #326 6928950807 final (4)
      why_DESTINATION_BLOCKED: "上次发出去以后，回来的结果不是我们指定的那个服务，所以这个项目先停发了。这次什么都没有发出去。",   // JJ #326 6928950807 final (4)
      why_DAILY_LIMIT: "今天的检查次数用完了，什么都没有发出去。明天再检查。",   // JJ #326 6928950807 final (4)
      why_CHECK_BUDGET: "这一次要发的东西超过了一次能发的上限，什么都没有发出去。",   // JJ #326 6928950807 final (4)
      why_BODY_TOO_LARGE: "这一段太大，发不出去。请选短一点的一段。",   // JJ #326 6928950807 final (4)
      why_SAMPLE_CHANGED: "准备好以后要发的内容变了，什么都没有发出去。请重新检查。",   // JJ #326 6928950807 final (4)
      reused: "这一段这份内容已经检查过，这里是上次的结果，没有再发送。要再发一次，请点「再检查一次」。",   // JJ #326 6928950807 final (4)
      windowToggle: "只发这 {n} 秒",                                // JJ #326 6928950807 final (5): a switch chosen before 「检查这 {n} 秒」
      windowToggleLine: "打开后只发这 {n} 秒的画面和声音，不另外发字幕文字、剪辑时间点和好坏例子；画面里已经有的字幕仍会随视频发出。",   // JJ #326 6928950807 final (5)
      soundGoes: "声音会单独作为一条音轨一起发出去，视频里不带声音。",   // JJ #326 6928950807 final (6a): server/review-service.js sends a separate 48 kHz WAV
      soundNone: "这次没有把声音发出去，所以声音没有检查。",           // JJ #326 6928950807 final (6b) audio === false
      soundUnclear: "声音发出去了，但这次没说清听没听出来，声音这一项没有结论。",   // JJ #326 6928950807 final (6b) audio === true, audioVerified !== true
      soundHeard: "声音也发出去了，对方听过这段声音。",                 // JJ #326 6928950807 final (6b) audio === true, audioVerified === true
      previewText: "点「发送检查」会发出去的文字：",                // draft (PG 6871888446 (2): show the real text): willSend.projectText
      previewNotes: "点「发送检查」会发出去的好坏例子：",            // draft: willSend.notes
      previewNoText: "这一段没有字幕文字要发。",                     // JJ #326 6872083423 / 6872139855: 「发送检查」 with no subtitle touching the stretch
      previewNoTextWindow: "这次不另外发字幕文字。",                 // JJ #326 6872083423 / 6872139855: 「只发这 N 秒」
      noteGood: "认可",                                             // draft: a note the streamer approved
      noteGoodOn: "认可（{label}）",                                 // JJ #326 6872083423 / 6872139855: {label} is a short name below
      noteBadOn: "不认可（{label}）",                               // JJ #326 6872083423 / 6872139855
      noteDim_fact: "人和事", noteDim_subtitle: "字幕", noteDim_pacing: "节奏", noteDim_packaging: "包装",   // JJ #326 6872083423 / 6872139855
      noteBad: "不认可",                                            // draft
      noteSep: "：",
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
      buttonTip: "Have the AI look and listen to these {n} seconds. Clicking sends it.",   // JJ #326 6928950807 final (1)
      tooShort: "This stretch is under 1 second, so it can't be checked",
      title: "Check these {n} seconds",
      preparing: "Getting these {n} seconds ready on this computer. Nothing has been sent.",
      cancelPrep: "Cancel",
      intro: "Clicking “Check these {n} seconds” sends it right away, with no second question. The picture and sound of these {n} seconds, plus the subtitle text overlapping this section and the cut points, go to the AI.",   // JJ #326 6928950807 final (1)
      whatFull: "Clicking “Send for a check” will send: picture and sound from {from} to {to} ({sec} s), and the subtitle text overlapping this section, plus the cut points.",
      whatFullLead: "With either button, the picture and sound include an extra {leadSec} s before the checked section ({from} to {lead}), to give the AI context about what was being said.",
      // PG #321 6872473697: the English page says what #328's willSend.what says for a window clip, word for word (test-locked on both sides)
      whatWindow: "With “Send only these {n} s” on, what goes out is: picture and sound from {from} to {to} ({sec} s). No subtitle text, edit points, or good/bad examples are attached; subtitles already burned into the picture still go out with the video.",
      whatEdge: "Any subtitle that overlaps this clip in time will be sent in full, so it may include text from before or after the clip.",
      whatTaste: "“Send for a check” also sends the {k} saved examples of good and bad edits (ones approved and ones rejected).",
      noPage: "To send it, click “Send for a check” or “Send only these {n} s” in the MontClip window. Here you can only see what would be sent, or click “Don't send”.",
      tasteLost: "The text of {k} saved examples wasn't retained after a restart and won't be sent this time. If you need those examples, please enter them again.",
      fixedTitle: "Preset standards and questions sent to the AI",
      fixedTwice: "When sending more than once, these are left out the first time and included from the second time onward.",
      fixedStandards: "Review standards:",
      fixedQuestions: "Questions for the AI to answer:",
      tasteMemory: "The good/bad example text is kept only while MontClip is open; after you close it, fill it in again.",   // JJ #326 6928950807 final (4)
      whatTwice: "This will be sent {k} times: the first time with only the picture and sound, and the later times also with the other content described above.",
      whatDanmaku: "Viewer names and chat messages in the picture are sent as they are.",
      to: "Send to: {service} ({host})",
      toUnverified: "Send to: {service} ({host}, not verified)",
      unverifiedBlock: "Nobody has confirmed this address yet, so nothing will be sent. Please try again once someone has confirmed it.",
      training: "The request asks the provider not to train on this content. That requirement goes out with the request; we cannot verify that the provider complies.",   // JJ #326 6928950807 final (2)
      noDestination: "It isn't clear where this would be sent, so nothing will be sent.",
      noPayload: "It isn't clear exactly what this would send, so nothing will be sent.",
      changedRecheck: "What will be sent is different from what was described earlier. Please check it again before deciding.",
      previewBtn: "See what will be sent",
      sendFull: "Send for a check",
      sendWindow: "Send only these {n} s",
      cancel: "Don't send",
      why_PROJECT_EDITED: "The project was edited after this was prepared, so it no longer matches what would be sent. Please check again.",
      why_PROJECT_CHANGED: "Another project is open now. Go back to this project and check again.",
      why_SEND_LIMIT: "This project has reached its video-sending limit, so this video can't be sent.",
      why_NOT_LOCAL: "This check only works on the computer running MontClip.",
      why_LEDGER_UNREADABLE: "The check records couldn't be read, so this check won't run for now. If this keeps happening, please let us know.",
      why_LEDGER_UNWRITABLE: "The check records couldn't be written, so this check won't run for now. If this keeps happening, please let us know.",
      why_STORE_FAILED: "Checking again will send the content again.",
      storeFailed: "The content may already have reached the recipient, but the check result couldn't be saved, so there is no result to view this time. That doesn't mean there's no problem.",
      why_DESTINATION_CHANGED: "The address it would be sent to has changed. Please check again.",
      why_REVIEW_SEND_OFF: "Review sending is off in Settings. Nothing was sent.",   // JJ #326 6928950807 final (4)
      why_NO_KEY: "No key for reviews is saved yet. Nothing was sent.",   // JJ #326 6928950807 final (4)
      why_NO_SENDER: "Sending only works in the MontClip desktop window. Nothing was sent.",   // JJ #326 6928950807 final (4)
      why_DESTINATION_BLOCKED: "The reply that came back was not from the service we specified, so sending is stopped for this project. Nothing was sent this time.",   // JJ #326 6928950807 final (4)
      why_DAILY_LIMIT: "Today's check limit is used up. Nothing was sent. Try again tomorrow.",   // JJ #326 6928950807 final (4)
      why_CHECK_BUDGET: "This would send more than one check allows. Nothing was sent.",   // JJ #326 6928950807 final (4)
      why_BODY_TOO_LARGE: "This stretch is too large to send. Please choose a shorter one.",   // JJ #326 6928950807 final (4)
      why_SAMPLE_CHANGED: "What would be sent changed after it was prepared. Nothing was sent. Please check again.",   // JJ #326 6928950807 final (4)
      reused: "This stretch of this content was already checked; this is that result, and nothing was sent again. To send it again, click “Check again”.",   // JJ #326 6928950807 final (4)
      windowToggle: "Send only these {n} s",
      windowToggleLine: "With this on, only the picture and sound of these {n} seconds go out, with no subtitle text, cut points, or good/bad examples. Subtitles already burned into the picture still go with the video.",
      soundGoes: "The sound goes as a separate audio track; the video itself carries no sound.",
      soundNone: "No sound was sent this time, so the sound was not checked.",
      soundUnclear: "The sound went out, but the reply did not say whether it was heard, so there is no conclusion about the sound.",
      soundHeard: "The sound went out and the reply says it was listened to.",
      previewText: "Text that “Send for a check” would send:",
      previewNotes: "Examples that “Send for a check” would send:",
      previewNoText: "There is no subtitle text in this part to send.",
      previewNoTextWindow: "No subtitle text is sent separately this time.",
      noteGood: "approved",
      noteGoodOn: "approved ({label})",
      noteBadOn: "rejected ({label})",
      noteDim_fact: "people and events", noteDim_subtitle: "subtitles", noteDim_pacing: "pacing", noteDim_packaging: "on-screen graphics",
      noteBad: "rejected",
      noteSep: ": ",
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
  const WHY = ["PROJECT_EDITED","PROJECT_CHANGED","SEND_LIMIT","NOT_LOCAL","LEDGER_UNREADABLE","LEDGER_UNWRITABLE","STORE_FAILED","DESTINATION_CHANGED",
    "REVIEW_SEND_OFF","NO_KEY","NO_SENDER","DESTINATION_BLOCKED","DAILY_LIMIT","CHECK_BUDGET","BODY_TOO_LARGE","SAMPLE_CHANGED"];   // + #347
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
    // PG #321 6871888446: the words that go are shown as they go — the project's text (scope full) and the notes, one per counted note;
    // 「只发这 N 秒」 (scope window) sends neither, so a window clip that carries any is not what the box can promise
    if (typeof ws.projectText !== "string" || !Array.isArray(ws.notes) || ws.notes.length !== taste) return null;
    const notes = ws.notes.map((x) => (x && typeof x.text === "string" ? { kind: x.kind === "negative" ? "negative" : "positive", aspect: DIMENSIONS.includes(x.aspect) ? x.aspect : null, text: x.text } : null));
    if (notes.includes(null)) return null;
    if (view.scope === "window" && (taste !== 0 || ws.projectText !== "")) return null;
    if (ws.leadIn != null) {   // #328 153ed95f states the lead-in itself: it must be the one the page shows
      const li = ws.leadIn, f = num(li && li.from), to = num(li && li.to), sec = num(li && li.seconds);
      if (lead === 0 || f == null || to == null || sec == null || !near_(to, range.start) || !near_(f, range.start - lead) || !near_(sec, lead)) return null;
    } else if (lead > 0 && "leadIn" in ws) return null;
    const video = { start: range.start - lead, end: range.end };
    // #328 eb3203ab: how many saved examples lost their words in a restart (they are not sent); absent from older engines = 0
    const lost = ws.tasteLost == null ? 0 : count_(ws.tasteLost);
    if (lost == null) return null;
    // Deja (#326): the fixed standards and questions that go with the send are shown as the engine sends them — #328 a41b6bca willSend.standards
    // {rules, questions, ask, carriedBy}, the very strings the request is built from; never written into the page. Absent (an older engine):
    // nothing is shown; present but malformed, or carried by a request that is not there: not a description.
    let fixed = null;
    if (ws.standards != null) {
      const f = ws.standards, list = (a) => (Array.isArray(a) && a.length <= 20 && a.every((x) => typeof x === "string" && x && x.length <= 400) ? a.slice() : null);
      const standards = list(f && f.rules), questions = list(f && f.questions), ask = f && typeof f.ask === "string" && f.ask.length <= 400 ? f.ask : null;
      const by = f && f.carriedBy;
      if (!standards || !questions || ask == null || !(by === "only" ? requests === 1 : by === "second" ? requests > 1 : false)) return null;
      fixed = { standards, questions, ask, laterOnly: by === "second" };
    }
    return { range, video, lead: lead > 0 ? { start: video.start, end: range.start } : null, scope: view.scope, requests, taste, seconds, text: ws.projectText, notes, lost, fixed,
      audio: ws.audio !== false };   // the sound goes as its own WAV unless the engine says it does not (server/review-service.js willSend.audio)
  }

  /** The receiver, as the engine reports it: a name and a host; confirmed = the engine will send there (#347: the owner's authorisation,
   *  confirmed:true), verified = a capture of a real run has shown it (#347: false until V23). Sending needs confirmed; 「未验证」 stays
   *  next to the domain while verified is false, so an unchecked domain is never shown as checked. */
  function destinationOf(d) {
    if (!d || typeof d !== "object") return null;
    const service = clip(String(d.service || "").trim(), 60), host = clip(String(d.host || "").trim(), 120);
    if (!service || !host || /[\s/\\]/.test(host)) return null;
    return { service, host, verified: d.verified === true, confirmed: d.confirmed === true || d.verified === true };
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
      if (pay.scope === "full") { lines.push(t(lang, "whatFull", at)); lines.push(t(lang, "whatEdge")); }
      if (!opts.direct || pay.scope === "window") lines.push(t(lang, "whatWindow", at));   // #326: the one-click page shows the switch's own choice
      if (pay.audio) lines.push(t(lang, "soundGoes"));   // JJ 6928950807 (6a)
      if (pay.lead) lines.push(t(lang, "whatFullLead", { from: fmtTime(pay.lead.start), lead: fmtTime(pay.lead.end), leadSec: secs(pay.lead.end - pay.lead.start) }));
      if (pay.taste) { lines.push(t(lang, "whatTaste", { k: pay.taste })); lines.push(t(lang, "tasteMemory")); }
      if (pay.lost) lines.push(t(lang, "tasteLost", { k: pay.lost }));
      if (pay.requests > 1) lines.push(t(lang, "whatTwice", { k: pay.requests }));
      lines.push(t(lang, "whatDanmaku"));
    } else lines.push(t(lang, "noPayload"));
    if (dest && !dest.confirmed) lines.push(t(lang, "unverifiedBlock"));
    const token = view && typeof view.sendToken === "string" && view.sendToken ? view.sendToken : null;
    const id = view && typeof view.reviewId === "string" && view.reviewId ? view.reviewId : null;
    const canSend = !!(pay && dest && dest.confirmed && id && token && view.state === "ready");
    // #328 85d9e8d1: only the desktop window's own requests are the page; anywhere else (the Cindy plugin, a browser tab) no token is shown.
    // PG #321 6872395398: there it is view-only — no send button that does nothing, one plain line instead; the clip can still be looked at.
    const viewOnly = !!(pay && dest && dest.confirmed && id && !token && view.state === "ready");
    if (viewOnly) lines.push(t(lang, "noPage", { n }));
    return {
      title: t(lang, "title", { n }), n, lines, payload: pay,
      blocked: !pay ? "noPayload" : !dest ? "noDestination" : !dest.confirmed ? "unverified" : null,
      to: toLine(lang, dest), warn: !dest || !dest.verified,
      training: t(lang, "training"),
      destination: dest, canSend,
      buttons: [
        { id: "preview", label: t(lang, "previewBtn"), enabled: !!((canSend || viewOnly) && safePreviewSrc(view && view.previewSrc)) },
        { id: "full", label: t(lang, "sendFull"), enabled: !!(canSend && pay.scope === "full"), hidden: viewOnly },
        { id: "window", label: t(lang, "sendWindow", { n }), enabled: canSend, hidden: viewOnly },
        { id: "cancel", label: t(lang, "cancel"), enabled: true },
      ],
    };
  }

  /** prepare refused because nobody confirmed where it goes (#328: 409 DESTINATION_UNVERIFIED): nothing was made, nothing goes. */
  function unverifiedModel(dest, lang, range) {
    const d = destinationOf(dest), n = range ? spanOf(range) : SPAN;
    return { title: t(lang, "title", { n }), n, lines: [t(lang, "intro", { n }), t(lang, "unverifiedBlock")],
      to: toLine(lang, d ? { ...d, verified: false, confirmed: false } : null), warn: true, training: t(lang, "training"), destination: d, canSend: false,
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
        dimensions[k] = { state: d && DIM_STATES.includes(d.state) ? d.state : null, reason: clip(d && d.reason, 100) };
      }
    }
    return { reviewId: typeof r.reviewId === "string" ? r.reviewId : null, status, reason: typeof r.reason === "string" ? clip(r.reason, 30) : null,
      scope: r.scope === "window" ? "window" : "full", textAvailable: r.textAvailable !== false,
      range: r.range && num(r.range.start) != null && num(r.range.end) != null ? { start: r.range.start, end: r.range.end } : null,
      summary: clip(r.summary, 600), findings, dimensions,
      audio: r.audio === true ? true : r.audio === false ? false : null, audioVerified: r.audioVerified === true };
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
    // JJ 6928950807 (6d): the 「passed」 sentence only when the sound was heard too — the four dimensions have no sound line
    if (status === "passed" && !(r.audio === true && r.audioVerified)) status = "no_result";
    if (status === "issues" && !r.findings.length && !dimIssue) status = "no_result";   // 「有问题」 with nothing to show is no answer
    const notes = opts.fellBack ? [t(lang, "rangeTooLong", { n: span })] : [];
    // JJ 6928950807 (6b)(c): what was done about the sound, right after the headline, whenever the dimensions (「没发现问题」) are shown
    const sendErr = !!(raw && raw.sendError === true);
    if (!sendErr && r.dimensions && r.audio != null) notes.unshift(t(lang, r.audio === false ? "soundNone" : r.audioVerified ? "soundHeard" : "soundUnclear"));
    let headline;
    // a send that was called and failed may have reached the receiver: that comes first, whatever its code says (QQ #326 5900512724 item 2)
    if (status === "no_result") headline = raw && raw.sendError === true ? t(lang, whyOf(raw.why) === "STORE_FAILED" ? "storeFailed" : "sendFailed")
      : r.reason === "NO_BRIDGE" ? t(lang, "unavailable") : r.reason === "BUSY" ? t(lang, "busy")
      : r.reason === "PREPARE_FAILED" ? t(lang, "prepareFailed", { n: span })
      : r.reason === "INSUFFICIENT_EVIDENCE" ? t(lang, "insufficient") : t(lang, "noResult");
    else if (status === "passed") headline = t(lang, "passed", { n: span });
    else headline = t(lang, "issues", { count: main.length || r.findings.length || DIMENSIONS.filter((k) => r.dimensions[k].state === "issues").length });
    const why = raw && typeof raw === "object" ? whyOf(raw.why) : null;
    if (status === "no_result" && why) notes.push(t(lang, "why_" + why));
    if (status !== "no_result" && r.scope === "window") notes.push(t(lang, "windowOnly", { n: span }));
    if (!r.textAvailable) notes.push(t(lang, "textGone"));
    if (raw && raw.reused === true) notes.push(t(lang, "reused"));   // PG 6922461279: an earlier result, nothing sent
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

  /* #347: answers from the main process or the engine that mean the request was never made — nothing left this computer. Anything else
     after the send was asked for may have reached the receiver (JJ #326 sendFailed). */
  const NOT_SENT = ["NEEDS_CLICK", "NOT_READY", "BAD_REQUEST", "REVIEW_FORBIDDEN", "REVIEW_SEND_OFF", "NO_KEY", "NO_SENDER", "DESTINATION_CHANGED",
    "DESTINATION_BLOCKED", "DAILY_LIMIT", "CHECK_BUDGET", "SEND_LIMIT", "PROJECT_EDITED", "PROJECT_CHANGED", "SAMPLE_CHANGED", "LEDGER_UNREADABLE",
    "LEDGER_UNWRITABLE", "NOT_CONFIRMED", "CLICK_REQUIRED"];
  /** the desktop window's bridge to the main process (desktop/view-preload.js); absent in a browser tab or the Cindy plugin */
  const sender = () => (typeof globalThis !== "undefined" && globalThis.montclipReview && typeof globalThis.montclipReview.send === "function" ? globalThis.montclipReview : null);

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
      prepare: (b) => post("/api/review/prepare", b),   // {start, end, scope, recheck?}
      status: (id) => req("/api/review/status?id=" + encodeURIComponent(id)),
      /** #347: only the desktop main process sends; it checks the real click itself. → the record, or throws with a code and
       *  sent:false when it is certain nothing left this computer (refused before the request was made). */
      async send(view) {
        const bridge = sender();
        if (!bridge) { const e = new Error("NO_SENDER"); e.code = "NO_SENDER"; e.notSent = true; throw e; }
        const hash = view && view.willSend && typeof view.willSend.hash === "string" ? view.willSend.hash : "";
        const r = await bridge.send({ reviewId: view.reviewId, token: view.sendToken, hash });
        if (r && r.ok === true && r.record) return r.record;
        const code = (r && typeof r.code === "string" && r.code) || "FAILED";
        const e = new Error(code); e.code = code; e.notSent = NOT_SENT.includes(code); throw e;
      },
      /** #326 (QQ 5927365621, owner #321 6888246693 / 6926823489): in the desktop window a click on 「检查这 N 秒」 is the consent. The main
       *  process takes that real click, has the clip made and sends it when ready, with no box and no second click. → {reviewId, reused?},
       *  or throws with the main process's code (notSent: refused before anything was made or sent). Absent in a browser tab or Cindy. */
      direct: () => !!(sender() && typeof sender().check === "function"),
      async checkNow(range, recheck, scope) {
        const bridge = sender();
        if (!bridge || typeof bridge.check !== "function") { const e = new Error("NO_SENDER"); e.code = "NO_SENDER"; e.notSent = true; throw e; }
        const r = await bridge.check({ start: range.start, end: range.end, recheck: recheck === true, scope: scope === "window" ? "window" : "full" });
        if (r && r.ok === true && typeof r.reviewId === "string") return { reviewId: r.reviewId, reused: r.reused === true };
        const code = (r && typeof r.code === "string" && r.code) || "FAILED";
        const e = new Error(code); e.code = code; e.notSent = true; e.body = r; throw e;   // the main process asks for nothing to be sent until prepare answered
      },
      cancel: (id) => post("/api/review/cancel", { id }),
      mark: (b) => post("/api/review/mark", b),
    };
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const errReason = (e) => {
    const c = e && e.code;
    return c === "BUSY" || c === "NO_BRIDGE" || c === "DESTINATION_UNVERIFIED" ? c : "PREPARE_FAILED";
  };
  /** the engine's own code, kept only when the page has a plain sentence for it (#328: PROJECT_EDITED, SEND_LIMIT, NOT_LOCAL, LEDGER_*, …) */
  const whyOf = (c) => (typeof c === "string" && WHY.includes(c) ? c : null);

  /**
   * One check, as a small state machine (no DOM): idle → preparing → confirm → sending → result; any step → closed;
   * preparing → unverified when the engine refuses because nobody confirmed the receiver (#328 DESTINATION_UNVERIFIED).
   * `send` can only run from `confirm` with a token and a confirmed destination, i.e. after the box with all lines was shown.
   */
  function createSession(api, opts = {}) {
    const pollMs = opts.pollMs == null ? 400 : opts.pollMs, wait = opts.wait || sleep;
    const listeners = new Set();
    const s = { phase: "idle", range: null, prep: null, raw: null, previewSrc: null, scope: null, dest: null, changed: false, gen: 0, windowOnly: false };
    const direct = () => !!(api.direct && api.direct());
    const emit = () => { for (const fn of listeners) fn(s); };
    const set = (patch) => { Object.assign(s, patch); emit(); };
    /** prepare (renders on this computer, nothing leaves), then read the status until the clip is ready → the view, or why not */
    async function prepareView(range, scope, gen, recheck) {
      let v;
      try { v = await api.prepare({ start: range.start, end: range.end, scope, ...(recheck ? { recheck: true } : {}) }); }
      catch (e) { return gen !== s.gen ? { stale: true } : { failed: errReason(e), why: whyOf(e && e.code), dest: e && e.body && e.body.destination }; }
      if (gen !== s.gen) { if (v && v.reviewId) api.cancel(v.reviewId).catch(() => {}); return { stale: true }; }
      if (!v || typeof v.reviewId !== "string") return { failed: "PREPARE_FAILED" };
      // #321 (PG 6922461279): this stretch of this content was already checked the same way — the engine answers with that result, sends nothing
      if (v.reused === true && v.state === "done" && v.result && typeof v.result === "object") return { reused: v.result };
      s.prep = v;   // what 「不发了」 cancels while it renders
      while (v && v.state === "rendering") {
        await wait(pollMs);
        if (gen !== s.gen) return { stale: true };
        try { v = await api.status(v.reviewId); } catch { return { failed: "PREPARE_FAILED" }; }
        if (gen !== s.gen) return { stale: true };
      }
      if (!v || v.state !== "ready") return { failed: "PREPARE_FAILED", why: whyOf(v && v.reason) };
      return { view: v };
    }
    function fail(reason, dest, why) {
      if (reason === "DESTINATION_UNVERIFIED") set({ phase: "unverified", prep: null, dest: dest || null });
      else set({ phase: "result", prep: null, raw: { status: "no_result", reason, why: why || null, findings: [] } });
    }
    async function check(range, recheck = false) {
      const gen = ++s.gen;
      set({ phase: "preparing", range, prep: null, raw: null, previewSrc: null, scope: null, dest: null, changed: false });
      if (direct()) return checkDirect(range, recheck, gen);
      return lookAt(range, gen, recheck);
    }
    /** 「先看要发的内容」 (and, outside the desktop window, the check button): the clip is made on this computer and shown with what would go;
     *  nothing is sent from here. In the desktop window the page offers the 「只发这 {n} 秒」 switch and the one 「检查这 {n} 秒」 button. */
    async function look(range) {
      if (s.phase === "preparing" || s.phase === "sending") return;
      const gen = ++s.gen;
      set({ phase: "preparing", range, prep: null, raw: null, previewSrc: null, scope: null, dest: null, changed: false });
      return lookAt(range, gen, false);
    }
    async function lookAt(range, gen, recheck) {
      const got = await prepareView(range, direct() && s.windowOnly ? "window" : "full", gen, recheck);
      if (got.stale || gen !== s.gen) return;
      if (got.failed) return fail(got.failed, got.dest, got.why);
      if (got.reused) return set({ phase: "result", prep: null, raw: { ...got.reused, reused: true } });
      set({ phase: "confirm", prep: got.view });
    }
    /** #326 one-click path (desktop window): the main process prepares and sends; the page only follows the check's status.
     *  rendering → 「准备」 (nothing sent yet), ready / sending → 「正在发」, done → the result. A failure after the clip was ready may have
     *  reached the receiver (sendError), unless the engine says it was refused before the request (NOT_SENT). */
    async function checkDirect(range, recheck, gen) {
      let got;
      const scope = s.windowOnly ? "window" : "full";
      try { got = await api.checkNow(range, recheck, scope); }
      catch (e) {
        if (gen !== s.gen) return;
        const code = e && e.code;
        if (code === "DESTINATION_UNVERIFIED") return fail(code, e.body && e.body.destination);
        // refused by the main process or the engine before anything was made: nothing left this computer
        return set({ phase: "result", prep: null, raw: { status: "no_result", reason: code === "BUSY" ? "BUSY" : code === "NEEDS_CLICK" ? "NEEDS_CLICK" : "PREPARE_FAILED", why: whyOf(code), findings: [] } });
      }
      if (gen !== s.gen) { api.cancel(got.reviewId).catch(() => {}); return; }
      s.prep = { reviewId: got.reviewId, state: "rendering" };   // what 「取消」 cancels
      let sentAsked = false;
      for (;;) {
        let v;
        try { v = await api.status(got.reviewId); } catch { v = null; }
        if (gen !== s.gen) return;
        const st = v && v.state;
        if (st === "done" && v.result && typeof v.result === "object") return set({ phase: "result", prep: null, raw: { ...v.result, scope: v.result.scope || scope, ...(got.reused ? { reused: true } : {}) } });
        if (st === "rendering") { if (s.phase !== "preparing") set({ phase: "preparing" }); }
        else if (st === "ready" || st === "sending") { sentAsked = true; if (s.phase !== "sending") set({ phase: "sending", scope }); }
        else {
          // failed / cancelled / expired / gone: sent or not, said plainly; never 「没发出去」 once the send may have started
          const reason = (v && typeof v.reason === "string" && v.reason) || "SEND_FAILED";
          const certain = !sentAsked || NOT_SENT.includes(reason);
          return set({ phase: "result", prep: null, raw: certain ? { status: "no_result", reason: sentAsked ? reason : "PREPARE_FAILED", why: whyOf(reason), findings: [] }
            : { status: "no_result", reason, why: whyOf(reason), sendError: true, findings: [] } });
        }
        await wait(pollMs);
        if (gen !== s.gen) return;
      }
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
      try { await api.cancel(old.reviewId); } catch { /* it runs out on its own; the engine may still say BUSY, which is reported, never sent */ }
      if (gen !== s.gen) return null;
      const got = await prepareView(s.range, "window", gen);
      if (got.stale || gen !== s.gen) return null;
      if (got.failed) { fail(got.failed, got.dest, got.why); return null; }
      if (got.reused) { set({ phase: "result", prep: null, raw: { ...got.reused, reused: true } }); return null; }
      const a = payloadOf(old), b = payloadOf(got.view);
      const da = destinationOf(old.willSend && old.willSend.to), db = destinationOf(got.view.willSend && got.view.willSend.to);
      // what 「只发这 10 秒」 said in the box is what goes: the same seconds, receiver and number of requests, and no words (payloadOf) — else show the box again
      const same = !!(a && b && b.scope === "window" && near_(a.video.start, b.video.start) && near_(a.video.end, b.video.end) && a.requests === b.requests
        && da && db && da.service === db.service && da.host === db.host && da.confirmed && db.confirmed && da.verified === db.verified);
      set({ phase: "confirm", prep: got.view, changed: !same });
      return null;
    }
    async function send(scope) {
      if (s.phase !== "confirm" || !s.prep) return false;
      if (scope !== "full" && scope !== "window") return false;
      const m = confirmModel(s.prep, "zh-CN");
      const btn = m.buttons.find((b) => b.id === scope);
      if (!m.canSend || !btn || !btn.enabled) return false;
      const gen = s.gen;
      let view = s.prep;
      if (scope === "window" && view.scope !== "window") { await switchToWindow(gen); return false; }
      if (gen !== s.gen) return false;
      set({ phase: "sending", scope, previewSrc: null });
      let raw;
      try { raw = await api.send(view); }
      catch (e) {
        if (gen !== s.gen) return false;
        // refused before the request was made (e.g. no real click): nothing left this computer; the box stays, the token is still good
        if (e && e.notSent === true && (e.code === "NEEDS_CLICK" || e.code === "NOT_READY")) { set({ phase: "confirm", prep: view, changed: false }); return false; }
        // the request itself failed: it may or may not have reached the receiver (JJ #326 sendFailed) — never 「没发出去」
        raw = e && e.notSent === true ? { status: "no_result", reason: e.code, why: whyOf(e.code), findings: [] }
          : { status: "no_result", reason: (e && e.code) || "SEND_FAILED", why: whyOf(e && e.code), sendError: true, findings: [] };
      }
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
    // 「再检查一次」 is the streamer's own: it asks the engine for a new check even when this stretch already has a result (PG 6922461279)
    return { state: s, check, preview, send, cancel, close, markFixed, recheck: () => (s.range ? check(s.range, true) : null),
      on(fn) { listeners.add(fn); return () => listeners.delete(fn); } };
  }

  /** A stand-in for the engine (#328's /api/review/* shapes): tests and nothing else. No network. */
  function stubApi(opts = {}) {
    const calls = [];
    const dest = opts.destination === undefined ? { service: "OpenRouter", host: "openrouter.ai", source: "owner-authorised", confirmed: true, verified: false, status: "主人授权，运行时未抓包核实" } : opts.destination;
    let n = 0;
    const live = new Map();
    const result = opts.result || ((scope, range) => ({ status: "issues", range, scope, findings: [
      { id: 0, t: range.start + 4.2, type: "speaker_swapped", text: "左边的人说话时，字幕标成了右边的名字。", suggestion: "把这两句字幕的说话人对调。", inLead: false, mark: null }],
    dimensions: { fact: { state: "issues", reason: "名牌和说话的人对不上。" }, subtitle: { state: "passed", reason: "" }, pacing: { state: "passed", reason: "" }, packaging: { state: "passed", reason: "" } },
    summary: "", textAvailable: true }));
    const view = (r) => ({ reviewId: r.id, state: r.state, range: r.range, lead: r.lead, scope: r.scope, mode: "single",
      willSend: r.state === "ready" ? { what: "a short video clip (with its sound) of this stretch", to: dest, requests: 1, tasteNotes: r.notes.length,
        leadIn: r.lead > 0 ? { from: +(r.range.start - r.lead).toFixed(2), to: r.range.start, seconds: r.lead } : null,
        ...(opts.standards ? { standards: { ...opts.standards, carriedBy: "only" } } : {}), ...(opts.tasteLost != null ? { tasteLost: r.scope === "full" ? opts.tasteLost : 0 } : {}),
        projectText: r.scope === "full" ? (opts.projectText != null ? opts.projectText : "18.00-21.50s text: 前面那句\n22.00-26.00s text: 这一句") : "", notes: r.notes,
        hash: "a".repeat(64), seconds: +(r.range.end - r.range.start + r.lead).toFixed(2), tokenExpiresAt: "2026-11-14T00:10:00Z" } : undefined,
      previewSrc: r.state === "ready" ? "/previews/preview_" + r.id + ".mp4" : undefined,
      sendToken: r.state === "ready" && !opts.noPage ? r.token : undefined });
    return {
      calls, live,
      async available() { calls.push(["available"]); return opts.available !== false; },
      async prepare(b) {
        calls.push(["prepare", b]);
        if (opts.reused && !b.recheck) return { reviewId: "r_old", state: "done", reused: true, reason: "ALREADY_CHECKED", result: { reviewId: "r_old", source: "streamer", ...result(b.scope || "full", { start: b.start, end: b.end }) } };
        if (opts.prepareError) { const e = new Error(opts.prepareError); e.code = opts.prepareError; if (opts.prepareError === "DESTINATION_UNVERIFIED") e.body = { destination: dest }; throw e; }
        const id = "r_" + (++n), lead = +Math.min(3, b.start).toFixed(3);
        const k = (b.scope || "window") === "full" || opts.windowTaste ? opts.taste || 0 : 0;
        const r = { id, range: { start: b.start, end: b.end }, lead, scope: b.scope || "window", state: "rendering", token: "tok_" + n,
          notes: Array.from({ length: k }, (_, i) => ({ kind: i % 2 ? "negative" : "positive", aspect: i % 2 ? null : "subtitle", text: "例子 " + (i + 1) })), polls: opts.renderPolls == null ? 1 : opts.renderPolls };
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
      async send(v) {   // the main process's answer, as montclipReview.send gives it (#347)
        const id = v && v.reviewId, token = v && v.sendToken;
        calls.push(["send", id, token]);
        if (opts.sendRefused) { const e = new Error(opts.sendRefused); e.code = opts.sendRefused; e.notSent = true; throw e; }
        const r = live.get(id);
        if (!r || r.state !== "ready" || r.token !== token) { const e = new Error("not ready"); e.code = "NOT_READY"; e.notSent = true; throw e; }
        r.state = "done"; live.delete(id);
        return { reviewId: id, source: "streamer", ...result(r.scope, r.range) };
      },
      async cancel(id) { calls.push(["cancel", id]); if (opts.cancelDelay) await new Promise((res) => setTimeout(res, opts.cancelDelay)); const r = live.get(id); if (r) { r.state = "cancelled"; live.delete(id); } return { reviewId: id, state: "cancelled" }; },
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
          const pay = m.payload;   // the words the clip goes with, shown as the engine will send them (textContent only)
          if (pay && pay.scope === "full") {
            if (pay.text) { box.appendChild(el(doc, "p", "dim review-note", t(lang, "previewText"))); const pre = el(doc, "pre", "review-text", pay.text); pre.dataset.review = "text"; box.appendChild(pre); }
            if (pay.notes.length) {
              box.appendChild(el(doc, "p", "dim review-note", t(lang, "previewNotes")));
              const ul = el(doc, "ul", "review-notes");
              for (const x of pay.notes) {
                const tag = x.aspect ? t(lang, x.kind === "negative" ? "noteBadOn" : "noteGoodOn", { label: t(lang, "noteDim_" + x.aspect) }) : t(lang, x.kind === "negative" ? "noteBad" : "noteGood");
                const li = el(doc, "li", null, tag + t(lang, "noteSep") + x.text); li.dataset.review = "note"; ul.appendChild(li);
              }
              box.appendChild(ul);
            }
            if (!pay.text) box.appendChild(el(doc, "p", "dim review-note", t(lang, "previewNoText")));
          } else if (pay && pay.scope === "window") box.appendChild(el(doc, "p", "dim review-note", t(lang, "previewNoTextWindow")));
          if (pay && pay.fixed) {   // folded: the same words the engine sends every time
            const d = el(doc, "details", "review-fixed"); d.dataset.review = "standards";
            d.appendChild(el(doc, "summary", null, t(lang, "fixedTitle")));
            if (pay.fixed.laterOnly) { const p = el(doc, "p", "dim review-note", t(lang, "fixedTwice")); p.dataset.review = "fixedTwice"; d.appendChild(p); }
            const part = (title, items, key) => { d.appendChild(el(doc, "p", "dim review-note", title)); const ol = el(doc, "ol", "review-notes");
              for (const x of items) { const li = el(doc, "li", null, x); li.dataset.review = key; ol.appendChild(li); } d.appendChild(ol); };
            part(t(lang, "fixedStandards"), pay.fixed.standards, "standard");
            part(t(lang, "fixedQuestions"), pay.fixed.questions, "question");
            const ask = el(doc, "p", "dim review-note", pay.fixed.ask); ask.dataset.review = "ask"; d.appendChild(ask);
            box.appendChild(d);
          }
        }
        for (const b of m.buttons) {
          if (b.hidden) continue;   // view-only (PG #321 6872395398): a send button that cannot send is not shown at all
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
