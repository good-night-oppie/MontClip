# SOURCES：montclip-clip 的出处

- 做法都是自己的话转述的，没有照抄原文或代码。
- 各仓库用 `git clone --depth 1` 拉到 `research/skills-src/<owner>_<repo>/`，只读：没运行任何脚本，没装任何依赖，也没装进任何 skills 目录。
- 克隆日期：2026-11-05。

## A. 蒸馏来源（skill 仓库）

| 标记 | 仓库 | HEAD | 许可证（文件） | 备注 |
|---|---|---|---|---|
| [CS] | appergb/ClipSkills（`clip-skills/`） | `4d85c26` | MIT（`LICENSE`，另有 `clip-skills/LICENSE.txt`） | 仓库自己说内容提炼自影视飓风的剪辑课。经验值它也自己标成了「经验」。 |
| [DK] | dingkaka/video-editing-analyzer | `cc35b07` | **没有许可证文件** | 只借用思路，不复用任何文字。 |
| [CF] | Ceeon/videocut-skills（chengfeng-videocut） | `a33b43e` | Apache-2.0（`LICENSE` + `NOTICE.md`，原始出处写的是 Agentchengfeng/chengfeng-videocut-skills） | |
| [VU] | browser-use/video-use | `43cfc56` | MIT（`LICENSE`） | |
| [SC] | Vincentwei1021/video-shotcraft | `1266a3e` | Apache-2.0（`LICENSE`） | Remotion 引擎和 BGM、音效各有各的授权（`assets/audio/ATTRIBUTION.md`）。 |
| [MX] | maxazure/video-editing-skill | `2a5fc0a` | 没有 LICENSE 文件；README 第 6080 行的「## License」写着「MIT.」 | 按 MIT 对待，但没有正式文件确认。 |
| [MK] | volcengine/mediakit-cli | `c22061d` | MIT（`LICENSE`，© 2025 Beijing Volcano Engine） | 只读了 skill 文档。工具都要调火山云 API。 |
| — | tentenco/awesome-video-agent-skills | `59291f1` | MIT（`LICENSE`） | 只当索引用，来补漏。 |
| — | ygtec/cut.skill | — | — | **克隆失败（GitHub 404）**，没有蒸馏。 |
| — | 「三师爸的教学视频剪辑 skill」 | — | — | 索引里没有，网上也搜不到署这个名字的仓库，**没有找到**。几个看起来相近的教学类 skill（superslash-rico/course-long-video-editing、1502074527-svg/video-slicing-skill）都没法确认是三师爸的，所以没采用。 |

## B. 每条做法的出处（对应 SKILL.md §2 检查清单和各配方）

| 做法（转述） | 来源（仓库内路径） |
|---|---|
| 前 3 秒要有钩子；前 3 秒内画面或字幕至少变一次 | [MX] `docs/prompts/69-retention-rhythm-qa.md`、`62-hook-variants.md`；[DK] `references/sentence-shot-template.md`；[VU] `SKILL.md` |
| 长视频的钩子：先抛问题、再点主题、再快速预告；不要慢开场 | [CS] `clip-skills/references/05-节奏与结构.md` |
| 短视频 60–90 秒；视频号 ≤60 秒；长片切短 30–90 秒一条 | [MX] `scripts/profiles/tech_pro.yaml`、`lifestyle.yaml`、`docs/prompts/17-multi-platform.md` |
| 高光片段 90–180 秒，片头接 5–15 秒的钩子 | [MK] `skills/byted-mediakit-video/reference/generate-highlights-movie.md` |
| 竖屏 9:16、1080×1920 | [CS] `references/12-导出与交付.md`；[MX] `docs/prompts/17-multi-platform.md` |
| 一个逗号一屏；字号和位置按画面的百分比存 | [CF] `plugins/chengfeng-videocut/skills/chengfeng-subtitle/SKILL.md` |
| 每屏字幕 1.2–3 秒、≤14 字；有字幕可读性检查（闪屏、每秒字数） | [MX] `tech_pro.yaml`、`docs/prompts/70-subtitle-readability-qa.md` |
| 9:16 字幕放在画面下方 10–15% 的区域，避开人脸和平台按钮 | [DK] `references/example-jianying-skill-intro.md`、`sentence-shot-template.md`；[MX] `docs/prompts/73-platform-safe-area-qa.md` |
| 字幕在 1080p 下高度 ≥56 px；缩到手机宽还要能看清 | [SC] `references/aesthetic-rules.md` Q11 |
| 不剪断字；切点留 30–200 ms 余量；≥400 ms 的停顿最好剪 | [VU] `SKILL.md`（Hard Rules、Cut craft） |
| 停顿 ≥0.5 秒才剪，留 80 ms 余量，一次剪掉的总量 ≤20% | [MX] `docs/prompts/21-jump-cut.md` |
| 没有语音时用 −30 dB、0.5 秒判静音；有的气口要留 | [CS] `references/02-音频驱动剪辑流程.md`、`editor-code-video.md` |
| 删前面那遍、留后面那遍；分五遍各查一类；单个自然的语气词可以留 | [CF] `skills/chengfeng-cut/SKILL.md`、`references/semantic-deletion.md` |
| 「没真的听过」不能算听过；导出后要从成片里抽帧验收 | [CF] `references/business-workflow-contract.md`、`skills/chengfeng-export/SKILL.md` |
| 卡点误差 ≤3 帧；整屏强调效果每条 ≤3 次 | [SC] `references/music-beat-sync.md` §5、`aesthetic-rules.md` R4 |
| −14 LUFS，true peak ≤ −1 dBTP | [VU] `SKILL.md`（Music、Self-eval）；[CS] `references/editor-code-video.md` |
| 口播 −16 LUFS | [CS] `references/editor-code-video.md`；[MX] `SKILL.md`、`docs/prompts/54-audio-master-report.md` |
| BGM 在人声下面压低 12–15 dB | [VU] `SKILL.md` |
| 笑点后面要带上反应；笑声、掌声是节奏点 | [VU] `SKILL.md`（Cut craft） |
| 结尾收在一句话或一拍上；结尾留 1 秒 | [VU] `SKILL.md`；[DK] `references/example-jianying-skill-intro.md` |
| 标题 ≤20 字，不用极限词、不引流 | [MX] `docs/prompts/16-content-guard.md` |
| 封面不用开头那一帧（常是黑的），选张力最强的一帧 | [CS] `references/12-导出与交付.md`；[MX] `docs/prompts/07-cover.md` |
| 黑屏 >0.5 秒、画面冻住 >2 秒、无声 >3 秒算失败 | [MX] `docs/prompts/20-render-qa.md` |
| 素材要有授权，并记下来源 | [MX] SKILL.md 的授权检查（Rights/authorization gate）；[SC] `references/sfx-sourcing.md`；[DK] `references/learned-editing-knowledge.md` |
| 批量删除前先给人看方案；不要编工具能力 | [CS] `clip-skills/SKILL.md`；[VU] `SKILL.md`（第 4 步：等用户确认） |

## C. MontClip 的证据

依据是 `good-night-oppie/MontClip` 的 `origin/main` @ `b3441ba`（2026-11-06，和 GitHub 上一致；含 #173、#169、#148）。读法是只读的浅克隆；本机工作区落后 main 很多个提交，所以没有用工作区。

**插件说明**：任务里写的 `plugins/montclip-cindy` 在 main 上**不存在**。插件在单独的仓库 `good-night-oppie/MontClip-Cindy` 里（`origin/main` @ `85c8183`，2026-11-06 复查无变化）：
- 工具定义在 `ghost.json`：`montclip_status`、`list_tools`、`call_tool`、`montclip_undo`、`montclip_redo`、`montclip_seek`、`montclip_export`、`montclip_install_ffmpeg`、`montclip_open_task_view`。
- 分类和转发在 `main.js` 第 6–20 行和第 361–378 行。
- 内置引擎钉在 `engine-lock.json` 的 `5b312e63`（2026-11-05 03:41Z 从 main 同步的快照）。对比 main `b3441ba`：main 上有 142 个提交不在快照里，快照自身还带 98 个不在 main 上的提交（`gh api repos/good-night-oppie/MontClip/compare/5b312e63...b3441ba`，status=diverged）。上一轮写的「落后 88 个提交」是用 rev-list 算的旧数字，方向不同，不直接可比。

**工具名和参数**：都在 `mcp-tools.js`（main），按行号：

| 工具 | 行号 | 工具 | 行号 |
|---|---|---|---|
| `fablecut_patch_project` | 27 | `fablecut_songs` | 206 |
| `fablecut_frame` | 58 | `fablecut_transcribe` | 218 |
| `fablecut_import_media` | 91 | `fablecut_captions` | 240 |
| `fablecut_normalize_audio` | 112 | `fablecut_denoise` | 268 |
| `fablecut_auto_duck` | 126 | `fablecut_repair_media` | 281 |
| `fablecut_silence` | 143 | `fablecut_versions` | 314 |
| `fablecut_beats` | 160 | `fablecut_export` | 345 |
| `fablecut_reframe` | 176 | `fablecut_track` | 388 |
| `fablecut_highlights` | 191 | `fablecut_danmaku` | 416 |

- 找歌没达标的说法（0.12 / 0.38，门槛 0.6）出自 `mcp-tools.js` 里 `fablecut_songs` 的描述，以及 `auto-slices.js` 的 `SONG_GATE` / `SONG_MEASURED`。
- 打码做法来源：`CLAUDE.md` 的 Adjustment layers（约第 525 行）、Masks（约第 1054 行）、motion tracking 那节的「blur a face or a plate」配方（约第 1261 行）；属性面板 blur 滑块的范围 0–20 px 在 `app.js` 第 7662 行。
- 导出预设和响度：`delivery.js` 第 179–195 行（`youtube-shorts`、`tiktok` 都是 1080×1920）；第 240 行写明平台响度只是参考值，只有设了 `audio.loudness` 才会做响度归一。
- 配方 E（〔帮我修好〕）：按钮和文案在 `ui-preferences.js` 第 256–272 行（`repair-button`「帮我修好」、`repair-menu`、`repair-done`、`media-slow-mark`、`media-duration-unknown`）；Agent 行为在 `mcp-tools.js` 第 281 行 `fablecut_repair_media` 的描述（job / result.mediaId / REPAIR_FAILED），实现是 `make-editable.js` 和 `mcp-server.js` 第 1061 行起。
- 失败导出清理（#178）：`export-cleanup.js` 的 `stopSessions`（先停 ffmpeg 再删 `.part` 半成品，`server.js` 第 707 行调用）。
- 单声道居中（#179）：`edit-ops.js` 第 139 行 `defaultPanForChannel(ch, count)`——单声道唯一一条 stem 的 `pan` 默认 `0`（居中）。
- 「导出画面」下拉框按界面语言显示（#173）：`app.js` 第 262 行 `EXPORT_FRAME_ASPECTS`，文案 `ui-preferences.js` 第 941–947 行（`ef-title`「导出画面」、`ef-9-16`「9:16 竖屏」等）。

**界面文案**（中文原文都在 `ui-preferences.js` 和 `ui-terms.js` 里）：

| 文案 | 位置 |
|---|---|
| 「✨ 自动出切片」 | `as-open`，第 311 行 |
| 「这场主要在干什么？」 | `as-kind-title` |
| 「只要最好听的一部分（约 45 秒）」 | `as-len-hook`，第 352 行 |
| 「唱歌的段落整段出」 | `as-len-song-maybe`，第 351 行；没达标时 `app.js` 的 `autoSongKey` 显示 -maybe 版本 |
| 「按歌词校准字幕」 | `ly-open`，第 423 行 |
| 「字幕大小和位置」 | `cq-open`，第 579 行 |
| 「按句选段」 | `tr-sentences`，第 95 行 |
| 「导入弹幕…」 | `dm-import`，第 636 行 |
| 「高光候选」 | `hl-open`，第 282 行 |
| 「+ 调节层」 | `add-adjust`，第 90 行 |
| 「发往：{domain}」 | `ap-sends-to`，第 757 行 |
| 「AI 想做这一步」「只批准这次」「不同意」 | `ap-title` / `ap-once` / `ap-deny`（第 755 / 760 / 762 行） |
| 「帮我修好」 | `repair-button` / `repair-menu` / `repair-done` / `media-slow-mark` / `media-duration-unknown`，第 259–271 行 |
| 「导出画面」 | `ef-title`，第 947 行 |
| 「导出单帧」「导出队列」「轨道锁」「属性面板 → 蒙版」「新建序列…」「查找词」「添加字幕」「文稿」 | `ui-terms.js` |
| 快捷键 ←/→ 走一帧、I/O、; / ' | `index.html` 第 584、627、631 行，对应 `help-4`、`help-27`、`help-31` |

属性面板里只有英文的标签，都在 `app.js`：
- `Reframe` / `Follow subject`：第 7636–7647 行
- `Normalize` / `Apply` / `Noise`：第 7693–7698 行
- `Silence`（`Below` / `At least` / `Keep` / `Find` / `Cut N`）：第 7705–7718 行
- `Beats`（`Find beats` / `Mark` / `Snap cuts` / `Re-cut`）：第 7729–7733 行
- 「新建序列…」弹窗里的 `Canvas` / `Start from a copy of …` / `Follow the subject in each shot` / `Create`：第 14414–14417 行；`9:16 · Reel 1080×1920` 是第 252 行的 `ASPECT_PRESETS`

**PR 证据**：
- 已合并、本 skill 用到的：#53（弹幕导入）、#52（高光候选）、#70（本机听写）、#75（找歌）、#77（自动出切片）、#81（字幕大小和位置）、#85 / #100（按歌词校准字幕）、#127（自动出切片的首次使用修复）、#149（长录像导出不再静音）、#156（Highlights 修复）、#169（助手附上唱歌段落和音量数字，「附上唱歌段和音量」开关）、#157（〔帮我修好〕一键修复、`fablecut_repair_media`，2026-11-05 17:22Z 合并）、#178（失败/取消导出立刻停 ffmpeg、删 `.part`，17:17Z）、#179（单声道 stem 居中导出，17:17Z）、#173（「导出画面」下拉框按界面语言显示，2026-11-06 09:43Z）。
- 未合并，列在「即将可用」：#163、#164、#161、#175、#172、#170、#146、#138、#133、#165、#125、#155。
- 其它本轮合并但未进 skill 的：#131（一位主播的私下测试包，桌面打包功能，与剪辑操作无关）、#174（sherpa-onnx-linux-x64 许可证文档）、#143（Windows 关机误报的排查文档）、#181（下一批特性的 ADR）。

用 `gh pr list -R good-night-oppie/MontClip --state all --limit 60`（以及 `--state merged --limit 200`）查到，时间 2026-11-06。
