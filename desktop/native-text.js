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
    // a private test package's one-time DeepSeek key (desktop/agent-seed.js): drafts, for JJ (2026-11-04)
    seedTitle: 'AI 服务没有设好',
    seedNoEncryption: '这台电脑现在没法加密保存密钥，所以包里带的 DeepSeek 密钥没有存，也不会改存成明文。重启电脑再打开 MontClip 试一次；还不行，请联系给你这个包的人。',
    seedFailed: '包里带的 DeepSeek 密钥没能存进 MontClip。请关掉 MontClip 再打开试一次；还不行，请联系给你这个包的人。',
    seedInvalid: '包里带的 AI 服务设置读不出来，没有用上。请联系给你这个包的人。',
    seedNotDeleted: '包里那份没加密的密钥文件没能删掉。请关掉 MontClip，自己删掉这个文件：{file}',
    // another MontClip has this data folder (JJ's final words, 2026-11-04): who, from the writer lock's shell
    dataDirInUseTitle: 'MontClip 没打开',
    dataDirInUseCindy: 'Cindy 里的 MontClip 正在用这些项目。两边同时改，会互相盖掉。',
    dataDirInUseDesktop: '另一个 MontClip 窗口正在用这些项目。两边同时改，会互相盖掉。',
    dataDirInUseHint: '先把那边的 MontClip 关掉，再打开这里。找不到那边的窗口，就重启电脑再试。',
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
    seedTitle: 'The AI service is not set up',
    seedNoEncryption: "This computer can't store keys encrypted right now, so the DeepSeek key that came with this package was not saved, and it won't be saved unencrypted either. Restart the computer and open MontClip again; if that doesn't help, contact whoever gave you this package.",
    seedFailed: "The DeepSeek key that came with this package could not be saved in MontClip. Close MontClip and open it again; if that doesn't help, contact whoever gave you this package.",
    seedInvalid: "The AI service settings that came with this package can't be read, so they were not used. Contact whoever gave you this package.",
    seedNotDeleted: "The unencrypted key file that came with this package could not be deleted. Close MontClip and delete this file yourself: {file}",
    dataDirInUseTitle: "MontClip didn't open",
    dataDirInUseCindy: 'The MontClip inside Cindy is using these projects. If both edit at once, one overwrites the other.',
    dataDirInUseDesktop: 'Another MontClip window is using these projects. If both edit at once, one overwrites the other.',
    dataDirInUseHint: "Close the other MontClip first, then open this one. If you can't find it, restart the computer and try again.",
    dataDirInUseOk: 'OK',
  },
};
/** The language in a view-settings read ({ok, value:{language}}); Chinese when it can't be told. */
const languageOf = (read) => (read && read.value && read.value.language === 'en' ? 'en' : 'zh-CN');
// The button names in these two come from the buttons' own text (ui-preferences.js officialPane_config /
// officialPane_removeConnection), so they are always the names on screen. JJ's final copy, 2026-11-05; Chinese button
// names in 〔〕.
{
  const ui = require('../shared/ui-preferences').text, zh = ui['zh-CN'], en = ui.en;
  const zhConfig = '〔' + zh.officialPane_config + '〕', zhRemove = '〔' + zh.officialPane_removeConnection + '〕';
  const enConfig = '“' + en.officialPane_config + '”', enRemove = '“' + en.officialPane_removeConnection + '”';
  Object.assign(TEXT["zh-CN"], { seedOk: "好", seedConflictTitle: "AI 先停用了",
    seedConflict: "包里带的 AI 服务设置，和这台电脑上已经保存的不一样，所以先暂停使用 AI。剪辑照常能用。\n想改用包里的设置：在助手面板点" + zhConfig + "，再点" + zhRemove + "，然后关掉 MontClip 再打开。\n不想替换你现在的设置：请联系给你这个包的人。",
    // a sealing that failed and could not be undone (agent-seed.js VERIFY_FAILED_NOT_UNDONE, then SEAL_FAILED_LEFTOVER on
    // every launch until it is removed; QQ on #131). 「会自动重新存一次」 is checked in test/agent-seed.test.js.
    seedSealFailed: "包里带的 DeepSeek 密钥第一次没存好，电脑上还留着一份不完整的 AI 服务设置，所以先暂停了 AI。剪辑照常能用，包里那份密钥也还在。\n要修好：在助手面板点" + zhConfig + "→" + zhRemove + "，再关掉 MontClip 重新打开，会自动重新存一次。还不行，请联系给你这个包的人。" });
  Object.assign(TEXT.en, { seedOk: "OK", seedConflictTitle: "AI is paused for now",
    seedConflict: "The AI service settings that came with this package don't match the ones saved on this computer, so the AI is paused for now. Editing works as usual.\nTo use the package's settings: in the assistant panel click " + enConfig + ", then " + enRemove + ", then close MontClip and open it again.\nTo keep your current settings instead: contact the person who gave you this package.",
    seedSealFailed: "The DeepSeek key that came with this package wasn't saved properly the first time, and incomplete AI service settings were left on this computer, so the AI is paused for now. Editing works as usual, and the package's key is still there.\nTo fix it: in the assistant panel click " + enConfig + " → " + enRemove + ", then close MontClip and open it again. It will save the key again automatically. If that doesn't help, contact whoever gave you this package." });
}
const nativeText = (language) => TEXT[language === 'en' ? 'en' : 'zh-CN'];
module.exports = { nativeText, languageOf, TEXT };
