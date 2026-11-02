'use strict';
// Text for the dialogs the main process shows itself (close prompt, stopped service), in the interface
// language the user chose (view-settings.json, read when the dialog shows). One language at a time:
// the Chinese is the old wording's Chinese half, the English its English half (JJ to review).
const TEXT = {
  'zh-CN': {
    closeTitle: '保存尚未确认',
    closeMessage: '页面可能未响应，最近修改尚未确认保存。',
    closeDetail: '继续等：保持窗口打开，恢复后可重试关闭。强制关闭：最近修改可能丢失。',
    closeKeepWaiting: '继续等',
    closeForce: '强制关闭（最近修改可能丢失）',
    serviceStopped: '本地编辑服务意外退出。请保留窗口中的修改，重新启动后检查项目。',
    startFailedTitle: 'MontClip 启动失败',
    startFailedHint: '请关闭后重试，并检查工作目录是否可写。',
    serviceStartTimeout: '启动本地编辑服务超时。',
    serviceExitedAtStart: '本地编辑服务已退出。',
  },
  en: {
    closeTitle: 'Save not confirmed',
    closeMessage: 'The editor may be unresponsive; recent changes are not confirmed saved.',
    closeDetail: 'Keep waiting: leave the window open and retry closing after recovery. Force close: recent changes may be lost.',
    closeKeepWaiting: 'Keep waiting',
    closeForce: 'Force close (may lose changes)',
    serviceStopped: 'The local editor service stopped unexpectedly. Keep the changes in the window, restart MontClip and check the project.',
    startFailedTitle: 'MontClip could not start',
    startFailedHint: 'Close it and try again, and check that the working folder can be written to.',
    serviceStartTimeout: 'The local editor service took too long to start.',
    serviceExitedAtStart: 'The local editor service stopped while starting.',
  },
};
/** The language in a view-settings read ({ok, value:{language}}); Chinese when it can't be told. */
const languageOf = (read) => (read && read.value && read.value.language === 'en' ? 'en' : 'zh-CN');
const nativeText = (language) => TEXT[language === 'en' ? 'en' : 'zh-CN'];
module.exports = { nativeText, languageOf, TEXT };
