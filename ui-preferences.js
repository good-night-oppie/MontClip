/* View preferences only: no project, history, media or network ownership. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.MontClipView = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const KEY = "montclip-view-v1";
  const text = {
    "zh-CN": { simple: "简单", advanced: "高级", language: "界面语言", undo: "撤销", redo: "重做", assistant: "助手", close: "收起", unavailable: "尚未连接 AI 服务。手动剪辑不受影响。", pending: "AI 服务接入尚未完成，当前不会发送任何内容。", mode: "编辑模式" },
    en: { simple: "Simple", advanced: "Advanced", language: "Interface language", undo: "Undo", redo: "Redo", assistant: "Assistant", close: "Hide", unavailable: "No AI service connected. Manual editing is available.", pending: "AI service integration is not ready. Nothing is sent.", mode: "Editing mode" },
  };
  Object.assign(text['zh-CN'],{paneLocalTemporary:'没能读取已存的会话。本次会话和草稿只在这次打开期间保留，关闭前请复制要留的内容。原有会话文件未改动。',paneLocalSaved:'有项目身份的会话、草稿和明确引用保存在本机；未命名目标仅本次窗口保留。不会自动发送。',paneSessionFailed:'会话保存尚未确认，当前编辑仍在此窗口。请保留草稿后重试；不会覆盖另一份更新的记录。',paneRetry:'重试保存会话',paneUser:'你',paneAssistant:'助手'});
  Object.assign(text.en,{paneLocalTemporary:'Saved sessions could not be read. Sessions and drafts from this window will not be saved; copy anything you want to keep before closing. The existing session file was not changed.',paneLocalSaved:'Identified project sessions, drafts and explicit references are stored locally; unidentified targets last for this window. Nothing is sent automatically.',paneSessionFailed:'Session saving is unconfirmed. Edits remain in this window. Keep your draft and retry; a newer stored snapshot will not be overwritten.',paneRetry:'Retry saving sessions',paneUser:'You',paneAssistant:'Assistant'});
  Object.assign(text['zh-CN'], { paneNew:'新建会话', paneSearch:'搜索本项目会话', paneDraft:'输入消息', paneSend:'发送', paneCancel:'取消', paneConfig:'助手设置', paneModel:'模型', paneNone:'未配置服务', paneWidth:'面板宽度', paneEmpty:'暂无消息。', paneTools:'暂无工具执行', paneLocal:'会话和草稿仅保留到本次窗口关闭，不会自动附加项目内容。', paneLimitSessions:'这次打开的会话数到上限了，暂时不能新建。回到已有会话继续；要留的内容先复制出来。', paneScopeCapacity:'会话已满，当前项目无法新建会话。请返回已有会话的项目，选择会话并复制保存需要留存的草稿。', paneLimitChars:'这条太长了，发不出去。删掉一部分，或者分成几条。', paneReferenceLimit:'最多可引用 20 项，请移除部分引用后再添加。', paneActionFailed:'这次操作未完成，请检查当前会话后重试。', paneSaveFailed:'面板宽度未能记住，下次打开可能恢复默认。' });
  Object.assign(text.en, { paneNew:'New session', paneSearch:'Search project sessions', paneDraft:'Message', paneSend:'Send', paneCancel:'Cancel', paneConfig:'Assistant settings', paneModel:'Model', paneNone:'Service not configured', paneWidth:'Pane width', paneEmpty:'No messages.', paneTools:'No tool activity', paneLocal:'Sessions and drafts last until this window closes. Project content is not attached automatically.', paneLimitSessions:"This window has reached its session limit, so no new session can be created for now. Go back to an existing session; copy anything you want to keep first.", paneScopeCapacity:'Sessions are full; a session cannot be created for this project. Return to a project with existing sessions, select one and copy any drafts you need to keep.', paneLimitChars:'This message is too long to send. Shorten it or split it into a few messages.', paneReferenceLimit:'Up to 20 references are allowed. Remove some before adding more.', paneActionFailed:'This action did not complete. Check the current session and try again.', paneSaveFailed:'Pane width could not be saved; the next launch may use the default.' });
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
  return { create, desktopStorage, text, KEY };
});
