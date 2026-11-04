'use strict';
// The owner (2026-11-02): "why is the Chinese UI's text in two languages?" Every user-facing string is
// said in the interface language from a key; a literal that holds a Chinese sentence and an English one
// together ("中文 / English", "中文。English") fails this test.
const test = require('node:test'), a = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const ROOT = path.join(__dirname, '..');
const FILES = ['app.js', 'desktop/main.js', 'export-jobs.js', 'server.js', 'index.html', 'ui-preferences.js', 'ui-terms.js'];
const LIT = /"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`/g;
// Allowed, with the reason:
// key labels and proper names, not sentences (Windows, its Media Feature Pack and ffmpeg.exe: main's #28 texts)
// and a key on the keyboard (JJ's line under 全拿掉: 「…或按 Ctrl+Z。想换一批，点「换一场 / 改设置」…」)
// and the web address the data goes to, in JJ's 「AI 数据说明」 (「发给谁：DeepSeek（api.deepseek.com）…」, 2026-11-04)
const KEY_NAMES = /\b(IN|OUT|In|Out|SRT|FLV|MP4|MontClip|H\.264|FFmpeg|ffmpeg\.exe|x264|AI|API|Windows|Media Feature Pack|Ctrl|DeepSeek|api\.deepseek\.com)\b/g;
// desktop/main.js's native dialogs are fixed in #37 (desktop/native-text.js); until that is merged into this branch, its
// six known strings are the only exception, and the exception ends by itself once native-text.js is here.
const PENDING_37 = !fs.existsSync(path.join(ROOT, 'desktop', 'native-text.js'))
  ? ['保存尚未确认', '页面可能未响应', '继续等：', '继续等 /', '强制关闭（最近修改可能丢失） /', '本地编辑服务意外退出'] : [];

// {name} placeholders (uiText vars, e.g. #70's {got}) are filled in, not words of either language
function bilingual(t) {
  const u = t.replace(/\$\{[^}]*\}/g, '').replace(/\{\w+\}/g, '').replace(KEY_NAMES, '');
  if (!/[一-鿿]/.test(u)) return false;
  return /[A-Za-z]{2,}[ ,;.:'’-]+[A-Za-z]{2,}/.test(u) || /[一-鿿][^\n]*\s\/\s*[A-Za-z]{2,}/.test(u) || /[A-Za-z]{2,}[^\n]*\s\/\s*[一-鿿]/.test(u);
}

test('no user-facing string holds Chinese and English together', () => {
  const found = [];
  for (const f of FILES) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    for (const m of src.matchAll(LIT)) {
      const t = m[0];
      if (!bilingual(t)) continue;
      if (f === 'desktop/main.js' && PENDING_37.some((p) => t.includes(p))) continue;
      found.push(`${f}:${src.slice(0, m.index).split('\n').length}  ${t.slice(0, 90)}`);
    }
  }
  a.deepEqual(found, []);
});

test('the check itself catches the shapes it is for, and lets key names through', () => {
  for (const t of ['"没有可映射的音视频 / No source media to map"', '"页面可能未响应。\\nThe editor may be unresponsive."', '"Keep sentences / 按句选择"'])
    a.ok(bilingual(t), t);
  for (const t of ['"清除源或时间线的 IN / OUT"', '"先导入 SRT 或添加字幕。"', '"导入 FLV 需要用 MontClip 桌面版打开。"', '"No source media to map"', '`${a} → ${b} 秒`', '"正在下载听写模型：{got} / 约 230 MB。"', '"刚拿掉的，也可以按 Ctrl+Z。想换一批，点「换一场 / 改设置」重新找。"'])
    a.ok(!bilingual(t), t);
});
