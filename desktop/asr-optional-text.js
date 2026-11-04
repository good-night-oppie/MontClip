'use strict';
// The host's own boxes for an optional speech model (asr-optional.js; ADR 2026-11-04 §6). The page cannot word them,
// and nothing is downloaded before both answers: the licence (as shipped with MontClip, word for word), then the site.
// New copy, for JJ.

/** 1. The licence: its text as shipped (the model repo's LICENSE, byte for byte), and where the full Apache text is. */
function optionalLicenseText(language, { name, licenseName, text }) {
  const zh = language !== 'en';
  return zh ? {
    title: '许可证：' + name,
    message: `用这个模型之前，请先看它的许可证（${licenseName}）。`,
    detail: `${String(text).trim()}\n\n——以上是模型自带的许可证原文。Apache License 2.0 全文随 MontClip 一起附带：licenses/asr/omnilingual-asr-Apache-2.0.txt。\n\n这是 Meta 开源的多语言模型，适合英文和其他语言。中文的错字比默认的 Paraformer 多好几倍，中文直播建议继续用默认模型。\n\n点「同意」以后，下一步再选从哪个网站下载；点「不同意」，什么都不下载，听写照旧用默认模型。`,
    buttons: ['不同意', '同意'],
  } : {
    title: 'Licence: ' + name,
    message: `Before using this model, please read its licence (${licenseName}).`,
    detail: `${String(text).trim()}\n\n— Above: the licence that comes with the model, word for word. The full Apache License 2.0 text is shipped with MontClip: licenses/asr/omnilingual-asr-Apache-2.0.txt.\n\nThis is Meta's open multilingual model, for English and other languages. In Chinese it makes several times more mistakes than the default Paraformer model, so Chinese streams are better off with the default.\n\nAfter "Agree" you choose the site to download from; "Don't agree" downloads nothing and transcription keeps the default model.`,
    buttons: ["Don't agree", 'Agree'],
  };
}

/** 2. The site: which one (the streamer picks; another site is asked again), the full host names, and what is sent. */
function optionalSourceText(language, { name, mb, sites, hosts }) {
  const zh = language !== 'en';
  const others = hosts.filter((h) => !sites.includes(h));
  return zh ? {
    title: '下载 ' + name,
    message: `大约 ${mb} MB。从哪个网站下载？`,
    detail: `只会连接这些网站：\n${hosts.join('\n')}\n${others.length ? `（${others.join('、')} 是存放大文件的地址，下载可能会转到那里）\n` : ''}\n发出去的只有下载请求：和所有上网请求一样会带上这台电脑的 IP 地址，不会发送你的录像、弹幕、字幕或账号。\n下载完会逐个核对文件，对不上就删掉、不用。没下载成功的话，换网站要再选一次。`,
    buttons: ['取消', ...sites.map((s) => '从 ' + s + ' 下载')],
  } : {
    title: 'Download ' + name,
    message: `About ${mb} MB. Which site should it come from?`,
    detail: `Only these sites are contacted:\n${hosts.join('\n')}\n${others.length ? `(${others.join(', ')} hold the large files and the download is passed on to them)\n` : ''}\nOnly the download request is sent: like any request on the internet it carries this computer's IP address; nothing of your recordings, danmaku, captions or accounts is sent.\nEvery file is checked when it arrives; one that does not match is deleted and not used. If the download fails, choosing another site asks again.`,
    buttons: ['Cancel', ...sites.map((s) => 'Download from ' + s)],
  };
}

/** Revoke: the files and the consent record are deleted; transcription goes back to the default model. */
function optionalRevokeText(language, { name }) {
  const zh = language !== 'en';
  return zh ? {
    title: '撤销 ' + name,
    message: `要撤销 ${name} 吗？`,
    detail: '会删掉这个模型的文件和你的同意记录。听写回到默认的 Paraformer 中文模型。以后想用还可以再选。',
    buttons: ['取消', '撤销'],
  } : {
    title: 'Revoke ' + name,
    message: `Revoke ${name}?`,
    detail: "The model's files and your consent record are deleted. Transcription goes back to the default Paraformer model. You can choose it again later.",
    buttons: ['Cancel', 'Revoke'],
  };
}

module.exports = { optionalLicenseText, optionalSourceText, optionalRevokeText };
