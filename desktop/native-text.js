'use strict';
// Text for the dialogs the main process shows itself (close prompt, stopped service), in the interface
// language the user chose (view-settings.json, read when the dialog shows). One language at a time:
// the Chinese is the old wording's Chinese half, the English its English half (JJ to review).
// serviceStoppedTitle and ok title and label the error boxes, which showErrorBox left as "Error" / "OK" (VV; JJ to review).
const TEXT = {
  'zh-CN': {
    closeTitle: '保存尚未确认',
    closeMessage: '页面可能未响应，最近修改尚未确认保存。',
    closeDetail: '继续等：保持窗口打开，恢复后可重试关闭。强制关闭：最近修改可能丢失。',
    closeKeepWaiting: '继续等',
    closeForce: '强制关闭（最近修改可能丢失）',
    serviceStopped: 'MontClip 的内部服务意外停止了，最近的修改可能没有保存。请关掉 MontClip 再重新打开，看看最近剪的地方还在不在。',
    startFailedTitle: 'MontClip 启动失败',
    startFailedHint: '请关闭后重新打开。还不行，就换一个能保存文件的文件夹再试。',
    serviceStartTimeout: '启动 MontClip 的内部服务超时。',
    serviceExitedAtStart: 'MontClip 的内部服务已退出。',
    serviceStoppedTitle: 'MontClip 出错了',
    ok: '确定',
    // another MontClip has this data folder (VV's draft for #111, JJ to review)
    dataDirInUseTitle: 'MontClip 没打开',
    dataDirInUse: '另一个 MontClip 正在用这些项目（可能是 Cindy 里的 MontClip）。两个同时改，会互相盖掉。',
    dataDirInUseHint: '先把那边的 MontClip 关掉，再打开这里。',
    dataDirInUseOk: '好',
  },
  en: {
    closeTitle: 'Save not confirmed',
    closeMessage: 'The editor may be unresponsive; recent changes are not confirmed saved.',
    closeDetail: 'Keep waiting: leave the window open and retry closing after recovery. Force close: recent changes may be lost.',
    closeKeepWaiting: 'Keep waiting',
    closeForce: 'Force close (may lose changes)',
    serviceStopped: "MontClip's internal service stopped unexpectedly, so your most recent changes may not have been saved. Close MontClip, open it again, and check whether your latest edits are still there.",
    startFailedTitle: 'MontClip could not start',
    startFailedHint: 'Close and reopen MontClip. If it still fails, try a folder where files can be saved.',
    serviceStartTimeout: "MontClip's internal service took too long to start.",
    serviceExitedAtStart: "MontClip's internal service stopped while starting.",
    serviceStoppedTitle: 'MontClip ran into a problem',
    ok: 'OK',
    dataDirInUseTitle: "MontClip didn't open",
    dataDirInUse: 'Another MontClip is using these projects (maybe the MontClip in Cindy). If both change them at once, they overwrite each other.',
    dataDirInUseHint: 'Close the other MontClip first, then open this one.',
    dataDirInUseOk: 'OK',
  },
};
/** The language in a view-settings read ({ok, value:{language}}); Chinese when it can't be told. */
const languageOf = (read) => (read && read.value && read.value.language === 'en' ? 'en' : 'zh-CN');
const nativeText = (language) => TEXT[language === 'en' ? 'en' : 'zh-CN'];
module.exports = { nativeText, languageOf, TEXT };
