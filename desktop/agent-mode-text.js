'use strict';
// The host's own box before Yolo (P4; QQ's revision 3): the page cannot word it or answer it. New copy, for JJ.
function yoloText(language) {
  return language === 'en' ? {
    title: 'Turn on Full auto?',
    message: 'With Full auto on, the AI does every step straight away, without asking you.',
    detail: 'Edits to the project can still be undone. Things that cannot be undone, such as exporting a file, are done straight away too.\n\nAnything sent out of MontClip is still shown to you first, with what is sent and where.\n\nWhat is never allowed stays blocked, such as deleting the original recordings or overwriting an existing file.\n\nWhen MontClip restarts, it is back to Manual.',
    buttons: ['Cancel', 'Turn on Full auto'],
  } : {
    title: '打开全自动？',
    message: '打开以后，AI 的每一步都直接做，不再问你。',
    detail: '改项目的步骤照样可以撤销。导出文件这类撤不回的操作，也会直接做。\n\n往外发的内容照样先给你看：发什么、发到哪里。\n\n任何时候都不允许的操作照样拦下，比如删除原始录像、覆盖已有文件。\n\n重新打开 MontClip 后，会回到「手动」。',
    buttons: ['取消', '打开全自动'],
  };
}
module.exports = { yoloText };
