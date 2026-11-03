'use strict';
// Synthetic Chinese text for the transcription benchmark (no course material, no real recording): sentences built from
// fixed parts, one paragraph per 8 sentences, about `chars` characters.  node make-zh-text.cjs <out.txt> <chars>
const fs = require('node:fs');
const who = ['主播', '今天的嘉宾', '剪辑师', '一位老观众', '房管', '我的朋友', '小助手', '直播间里的大家'];
const did = ['聊起了', '问到了', '讲了讲', '想起了', '介绍了', '吐槽了', '计划着', '回顾了'];
const what = ['新歌单里的几首老歌', '上周那场做饭直播', '周末去山里的那次旅行', '游戏里一个奇怪的漏洞', '这场节目最好笑的片段',
  '怎么把很长的录像剪短', '城市里一个安静的早晨', '乐队名字背后的故事', '下个月的直播安排', '昨天晚上的抽奖结果'];
const tail = ['大家都说好', '然后换了下一首歌', '背景音乐一直轻轻地放着', '说完就接着往下聊', '一边说一边笑',
  '足足讲了一分多钟', '弹幕一下子刷了起来', '可是谁也想不起来为什么'];
const [out, chars] = [process.argv[2], Number(process.argv[3] || 3000)];
if (!out) throw Error('usage: node make-zh-text.cjs <out.txt> <chars>');
const paras = [];
let n = 0, total = 0, para = [];
while (total < chars) {
  const s = who[n % who.length] + did[(n * 3) % did.length] + what[(n * 7) % what.length] + '，' + tail[(n * 5) % tail.length] + '。';
  para.push(s); total += s.length; n++;
  if (para.length === 8) { paras.push(para.join('')); para = []; }
}
if (para.length) paras.push(para.join(''));
fs.writeFileSync(out, paras.join('\n') + '\n');
console.log(JSON.stringify({ sentences: n, chars: total, paragraphs: paras.length }));
