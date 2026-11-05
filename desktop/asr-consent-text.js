'use strict';
// The host's own boxes for a speech model that needs the streamer's consent (asr-consent.js; ADR 2026-11-04 #122 §6):
// the licence (as shipped with MontClip, word for word), then the site, then — to undo it — revoking. The page cannot
// word them, and nothing is downloaded before both answers. New copy, for JJ.

/** 1. The licence: its text first, word for word; where the full Apache text is; what "no" means. */
function asrLicenseText(language, { name, licenseName, text }) {
  const zh = language !== 'en';
  return zh ? {
    title: '许可证：Meta 的多语言听写模型',
    message: `用这个模型之前，请先看它的许可证（${licenseName}）。`,
    detail: `${String(text).trim()}\n\n——以上是模型自带的许可证原文。Apache License 2.0 全文随 MontClip 一起附带：licenses/asr/omnilingual-asr-Apache-2.0.txt。\n\n模型：${name}\n适合英文和其他语言；普通话的错字比默认的 Paraformer 多好几倍，中文直播建议继续用 Paraformer。\n\n点「同意」以后，再选从哪个网站下载；点「不同意」，什么都不下载，听写照旧用 Paraformer。`,
    buttons: ['不同意', '同意'],
  } : {
    title: "Licence: Meta's multilingual speech model",
    message: `Before using this model, please read its licence (${licenseName}).`,
    detail: `${String(text).trim()}\n\n— Above: the licence that comes with the model, word for word. The full Apache License 2.0 text is shipped with MontClip: licenses/asr/omnilingual-asr-Apache-2.0.txt.\n\nModel: ${name}\nFor English and other languages; in Mandarin it makes several times more mistakes than the default Paraformer, so Chinese streams are better off with Paraformer.\n\nAfter "Agree" you choose the site to download from; "Don't agree" downloads nothing and transcription keeps Paraformer.`,
    buttons: ["Don't agree", 'Agree'],
  };
}

/** 2. The site: the streamer picks one (another site is asked again); every host contacted, in full; what is sent. */
function asrSourceText(language, { mb, sites, hosts }) {
  // mb: one size per site (files from the mirror, a smaller archive from GitHub)
  const size = (i) => (Array.isArray(mb) ? mb[i] : mb);
  const zh = language !== 'en';
  return zh ? {
    title: '下载 Meta 的多语言听写模型',
    message: '从哪个网站下载？',
    detail: `下载只会连接这些网站（GitHub 的下载会转到它存文件的网站）：\n${hosts.join('\n')}\n\n发出去的只有下载请求：和所有上网请求一样会带上这台电脑的 IP 地址，不会发送你的录像、弹幕、字幕或账号。\n下载完会逐个核对文件，对不上就删掉、不用。没下载成功的话，换网站要再选一次。`,
    buttons: ['取消', ...sites.map((s, i) => `从 ${s} 下载（约 ${size(i)} MB）`)],
  } : {
    title: "Download Meta's multilingual speech model",
    message: 'Which site should it come from?',
    detail: `Only these sites are contacted (a GitHub download is passed on to GitHub's file servers):\n${hosts.join('\n')}\n\nOnly the download request is sent: like any request on the internet it carries this computer's IP address; nothing of your recordings, danmaku, captions or accounts is sent.\nEvery file is checked when it arrives; one that does not match is deleted and not used. If the download fails, choosing another site asks again.`,
    buttons: ['Cancel', ...sites.map((s, i) => `Download from ${s} (about ${size(i)} MB)`)],
  };
}

/** 3. Just before the request: the address chosen this time, in full (the rule for anything sent out), and the hosts that
 *  site may pass the download on to. New copy, for JJ. */
function asrConfirmText(language, { site, url, mb, also = [] }) {
  const zh = language !== 'en';
  const via = also.length ? (zh ? `（下载可能会转到 ${also.join('、')}）\n` : `(the download may be passed on to ${also.join(', ')})\n`) : '';
  return zh ? {
    title: '下载 Meta 的多语言听写模型',
    message: `从 ${site} 下载，大约 ${mb} MB。`,
    detail: `下载地址：\n${url}\n${via}\n发出去的只有这个下载请求，会带上这台电脑的 IP 地址，不会发送你的录像、弹幕、字幕或账号。`,
    buttons: ['取消', '下载'],
  } : {
    title: "Download Meta's multilingual speech model",
    message: `Download from ${site}, about ${mb} MB.`,
    detail: `Address:\n${url}\n${via}\nOnly this download request is sent; it carries this computer's IP address and nothing of your recordings, danmaku, captions or accounts.`,
    buttons: ['Cancel', 'Download'],
  };
}

/** 〔删掉 Meta 的模型〕 (JJ's final words, Deja 11-05): the model's files and the agreement go; transcription goes back to
 *  Paraformer. `bytes`: what the files on this computer take, shown as 「（约 N MB）」 when known (JJ: optional).
 *  Buttons in JJ's order, 〔删掉〕〔先不删〕; Enter and Esc keep it (keepId). */
function asrRevokeText(language, { bytes } = {}) {
  const zh = language !== 'en';
  const mb = bytes > 0 ? (bytes >= 10 * 1048576 ? Math.round(bytes / 1048576 / 10) * 10 : Math.max(1, Math.round(bytes / 1048576))) : 0;
  return zh ? {
    title: '删掉 Meta 的多语言听写模型？',
    message: '删掉 Meta 的多语言听写模型？',
    detail: `会删掉这台电脑上的 Meta 模型文件${mb ? `（约 ${mb} MB）` : ''}，同时收回你之前对它许可条款的同意。以后想用，重新下载、再同意一次就行。用它听写好的字幕不会删。`,
    buttons: ['删掉', '先不删'], removeId: 0, keepId: 1,
  } : {
    title: "Remove Meta's multilingual speech model?",
    message: "Remove Meta's multilingual speech model?",
    detail: `This deletes Meta's model files${mb ? ` (about ${mb} MB)` : ''} from this computer and withdraws your earlier agreement to its licence terms. To use it again, download it and agree again. Captions it already made are kept.`,
    buttons: ['Remove', 'Keep it'], removeId: 0, keepId: 1,
  };
}

module.exports = { asrLicenseText, asrSourceText, asrConfirmText, asrRevokeText };
