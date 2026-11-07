'use strict';
/* Synthetic material for the lyrics-track tests (docs/decisions/2026-11-05-lyrics-align-agent-tool.md): no recording, no
   real song. The lyrics are four short songs written for these tests (no one's copyrighted text). sing() stands in for what
   the local engine hears when a TTS voice reads the lyrics over an accompaniment: one word per Chinese character, about
   0.28 s apart, a breath between lines, and the accompaniment's harm as a share of characters misheard (a similar-sounding
   wrong character), dropped or added. Seeded, so every run gives the same words. A real TTS voice through the real engine
   is not part of these tests: CI has neither (docs/decisions/2026-11-05-lyrics-align-agent-tool.md). */
const SONGS = {
  harbour: ['晚风吹过旧港口', '灯塔还在等着谁', '我把名字写在沙上', '潮水一来就带走', '你说明天会更好', '我信了整整一夜', '船笛响起的时候', '月亮落进了海里', '别回头看我的背影', '天亮以后再见面'],
  rooftop: ['屋顶上的猫在打盹', '晾衣绳挂满了阳光', '楼下的面馆开了门', '葱花的味道飘上来', '我们数着飞过的鸽子', '一只两只都很慢', '收音机唱着老歌', '外婆跟着轻轻哼', '日子像糖慢慢化', '甜到下一个夏天'],
  train: ['最后一班车开走了', '站台只剩下我和风', '手机电量还剩一格', '给你发的话没有回', '路灯一盏一盏地亮', '影子被拉得好长', '我把耳机塞进耳朵', '让歌替我说想念', '如果明天还会下雨', '就借你一把伞吧'],
  garden: ['种下一颗小小的种子', '每天浇水跟它说话', '春天来了它不发芽', '我还是天天等着它', '邻居笑我太傻', '我说花会听得见', '有一天清晨醒来', '窗台上开了一朵', '它的颜色像你的笑', '我终于等到了答案'],
};
// characters a noisy recognizer swaps in (common, similar-sounding)
const POOL = '的了是在我你他她们这那就都也还要会说想看来去好很没有不一上下大小天人心里时光风雨花开月亮海水声音梦想走跑说话'.split('');
function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
/** What the engine hears: lines → [{w, s, e}] from t0, with `err` of the characters misheard (and err/4 dropped, err/4
 *  extra noise characters). */
function sing(lines, { t0 = 10, step = 0.28, breath = 1.2, err = 0, seed = 7 } = {}) {
  const r = rng(seed), out = [];
  let t = t0;
  for (const line of lines) {
    for (const ch of line) {
      const x = r();
      if (x < err / 4) { t += step; continue; }                                   // dropped
      const w = x < err ? POOL[Math.floor(r() * POOL.length)] : ch;               // misheard
      out.push({ w, s: +t.toFixed(3), e: +(t + step * 0.85).toFixed(3) }); t += step;
      if (r() < err / 4) { out.push({ w: POOL[Math.floor(r() * POOL.length)], s: +t.toFixed(3), e: +(t + 0.1).toFixed(3) }); t += 0.12; }
    }
    t += breath;
  }
  return out;
}
const text = (lines) => lines.join('\n');
module.exports = { SONGS, sing, text, rng };
