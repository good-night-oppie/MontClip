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
  // MontClip's own wording for keyed strings the terms SPEC does not cover.
  const own = {
    "needs-server": ["Needs the MontClip server", "需要 MontClip 服务"],
    "add-title": ["+ Title", "+ 标题"],
    "add-adjust": ["+ Adjust", "+ 调节层"],
    "add-adjust-title": ["Add an adjustment layer (grades everything below it)", "添加调节层（调节它下面的所有画面）"],
    "add-import": ["+ Import", "+ 导入"],
    "add-url": ["+ URL", "+ 网址"],
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
    // batch 2: the Transcript panel and the top bar status (JJ to review). Chinese transcripts
    // carry sentence times only, so the Chinese never counts or cuts words.
    "transcribe": ["Transcribe", "听写"],
    "transcribe-selected": ["Transcribe selected ({n})", "听写所选（{n}）"],
    "transcribe-file": ["Transcribe {n} file", "听写 {n} 个文件"],
    "transcribe-files": ["Transcribe {n} files", "听写 {n} 个文件"],
    "found": ["{n} found", "找到 {n} 处"],
    "cut-all": ["Cut all", "全部剪切"],
    "cut-n": ["Cut {n}", "剪切 {n} 处"],
    "copy": ["Copy", "复制"],
    "select-sentences": ["Select sentences", "按句选段"],
    "mapping": ["Mapping", "时间映射"],
    "caption-last": ["Caption last: a cut through a caption doesn't re-time its words, so add captions again after changing the edit.", "字幕最后再加：剪辑穿过字幕时，字幕的时间不会跟着重排，改完剪辑后请重新添加字幕。"],
    "tr-empty": ["Import an SRT subtitle file and the transcript will show here. Chinese transcription on this computer is still in progress.", "先导入 SRT 字幕，这里会显示文稿。本机中文听写还在做。"],
    "tr-missing": ["No transcript yet: {names}", "还没有文稿：{names}"],
    "tr-more": [" +{n} more", " 等 {n} 个"],
    "loading": ["Loading…", "加载中…"],
    "tr-no-words": ["No words in these clips.", "这些片段里没有听写出文字。"],
    "tr-module-missing": ["Transcript module missing — reload the editor.", "文稿模块缺失，请重新加载编辑器。"],
    "tr-downloading-model": ["Downloading the speech model (once)… {pct}%", "正在下载语音模型（只需一次）… {pct}%"],
    "tr-transcribing": ["Transcribing {name}… {pct}%", "正在听写 {name}… {pct}%"],
    "tr-transcribing-of": ["Transcribing {name} ({i} of {n})… {pct}%", "正在听写 {name}（第 {i} 个，共 {n} 个）… {pct}%"],
    "tr-selection": ["{n} words · {s} s · “{text}”", "已选 {s} 秒 · “{text}”"],
    "tr-selection-one": ["1 word · {s} s · “{text}”", "已选 {s} 秒 · “{text}”"],
    "connected": ["local service running", "本机服务正常"],
    "local-session": ["local session only", "仅本地会话"],
  };
  for (const [k, [en, zh]] of Object.entries((terms && terms.rows) || {})) { text.en["term." + k] = en; text["zh-CN"]["term." + k] = zh; }
  for (const [k, [en, zh]] of Object.entries(own)) { text.en["own." + k] = en; text["zh-CN"]["own." + k] = zh; }
  /** Keyed lookup: the language's string, else the English one, else "" (never the key). */
  function t(language, key, vars) {
    const s = (text[language] && text[language][key]) ?? text.en[key] ?? "";
    return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : s;
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
  });
  Object.assign(text.en, {
    flvTimingUnverified: "This FLV was not imported: MontClip could not confirm its timing is complete. Try a fully recorded file, or convert it to MP4 first.",
    flvNeedsDesktop: "Importing FLV needs the MontClip desktop app.",
    flvDiskFull: "There is not enough space on this computer, so the file was not imported. Free up some space and try again.",
    flvNeedsConvert: "This FLV was not imported: MontClip cannot use its encoding directly yet. Convert it to MP4 first.",
    flvUploadFailed: "This FLV was not imported: something went wrong while MontClip was handling it. Try again; if it still fails, convert it to MP4 first.",
    flvComponentMissing: "MontClip is missing the component that handles FLV, so the file was not imported. Reinstall MontClip.",
  });
  // A readable-range or timestamp problem is "timing unverified": the consent screens are deferred, so
  // nothing here asks for permission the user has nowhere to give. Unknown codes read as a failed import.
  const FLV_REASONS = { FLV_TIMELINE_GAP: "flvTimingUnverified", FLV_READABLE_CONSENT_REQUIRED: "flvTimingUnverified",
    FLV_DISK_FULL: "flvDiskFull", NO_SERVER: "flvNeedsDesktop", FLV_TRANSCODE_REQUIRED: "flvNeedsConvert",
    FLV_STREAMS_UNSUPPORTED: "flvNeedsConvert", FLV_COMPONENT_MISSING: "flvComponentMissing" };
  function flvImportMessage(language, code) {
    const t = text[language] || text.en;
    return t[Object.hasOwn(FLV_REASONS, code) ? FLV_REASONS[code] : "flvUploadFailed"];
  }
  Object.assign(text['zh-CN'],{paneLocalTemporary:'没能读取已存的会话。本次会话和草稿只在这次打开期间保留，关闭前请复制要留的内容。原有会话文件未改动。',paneLocalPolicy:'本机保存适用于已有项目 ID 的会话、草稿和明确引用；尚无项目 ID 的内容仅在本次窗口保留。这是保存范围说明，不表示本次内容已保存。不会自动发送。',paneSessionFailed:'会话保存尚未确认，当前编辑仍在此窗口。请保留草稿后重试；不会覆盖另一份更新的记录。',paneRetry:'重试保存会话',paneUser:'你',paneAssistant:'助手'});
  Object.assign(text.en,{paneLocalTemporary:'Saved sessions could not be read. Sessions and drafts from this window will not be saved; copy anything you want to keep before closing. The existing session file was not changed.',paneLocalPolicy:'Local storage applies to sessions, drafts and explicit references with a project ID; content without a project ID lasts only in this window. This describes storage scope, not confirmation that the current content was saved. Nothing is sent automatically.',paneSessionFailed:'Session saving is unconfirmed. Edits remain in this window. Keep your draft and retry; a newer stored snapshot will not be overwritten.',paneRetry:'Retry saving sessions',paneUser:'You',paneAssistant:'Assistant'});

  // Official-source port strings share the workbench locale and stable namespace.
  const officialPaneText={en:{undoLast:'Undo last edit (same as toolbar)',new:'New session',config:'AI service',save:'Save connection',provider:'Provider',model:'Model ID',key:'API key (leave blank to retain)',review:'Review exact outgoing messages',confirm:'Send these messages',cancel:'Cancel',draft:'Message',search:'Search sessions',close:'Collapse assistant',pending:'Request in progress…',failed:'Request failed or cancelled. Your draft is retained.',unconfigured:'No service configured. Nothing was sent.',saved:'Connection saved locally. No request was sent.',local:'Sessions are stored locally for this project. This is a policy, not a save receipt.',temporary:'Session storage could not be read. Drafts stay in this window only; copy what you need before closing.',unsaved:'Session save is not confirmed. Keep this window open and retry.',retry:'Retry save',proposal:'Review editing proposal',invalid:'No valid sentence proposal in this reply.',reference:'Selected subtitles',range:'Selected range',project:'Project identity',remove:'Remove',limit:'Text or session capacity exceeded; shorten the text or return to an existing session.',scope:'Open or create a project before sending.',configured:'Configured (connection not tested)',configFailed:'Configuration was not saved. Existing settings retained.',format:'For an editing proposal, request JSON: {"type":"keep_sentences","ranges":[{"clipId":"…","sourceCaptionId":"…","from":0,"to":1}]}. Only explicitly quoted whole subtitles are accepted.',cancelUnknown:'The request status is not confirmed. Already sent requests cannot be recalled.',cancelled:'Generation cancelled; any already sent request cannot be recalled.'},
'zh-CN':{undoLast:'撤销上一步（与顶部撤销相同）',new:'新会话',config:'AI 服务',save:'保存连接配置',provider:'服务商',model:'模型 ID',key:'API 密钥（留空保留已有密钥）',review:'核对本次实际发送内容',confirm:'发送以上内容',cancel:'取消',draft:'输入消息',search:'搜索会话',close:'收起助手',pending:'正在请求…',failed:'请求失败或已取消，草稿仍保留。',unconfigured:'尚未配置服务，没有发送。',saved:'连接配置已保存在本机，没有发起请求。',local:'此项目的会话保存在本机。这是保存规则，不代表本次保存已确认。',temporary:'会话文件读取失败，本次草稿只在这个窗口保留。关闭前请复制要留的内容。',unsaved:'会话保存尚未确认。请保留窗口并重试。',retry:'重试保存',proposal:'查看剪辑提案',invalid:'回复中没有可接受的句级提案。',reference:'引用选中字幕',range:'引用所选范围',project:'引用项目身份',remove:'移除',limit:'文字或会话数量已到上限，请删减文字或返回已有会话。',scope:'请先打开或创建项目，再发送。',configured:'已配置（连接尚未验证）',configFailed:'配置未保存，原有设置保留。',format:'剪辑提案可要求返回 JSON：{"type":"keep_sentences","ranges":[{"clipId":"…","sourceCaptionId":"…","from":0,"to":1}]}。只接受明确引用的完整字幕句段。',cancelUnknown:'请求状态尚未确认，已发给服务的请求无法撤回。',cancelled:'已取消后续生成；已发给服务的请求无法撤回。'}};
  Object.assign(officialPaneText.en,{"notSent":"Chat content contains only the text shown above. No audio, video or screenshots are attached, and no file paths or account details are added automatically. Any such details you included in the text or history will still be sent. Your API key is used to authenticate with the service.","format":"For an editing suggestion you can apply, say which subtitle sentences you want to keep. After a reply, use “Review editing proposal” below to check whether it can be applied.","model":"Model name","project":"Reference current project","currentProject":"Current project","otherProject":"Original project","invalid":"This reply has no editing suggestion that can be applied directly.","fees":"Your own AI account is responsible for service charges.","user":"You","assistant":"Assistant","formatTitle":"How to request an editing suggestion"});
  Object.assign(officialPaneText['zh-CN'],{"notSent":"聊天内容只包含上面显示的文字。不附加声音、画面和截图，不自动附加文件路径和账号。你写进文字或历史的这类信息仍会发送。API 密钥用于向服务验证身份。","format":"想要能直接套用的剪辑建议，就在聊天里说清要保留哪几句；收到回复后，可点下面的「查看剪辑提案」检查是否能直接使用。","model":"模型名称","project":"引用当前项目","currentProject":"当前项目","otherProject":"原项目","invalid":"这条回复里没有可以直接用的剪辑建议。","fees":"费用由你自己的 AI 账号承担。","user":"你","assistant":"助手","formatTitle":"如何提出剪辑建议"});
  Object.assign(officialPaneText.en,{resetConnection:'Set up connection again',configUnreadable:'The saved connection could not be read. Click "Set up connection again"; the app backs up the old settings first, then lets you enter new ones.',configBackedUp:'The old connection settings have been backed up. Enter your connection settings again.',configBackupFailed:'The old connection settings could not be backed up. They have not been replaced. Check whether the settings folder for the app is in use or cannot be written to, then try again.'});
  Object.assign(officialPaneText['zh-CN'],{resetConnection:'重新设置连接',configUnreadable:'原来的连接配置读不出来。点「重新设置连接」，软件会先把旧配置备份好，再让你重新填写。',configBackedUp:'原来的配置已备份，现在需要重新填写连接配置。',configBackupFailed:'原来的配置没能备份，未被替换。请看看软件的设置文件夹是不是被占用或不能写入，然后再试。'});
  Object.assign(officialPaneText.en,{notSent:'Only the text shown above is sent. No audio, video or screenshots are attached; the app does not add file paths or account details by itself, but any such details you typed into the text or history will be sent as written. Your API key is used only to authenticate with the service.',undoLast:'Undo this apply (same as toolbar Undo)',captionLabel:'Subtitles',rangeLabel:'Range',projectLabel:'Project'});
  Object.assign(officialPaneText['zh-CN'],{notSent:'这次发送的只有上面显示的文字。不附带声音、画面和截图；软件不会自动加上文件路径和账号，但你自己写进文字或历史里的这类信息会照样发出。API 密钥只用来向服务验证身份。',undoLast:'撤销这次应用（和顶部撤销相同）',captionLabel:'字幕',rangeLabel:'范围',projectLabel:'项目'});
  Object.assign(officialPaneText.en,{reviewSummary:'This will send a fixed formatting note, your message, {captions} quoted subtitles, and {history} earlier messages (including their quotes).',rawRequest:'View exact request',proposalSummary:'Proposal: keep {count} sentences, about {duration} in the final cut. Review before applying.',goConfig:'Go to settings',staleProposal:'The project changed after this reply. This proposal can no longer be applied.',reask:'Ask again using the current project',reaskReady:'A new draft is ready with no history or references. Select current subtitles and review before sending. The original conversation is still in the session list.'});
  Object.assign(officialPaneText['zh-CN'],{reviewSummary:'这次会发送一段固定的格式说明、消息文字、引用的 {captions} 条字幕，以及之前的 {history} 条消息（包含其中的引用）。',rawRequest:'查看原始请求',proposalSummary:'已生成提案：保留 {count} 句，成片约 {duration}。请先查看再应用。',goConfig:'去设置',staleProposal:'项目在回复之后改过了，这个提案不能用了。',reask:'按现在的项目重新问',reaskReady:'已新建草稿，不带历史和引用。请重新选择当前字幕，确认后再发送。原来的对话还在会话列表里。'});
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
  return { create, desktopStorage, text, KEY, t, applyI18n, flvImportMessage };
});
