'use strict';
/* Test first (red on the old code), then implementation. This file locks JJ's finalized table
   (the shared wording table of 2026-11-05, Chinese draft v2, sha256 5b1b7a13d400c772fa81d1d34a8fe704188bcf3c228e9f4a805f1c0201b0cac6;
   JJ 抽查完成并给「可以交 Deja，再给实现」; numbered entries 1–120): the 87 help rows,
   the 21 other index.html spots and the 11 known remaining term rows. ⟨…⟩ is the page's own <kbd>/<code>. */
const test = require('node:test'), a = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const ROOT = path.join(__dirname, '..');
const view = require('../ui-preferences');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
const strip = (s) => s.replace(/<\/?(?:kbd|code)>/g, '').replace(/[⟨⟩]/g, '');

// JJ's table, A section (87 help rows), zh with ⟨⟩ for the page's own kbd/code tags.
const HELP = [
  '播放 / 暂停（源监视器或播放器，哪个在用就控制哪个）',
  '往返预览 — ⟨L⟩ 往前播，⟨J⟩ 倒着播（没有声音）；再按一下变成 1.5× · 2× · 4×，按另一个键掉头；⟨K⟩ 停',
  '按住 ⟨K⟩ 再点一下，走一帧；两个一起按住，用 ¼ 速度慢慢走',
  '走 1 帧（加 ⟨⇧⟩ 是 1 秒）',
  '跳到上一个 / 下一个剪辑点（选了片段时，先跳它的入点再跳出点；没选时，看目标轨道）。在源监视器里：跳到入点 / 出点',
  '跳到开头 / 结尾',
  '直接输入时间：⟨01:15:00⟩，连着写 ⟨1500⟩（= 15 秒），⟨+30⟩ / ⟨-1:00⟩ 往后 / 往前挪，⟨12.5⟩ 秒。点入点 / 出点的时间也能这样输入',
  '播到出点就停；Home / End 跳到入点 / 出点',
  '载入源监视器',
  '把源的入点→出点那段插到时间线播放头处（后面的片段往后让）',
  '替换 — 在播放头处覆盖；如果源里载入的是时间线上的片段，就把新的入点 / 出点用到它上面（长度变了，后面的片段跟着挪）',
  '工具：选择 · 波纹编辑（拖片段的边，后面的跟着走）· 滚动编辑（拖两段之间的剪辑点）· 内滑（片段位置不动，换里面用的那一段）· 外滑（挪动片段，两边的片段跟着裁）',
  '在播放头处分割片段（有选中的就分选中的，没有就分目标轨道上的）',
  '把选中片段的开头 / 结尾裁到播放头',
  '删除选中的片段，或者去掉当前选中的转场',
  '波纹删除 — 删掉选中的，并把目标轨道上的空隙合拢',
  '找下一个所有轨道都空着的空隙（到结尾后从头再找；只在入点–出点之间找）',
  '合拢播放头处的空隙（目标轨道）',
  '在播放头处加转场（前后各占一半）',
  '停用 / 启用选中的片段 — 停用后预览和导出都看不到',
  '取消 / 建立视频与音频的链接',
  '撤销 / 重做（⟨Ctrl⟩+⟨Y⟩ 也是重做）',
  '框选片段',
  '加进选择 / 从选择里去掉',
  '全选 / 取消选择',
  '停用 / 锁定 / 建立或取消链接 / 预合成',
  '设源的入点 / 出点（源模式），或者设时间线的工作区（播放器模式；导出也只导这一段）',
  '清除源或时间线的入点 / 出点',
  '在入点 / 出点处分割片段',
  '把片段裁到入点 / 出点（去掉前后多出来的）',
  '提起 / 提取目标轨道上入点→出点那段（提取会把空隙补上）',
  '在播放头处加 / 删标记',
  '跳到下一个 / 上一个标记',
  '拖动可移动 · 点击跳过去 · 双击或右键可改名、换颜色、删除 · 「标记」面板里列着全部标记',
  '缩放时间线',
  '以鼠标位置为中心缩放',
  '缩放到选中的片段',
  '缩放到入点–出点工作区',
  '缩放到显示全部',
  '打开 / 关闭吸附 — 点 ▾ 选吸附到什么（片段边缘、播放头、标记、入点 / 出点、关键帧、帧格）',
  '设为 / 取消目标轨道 — 编辑只作用在亮着的（目标）轨道上',
  '只听这条轨道（其他轨道都静音；再点一次恢复）',
  '锁定这条轨道 — 上面的东西都不能改、不能挪',
  '删掉一条空轨道（至少留 1 条视频轨和 1 条音频轨）',
  '跳到上一个 / 下一个关键帧（属性面板跟着变）',
  '把这个属性恢复默认，并清掉它的所有关键帧',
  '把播放头处的值恢复默认，或者删掉那个关键帧',
  '「入场」「出场」「在播放头处」「循环」这几个菜单，可以给选中的片段加上现成的动画 · 〔保存为预设〕把这个片段的关键帧存下来，所有项目都能用',
  '拖动改音量 · ⟨Ctrl/Cmd⟩+点击加关键帧 · ⟨Alt⟩+点击或双击删关键帧 · 拖两个角上的小方块做淡入淡出',
  '给选中片段旁边（或播放头处）的声音剪辑点加交叉淡化',
  '导入素材文件',
  '新建文件夹 · 新建复合片段',
  '可以搜名字、类型、编码、⟨2160p⟩ 或标签；⟨#tag⟩ 只搜标签 · ⟨Esc⟩ 清空',
  '找出时间线上用到它的地方 · 素材信息 · 收藏 · 标签 · 合集',
  '加星标 · 列出它用在哪些地方（点一个就跳过去）',
  '列表视图，带素材信息的各列 · 点列名排序',
  '〔在项目中显示〕— 在素材库里找到它的文件',
  '〔重新链接…〕— 告诉 MontClip 这段录像现在在哪 · 〔替换文件…〕— 换成另一个文件，用到它的片段都跟着换',
  '〔创建代理〕— 做一份更轻的副本，剪起来更流畅（右键「项目」标签页可以一次做全部）· 监视器上方的〔代理〕可以开关代理播放；导出永远用原片',
  '双击在时间线上打开 · 把素材库里的复合片段拖到时间线上就放进去了 · 点时间线上方的路径可以退回上一层',
  '预合成 — 把选中的片段放进一个新的复合片段',
  '退回上一层（什么都没选中时）',
  '把字幕条、标志动画或社交平台版式拖到时间线上（或点 ＋）· 在属性面板的「模板」一栏里填内容 · 右键复合片段 →〔保存为模板〕',
  '打开项目列表（或者点项目名）',
  '给当前项目存一个版本（每一步本来就自动保存了；版本是以后可以回到的一个点）',
  '拿某个版本和现在比 ·〔恢复…〕（点两次；恢复前会先把现在的存成一个版本）· 标成定稿',
  '打开这个项目里的另一个序列 ·〔新建序列…〕（任意画面尺寸，空的或者复制一份）·〔复制一份〕·〔重命名…〕·〔删除…〕（点两次；删之前先存成一个版本）',
  '点一下看详情、备注和标签 · 双击打开',
  '打开这个项目',
  '先退出「新建项目」，再关掉项目列表',
  '点两次 — 只有已归档的项目才能删',
  '拖动调色偏（按住 ⟨⇧⟩ 可以微调）· 双击恢复颜色 · 双击名称或滑块名可以恢复那一项',
  '在监视器上点一下：可以校正白平衡、在曲线上标出这个颜色，或者在图层的颜色选区里选中它 · ⟨Esc⟩ 取消',
  '点击在曲线上加点 · 拖动移动它 · 双击删掉它',
  '在里面拖动可移动 · 拖手柄改大小 · 拖圆钮旋转（按住 ⟨⇧⟩ 每次转 15°）· 多边形 / 贝塞尔：⟨Ctrl/Cmd⟩+点击加点，双击删点 · 绘制：拖出一个手画的轮廓',
  '点击放点，放点时拖动可以拉出曲线手柄 · 点第一个点或按 ⟨Enter⟩ 闭合 · ⟨Ctrl⟩+⟨Z⟩ / ⟨Backspace⟩ 删掉最后一个点，⟨Ctrl⟩+⟨⇧⟩+⟨Z⟩ 放回来 · ⟨Esc⟩ 取消',
  '拖出一个手画的轮廓 — 它会变成可以再改的贝塞尔曲线',
  '在里面拖动可移动 · 拖边上的手柄改大小 · 拖圆钮旋转（按住 ⟨⇧⟩ 每次转 15°）· 拖点或它的手柄（按住 ⟨Alt⟩ 两边手柄分开动）· ⟨Alt⟩+拖点拉出新手柄 · ⟨Ctrl/Cmd⟩+点击轮廓加点 · 双击点删掉它 · ⟨Esc⟩ 取消选择',
  '在里面拖动可移动 · 拖角改大小（按住 ⟨⇧⟩ 保持比例）· 拖圆钮旋转（按住 ⟨⇧⟩ 每次转 15°）· 直线 / 路径：拖点或它的手柄（按住 ⟨Alt⟩ 两边手柄分开动），⟨Alt⟩+拖点拉出新手柄 · 路径：⟨Ctrl/Cmd⟩+点击轮廓加点，双击点删掉它 · ⟨Esc⟩ 取消选择',
  '点击放点，放点时拖动可以拉出曲线手柄 · 点第一个点闭合路径 · 按 ⟨Enter⟩ 保持不闭合 · ⟨Ctrl⟩+⟨Z⟩ / ⟨Backspace⟩ 删掉最后一个点，⟨Ctrl⟩+⟨⇧⟩+⟨Z⟩ 放回来 · ⟨Esc⟩ 取消',
  '拖关键帧小方块可移动 · 拖手柄可以把路径拉弯（按住 ⟨Alt⟩ 两边手柄分开动）· ⟨Alt⟩+拖关键帧拉出新手柄 · 双击关键帧变回尖角',
  '在监视器上拖动来移动锚点，画面不动（按住 ⟨⇧⟩ 吸附到画面中心）· ⟨Esc⟩ 关掉',
  '在监视器上点要跟踪的位置 — 从播放头一直跟到片段结尾 · ⟨Esc⟩ 取消选点，或者停下正在跑的跟踪（已经跟好的部分会留着）',
  '跳到那里 · ⟨⇧⟩+点击或拖动可以选中连着的一串字',
  '剪掉选中的字和后面的停顿（在目标轨道上提取）· ⟨Esc⟩ 取消选择',
  '⟨Enter⟩ / ⟨⇧⟩+⟨Enter⟩ 跳到下一个 / 上一个找到的地方 · 〔剪切〕把找到的全部剪掉',
  '选一个样式，再点〔添加字幕〕（撤销一次就能全部撤回；会替换那里原有的字幕）· 点 SRT / VTT 可以下载字幕 · 〔导入…〕把字幕文件里的字幕放上来',
];

test('all 87 help rows carry a keyed Chinese line and keep their kbd/code tags (JJ 定稿表 A)', () => {
  const region = html.slice(html.indexOf('id="helpKeys"'), html.indexOf('id="helpEmpty"'));
  const rows = [...region.matchAll(/<tr><td(?:\s[^>]*)?>[\s\S]*?<\/td>(<td[^>]*>)([\s\S]*?)<\/td><\/tr>/g)];
  a.equal(rows.length, 87, 'the help layer still has 87 rows');
  const tagSeq = (s) => [...s.matchAll(/<(kbd|code)>([\s\S]*?)<\/\1>/g)].map((m) => m[2]);
  rows.forEach((r, i) => {
    const [open, enHtml] = r.slice(1);
    a.match(open, new RegExp(`<td data-i18n-html="own\\.help-${i + 1}"`), `row ${i + 1} is keyed`);
    const zh = view.t('zh-CN', 'own.help-' + (i + 1));
    a.ok(zh, `own.help-${i + 1} exists`);
    a.equal(strip(zh), strip(HELP[i]), `row ${i + 1} wording is JJ's`);
    a.deepEqual(tagSeq(zh), tagSeq(enHtml), `row ${i + 1} keeps the page's kbd/code keys`);
  });
});

test('switching back to English restores the cell\'s own markup (i18n-html stashes the original)', () => {
  const cell = { dataset: { i18nHtml: 'own.help-6' }, innerHTML: 'Jump to start / end' };
  const rootEl = { querySelectorAll: (sel) => sel === '[data-i18n-html]' ? [cell] : [] };
  view.applyI18n(rootEl, 'zh-CN');
  a.equal(cell.innerHTML, '跳到开头 / 结尾');
  view.applyI18n(rootEl, 'en');
  a.equal(cell.innerHTML, 'Jump to start / end');
});

// B section: the other 21 index.html spots. [where, key, en, zh]
const B = [
  ['html:binEmpty', 'own.bin-dbl-hint', 'Double-click to preview it, or drag it onto the timeline.', '双击可以先预览，或者直接拖到时间线上。'], // #137: JJ's final English as well as Chinese
  ['html:btnZoom100', 'term.fit-window', 'Fit', '适合窗口'],
  ['html:tcIo IN', 'term.in-lab', 'IN', '入点'],
  ['html:tcIo OUT', 'term.out-lab', 'OUT', '出点'],
  ['html:btnTrimIO', 'term.trim-io', 'Trim', '裁剪'],
  ['html:importUrlDialog', 'term.import-url-stored-locally', 'Downloads an HTTPS video, audio or image into the project media folder. The file is stored locally — the URL is not used as the playback source. Remote SVGs are not imported (they can run script if opened as a document).', '把一个网址（HTTPS）上的视频、音频或图片下载到这个项目的素材文件夹里。会联网访问这个网址一次，下载好以后存在你的电脑上，播放时不会再去访问它。网上的 SVG 图片不会导入，因为它可能带脚本，不安全。'],
  ['html:exportRangeSel', 'term.in-out-range', 'IN–OUT', '入点–出点'],
  ['html:engineFastNote', 'term.engine-fast-note', 'Frame-accurate ffmpeg encode. Once it starts you can hide the progress and keep editing; the export keeps going. The file is made from the timeline as it was when you clicked Export.', '用 FFmpeg 导出，每一帧都准。开始以后可以把进度收起来，接着剪，导出会继续做。成片是你点「导出」那一刻的样子，之后的改动不会进这个文件。'], // #263
  ['html:engineWebCodecsNote', 'term.engine-webcodecs-note', 'Frame-accurate. Browser encodes H.264; server muxes. Needs a modern Chromium and ffmpeg. Don\'t close MontClip while it runs, and wait for it to finish before you edit again.', '每一帧都准。画面由浏览器编码，再由 MontClip 打包成视频文件。需要较新的 Chromium 内核浏览器，也要装好 FFmpeg。导出期间请别关掉 MontClip，等它做完再接着剪。'], // #263
  ['html:dlvColorField', 'term.color-2', 'Color', '色彩'],
  ['html:dlvWhField', 'term.width-height', 'Width × height', '宽 × 高'],
  ['html:dlvReframeField', 'term.reframe', 'Reframe', '重构图'],
  ['html:dlvProfileField', 'term.profile', 'Profile', '配置档'],
  ['html:dlvCrfField', 'term.crf-label', 'CRF', '恒定画质（CRF）'],
  ['html:dlvBitrateField', 'term.bitrate-mb-s', 'Bitrate (Mb/s)', '码率（Mb/s）'],
  ['html:dlvACodecField', 'term.codec', 'Codec', '编码'],
  ['html:dlvTpField', 'term.true-peak-dbtp', 'True peak (dBTP)', '真峰值（dBTP）'],
  ['html:exportWcHint', 'term.webcodecs-no-crf', 'WebCodecs has no CRF — quality is driven by bitrate. VBR spends bits on hard frames; CBR holds a steady rate.', 'WebCodecs 没有恒定画质（CRF），画质由码率决定。动态码率（VBR）把码率多花在复杂的画面上；固定码率（CBR）一直保持同一个码率。'],
  ['html:btnQueueStart', 'term.queue-start', 'Start', '开始'],
  ['html:exportTitle', 'term.exporting', 'Exporting…', '正在导出…'],
  ['html:exportNote', 'term.export-note-realtime', 'Rendering your sequence in real time. Keep this tab focused.', '正在实时生成画面。导出完之前，请一直停在这个页面。'],
];

test('the 21 other index.html spots are wired to keys with JJ\'s wording (定稿表 B)', () => {
  for (const [where, key, en, zh] of B) {
    a.equal(view.t('zh-CN', key), zh, where + ' zh');
    a.equal(view.t('en', key), en, where + ' en');
  }
  const wired = [
    ['binEmpty', 'own.bin-dbl-hint'],
    ['btnZoom100', 'term.fit-window'], ['btnTrimIO', 'term.trim-io'],
    ['importUrlDialog', 'term.import-url-stored-locally'], ['exportRangeSel', 'term.in-out-range'],
    ['engineFastNote', 'term.engine-fast-note'], ['engineWebCodecsNote', 'term.engine-webcodecs-note'],
    ['dlvWhField', 'term.width-height'], ['dlvReframeField', 'term.reframe'], ['dlvProfileField', 'term.profile'],
    ['dlvCrfField', 'term.crf-label'], ['dlvBitrateField', 'term.bitrate-mb-s'], ['dlvTpField', 'term.true-peak-dbtp'],
    ['exportWcOpts', 'term.webcodecs-no-crf'], ['btnQueueStart', 'term.queue-start'],
    ['exportTitle', 'term.exporting'], ['exportNote', 'term.export-note-realtime'],
  ];
  for (const [id, key] of wired) {
    const tag = html.match(new RegExp(`<[^>]*id="${id}"[^>]*>`)) || html.match(new RegExp(`<span class="tc-io-lab"[^>]*>IN</span>`));
    a.ok(tag, id);
  }
  a.match(html, /<span class="tc-io-lab" data-i18n="term\.in-lab">IN<\/span>/);
  a.match(html, /<span class="tc-io-lab" data-i18n="term\.out-lab">OUT<\/span>/);
  for (const [id, key] of wired) {
    const i = html.indexOf(`id="${id}"`);
    const block = html.slice(Math.max(0, i - 200), i + 2200);
    a.ok(block.includes(`data-i18n="${key}"`) || block.includes(`data-i18n-tail="${key}"`), `${id} → ${key}`);
  }
  // the Color label of the video section and the audio Codec label get spans
  a.match(html, /<label class="dlv-f"><span data-i18n="term\.color-2">Color<\/span><select id="dlvColor">/);
  a.match(html, /<label class="dlv-f"><span data-i18n="term\.codec">Codec<\/span><select id="dlvACodec">/);
  // runtime Start / Stop and the export note follow the interface language too
  a.match(app, /start\.textContent = queueRunning \? uiText\("term\.queue-stop"\) : uiText\("term\.queue-start"\);/);
  a.match(app, /els\.exportNote\.textContent = uiText\("term\.export-note-realtime"\);/);
});

// C section: the 11 known remaining rows (extNotFullPath stays).
test('the 11 remaining rows take JJ\'s wording (定稿表 C)', () => {
  const C = [
    ['term.zoom-to-the-in-out-work-area', '缩放到入点–出点工作区'],
    ['term.trim-clips-to-in-out-t', '裁剪片段到入点 / 出点（⇧T）'],
    ['term.clear-source-or-timeline-in-out', '清除源或时间线的入点 / 出点'],
    ['term.in-out-and-markers', '入点 / 出点与标记'],
    ['own.ly-open-title', '粘贴选中字幕（或入点–出点那段）这首歌的歌词，把听错的字改过来；什么都不往外发'],
    ['own.ly-pick-range', '先在时间线上选中这首歌的字幕，或者用入点和出点框出这首歌，再点〔按歌词校准字幕〕。'],
    ['term.vector-animations-from-library-svg', '素材库里的矢量动画（SVG）'],
    ['term.overlay-art-from-library-elements', '素材库里的叠加素材'],
    ['term.sound-effects-from-library-sfx', '素材库里的音效'],
    ['term.filter-e-g-marker-trim-mask', '筛选 — 例如：标记、关键帧、字幕'],
    ['own.dlv-note-master', '和项目一样大 · 高画质 · H.264 恒定画质（CRF）16 · AAC 320k'],
  ];
  for (const [key, zh] of C) a.equal(view.t('zh-CN', key), zh, key);
  a.equal(view.t('zh-CN', 'own.as-lyrics'), '按歌词校准字幕', '#114: 按钮叫法以页面为准（已核对 own.as-lyrics）');
});

test('#118 (JJ 的条件): 搜「标记」确实能搜到帮助层里的行；最终示例词按 Rea 决定', () => {
  const Z = require('./zh-shown');
  const region = html.slice(html.indexOf('id="helpKeys"'), html.indexOf('id="helpEmpty"'));
  const rows = [...region.matchAll(/<tr><td(?:\s[^>]*)?>[\s\S]*?<\/td>(<td[^>]*>)([\s\S]*?)<\/td><\/tr>/g)];
  const hits = rows.map((r, i) => ({ row: i + 1, text: Z.shown(r[1] + r[2] + '</td>').map((x) => x.text).join(' ') }))
    .filter((x) => x.text.includes('标记'));
  a.ok(hits.length > 0, 'the rendered zh-CN help text has at least one 标记 hit');
  a.deepEqual(hits.map((x) => x.row), [32, 33, 34, 40], 'the actual filter text of rows 32 / 33 / 34 / 40 contains 标记');
  a.equal(view.t('zh-CN', 'term.filter-e-g-marker-trim-mask'), '筛选 — 例如：标记、关键帧、字幕', 'Rea 定的最终示例词');
});

test('the display whitelist includes SVG / VTT / Chromium (JJ v2 决定 1)', () => {
  const Z = require('./zh-shown');
  for (const name of ['SVG', 'VTT', 'Chromium']) {
    a.ok(Z.NAMES.includes(name), name + ' in NAMES');
    a.equal(Z.englishLeft('中文里的 ' + name + ' 保留'), '', name + ' is allowed');
  }
  const left = Z.englishShown();
  for (const key of ['html:binTabs', 'help:?/Captions', 'html:engineWebCodecsNote', 'html:helpFilter',
    'html:dlvRate', 'html:exportWcOpts', 'html:exportWcMode'])
    a.ok(!left[key], key + ': no English left, got ' + left[key]);
  for (const key of ['html:dlvCrfField', 'html:dlvBitrateField', 'html:dlvTpField', 'html:exportRangeSel',
    'html:engineFastNote', 'html:exportNote', 'html:exportTitle', 'html:importUrlDialog', 'html:tcIo'])
    a.ok(!left[key], key + ': no English left, got ' + left[key]);
});
