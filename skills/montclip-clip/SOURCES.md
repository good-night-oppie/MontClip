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

依据是 `good-night-oppie/MontClip` 的 `origin/main` @ `aedb7eaa6020ec962d3ee054b41bf90f05f6c1f5`（2026-11-07，和 GitHub 上一致；本轮新增 #120、#125、#138，另含此前已收的 #154、#155、#165、#162、#109、#176、#175、#159、#193、#190、#172、#170、#137 等）。读法是只读的浅克隆；本机工作区落后 main 很多个提交，所以没有用工作区。

**插件说明**：任务里写的 `plugins/montclip-cindy` 在 main 上**不存在**。插件在单独的仓库 `good-night-oppie/MontClip-Cindy` 里（`origin/main` @ `5278bf8a96fc48ae9f30eefcc3c2b02f5d1a0e66`，2026-11-07 复查）：
- 工具定义在 `ghost.json`：`montclip_status`、`list_tools`、`call_tool`、`montclip_undo`、`montclip_redo`、`montclip_seek`、`montclip_export`、`montclip_install_ffmpeg`、`montclip_open_task_view`。
- 分类和转发在 `main.js` 第 6–20 行和第 361–378 行。
- 内置引擎钉在 `engine-lock.json` 的 `5b312e63`（2026-11-05 03:41Z 从 main 同步的快照）。对比 main `aedb7eaa`：main 上有 451 个提交不在快照里，快照自身还带 98 个不在 main 上的提交（`gh api repos/good-night-oppie/MontClip/compare/5b312e63...aedb7eaa`，status=diverged）。
- MontClip-Cindy 本轮增量（`78b044ad..5278bf8a`）只有 #21、#29、#30、#31、#32 这些 PR SOP / CI / 网络扫描流程改动，没有插件功能、界面文案、工具参数或引擎锁变化。上一轮实质增量 #7（状态卡「听写」行，约 240 MB；`montclip_status` 回复新增 `transcription`）、#9（`montclip_export` 改为后台 job，`{job}` 查、`{cancel}` 停，`done` 只在文件落进所选文件夹后；`copyFailed` 报 `failed`；worker 停止时调用引擎 shutdown 清掉仍在跑的 ffmpeg）、#22（目标盘不支持硬链接时回退复制交付）继续有效。引擎锁、版本 0.5.1 不变。

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
- 打码做法来源：`CLAUDE.md` 的 Adjustment layers（约第 525 行）、Masks（约第 1054 行）、motion tracking 那节的「blur a face or a plate」配方（约第 1261 行）；属性面板 blur 滑块的范围 0–20 px 在 `app.js` 第 7710 行。蒙版/裁切坐标约定由 #155（合并提交 `bc5d74c5`）实测锁定：蒙版 `x/y` 为中心点、0…1，基准是裁切后剩下的画面，`cropL/R/T/B` 为整帧各边裁掉的百分比（0…95），换算公式见 `CLAUDE.md`「Mask and crop coordinates」表（约第 1093–1125 行）；`test/render-geometry.test.js` 与 `docs/validation/2026-11-05-render-geometry/README.md` 为像素级证据。`fablecut_frame {time}` 回复新增 `imageSize` 映射说明（`mcp-server.js` 第 1319–1327 行），且说明拼图是原始素材、查合成效果用 `{time}`（`mcp-tools.js` `fablecut_frame` schema，`CLAUDE.md` 第 2234–2238 行）。
- 长录像听写与不可用文案（#165，合并提交 `29ae0939`）：`mcp-server.js` 第 667 行 `LONG_FILE_S = 600`（>10 分钟且片段窗口 < 全片一半时只读片段窗口，`pad` 默认 1.5 秒，`transcribe.js` 第 144 行）；`/api/asr/transcribe` 与 `/api/transcribe/request` 接受 `ranges`（1–500 段，`server.js` 第 1968、1176 行）；听写缺失的三种 code 与定稿文案在 `asr-status.js`（「还没装听写模型（约 240 MB）」「这台电脑上的 MontClip 还没有听写程序…剪辑、导出照常能用」，模型大小按 1,000,000 字节/MB 取整到 10），离开本机的错误一律脱路径（`hidePaths`）；server 顶层不再被听写异常打崩（`server.js` 第 810 行附近）。
- AI 抠像（#154，合并提交 `aba1d4c8`）：同意流程与文案在 `app.js` 第 13580–13621 行与 `ui-preferences.js` 第 266–279 行（「要联网下载 AI 抠像吗？」「只下载，不上传…录像、字幕和项目都不会发出去」「边播边录这种导出方式不支持 AI 抠像…」）；MediaPipe 资产钉死与字节校验在 `bgremove-assets.js`（9 个文件精确字节数 + SHA-256）；导出/合成完整性拒绝在 `noteExportBgRemove`。Whisper 已不在听写路径（听写只走本机 Paraformer）。
- 窄窗口素材面板（#162，合并提交 `59ba9890`）：≤560 px 时素材面板占满宽度，顶栏「素材」按钮变「返回播放器」，双击载入 Source 素材自动收起面板（`app.js` 第 43–58 行、`ui-preferences.js` 第 359–362 行、`style.css` 第 4768 行起）。
- 导出预设和响度：`delivery.js` 第 179–195 行（`youtube-shorts`、`tiktok` 都是 1080×1920）；第 240 行写明平台响度只是参考值，只有设了 `audio.loudness` 才会做响度归一。
- 配方 E（〔帮我修好〕）：按钮和文案在 `ui-preferences.js` 第 322–334 行（`repair-button`「帮我修好」、`repair-menu`、`repair-done`、`media-slow-mark`、`media-duration-unknown`）；Agent 行为在 `mcp-tools.js` 第 281 行 `fablecut_repair_media` 的描述（job / result.mediaId / REPAIR_FAILED），实现是 `make-editable.js` 和 `mcp-server.js` 第 1061 行起。
- 失败导出清理（#178）：`export-cleanup.js` 的 `stopSessions`（先停 ffmpeg 再删 `.part` 半成品，`server.js` 第 707 行调用）。
- 单声道居中（#179）：`edit-ops.js` 第 139 行 `defaultPanForChannel(ch, count)`——单声道唯一一条 stem 的 `pan` 默认 `0`（居中）。
- 「导出画面」下拉框按界面语言显示（#173）：`app.js` 第 262 行 `EXPORT_FRAME_ASPECTS`，文案 `ui-preferences.js` 第 1031–1036 行（`ef-title`「导出画面」、`ef-9-16`「9:16 竖屏」等）。
- 桌面助手空方案与限制提示（#172，合并提交 `299bdaefd4b0`）：`chat-proposal.js` 的 `unchanged` 判断、`agent-limits.js`、`agent-format.js`；〔查看剪辑建议〕按钮行为在 `agent-ui/pane.tsx`。
- 桌面助手改比例（#175，合并提交 `aba11e3fc782`）：`capabilities.js` 第 29–31、51–54、135–138 行（只允许 9:16 / 1:1 / 4:5，`reframe` 为 sensitive 且每次确认）；`app.js` 第 23480–23598 行（先读画面、进度与取消、建成新序列、一次撤销返回）；中文文案 `ui-preferences.js` 第 844–858 行。
- Reframe 末帧（#176，合并提交 `8545430d52e2`）：`reframe.js` 第 20、125–136 行（每秒 5 帧加 `sampleTimes` 的最后一帧）；编辑器、桌面助手和 MCP 共用，`CLAUDE.md` 第 2030–2055 行说明老项目只有重新执行才会重算。
- 显示尺寸（#159，合并提交 `df2811d23991`）：`media-lib.js` 第 29–30、184–196、223–235 行（`width` / `height` 是显示尺寸，`storedWidth` / `storedHeight` 记录不同的原始尺寸）；界面文案 `ui-preferences.js` 第 763 行。
- 找回录像（#137，合并提交 `8eaad3ce84d3`；#193，合并提交 `1b6054a13543`）：按钮和导出提醒在 `ui-preferences.js` 第 96–116 行，「找回录像」18 处文案在第 120–148 行；自动接回只接受同名同大小且唯一的候选，见 `media-lib.js` 第 491–497 行 `autoRelinkPick` 和 `app.js` 第 3338–3348 行。
- 「AI 数据说明」v3（#170，合并提交 `412f36c45cf1`）：`desktop/agent-data-notice.js` 第 8–9 行 `NOTICE_VERSION = 3`；「只是数字、不是录音、声音本身不发」在 `ui-preferences.js` 第 1193、1222 行。
- ProRes 项目末尾声音（#190，合并提交 `d74716a8548e`）：范围、48 kHz 采样边界、自定义映射与拒绝条件见 `docs/decisions/2026-11-05-prores-project-end.md` 第 11–33 行；界面拒绝文案在 `ui-preferences.js` 第 802 行 `export-profile-unsupported`。
- 桌面助手确认卡（#120，合并提交 `993ecb6f120d`）：`agent-approval.js` 第 1–68 行把卡绑在对应回复或计划上，等待时挡住后续步骤与发送，只接受这张卡的合法选择；离开聊天、项目变化或更新的卡都按「不同意」结束。`agent-ui/HostCard.tsx` 第 27–51 行不让批准按钮自动拿焦点，Esc 明确拒绝；`agent-ui/pane.tsx` 的 `approvalWaiting` 与发送按钮禁用逻辑在 main 上可核对。「只批准这次」「这个聊天中都批准」「不同意」和「等你决定」见 `ui-preferences.js` 第 865–874、1284 行。
- 没有 H.264 编码器时先拒绝（#125，合并提交 `2ffad9642efb`）：`app.js` 第 20226–20259 行的 `exportH264Refusal` 在 `noteExportBgRemove`、`renderAudioMix` 之前运行；第 11685–11713 行在「自动出切片」确认页禁用〔导出〕并防止返回后旧请求继续；第 20523–20529 行把等待中的 H.264 队列项标失败。服务端 `server.js` 第 453–456、502–504、636–638 行的 `noH264Error` 也拒绝。定稿提示「这台电脑上找不到 MontClip 能用的视频编码器…可以先更新显卡驱动再试」在 `ui-preferences.js` 第 67 行。
- 桌面版「在文件夹里显示」（#138，合并提交 `aedb7eaa6020`）：导出队列完成项按钮在 `app.js` 第 20493 行，素材右键在第 3025 行；中文原文「在文件夹里显示」「文件不在，先重新链接」「文件已经不在了」「只在桌面版里能用」在 `ui-preferences.js` 第 177–182 行。`desktop/main.js` 第 80–111 行只允许工作区文件或本次应用会话里登记过的保存位置，并调用 `shell.showItemInFolder`；页面拿不到绝对路径。

**界面文案**（中文原文都在 `ui-preferences.js` 和 `ui-terms.js` 里）：

| 文案 | 位置 |
|---|---|
| 「✨ 自动出切片」 | `as-open`，第 374 行 |
| 「这场主要在干什么？」 | `as-kind-title` |
| 「只要最好听的一部分（约 45 秒）」 | `as-len-hook`，第 415 行 |
| 「唱歌的段落整段出」 | `as-len-song-maybe`，第 414 行；没达标时 `app.js` 的 `autoSongKey` 显示 -maybe 版本 |
| 「按歌词校准字幕」 | `ly-open`，第 486 行 |
| 「字幕大小和位置」 | `cq-open`，第 642 行 |
| 「按句选段」 | `tr-sentences`，第 153 行 |
| 「导入弹幕…」 | `dm-import`，第 699 行 |
| 「高光候选」 | `hl-open`，第 345 行 |
| 「+ 调节层」 | `add-adjust`，第 90 行 |
| 「发往：{domain}」 | `ap-sends-to`，第 822 行 |
| 「AI 想做这一步」「只批准这次」「不同意」 | `ap-title` / `ap-once` / `ap-deny`（第 820 / 825 / 827 行） |
| 「帮我修好」 | `repair-button` / `repair-menu` / `repair-done` / `media-slow-mark` / `media-duration-unknown`，第 322–334 行 |
| 「导出画面」 | `ef-title`，第 1036 行 |
| 「找回录像」「找到它…」「先找回来…」「照样导出」 | `rl-title`、`off-find-it`、`off-find-first`、`off-export-anyway`，第 96–148 行 |
| 「导出单帧」「导出队列」「轨道锁」「属性面板 → 蒙版」「新建序列…」「查找词」「添加字幕」「文稿」 | `ui-terms.js` |
| 快捷键 ←/→ 走一帧、I/O、; / ' | `index.html` 第 585、628、632 行，对应 `help-4`、`help-27`、`help-31` |

属性面板里只有英文的标签，都在 `app.js`：
- `Reframe` / `Follow subject`：第 7690–7697 行
- `Normalize` / `Apply` / `Noise`：第 7741–7747 行
- `Silence`（`Below` / `At least` / `Keep` / `Find` / `Cut N`）：第 7756–7766 行
- `Beats`（`Find beats` / `Mark` / `Snap cuts` / `Re-cut`）：第 7773–7784 行
- 「新建序列…」弹窗里的 `Canvas` / `Start from a copy of …` / `Follow the subject in each shot` / `Create`：第 14466–14471 行；`9:16 · Reel 1080×1920` 是第 252 行的 `ASPECT_PRESETS`

**PR 证据**：
- 已合并、本 skill 用到的早期 PR：#53（弹幕导入）、#52（高光候选）、#70（本机听写）、#75（找歌）、#77（自动出切片）、#81（字幕大小和位置）、#85 / #100（按歌词校准字幕）、#127（自动出切片的首次使用修复）、#149（长录像导出不再静音）、#156（Highlights 修复）、#169（助手附上唱歌段落和音量数字，「附上唱歌段和音量」开关）、#157（〔帮我修好〕一键修复、`fablecut_repair_media`）、#178（失败/取消导出立刻停 ffmpeg、删 `.part`）、#179（单声道 stem 居中导出）、#173（「导出画面」下拉框按界面语言显示）。
- 此前几轮新增收进：#137 / #193（找回录像与中文对话框）、#159（显示尺寸）、#170（AI 数据说明 v3）、#172（空方案不出按钮、做不到的事先说）、#175 / #176（桌面助手改比例与末帧跟随）、#190（限定路径的 ProRes 末尾声音修复）、#165（长录像只听写片段窗口与缺听写保护）、#155（蒙版/裁切坐标与抽帧尺寸映射）、#154（AI 抠像确认与资产校验）、#162（窄窗口素材面板）。合并提交见上方逐条证据。
- 本轮新增收进（MontClip `aba1d4c8..aedb7eaa`）：#120（助手确认卡放进消息流，等待时不跑后续步骤也不能发送；Esc / 离开 / 项目变化会拒绝）、#125（没有 H.264 编码器时点导出先说明，不先混音或渲染；自动出切片与队列同样处理）、#138（桌面版导出完成项和素材右键「在文件夹里显示」）。#125、#138 已从「即将可用」移除。
- 未合并，列在「即将可用」：#163（依赖的坐标约定 #155 已合并）、#164、#161、#146、#133。
- 仍开放且改到 `skills/` 的同步外 PR：#202（撤回隐私模糊配方，改不透明覆盖块）；#186 已关闭。本轮没有改 §4，也没有采用或回写它们的未合并改动。
- 其它本轮合并但未进 skill 的：#187（README 演示、图示与验证脚本；`scripts/readme-demo/README.md` 记录不透明遮挡和逐像素逐帧验证，但不改引擎；为避免和开放的 #202 同改打码章节，本轮不收进 §4）、#189（模拟草稿编辑测试与诊断文档）、#185 / #201（站点与 README 文档）、#200 / #206 / #207 / #210 / #214（PR SOP、CI 与网络扫描）。纯测试、文档重建、打包清单与内部决策文档不作为新剪辑能力。
- MontClip-Cindy：本轮 `78b044ad..5278bf8a` 的 #21、#29、#30、#31、#32 都是 PR SOP / CI / 网络扫描流程，未收进 skill。仓库 main 现为 `5278bf8a`，插件版本 0.5.1 与引擎锁 `5b312e63` 均未变；上一轮 #7、#9、#22 的插件用法继续有效。#28 是仍开放的上一轮 skill 同步 PR，不属于 main 增量。

用 `gh api repos/good-night-oppie/<repo>/compare/<旧>...main` 读增量，并用 `gh pr list` / `gh pr view` 核对合并与开放 PR，时间 2026-11-07。
