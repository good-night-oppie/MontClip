// MontClip stand-in for Cindy's lib/sessionDurationFormat (see cindy-resolve.cjs STAND_INS). ThinkingCard and WorkGroupBlock
// show how long the AI has been at it. In a Chinese window MontClip says it in words, 「58 秒」「1 分 29 秒」 (v7.2; VV on
// f3df7db; durationWords.cjs). In English it is Cindy's own formatDuration: 58s, 1m 29s, and past an hour 1h 5m / 2d 1h 5m,
// which is what Cindy's English usageDetails strings say there too.
import type { TFunction } from 'i18next';
import { formatDuration } from '@cindy/maker-shared/message-render';
import i18n from '../cindy-i18n';
import { durationZh } from './durationWords.cjs';

export function formatSessionDuration(
  ms: number,
  _t?: TFunction,
  options: Parameters<typeof formatDuration>[1] = {},
): string {
  return i18n.language === 'zh-CN' ? durationZh(ms, options) : formatDuration(ms, options);
}
