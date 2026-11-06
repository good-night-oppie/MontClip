// MontClip's own: how long something took, in Chinese words (助手面板 v7.2 「正在想… 12 秒」「已工作 58 秒」; VV on f3df7db).
// sessionDurationFormat.ts uses it in a Chinese window; English keeps Cindy's own formatDuration (58s, 1m 29s). The same
// rounding and minimum as Cindy's: whole seconds, at least minimumSeconds; minutes past 60 s, hours past an hour.
'use strict';
function durationZh(ms, { minimumSeconds = 1, alwaysShowRemainder = false } = {}) {
  const total = Math.max(minimumSeconds, Math.round((Number.isFinite(ms) ? ms : 0) / 1000));
  if (total < 60) return `${total} 秒`;
  if (total >= 3600) {
    const days = Math.floor(total / 86400), hours = Math.floor((total % 86400) / 3600), minutes = Math.floor((total % 3600) / 60);
    return `${days ? days + ' 天 ' : ''}${hours} 小时 ${minutes} 分`;
  }
  const minutes = Math.floor(total / 60), seconds = total % 60;
  return seconds === 0 && !alwaysShowRemainder ? `${minutes} 分` : `${minutes} 分 ${seconds} 秒`;
}
module.exports = { durationZh };
