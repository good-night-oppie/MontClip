'use strict';
// The host's own questions about the speech model (#70): the page cannot word them, and nothing is sent before the
// streamer says yes (ADR 2026-11-03: the approval box is the host's). New copy, for JJ.
const { manifest } = require('../asr-models');

const mbOf = (which) => {
  const m = manifest.models[which];
  // MiB, to the nearest 10, as JJ writes it (约 230 MB)
  return Math.round(Math.max(...m.sources.map((s) => s.size || Object.values(m.files).reduce((n, f) => n + f.size, 0))) / 1048576 / 10) * 10;
};
const hostsOf = (which) => [...new Set(manifest.models[which].sources.map((s) => new URL(s.base || s.url).hostname))];

function asrDownloadText(language, which) {
  // where a GitHub download may be passed on: GitHub's own file servers, and only those (JJ)
  const zh = language !== 'en', mb = mbOf(which), hosts = hostsOf(which), more = manifest.hosts.filter((h) => h.endsWith('.githubusercontent.com'));
  const what = which === 'punct' ? (zh ? '标点模型' : 'the punctuation model') : which === 'asrMeta' ? (zh ? 'Meta 的多语言听写模型' : "Meta's multilingual speech model (Omnilingual ASR)") : (zh ? '听写模型' : 'the speech model');
  return zh ? {
    title: '下载' + what,
    message: `要下载${what}，大约 ${mb} MB。`,
    detail: `会依次从这些网站下载，前一个不成功再换下一个：\n${hosts.join('\n')}\n（下载时可能会转到 GitHub 存文件的网站：${more.join('、')}，不会去别的网站）\n\n只下载模型文件，不发送你的录像、字幕或项目。下载完会逐个核对文件，对不上就不用。`,
    buttons: ['取消', '下载'],
  } : {
    title: 'Download ' + what,
    message: `Download ${what}, about ${mb} MB?`,
    detail: `It is downloaded from these sites, in order, the next one only if the one before fails:\n${hosts.join('\n')}\n(the download may be passed on to GitHub's file servers: ${more.join(', ')}; no other sites)\n\nOnly the model files are downloaded; nothing of your recordings, captions or projects is sent. Every file is checked when it arrives, and one that does not match is not used.`,
    buttons: ['Cancel', 'Download'],
  };
}
const asrImportTitle = (language) => (language !== 'en' ? '选择 U 盘或放着模型文件的文件夹' : 'Choose the USB drive or the folder with the model files');

module.exports = { asrDownloadText, asrImportTitle, mbOf, hostsOf };
