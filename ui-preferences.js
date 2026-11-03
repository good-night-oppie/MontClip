/* View preferences only: no project, history, media or network ownership. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./ui-terms"));
  else root.MontClipView = factory(root.MontClipTerms);
})(typeof globalThis !== "undefined" ? globalThis : this, function (terms) {
  "use strict";
  const KEY = "montclip-view-v1";
  const text = {
    "zh-CN": { simple: "简单", advanced: "高级", language: "界面语言", undo: "撤销", redo: "重做", assistant: "助手", close: "收起", unavailable: "尚未连接 AI 服务。手动剪辑不受影响。", pending: "AI 服务接入尚未完成，当前不会发送任何内容。", mode: "编辑模式" },
    en: { simple: "Simple", advanced: "Advanced", language: "Interface language", undo: "Undo", redo: "Redo", assistant: "Assistant", close: "Hide", unavailable: "No AI service connected. Manual editing is available.", pending: "AI service integration is not ready. Nothing is sent.", mode: "Editing mode" },
  };
  // H.264 export (Settings): the bundled LGPL FFmpeg has no libx264; a user may pick their own FFmpeg.
  // The server and the desktop main process send reason codes; these say them (JJ, 2026-11-02).
  Object.assign(text["zh-CN"], {
    h264Title: "H.264 导出",
    h264Using: "现在用：{encoder}。",
    h264None: "这台电脑上没有可用的 H.264 编码器。",
    h264External: "已使用你选的本机 FFmpeg（x264）：{path}",
    h264ExternalFailed: "你选的本机 FFmpeg 不能用，已改回内置编码：{reason}",
    h264Hint: "默认会用你的显卡或 Windows 自带的编码器导出，不用设置也能正常导出。想要画质更好，可以另外选一个你电脑上带 x264 的 FFmpeg：它只用来导出 H.264，预览和其他格式还用内置的。MontClip 不会去网上下载，也不会自己到处找。",
    h264Choose: "选择本机 FFmpeg…",
    h264Clear: "不再使用这个 FFmpeg",
    h264NoneWin: "这台电脑上找不到能用的 H.264 编码器：显卡编码器没有响应，Windows 自带的编码器也用不了。你可以在下面选一个带 x264 的 FFmpeg，或者导出时换一种格式。",
    h264NoneOther: "这台电脑上找不到能用的 H.264 编码器。你可以在下面选一个带 x264 的 FFmpeg，或者导出时换一种格式。",
    h264NeedFeaturePack: "你的 Windows 好像是不带媒体组件的「N 版」。请在 Windows 设置 › 应用 › 可选功能里安装「媒体功能包」（Media Feature Pack），然后重新打开 MontClip。",
    extNotFullPath: "请选 FFmpeg 程序文件本身（ffmpeg.exe）。",
    extGone: "之前选的 FFmpeg 已经不在原来的位置了。请重新选一次，或者点「不再使用这个 FFmpeg」。",
    extNotFfmpeg: "选的程序打不开，或者它不是 FFmpeg。请重新选。",
    extNoX264: "这个 FFmpeg 里没有 x264，用它导出画质不会更好。可以换一个带 x264 的，或者直接用内置编码。",
    extSettingBad: "之前保存的 FFmpeg 设置读不出来了。请在设置里重新选一次。",
    frameTooSmall: "导出的画面太小（{w}×{h}），这台电脑的显卡编码器处理不了。请把导出尺寸调大一点，或者换一种格式。",
    extNotUsedNote: "这次没用你选的 FFmpeg（{reason}），改用了 {encoder}。",
    ffmpegMissing: "MontClip 自带的 FFmpeg 找不到了，导出和预览用不了。请重新安装 MontClip。",
    // not in JJ's list: for JJ to review
    extNeeded: "这个导出设置要用 x264，需要先在设置里选一个带 x264 的 FFmpeg。也可以改用导出预设，用显卡或 Windows 自带的编码器。",
    extSaveFailed: "这次的选择没能保存，请再选一次。",
    extRemoveFailed: "没能停用这个 FFmpeg，请再试一次。",
  });
  Object.assign(text.en, {
    h264Title: "H.264 export",
    h264Using: "Now using: {encoder}.",
    h264None: "This computer has no H.264 encoder MontClip can use.",
    h264External: "Using the FFmpeg you chose (x264): {path}",
    h264ExternalFailed: "The FFmpeg you chose cannot be used, so the built-in encoders are used instead: {reason}",
    h264Hint: "By default MontClip exports with your graphics card or Windows' built-in encoder, so export works without any setup. For better quality you can also choose an FFmpeg on this computer that has x264: it is used only for H.264 export, and preview and other formats keep the built-in one. MontClip does not download anything or search for it.",
    h264Choose: "Choose local FFmpeg…",
    h264Clear: "Stop using this FFmpeg",
    h264NoneWin: "This computer has no H.264 encoder MontClip can use: no graphics-card encoder answered, and Windows' built-in encoder is not available. You can choose an FFmpeg with x264 below, or export in another format.",
    h264NoneOther: "This computer has no H.264 encoder MontClip can use. You can choose an FFmpeg with x264 below, or export in another format.",
    h264NeedFeaturePack: " Your Windows looks like an \"N\" edition without media components. Install the Media Feature Pack in Windows Settings › Apps › Optional features, then open MontClip again.",
    extNotFullPath: "Choose the FFmpeg program file itself (ffmpeg.exe).",
    extGone: "The FFmpeg you chose is no longer where it was. Choose it again, or click \"Stop using this FFmpeg\".",
    extNotFfmpeg: "The chosen program could not be started, or it is not FFmpeg. Choose again.",
    extNoX264: "This FFmpeg has no x264, so exporting with it would not improve quality. Choose one with x264, or use the built-in encoders.",
    extSettingBad: "The saved FFmpeg setting could not be read. Choose it again in Settings.",
    frameTooSmall: "The exported picture is too small ({w}×{h}) for this computer's graphics-card encoder. Export a larger size, or choose another format.",
    extNotUsedNote: "The FFmpeg you chose was not used this time ({reason}); {encoder} was used instead.",
    ffmpegMissing: "MontClip's built-in FFmpeg cannot be found, so export and preview are unavailable. Reinstall MontClip.",
    extNeeded: "This export setting uses x264: first choose an FFmpeg with x264 in Settings, or use a delivery preset, which exports with your graphics card or Windows' built-in encoder.",
    extSaveFailed: "The choice could not be saved. Choose again.",
    extRemoveFailed: "Could not stop using this FFmpeg. Try again.",
  });
  // encoders by name: plain words in Chinese, the technical names (delivery.js labels) in English
  const ENCODER_NAMES = {
    "zh-CN": { h264_nvenc: "显卡编码（NVIDIA）", h264_mf: "Windows 自带编码", h264_qsv: "显卡编码（Intel）", h264_amf: "显卡编码（AMD）",
      libx264: "你选的 FFmpeg（x264）", h264_videotoolbox: "硬件编码（Apple）" },
    en: { h264_nvenc: "NVIDIA NVENC", h264_mf: "Windows Media Foundation", h264_qsv: "Intel Quick Sync", h264_amf: "AMD AMF",
      libx264: "x264 (your FFmpeg)", h264_videotoolbox: "Apple Silicon VideoToolbox" },
  };
  const lang = (l) => (text[l] ? l : "en");
  function h264Encoder(language, id) { return ENCODER_NAMES[lang(language)][id] || id; }
  const fill = (s, v) => s.replace(/\{(\w+)\}/g, (m, k) => (k in v ? v[k] : m));
  /** A reason code from the server or the desktop main process, in the interface language; null when unknown. */
  function h264Message(language, r) {
    const t = text[lang(language)];
    if (!r || typeof r.code !== "string" || !/^(h264|ext|frame|ffmpeg)[A-Za-z0-9]+$/.test(r.code) || typeof t[r.code] !== "string") return null;
    const p = r.params || {};
    let s = t[r.code];
    if (r.code === "extNotUsedNote") s = fill(s, { reason: (h264Message(language, { code: p.reason }) || "").replace(/[。.]$/, ""), encoder: h264Encoder(language, p.encoder) });
    else s = fill(s, Object.fromEntries(Object.entries(p).map(([k, v]) => [k, String(v)])));
    if (/^h264None/.test(r.code) && r.featurePack) s += t.h264NeedFeaturePack;
    return s;
  }
  // MontClip's own wording for keyed strings the terms SPEC does not cover.
  const own = {
    "needs-server": ["Needs the MontClip server", "需要 MontClip 服务"],
    "add-title": ["+ Title", "+ 标题"],
    "add-adjust": ["+ Adjust", "+ 调节层"],
    "add-adjust-title": ["Add an adjustment layer (grades everything below it)", "添加调节层（调节它下面的所有画面）"],
    "add-import": ["+ Import", "+ 导入"],
    "add-url": ["+ URL", "+ 网址"],
    // the Transcript tab's sentence button, one language at a time (for JJ to review)
    "tr-sentences": ["Select sentences", "按句选段"],
    // the Save dialog's outcome in the desktop app (VV, 012ba18; for JJ to review)
    "save-canceled": ["Not saved. Click again if you need it.", "没有保存。需要的话再点一次。"],
    "save-failed": ["The save did not finish. Try another location, or check that it has enough space.", "没有保存成功。请换个位置再试，或者看看那里的空间够不够。"],
    // the export queue and what a cancel says (JJ's final wording, 2026-11-02)
    "q-save": ["Save", "保存"],
    "q-list": ["Export queue", "导出队列"],
    "q-list-n": ["Export queue · {n}", "导出队列 · {n}"],
    "q-saved": ["Saved", "已保存"],
    "export-save-cancelled": ["Not saved. The exported video is still here: open the export queue and click Save on this item to save it again.", "没有保存。导出的视频还在，打开『导出队列』，在这一条后面点『保存』就能再存一次。"],
    "captions-save-cancelled": ["Captions not saved. Click export captions again to save them.", "字幕没有保存。可以再点一次导出字幕。"],
    "save-busy": ["Close the save window that is already open first.", "先关掉上一个保存窗口"],
    "export-save-failed": ["The save did not finish. The exported video is still here: open the export queue and click Save on this item to try again. If it still fails, choose another location or check that it has enough space.", "没有保存成功。导出的视频还在，打开『导出队列』，在这一条后面点『保存』再试一次；还不行的话，换个位置保存，或者看看那里的空间够不够。"],
    "import-url-title": ["Download media from an HTTPS URL into the project", "从 HTTPS 网址下载素材到项目"],
    "fit": ["Fit", "适配"],
    "or-click": ["or click", "或点击"],
    "lift-title": ["Lift (;) — remove IN→OUT on targeted tracks, leave the gap", "提起（;）— 删除目标轨道上入点到出点的内容，留下空隙"],
    "extract-title": ["Extract (') — remove IN→OUT on targeted tracks and close the gap", "提取（'）— 删除目标轨道上入点到出点的内容，并补上空隙"],
    "inspector-empty": ["Select a clip to edit its transform, effects & audio.", "选中一个片段以编辑它的画面、特效与音频。"],
    "exporting-pct": ["Exporting… {pct}%", "正在导出… {pct}%"],
    "rendering-pct": ["Rendering… {pct}%", "正在渲染… {pct}%"],
    "encoding": ["Encoding…", "正在编码…"],
    "encoding-pct": ["Encoding… {pct}%", "正在编码… {pct}%"],
    "mixing-audio": ["Mixing audio…", "正在混音…"],
    "finishing": ["Finishing…", "正在收尾…"],
    // narrow windows: tools that do not fit a bar (JJ to review)
    "more": ["More", "更多"],
    // batch 2: the Transcript panel and the top bar status (JJ to review). Chinese transcripts
    // carry sentence times only, so the Chinese never counts or cuts words.
    "transcribe": ["Transcribe", "听写"],
    "transcribe-selected": ["Transcribe selected ({n})", "听写所选（{n}）"],
    "transcribe-file": ["Transcribe {n} file", "听写 {n} 个文件"],
    "transcribe-files": ["Transcribe {n} files", "听写 {n} 个文件"],
    "found": ["{n} found", "找到 {n} 处"],
    "cut-all": ["Cut all out", "全部剪掉"],
    "cut-n": ["Cut out {n}", "剪掉 {n} 处"],
    "copy": ["Copy", "复制"],
    "select-sentences": ["Select sentences", "按句选段"],
    "mapping": ["Mapping", "时间映射"],
    "caption-last": ["Add captions last: once the edit changes, captions already added don't follow it, so add them again.", "字幕最后再加：剪辑改了以后，已经加好的字幕不会跟着对齐，要重新加一次。"],
    "tr-empty": ["Import an SRT subtitle file and the transcript will show here. Chinese transcription on this computer is still being developed.", "先导入 SRT 字幕文件，文稿就会显示在这里。本机中文听写还在开发中。"],
    "tr-missing": ["No transcript yet: {names}", "还没有文稿：{names}"],
    "tr-more": [" +{n} more", " 等 {n} 个"],
    "loading": ["Loading…", "加载中…"],
    "tr-no-words": ["No words in these clips.", "这些片段里没有听写出文字。"],
    "tr-module-missing": ["The transcript feature didn't load. Close MontClip and open it again.", "文稿功能没加载出来。请关掉 MontClip 再重新打开。"],
    "tr-downloading-model": ["Downloading the speech model (once)… {pct}%", "正在下载语音模型（只需一次）… {pct}%"],
    "tr-transcribing": ["Transcribing {name}… {pct}%", "正在听写 {name}… {pct}%"],
    "tr-transcribing-of": ["Transcribing {name} ({i} of {n})… {pct}%", "正在听写 {name}（第 {i} 个，共 {n} 个）… {pct}%"],
    "tr-selection": ["{n} words · {s} s · “{text}”", "已选 {s} 秒 · “{text}”"],
    "tr-selection-one": ["1 word · {s} s · “{text}”", "已选 {s} 秒 · “{text}”"],
    // the sentence dialog (JJ to review): one language at a time; the Chinese is the dialog's old wording
    "sd-busy": ["MontClip is busy with something else, such as exporting, importing, transcribing or saving. When it's done, click Select sentences again. If a save just failed, deal with that message first.", "软件正在忙别的事，比如导出、导入、听写或保存。等它做完，再点一次「按句选段」。如果刚才保存没成功，先处理那条提示。"],
    "sd-busy-save": ["Can't select sentences as the AI suggested yet: MontClip is busy with something else, such as exporting, importing, transcribing or saving. When it's done, click this suggestion again. If a save just failed, deal with that message first.", "现在还不能照 AI 的建议选段：软件正在忙别的事，比如导出、导入、听写或保存。等它做完，再点一次这条建议。如果刚才保存没成功，先处理那条提示。"],
    "sd-no-captions": ["Import an SRT or add captions first.", "按句选段要用到字幕：先导入 SRT 字幕文件，或者先加字幕。"],
    "sd-title": ["Select sentences", "按句选段"],
    "sd-intro": ["Only the checked sentences are kept, joined in order; the gaps and other media are removed from the edit. Source files stay unchanged, and one Undo restores it.", "只把勾选的句子接起来，其余部分从剪辑里去掉。原录像不会被改动，点一次撤销就能恢复。"],
    "sd-ranges": ["Or ordered ranges in seconds, one start,end per line (overrides the checks)", "或者按先后顺序填时间段（单位：秒，每行一段，写成 起点,终点）。填了就不看勾选。"],
    "sd-preview": ["Preview", "试听选段"],
    "sd-apply": ["Apply", "保留选段"],
    "sd-cancel": ["Cancel", "取消"],
    "sd-range-line": ["Enter start,end in seconds on each line.", "每行写一段：起点,终点（单位：秒）。"],
    "sd-summary": ["{ranges} → about {duration} in the final cut, in selection order.", "{ranges} → 成片大约 {duration}，按勾选的顺序接起来。"],
    "sd-partial": ["{n} sentence keeps only part of its sound: check its caption and where it starts and ends.", "这一句只保留了一部分声音，请检查这一句的字幕和开头结尾。"],
    "sd-partial-many": ["{n} sentences keep only part of their sound: check their captions and where they start and end.", "{n} 句只保留了一部分声音，请检查这几句的字幕和开头结尾。"],
    "sd-changed": ["The project has changed: close this and select again.", "项目刚改过。请关掉这个窗口，重新选一次。"],
    "sd-done": ["Sentences joined. Undo is available.", "已经接好了。不满意可以撤销。"],
    "rp-invalid": ["Select valid ordered ranges.", "时间段不对：请按先后顺序填写，每段的起点要小于终点。"],
    "rp-exceeds": ["The selection goes past the end of the timeline.", "选的时间超出了时间线的结尾。"],
    "rp-locked": ["Unlock clips and tracks first.", "有片段或轨道锁住了，先解锁再试。"],
    "rp-nested": ["Nested, parented or speed-ramped clips need editing by hand.", "这里有嵌套片段、绑定关系或变速，按句选段处理不了，请手动剪。"],
    "rp-short-media": ["The selected piece is too short to cut. Move the start and end further apart.", "选中的片段太短，剪不出来。请把起点和终点拉开一点。"],
    "rp-source-changed": ["The subtitle timing changed after you selected. Close this and select again.", "选好之后字幕的时间又变了。请关掉这个窗口，重新选一次。"],
    "rp-source-invalid": ["A clip's timing doesn't match its file. Check the clip, then select again.", "有片段的时间和它的文件对不上，请检查后重新选择。"],
    "rp-source-loop": ["A clip runs past the end of its file; selecting sentences doesn't support that yet.", "有片段比它的原文件还长，按句选段暂时处理不了。"],
    // refusals the server sends as a code (JJ to review); the Chinese is the old message's Chinese half
    "err-offline": ["Offline mode: import a local file.", "这一版不联网，不能从网址下载。请导入电脑里的文件。"],
    "err-headless-disabled": ["Background browser tasks are turned off in the desktop app.", "桌面版不能在后台打开浏览器做这件事。"],
    "err-editor-not-ready": ["The editor is not ready yet. Open it, then try again.", "编辑窗口还没准备好。先打开 MontClip 的编辑窗口，再试一次。"],
    "err-editor-no-accept": ["The editor did not take the task. Wait until it is ready, then try again.", "编辑窗口没接到这个任务。等它准备好，再试一次。"],
    "map-no-media": ["This project has no audio or video, so there is no time mapping to export.", "这个项目里没有音视频，导不出时间对照表。"],
    "connected": ["Ready", "就绪"],
    "local-session": ["The local program isn't responding. Reopen MontClip", "本机程序没响应，请重开 MontClip"],
    "tl-above-captions": ["Captions above, click to show", "上方有字幕轨，点这里显示"],
    // P2 highlight cards (for JJ to review)
    "hl-open": ["Highlight candidates", "高光候选"],
    "hl-title": ["Highlight candidates (worked out on this computer; no AI)", "高光候选（只在本机判断，不调用 AI）"],
    "hl-reading": ["Reading the timeline's sound and sentences…", "正在读取时间线的声音和字幕…"],
    "hl-found": ["{n} candidates. Go to one to check it; tick the ones to keep.", "找到 {n} 个候选。可以先点「跳转」看一看，再勾选要保留的。"],
    "hl-jump": ["Go to", "跳转"],
    "hl-back": ["Highlight candidates ({n}) — back to the list", "高光候选（{n}）· 回到列表"],
    "hl-keep": ["Keep only the ticked ones", "只留勾选的片段"],
    "hl-keep-note": ["Everything not ticked is cut from the timeline. The source files stay as they are, and Undo brings it back.", "没勾选的部分会从时间线上剪掉；原片不变，可以撤销。"],
    "hl-dur": [" ({s} s)", "（{s} 秒）"],
    "hl-close": ["Close", "关闭"],
    "hl-kept": ["Kept only {n} highlights; the rest was cut from the timeline. Undo brings it back.", "已只留 {n} 段高光，其余部分已从时间线上剪掉。可以撤销。"],
    "hl-busy": ["Finish the export or leave the nested edit first.", "请先结束导出或退出嵌套编辑。"],
    "hl-changed": ["The project changed while reading: close this and try again.", "读取时项目有变化，请关闭后重新打开。"],
    "hl-empty-no-media": ["There is nothing on the timeline yet. Import a recording, drag it onto the timeline, then click Highlight candidates.", "时间线上还没有素材。先导入录像并拖到时间线上，再点「高光候选」。"],
    "hl-empty-no-signals": ["Nothing to go on: no subtitles on the timeline and no sound to read.", "没有能用来判断的内容：时间线上没有字幕，也读不到声音。"],
    "hl-empty-nothing-stands-out": ["No clear highlight: nothing is louder than usual, and no burst of danmaku.", "没有找到明显的高光：没有哪一段比平常更响，弹幕也没有突然变多。"],
    "hl-r-loudness": ["Louder than usual", "比平时响"],
    "hl-r-loudness-detail": ["{db} dB above the usual level of the whole timeline (the loudest moment {peak} dB above)", "比整场平时的音量高 {db} 分贝（最响处高 {peak} 分贝）"],
    "hl-r-loudness-peak": ["One moment is much louder", "有一下特别响"],
    "hl-r-loudness-peak-detail": ["The loudest moment is {peak} dB above the usual level", "最响处比平时高 {peak} 分贝"],
    "hl-r-danmaku": ["{count} danmaku, {ratio}× the usual rate", "弹幕 {count} 条，是平时的 {ratio} 倍"],
    "hl-r-speech": ["Talking faster than usual (about {ratio}×)", "说话比平时快（约 {ratio} 倍）"],
    // Closing during an export (desktop/export-close.js; JJ's final copy 「追加 3」, one video per 「预备稿 4 补充」; English for JJ to review)
    "export-close-title": ["Still exporting. Close now?", "还在导出，现在关掉吗？"],
    "export-close-body": ["Closing MontClip stops the export. The half-finished video won't be kept; next time you'll need to export it again from the start.", "关掉 MontClip 会停止导出。导到一半的视频不会留下，下次要从头再导。"],
    "export-close-unsaved-1": ["1 exported video in the export queue isn't saved yet. After closing it won't be in the queue any more, but it still takes up space on drive C.", "导出队列里还有 1 个没保存的视频，关掉以后它不会再出现在队列里，但还占着 C 盘空间。"],
    "export-close-unsaved-n": ["{n} exported videos in the export queue aren't saved yet. After closing they won't be in the queue any more, but they still take up space on drive C.", "导出队列里还有 {n} 个没保存的视频，关掉以后它们不会再出现在队列里，但还占着 C 盘空间。"],
    "export-close-stop": ["Stop export and close", "停止导出并关闭"],
    "export-close-keep": ["Keep exporting", "继续导出"],
    // Closing with exported videos not saved (JJ's 「预备稿 4」 and its one-video forms; English for JJ to review)
    "export-unsaved-title-1": ["1 video isn't saved yet. Close now?", "还有 1 个视频没保存，现在关掉吗？"],
    "export-unsaved-title-n": ["{n} videos aren't saved yet. Close now?", "还有 {n} 个视频没保存，现在关掉吗？"],
    "export-unsaved-body-1": ["This video is exported but not yet saved where you choose. After closing it won't be in the export queue any more, but it still takes up space on drive C.", "这个视频已经导出好了，还没存到你选的地方。关掉以后，导出队列里就找不到它了，但它还占着 C 盘空间。"],
    "export-unsaved-body-n": ["These videos are exported but not yet saved where you choose. After closing they won't be in the export queue any more, but they still take up space on drive C.", "这些视频已经导出好了，还没存到你选的地方。关掉以后，导出队列里就找不到它们了，但它们还占着 C 盘空间。"],
    "export-unsaved-delete-1": ["Delete it and close", "删掉它并关闭"],
    "export-unsaved-delete-n": ["Delete them and close", "删掉它们并关闭"],
    "export-unsaved-keep": ["Close without deleting", "不删，直接关闭"],
    "export-unsaved-save": ["Save first", "先去保存"],
    "export-delete-failed-1": ["1 video could not be deleted. Another program may have it open.", "有 1 个视频删不掉，可能正被别的软件打开着。"],
    "export-delete-failed-n": ["{k} videos could not be deleted. Another program may have them open.", "有 {k} 个视频删不掉，可能正被别的软件打开着。"],
    "export-delete-retry": ["Try again", "再试一次"],
    "export-delete-hint-1": ["Close the program that has it open (such as a player), then click Try again.", "先关掉正在用它的软件（比如播放器），再点「再试一次」。"],
    "export-delete-hint-n": ["Close the programs that have them open (such as a player), then click Try again.", "先关掉正在用它们的软件（比如播放器），再点「再试一次」。"],
    "export-delete-giveup": ["Don't delete, just close", "不删了，直接关闭"],
    // Chinese batch 3: JJ's final copy v2 (2026-11-03), P0 rows. The English is what the page said before.
    "pj-new": ["+ New project", "+ 新建项目"],
    "pj-open": ["Open", "打开"],
    "pj-currently-open": ["Currently open", "当前已打开"],
    "pj-open-now": ["open now", "当前已打开"],
    "pj-canvas": ["Canvas", "画面"],
    "pj-length": ["Length", "时长"],
    "pj-length-value": ["{dur} · {clips} clips · {media} media", "{dur} · {clips} 个片段 · {media} 个素材"],
    "pj-length-value-1": ["{dur} · {clips} clip · {media} media", "{dur} · {clips} 个片段 · {media} 个素材"],
    "pj-modified": ["Modified", "修改时间"],
    "pj-opened": ["Opened", "打开时间"],
    "pj-created": ["Created", "创建时间"],
    "pj-notes": ["Notes", "备注"],
    "pj-tags": ["Tags", "标签"],
    "pj-duplicate": ["Duplicate", "复制一份"],
    "pj-save-template": ["Save as template", "存成模板"],
    "pj-archive": ["Archive", "归档"],
    "pj-versions": ["Versions…", "历史版本…"],
    "pj-download-backup": ["Download backup", "下载备份"],
    "pj-when-opened": ["Opened {when}", "{when}打开过"],
    "pj-when-modified": ["Modified {when}", "{when}修改过"],
    "pj-when-created": ["Created {when}", "{when}创建"],
    "ago-now": ["just now", "刚刚"],
    "ago-min": ["{n} min ago", "{n} 分钟前"],
    "ago-hour": ["{n} h ago", "{n} 小时前"],
    "ago-yesterday": ["yesterday", "昨天"],
    "settings-link-hint": ["Selecting a timeline clip highlights its media in Project, and the reverse. Off by default.", "选中时间线上的片段时，素材区里对应的素材也会高亮，反过来也一样。默认关闭。"],
    "clip-disable": ["Disable clip", "停用片段"],
    "clip-lock": ["Lock clip", "锁定片段"],
    "clip-parent-null": ["Parent to a new null", "绑定到新的空对象"],
    "meter-rms": ["RMS", "音量"],
    "media-kind-video": ["video", "视频"],
    "fps-value": ["{n} fps", "{n} 帧/秒"],
    "export-range-full": ["Full timeline · {from} → {to}", "整条时间线 · {from} → {to}"],
    "engine-fast-note": ["Frame-accurate. Server encodes from JPEG frames. Keeps going if you switch tabs.", "逐帧准确。由本机程序一帧帧编码，切到别的页面也会继续导出。"],
    "engine-webcodecs": ["WebCodecs (HW encode)", "显卡加速编码"],
    // 「快速（ffmpeg）」 is the Fast radio's own Chinese label (term.fast-ffmpeg)
    "engine-webcodecs-note": ["Frame-accurate. Browser HW-encodes H.264; server muxes with audio. Faster upload than Fast.", "逐帧准确。用显卡编码，比「快速（ffmpeg）」那一项更快。"],
    // delivery.js keeps the English note for agents; the dialog shows this one
    "dlv-note-master": ["Project size · H.264 CRF 16 · AAC 320k", "和项目一样大 · 高画质（H.264 CRF 16 · AAC 320k）"],
    "dlv-resolution": ["Resolution", "分辨率"],
    "dlv-frame-rate": ["Frame rate", "帧率"],
    "dlv-codec": ["Codec", "视频编码"],
    "dlv-encoder": ["Encoder", "编码器"],
    "dlv-rate-control": ["Rate control", "码率控制"],
    "dlv-maxrate": ["Max rate (Mb/s)", "最高码率 (Mb/s)"],
    "dlv-keyint": ["Keyframe every (s)", "关键帧间隔（秒）"],
    "dlv-speed": ["Encoder speed", "编码速度"],
    "dlv-pixfmt": ["Pixel format", "像素格式"],
    "dlv-container": ["Container", "文件格式"],
    "dlv-abitrate": ["Bitrate (kb/s)", "码率 (kb/s)"],
    "dlv-sample-rate": ["Sample rate", "采样率"],
    "dlv-channels": ["Channels", "声道"],
    "dlv-loudness": ["Loudness", "响度"],
    "dlv-file-name": ["File name", "文件名"],
    "dlv-file-preview": ["→ exports/{file}", "文件名：{file}（导出后会让你选保存位置）"],
    "dlv-tokens": ["Tokens: {tokens}", "可用的占位符：{tokens}"],
    "dlv-meta-title": ["Title", "标题"],
    "dlv-meta-artist": ["Artist / author", "作者"],
    "dlv-meta-copyright": ["Copyright", "版权"],
    "dlv-meta-date": ["Date", "日期"],
    "dlv-meta-description": ["Description", "简介"],
    "dlv-meta-keywords": ["Keywords", "关键词"],
    "dlv-batch-outputs": ["Batch outputs", "一次导出多个版本"],
    "dlv-batch-add": ["+ Add these settings", "+ 加上这套设置"],
    "dlv-batch-typical": ["+ Typical set", "+ 常用组合"],
    "dlv-batch-hint": ["One render, several files: every checked output is encoded from the same frames. Saved with the project.", "渲染一次，导出多个文件：勾上的版本都用同一份画面。会跟项目一起保存。"],
    "dlv-batch-empty": ["No batch outputs yet — add the settings above, or a typical set", "还没有要一起导出的版本：把上面的设置加进来，或者选「常用组合」。"],
    "export-checked": ["Export checked", "导出勾选的版本"],
    "export-checked-n": ["Export checked ({n})", "导出勾选的版本（{n}）"],
    "export-failed-prefix": ["Export failed: ", "导出失败："],
  };
  for (const [k, [en, zh]] of Object.entries((terms && terms.rows) || {})) { text.en["term." + k] = en; text["zh-CN"]["term." + k] = zh; }
  for (const [k, [en, zh]] of Object.entries(own)) { text.en["own." + k] = en; text["zh-CN"]["own." + k] = zh; }
  /** Keyed lookup: the language's string, else the English one, else "" (never the key). */
  /** A length as mm:ss, h:mm:ss from an hour; "" for none. The same as the Agent pane's durationText (agent-conversation.js, #26). */
  function clock(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return "";
    const n = Math.floor(seconds), h = Math.floor(n / 3600), m = Math.floor(n / 60) % 60, s = n % 60;
    return (h ? h + ":" : "") + String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
  }
  function durationText(seconds) { return Number.isFinite(seconds) && seconds > 0 ? clock(Math.max(1, Math.round(seconds))) : ""; }
  function t(language, key, vars) {
    const s = (text[language] && text[language][key]) ?? text.en[key] ?? "";
    return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : s;
  }
  /** How long ago `then` was, seen from `now` (default: now), in the interface language:
      刚刚 / {n} 分钟前 / {n} 小时前 / 昨天 / {月}-{日} (with the year when it is another year).
      A time in the future reads as its date; an unreadable one as "". */
  function ago(language, then, now) {
    const a = new Date(then), b = now == null ? new Date() : new Date(now);
    if (isNaN(a) || isNaN(b)) return "";
    const s = (b - a) / 1000, say = (key, vars) => t(language, "own." + key, vars);
    if (s >= 0 && s < 60) return say("ago-now");
    if (s >= 60 && s < 3600) return say("ago-min", { n: Math.floor(s / 60) });
    if (s >= 3600 && s < 86400) return say("ago-hour", { n: Math.floor(s / 3600) });
    const y = new Date(b.getFullYear(), b.getMonth(), b.getDate() - 1);
    if (s >= 86400 && a.getFullYear() === y.getFullYear() && a.getMonth() === y.getMonth() && a.getDate() === y.getDate()) return say("ago-yesterday");
    const same = a.getFullYear() === b.getFullYear(), p = (n) => String(n).padStart(2, "0");
    if (lang(language) === "zh-CN") return (same ? "" : a.getFullYear() + "-") + p(a.getMonth() + 1) + "-" + p(a.getDate());
    return a.toLocaleDateString("en-US", same ? { month: "short", day: "numeric" } : { year: "numeric", month: "short", day: "numeric" });
  }
  /** ago() for the 「{when}打开过 / 修改过 / 创建」 sentences: in Chinese a date is followed by a space (「11-02 打开过」),
   *  while 刚刚, 昨天 and 「3 分钟前」 run straight on (JJ, 2026-11-03). English is unchanged. */
  function when(language, then, now) {
    const s = ago(language, then, now);
    return lang(language) === "zh-CN" && /\d$/.test(s) ? s + " " : s;
  }
  /** Rewrite only elements that carry data-i18n markers; nothing else on the page. */
  const MARKS = [["[data-i18n]", "i18n", null], ["[data-i18n-title]", "i18nTitle", "title"],
    ["[data-i18n-placeholder]", "i18nPlaceholder", "placeholder"], ["[data-i18n-aria-label]", "i18nAriaLabel", "aria-label"]];
  function applyI18n(rootEl, language) {
    for (const [sel, key, attr] of MARKS) for (const el of rootEl.querySelectorAll(sel)) {
      const s = t(language, el.dataset[key]);
      if (!s) continue;
      if (attr) el.setAttribute(attr, s); else el.textContent = s;
    }
    // icon buttons: keep the icon, rewrite the label text after it
    for (const el of rootEl.querySelectorAll("[data-i18n-tail]")) {
      const s = t(language, el.dataset.i18nTail), node = [...el.childNodes].reverse().find(n => n.nodeType === 3 && n.data.trim());
      if (s && node) node.data = (node.data.match(/^\s*/)[0]) + s;
    }
  }
  // FLV import failures (JJ, 2026-11-02): the server sends a reason code, the page says it here.
  // The first three are JJ's wording; flvNeedsConvert, flvUploadFailed and flvComponentMissing are for JJ to review.
  Object.assign(text["zh-CN"], {
    flvTimingUnverified: "这个 FLV 这次没导进来：MontClip 没法确认它的时间是否完整。换一个录完整的文件，或者先把它转成 MP4 再导入。",
    flvNeedsDesktop: "导入 FLV 需要用 MontClip 桌面版打开。",
    flvDiskFull: "电脑空间不够，这个文件没导进来。清理一些空间后再试。",
    flvNeedsConvert: "这个 FLV 这次没导进来：它的编码 MontClip 现在不能直接用。先把它转成 MP4 再导入。",
    flvUploadFailed: "这个 FLV 没导进来：MontClip 处理这个文件时出了问题。再试一次；还不行就先把它转成 MP4 再导入。",
    flvComponentMissing: "MontClip 缺少处理 FLV 的组件，这个文件没导进来。请重新安装 MontClip。",
    // desktop FLV import (for JJ to review)
    flvTitle: "导入 FLV", flvCancel: "取消", flvContinue: "继续导入",
    flvPhaseInspect: "正在检查原片…", flvPhaseHash: "正在核对原片… {pct}%", flvPhaseCopy: "正在复制到项目… {pct}%",
    flvPhaseVerify: "正在核对复制出的文件… {pct}%", flvPhasePrepare: "正在生成兼容副本…",
    flvAskTranscode: "这个 FLV 要转成兼容的 MP4 才能剪，可能会改变画质，需要等一会儿。原片不会改动。",
    flvAskReadable: "MontClip 没能确认这个 FLV 的结尾是完整的（可能还在录，或者录制中断过）。继续的话，只导入能读到的部分。原片不会改动。",
    flvSourceChanged: "原片在检查之后变了（可能还在录制），这次没导入，复制出的文件已删除。录完后再试。",
    flvCopyMismatch: "复制出的文件和原片对不上，这次没导入，复制出的文件已删除。再试一次。",
    flvCanceled: "已取消。这次导入建的文件都已删除，原片没有改动。",
    flvCleanupFailed: "这次导入建的文件有一部分没能删除，可能正被占用。关掉 MontClip 时会再删一次。",
    // #28: the bundled FFmpeg has no x264, so converting needs this computer's own encoder (for JJ to review)
    flvNoEncoder: "这个 FLV 需要转换格式才能用，但这台电脑上找不到能用的 H.264 编码器（显卡编码器和 Windows 自带的编码器都用不了）。先把它转成 MP4 再导入。",
  });
  Object.assign(text.en, {
    flvTimingUnverified: "This FLV was not imported: MontClip could not confirm its timing is complete. Try a fully recorded file, or convert it to MP4 first.",
    flvNeedsDesktop: "Importing FLV needs the MontClip desktop app.",
    flvDiskFull: "There is not enough space on this computer, so the file was not imported. Free up some space and try again.",
    flvNeedsConvert: "This FLV was not imported: MontClip cannot use its encoding directly yet. Convert it to MP4 first.",
    flvUploadFailed: "This FLV was not imported: something went wrong while MontClip was handling it. Try again; if it still fails, convert it to MP4 first.",
    flvComponentMissing: "MontClip is missing the component that handles FLV, so the file was not imported. Reinstall MontClip.",
    flvTitle: "Import FLV", flvCancel: "Cancel", flvContinue: "Continue",
    flvPhaseInspect: "Checking the original…", flvPhaseHash: "Checking the original… {pct}%", flvPhaseCopy: "Copying into the project… {pct}%",
    flvPhaseVerify: "Checking the copy… {pct}%", flvPhasePrepare: "Making a compatible copy…",
    flvAskTranscode: "This FLV has to be converted to a compatible MP4 before it can be edited. The picture may change a little, and it takes a while. The original is not changed.",
    flvAskReadable: "MontClip could not confirm that this FLV ends properly (it may still be recording, or the recording was interrupted). If you continue, only the part that can be read is imported. The original is not changed.",
    flvSourceChanged: "The original changed after it was checked (it may still be recording), so it was not imported and the copy was removed. Try again once the recording is finished.",
    flvCopyMismatch: "The copy did not match the original, so it was not imported and the copy was removed. Try again.",
    flvCanceled: "Canceled. The files this import made were removed; the original is unchanged.",
    flvCleanupFailed: "Some files this import made could not be removed; they may be in use. MontClip tries again when it closes.",
    flvNoEncoder: "This FLV needs converting before it can be used, but this computer has no H.264 encoder MontClip can use (no graphics-card encoder answered and Windows' built-in encoder is unavailable). Convert it to MP4 first.",
  });
  // A readable-range or timestamp problem is "timing unverified": the consent screens are deferred, so
  // nothing here asks for permission the user has nowhere to give. Unknown codes read as a failed import.
  const FLV_REASONS = { FLV_TIMELINE_GAP: "flvTimingUnverified", FLV_READABLE_CONSENT_REQUIRED: "flvTimingUnverified",
    FLV_DISK_FULL: "flvDiskFull", NO_SERVER: "flvNeedsDesktop", FLV_TRANSCODE_REQUIRED: "flvNeedsConvert",
    FLV_STREAMS_UNSUPPORTED: "flvNeedsConvert", FLV_COMPONENT_MISSING: "flvComponentMissing", FLV_ENCODER_MISSING: "flvNoEncoder",
    FLV_SOURCE_CHANGED: "flvSourceChanged", FLV_COPY_MISMATCH: "flvCopyMismatch", FLV_IMPORT_CANCELED: "flvCanceled", FLV_CLEANUP_FAILED: "flvCleanupFailed" };
  function flvImportMessage(language, code) {
    const t = text[language] || text.en;
    return t[Object.hasOwn(FLV_REASONS, code) ? FLV_REASONS[code] : "flvUploadFailed"];
  }
  Object.assign(text['zh-CN'],{paneLocalTemporary:'没能读取已存的会话。本次会话和草稿只在这次打开期间保留，关闭前请复制要留的内容。原有会话文件未改动。',paneLocalPolicy:'本机保存适用于已有项目 ID 的会话、草稿和明确引用；尚无项目 ID 的内容仅在本次窗口保留。这是保存范围说明，不表示本次内容已保存。不会自动发送。',paneSessionFailed:'会话保存尚未确认，当前编辑仍在此窗口。请保留草稿后重试；不会覆盖另一份更新的记录。',paneRetry:'重试保存会话',paneUser:'你',paneAssistant:'助手'});
  Object.assign(text.en,{paneLocalTemporary:'Saved sessions could not be read. Sessions and drafts from this window will not be saved; copy anything you want to keep before closing. The existing session file was not changed.',paneLocalPolicy:'Local storage applies to sessions, drafts and explicit references with a project ID; content without a project ID lasts only in this window. This describes storage scope, not confirmation that the current content was saved. Nothing is sent automatically.',paneSessionFailed:'Session saving is unconfirmed. Edits remain in this window. Keep your draft and retry; a newer stored snapshot will not be overwritten.',paneRetry:'Retry saving sessions',paneUser:'You',paneAssistant:'Assistant'});

  // Official-source port strings share the workbench locale and stable namespace.
  const officialPaneText={en:{undoLast:'Undo last edit (same as toolbar)',new:'New session',config:'AI service',save:'Save connection',provider:'Provider',model:'Model ID',key:'API key (leave blank to retain)',review:'Review exact outgoing messages',confirm:'Send these messages',cancel:'Cancel',draft:'Message',search:'Search sessions',close:'Collapse assistant',pending:'Request in progress…',failed:'Request failed or cancelled. Your draft is retained.',unconfigured:'No service configured. Nothing was sent.',saved:'Connection saved locally. No request was sent.',local:'Sessions are stored locally for this project. This is a policy, not a save receipt.',temporary:'Session storage could not be read. Drafts stay in this window only; copy what you need before closing.',unsaved:'Session save is not confirmed. Keep this window open and retry.',retry:'Retry save',proposal:'Review suggested edit',reference:'Quote selected captions',range:'Selected range',project:'Project identity',remove:'Remove',limit:'Text or session capacity exceeded; shorten the text or return to an existing session.',scope:'Open or create a project before sending.',configured:'Configured (connection not tested)',configFailed:'Configuration was not saved. Existing settings retained.',cancelUnknown:'The request status is not confirmed. Already sent requests cannot be recalled.',cancelled:'Generation cancelled; any already sent request cannot be recalled.'},
'zh-CN':{undoLast:'撤销上一步（与顶部撤销相同）',new:'新会话',config:'AI 服务',save:'保存连接配置',provider:'服务商',model:'模型 ID',key:'API 密钥（留空保留已有密钥）',review:'核对本次实际发送内容',confirm:'发送以上内容',cancel:'取消',draft:'输入消息',search:'搜索会话',close:'收起助手',pending:'正在请求…',failed:'请求失败或已取消，草稿仍保留。',unconfigured:'尚未配置服务，没有发送。',saved:'连接配置已保存在本机，没有发起请求。',local:'此项目的会话保存在本机。这是保存规则，不代表本次保存已确认。',temporary:'会话文件读取失败，本次草稿只在这个窗口保留。关闭前请复制要留的内容。',unsaved:'会话保存尚未确认。请保留窗口并重试。',retry:'重试保存',proposal:'查看剪辑建议',reference:'引用选中字幕',range:'引用所选范围',project:'引用项目身份',remove:'移除',limit:'文字或会话数量已到上限，请删减文字或返回已有会话。',scope:'请先打开或创建项目，再发送。',configured:'已配置（连接尚未验证）',configFailed:'配置未保存，原有设置保留。',cancelUnknown:'请求状态尚未确认，已发给服务的请求无法撤回。',cancelled:'已取消后续生成；已发给服务的请求无法撤回。'}};
  Object.assign(officialPaneText.en,{"notSent":"Chat content contains only the text shown above. No audio, video or screenshots are attached, and no file paths or account details are added automatically. Any such details you included in the text or history will still be sent. Your API key is used to authenticate with the service.","format":"In the chat, say which sentences to keep. It works best to select the captions on the timeline and click \"{reference}\" so whole sentences are quoted. Only whole quoted captions can be applied; half a sentence or a description from memory can't.","formatNext":"After the reply, click \"{proposal}\" below to check whether it can be applied.","formatTech":"For the technically minded: the AI's reply uses this format: {\"type\":\"keep_sentences\",\"ranges\":[{\"clipId\":\"…\",\"sourceCaptionId\":\"…\",\"from\":0,\"to\":1}]}","model":"Model name","project":"Reference current project","currentProject":"Current project","otherProject":"Original project","invalid":"This reply has no suggested edit that can be applied directly.","fees":"Your own AI account is responsible for service charges.","user":"You","assistant":"Assistant","formatTitle":"How to get a suggestion you can apply"});
  Object.assign(officialPaneText['zh-CN'],{"notSent":"聊天内容只包含上面显示的文字。不附加声音、画面和截图，不自动附加文件路径和账号。你写进文字或历史的这类信息仍会发送。API 密钥用于向服务验证身份。","format":"在聊天里说清楚要保留哪几句。最好先在时间线上选中字幕，点「{reference}」，把整句引用进来。只有整句引用的字幕，才能直接套用；只引用半句，或者凭记忆描述的，都套用不了。","formatNext":"收到回复后，点下面的「{proposal}」，看看能不能直接用。","formatTech":"给懂技术的人：AI 的回复要用这个格式：{\"type\":\"keep_sentences\",\"ranges\":[{\"clipId\":\"…\",\"sourceCaptionId\":\"…\",\"from\":0,\"to\":1}]}","model":"模型名称","project":"引用当前项目","currentProject":"当前项目","otherProject":"原项目","invalid":"这条回复里没有能直接套用的剪辑建议。","fees":"费用由你自己的 AI 账号承担。","user":"你","assistant":"助手","formatTitle":"怎样让 AI 给出能直接套用的建议"});
  Object.assign(officialPaneText['zh-CN'],{removeConnection:'删除这个连接',removeConfirm:'删除后，这台电脑上保存的密钥会被清掉，AI 助手要重新设置才能用。剪辑不受影响，聊天记录也还在。',connectionRemoved:'连接已删除，这台电脑上保存的密钥已清掉。AI 助手要重新设置才能用。',connectionRemoveFailed:'连接没能删除，密钥可能还在这台电脑上。请看看软件的设置文件夹是不是被占用或不能写入，然后再试。'});
  Object.assign(officialPaneText.en,{removeConnection:'Remove this connection',removeConfirm:'This clears the key saved on this computer. You will need to set up the AI service again to use the assistant. Editing is not affected, and your chat history stays.',connectionRemoved:'Connection removed. The key saved on this computer is cleared; set up the AI service again to use the assistant.',connectionRemoveFailed:'The connection could not be removed, so the key may still be on this computer. Check that the app\'s settings folder is not in use or read-only, then try again.'});
  Object.assign(officialPaneText['zh-CN'],{noCaptionSelected:'先在时间线上选中字幕。'});
  Object.assign(officialPaneText.en,{noCaptionSelected:'Select captions on the timeline first.'});
  Object.assign(officialPaneText.en,{resetConnection:'Set up connection again',configUnreadable:'The saved connection could not be read. Click "Set up connection again"; the app backs up the old settings first, then lets you enter new ones.',configBackedUp:'The old connection settings have been backed up. Enter your connection settings again.',configBackupFailed:'The old connection settings could not be backed up. They have not been replaced. Check whether the settings folder for the app is in use or cannot be written to, then try again.'});
  Object.assign(officialPaneText['zh-CN'],{resetConnection:'重新设置连接',configUnreadable:'原来的连接配置读不出来。点「重新设置连接」，软件会先把旧配置备份好，再让你重新填写。',configBackedUp:'原来的配置已备份，现在需要重新填写连接配置。',configBackupFailed:'原来的配置没能备份，未被替换。请看看软件的设置文件夹是不是被占用或不能写入，然后再试。'});
  Object.assign(officialPaneText.en,{notSent:'Only the text shown above is sent. No audio, video or screenshots are attached; the app does not add file paths or account details by itself, but any such details you typed into the text or history will be sent as written. Your API key is used only to authenticate with the service.',undoLast:'Undo this apply (same as toolbar Undo)',captionLabel:'Subtitles',rangeLabel:'Range',projectLabel:'Project'});
  Object.assign(officialPaneText['zh-CN'],{notSent:'这次发送的只有上面显示的文字。不附带声音、画面和截图；软件不会自动加上文件路径和账号，但你自己写进文字或历史里的这类信息会照样发出。API 密钥只用来向服务验证身份。',undoLast:'撤销这次应用（和顶部撤销相同）',captionLabel:'字幕',rangeLabel:'范围',projectLabel:'项目'});
  Object.assign(officialPaneText.en,{reviewSummary:'This will send a fixed formatting note, your message, {captions} quoted subtitles, and {history} earlier messages (including their quotes).',rawRequest:'View exact request',proposalSummary:'Suggested edit: keep {count} sentences, about {duration} in the final cut. Look it over before applying.',goConfig:'Go to settings',staleProposal:'The project changed after this reply, so this suggested edit can no longer be used.',reask:'Ask again using the current project',reaskReady:'A new draft is ready with no history or references. Select current subtitles and review before sending. The original conversation is still in the session list.'});
  Object.assign(officialPaneText['zh-CN'],{reviewSummary:'这次会发送一段固定的格式说明、消息文字、引用的 {captions} 条字幕，以及之前的 {history} 条消息（包含其中的引用）。',rawRequest:'查看原始请求',proposalSummary:'已生成剪辑建议：保留 {count} 句，成片大约 {duration}。请先看一遍再应用。',goConfig:'去设置',staleProposal:'项目在回复之后改过了，这条剪辑建议不能用了。',reask:'按现在的项目重新问',reaskReady:'已新建草稿，不带历史和引用。请重新选择当前字幕，确认后再发送。原来的对话还在会话列表里。'});
  // VV real-model test (2026-11-02): the format note that goes with every request, a reply without a usable proposal, and errors told apart
  Object.assign(officialPaneText.en,{errModel:'The model name is wrong. Check it in settings. Your draft is kept.',formatNote:'Format note sent with every request',formatNoteExplain:'The text below is a fixed note MontClip adds to every request. It only tells the AI how to format editing suggestions. It contains none of your recordings, subtitles or project content.',noProposal:'This reply is not an editing suggestion. To have it cut for you, say which sentences to keep.',errAuth:'The key is wrong or has no access. Check it in settings. Your draft is kept.',errRateLimit:'The service is limiting requests for now. Try again in a little while. Your draft is kept.',errTimeout:'The service did not answer in time. Check your connection and try again. Your draft is kept.',errNetwork:'Could not reach the service. Check your internet connection, then try again. Your draft is kept.',errUpstream:'The service is having trouble right now. Try again later, or choose another model in settings. Your draft is kept.'});
  Object.assign(officialPaneText['zh-CN'],{errModel:'模型名称不对，请去设置里检查。草稿仍保留。',formatNote:'每次请求都会附带的格式说明',formatNoteExplain:'下面这段英文是 MontClip 每次自动附上的固定说明，只是告诉 AI 怎么写剪辑建议。里面没有你的录像、字幕或项目内容，你不用看懂。',noProposal:'这条回复不是剪辑建议。想让它直接剪，可以说清要保留哪几句。',errAuth:'密钥不对或没有权限，请去设置里检查。草稿仍保留。',errRateLimit:'服务暂时限流，请过一会再试。草稿仍保留。',errTimeout:'服务没有及时回应，请检查网络后再试。草稿仍保留。',errNetwork:'连不上服务，请检查网络连接后再试。草稿仍保留。',errUpstream:'服务那边暂时出了问题，请稍后再试，或去设置里换一个模型。草稿仍保留。'});
  Object.assign(officialPaneText.en,{more:'More',projectNotReady:'This project is not saved yet, so nothing was sent. Your edits are still here. Click Save project and try again.',saveProject:'Save project'});
  Object.assign(officialPaneText['zh-CN'],{more:'更多',projectNotReady:'这个项目还没保存好，所以没有发送。你的剪辑都还在。请点「保存项目」后再试。',saveProject:'保存项目'});
  for(const language of ['en','zh-CN']) for(const [key,value] of Object.entries(officialPaneText[language])) text[language]['officialPane_'+key]=value;
  Object.assign(text['zh-CN'], { paneNew:'新建会话', paneSearch:'搜索本项目会话', paneDraft:'输入消息', paneSend:'发送', paneCancel:'取消', paneConfig:'助手设置', paneModel:'模型', paneNone:'未配置服务', paneWidth:'面板宽度', paneEmpty:'暂无消息。', paneTools:'暂无工具执行', paneLocal:'会话和草稿仅保留到本次窗口关闭，不会自动附加项目内容。', paneLimitSessions:'这次打开的会话数到上限了，暂时不能新建。回到已有会话继续；要留的内容先复制出来。', paneScopeCapacity:'会话已满，当前项目无法新建会话。请返回已有会话的项目，选择会话并复制保存需要留存的草稿。', panePasteTooLong:'粘贴后会超过 16000 字符，这次没有粘贴，原草稿未改动。请把要粘贴的内容分成几段。', paneLimitChars:'这条太长了，发不出去。删掉一部分，或者分成几条。', paneReferenceLimit:'最多可引用 20 项，请移除部分引用后再添加。', paneActionFailed:'这次操作未完成，请检查当前会话后重试。', paneSaveFailed:'面板宽度未能记住，下次打开可能恢复默认。' });
  Object.assign(text.en, { paneNew:'New session', paneSearch:'Search project sessions', paneDraft:'Message', paneSend:'Send', paneCancel:'Cancel', paneConfig:'Assistant settings', paneModel:'Model', paneNone:'Service not configured', paneWidth:'Pane width', paneEmpty:'No messages.', paneTools:'No tool activity', paneLocal:'Sessions and drafts last until this window closes. Project content is not attached automatically.', paneLimitSessions:"This window has reached its session limit, so no new session can be created for now. Go back to an existing session; copy anything you want to keep first.", paneScopeCapacity:'Sessions are full; a session cannot be created for this project. Return to a project with existing sessions, select one and copy any drafts you need to keep.', panePasteTooLong:'This paste would exceed 16000 characters. Nothing was pasted and your draft was kept. Split the text into smaller parts.', paneLimitChars:'This message is too long to send. Shorten it or split it into a few messages.', paneReferenceLimit:'Up to 20 references are allowed. Remove some before adding more.', paneActionFailed:'This action did not complete. Check the current session and try again.', paneSaveFailed:'Pane width could not be saved; the next launch may use the default.' });
  Object.assign(text['zh-CN'], { paneProjectRef:'引用项目标识', paneCaptionRef:'引用所选字幕', paneRangeRef:'引用工作区间', paneRemoveRef:'移除引用', paneNoReference:'没有可引用的已识别项目、字幕或有效区间。', paneReferences:'本次明确引用（尚未发送）', paneStale:'引用来自较早版本，请移除后重新选择。' });
  Object.assign(text.en, { paneProjectRef:'Reference project identity', paneCaptionRef:'Reference selected captions', paneRangeRef:'Reference work range', paneRemoveRef:'Remove reference', paneNoReference:'No identified project, selected caption or valid range is available.', paneReferences:'Explicit references (not sent)', paneStale:'References are from an earlier version. Remove and select them again.' });
  Object.assign(text['zh-CN'],{workspaceSaveFailed:'工作区设置未能记住，下次打开可能恢复默认。',workspaceReadFailed:'未能读取工作区设置，本次先使用编辑工作区。',modeBlocked:'请先结束导出或退出嵌套编辑，再切换模式。',colorExited:'已切到简单模式。调色效果仍保留，切回高级可继续调整。'});
  Object.assign(text.en,{workspaceSaveFailed:'Workspace setting was not saved; the next launch may use the default.',workspaceReadFailed:'Workspace settings could not be read. Using Edit for this window.',modeBlocked:'Finish exporting or leave nested editing before switching modes.',colorExited:'Simple mode is active. Color effects remain; switch to Advanced to adjust them.'});
  Object.assign(text['zh-CN'], {'agent.state.disconnected.brief':'还没有连接 AI 服务。剪辑照常用，聊天先发不出去。','agent.state.sendFailedNoProvider.brief':'这条没有发出去：还没有连接 AI 服务。','agent.input.newSession':'新建会话','agent.input.send':'发送','agent.ref.remove':'移除这条引用','agent.settings.models.title':'模型'});
  Object.assign(text.en, {'agent.state.disconnected.brief':"No AI service connected yet. Editing works as usual; chat can't send.",'agent.state.sendFailedNoProvider.brief':"This message wasn't sent: no AI service is connected.",'agent.input.newSession':'New conversation','agent.input.send':'Send','agent.ref.remove':'Remove this reference','agent.settings.models.title':'Models'});
  /** The assistant's format collapsible body: the format note, then what to do after the reply, with the quote and review
   *  buttons named by their own text ({reference}, {proposal}) — renaming a button renames it here (JJ, 2026-11-03). */
  function formatBody(language) {
    const T = text[language === "en" ? "en" : "zh-CN"];
    return T.officialPane_format.split("{reference}").join(T.officialPane_reference) + (language === "en" ? " " : "") +
      T.officialPane_formatNext.split("{proposal}").join(T.officialPane_proposal);
  }
  function create(storage) {
    let saved; try { saved = JSON.parse(storage.getItem(KEY)); } catch {}
    let value = { mode: saved?.mode === "advanced" ? "advanced" : "simple", language: saved?.language === "en" ? "en" : "zh-CN" };
    return {
      get: () => ({ ...value }),
      set(patch) {
        const next = { ...value, ...patch };
        if (!["simple", "advanced"].includes(next.mode) || !text[next.language]) throw new Error("Invalid view preference");
        value = { mode: next.mode, language: next.language };
        try { storage.setItem(KEY, JSON.stringify(value)); return true; } catch { return false; }
      },
    };
  }
  function desktopStorage(bridge) {
    return { getItem() { const r=bridge.get(); if(!r?.ok) throw Error('View settings unavailable'); return JSON.stringify(r.value); },
      setItem(_key, raw) { if(!bridge.set(JSON.parse(raw))?.ok) throw Error('View settings not saved'); } };
  }
  /** A new project's name (Deja, 第四批): 未命名项目, Untitled Project in English. Chinese first when the language is unknown. */
  const defaultProjectName = (language) => (language === "en" ? "Untitled Project" : "未命名项目");
  const isDefaultProjectName = (name) => name === "未命名项目" || name === "Untitled Project";
  /** The file name used when a project's name leaves nothing usable (all slashes): 直播切片 {月-日} in Chinese, the old
   *  English word (export, captions…) in English. */
  const exportFallback = (language, english, date = new Date()) => (language === "en" ? english
    : "直播切片 " + String(date.getMonth() + 1).padStart(2, "0") + "-" + String(date.getDate()).padStart(2, "0"));
  return { create, desktopStorage, text, formatBody, KEY, t, ago, when, applyI18n, durationText, flvImportMessage, h264Message, h264Encoder, defaultProjectName, isDefaultProjectName, exportFallback };
});
