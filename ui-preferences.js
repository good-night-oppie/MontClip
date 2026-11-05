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
    // simple mode, the first advanced shortcut of a launch (JJ, 8 PRs)
    "simple-advanced-key": ["This shortcut works in Advanced mode. Click Advanced at the top to switch.", "这个快捷键在「高级」模式里才能用。点顶栏的「高级」就能切过去。"],
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
    "inspector-empty": ["Select a clip to edit its picture, effects and audio.", "选中一个片段以编辑它的画面、特效与音频。"],
    "exporting-pct": ["Exporting… {pct}%", "正在导出… {pct}%"],
    "rendering-pct": ["Rendering… {pct}%", "正在渲染… {pct}%"],
    "encoding": ["Encoding…", "正在编码…"],
    "encoding-pct": ["Encoding… {pct}%", "正在编码… {pct}%"],
    "mixing-audio": ["Mixing audio…", "正在混音…"],
    // DRAFT for JJ (Deja 2026-11-05): a clip's sound could not be read, so the export stops instead of coming out silent
    "export-audio-failed": ["Export stopped: the sound of “{name}” couldn't be read, so the file would have had no sound. Nothing was exported. Try again; if it keeps happening, re-import that recording.",
      "导出停下了：「{name}」的声音读不出来，导出来会没有声音，所以这次没有导出。请再试一次；如果还是这样，重新导入这段录像。"],
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
    // JJ v2 (documents/2026-11-03-MontClip-听写文案定稿-JJ.md): the empty panel and the speech model's download states.
    // The English of the download states is not in JJ's text yet (for JJ); the import lines are not either (for JJ).
    "tr-empty": ["No transcript yet. Click \"Transcribe selected\" to turn the selected clips into text.", "还没有文稿。点「听写选中的」，把选中的片段听写成文字。"],
    "asr-checking": ["Checking the transcription model…", "正在检查听写模型…"],
    "asr-missing": ["The first time, MontClip downloads a transcription model (about 230 MB) once; after that everything stays on this computer and no sound is sent.", "第一次要联网下载一个听写模型，大约 230 MB，只下载这一次。下载完以后，听写全程在这台电脑上做，声音不会发出去。"],
    "asr-download": ["Download and use (about 230 MB)", "下载并使用（约 230 MB）"],
    "asr-downloading": ["Downloading the transcription model: {got} / about 230 MB. You can go on editing; you'll be told when it's done.", "正在下载听写模型：{got} / 约 230 MB。可以先去剪辑，下载完会告诉你。"],
    "asr-download-cancel": ["Cancel download", "取消下载"],
    "asr-ready": ["The transcription model is installed. From now on transcription happens on this computer, with no internet needed.", "听写模型装好了。以后听写都在这台电脑上做，不用再联网。"],
    "asr-interrupted": ["The transcription model didn't finish downloading. What was downloaded is kept. Check the network, then click \"Resume download\".", "听写模型没下载完，已经下载的部分会留着。检查一下网络，再点「接着下载」。"],
    "asr-resume": ["Resume download", "接着下载"],
    "asr-later": ["Not now", "以后再说"],
    "asr-no-space": ["Not enough space on drive {drive}: the transcription model needs about 230 MB, and only {free} is left. Free up some space, then click \"Resume download\".", "{drive} 盘空间不够，下载听写模型需要大约 230 MB，现在只剩 {free}。腾出空间以后再点「接着下载」。"],
    "asr-check-failed": ["The downloaded file was incomplete and has been deleted. Please download it again.", "下载的文件不完整，已删掉，请再下载一次。"],
    "asr-again": ["Download again", "再下载一次"],
    "asr-bad": ["The transcription model files are incomplete or changed. Download them again, or import them again.", "听写模型的文件不完整或被改过了。请重新下载，或者重新导入。"],
    "asr-engine-missing": ["The transcription program is missing from this copy of MontClip. Unzip the package again.", "这份 MontClip 缺了听写程序。请重新解压安装包。"],
    "asr-download-failed": ["The download didn't work ({why}). Check the network, then click Download again.", "下载没成功（{why}）。检查一下网络，再点「再下载一次」。"],
    "asr-import": ["Import from a USB drive or a file", "从 U 盘或文件导入"],
    "asr-imported": ["Imported {n} model files.", "已导入 {n} 个模型文件。"],
    "asr-import-already": ["These model files are already here.", "这些模型文件已经有了。"],
    "asr-import-none": ["None of the chosen files is a speech model. Choose the model folder copied from the other computer.", "选的文件里没有听写模型。请选从别的电脑拷来的那个模型文件夹。"],
    "asr-import-failed": ["The import didn't work ({why}). Choose another folder, or try again.", "导入没成功（{why}）。换一个文件夹，或者再试一次。"],
    // v10 / JJ v2 section one: the transcription setup page (English: JJ section five where it has it)
    "setup-title": ["Make subtitles automatically?", "要不要自动出字幕？"],
    "setup-intro": ["MontClip can transcribe what is said in a recording into subtitles. Choose one way first; you can change it later in Settings › Transcription. Highlights don't need transcription and work either way.", "MontClip 可以把录像里说的话听写成字幕。先选一种做法，以后可以在「设置 › 听写」里改。找高光不需要听写，选哪种都能用。"],
    "setup-local-title": ["Transcribe on this computer", "在这台电脑上听写"],
    "setup-recommended": ["Recommended", "推荐"],
    "setup-local-speed": ["An hour of recording usually takes a few minutes.", "1 小时的录像通常几分钟听写完，电脑越快越短。"],
    "setup-local-n": [" (about {n} minutes on our test computer)", "（我们的测试电脑上大约 {n} 分钟）"],
    "setup-local-errors": ["Ordinary speech: about 3 wrong characters in 100; singing has more, which you can fix with Fix captions using lyrics.", "普通说话每 100 个字大约错 3 个。唱歌的部分错字会多一些，可以用「按歌词校准字幕」改。"],
    "setup-local-punct": ["Captions have no punctuation by default; install a punctuation model (a download of about 60 MB) to get it.", "字幕默认不带标点；另外装一个标点模型（下载约 60 MB）就有标点。"],
    // the punctuation model (Deja: Apache-2.0, so the streamer may install it); the button and its states are new copy
    "asr-punct-get": ["Install the punctuation model", "装标点模型"],
    "asr-punct-getting": ["Downloading the punctuation model…", "正在下载标点模型…"],
    "asr-punct-ready": ["The punctuation model is installed; captions transcribed from now on have punctuation.", "标点模型装好了，之后听写的字幕会带标点。"],
    "setup-cloud-title": ["Use cloud transcription", "用云端听写"],
    "setup-cloud": ["Sends the recording's sound to the service you choose (OpenAI, Alibaba Bailian, SiliconFlow, or your own address), using your own account. You're asked before each send.", "会把录像的声音发给你选的服务（OpenAI、阿里百炼、SiliconFlow，或者你自己填的地址），用你自己的账号，费用记在你的账号上。每次发之前都会先问你。"],
    "setup-cloud-go": ["Choose a service", "选服务"],
    "setup-later-title": ["Skip for now", "先不装"],
    "setup-later": ["Highlights, editing and export all still work; you just won't get automatic subtitles. You can also import an SRT file.", "找高光、剪辑、导出都照常能用，只是不会自动出字幕；你也可以自己导入 SRT 字幕文件。"],
    "setup-dl-title": ["Downloading the transcription model", "正在下载听写模型"],
    "setup-done-title": ["The transcription model is installed", "听写模型装好了"],
    "setup-ok": ["OK", "好"],
    "setup-net-title": ["Not finished downloading", "没下载完"],
    "setup-space-title": ["Not enough space", "空间不够"],
    "setup-bad-title": ["Incomplete file", "文件不完整"],
    "setup-settings-title": ["Transcription", "听写"],
    "asr-not-installed": ["Transcription is not installed", "还没装听写"],
    "asr-go-install": ["Install", "去装"],
    "tr-missing": ["No transcript yet: {names}", "还没有文稿：{names}"],
    "tr-more": [" +{n} more", " 等 {n} 个"],
    // Google Fonts goes online (Deja, 2026-11-04): the box before it, and the fallback hints. JJ's wording (on #151, last round on 488ae6c).
    "font-list-sep": [", ", "、"],
    "font-net-title": ["Download fonts from the internet?", "要联网下载字体吗？"],
    "font-net-fonts": ["Fonts: {names}", "要下载的字体：{names}"],
    "font-net-hosts": ["MontClip will connect to Google Fonts: {hosts}.", "会连接 Google 字体的网站：{hosts}。"],
    "font-net-sent": ["Only the font names are sent, plus what every browser sends when it goes online, such as your IP address. Your projects, recordings and captions are not sent.", "发出去的只有字体名，加上浏览器联网时都会带的基本信息，比如你的 IP 地址。项目、录像和字幕都不会发出去。"],
    "font-net-no": ["If you don't download them, this text shows and exports in the default font.", "不下载的话，这些文字会用默认字体显示和导出。"],
    "font-net-deny": ["Not now", "先不用"],
    "font-net-allow": ["Download", "联网下载"],
    "font-fallback": ["These fonts aren't on this computer: {names}. This text uses the default font for now.", "这台电脑上没有这些字体：{names}。现在先用默认字体显示。"],
    "font-fallback-load": ["Download from the internet…", "联网下载…"],
    "font-desktop-missing": ["These fonts aren't on this computer: {names}. This text shows and exports in the default font.", "这台电脑上没有这些字体：{names}。文字会用默认字体显示和导出。"],
    "font-export-fallback": ["This export can't use these fonts: {names}. It uses the default font instead.", "这次导出用不了这些字体：{names}，会用默认字体代替。"],
    // a transcription with parts the engine could not read (asr-local.js gaps); JJ's words (tr-gaps-more: placeholder)
    "tr-gaps-toast": ["Transcription finished, but {n} part(s) ({dur} in all) couldn't be transcribed and have no subtitles. Click a time under “Transcript” on the right to jump there, and add subtitles yourself if you need them.", "听写完了，但有 {n} 段没听写出来（共 {dur}），这几段没有字幕。可以在右边「文稿」里点时间跳过去看，需要的话自己补上字幕。"],
    "tr-gaps-note": ["{n} part(s) ({dur} in all) couldn't be transcribed and have no subtitles. Click a time to jump there:", "有 {n} 段没听写出来（共 {dur}），这几段没有字幕。点时间可以跳过去："],
    "tr-gaps-more": ["and {more} more", "还有 {more} 段"],
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
    // 设置 › AI 助手 (JJ v2, 2026-11-04): the switch the main process keeps (desktop/agent-switch.js) and the 「AI 数据说明」 again
    "ai-set-title": ["AI assistant", "AI 助手"],
    "ai-set-enabled": ["Use the AI assistant", "用 AI 助手"],
    "ai-set-hint": ["When it's off, the assistant sends nothing; editing works as usual.", "关掉以后，助手不会往外发任何东西；剪辑照常能用。"],
    "ai-set-notice": ["Data notice", "数据说明"],
    "ai-set-notice-tip": ["See again who gets your data, what is sent, and whether it may be used for training", "再看一遍：发给谁、发什么、会不会被拿去训练"],
    // a recording nothing could read the length of, not even its packets' times (cut off before it was saved: europa P3).
    // media-incomplete is JJ's sentence (定稿 2026-11-05, her review of the trial), on the file in the bin; the English
    // is a draft for JJ.
    "media-incomplete": ["This video wasn't recorded to the end (the screen recording may have stopped early), so its length can't be read. It can't be cut yet.", "这个视频没录完整（可能录屏中途停了），读不出时长，现在还剪不了。"],
    // 〔帮我修好〕 (JJ 定稿 2026-11-05, via Deja): one button for every repair and conversion, FLV breaks included —
    // the button, its menu item, done and failed are JJ's, word for word; the tip, progress, Cancel, "no encoder" and
    // the English of the slow-to-seek mark are drafts for JJ
    "repair-button": ["Fix it for me", "帮我修好"],
    "repair-menu": ["Fix it for me…", "帮我修好…"],
    "repair-button-tip": ["Saves a complete MP4 beside it and uses that instead. The original file is not changed, and Ctrl+Z puts it back.", "另存一份完整的 MP4 来替换它。原文件不动，按 Ctrl+Z 可以换回来。"],
    "repair-progress": ["Fixing… {n}%", "正在修…{n}%"],
    "repair-cancel": ["Cancel", "取消"],
    "repair-done": ["Fixed. Clips that use it now use the fixed copy, in the same place. The original is still there.", "修好了。时间线上用到它的片段已经换成修好的这份，位置没变；原文件还在。"],
    "repair-failed": ["\"{name}\" stopped recording before it was saved, and this kind can't be fixed. The original file is unchanged — please use a complete file.", "「{name}」录到一半就停了，没存好，这种修不了。原文件没有改动，请换一个完整的文件。"],
    "repair-encoder-missing": ["“{name}” needs re-encoding to be fixed, and the FFmpeg on this computer can't do that, so nothing was fixed or saved. The original file is unchanged. Switch to a full version of FFmpeg and try again.", "「{name}」要重新编码才能修，这台电脑上的 FFmpeg 做不了，所以没有修，也没有生成新文件。原文件没有改动。换成完整版 FFmpeg 以后再试。"],
    // cases 1 and 2: it can be cut, only seeking in it may be slow — a small mark on the file, no dialog
    "media-slow-mark": ["This recording didn't finish properly, so scrubbing may be slow. Right-click → “Fix it for me” to save a complete copy.", "没录完整，拖动可能会慢。右键〔帮我修好〕，会另存一份完整的。"],
    // JJ 定稿 (2026-11-05, via Deja), word for word: the toast when files nothing can read the length of are imported,
    // and the toast when one is dragged onto the timeline
    "media-duration-unknown": ["\"{name}\" may not have finished recording (for example, a screen recording that was stopped), so its length can't be read and it can't be edited yet. The original file is unchanged. Click “Fix it for me” to try.", "「{name}」可能没录完整（比如录屏中途停了），读不出有多长，现在还剪不了。原文件没有改动。点〔帮我修好〕试试。"],
    "media-duration-unknown-n": ["{n} videos may not have finished recording, so their length can't be read and they can't be edited yet. The original files are unchanged. Click “Fix it for me” to try.", "有 {n} 个视频可能没录完整，读不出有多长，现在还剪不了。原文件都没有改动。点〔帮我修好〕试试。"],
    // Rea (#152): the same for a sound file, and for several files that are not all videos — drafts for JJ (no
    // 〔帮我修好〕: it repairs videos)
    "media-incomplete-audio": ["This audio wasn't recorded to the end (the recording may have stopped early), so its length can't be read. It can't be cut yet.", "这段音频没录完整（可能录音中途停了），读不出时长，现在还剪不了。"],
    "media-duration-unknown-audio": ["\"{name}\" may not have finished recording (for example, a recording that was stopped), so its length can't be read and it can't be edited yet. The original file is unchanged.", "「{name}」可能没录完整（比如录音中途停了），读不出有多长，现在还剪不了。原文件没有改动。"],
    "media-duration-unknown-n-mixed": ["{n} files may not have finished recording, so their length can't be read and they can't be edited yet. The original files are unchanged.", "有 {n} 个文件可能没录完整，读不出有多长，现在还剪不了。原文件都没有改动。"],
    "media-cannot-cut": ["Can't read how long \"{name}\" is, so it can't go on the timeline. The original file is unchanged.", "读不出「{name}」有多长，放不上时间线。原文件没有改动。"],
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
    "hl-r-singing": ["Singing throughout, hardly pausing", "一直在唱，几乎没有停顿"],
    // 「✨ 自动出切片」 (P3; frozen design v7, v7.5 last; the Chinese is the design's and JJ's, the English is for JJ)
    // 「附上唱歌段和音量」 in 设置 (QQ's five on #169; Deja, 2026-11-05). JJ定稿 (2026-11-05)
    "sf-title": ["AI assistant", "AI 助手"],
    "sf-label": ["Attach singing parts and loudness", "附上唱歌段和音量"],
    "sf-hint": ["When on, what is sent to the AI includes which parts may be singing and the loudness (one number every second or every few seconds): numbers only, not the recording. When off, the assistant can't tell where it is quiet or where the singing starts.", "开着的时候，发给 AI 的内容里会附上哪几段可能在唱歌，以及音量大小（每秒或每隔几秒一个数）：只是数字，不是录音。关掉以后，助手判断不了哪里安静、从哪里开始唱。"],
    "sf-off-note": ["“{switch}” is off, so the assistant can't tell where it is quiet or where the singing starts. To use it, turn on “{switch}” in “{settings}”, then send again.", "「{switch}」现在关着，助手判断不了哪里安静、从哪里开始唱。要用的话，到〔{settings}〕里打开「{switch}」，再发一次。"],
    "as-open": ["✨ Auto clips", "✨ 自动出切片"],
    "as-open-done": ["✨ Auto clips · done", "✨ 自动出切片 · 找完了"],
    "as-step-start": ["Recordings", "选录像"],
    "as-step-run": ["Finding", "找高光"],
    "as-step-review": ["Review", "看一遍"],
    "as-step-done": ["Export", "导出"],
    "as-keep": ["Closing loses nothing; carry on next time", "关掉不会丢，下次接着看"],
    "as-close": ["Close", "关掉"],
    // JJ's re-review of #77 with Deja's checked wording: each busy case says its own sentence (a drag says nothing)
    "as-busy-export": ["Exporting. Click here again when the export is done.", "正在导出，等导出完再点这里。"],
    "as-busy-comp": ["You're inside a precomposed clip. Click the main sequence name at the far left above the timeline to go back, then click here.", "你现在在合成片段里面。点时间线上方最左边的主序列名字，回到主序列再点这里。"],
    "as-start-title": ["Which stream should the clips come from?", "从哪场直播出切片？"],
    "as-start-sub": ["Pick the recordings, then click Start finding. What it finds are candidates: you look them over, and videos are made only when you export.", "选好录像，点「开始找高光」。找出来的是候选，你看一遍、点导出才会生成视频。"],
    "as-recs": ["Recordings", "录像"],
    "as-recs-multi": ["You can pick several; each one gets its own clips.", "可以多选，几场会分别出切片。"],
    "as-no-recs": ["This project has no recordings yet. Import a stream recording first with + Import recording.", "这个项目里还没有录像。先用「+ 导入录像」导入一场直播录像。"],
    "as-dm-yes": ["✓ Has live danmaku", "✓ 有直播弹幕"],
    "as-dm-no": ["No live danmaku: sound only", "没有直播弹幕，只能按声音找"],
    "as-kind-title": ["What is this stream mostly?", "这场主要在干什么？"],
    "as-kind-auto": ["Let it look", "让它自己看"],
    "as-kind-sing": ["Singing", "唱歌"],
    "as-kind-chat": ["Chatting", "聊天"],
    "as-kind-game": ["Gaming", "打游戏"],
    "as-kind-watch": ["Watching together", "一起看"],
    "as-kind-hint-auto": ["It decides by itself. When it can't tell, it asks you once after finding.", "它会自己判断。不确定时会在找完以后问你一句。"],
    "as-kind-hint-sing": ["It finds the songs one by one; each song becomes its own clip.", "会一首歌一首歌地找，每首歌单独出一条。"],
    "as-kind-hint-sing-maybe": ["It finds the parts that may be singing; each part becomes its own clip.", "会找可能在唱歌的段落，每段单独出一条。"],
    "as-kind-hint-chat": ["It finds where the sound is loudest and the danmaku busiest.", "会找声音最响、弹幕最多的段落。"],
    "as-kind-hint-game": ["It finds where the danmaku suddenly gets busy, like a comeback or a slip.", "会找翻盘、失误这种弹幕突然变多的段落。"],
    "as-kind-hint-watch": ["It finds where you and the danmaku react most.", "会找你和弹幕一起反应最大的段落。"],
    // no live danmaku in the chosen recordings: the hints don't mention it (JJ, v1: 没弹幕不提弹幕). Laughter is not
    // detected, so the chat one says loudness only
    "as-kind-hint-chat-nodm": ["It finds where the sound is loudest.", "会找声音最响的段落。"],
    "as-kind-hint-game-nodm": ["It finds where the sound suddenly gets louder.", "会找声音突然变大的段落。"],
    "as-kind-hint-watch-nodm": ["It finds where you are loudest.", "会找你声音最大的段落"],
    "as-more": ["More settings (all have defaults; no need to change them):", "更多设置（都有默认值，不改也行）："],
    "as-count": ["At most", "最多出几条"],
    "as-count-hint": ["Only an upper limit. If fewer are good enough, you get fewer; it never pads.", "只是上限。够好的不够就少出，不会硬凑。"],
    "as-len": ["How long each", "每条多长"],
    "as-len-song": ["Whole songs", "唱歌按整首"],
    "as-len-song-maybe": ["Singing parts, whole", "唱歌的段落整段出"],
    "as-len-hook": ["Only the best part (about 45 s)", "只要最好听的一部分（约 45 秒）"],
    "as-len-short": ["30 s – 1 min", "30 秒–1 分钟"],
    "as-len-hint-song": ["One clip per song. Its start and end are estimated; you can move them while reviewing.", "唱歌的段落一首歌出一条。开头结尾是自动估的，看的时候可以挪。"],
    "as-len-hint-song-maybe": ["One clip for each part that may be singing.", "可能在唱歌的段落，每段出一条。"],
    "as-len-hint-hook": ["Each song is cut to its best part: about 45 seconds, where it is loudest. Good for posts and vertical video.", "每首歌只切最好听的一部分，大约 45 秒（声音最响的那部分）。适合发动态、出竖屏。"],
    "as-len-hint-hook-maybe": ["Each part is cut to its best bit: about 45 seconds, where it is loudest. Good for posts and vertical video.", "每段只切最好听的一部分，大约 45 秒（声音最响的那部分）。适合发动态、出竖屏。"],
    "as-len-hint-short": ["Every part is cut to 30 s – 1 min; songs are shortened too.", "所有段落都按 30 秒–1 分钟切。唱歌的段落也会被截短。"],
    "as-go": ["Start finding", "开始找高光"],
    "as-go-n": ["Start finding ({n} streams)", "开始找高光（{n} 场）"],
    "as-go-hint": ["You can close this window and edit something else; when it is done, the top-right button changes to “✨ Auto clips · done”.", "可以关掉这个窗口去剪别的；找完了，右上角的按钮会变成「✨ 自动出切片 · 找完了」。"],
    "as-run-title": ["Finding highlights", "正在找高光"],
    "as-run-sub": ["{name} · {dur}. This page turns into the results when it is done; closing the window keeps it going.", "{name} · {dur}。找完这一页会自动换成结果；关掉窗口也会接着找。"],
    "as-run-read": ["Read the recording and the live danmaku", "读录像和直播弹幕"],
    "as-run-hot": ["Find the lively parts: danmaku and loudness", "找热闹的地方：弹幕、音量"],
    "as-run-hot-nodm": ["Find the lively parts: loudness", "找热闹的地方：音量"],
    "as-run-songs": ["Find roughly where each song starts", "找每首歌大概从哪开始"],
    "as-run-songs-maybe": ["Find the parts that may be singing", "找哪几段可能在唱歌"],
    "as-run-pick": ["Pick the best ones", "挑出最好的几条"],
    "as-stop": ["Stop", "停下"],
    "as-stop-hint": ["What is found so far is kept; you can carry on.", "停下以后，已经找到的不会丢，可以接着找。"],
    "as-stopped": ["Stopped. What was found so far is kept; Start finding carries on.", "已停下。找到一半的结果留着，下次点「开始找高光」会接着找。"],
    "as-run-failed": ["Couldn't read the sound of “{name}”. The file may be damaged, have no sound, or have been moved. Try another stream.", "「{name}」的声音没读出来，可能是文件坏了、没有声音，或者被移走了。可以换一场试试。"],
    "as-run-nospace": ["Drive {drive} is full, so the results can't be saved. Free up some space and try again.", "{drive} 盘空间不够，分析结果存不下。腾出一些空间再试。"],
    "as-found-head": ["Found {found}; the best {on} are ticked", "找到 {found} 条，先帮你勾了最好的 {on} 条"],
    "as-found-all": ["Found {found}, all ticked", "找到 {found} 条，都勾上了"],
    "as-found-none": ["Nothing stood out", "没有找到够好的段落"],
    // every card taken out, nothing ticked, ticked by the streamer, and why 〔开始找高光〕 is grey (JJ's words)
    "as-found-all-out": ["Found {found}, and you took them all out", "找到 {found} 条，你都拿掉了"],
    "as-all-out-sub": ["Everything you took out is under “Taken out: {n}” below; open it to put them back. For the one you just took out, click “Undo” in the notice or press Ctrl+Z. For a new batch, click “Another stream / settings” and search again.", "拿掉的都在下面「拿掉的 {n} 条」里，点开就能放回来；刚拿掉的，也可以点提示里的「撤销」或按 Ctrl+Z。想换一批，点「换一场 / 改设置」重新找。"],
    "as-found-none-ticked": ["Found {found}, none ticked right now", "找到 {found} 条，现在一条都没勾"],
    "as-found-ticked": ["Found {found}, {on} ticked", "找到 {found} 条，勾了 {on} 条"],
    "as-go-why-none": ["Tick a recording above first", "先在上面勾一场录像"],
    "as-found-none-next": ["Try another recording, or change how long each clip is under More settings, then search again.", "可以换一场录像，或者在「更多设置」里改一下每条多长，再找一次。"],
    "as-review-sub": ["{name}. Unticked ones are spares; tick any you like. Look them over, then use the buttons below.", "{name}。没勾的是备选，觉得好也可以勾上。看一遍再点下面的按钮。"],
    "as-back-start": ["Another stream / settings", "换一场 / 改设置"],
    "as-evidence": ["This time it went by live danmaku and loudness: read {count} danmaku, listened to {dur} of sound and marked {n} parts.", "这次是按直播弹幕和音量找的：读了 {count} 条直播弹幕，听完 {dur} 的声音，圈出 {n} 段。"],
    "as-evidence-nodm": ["No live danmaku found, so only loudness this time: listened to {dur} of sound and marked {n} parts. Quiet but funny parts may be missed.", "没找到直播弹幕，这次只按音量找：听完 {dur} 的声音，圈出 {n} 段。可能漏掉安静但好笑的段落。"],
    "as-ask-title": ["Is this stream mostly singing?", "这场是唱歌为主吗？"],
    "as-ask-sub": ["There is singing and there is chatting, so I can't tell. Pick one and it picks again that way.", "有唱歌也有聊天，我不确定。选了以后会按对应的方式重新挑。"],
    "as-ask-sing": ["Yes, mostly singing", "是，唱歌为主"],
    "as-ask-chat": ["No, mostly chatting", "不是，聊天为主"],
    "as-ask-both": ["Both", "两种都要"],
    "as-few": ["Only {found} are good enough, not {count}.", "够好的只有 {found} 条，没有凑满 {count} 条。"],
    "as-few-sub": ["The other parts don't stand out in {signals}; padding them in would only make viewers swipe away.", "剩下的段落{signals}都不突出，硬凑出来观众也会划走。"],
    "as-sig-both": ["danmaku or sound", "弹幕和声音"],
    "as-sig-sound": ["sound", "声音"],
    "as-overview": ["The whole stream", "整场一览"],
    "as-overview-hint": ["click a box to jump to it", "点框跳到那一条"],
    "as-lg-sound": ["Sound", "声音"],
    "as-lg-on": ["Ticked", "勾上的"],
    "as-lg-off": ["Spare", "备选"],
    "as-spare": ["Spare", "备选"],
        "as-song-name-hint": ["Click the name to change it, for example to the song title. The exported file is named after it; the name doesn't appear in the video.", "点名字可以改，比如改成歌名。导出的文件就叫这个名字，名字不会出现在画面里。"],
    "as-rename-tip": ["Click to rename. This is the exported file's name; it doesn't appear in the video.", "点了可以改。这是导出的文件名，不会出现在画面里。"],
    "as-song-name": ["Song {no} (at {time} in the recording)", "第 {no} 首歌（在录像 {time}）"],
    "as-moment-name": ["The part at {time}", "{time} 那段"],
    "as-rename": ["Name: click to change it; this is the file name", "名字，点了可以改，这是文件名"],
    "as-tick": ["Keep this one", "要这一条"],
    "as-maybe-singing": ["Maybe singing", "可能在唱歌"],
    "as-tag-estimated": ["Estimated", "估的"],
    "as-tag-likely": ["Fairly likely", "比较可能"],
    "as-tag-adjusted": ["You adjusted it", "你调过"],
    // the card's button once calibrated (v12's words; a placeholder key until JJ words it)
    // the tooltip of 〔再对一遍歌词〕 once calibrated (JJ's words, on #100)
    "as-lyrics-again-title": ["{n} subtitle lines were corrected from the lyrics. Click again to check them against the lyrics you pasted last time; one Undo takes you back to before.", "字幕已按歌词改过 {n} 句。再点一次会带上你上次贴的歌词，可以再对一遍；想回到改之前，撤销一步就行。"],
    "as-lyrics-again": ["Match the lyrics again ({n} changed)", "再对一遍歌词（已改 {n} 句）"],
    // the card calibrated: nothing on the timeline yet (JJ's words, on #100)
    "as-lyrics-done": ["Corrected {n} lines from the lyrics. Once this part is on the timeline, these subtitles are used.", "已按歌词改好 {n} 句。放到时间线上以后，用的就是改好的字幕。"],
    "as-lyrics": ["Correct the subtitles from the lyrics", "按歌词校准字幕"],
    "as-lyrics-maybe": ["If this part is singing, you can correct its subtitles from the lyrics", "如果这段是唱歌，可以按歌词校准字幕"],
    // P6a: correct captions from the lyrics. New copy, for JJ.
    "ly-open": ["Fix captions using lyrics", "按歌词校准字幕"],
    "ly-open-title": ["Paste the lyrics of the selected captions' song (or the IN–OUT part) and fix the misheard words; nothing is sent", "粘贴选中字幕（或入点–出点那段）这首歌的歌词，把听错的字改过来；什么都不往外发"],
    "ly-title": ["Fix captions using lyrics", "按歌词校准字幕"],
    "ly-intro": ["Paste this song's lyrics, one line each. They are matched on this computer; nothing is sent. The times stay the transcript's; only the misheard words are replaced, and each lyric line becomes one caption.", "把这首歌的歌词粘贴进来，一行一句。只在这台电脑上对齐，什么都不往外发。时间沿用听写的，只把听错的字换成歌词里的字，一行歌词一条字幕。"],
    "ly-paste": ["Lyrics", "歌词"],
    "ly-placeholder": ["One line each", "一行一句"],
    "ly-align": ["Match", "对齐"],
    "ly-was": ["Was: ", "原来："],
    "ly-now": ["Becomes: ", "改成："],
    "ly-unsure": ["May be wrong", "可能不对"],
    "ly-no-time": ["Not heard here; can't be placed", "这段没听到这句，没法放"],
    "ly-pick-line": ["Change line {n}", "改第 {n} 行"],
    "ly-summary": ["{sure} lines match, {unsure} may be wrong. Ticked lines become the lyrics; the others keep the transcript's words. Nothing changes until you apply.", "能对上 {sure} 行，可能不对 {unsure} 行。勾上的行改成歌词，没勾的保持听写的字。点应用之前，字幕一个字都不改。"],
    "ly-apply": ["Apply ticked", "应用勾选的"],
    "ly-apply-all": ["Apply all that match", "全部应用（可能不对的除外）"],
    "ly-cancel": ["Cancel", "取消"],
    "ly-done": ["Fixed {n} caption lines from the lyrics. Undo is available.", "已按歌词改好 {n} 行字幕，可以撤销。"],
    "ly-pick-range": ["First select the song's captions on the timeline, or mark the song with IN and OUT, then click Fix captions using lyrics.", "先在时间线上选中这首歌的字幕，或者用入点和出点框出这首歌，再点〔按歌词校准字幕〕。"],
    // 〔加字幕〕 (N3d, Deja 2026-11-04); the replacing one is for JJ
    "cap-added": ["Added {n} captions on {track}", "已在 {track} 加了 {n} 句字幕"],
    "cap-added-replaced": ["Added {n} captions on {track}, replacing the {m} that were there", "已在 {track} 加了 {n} 句字幕，换掉了原来的 {m} 句"],
    "ly-no-words": ["This part has no transcript. Transcribe it first, then fix the captions.", "这段没有听写的文字。先听写，再按歌词校准。"],
    "ly-no-lyrics": ["Paste the lyrics first.", "先把歌词粘贴进来。"],
    "ly-too-long": ["The lyrics or this part's transcript is too long: at most 3000 characters at a time. Narrow it down to one song.", "歌词或这段的听写太长了，一次最多 3000 个字。请把范围缩小到一首歌。"],
    "ly-changed": ["The project changed after this window opened, so nothing was applied. Close it and open it again.", "项目在打开这个窗口之后改过了，所以没有应用。请关掉再打开一次。"],
    // QQ on #85 / Deja (2026-11-03): only the picked captions change — said under the comparison (new, pending JJ)
    "ly-outside": ["{n} lyric lines match captions you didn't select; they are left unchanged.", "有 {n} 行歌词对应的是你没选的字幕，没改"],
    "ly-held": ["{n} selected captions are left unchanged: a lyric line runs past them.", "有 {n} 条选中的字幕没改：里面有歌词行跨出了这条字幕"],
    "as-lyrics-soon": ["Coming in a later version", "这个功能还在做，后面的版本才能用"],
    "as-a-moment": ["A lively part", "热闹的一段"],
    "as-why": ["Why: ", "为什么选："],
    "as-start": ["Start", "开头"],
    "as-end": ["End", "结尾"],
    "as-early": ["← earlier", "← 早"],
    "as-late": ["later →", "晚 →"],
    "as-drag-start": ["Hold and drag left or right to move the start", "按住左右拖，可以前后挪开头"],
    "as-drag-end": ["Hold and drag left or right to move the end", "按住左右拖，可以前后挪结尾"],
    "as-sec": ["{d} s", "{d} 秒"],
    "as-listen-start": ["▶ Hear the start", "▶ 听开头"],
    "as-listen-end": ["▶ Hear the end", "▶ 听结尾"],
    "as-guess-note": ["Where a start or end is marked “Estimated”, click “▶ Hear the start” or “▶ Hear the end” and listen before you decide.", "标着「估的」的开头结尾，先点「▶ 听开头 / 听结尾」听一下再定。"],
    "as-likely-start": ["The start is fairly likely here; still, click “▶ Hear the start” before deciding.", "开头比较可能在这里，还是点「▶ 听开头」听一下再定。"],
    "as-likely-end": ["The end is fairly likely here; still, click “▶ Hear the end” before deciding.", "结尾比较可能在这里，还是点「▶ 听结尾」听一下再定。"],
    "as-tick-to-adjust": ["Tick it to adjust its start and end.", "勾上以后可以调开头结尾。"],
    "as-play": ["▶ Preview", "▶ 试看"],
    "as-fine": ["Adjust", "调一下"],
    "as-drop": ["Not this one", "不要这条"],
    // v12 (frozen; Deja 2026-11-03): 记住我的剪辑习惯 — the card, the line under the cards, 补一段, the page, 设置 › 自动出切片
    "as-not-song": ["Not singing", "这段不是唱歌"],
    "as-is-song": ["This is singing", "这段是唱歌"],
    "as-kind-song": ["Singing", "唱歌"],
    "as-kind-interaction": ["Interaction", "互动"],
    "as-kind-chat": ["Chat", "聊天"],
    "as-kind-stunt": ["Stunt", "整活"],
    "as-kind-other": ["Other", "别的"],
    "as-tag-changed": ["Changed by you", "你改的"],
    "as-tag-added": ["Added by you", "你补的"],
    "as-marked-why": ["Last time you marked this part as not singing, so it's shown the way you changed it, with the same start and end.", "上次你把这段改成了不是唱歌，这次照你改的来，开头结尾也和上次一样。"],
    "as-kind-to-song": ["“{name}” is now marked as singing. Its start and end stay where they were; use the strips below to move them to where the singing starts and stops.", "「{name}」改成唱歌了。开头结尾没动，用下面的拖动条挪到唱歌开始和结束的地方。"],
    "as-kind-to-moment": ["“{name}” is no longer treated as singing.", "「{name}」不按唱歌处理了。"],
    "as-learn-told": [" (this change is kept on this computer and used next time)", "（这次修改记在这台电脑上，下次找的时候参考）"],
    "as-learn-on": ["Your changes here are kept on this computer and used next time; they are not sent. ", "你在这里的修改会记在这台电脑上，下次找的时候参考，不会发出去。"],
    "as-learn-on-btn": ["See, clear or turn off", "查看、清空或关掉"],
    "as-learn-off": ["“Remember my editing habits” is off: changes here are not kept, and the next search doesn't use what was kept. ", "「记住我的剪辑习惯」关着：这里的修改不会记下来，下次找也不参考以前记的。"],
    "as-learn-off-btn": ["Turn on", "打开"],
    "as-learn-on-here": ["“Remember my editing habits” is on. From now on, changes you make here are kept on this computer and never sent.", "已打开「记住我的剪辑习惯」。从现在起，你在这里的修改会记在这台电脑上，不会发出去。"],
    "as-habit-lead": ["From your habit: ", "按你以前的习惯，"],
    "as-habit-start-earlier": ["the start moved {d} s earlier", "开头提前了 {d} 秒"],
    "as-habit-start-later": ["the start moved {d} s later", "开头推后了 {d} 秒"],
    "as-habit-end-later": ["{d} s more kept at the end", "结尾多留了 {d} 秒"],
    "as-habit-end-earlier": ["the end moved {d} s earlier", "结尾提前了 {d} 秒"],
    "as-habit-why": [" (you moved {edge} of {kind} parts {n} times, {of} of them {dir})", "（你以前挪了 {n} 次{kind}片段的{edge}，{of} 次往{dir}挪）"],
    "as-habit-edge-start": ["the start", "开头"],
    "as-habit-edge-end": ["the end", "结尾"],
    "as-habit-dir-earlier": ["earlier", "前"],
    "as-habit-dir-later": ["later", "后"],
    "as-habit-kind-song": ["singing", "唱歌"],
    "as-habit-kind-moment": ["lively", "热闹"],
    "as-habit-kind-interaction": ["interaction", "互动"],
    "as-habit-kind-chat": ["chat", "聊天"],
    "as-habit-kind-stunt": ["stunt", "整活"],
    "as-habit-kind-other": ["other", "其他"],
    "as-habit-not-now": ["Not this time", "这次不用"],
    "as-habit-settings": ["Settings", "去设置"],
    "as-habit-reverted": ["“{name}” is not moved by your habit this time: back where it was found.", "「{name}」这次不按习惯调，开头结尾改回原来的位置。"],
    "as-evidence-habits": [" It also used your {n} earlier changes: {k} cards had their start or end moved by your habit; each card says so — click “Not this time” on one you do not want.", " 还参考了你以前的 {n} 次修改：有 {k} 条按你的习惯调了开头或结尾，卡片上写着，不想要就点那条的「这次不用」。"],
    "as-add-btn": ["＋ Add a part", "＋ 补一段"],
    "as-add": ["Add a part", "补一段"],
    "as-add-hint-off": ["Missed one? First set its start and end on the main timeline: put the playhead at the start and press I, at the end and press O, then come back and click “Add a part”. ", "找漏了？先在主界面时间线上设好开头和结尾：把播放头放到开头按 I，放到结尾按 O，再回来点「补一段」。"],
    "as-add-goto": ["Set them on the timeline", "去时间线上设"],
    "as-add-goto-toast": ["Once the start (I) and end (O) are set, click “✨ Auto clips” at the top, then “Add a part”.", "设好开头（I）和结尾（O）以后，点上面的「✨ 自动出切片」，再点「补一段」。"],
    "as-add-hint-on": ["Missed one? Add a card from the start and end set on the main timeline: {from} → {to} ({len})", "找漏了？用主界面时间线上设好的开头和结尾补一张：{from} → {to}（{len}）"],
    "as-add-from": ["From the start and end set on the timeline: ", "用时间线上设好的开头和结尾："],
    "as-add-total": [", {len} in all", "，共 {len}"],
    "as-add-rec": ["in {name}", "在 {name}这场"],
    "as-add-what": ["This part is:", "这段是："],
    "as-add-hint-song": ["Treated as singing; the start and end you set are kept.", "按唱歌处理，开头结尾就用你设好的。"],
    "as-add-hint-interaction": ["Calls with others, PK and reading SC all count as interaction. Treated as a lively part.", "连麦、PK、读 SC 都算互动。按热闹片段处理。"],
    "as-add-hint-moment": ["Treated as a lively part.", "按热闹片段处理。"],
    "as-add-hint-none": ["Pick one. The next search uses it too.", "选一个。下次找的时候也会参考。"],
    "as-add-name": ["Name (optional; it is the exported file's name and doesn't appear in the video)", "名字（选填，就是导出的文件名，不会出现在画面里）"],
    "as-add-ok": ["Add", "补上"],
    "as-add-pick-first": ["Pick what this part is first", "先选这段是什么"],
    "as-add-cancel": ["Cancel", "取消"],
    "as-added": ["Added “{name}”; its card says “Added by you”.", "已补上「{name}」，卡片上标了「你补的」。"],
    "as-added-why": ["Added from the start and end set on the timeline", "用时间线上设好的开头和结尾补的"],
    "as-add-failed": ["That part cannot be added: it must lie inside the recording and be at least 5 seconds long.", "这段补不上：要在这场录像里面，而且至少 5 秒。"],
    // 设置 › 自动出切片: whether 记住我的剪辑习惯 is on, beside its button (VV on #90; Deja's words)
    "as-learn-state-on": ["On", "开着"],
    "as-learn-state-off": ["Off", "关着"],
    "as-learn-title": ["Remember my editing habits", "记住我的剪辑习惯"],
    "as-learn-sub": ["This page also opens from “Settings › Auto slices”.", "在「设置 › 自动出切片」里也能打开这一页。"],
    "as-learn-switch": ["Remember my changes, to find closer next time", "记住我的修改，下次找得更准"],
    "as-learn-count": ["{n} kept: start or end moved {trim} · taken out {remove} · kind changed {kind} · added {add}", "已记 {n} 条：挪开头结尾 {trim} 条 · 不要这条 {remove} 条 · 改类型 {kind} 条 · 补一段 {add} 条"],
    "as-learn-none": ["Nothing kept yet.", "现在一次都没记。"],
    "as-learn-b1": ["Kept only on this computer and never sent, also not when you use the AI assistant.", "只存在这台电脑上，不会发出去。用 AI 助手的时候也不会发出去。"],
    "as-learn-b2": ["What is kept is what you changed, such as how many seconds an end moved or which kind of part you did not want. No picture or sound: only a few numbers about the sound (such as how often it pauses), from which the sound cannot be rebuilt.", "记的是你改了什么，比如结尾往后挪了几秒、哪类片段不要。不存画面和声音，只存几个声音统计数字（比如停顿多少），用它们还原不出声音。"],
    "as-learn-b3": ["Turned off: new changes are not kept, and the next search does not use what was kept. What was kept stays, and can be cleared.", "关掉以后：不再记新的修改，下次找也不参考以前记的。以前记的还留着，可以清空。"],
    "as-learn-clear-confirm": ["Once cleared, the next search no longer uses your {n} earlier changes. Clearing cannot be undone.", "清空以后，下次找高光就不再参考你以前的 {n} 条修改。清空不能撤销。"],
    "as-learn-ok": ["OK", "好"],
    "as-learn-clear": ["Clear the record", "清空记录"],
    "as-learn-clear-yes": ["Clear", "清空"],
    "as-learn-clear-no": ["Not now", "先不清"],
    "as-learn-turned-on": ["Turned on: from now on your changes are kept on this computer and used next time.", "打开了：以后的修改会记在这台电脑上，下次找的时候参考。"],
    "as-learn-turned-off": ["Turned off: new changes are not kept, and the next search does not use what was kept. What was kept stays and can be cleared.", "关掉了：不再记新的修改，下次找也不参考以前记的。以前记的还在，可以清空。"],
    "as-learn-cleared": ["Cleared. The next search no longer uses your earlier changes.", "已清空。下次找高光不再参考以前的修改。"],
    "as-set-title": ["Auto slices", "自动出切片"],
    "as-moved-start-later": ["The start of “{name}” moved {d} s later", "「{name}」开头往后挪了 {d} 秒"],
    "as-moved-start-earlier": ["The start of “{name}” moved {d} s earlier", "「{name}」开头往前挪了 {d} 秒"],
    "as-moved-end-later": ["The end of “{name}” moved {d} s later", "「{name}」结尾往后挪了 {d} 秒"],
    "as-moved-end-earlier": ["The end of “{name}” moved {d} s earlier", "「{name}」结尾往前挪了 {d} 秒"],
    "as-dropped-one": ["Took out “{name}”", "已拿掉「{name}」"],
    "as-put-back-one": ["Put back “{name}”", "已放回「{name}」"],
    "as-undone": ["Undone", "已撤销"],
    // JJ's final words (2026-11-04, #111 follow-up): the undo of an edit made outside this tab
    "undo-outside": ["Undid a change made by the AI or in another window, not here. If that was a mistake, click Redo to bring it back.", "撤销的这一步是 AI 或另一个窗口改的，不是你在这里改的。撤错了，点「重做」就能改回来。"],
    "as-dropped": ["Taken out: {n} (open to put them back)", "拿掉的 {n} 条（点开可以放回来）"],
    "as-put-back": ["Put back", "放回来"],
    "as-sum-n": ["{n} clips", "{n} 条"],
    "as-sum-total": ["· {total} in all", "· 共 {total}"],
    "as-sum-none": ["· none ticked", "· 一条都没选"],
    "as-place": ["Put on the timeline ({n})", "放到时间线上（{n} 条）"],
    "as-place-title": ["Put them on the main timeline to keep editing or export them", "放到主界面时间线上，接着细剪或导出"],
    "as-export": ["Export these {n} now", "直接导出这 {n} 条"],
    // the footer of the empty states (JJ's words): the buttons keep their words with 0; the reason on the left
    "as-foot-all-out": ["0 · put back the ones you want from “Taken out” first", "0 条 · 先从「拿掉的」里放回要用的"],
    "as-foot-none-ticked": ["0 · tick the ones you want first", "0 条 · 先勾上要用的"],
    // a narrow window's footer (v12: one line): the short words (English: placeholder until JJ words it)
    "as-place-short": ["Put on the timeline ({n})", "放到时间线上（{n}）"],
    "as-export-short": ["Export {n}", "导出 {n} 条"],
    // N25: the canvas taken from the first recording (JJ's words, on #97)
    "canvas-follow": ["Video size and frame rate set from this recording: {w}×{h}, {fps} fps.", "已按这场录像设置画面大小和帧率：{w}×{h}，每秒 {fps} 帧。"],
    "canvas-follow-odd": ["Video size set from this recording: {w}×{h}. Its frame rate (about {src} fps) is unusual, so 30 fps is used for now; you can change it in the frame rate menu above the preview.", "已按这场录像设置画面大小：{w}×{h}。它的帧率（约每秒 {src} 帧）不常见，先用每秒 30 帧；想改的话，在预览上方的帧率那里改。"],
    "as-placed": ["Put {n} on the timeline; you can keep editing them.", "已把 {n} 条放到时间线上，可以接着细剪。"],
    "as-undo": ["Undo", "撤销"],
    // caption size and position in one go (P5; v10 ④, JJ's words of v7.4 and her final #81 changes)
    "cq-open": ["Caption size & position", "字幕大小和位置"],
    "cq-who-selected": ["The {n} selected captions", "选中的 {n} 条字幕"],
    "cq-who-all": ["All {n} captions", "全部 {n} 条字幕"],
    "cq-size": ["Size", "字号"],
    "cq-small": ["Small", "小"],
    "cq-mid": ["Medium", "中"],
    "cq-big": ["Large", "大"],
    "cq-pos": ["Position", "位置"],
    "cq-top": ["Top", "上面"],
    "cq-bottom": ["Bottom", "下面"],
    "cq-desc": ["Changes the size and position of these {n} captions in one go; the words stay the same. Captions you adjusted one by one are changed too (except animated ones). You can undo it.", "一次改掉这 {n} 条字幕的字号和位置，字幕的字不动。单独调过的也会改成一样（带动画的除外），改完可以撤销。"],
    "cq-mixed-size": ["The sizes differ now; click one to make them all the same", "现在大小不一样，点一下就统一"],
    "cq-mixed-pos": ["The positions differ now; click one to make them all the same", "现在位置不一样，点一下就统一"],
    "cq-done-size": ["Set the size of {n} captions to “{size}”.", "已把 {n} 条字幕的字号改成「{size}」。"],
    "cq-done-top": ["Moved {n} captions to the top of the picture.", "已把 {n} 条字幕移到画面上面。"],
    // a caption keyed on the property is skipped (Deja, #81; JJ's final words, one caption or several)
    "cq-animated-one": ["1 caption is animated (its size or position changes over time), so it was left as it is. To change it, select it and adjust it in the Inspector.", "有 1 条字幕带动画（字会变大变小或移动），这次没改它。要改的话，选中它，到「属性面板」里调。"],
    "cq-animated-many": ["{n} captions are animated (their size or position changes over time), so they were left as they are. To change them, select each one and adjust it in the Inspector.", "有 {n} 条字幕带动画（字会变大变小或移动），这次没改它们。要改的话，选中它们，到「属性面板」里一条条调。"],
    "cq-done-bottom": ["Moved {n} captions to the bottom of the picture.", "已把 {n} 条字幕移到画面下面。"],
    "as-place-failed": ["Nothing was put on the timeline: {why}", "没放上去：{why}"],
    "as-no-lane": ["no track is targeted for this recording. Click a track name on the left (such as V1) to target it (unlock it first if it's locked), then try again.", "没有可以放的轨道。点一下左边的轨道名（比如 V1）选中它（锁着的先解锁），再试一次。"],
    "as-fine-toast": ["Selected “{name}” on the timeline. Adjust it to the frame on the right; when done, “✨ Auto clips” at the top right brings you back.", "在时间线上选中了「{name}」。右边可以精确到帧调；调好以后点右上角「✨ 自动出切片」接着看。"],
    "as-ex-title": ["Export {n}?", "开始导出 {n} 条？"],
    "as-ex-info": ["One file each, with this project's export settings. When they are done, save them from the export queue.", "每条导出一个文件，用这个项目的导出设置。导出好以后，在导出队列里保存。"],
    "as-ex-go": ["Export", "导出"],
    "as-ex-cancel": ["Look again", "再看看"],
    // v10 / JJ v2 section two: subtitles (the English is not JJ's yet)
    "as-subs": ["Subtitles", "字幕"],
    "as-sub-local": ["Add subtitles (transcribed on this computer; no sound is sent)", "加字幕（在这台电脑上听写，声音不发出去）"],
    "as-sub-none": ["Add subtitles (transcription is not installed)", "加字幕（还没装听写）"],
    "as-sub-go": ["Install", "去装"],
    "as-sub-none-hint": ["Highlights still work; there just won't be subtitles this time.", "找高光照样能用，只是这次不出字幕。"],
    "as-run-listen": ["Transcribe the speech (for the subtitles): an hour of recording usually takes a few minutes", "听写成文字（字幕要用）：1 小时录像通常要几分钟"],
    "as-run-listen-none": ["Transcribe the speech: transcription is not installed on this computer, so this is skipped; highlights are not affected", "听写成文字：这台电脑还没装听写，先跳过，不影响找高光"],
    "as-run-listen-off": ["Transcribe the speech: you chose no subtitles, skipped", "听写成文字：你选了不加字幕，跳过"],
    "as-ex-nosub": ["No subtitles this time: transcription is not installed on this computer. The videos export as usual. For subtitles, install it in Settings › Transcription (one download, about 230 MB), then come back and export.", "这次没有字幕：这台电脑还没装听写。成片照样能导出。要字幕的话，到「设置 › 听写」装上（要联网下载一次，约 230 MB），再回来导出。"],
    "as-sub-line": ["Subtitles: {n} sentences, transcribed; the singing may have wrong words", "字幕：{n} 句，是听写出来的，唱歌部分可能有错字"],
    "as-exporting": ["Exporting {n}…", "正在导出 {n} 条…"],
    "as-done-title": ["Exported: {n}", "导出好了，{n} 条"],
    "as-done-partial": ["Exported {n}; {failed} didn't", "导出好了 {n} 条，{failed} 条没成功"],
    "as-done-sub": ["They are in the export queue; save each one where you like.", "都在导出队列里，可以逐条存到你想放的地方。"],
    "as-fail": ["{failed} didn't export: “{name}”. {why}. Your edits are all still here. Click Try again, or open the export queue to see why.", "有 {failed} 条没导出来：「{name}」。{why}。你的剪辑都还在，点「再试一次」，或者打开导出队列看原因。"],
    "as-fail-why-space": ["The drive it saves to is out of space", "存视频的那个盘空间不够了"],
    "as-fail-why-changed": ["The timeline changed after it was queued, so it wasn't exported", "加进导出以后，时间线又改过了，所以没导"],
    "as-fail-why-other": ["The export stopped partway", "导出到一半停下了"],
    "as-retry": ["Try again", "再试一次"],
    "as-open-queue": ["Open the export queue", "打开导出队列"],
    "as-back-review": ["Back to review", "回去再改改"],
    "as-another": ["Another stream", "再切一场"],
    "as-notify-title": ["MontClip: done", "MontClip：找完了"],
    "as-notify-body": ["Found {found}; open ✨ Auto clips to look them over.", "找到 {found} 条，打开「✨ 自动出切片」看一遍。"],
    "as-preview": ["Preview", "试看"],
    "as-preview-close": ["Close", "关闭"],
    "as-dur-hm": ["{h} h {m} min", "{h} 小时 {m} 分"],
    "as-dur-ms": ["{m} min {s} s", "{m} 分 {s} 秒"],
    "as-dur-s": ["{s} s", "{s} 秒"],
    // danmaku import (for JJ to review)
    "dm-import": ["Import danmaku…", "导入弹幕…"],
    "dm-import-title": ["Import danmaku for the recording of the selected clip (a BililiveRecorder or Bilibili .xml file)", "给选中片段所在的那场录像导入弹幕（录播姬或 B 站的 .xml 文件）"],
    "dm-reading": ["Reading {name}…", "正在读取 {name}…"],
    "dm-imported": ["{n} danmaku imported for {name}.", "已为 {name} 导入 {n} 条弹幕。"],
    "dm-pick-clip": ["Select a clip of this recording on the timeline first, then import the danmaku.", "先在时间线上选中这场录像的片段，再导入弹幕。"],
    "dm-bad": ["This is not a BililiveRecorder or Bilibili danmaku file. For BililiveRecorder, pick the .xml file with the same name next to the recording.", "这不是录播姬或 B 站的弹幕文件。录播姬的话，选录像旁边那个同名的 .xml 文件。"],
    "dm-too-many": ["More than {n} danmaku in one file: not imported.", "一个文件里的弹幕超过 {n} 条，没有导入。"],
    "dm-remove": ["Remove danmaku ({n})", "移除弹幕（{n} 条）"],
    "dm-removed": ["Danmaku removed from {name}.", "已移除 {name} 的弹幕。"],
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
    "export-unsaved-body-1": ["This video is exported but not yet saved to a place you chose. After closing it won't be in the export queue any more, but it still takes up space on drive C.", "这个视频已经导出好了，还没存到你选的地方。关掉以后，导出队列里就找不到它了，但它还占着 C 盘空间。"],
    "export-unsaved-body-n": ["These videos are exported but not yet saved to a place you chose. After closing they won't be in the export queue any more, but they still take up space on drive C.", "这些视频已经导出好了，还没存到你选的地方。关掉以后，导出队列里就找不到它们了，但它们还占着 C 盘空间。"],
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
    "dlv-note-master": ["Project size · H.264 CRF 16 · AAC 320k", "和项目一样大 · 高画质 · H.264 恒定画质（CRF）16 · AAC 320k"],
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
    // JJ (#74): the version kept before the AI's edits, named in the interface language only
    "before-ai": ["Before AI changes", "AI 改之前"],
    // JJ (#71): the selection / proposal dialog in the interface language only, never 「中文 / English」 together
    "ssel-title-ranges": ["Keep a few ranges by time, joined into one", "按时间保留几段，拼成一条"],
    "ssel-title-slices": ["Separate clips by time", "按时间切成多条"],
    "ssel-intro-ranges": ["Keep these ranges by time, joined into one video. Source files stay unchanged; Undo is available.", "按时间保留这些片段，拼成一条。原片不变，可以撤销。"],
    "ssel-intro-slices": ["Each range becomes its own clip and file. Applying keeps only these ranges on the timeline (Undo is available) and adds {n} clips to the export queue; you press Start. Source files stay unchanged.", "每段单独成一条切片、一个文件。应用后时间线上只留下这些片段（可以撤销），再把 {n} 条切片加进导出队列，由你点「开始」。原片不变。"],
    "ssel-label-time": ["Time ranges to keep (seconds)", "要留下的时间段（秒）"],
    "ssel-sum-ranges": ["{ranges} join to {duration} in total, in the order you ticked.", "{ranges} 拼起来一共 {duration}，按你勾选的顺序。"],
    "ssel-sum-cut": ["{cut} captions are only partly inside the cut; listen to their start and end.", "有 {cut} 句字幕只剪进去一半，请听一下开头和结尾。"],
    "ssel-sum-cut-one": ["1 caption is only partly inside the cut; listen to its start and end.", "有 1 句字幕只剪进去一半，请听一下开头和结尾。"],
    "ssel-sum-slice": ["{name}: {from}–{to} ({len} s)", "{name}：{from}–{to}（{len} 秒）"],
    "ssel-sum-slice-sep": ["; ", "；"],
    "ssel-done-ranges": ["Joined these ranges. Undo is available.", "已拼接这些片段，可撤销。"],
    "ssel-done-slices": ["Kept {n} ranges and added them to the export queue. Undo is available.", "已留下 {n} 段，并加进导出队列，可撤销。"],
    "ssel-queue-changed": ["The timeline changed after this clip was queued, so it was not exported. Ask the assistant for a new suggested edit based on the current timeline.", "时间线在加入队列之后改过了，这条切片没有导出。请让助手按现在的时间线再给一次剪辑建议。"],
    // P4 (permission modes): the host's approval box and what follows it. New copy, for JJ.
    "ap-title": ["The AI wants to do this step", "AI 想做这一步"],
    "ap-project": ["In the project: {name}", "改的是项目：{name}"],
    "ap-sends-to": ["Sends to: {domain}", "发往：{domain}"],
    "ap-content": ["What is sent:", "要发出去的内容："],
    "ap-every-time": ["This can't be undone, so you are asked every time.", "这类操作撤不回，所以每次都会问你。"],
    "ap-once": ["Allow this once", "只批准这次"],
    "ap-session": ["Allow for this chat", "这个聊天中都批准"],
    "ap-deny": ["Don't allow", "不同意"],
    "ap-denied": ["Not done. Nothing changed.", "没有做这一步，什么都没改。"],
    "ap-listed": ["Plan mode: this step is only listed, not done. Switch to another mode at the top of the assistant to do it.", "计划模式：这一步只列出来，没有做。要做的话，在助手顶部换一种模式。"],
    "ap-refused": ["This step is never allowed, in any mode. Nothing changed.", "这一步任何模式下都不允许，什么都没改。"],
    "ap-refused-mode": ["The assistant has no mode chosen right now, so nothing was done. Choose a mode at the top of the assistant.", "助手现在没有选模式，所以什么都没做。请在助手顶部选一种模式。"],
    "ap-applied": ["Done as the AI suggested, without asking ({mode} mode). Undo is available.", "已按 AI 的建议改好，没有问你（{mode}模式）。可以撤销。"],
    "ap-stale": ["The project changed after this reply, so this step was not done.", "项目在回复之后改过了，所以没有做这一步。"],
    "ap-yolo-on": ["Yolo is on", "Yolo 开着"],
    "ap-sum-sentences": ["Keep {count} sentences, about {duration} in the final cut.", "保留 {count} 句，成片大约 {duration}。"],
    "ap-sum-ranges": ["Keep {count} ranges joined into one video, about {duration}.", "保留 {count} 段，拼成一条，大约 {duration}。"],
    "ap-sum-slices": ["Cut {count} separate clips, one file each, about {duration} in total.", "切出 {count} 条切片，每条一个文件，一共大约 {duration}。"],
    "ap-undo": ["Undo", "撤销"],
    // P4, second half: the plan list. New copy, for JJ.
    "pl-step-of": ["Step {n} of {total} of the plan.", "计划的第 {n} 步，共 {total} 步。"],
    "pl-denied": ["You didn't allow it.", "你没有同意。"],
    "pl-listed": ["Plan mode: only listed.", "计划模式，只列出来。"],
    "pl-refused": ["This step is never allowed.", "这一步任何时候都不允许做。"],
    "pl-no-executor": ["The assistant can't do this step yet.", "助手现在还做不了这一步。"],
    "pl-busy": ["MontClip was busy with something else. When it's done, ask the assistant to plan again.", "软件正在忙别的事。等它做完，再让助手重新排一次。"],
    "pl-cancelled": ["You closed the preview without applying.", "你关掉了预览，没有应用。"],
    "pl-stale": ["It doesn't fit the project as it is now.", "和现在的项目对不上。"],
    "pl-plan-mode": ["Plan mode only makes plans. To carry it out, switch to Manual, Auto or Yolo at the top of the assistant.", "计划模式只出计划。要执行的话，在助手顶部换成手动、自动或 Yolo。"],
    "pl-discarded": ["You dropped this plan. Nothing was done.", "这个计划不要了，什么都没做。"],
    "pl-done": ["Every step is done. You can undo the whole plan at once.", "每一步都做完了。可以一次撤销整个计划。"],
    "pl-stopped": ["The plan stopped at this step; the steps after it were not done. You can ask the assistant to plan again from the project as it is now.", "计划停在了这一步，后面的步骤没有做。可以让助手按现在的项目重新排一次计划。"],
    "pl-stale-plan": ["The project changed after this reply, so the plan was not started. Ask again.", "项目在回复之后改过了，所以没有开始这个计划。请重新问一次。"],
    "pl-undone": ["Undid every step of this plan.", "已撤销这个计划的每一步。"],
    "pl-undo-interleaved": ["Can't undo the plan at once: something was changed after it. Use Undo step by step.", "没法一次撤销整个计划：计划之后又改过别的。请用「撤销」一步一步撤。"],
    "pl-undo-none": ["There is nothing of this plan left to undo.", "这个计划没有可以撤销的了。"],
    // over an external cap (Deja on #83): refused with by how much, never cut down to fit
    "ap-too-large": ["This send is {size}; the most at a time is {limit}, so it is {over} over. Nothing was sent, and it won't be cut down to fit.", "这次要发出去的有 {size}，每次最多 {limit}，超了 {over}。没有发送，也不会截短了再发。"],
    "ap-scope-limit": ["This chat has already sent {used}; {size} more would pass its {limit} cap by {over}. Nothing was sent, and it won't be cut down to fit.", "这个聊天已经发出去 {used}，再发这 {size} 就超过 {limit} 的上限，超了 {over}。没有发送，也不会截短了再发。"],
    "ap-invalid": ["This suggested edit doesn't fit the project as it is, so nothing was done.", "这条剪辑建议和现在的项目对不上，所以没有做。"],
  };
  // First use (Deja's D, 2026-11-04, after VV's walk): import from inside 〔✨ 自动出切片〕, and the bin while a file comes
  // in. For JJ to review.
  Object.assign(own, {
    "as-import": ["+ Import recording", "+ 导入录像"],
    "bin-importing": ["Importing… {pct}%", "正在导入… {pct}%"],
  });
  for (const [k, [en, zh]] of Object.entries((terms && terms.rows) || {})) { text.en["term." + k] = en; text["zh-CN"]["term." + k] = zh; }
  // 帮助层 87 行（JJ 定稿表 A，2026-11-05）：英文就是页面自己的标记，键里只放中文（en 留空，
  // applyI18n 的 data-i18n-html 在英文时还原页面原样）。
  Object.assign(own, {
    "help-1": ["", "播放 / 暂停（源监视器或播放器，哪个在用就控制哪个）"],
    "help-2": ["", "往返预览 — <kbd>L</kbd> 往前播，<kbd>J</kbd> 倒着播（没有声音）；再按一下变成 1.5× · 2× · 4×，按另一个键掉头；<kbd>K</kbd> 停"],
    "help-3": ["", "按住 <kbd>K</kbd> 再点一下，走一帧；两个一起按住，用 ¼ 速度慢慢走"],
    "help-4": ["", "走 1 帧（加 <kbd>⇧</kbd> 是 1 秒）"],
    "help-5": ["", "跳到上一个 / 下一个剪辑点（选了片段时，先跳它的入点再跳出点；没选时，看目标轨道）。在源监视器里：跳到入点 / 出点"],
    "help-6": ["", "跳到开头 / 结尾"],
    "help-7": ["", "直接输入时间：<code>01:15:00</code>，连着写 <code>1500</code>（= 15 秒），<code>+30</code> / <code>-1:00</code> 往后 / 往前挪，<code>12.5</code> 秒。点入点 / 出点的时间也能这样输入"],
    "help-8": ["", "播到出点就停；Home / End 跳到入点 / 出点"],
    "help-9": ["", "载入源监视器"],
    "help-10": ["", "把源的入点→出点那段插到时间线播放头处（后面的片段往后让）"],
    "help-11": ["", "替换 — 在播放头处覆盖；如果源里载入的是时间线上的片段，就把新的入点 / 出点用到它上面（长度变了，后面的片段跟着挪）"],
    "help-12": ["", "工具：选择 · 波纹编辑（拖片段的边，后面的跟着走）· 滚动编辑（拖两段之间的剪辑点）· 内滑（片段位置不动，换里面用的那一段）· 外滑（挪动片段，两边的片段跟着裁）"],
    "help-13": ["", "在播放头处分割片段（有选中的就分选中的，没有就分目标轨道上的）"],
    "help-14": ["", "把选中片段的开头 / 结尾裁到播放头"],
    "help-15": ["", "删除选中的片段，或者去掉当前选中的转场"],
    "help-16": ["", "波纹删除 — 删掉选中的，并把目标轨道上的空隙合拢"],
    "help-17": ["", "找下一个所有轨道都空着的空隙（到结尾后从头再找；只在入点–出点之间找）"],
    "help-18": ["", "合拢播放头处的空隙（目标轨道）"],
    "help-19": ["", "在播放头处加转场（前后各占一半）"],
    "help-20": ["", "停用 / 启用选中的片段 — 停用后预览和导出都看不到"],
    "help-21": ["", "取消 / 建立视频与音频的链接"],
    "help-22": ["", "撤销 / 重做（<kbd>Ctrl</kbd>+<kbd>Y</kbd> 也是重做）"],
    "help-23": ["", "框选片段"],
    "help-24": ["", "加进选择 / 从选择里去掉"],
    "help-25": ["", "全选 / 取消选择"],
    "help-26": ["", "停用 / 锁定 / 建立或取消链接 / 预合成"],
    "help-27": ["", "设源的入点 / 出点（源模式），或者设时间线的工作区（播放器模式；导出也只导这一段）"],
    "help-28": ["", "清除源或时间线的入点 / 出点"],
    "help-29": ["", "在入点 / 出点处分割片段"],
    "help-30": ["", "把片段裁到入点 / 出点（去掉前后多出来的）"],
    "help-31": ["", "提起 / 提取目标轨道上入点→出点那段（提取会把空隙补上）"],
    "help-32": ["", "在播放头处加 / 删标记"],
    "help-33": ["", "跳到下一个 / 上一个标记"],
    "help-34": ["", "拖动可移动 · 点击跳过去 · 双击或右键可改名、换颜色、删除 · 「标记」面板里列着全部标记"],
    "help-35": ["", "缩放时间线"],
    "help-36": ["", "以鼠标位置为中心缩放"],
    "help-37": ["", "缩放到选中的片段"],
    "help-38": ["", "缩放到入点–出点工作区"],
    "help-39": ["", "缩放到显示全部"],
    "help-40": ["", "打开 / 关闭吸附 — 点 ▾ 选吸附到什么（片段边缘、播放头、标记、入点 / 出点、关键帧、帧格）"],
    "help-41": ["", "设为 / 取消目标轨道 — 编辑只作用在亮着的（目标）轨道上"],
    "help-42": ["", "只听这条轨道（其他轨道都静音；再点一次恢复）"],
    "help-43": ["", "锁定这条轨道 — 上面的东西都不能改、不能挪"],
    "help-44": ["", "删掉一条空轨道（至少留 1 条视频轨和 1 条音频轨）"],
    "help-45": ["", "跳到上一个 / 下一个关键帧（属性面板跟着变）"],
    "help-46": ["", "把这个属性恢复默认，并清掉它的所有关键帧"],
    "help-47": ["", "把播放头处的值恢复默认，或者删掉那个关键帧"],
    "help-48": ["", "「入场」「出场」「在播放头处」「循环」这几个菜单，可以给选中的片段加上现成的动画 · 〔保存为预设〕把这个片段的关键帧存下来，所有项目都能用"],
    "help-49": ["", "拖动改音量 · <kbd>Ctrl/Cmd</kbd>+点击加关键帧 · <kbd>Alt</kbd>+点击或双击删关键帧 · 拖两个角上的小方块做淡入淡出"],
    "help-50": ["", "给选中片段旁边（或播放头处）的声音剪辑点加交叉淡化"],
    "help-51": ["", "导入素材文件"],
    "help-52": ["", "新建文件夹 · 新建复合片段"],
    "help-53": ["", "可以搜名字、类型、编码、<code>2160p</code> 或标签；<code>#tag</code> 只搜标签 · <kbd>Esc</kbd> 清空"],
    "help-54": ["", "找出时间线上用到它的地方 · 素材信息 · 收藏 · 标签 · 合集"],
    "help-55": ["", "加星标 · 列出它用在哪些地方（点一个就跳过去）"],
    "help-56": ["", "列表视图，带素材信息的各列 · 点列名排序"],
    "help-57": ["", "〔在项目中显示〕— 在素材库里找到它的文件"],
    "help-58": ["", "〔重新链接…〕— 告诉 MontClip 这段录像现在在哪 · 〔替换文件…〕— 换成另一个文件，用到它的片段都跟着换"],
    "help-59": ["", "〔创建代理〕— 做一份更轻的副本，剪起来更流畅（右键「项目」标签页可以一次做全部）· 监视器上方的〔代理〕可以开关代理播放；导出永远用原片"],
    "help-60": ["", "双击在时间线上打开 · 把素材库里的复合片段拖到时间线上就放进去了 · 点时间线上方的路径可以退回上一层"],
    "help-61": ["", "预合成 — 把选中的片段放进一个新的复合片段"],
    "help-62": ["", "退回上一层（什么都没选中时）"],
    "help-63": ["", "把字幕条、标志动画或社交平台版式拖到时间线上（或点 ＋）· 在属性面板的「模板」一栏里填内容 · 右键复合片段 →〔保存为模板〕"],
    "help-64": ["", "打开项目列表（或者点项目名）"],
    "help-65": ["", "给当前项目存一个版本（每一步本来就自动保存了；版本是以后可以回到的一个点）"],
    "help-66": ["", "拿某个版本和现在比 ·〔恢复…〕（点两次；恢复前会先把现在的存成一个版本）· 标成定稿"],
    "help-67": ["", "打开这个项目里的另一个序列 ·〔新建序列…〕（任意画面尺寸，空的或者复制一份）·〔复制一份〕·〔重命名…〕·〔删除…〕（点两次；删之前先存成一个版本）"],
    "help-68": ["", "点一下看详情、备注和标签 · 双击打开"],
    "help-69": ["", "打开这个项目"],
    "help-70": ["", "先退出「新建项目」，再关掉项目列表"],
    "help-71": ["", "点两次 — 只有已归档的项目才能删"],
    "help-72": ["", "拖动调色偏（按住 <kbd>⇧</kbd> 可以微调）· 双击恢复颜色 · 双击名称或滑块名可以恢复那一项"],
    "help-73": ["", "在监视器上点一下：可以校正白平衡、在曲线上标出这个颜色，或者在图层的颜色选区里选中它 · <kbd>Esc</kbd> 取消"],
    "help-74": ["", "点击在曲线上加点 · 拖动移动它 · 双击删掉它"],
    "help-75": ["", "在里面拖动可移动 · 拖手柄改大小 · 拖圆钮旋转（按住 <kbd>⇧</kbd> 每次转 15°）· 多边形 / 贝塞尔：<kbd>Ctrl/Cmd</kbd>+点击加点，双击删点 · 绘制：拖出一个手画的轮廓"],
    "help-76": ["", "点击放点，放点时拖动可以拉出曲线手柄 · 点第一个点或按 <kbd>Enter</kbd> 闭合 · <kbd>Ctrl</kbd>+<kbd>Z</kbd> / <kbd>Backspace</kbd> 删掉最后一个点，<kbd>Ctrl</kbd>+<kbd>⇧</kbd>+<kbd>Z</kbd> 放回来 · <kbd>Esc</kbd> 取消"],
    "help-77": ["", "拖出一个手画的轮廓 — 它会变成可以再改的贝塞尔曲线"],
    "help-78": ["", "在里面拖动可移动 · 拖边上的手柄改大小 · 拖圆钮旋转（按住 <kbd>⇧</kbd> 每次转 15°）· 拖点或它的手柄（按住 <kbd>Alt</kbd> 两边手柄分开动）· <kbd>Alt</kbd>+拖点拉出新手柄 · <kbd>Ctrl/Cmd</kbd>+点击轮廓加点 · 双击点删掉它 · <kbd>Esc</kbd> 取消选择"],
    "help-79": ["", "在里面拖动可移动 · 拖角改大小（按住 <kbd>⇧</kbd> 保持比例）· 拖圆钮旋转（按住 <kbd>⇧</kbd> 每次转 15°）· 直线 / 路径：拖点或它的手柄（按住 <kbd>Alt</kbd> 两边手柄分开动），<kbd>Alt</kbd>+拖点拉出新手柄 · 路径：<kbd>Ctrl/Cmd</kbd>+点击轮廓加点，双击点删掉它 · <kbd>Esc</kbd> 取消选择"],
    "help-80": ["", "点击放点，放点时拖动可以拉出曲线手柄 · 点第一个点闭合路径 · 按 <kbd>Enter</kbd> 保持不闭合 · <kbd>Ctrl</kbd>+<kbd>Z</kbd> / <kbd>Backspace</kbd> 删掉最后一个点，<kbd>Ctrl</kbd>+<kbd>⇧</kbd>+<kbd>Z</kbd> 放回来 · <kbd>Esc</kbd> 取消"],
    "help-81": ["", "拖关键帧小方块可移动 · 拖手柄可以把路径拉弯（按住 <kbd>Alt</kbd> 两边手柄分开动）· <kbd>Alt</kbd>+拖关键帧拉出新手柄 · 双击关键帧变回尖角"],
    "help-82": ["", "在监视器上拖动来移动锚点，画面不动（按住 <kbd>⇧</kbd> 吸附到画面中心）· <kbd>Esc</kbd> 关掉"],
    "help-83": ["", "在监视器上点要跟踪的位置 — 从播放头一直跟到片段结尾 · <kbd>Esc</kbd> 取消选点，或者停下正在跑的跟踪（已经跟好的部分会留着）"],
    "help-84": ["", "跳到那里 · <kbd>⇧</kbd>+点击或拖动可以选中连着的一串字"],
    "help-85": ["", "剪掉选中的字和后面的停顿（在目标轨道上提取）· <kbd>Esc</kbd> 取消选择"],
    "help-86": ["", "<kbd>Enter</kbd> / <kbd>⇧</kbd>+<kbd>Enter</kbd> 跳到下一个 / 上一个找到的地方 · 〔剪切〕把找到的全部剪掉"],
    "help-87": ["", "选一个样式，再点〔添加字幕〕（撤销一次就能全部撤回；会替换那里原有的字幕）· 点 SRT / VTT 可以下载字幕 · 〔导入…〕把字幕文件里的字幕放上来"],
    // 第 1 批定稿 by JJ (2026-11-05, sha256 5eb9771d…) of the second scan by Rea: the help layer (left column, heading
    // notes), the Show filter of the bin, the right-click menus. The wording of JJ where JJ changed a line, else the draft
    // by Rea (51372521). An empty English keeps the markup of the page (data-i18n-html).
    "help-l-7": ["", "<kbd>0</kbd>–<kbd>9</kbd> / 点击时间码"],
    "help-l-24": ["", "<kbd>Ctrl</kbd>+点击片段"],
    "help-l-36": ["", "<kbd>Ctrl</kbd>+滚动滚轮"],
    "help-l-46": ["", "<kbd>Ctrl/Cmd</kbd>+点击属性面板的名称或滑块"],
    "help-l-47": ["", "<kbd>⇧</kbd>+点击名称"],
    "help-l-51": ["", "<kbd>Ctrl</kbd>+点击素材库"],
    "help-l-52": ["", "右键<b data-i18n=\"term.project\">项目</b>标签页"],
    "help-l-63": ["", "<b data-i18n=\"term.templates\">模板</b>标签页"],
    "help-l-69": ["", "<kbd>Enter</kbd> 在卡片上"],
    "help-l-55": ["☆ / uses badge on a bin file", "素材上的 ☆ / 用了几次的小标"],
    "help-l-56": ["☰ in the bin", "素材库里的 ☰"],
    "help-l-68": ["Project card", "项目卡片"],
    "help-sequence-menu": ["sequence menu", "序列菜单"],
    "help-h-editing": ["Editing", "编辑"],
    "help-n-projects": ["top bar → Projects", "顶栏 → 〔项目〕"],
    "help-n-shapes": ["bin → Shapes · Inspector", "素材库 → 形状 · 属性面板"],
    "help-n-tracking": ["Inspector → Tracking · a mask’s Track buttons", "属性面板 → 跟踪 · 蒙版上的〔跟踪〕按钮"],
    "help-n-transcript": ["side panel → Transcript", "侧边栏 → 文稿"],
    "bin-all": ["All media", "全部素材"], "bin-fav": ["★ Favorites", "★ 收藏"],
    "bin-used": ["Used in the edit", "时间线上用到的"], "bin-unused": ["Unused", "时间线上没用到的"],
    "bin-proxy": ["Has a proxy", "有代理的"], "bin-noproxy": ["Video without a proxy", "还没做代理的视频"], "bin-image": ["Image", "图片"],
    "bin-group-kind": ["Kind", "类型"], "bin-group-collections": ["Collections", "分组"], "bin-group-tags": ["Tags", "标签"], // JJ
    "seq-duplicate": ["Duplicate “{name}”", "复制一份「{name}」"], "seq-rename": ["Rename “{name}”…", "重命名「{name}」…"],
    "seq-delete": ["Delete “{name}”…", "删除「{name}」…"], "seq-keep-one": ["A project keeps at least one sequence", "一个项目至少要留一个序列"],
    "snap-to": ["Snap to", "吸附到"], "snap-clips": ["Clip edges", "片段边缘"], "snap-playhead": ["Playhead", "播放头"],
    // VV's four (JJ agreed): the export frame's first choice
    "ef-full-canvas": ["Full canvas", "完整画布"],
    "snap-targets-title": ["Snap targets — clip edges, playhead, markers, IN/OUT, keyframes, frame grid", "吸附目标 — 片段边缘、播放头、标记、入点/出点、关键帧、每一帧"],
    "seq-button-title": ["Sequence: {name} — open another one, or add, duplicate, rename", "序列：{name} — 打开别的序列，或新建、复制一份、重命名"],
    "snap-inout": ["IN / OUT", "入点 / 出点"], "snap-keyframes": ["Keyframes", "关键帧"], "snap-frames": ["Frame grid", "每一帧"],
    "markers-empty": ["No markers yet — press <kbd>M</kbd> at the playhead.", "还没有标记 — 按 <kbd>M</kbd> 在播放头处加一个。"],
    "mm-open-source": ["Open in Source", "在源监视器中打开"], "mm-instances": ["Find timeline instances ({n})", "在时间线上找到它（{n} 处）"],
    "mm-info": ["Media info…", "素材信息…"], "mm-relink-copy": ["Relink to another copy…", "重新链接到另一份文件…"],
    "mm-proxy-540": ["Create proxy (540p)", "创建代理（540p）"], "mm-proxy-720": ["Create proxy (720p)", "创建代理（720p）"], // term.create-proxy (Rea)
    "mm-fav-add": ["Add to favorites", "加入收藏"], "mm-tags": ["Tags…", "标签…"], "mm-new-collection": ["New collection…", "新建分组…"],
    "mm-remove": ["Remove from project", "从项目里移除"],
    // English draft, for JJ
    "mm-remove-title": ["Takes it out of this project only, together with the clips that use it on the timeline (you can undo this). The file on your computer is not touched.",
      "只从这个项目里拿掉，时间线上用到它的片段也会一起拿掉（可以撤销）。电脑上的原文件不动。"],
    "track-remove": ["Remove track", "删除轨道"],
    // the sequence menu's Highlights… and the dialog it opens: one name (English drafts, for JJ)
    "hl-menu": ["Auto short…", "自动拼短片…"], "hl-title": ["Auto short", "自动拼短片"], "hl-make": ["Make", "拼好"],
    "hl-desc": ["From the selected clips (or the whole timeline, if none is selected), picks the parts with the most movement and the loudest sound and puts them together in a new sequence. The sequence you are in stays as it is.",
      "从选中的片段里（没选就用整条时间线），挑出画面动得多、声音大的几段，拼成一个新序列。原来的序列不动。"],
    // the export-frame drop-down above the player (app.js EXPORT_FRAME_ASPECTS): JJ定稿 (2026-11-05, via Deja), English
    // included — no platform names (Reel, IG). ef-full-canvas is the key VV's four (#148, JJ agreed) use for the same words.
    "ef-9-16": ["9:16 Vertical", "9:16 竖屏"],
    "ef-16-9": ["16:9 Landscape", "16:9 横屏"],
    "ef-4-5": ["4:5 Portrait", "4:5 竖图"],
    "ef-1-1": ["1:1 Square", "1:1 方形"],
    "ef-custom": ["Custom · {w}×{h}", "自定义 · {w}×{h}"],
    "ef-title": ["Export frame: the part of the canvas that gets exported.", "导出画面：在画布里框出要导出的那一块。"],
  });
  for (const [k, [en, zh]] of Object.entries(own)) { text.en["own." + k] = en; text["zh-CN"]["own." + k] = zh; }
  // English by number (JJ, 2026-11-04; MontClipView.tp): 〔加字幕〕, by the captions added, then by the ones replaced. The
  // Chinese sentences have one form; the keys without a form stay as the fallback.
  Object.assign(text.en, {
    "own.cap-added_one": "Added {n} caption on {track}",
    "own.cap-added_other": "Added {n} captions on {track}",
    "own.cap-added-replaced_one_one": "Added {n} caption on {track}, replacing the one that was there",
    "own.cap-added-replaced_one_other": "Added {n} caption on {track}, replacing the {m} that were there",
    "own.cap-added-replaced_other_one": "Added {n} captions on {track}, replacing the one that was there",
    "own.cap-added-replaced_other_other": "Added {n} captions on {track}, replacing the {m} that were there",
  });
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
  /** t with plural forms (JJ, 2026-11-04): the key's form for each count, in order — key_one / key_other, or with two
   *  counts key_one_other … (Intl.PluralRules of the language). A language without that form uses its key without one
   *  (Chinese has one form), then English's form, then English's key. */
  function tp(language, key, counts, vars) {
    const l = text[language] ? language : "en", rules = new Intl.PluralRules(l === "en" ? "en" : "zh-CN"), en = new Intl.PluralRules("en");
    const form = (r) => key + Object.values(counts).map((c) => "_" + r.select(Number(c))).join("");
    const s = text[l][form(rules)] ?? text[l][key] ?? text.en[form(en)] ?? text.en[key] ?? "";
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
    // rich cells (help rows): one keyed Chinese HTML line replaces the cell's markup; the original
    // markup is stashed once so switching back to English restores it. Strings are repo-authored.
    for (const el of rootEl.querySelectorAll("[data-i18n-html]")) {
      if (el.dataset.i18nHtmlOrig === undefined) el.dataset.i18nHtmlOrig = el.innerHTML;
      const s = t(language, el.dataset.i18nHtml);
      el.innerHTML = s || el.dataset.i18nHtmlOrig;
    }
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
    flvPhaseVerify: "正在核对复制出的文件… {pct}%", flvPhasePrepare: "正在转成能剪的格式…",
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
    flvPhaseVerify: "Checking the copy… {pct}%", flvPhasePrepare: "Converting to a format you can edit…",
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
  const officialPaneText={en:{undoLast:'Undo last edit (same as toolbar)',new:'New session',config:'AI service',save:'Save connection',provider:'Provider',model:'Model ID',key:'API key (leave blank to retain)',review:'Review exact outgoing messages',confirm:'Send these messages',cancel:'Cancel',draft:'Message',search:'Search sessions',close:'Collapse assistant',pending:'Request in progress…',failed:'Request failed or cancelled. Your draft is retained.',unconfigured:'No service configured. Nothing was sent.',saved:'Connection saved locally. No request was sent.',local:'Sessions are stored locally for this project. This is a policy, not a save receipt.',temporary:'Session storage could not be read. Drafts stay in this window only; copy what you need before closing.',unsaved:'Session save is not confirmed. Keep this window open and retry.',retry:'Retry save',proposal:'Review suggested edit',reference:'Let the AI see it',range:'Selected range',project:'Project identity',remove:'Remove',limit:'Text or session capacity exceeded; shorten the text or return to an existing session.',scope:'Open or create a project before sending.',configured:'Configured (connection not tested)',configFailed:'Configuration was not saved. Existing settings retained.',configKeyStore:'This computer can\'t store the key safely right now (its built-in password storage isn\'t available), so nothing was saved. Your previous settings are unchanged.',configKeyRequired:'Fill in “{field}” first, then save.',configInvalid:'The model ID can only contain letters, digits and . _ : / - (up to 100 characters). This is often caused by an extra space or a full-width punctuation mark.',configWriteFailed:'The settings file couldn\'t be written, so nothing was saved. Your previous settings are unchanged.',configCopyDetails:'Click “Copy problem details” and send it to us.',cancelUnknown:'The request status is not confirmed. Already sent requests cannot be recalled.',cancelled:'Generation cancelled; any already sent request cannot be recalled.'},
'zh-CN':{undoLast:'撤销上一步（与顶部撤销相同）',new:'新会话',config:'AI 服务',save:'保存连接配置',provider:'服务商',model:'模型 ID',key:'API 密钥（留空保留已有密钥）',review:'核对本次实际发送内容',confirm:'发送以上内容',cancel:'取消',draft:'输入消息',search:'搜索会话',close:'收起助手',pending:'正在请求…',failed:'请求失败或已取消，草稿仍保留。',unconfigured:'尚未配置服务，没有发送。',saved:'连接配置已保存在本机，没有发起请求。',local:'此项目的会话保存在本机。这是保存规则，不代表本次保存已确认。',temporary:'会话文件读取失败，本次草稿只在这个窗口保留。关闭前请复制要留的内容。',unsaved:'会话保存尚未确认。请保留窗口并重试。',retry:'重试保存',proposal:'查看剪辑建议',reference:'让 AI 看',range:'引用所选范围',project:'引用项目身份',remove:'移除',limit:'文字或会话数量已到上限，请删减文字或返回已有会话。',scope:'请先打开或创建项目，再发送。',configured:'已配置（连接尚未验证）',configFailed:'配置未保存，原有设置保留。',configKeyStore:'这台电脑现在没法安全地保存密钥（系统自带的密码保管用不了），所以没有保存，原有设置不变。',configKeyRequired:'请先在「{field}」一栏填好密钥，再保存。',configInvalid:'模型 ID 里只能有英文字母、数字和 . _ : / - 这几个符号，最多 100 个字符。常见原因是多了空格，或者用了中文标点。',configWriteFailed:'设置文件写不进去，所以没有保存，原有设置不变。',configCopyDetails:'请点〔复制问题信息〕发给我们。',cancelUnknown:'请求状态尚未确认，已发给服务的请求无法撤回。',cancelled:'已取消后续生成；已发给服务的请求无法撤回。'}};
  Object.assign(officialPaneText.en,{"notSent":"Chat content contains only the text shown above. No audio, video or screenshots are attached, and no file paths or account details are added automatically. Any such details you included in the text or history will still be sent. Your API key is used to authenticate with the service.","format":"In the chat, say which sentences to keep. It works best to select the captions on the timeline and click \"{reference}\" so whole sentences are quoted. Only whole quoted captions can be applied; half a sentence or a description from memory can't.","formatNext":"After the reply, click \"{proposal}\" below to check whether it can be applied.","formatTech":"For the technically minded: the AI's reply uses this format: {\"type\":\"keep_sentences\",\"ranges\":[{\"clipId\":\"…\",\"sourceCaptionId\":\"…\",\"from\":0,\"to\":1}]}","model":"Model name","project":"Reference current project","currentProject":"Current project","otherProject":"Original project","invalid":"This reply has no suggested edit that can be applied directly.","fees":"Your own AI account is responsible for service charges.","user":"You","assistant":"Assistant","formatTitle":"How to get a suggestion you can apply"});
  Object.assign(officialPaneText['zh-CN'],{"notSent":"聊天内容只包含上面显示的文字。不附加声音、画面和截图，不自动附加文件路径和账号。你写进文字或历史的这类信息仍会发送。API 密钥用于向服务验证身份。","format":"在聊天里说清楚要保留哪几句。最好先在时间线上选中字幕，点「{reference}」，把整句引用进来。只有整句引用的字幕，才能直接套用；只引用半句，或者凭记忆描述的，都套用不了。","formatNext":"收到回复后，点下面的「{proposal}」，看看能不能直接用。","formatTech":"给懂技术的人：AI 的回复要用这个格式：{\"type\":\"keep_sentences\",\"ranges\":[{\"clipId\":\"…\",\"sourceCaptionId\":\"…\",\"from\":0,\"to\":1}]}","model":"模型名称","project":"引用当前项目","currentProject":"当前项目","otherProject":"原项目","invalid":"这条回复里没有能直接套用的剪辑建议。","fees":"费用由你自己的 AI 账号承担。","user":"你","assistant":"助手","formatTitle":"怎样让 AI 给出能直接套用的建议"});
  // the 「AI 数据说明」 shown before the first request to DeepSeek, and the AI-made label (DeepSeek open-platform terms 3.5,
  // 5.5, 8.1). JJ's v3, word for word: europa ~/montclip-labels/jj/2026-11-04-AI数据说明-DeepSeek私下包-v3-JJ.md (sha256
  // 98da6840…, QQ passed). A bold label is its own key; the text after it starts with its separator, as JJ wrote it.
  // From JJ's v4 increment (sha256 e9c59973…) only the review's link and the line when it is off. The panel's own line,
  // 「回复由 AI 生成」, is Deja's (2026-11-04: one line in the panel, no label on each reply); its English is a draft for JJ.
  Object.assign(officialPaneText['zh-CN'],{"aiGenerated":"AI 生成","dataNoticeTitle":"用 AI 之前，先说清楚这几件事","dataNoticeWhatLabel":"发了什么","dataNoticeWhat":"：你在助手里写的话，加上你选中的片段的时间、长度这类数字。字幕（听写出来的文字）和弹幕的原文，只有你点了〔让 AI 看〕才会发。录像、声音和文件本身，从来不发。","dataNoticeWhoLabel":"发给谁","dataNoticeWho":"：直接发给 DeepSeek（深度求索）的官方接口 api.deepseek.com，中间不经过 MontClip 团队或别的服务器；数据存在中国境内。","dataNoticeUseLabel":"DeepSeek 会怎么用","dataNoticeUse":"：DeepSeek 的隐私政策写着，你发过去的内容和 AI 的回复「可能」用于训练模型和改进服务，用之前会加密、去掉能认出你的信息。用这种方式发过去的内容，没有开关能让它不拿去训练，它也没公布会存多久。我们只是照实转述，没法替 DeepSeek 保证什么。","dataNoticeSo":"所以：不想让别人看到的话，别写进助手；不想发的字幕和弹幕，就别点〔让 AI 看〕。","dataNoticeOffLabel":"怎么关","dataNoticeOff":"：在「设置 › AI 助手」里关掉「用 AI 助手」，就一次都不发了。开着的时候，每次发出去之前也都会先给你看要发什么、发到哪个网站，你可以不发。不用 AI，剪辑照常能用。","dataNoticeAiLabel":"标「AI 生成」","dataNoticeAi":"：助手面板顶上写着「回复由 AI 生成」；它给的剪辑计划，单独标「AI 生成」。","dataNoticeBasis":"依据：DeepSeek 隐私政策（2026 年 2 月 10 日版）、DeepSeek 开放平台服务条款（2026 年 4 月 29 日生效）。它们改了，这页也会跟着改。","dataNoticeOk":"我知道了","noticeLink":"数据说明","aiRepliesLine":"回复由 AI 生成","aiOff":"AI 助手关着，什么都不会发出去。要用的话，到「设置 › AI 助手」里打开。"});
  Object.assign(officialPaneText.en,{"aiGenerated":"AI-generated","dataNoticeTitle":"Before you use the AI, a few things to know","dataNoticeWhatLabel":"What is sent","dataNoticeWhat":": what you write to the assistant, plus numbers about the clips you selected, such as their times and lengths. Caption text (from transcription) and live-comment text are sent only when you click [Let the AI see it]. Your video, audio and files themselves are never sent.","dataNoticeWhoLabel":"Who gets it","dataNoticeWho":": DeepSeek's official API (api.deepseek.com), directly. Nothing passes through the MontClip team or any other server. The data is stored in mainland China.","dataNoticeUseLabel":"What DeepSeek does with it","dataNoticeUse":": DeepSeek's privacy policy says what you send and what the AI replies \"may\" be used to train its models and improve its service, after being encrypted and stripped of anything that identifies you. For data sent this way there is no switch to keep it out of training, and DeepSeek hasn't said how long it is kept. We're only passing on what the policy says; we can't promise anything on DeepSeek's behalf.","dataNoticeSo":"So: don't write anything to the assistant that you wouldn't want others to see, and don't click [Let the AI see it] for captions or live comments you'd rather not send.","dataNoticeOffLabel":"How to turn it off","dataNoticeOff":": turn off \"Use the AI assistant\" in Settings › AI assistant and nothing is ever sent. While it's on, you're shown what will be sent and to which site before every send, and you can choose not to send. Editing works as usual without the AI.","dataNoticeAiLabel":"Marked \"AI-generated\"","dataNoticeAi":": The assistant panel says \"Replies are AI-generated\" at the top; editing plans it gives are marked \"AI-generated\" on their own.","dataNoticeBasis":"Based on: DeepSeek Privacy Policy (version of 10 Feb 2026) and DeepSeek Open Platform Terms of Service (effective 29 Apr 2026). If they change, this page will change too.","dataNoticeOk":"Got it","noticeLink":"Data notice","aiRepliesLine":"Replies are AI-generated","aiOff":"The AI assistant is off, so nothing is sent. To use it, turn it on in Settings › AI assistant."});
  Object.assign(officialPaneText['zh-CN'],{removeConnection:'删除这个连接',removeConfirm:'删除后，这台电脑上保存的密钥会被清掉，AI 助手要重新设置才能用。剪辑不受影响，聊天记录也还在。',connectionRemoved:'连接已删除，这台电脑上保存的密钥已清掉。AI 助手要重新设置才能用。',connectionRemoveFailed:'连接没能删除，密钥可能还在这台电脑上。请看看软件的设置文件夹是不是被占用或不能写入，然后再试。'});
  Object.assign(officialPaneText["zh-CN"],{"seedConflict": "这里的 AI 服务设置和包里带的不一样，先暂停使用 AI。要改用包里的设置：点「删除这个连接」，再关掉 MontClip 重新打开。"});
  Object.assign(officialPaneText["en"],{"seedConflict": "These AI service settings don't match the ones in the package, so the AI is paused. To use the package's settings: click “Remove this connection”, then close MontClip and open it again."});
  Object.assign(officialPaneText.en,{removeConnection:'Remove this connection',removeConfirm:'This clears the key saved on this computer. You will need to set up the AI service again to use the assistant. Editing is not affected, and your chat history stays.',connectionRemoved:'Connection removed. The key saved on this computer is cleared; set up the AI service again to use the assistant.',connectionRemoveFailed:'The connection could not be removed, so the key may still be on this computer. Check that the app\'s settings folder is not in use or read-only, then try again.'});
  Object.assign(officialPaneText['zh-CN'],{recommended:'（推荐）',retention:'服务商可能会保存你发送的文字。',noCaptionSelected:'先在时间线上选中字幕。'});
  Object.assign(officialPaneText.en,{recommended:' (recommended)',retention:'The provider may keep the text you send.',noCaptionSelected:'Select captions on the timeline first.'});
  Object.assign(officialPaneText.en,{resetConnection:'Set up connection again',configUnreadable:'The saved connection could not be read. Click "Set up connection again"; the app backs up the old settings first, then lets you enter new ones.',configBackedUp:'The old connection settings have been backed up. Enter your connection settings again.',configBackupFailed:'The old connection settings could not be backed up. They have not been replaced. Check whether the settings folder for the app is in use or cannot be written to, then try again.'});
  Object.assign(officialPaneText['zh-CN'],{resetConnection:'重新设置连接',configUnreadable:'原来的连接配置读不出来。点「重新设置连接」，软件会先把旧配置备份好，再让你重新填写。',configBackedUp:'原来的配置已备份，现在需要重新填写连接配置。',configBackupFailed:'原来的配置没能备份，未被替换。请看看软件的设置文件夹是不是被占用或不能写入，然后再试。'});
  Object.assign(officialPaneText.en,{notSent:'Only the text shown above is sent. No audio, video or screenshots are attached; the app does not add file paths or account details by itself, but any such details you typed into the text or history will be sent as written. Your API key is used only to authenticate with the service.',undoLast:'Undo this apply (same as toolbar Undo)',captionLabel:'Subtitles',rangeLabel:'Range',projectLabel:'Project'});
  Object.assign(officialPaneText['zh-CN'],{notSent:'这次发送的只有上面显示的文字。不附带声音、画面和截图；软件不会自动加上文件路径和账号，但你自己写进文字或历史里的这类信息会照样发出。API 密钥只用来向服务验证身份。',undoLast:'撤销这次应用（和顶部撤销相同）',captionLabel:'字幕',rangeLabel:'范围',projectLabel:'项目'});
  Object.assign(officialPaneText.en,{reviewSummary:'This will send a fixed formatting note, your message, {captions} quoted subtitles, and {history} earlier messages (including their quotes).',rawRequest:'View exact request',proposalSummary:'Suggested edit: keep {count} sentences, about {duration} in the final cut. Look it over before applying.',proposalRanges:'Suggested edit: keep {count} ranges joined into one video, about {duration}. Look it over before applying.',proposalSlices:'Suggested edit: {count} separate clips, one file each, about {duration} in total. Look it over before applying.',factsOmittedOne:"Timing for 1 clip wasn't included, so the AI won't see where it is. Sending still works.",factsOmitted:"Timing for {n} clips wasn't included, so the AI won't see where they are. Sending still works.",factsTitle:'Timeline numbers are also sent · click to see them',factsExplain:'How long each recording is, which part each clip uses, and the start, end and score of the highlight candidates already found. No file names, subtitle text, pictures or sound. This is exactly what is sent:',goConfig:'Go to settings',staleProposal:'The project changed after this reply, so this suggested edit can no longer be used.',reask:'Ask again using the current project',reaskReady:'A new draft is ready with no history or references. Select current subtitles and review before sending. The original conversation is still in the session list.'});
  Object.assign(officialPaneText['zh-CN'],{reviewSummary:'这次会发送一段固定的格式说明、消息文字、引用的 {captions} 条字幕，以及之前的 {history} 条消息（包含其中的引用）。',rawRequest:'查看原始请求',proposalSummary:'已生成剪辑建议：保留 {count} 句，成片大约 {duration}。请先看一遍再应用。',proposalRanges:'已生成剪辑建议：保留 {count} 段，拼成一条，大约 {duration}。请先看一遍再应用。',proposalSlices:'已生成剪辑建议：切出 {count} 条切片，每条一个文件，一共大约 {duration}。请先看一遍再应用。',factsOmittedOne:'有 1 个片段这次没附上时间信息，AI 看不到它在哪。不影响发送。',factsOmitted:'有 {n} 个片段这次没附上时间信息，AI 看不到它们在哪。不影响发送。',factsTitle:'还会附上时间线的数字 · 点开看原文',factsExplain:'每段录像有多长、每个片段用到哪一部分，以及已经找到的高光候选的起止和分数。不含文件名、字幕文字、画面和声音。下面就是原样发出去的内容：',goConfig:'去设置',staleProposal:'项目在回复之后改过了，这条剪辑建议不能用了。',reask:'按现在的项目重新问',reaskReady:'已新建草稿，不带历史和引用。请重新选择当前字幕，确认后再发送。原来的对话还在会话列表里。'});
  // JJ via Deja (2026-11-05): when the facts carry the singing parts and the loudness, the review box says so, outside the
  // fold (JJ's words; JJ定稿 2026-11-05: 「音量大小（每秒或每隔几秒一个数）」, since a long video gets one every few seconds). factsLimit: over capabilities.js FACTS nothing is sent (JJ定稿, 2026-11-05).
  Object.assign(officialPaneText.en,{factsSound:'Also sent: which parts may be singing (start and end seconds only) and the loudness (one number every second or every few seconds) (a list of numbers). The sound itself is not sent.',factsLimit:'There are too many numbers to attach, more than can be sent, so nothing was sent. What you wrote is still here. Select a shorter range and send again.'});
  Object.assign(officialPaneText['zh-CN'],{factsSound:'还会发送：哪几段可能在唱歌（只有开始和结束的秒数）、音量大小（每秒或每隔几秒一个数）（一串数字）。不发声音本身。',factsLimit:'要附上的数字太多，超过了能发的上限，这次没有发送。你写的话还在，选短一点的范围再发就行。'});
  // QQ's five on #169 (Deja, 2026-11-05), JJ定稿 (2026-11-05): the review box lists the sound numbers in plain words; when they are
  // switched off, it says so; a reply to a message about the sound says, while they are off, that it can't be done and how
  // to turn them on ({settings} and {switch}: the button's and the switch's own words, filled in by app.js).
  Object.assign(officialPaneText.en,{factsCounts:'This time: {parts} possible singing parts, {duration} in total; {values} loudness numbers, one every {step} s.',factsLong:'The video is longer than 8 hours, so singing parts and loudness are not attached this time.',factsOff:'Singing parts and loudness are not attached: they are switched off in Settings.'});
  Object.assign(officialPaneText['zh-CN'],{factsCounts:'这次附上：可能在唱歌的段落 {parts} 段，共 {duration}；音量数字 {values} 个，每 {step} 秒一个。',factsLong:'片子超过 8 小时，这次没有附上唱歌段和音量。',factsOff:'这次没有附上唱歌段和音量：设置里关着。'});
  // VV real-model test (2026-11-02): the format note that goes with every request, a reply without a usable proposal, and errors told apart
  Object.assign(officialPaneText.en,{errModel:'The model name is wrong. Check it in settings. Your draft is kept.',formatNote:'Format note sent with every request',formatNoteExplain:'The text below is a fixed note MontClip adds to every request. It only tells the AI how to format editing suggestions. It contains none of your recordings, subtitles or project content.',noProposal:'This reply is not an editing suggestion. To have it cut for you, say which sentences to keep.',errAuth:'The key is wrong or has no access. Check it in settings. Your draft is kept.',errRateLimit:'The service is limiting requests for now. Try again in a little while. Your draft is kept.',errTimeout:'The service did not answer in time. Check your connection and try again. Your draft is kept.',errNetwork:'Could not reach the service. Check your internet connection, then try again. Your draft is kept.',errUpstream:'The service is having trouble right now. Try again later, or choose another model in settings. Your draft is kept.'});
  Object.assign(officialPaneText['zh-CN'],{errModel:'模型名称不对，请去设置里检查。草稿仍保留。',formatNote:'每次请求都会附带的格式说明',formatNoteExplain:'下面这段英文是 MontClip 每次自动附上的固定说明，只是告诉 AI 怎么写剪辑建议。里面没有你的录像、字幕或项目内容，你不用看懂。',noProposal:'这条回复不是剪辑建议。想让它直接剪，可以说清要保留哪几句。',errAuth:'密钥不对或没有权限，请去设置里检查。草稿仍保留。',errRateLimit:'服务暂时限流，请过一会再试。草稿仍保留。',errTimeout:'服务没有及时回应，请检查网络后再试。草稿仍保留。',errNetwork:'连不上服务，请检查网络连接后再试。草稿仍保留。',errUpstream:'服务那边暂时出了问题，请稍后再试，或去设置里换一个模型。草稿仍保留。'});
  Object.assign(officialPaneText.en,{more:'More',projectNotReady:'This project is not saved yet, so nothing was sent. Your edits are still here. Click Save project and try again.',saveProject:'Save project'});
  Object.assign(officialPaneText['zh-CN'],{more:'更多',projectNotReady:'这个项目还没保存好，所以没有发送。你的剪辑都还在。请点「保存项目」后再试。',saveProject:'保存项目'});
  // P4: the mode switch at the top of the assistant (the AI cannot change it). New copy, for JJ.
  Object.assign(officialPaneText.en,{modes:'How the AI works',modePlan:'Plan',modeManual:'Manual',modeAuto:'Auto',modeYolo:'Yolo',
   modePlanTip:'Only plans; changes nothing.',modeManualTip:'Asks before changing the project; asks every time for anything that can\'t be undone. This is the default.',modeAutoTip:'Does what can be undone; asks before what can\'t.',modeYoloTip:'Does every step without asking you; anything sent out is still shown to you first. You\'ll be asked once more before it turns on.',
   yoloOn:'Yolo is on: the AI does every step without asking you; anything sent out is still shown to you first.',planTitle:'Plan',planSummary_one:'Made a plan of {count} step. See the list below.',planSummary_other:'Made a plan of {count} steps. See the list below.',planInvalid:'This reply looks like a plan but can\'t be used. Nothing was done.',planRemove:'Delete',planStart:'Start',planDiscard:'Drop this plan',formatPlan:'To have the AI do several steps at once, ask it to make a plan first: it lists every step; you look them over, delete the ones you don\'t want, then click "Start". Each step still follows the mode you chose.',formatPlanTech:'Below is the format note for the AI; you don\'t need to read it.',planUndo:'Undo the whole plan',modeDeclined:'Yolo was not turned on.',modeUnavailable:'The mode didn\'t change; it\'s still the one it was. Close MontClip, open it again and try once more.'});
  Object.assign(officialPaneText['zh-CN'],{modes:'AI 怎么做',modePlan:'计划',modeManual:'手动',modeAuto:'自动',modeYolo:'Yolo',
   modePlanTip:'只出计划，不改项目。',modeManualTip:'改项目前先问你；撤不回的每次都问。默认是这个。',modeAutoTip:'能撤销的直接做，撤不回的先问你。',modeYoloTip:'每一步都直接做，不问你；往外发的内容照样先给你看。打开前会再确认一次。',
   yoloOn:'Yolo 开着：AI 每一步都直接做，不问你；往外发的内容照样先给你看。',planTitle:'计划',planSummary:'已排好计划，共 {count} 步，见下面的清单。',planInvalid:'这条回复像是计划，但用不了，什么都没做。',planRemove:'删掉',planStart:'开始',planDiscard:'不要这个计划',formatPlan:'想让 AI 一次做好几步，可以让它先排一个计划：它会列出每一步，你看一遍、删掉不要的，再点「开始」。每一步怎么做，还是看你选的模式。',formatPlanTech:'以下是给 AI 的格式说明，不用看。',planUndo:'撤销整个计划',modeDeclined:'没有打开 Yolo。',modeUnavailable:'这次没换成，模式还是原来那个。关掉 MontClip 再打开，再试一次。'});
  for(const language of ['en','zh-CN']) for(const [key,value] of Object.entries(officialPaneText[language])) text[language]['officialPane_'+key]=value;
  // JJ (2026-11-05): 「没填密钥」 names the key field by its own label, read from the same text, never a second copy.
  for(const language of ['en','zh-CN']) text[language].officialPane_configKeyRequired=officialPaneText[language].configKeyRequired.split('{field}').join(officialPaneText[language].key);
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
      T.officialPane_formatNext.split("{proposal}").join(T.officialPane_proposal) +
      // P4 (JJ, 5d360cd7): plans, in plain words; their JSON is in the small print
      (T.officialPane_formatPlan ? (language === "en" ? " " : "") + T.officialPane_formatPlan : "");
  }
  function create(storage) {
    let saved; try { saved = JSON.parse(storage.getItem(KEY)); } catch {}
    // soundFacts (QQ on #169): 「附上唱歌段和音量」, on by default; kept only when switched off
    let value = { mode: saved?.mode === "advanced" ? "advanced" : "simple", language: saved?.language === "en" ? "en" : "zh-CN", ...(saved?.soundFacts === false ? { soundFacts: false } : {}) };
    return {
      get: () => ({ ...value }),
      set(patch) {
        const next = { ...value, ...patch };
        if (!["simple", "advanced"].includes(next.mode) || !text[next.language] || ![undefined, true, false].includes(next.soundFacts)) throw new Error("Invalid view preference");
        value = { mode: next.mode, language: next.language, ...(next.soundFacts === false ? { soundFacts: false } : {}) };
        try { storage.setItem(KEY, JSON.stringify(value)); return true; } catch { return false; }
      },
    };
  }
  function desktopStorage(bridge) {
    return { getItem() { const r=bridge.get(); if(!r?.ok) throw Error('View settings unavailable'); return JSON.stringify(r.value); },
      setItem(_key, raw) { if(!bridge.set(JSON.parse(raw))?.ok) throw Error('View settings not saved'); } };
  }
  /** Simple mode holds back these advanced shortcuts (Deja, replacing #6): Alt+T, Shift+E / Shift+D, Ctrl/Cmd+L,
   *  [ and ], B / R / Y / U, Alt+Z, T / Shift+T, Shift+Delete (and Shift+Backspace, the same key on a Mac). */
  function advancedShortcut(e) {
    const k = String(e.key || ""), low = k.toLowerCase(), cm = !!(e.ctrlKey || e.metaKey), alt = !!e.altKey, shift = !!e.shiftKey;
    if (k === "[" || k === "]") return true;
    if (alt && !cm && low === "t") return true;
    if (alt && !cm && e.code === "KeyZ") return true;
    if (cm && !alt && !shift && low === "l") return true;
    if (cm || alt) return false;
    if (shift && (low === "e" || low === "d")) return true;
    if (!shift && ["b", "r", "y", "u"].includes(low)) return true;
    if (low === "t") return true;
    if (shift && (k === "Delete" || k === "Backspace")) return true;
    return false;
  }
  /** A written shortcut ("⇧T", "Shift+E", "Ctrl/Cmd+L", "⇧Del", "B") that simple mode holds back (Deja, #55). Anything
   *  that doesn't read as one key with modifiers ("M add", "select both") is not a shortcut. */
  function blockedHint(hint) {
    let s = String(hint || "").trim(), shift = false, alt = false, ctrl = false;
    const sym = (c) => (c === "⇧" ? (shift = true) : c === "⌥" ? (alt = true) : c === "⌘" ? (ctrl = true) : false);
    const parts = s.split("+");
    let key = parts.pop();
    for (const p of parts) {
      if (/^(shift|⇧)$/i.test(p)) shift = true; else if (/^(alt|option|⌥)$/i.test(p)) alt = true;
      else if (/^(ctrl|cmd|ctrl\/cmd|cmd\/ctrl|control|command|⌘)$/i.test(p)) ctrl = true; else return false;
    }
    while (key.length > 1 && sym(key[0])) key = key.slice(1);
    if (key === "Del") key = "Delete";
    if (!(key.length === 1 || /^(Delete|Backspace)$/.test(key))) return false;
    const letter = /^[a-z]$/i.test(key);
    return advancedShortcut({ key: letter ? (shift ? key.toUpperCase() : key.toLowerCase()) : key, code: letter ? "Key" + key.toUpperCase() : "",
      shiftKey: shift, altKey: alt, ctrlKey: ctrl, metaKey: false });
  }
  /** A tooltip without the shortcuts simple mode holds back: "(⇧T)" goes, "(select both, Ctrl/Cmd+L)" keeps its words. */
  function stripBlockedHints(title) {
    return String(title).replace(/\s*([（(])([^()（）]*)([)）])/g, (whole, open, inner, close) => {
      const parts = inner.split(/\s*[,，·]\s*/), kept = parts.filter((p) => !blockedHint(p));
      if (kept.length === parts.length) return whole;
      if (!kept.length) return "";
      const sep = inner.includes("·") ? " · " : inner.includes("，") ? "，" : ", ";
      return whole.slice(0, whole.indexOf(open)) + open + kept.join(sep) + close;
    });
  }
  /** A new project's name (Deja, 第四批): 未命名项目, Untitled project in English (JJ, 插件试用 P7: lower-case p). Chinese first
   *  when the language is unknown. "Untitled Project", what older English projects were called, is a default name too. */
  const defaultProjectName = (language) => (language === "en" ? "Untitled project" : "未命名项目");
  const isDefaultProjectName = (name) => name === "未命名项目" || name === "Untitled project" || name === "Untitled Project";
  /** A project's name as the page shows it (P7): a stored default reads as the default of the interface language; the
   *  project keeps what it has. Any other name is the user's, shown as it is. */
  const projectName = (language, name) => (isDefaultProjectName(name) ? defaultProjectName(language) : name);
  /** The name an export takes (P7, Deja): the project's own name; never a default one — then the first media's name
   *  (without its extension), else MontClip, followed by the date (月-日, as 直播切片 {月-日}). */
  const exportProjectName = (name, mediaNames = [], date = new Date()) => {
    if (typeof name === "string" && name.trim() && !isDefaultProjectName(name)) return name;
    const first = (mediaNames || []).find((n) => typeof n === "string" && n.trim());
    const stem = first ? first.trim().replace(/\.[A-Za-z0-9]{1,10}$/, "").trim() : "";
    return (stem || "MontClip") + " " + String(date.getMonth() + 1).padStart(2, "0") + "-" + String(date.getDate()).padStart(2, "0");
  };
  /** A stored name as the page shows it (Deja, 2026-11-05): exactly the default "Main" (a sequence) or "Title" (a new
   *  title) reads as the existing term in Chinese; any other name is the user's and is shown as it is. Only for display —
   *  the project keeps "Main" / "Title". */
  const DEFAULT_NAMES = { Main: "term.main", Title: "term.title" };
  const defaultName = (language, name) => (typeof name === "string" && Object.hasOwn(DEFAULT_NAMES, name) ? t(language, DEFAULT_NAMES[name]) || name : name);
  /** An encoder in the export dialog: its plain Chinese name above when there is one; delivery.js's label otherwise and in English. */
  const encoderLabel = (language, id, label) => (lang(language) === "zh-CN" && ENCODER_NAMES["zh-CN"][id]) || label;
  /** The file name used when a project's name leaves nothing usable (all slashes): 直播切片 {月-日} in Chinese, the old
   *  English word (export, captions…) in English. */
  const exportFallback = (language, english, date = new Date()) => (language === "en" ? english
    : "直播切片 " + String(date.getMonth() + 1).padStart(2, "0") + "-" + String(date.getDate()).padStart(2, "0"));
  return { create, desktopStorage, text, formatBody, KEY, t, tp, ago, when, applyI18n, durationText, flvImportMessage, h264Message, h264Encoder, encoderLabel, defaultProjectName, isDefaultProjectName, projectName, exportProjectName, defaultName, exportFallback, advancedShortcut, blockedHint, stripBlockedHints };
});
