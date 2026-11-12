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

依据是 `good-night-oppie/MontClip` 的 `origin/main` @ `7e793990a9ca`（2026-11-11，和 GitHub 上一致；功能口径含 #264，本轮 #271 / #279 / #287 只改 README、SOP 候选稿与执行清单，#276 只改测试清理、#278 只改 PR lint，另含此前已收的 #249 / #251 / #260 / #259 / #256 / #258、#240、#238 / #245、#224 / #227、#231、#233、#235、#236、#237，以及更早的 #161、#146、#177、#132、#219、#221、#222、#130、#202、#213、#164、#129、#183、#120、#125、#138、#154、#155、#165、#162、#109、#176、#175、#159、#193、#190、#172、#170、#137 等）。读法是只读的 `gh api` 文件与补丁读取（`contents` / `compare`）加只读的独立克隆 `git fetch`；没有运行仓库脚本，本机工作区落后 main 很多个提交，所以没有用工作区。

**插件说明**：任务里写的 `plugins/montclip-cindy` 在 main 上**不存在**。插件在单独的仓库 `good-night-oppie/MontClip-Cindy` 里（`origin/main` @ `8af4d0cdb918`，2026-11-11 复查）：
- 工具定义在 `ghost.json`：`montclip_status`、`list_tools`、`call_tool`、`montclip_undo`、`montclip_redo`、`montclip_seek`、`montclip_export`、`montclip_install_ffmpeg`、`montclip_open_task_view`。
- 分类和转发在 `main.js` 第 6–20 行和第 361–378 行。
- 内置引擎钉在 `engine-lock.json` 的 `de6640df37a5`（插件 #48 于 2026-11-09 从 `5b312e63` 推进）。对比 main `7e793990a9ca`：main 上有 42 个提交不在快照里（实质功能仍是 #264 的 7 个提交，其余 35 个是 #261 / #267 / #275 的 skill 同步、#272 / #273 / #268 / #271 的公开文档与 README 改写、#276 的测试清理、#278 的 PR lint，以及 #279 / #287 的 SOP 候选稿与执行清单，不进 skill），快照自身不带 main 之外的提交（`gh api repos/good-night-oppie/MontClip/compare/de6640df...7e793990a9ca`）。
- MontClip-Cindy 上一轮实质增量：#20（合并提交 `e859bdef`）把导出中途停止的提示定稿为「导出到一半停了，这次没导完。原片没有改动，可以再导一次：点〔重试〕」，见 `main.js` 第 135–136 行；#35（合并提交 `db03b4ee`）接上主播自选、带 libx264 的 FFmpeg 仅用于 H.264 导出，`node/worker.cjs` 第 88–92 行只在安全的设置路径上设置 `MONTCLIP_EXTERNAL_FFMPEG_SETTINGS`，`node/lib.cjs` 第 312–350 行定义插件设置目录、真实路径与 DATA 隔离检查；没有选择界面、不新增工具、引擎锁不变。`docs/decisions/ADR-005-plugin-external-ffmpeg.md` 第 22–44 行明确无文件时行为不变、Windows 尚未做端到端导出实测。上一轮 #7（状态卡「听写」行）、#9（后台导出 job）、#22（无硬链接时回退复制）继续有效。插件版本 0.5.1、引擎锁 `5b312e63` 均未变。
- MontClip-Cindy 此前一轮实质增量：#23（合并提交 `68a27cde`）在 `embed/panel-model.js` 的 `CHANNEL_NAMES` 给其余关键帧通道中文名和单位，未知字段显示「其他属性」；#25（合并提交 `8a9a44c8`）在 `main-view-model.js` 的 `taskOpenResult` 要求同 session 且 `focusRequested:true` 才算已请求切换，缺字段是未确认、失败是没成功，`main-view.js` 显示对应定稿文案；#24（合并提交 `91fed559`）在 `node/worker.cjs` 用 `cindy-export-results.json` 留最近 200 个完成结果，引擎 404 时可找回，查询 / 取消 / 交付 / 打开所选文件夹先查 session，不符报 `EXPORT_TASK_MISMATCH`，`main.js` 对 `NO_JOB` 给定稿提示和〔打开导出文件夹〕，重载后的完成结果仍是 `exported`、`copied:null`，不冒充 `done`。
- MontClip-Cindy 本轮实质增量：#8（合并提交 `2732eae4`）听写引擎和模型首次使用时下载——确认框与按钮定稿文案在 `main.js` 的 `ASR_TEXT`（第 112–148 行：「要把说的话转成文字，先要下载听写程序和中文听写模型，共约 N MB，只下这一次。」「从哪下：GitHub 上 MontClip 的发布页…」「只下载这些文件，不会发出你的录像、字幕或项目。下载完会逐个核对，对不上就不装。」，按钮〔下载〕/〔先不下〕，大小只出现在第一行）；文件清单、字节数与 SHA-256 钉在 `node/asr-runtime.json`（release `asr-runtime-2.0.1-montclip1`，含 sherpa-onnx 2.0.1、silero VAD、Paraformer 中文模型，各带许可与出处）；下载只进数据目录 `asr/` 和 `asr-models/`（`node/asr-install.cjs`），先核对字节再核 SHA-256，解压拒绝绝对路径、`..`、链接与特殊文件（用系统绝对路径的 tar，不回退 PATH），整套装不上就全清掉。**但开关默认关闭**：`asr-download.json` 的 `enabled:false`，正式包不显示〔下载听写程序和模型…〕按钮、不注册 `montclip_install_asr`，源码直接跑也是关的；打开前提（主人核文件、国内网络实测、真实 Cindy 里点下载跑通）都未完成，见 `docs/validation/2026-11-07-asr-download-gate.md`。ASR 错误细节不进 Agent 结果（`9d6bb6f8`），状态卡「听写」行的状态判断不变。插件版本 0.5.1 和引擎锁 `5b312e63` 均未变。

**工具名和参数**：都在 `mcp-tools.js`（main），按行号：

| 工具 | 行号 | 工具 | 行号 |
|---|---|---|---|
| `fablecut_patch_project` | 27 | `fablecut_audio_track` | 206 |
| `fablecut_frame` | 58 | `fablecut_songs` | 219 |
| `fablecut_import_media` | 91 | `fablecut_transcribe` | 231 |
| `fablecut_normalize_audio` | 112 | `fablecut_captions` | 253 |
| `fablecut_auto_duck` | 126 | `fablecut_denoise` | 281 |
| `fablecut_silence` | 143 | `fablecut_repair_media` | 294 |
| `fablecut_beats` | 160 | `fablecut_versions` | 327 |
| `fablecut_reframe` | 176 | `fablecut_export` | 358 |
| `fablecut_highlights` | 191 | `fablecut_track` | 401 |
| `fablecut_lyrics` | 441 | `fablecut_danmaku` | 429 |
| `fablecut_lyrics_apply` | 457 |  |  |

- 多音轨选择（#177，合并提交 `982b1312`）：`mcp-tools.js` 第 206–216 行是 `fablecut_audio_track` 的原文参数与约束；`mcp-server.js` 的 `audioTrackTool` 实现列表、`listen` 每轨 6 秒、0 起编号、一次撤销和重跑分析，`audioWindow` 的分析 / 导出分轨保证导出仍读 track 0。`media-lib.js` 的 `audioTrackOf` 默认 0；`app.js` 第 3414、3518–3600 行是右键〔选音轨…〕、逐条〔试听〕和换轨，`ui-preferences.js` 第 428–448 行是「主播的声音在哪条轨」「第 {n} 轨」「试听」等界面原文。多音轨 MP4 保留全部轨道；技能里只写主播确认后才换轨。
- 找歌没达标的说法（0.12 / 0.38，门槛 0.6）出自 `mcp-tools.js` 里 `fablecut_songs` 的描述，以及 `auto-slices.js` 的 `SONG_GATE` / `SONG_MEASURED`。
- 隐私覆盖做法（#202，合并提交 `ecb2afde`）：`CLAUDE.md` Masks 的不透明覆盖块说明，以及 `dev/reference/privacy-cover.md` 的本仓合成逐帧验证。旧版调节层模糊、模糊副本与追踪配方已撤回作为隐私推荐；模糊滑块上限不代表安全阈值。本轮保留 main 的撤回结论，没有恢复 #163 / #186 的未合并做法。
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
- Reframe 末帧（#176，合并提交 `8545430d52e2`）：`reframe.js` 第 20、125–136 行（每秒 5 帧加 `sampleTimes` 的最后一帧）；编辑器、桌面助手和 MCP 共用，`CLAUDE.md` Reframe 一节第 2204–2225 行（第 2211 行讲末帧，第 2222 行讲重新执行会替换它自己写的关键帧）；「老项目不会自动重新计算」的原话来源是 PR #176 正文。
- 显示尺寸（#159，合并提交 `df2811d23991`）：`media-lib.js` 第 29–30、184–196、223–235 行（`width` / `height` 是显示尺寸，`storedWidth` / `storedHeight` 记录不同的原始尺寸）；界面文案 `ui-preferences.js` 第 763 行。
- 找回录像（#137，合并提交 `8eaad3ce84d3`；#193，合并提交 `1b6054a13543`）：按钮和导出提醒在 `ui-preferences.js` 第 96–116 行，「找回录像」18 处文案在第 120–148 行；自动接回只接受同名同大小且唯一的候选，见 `media-lib.js` 第 491–497 行 `autoRelinkPick` 和 `app.js` 第 3338–3348 行。
- 「AI 数据说明」v3（#170，合并提交 `412f36c45cf1`）：`desktop/agent-data-notice.js` 第 8–9 行 `NOTICE_VERSION = 3`；「只是数字、不是录音、声音本身不发」在 `ui-preferences.js` 第 1193、1222 行。
- ProRes 项目末尾声音（#190，合并提交 `d74716a8548e`）：范围、48 kHz 采样边界、自定义映射与拒绝条件见 `docs/decisions/2026-11-05-prores-project-end.md` 第 11–33 行；界面拒绝文案在 `ui-preferences.js` 第 802 行 `export-profile-unsupported`。
- 桌面助手确认卡（#120，合并提交 `993ecb6f120d`）：`agent-approval.js` 第 1–68 行把卡绑在对应回复或计划上，等待时挡住后续步骤与发送，只接受这张卡的合法选择；离开聊天、项目变化或更新的卡都按「不同意」结束。`agent-ui/HostCard.tsx` 第 27–51 行不让批准按钮自动拿焦点，Esc 明确拒绝；`agent-ui/pane.tsx` 的 `approvalWaiting` 与发送按钮禁用逻辑在 main 上可核对。「只批准这次」「这个聊天中都批准」「不同意」和「等你决定」见 `ui-preferences.js` 第 865–874、1284 行。
- 没有 H.264 编码器时先拒绝（#125，合并提交 `2ffad9642efb`）：`app.js` 第 20226–20259 行的 `exportH264Refusal` 在 `noteExportBgRemove`、`renderAudioMix` 之前运行；第 11685–11713 行在「自动出切片」确认页禁用〔导出〕并防止返回后旧请求继续；第 20523–20529 行把等待中的 H.264 队列项标失败。服务端 `server.js` 第 453–456、502–504、636–638 行的 `noH264Error` 也拒绝。定稿提示「这台电脑上找不到 MontClip 能用的视频编码器…可以先更新显卡驱动再试」在 `ui-preferences.js` 第 67 行。
- 桌面版「在文件夹里显示」（#138，合并提交 `aedb7eaa6020`）：导出队列完成项按钮在 `app.js` 第 20493 行，素材右键在第 3025 行；中文原文「在文件夹里显示」「文件不在，先重新链接」「文件已经不在了」「只在桌面版里能用」在 `ui-preferences.js` 第 177–182 行。`desktop/main.js` 第 80–111 行只允许工作区文件或本次应用会话里登记过的保存位置，并调用 `shell.showItemInFolder`；页面拿不到绝对路径。

**上一轮新增证据（以下行号以 MontClip main `6bcb72ff` 为准）**：
- FLV 断点导入（#130，合并提交 `f7359f06`）：`mcp-tools.js` 第 91–96 行列出 `acceptReadable` / `fixGaps` / `allowTranscode`；`flv-readable-range.js` 第 9–19 行确定 `BIG_GAP=0.5`、`MAX_DRIFT=0.04`，小断点只标记，漂移只报告。`prepare-media.js` 第 69–81 行说明复制画面、补连续 AAC、必要时重编码，以及时长 0.1 秒、声画 40 ms 的验收；第 196–206 行不合格报 `FLV_FIX_UNVERIFIED`，损坏报 `FLV_SOURCE_DAMAGED`。〔帮我转〕〔先不转〕在 `ui-preferences.js` 第 1242 行，确认交互在 `app.js` 第 2392–2398 行。工具描述里的旧「1 s」字样没有采用，skill 按最终实现与测试锁定的 0.1 秒写。
- Agent 歌词对齐（#164，合并提交 `ae79848d`）：`mcp-tools.js` 第 428–453 行是 `fablecut_lyrics` 和 `fablecut_lyrics_apply` 的原文参数与两步约束；`lyrics-track.js` 第 19–44 行是 0.2、至少 2 行（单行除外）及 `OK` / `TOO_FEW` 判定。〔放到时间线上〕〔先不用〕在 `ui-preferences.js` 第 578–580 行。`docs/decisions/2026-11-05-lyrics-align-agent-tool.md` 第 11–26 行规定本机对齐、每次确认、新字幕轨、灰行和一次撤销，第 28–51 行明确门槛只测过模拟听写、真实人声未测，第 61–86 行是歌词出处、少量引用、不认歌和素材授权边界，第 94–102 行说明歌词卡保留独立确认框。
- 白话报错与脱敏问题信息（#129，合并提交 `cbbd3f61`）：`app.js` 第 76–90 行实现〔复制问题信息〕，第 11941–11948、20748、20821–20827 行实现导出条数、〔重试这条〕和失败后的复制入口；`problem-redact.js` 第 26–47 行覆盖观众昵称 / uid、密钥 / 令牌与用户目录；按钮和「复制的内容不含你的文件夹路径、密钥和观众信息」在 `ui-preferences.js` 第 1313–1340 行。
- 旧项目单耳询问与成片检查（#183，合并提交 `f61d5368`）：`app.js` 第 1824–1855 行是〔改成两边都有〕〔不用〕、项目内 `monoPanReviewed` 和一次撤销；第 20293–20322 行是手动 pan 不报与警告后保留文件。`delivery.js` 第 621–632、687–692 行锁定 >20 dB、较响侧 >−60 dB、至少 2 秒和 `AUDIO_ONE_SIDED`；`server.js` 第 563–566、580–588 行直接测成片声道。`mcp-server.js` 第 1631–1633 行的 `fablecut_status` 警告要求只有用户提出时才改 pan。界面原文在 `ui-preferences.js` 第 204–220 行。
- 「Yolo」改名「全自动」（#213，合并提交 `fcaeb715`）：`ui-preferences.js` 第 905、936、1478–1483 行的主播可见文字为「全自动」/ Full auto。内部标识仍可叫 yolo，但 skill 不向主播使用内部词。

**本轮新增证据（以下行号以 MontClip main `77ec40f2` 为准）**：
- 整片黑屏 / 无声与非零时间戳（#161，合并提交 `f050a842`）：`export-check.js` 第 6–24 行锁定 8 个时刻、16×9 灰度、`BLACK=40`、`SOURCE_LIT=60`、`QUIET_DB=-50`，第 73–107 行只有成片异常而对应源素材正常时才判 picture / sound 丢失并给 `EXPORT_BLANK_*`；`ui-preferences.js` 第 920–929 行是三种定稿提示与〔复制问题信息〕。非零时间戳的声画定位修复见 `app.js`、`export-jobs.js`、`server.js` 和 `test/export-start-time.test.js`。skill 明确它只是整片抽样兜底，不代替逐帧和整听。
- 自动找 FFmpeg（#146，合并提交 `550a3bc9`）：`ffmpeg-path.js` 第 4–25 行规定内置 → PATH → 用户选择，以及有内置版时外部程序只编码 H.264；第 70–77 行锁定无内置版时 ≥6.0 与响度 / 找歌滤镜实测门槛，第 43–62 行禁止启动服务器可写目录里的程序。`ffmpeg-card.js` 第 15–48 行是「重新检测」「选择 ffmpeg.exe」「我装在别处了，手动选择」「FFmpeg 放在哪（完整路径）」等原文，第 128–139 行区分简单 / 高级模式以及非 H.264 格式。没有自动下载。
- 后台任务失联与排队（#132，合并提交 `77ec40f2`）：`export-jobs.js` 第 16–27 行是 5 秒心跳、隐藏 / 断开窗口 20 秒、无头或身份未知窗口 120 秒；第 96–116 行只回收符合这些条件的任务且保留可见连接窗口，第 158–163 行的 `JOB_BUSY` 回复带 `busy` 和精确取消调用，不自动转无头重跑。`mcp-server.js` 的 `waitJob` 处理调用方取消、进程退出和超时；定稿中文在 `ui-preferences.js` 第 387–391 行。
- Cindy 嵌入界面（#219，合并提交 `b6b49529`；#221，合并提交 `22fc8c47`；#222，合并提交 `37f84afc`）：`host-embed.js` 只认 `?host=cindy` 和 light / dark，主题消息同时核对 parent source 与 origin；`style.css` 跟随宿主主题。#221 在 `app.js`、`desktop/main.js`、`desktop/view-preload.js` 禁止嵌入页内置助手读取密钥 / 声音或发请求，`agent-approval.js` 的兜底直接 deny；`ui-preferences.js` 的 `own.ap-embedded-declined` 是定稿提示，歌词卡不受影响。#222 在 `app.js` 用现有 8000 ms 常量让该提示停留 8 秒、悬停不消失。没有 Cindy 实窗端到端验收，skill 不写成已实测。
- 歌词边界仍以 main #205 为准：配方 A 只收主播提供的歌词，明确「不要自己去网上找歌词填」。本轮没有恢复此前撤回的在线查找写法。

**本轮新增证据（以下行号以 MontClip main `4e70d888` 为准）**：
- 无头导出逐帧对齐（#224，合并提交 `b3177098`，PR #227）：`b4621632` 把硬定位的目标点改成帧内 1 ms，毫秒取整的 WebM / MKV 帧不会再被当成前一帧；`29de5903` 让导出画元素实际持有的那一帧、按时间戳核对，不按回调报的名字。用户不可见的正确性修复，只进「插件版落后提醒」。
- 导出前逐段核对声音（#231，合并提交 `e39628f1`，MC-14 / MC-15 / MC-11）：`export-check.js` 的 `soundPeak` 里读不出（ffmpeg 失败、超时或没解出声音）返回 null，永远不算无声；`cleanPlan` 的 silent 计划带 `{n, t}`，单独的声音（音乐、配音）n 为 null。`server.js` 在 `blankCheck` 判出 `EXPORT_AUDIO_FAILED` 时删掉输出文件、不交付；`withQuiet` 把「片段在文件里本来无声」写成报告里的 `EXPORT_CLIP_SILENT` 警告。JJ 定稿文案在 `ui-preferences.js` 的 `export-audio-failed`（「第 {n} 段（时间线 {time} 处）的声音没读出来，这次导出已停下，没有生成文件。原片没有改动。」）、`export-audio-failed-track`（「时间线 {time} 处的声音没读出来…」）、`export-clip-silent` / `-track` 与 `err-export-page-crashed`（「导出时出了意外…可以直接重新导出…」）。`export-jobs.js` 给无头浏览器退出和失联任务标 `EXPORT_PAGE_CRASHED`；Linux 下导出页进程的 `oom_score_adj` 那行已删（见下条 #238 说明）。MC-11：`mcp-server.js` 的 `speechWords` 对时长未知的文件也只听写片段窗口，不再整段跑。
- CI 与测试基建（#233、#235、#236）：测试任务加超时、Windows 挂死修复、ASR 下载 ADR 把 a/b/c 实跑移到打开开关的 PR——纯流程与测试，不进 skill 正文。

**本轮新增证据（以下行号以 MontClip main `38f77fcc` 为准）**：
- #231 后续：核对超时改警告、profile 导出带提醒、失败任务记代码（#238，合并提交 `c8386fb9`，含 `df53a03d` / `d060a728` / `2c43528f` / `93361c3f` / `72699643`；#245 补端到端分支测试，合并提交 `38f77fcc`）：`export-check.js` 的 `soundRead` 把「读超时」单独报（`timedOut`），超时不再算读不出或无声——核对读某段文件超过默认 20 秒（`TIMEOUT_MS`，碎片化的长 MP4 冷盘开文件就要二十几秒）时文件保留，报告里加 `EXPORT_CLIP_UNCHECKED` 警告；`withQuiet` / `warningReport` 让「文件里本来无声」和「没来得及核对」都成为报告里的警告，profile 导出（无 delivery 报告）也通过 `end.report` 带上这些警告，`app.js` 的 `fastExport` 把警告写进任务结果 / 保存提示。`export-jobs.js` 的 `report()` 把失败页带的原因代码（`EXPORT_AUDIO_FAILED`、`EXPORT_NO_H264` 等）存进任务记录，`mcp-server.js` 的 `describeExportJob` 在失败时输出 `code`。`export-jobs.js` 里 Linux 下给导出页设 `oom_score_adj 1000` 的那行被删（`d060a728`：europa 上 Chrome 启动时按进程类型自己设 0/200/300，1000 撑不到一秒，和 main 一样；skill 不再引用这行）。
- JJ 定稿文案（#238，按 main `38f77fcc` 的 `ui-preferences.js` 第 243–246、1453、1483–1485、1523–1524 行）：`export-clip-unchecked` / `-track`（「第 {n} 段（时间线 {time} 处）在成片里没有声音，软件没能确认原片是不是也没有。成片已经导出，请先自己听一下这一段，再决定要不要发。」）；`WHAT_TEXT` 的状态行是「有一段在成片里没有声音，没能确认原片是不是也没有。成片已经导出。」，「复制问题信息」也复制这行。
- `MONTCLIP_EXPORT_CHECK_TIMEOUT_MS`（仅测试，`CLAUDE.md` 第 220–226 行、`server.js` 第 689–694 行）缩短单段核对读盘的限时，代替慢盘；默认 20000 ms。这是测试钩子，不是 skill 的操作项。

**本轮新增证据（以下行号以 MontClip main `de6640df` 为准）**：
- 嵌入任务绑定与导出作用域（#215 E3 / E5a / E5b；合并 PR #249 `648d0885`、#251 `0524c96a`、#260 `de6640df`）：`embed.js` 第 32 行 `TASK_TICKET_MS = 60_000`、第 89–98 行 `taskTicket` 由 worker 用 `{project, session}` 注册一次性 ticket、第 100–108 行 `redeemTask` 用过即作废；`host-embed.js` 第 48–62 行把 ticket 从地址取出后连同 SSE `conn` 一起 `POST /api/embed/claim` 绑定。`embed.js` 第 111–114 行 `channelFor({project, session})` 用引擎启动时生成的 32 字节 `channelKey` 做 HMAC-SHA256 取前 32 hex 作为 BroadcastChannel 后缀，第 115–118 行面板用 ticket 换 channel。`export-jobs.js` 第 106–113 行：job 绑 `{project, session}`，开着另一个项目时任务以 `EXPORT_PROJECT_CHANGED` 失败；只有自己任务绑定的连接才能接。`tool-error.js` 第 41–43 行把 `ticket=` / `token=` 的值脱掉，第 66–67 行处理 `ticket` / `token` / `channel` 单独成 key 的情形（`ticket` / `token` 来自 #255 的修复 PR #256，`channel` 来自 #260）。`EXPORT_PROJECT_CHANGED` 在 `app.js` 第 21672 行只有英文 "The export project changed."，引擎和界面没有这两个 code 的中文白话句，skill 让 Agent 用 JJ 给的通用句。
- 缺 FFmpeg 时的 remedy（#259，E4，合并提交 `3d085774`）：`ffmpeg-path.js` 第 180 行 `MONTCLIP_FFMPEG_REMEDY` 缺省值「Reinstall MontClip to restore it.」，第 183–188 行把它拼进「找不到捆绑 ffmpeg/ffprobe」的报错。设这个变量的只有 Cindy 插件：MontClip-Cindy `node/worker.cjs` 第 121 行，值是「In Cindy, install it from the MontClip editor tab's banner, or ask the chat to run montclip_install_ffmpeg.」；Windows 桌面版不设，用缺省句。skill 的口径按 JJ 在 #261 / MontClip-Cindy#51 的意见：照实转意思、英文转白话中文；只针对这一条不另教主播去网上找 ffmpeg，引擎在别处叫主播选 FFmpeg（如 x264）时照引擎的话说（MontClip-Cindy#35、#46 允许主播指定带 libx264 的 FFmpeg）。
- 仅测试与文档：#254（ASR checkpoint 同步）、#258（embed 403 不被误读为 project id，#257）、`docs/decisions/2026-11-08-embed-task-binding.md`、`docs/demo/*` 同步、CHANGELOG / README，不进 skill 正文。

**上一轮新增证据（以下行号以 MontClip main `fc7f2c9035d6` 为准）**：
- MontClip #268（公开文档 #272 / #273）：README、站点与中英文 i18n 把「录像不会上传 / Recordings are not uploaded」改成「录像默认在本机处理；联网只发生在你自己打开的功能里，发之前先给你看 / Your recordings are processed on your computer by default. Going online only happens inside features you turn on yourself, and you see what will be sent before it goes out.」。这是公开措辞收紧，AI 发送确认与「附上唱歌段和音量」开关的既有约定不变，不进 SKILL 正文。

**本轮 MontClip 新增证据（对照 main `7e793990a9ca`）**：
- README 首屏重写（#268 的后续，合并提交 `43c2a551`，含 `2cdd1310` / `1b9ac0f5` / `dbf9246a` / `c1c4d3ea` / `9f926394` / `e976dad1` / `9dee024f`）：`README.md` 与 `docs/i18n/README.zh-CN.md` 改成先讲能做什么、再讲从源码跑；README 原来的技术部分原样搬进新的 `docs/technical-reference.md`（内容未改，只换位置，第 1–40 行）。首屏把「逐句保留 / 导出 SRT 字幕 / 可选 AI 助手」标成「仍在核实」，并写明「现在能用的就是导入和导出 MP4」。这是公开措辞，代码能力、按钮和工具都没变，操作步骤照旧，不进 SKILL 正文；但这三项也别对主播说成「已验收」。
- SOP v4 修订候选稿（#279，合并提交 `91fa1888`，含 `26bcdc56` / `ec4c810c`）只往 `docs/decisions/` 加一份流程候选稿；执行前的检查与证据清单（#287，合并提交 `7e793990`，含 `c75b180f`）只往 `reference/`（后由 #296 改名为 `dev/reference/`）加一份清单。两者都不改剪辑器、工具和界面，不进 SKILL 正文。

**上一轮 MontClip 新增证据（对照 main `fb1311758be7`）**：
- #276（合并提交 `4e50c768`）只新增和接入无头浏览器测试进程清理，`test/browser-procs.js`、`test/browser-procs.test.js`、`test/browser-contrast.js`、`test/embed-task-browser.test.js` 均属测试基建，不进 SKILL 正文。
- #278（合并提交 `fb131175`）只改 `scripts/pr-sop/*` 与对应 workflow，让 PR 首行接受「<伙伴名> 请审」，不改剪辑器、工具或界面，不进 SKILL 正文。
- #275 是本任务上一轮 skill 同步，不算实质增量。

**上一轮 MontClip 新增证据（以下行号以 MontClip main `197de675` 为准）**：
- Fast 导出放后台（#264，合并提交 `197de675`，含 `dbae3415` / `0cfea4d3` / `69e622d0` / `342c4622` / `133c0081` / `25015bdf`）：新文件 `bg-export.js`——第 16–20 行 `ENGINES` 只有 `fast` 可后台（`webcodecs` / `realtime` 不行），第 24–33 行 `blocker`（打开复合片段 `COMP_OPEN`、用 AI 抠像 `BG_REMOVE`、隐藏页起不来 `NO_WORKER` 时留在当前窗口），第 40–46 行 `snapshot` 是时间线的深拷贝。`app.js` 第 21588–21695 行是装配：隐藏 iframe `?exportWorker=<id>`、顶栏按钮变「导出中 {pct}%」/「准备导出…」、进导出队列、〔收起，接着剪〕关窗（Esc / 点窗外同效）；第 21698–21725 行 `finishBgExport`：完成时若时间线又改过，用 `own.bg-export-version-changed`（「这个文件是你 {time} 点「导出」时的样子，之后的改动不在里面。想带上新改动，请再导出一次。」），取消说「导出已取消，没有留下文件。」。JJ 定稿文案在 `ui-terms.js` 第 293–297 行（`engine-fast-note` 与三种 `-here`）和 `ui-preferences.js` 第 231–240 行（`bg-keep-editing` 〔收起，接着剪〕、`bg-progress-note`、`bg-export-btn`、`bg-export-preparing`、`bg-export-busy`、`bg-export-cancelled`、`bg-export-done`、`bg-export-version-changed`）。桌面端 `desktop/main.js` 只允许编辑器 frame 自己的 origin。测试：`test/bg-export.test.js`、`desktop/background-export-smoke.cjs`（真实输入事件，离屏 Electron）。一次只跑一个后台导出（`bg-export.js` 第 76–140 行 `createController`）。
- 同步 PR：#261 是本任务上一轮 skill 同步，不算实质增量。

**本轮 MontClip 新增证据（对照 main `5892189534d6`）**：
- 仓库目录整理（#296，合并提交 `58921895`，含 `3155e116` / `b25fc8a7` / `c79d9566` / `b260415c` / `33fb699f`）：`3155e116` 把 `real-tests/` 改到 `dev/real-tests/`、`reference/` 改到 `dev/reference/`（`git show origin/main:dev/reference/privacy-cover.md` 可读出迁移后的那份），`b25fc8a7` 同步根目录 `app.js` / `auto-slices.js` 注释里的路径。剪辑器、工具、按钮、参数和默认值都没变，SKILL 正文只跟着改了一处证据路径（见文中 §4 打码里的 `dev/reference/privacy-cover.md`，main 已在 `3155e116` 里改好，本轮核对一致）。
- 提交身份检查与 PR SOP 路径表（#292，合并提交 `445b2531`，含 `a943a327` / `9e6ae119` / `53368f86`；#281 的 `#296` 分支里 `33fb699f` / `b260415c` 补 `ci-check` 身份门禁与浅克隆兼容）：只改 `scripts/pr-sop/*`、`.github/workflows/pr-sop.yml`、`.github/scripts/ci-check.js` 和对应测试，属协作流程，不进 SKILL 正文。
- 本轮自己的 skill 同步 PR 不算增量。

**本轮 MontClip-Cindy 新增证据（以下行号以 MontClip-Cindy main `8af4d0cdb918` 为准）**：
- worker 日志与崩溃输出脱敏（#63，合并提交 `8af4d0cd`，代码提交 `7e9257d4` / `b29862da`）：`node/worker.cjs` 第 24–37 行把 `console.log` / `info` / `debug` / `warn` / `error` 全部改走引擎自带的 `problem-redact.js`（`redactProblem`，参数带家目录、平台、用户名），加载不到脱敏函数时只写固定事件 `log-redaction-unavailable` 加 `LOG_REDACTION_UNAVAILABLE`，不写原文；第 96–103 行 `note` 先序列化再脱敏、再确认还是合法 JSON 才写，失败写 `LOG_REDACTION_FAILED`；第 105–124 行接管 `uncaughtException` / `unhandledRejection`，写一条脱敏后的 note 再退出（最多等 1 秒）。不新增文件日志，不改工具、按钮、错误码，也不改对主播说的话。
- 验收边界：`docs/validation/2026-11-10-stderr-privacy-41.md` 记的是合成测试和打包 worker 的测试（按该文件「QQ 预审修订」节的合入态：新增日志测试 8 项、既有票据测试 2 项共 10/10 通过，`npm test` 163 项里 157 通过、2 失败、4 跳过，两个失败是既有布局测试），Win11 真实 Cindy 实跑还没做，不能把这条当成实跑验收。
- #64 是本任务上一轮 skill 同步，不算功能增量。插件版本 0.5.1 和引擎锁 `de6640df` 未变。

**上一轮 MontClip-Cindy 新增证据（以下行号以 MontClip-Cindy main `3b9c2b9efb2e` 为准）**：
- 剪辑器未打开的诊断原因（#62，合并提交 `257f25ef`）：`node/lib.cjs` 第 132–163 行 `createEditorTrace()` 只在内存中按 session 记录 ticket 发放计数、最后时间和引擎拒绝计数 / 短 code，不记 ticket 内容、路径或报错原文；`node/worker.cjs` 第 152、393–401 行在发放 / 拒绝时计数并暴露 `montclip/editor-trace`。`main.js` 第 751–756 行是 `NO_TICKET_REQUESTED` / `TICKET_ISSUED_NOT_BOUND` / `TICKET_REFUSED_BY_ENGINE` 三种 `why` 的英文事实说明，第 786–790 行只在 `montclip_status` 读不到已打开剪辑器时附上；这是只读诊断，不改变打开、连接或项目切换行为。
- 剪辑器没打开时的下一步（#68，合并提交 `1152ee43`）：`main.js` 第 758–770 行 `EDITOR_CLOSED` 和 `withEditorHint()` 给出 JJ 定稿中文「剪辑器现在没打开，撤销、预览、定位这些暂时用不了。请在电脑上的 Cindy 窗口里点开这个任务，剪辑器就会连上。剪的时候先别切到别的任务，切走它会断开。」及对应英文；`tools` 单独给 Agent 两条工具指引，不混进对主播的话。第 786–790 行给 `montclip_status`，第 819–821 行给 `montclip_undo` / `montclip_redo` / `montclip_seek` 的 `NO_EDITOR` 回复附上 `note` / `sayToStreamer` / `tools`，原错误码不变；第 653–655、668–672 行把中文定稿和〔在这个任务里打开剪辑器〕按钮放进状态卡。代码注释明确不承诺「片子和记录没丢」。
- #70（合并提交 `3b9c2b9e`）只改 PR lint，#64 是本任务上一轮 skill 同步，均不算功能增量。插件版本 0.5.1 和引擎锁 `de6640df` 未变。

**上一轮 MontClip-Cindy 新增证据（以下行号以 MontClip-Cindy main `d4af73fb` 为准）**：
- 长工具不占住任务操作队列（#42，合并提交 `24d294c5`；后续补一句 `86e428b3` 清理）：`node/worker.cjs` `dispatch` 第 398 行认定四个长工具（`fablecut_transcribe` / `fablecut_captions` / `fablecut_songs` / `fablecut_highlights`），第 415 行提交时强设 `wait_ms:0`，第 419–429 行提交 / 绑定只占任务队列，等待和取回结果在队列外跑；`montclip_status`、撤销、切项目不会被听写等长任务堵住。`test/long-task.test.cjs` 红先验绑定顺序、绿后同 key 字幕只有 1 revision。
- 项目切换后当前任务跟随（#43，合并提交 `d4af73fb`）：`node/lib.cjs` `binder.projects` 第 90–127 行——只认 `new` / `open` / `duplicate`；`open` 的目标项目被别的任务占用时报 `PROJECT_TASK_CONFLICT`（第 94–95 行）；`new` 默认切换（`open !== false`）、`duplicate` 默认不切换（第 97 行）；成功且会切换时把引擎返回的项目 id 写进 `sessions.json`（第 105–109 行），第 111–112 行回执明说「This task now uses this project. Re-read it before editing.」；绑定写失败回滚引擎 active（第 116–122 行，报 `PROJECT_SWITCH_FAILED` / `PROJECT_ROLLBACK_FAILED`）。`node/worker.cjs` `taskProjects` 第 157–169 行把带 session 的 projects 调用转给 task 命名空间的 `tool-tasks`（scope = [session, 'projects']），同 `idempotency_key` 重试 / 事后查 `taskId` 都取回原回执、不会把项目再切一遍。`test/project-switch-43.test.cjs` 锁 new / duplicate / open 成功后的任务绑定、下一条 `fablecut_get_project` 和目标项目一致，`open:false` / duplicate 不切换时保持原绑定。
- 边界：已开的编辑器页签跟不跟着换是 #56 / #2；#43 分两半——任务绑定跟随早在 `d4af73fb` 就合了，页签重绑这一半在 PR #73（`1964bc35`）才合，且只解决了「这个任务自己切项目成功后重绑」，没在真实 Cindy 窗口验收。`main.js` 的 `montclip_open_task_view` 回执只表示已请求切换（#25），所以 skill 不写「编辑器已经切过去」。（旧注里「PR #62 还开着没合并」已过期，`obs-56-editor-ticket` 早已合并。）
- 切项目后任务页签的剪辑器重绑（#43 的页签那一半，PR #73，合并提交 `1964bc35`）：`node/lib.cjs` 第 113 行只在切换成功且任务映射也写成功时附带瞬时 `projectSwitched`（回滚和 `open:false` 都返回）；`node/worker.cjs` 第 203–215 行只把原来的文字存成持久回执，标志只来自本次执行（历史 `taskId` / `idempotency_key` 重放不重新通知），第 443 行让每次 ticket 一并带回 worker 实际绑定的 `project`；`main.js` 第 815–818 行向宿主发 `{type:'task-project-switched', session, project}`（不带 ticket、token、路径），并把 `projectSwitched` 从工具回执里摘掉；`frame.js` 第 102–142 行按放置序号与「已放置项目 / 在途项目」比较后重新放置，`dropFrame()` 在第 103–107 行作废在途 ticket，第 149–156 行的重连要票只认同一个项目，第 180–183 行只认同一会话的通知，文稿面板（panel）不响应。引擎 gitlink 与 `engine-lock.json` 保持 `de6640df`。`test/project-editor-rebind.test.cjs` 在 1964bc35 上共 13 项（#73 PR 正文报 13/13 通过；7/7 是初版旧数）；`docs/issue43-mechanism2.md` 写明 undo 应答由测试端模拟，证明连接和命令路由，**不证明真实 UI 撤销了时间线**，且当时未安装未部署。所以 skill 只记「仓库 main 有了、没实窗验收、0.5.1 没有」。
- 取不到 ticket 的 15 秒截止与失败文案（PR #73，合并提交 `1964bc35`，代码提交 `176bfbfe` / `73c91874` / `375fd0f7` / `4dd8bd77` / `fbdacf71`）：`frame.js` 第 77–80 行给 `editor-ticket` 加 15 秒截止，超时回 `{error:'Ticket request timed out.', code:'TASK_TICKET_TIMEOUT'}`；第 119–126 行失败时只给 JJ 定的头一句「MontClip 没能连接这个任务的剪辑器。」——第 121–124 行调 `failureText` 只为取脱敏后的 `f.problem`，然后直接 `show(head, true, false, f.problem)`，不显示 `failureText` 拼的「关掉这个页签再打开试试」那半句（第 120 行注释：关掉带未保存编辑的页签没有核实过安全）；`failureText`（第 8–15 行）本身没改、没有新参数，其他场景照旧；保留〔复制问题信息〕按钮（脱敏后复制）；第 160–176 行项目绑定失败先 `dropFrame()` 再显示错误并聚焦状态区（这一支路会丢 400 ms 内未落盘的改动，MontClip-Cindy#76 判为 #73 引入的回归，#77 改为保留页面只显示头一句，待合入），只有 `DATA_DIR_IN_USE` 给〔重试〕；`frame.css` 第 5 行把 `#status` 抬起 `z-index: 2` 并用面板底色盖住旧画面。测试 `test/project-editor-rebind.test.cjs` 第 212、254、321 行对这句头一句做精确断言。
- 本轮其余 MontClip-Cindy 增量（`docs/validation/*`、`docs/ISSUE-43-INVESTIGATION.md`）是排查 / 验证记录，不进 SKILL 正文。

**上一轮 MontClip-Cindy 新增证据（以下行号以 MontClip-Cindy main `c4213f41` 为准）**：
- FFmpeg 报错白名单（#45，合并提交 `6d0f427d`；#41 先起）：`main.js` 第 74–95 行 `FFMPEG_ERRORS` 固定中英两套白话句（`DOWNLOAD_FAILED` / `INSTALL_FAILED` / `DISK_FULL` / `CANCELLED` / `UNSUPPORTED_PLATFORM` / `HOST_TOO_OLD` / `SIZE_MISMATCH` / `SHA256_MISMATCH` / `BAD_ARCHIVE`），第 97–100 行 `FFMPEG_CODE_ALIASES` 把 `ENOSPC` / `EDQUOT` 合进 `DISK_FULL`，`ffmpegSafeFailure` 把任何未列出的 code 都归到 `INSTALL_FAILED`，不再回传 ffmpeg 原始报错与本机路径。`ffmpeg-banner.js` 的 `TEXT`（zh/en）是 JJ 定稿原文，按钮 / 卡片语一并给 Agent 的卡片走这份。
- 「编码 MP4 的 FFmpeg 是哪一个」（#46，合并提交 `c4213f41`）：`main.js` 第 514–525 行 `h264Export()` 读 `node/lib.cjs` 给出来源：`bundled` / `settings` / `path` / `env` / 本机自带；卡片和 `montclip_status` / `montclip_export` 用「用 MontClip 下载的 ffmpeg」「设置文件里指定的 ffmpeg（版本 x.y）」「系统里找到的 ffmpeg（具体是哪一个，这里看不出来）」「启动时指定的 ffmpeg」「这台电脑自己的 ffmpeg（具体是哪一个，这里看不出来）」「现在查不到是哪个 ffmpeg」六种说法之一。第 538–539 行 `MP4_PLAIN` 是给 Agent 的措辞约束：只用大白话、只说到这条事实，不要再补来源、版本号、环境变量名或文件夹名。
- 卡片窄窗口任意换行（280 / 360 px）：`main-view.js`（或同名 view）给卡片值加 `min-width:0; overflow-wrap:anywhere`，仅是 UI 细节，不进 skill 正文。
- 同步 PR：#44、#47、#49、#51 是本任务前几轮 skill 同步，不算实质增量。

**上一轮 MontClip-Cindy 新增证据（以下行号以 MontClip-Cindy main `c403253f` 为准）**：
- 引擎推进与任务绑定（#48，合并提交 `ee46dfb4`）：`engine-lock.json` 第 3 行钉到 MontClip main `de6640df`（E1–E5 全在里面）；`docs/validation/2026-11-08-engine-pin-48-update.md` 记录两轮全绿 CI 后才推进、worker 的 `EXPORT_TASK_MISMATCH` 检查保留（契约测试 2/2），以及**未完成的真实 Cindy 验收**（真实浏览器双任务 A/B 隔离与一次有声导出）——skill 据此不把面板隔离说成已实测。`node/worker.cjs` 新增 `montclip/editor-ticket`（一次性 ticket 不进日志）；`frame.js` 第 108–130 行每次放置先取新 ticket、只回答来自引擎 origin 的 `montclip-need-ticket`；`embed/panel.js` 第 13–17 行没有 ticket 时不读项目、不显示行、不能 seek（JJ 定稿提示），第 45–51 行用 ticket 换 channel，没有 channel 就退回「编辑器没打开」，不再有跨任务的无作用域 UI 指令。
- 导出卡片修复（#48 同批）：`main.js` 第 533–536 行卡片更新至少隔 1.1 秒（Cindy 每秒只收一次卡片更新，过快的会静默丢弃，曾把失败卡在「正在导出 0%」）；导出完成卡片按内容估高、警告一行一条（`exportCardHeight`，VV 实测 280 / 360 px）；「导出没有完成」卡片也说引擎的 EXPORT_AUDIO_FAILED 定稿句。这些是插件外壳 UI 细节，只在这里记证据，不进 SKILL 正文。
- 切走时不承诺导出继续（#55，合并提交 `c403253f`；#53 是主人 2026-11-09 的方向记录）：`main.js` 的 `montclip_export` 提示不再说 "The export runs in the background"，改成让 Agent 如实说「导出要在这个任务的 MontClip 剪辑器页签里做完，请先别关掉它；切走的话我没法保证不会中断。」（JJ 在 #55 定稿）；「切走后会不会变慢/停止」的说法标为未核实。`ghost.json` 的 `montclip_export` 描述同步去掉 background 说法。插件版本 0.5.1 未变，引擎锁为 `de6640df`（见上条 #48）。
**上一轮新增证据（以下行号以 MontClip main `ccb789f2` 为准）**：
- 长工具的等待、取回与幂等重试（#240，合并提交 `ccb789f2`，MC-04 / MC-08 / MC-12）：`mcp-tools.js` 第 470–474 行给每个工具加 `idempotency_key`，并给 `fablecut_transcribe` / `fablecut_captions` / `fablecut_songs` / `fablecut_highlights` 加 `wait_ms`（0–15000，默认 6000）与 `taskId`；`mcp-server.js` 第 81–82 行创建 `tool-tasks` 并列出这四个长工具，第 1633–1637 行把带这些参数的调用交给持久回执。`tool-tasks.js`：回执写在 `analysis/tool-tasks/`，完成要落盘后才报完成；回执写不进去报 `TASK_RECEIPT_SAVE_FAILED` 且不重放改动；中断的任务标 `interrupted`，不会自动重复；同一把 `idempotency_key` 加同样参数返回原结果，换新钥匙才是新改动。`CLAUDE.md` 第 91 行是同一份约定的 Agent 手册原文。
- 听写逐段存盘与「没听完」提示（#240）：`asr-local.js` 第 159、184 行的 `onCheckpoint` 在每段听完后先存盘再听下一段；`mcp-server.js` 第 859–864 行超时时停掉听写任务，`saved` 只给相对数据根的路径（`analysis/transcripts/…`），`asr-status.js` 第 95–98 行的 `incompleteText` 拼「没听完。已完成段落已保存到 …」；没有完成段落时说「尚无已完成段落。完成段落保存位置：analysis/transcripts/。」`CLAUDE.md` 第 93 行写明 `timeout` 会停任务而 `wait_ms` 只限等待，两者不是一回事。
- 工具报错统一脱敏（#240）：新文件 `tool-error.js` 是唯一边界——给工具的报错、警告和回执先脱掉本机绝对路径；旧回执（含成功回执里的警告）先在本机改写干净再返回，不重跑改动；数据根以外的路径字段省略或留空。`asr-status.js` 的 `hidePaths` 正则重写（带空格的 Windows 目录、UNC、`file:` URL，重复脱敏结果不变），`mcp-server.js` 各处 `publicError(...)` 均走这条边界。
- 仅测试与文档：本轮其余改动是测试（`test/tool-tasks.test.js`、`test/asr-*-privacy.test.js` 等）、CHANGELOG 与 README 说明，不进 skill 正文。

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
| 「帮我转」「先不转」 | `flvConvert` / `flvNotNow`，第 1242 行 |
| 「放到时间线上」「先不用」 | `lt-place` / `lt-not-now`，第 578–579 行 |
| 「复制问题信息」「重试这条」 | `btnCopyProblem` / `btnRetryThis`，第 1337–1338 行 |
| 「改成两边都有」「不用」 | `mono-left-centre` / `mono-left-keep` / `export-one-sided-fix`，第 204–213 行 |
| 「全自动」 | `ap-yolo-on`、`pl-plan-mode`、`officialPane_modeYolo`，第 905、936、1478–1483 行 |
| 「主播的声音在哪条轨」「选音轨…」「试听」「第 {n} 轨」 | `at-title`、`at-menu`、`at-listen`、`at-track`，第 428–448 行 |
| 「重新检测」「选择 ffmpeg.exe」「我装在别处了，手动选择」 | `ffmpeg-card.js` 的 `detect`、`chooseWin`、`chooseLinux`，第 15–48 行 |
| 「FFmpeg 放在哪（完整路径）」「用这个」 | `ffmpeg-card.js` 的 `pathLabel`、`pathUse`，第 46–47 行 |
| 「这一步没有做，什么都没改。在 Cindy 里用 AI，请直接在 Cindy 的对话里说你想做什么。」 | `own.ap-embedded-declined`，第 965 行 |
| 「帮我修好」 | `repair-button` / `repair-menu` / `repair-done` / `media-slow-mark` / `media-duration-unknown`，第 322–334 行 |
| 「导出画面」 | `ef-title`，第 1036 行 |
| 「找回录像」「找到它…」「先找回来…」「照样导出」 | `rl-title`、`off-find-it`、`off-find-first`、`off-export-anyway`，第 96–148 行 |
| 「导出时出了意外，这次导出已停下，没有生成文件。原片没有改动。」 | `err-export-page-crashed`（#231 定稿） |
| 「第 {n} 段（时间线 {time} 处）在成片里没有声音，软件没能确认原片是不是也没有。成片已经导出，请先自己听一下这一段，再决定要不要发。」 | `export-clip-unchecked` / `-track`（#238 定稿，main `38f77fcc` 第 243–246 行） |
| 「收起，接着剪」「导出中 {pct}%」「准备导出…」「正在取消…」 | `bg-keep-editing` / `bg-export-btn` / `bg-export-preparing` / `bg-export-cancelling`，`ui-preferences.js` 第 231–237 行（#264） |
| 「导出已取消，没有留下文件。」「导出完成：{file}。」「导出完成：{file}。这个文件是你 {time} 点「导出」时的样子，之后的改动不在里面。想带上新改动，请再导出一次。」 | `bg-export-cancelled` / `bg-export-done` / `bg-export-version-changed`，`ui-preferences.js` 第 238–240 行（#264） |
| 「用 FFmpeg 导出，每一帧都准。开始以后可以把进度收起来，接着剪，导出会继续做。成片是你点「导出」那一刻的样子，之后的改动不会进这个文件。」 | `term.engine-fast-note`，`ui-terms.js` 第 293 行（#264 JJ 定稿） |
| 「这次没法一边导出一边剪（打开着复合片段，或用了 AI 抠像）。导出期间请别关掉 MontClip，等它做完再接着剪。」 | `term.engine-fast-note-here` / `-comp` / `-cutout` / `-unavailable`，`ui-terms.js` 第 294–297 行（#264 JJ 定稿） |
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
- 上一轮新增收进（MontClip `aba1d4c8..aedb7eaa`）：#120（助手确认卡放进消息流）、#125（H.264 编码器预检）、#138（桌面版「在文件夹里显示」）。
- 上一轮新增收进（MontClip `aedb7eaa..6bcb72ff`）：#130（FLV 小断点直接导入、大断点同意后转换及 0.1 秒 / 40 ms 验收）、#202（撤回不安全隐私模糊配方，保留不透明遮挡与逐帧检查）、#213（界面改名「全自动」）、#164（`fablecut_lyrics` / `fablecut_lyrics_apply` 两步歌词对齐，移出「即将可用」）、#129（白话报错、导出条数、脱敏问题信息）、#183（旧项目单耳询问、成片单耳检查）。#163、#133 已关闭且未合并。
- 本轮新增收进（MontClip `77ec40f2..4e70d888`）：#224 / #227（无头导出逐帧对齐，仅进落后提醒）、#231（导出前逐段核对声音、读不出停下并点名、时长未知文件只听写片段窗口、页面崩溃定稿文案）。#233（CI 超时）、#235（Windows 测试清理）、#236（ASR ADR）、#237（SOP v3.1 决策记录）是测试 / 流程 / 文档，不进 skill；#232 和 MontClip-Cindy #40 是本任务上一轮 skill 同步，不算实质增量。
- 本轮新增收进（MontClip `4e70d888..38f77fcc`）：#238 / #245 的 #231 后续——核对读盘超时（默认 20 秒）改警告并保留文件（`EXPORT_CLIP_UNCHECKED`）、profile 导出把「本来无声 / 没来得及核对」的警告带在 `end.report`、`export-jobs.js` 的失败任务记录原因代码、JJ 定稿的核对超时文案、Linux 下导出页 `oom_score_adj 1000` 那行删除（Chrome 自己按进程类型设，和 main 一样）。
- 上一轮新增收进（MontClip `38f77fcc..ccb789f2`）：#240（MC-04/08/12）——四个长工具的 `wait_ms` / `taskId` / `idempotency_key`、中断任务标 `interrupted` 不重放、听写逐段存盘与「没听完」提示、工具报错与警告统一脱敏（`tool-error.js`）。纯测试、CHANGELOG / README 说明不收。
- 本轮新增收进（MontClip `ccb789f2..de6640df`）：#249 / #251 / #260（#215 的 E5a / E5b / E3，嵌入编辑器 ticket 绑定到 SSE 连接、导出按 `{project, session}` 作用域、面板用 HMAC 派生的 BroadcastChannel 只跟自己任务的 editor 通信）、#259（E4，`MONTCLIP_FFMPEG_REMEDY` 缺省「Reinstall MontClip to restore it.」）、#256（#255，错误里 `ticket` / `token` 单独成 key 的值脱敏；`channel` 的脱敏在 #260）、#258（#257，测试把项目 id 里的「403」当成拒绝访问的偶发失败，只改测试，不进 skill 口径）。#254（ASR checkpoint 同步测试）、docs/decisions 与 docs/demo 同步、CHANGELOG / README 不进 skill。
- 本轮新增收进（MontClip `de6640df..197de675`）：#264（Fast 导出放后台：隐藏页渲染点「导出」那一刻的时间线拷贝、〔收起，接着剪〕、顶栏「导出中 {pct}%」、复合片段 / AI 抠像 / 隐藏页不可用时留在当前窗口、一次一个、取消不留文件）。#261 是本任务上一轮 skill 同步，不算实质增量。
- 上一轮 MontClip 增量（`197de675..fc7f2c90`）：#268（公开文档 #272 / #273 把「录像不会上传」改成「默认在本机处理；联网只在你自己打开的功能里，发前给你看」）——公开措辞收紧，不进 SKILL 正文；#267 是本任务上一轮 skill 同步，不算实质增量。
- 上一轮 MontClip 增量（`fc7f2c90..fb131175`）：#276（无头浏览器测试清理）与 #278（PR lint）都不是剪辑功能，不进 SKILL 正文；#275 是本任务上一轮 skill 同步，不算实质增量。
- 本轮 MontClip 增量（`fb131175..7e793990`）：#271（README 首屏重写、技术部分搬到 `docs/technical-reference.md`，并把逐句保留 / SRT 字幕 / AI 助手标成「仍在核实」）、#279（SOP 候选稿）、#287（执行检查与证据清单）都只是文档，不进 SKILL 正文。
- 仍开放且改到 `skills/` 的非本任务 PR：本轮 `gh pr list` 没有发现（MontClip 开着 #298、#288、#284、#280，都不改 `skills/`；MontClip-Cindy 开着 #77、#75，都不改 `skills/`）。#186 已于 2026-11-07 CLOSED 未合并，其撤回的模糊配方不会写回 skill；安全遮挡段落以 main #202 为准。
- MontClip-Cindy 上一轮实质增量（`c403253f..d4af73fb`）：#42（四个长工具的提交只占任务操作队列，等待 / 取回结果在队列外跑，`montclip_status`、撤销、切项目不会被听写堵）、#60（`fablecut_projects` new / open / duplicate 成功后当前任务绑定切到目标项目，引擎回执明说 This task now uses this project；占用冲突 `PROJECT_TASK_CONFLICT` 拒，绑定写失败回滚报 `PROJECT_SWITCH_FAILED` / `PROJECT_ROLLBACK_FAILED`；同 `idempotency_key` 重试 / 查 `taskId` 取回原回执不会再切）。当时 #62 尚未合并，所以已开的编辑器页签不能凭插件回执说成已切换。
- MontClip-Cindy 上一轮实质增量（`d4af73fb..3b9c2b9e`）：#62（`montclip_status` 在未打开时报告 ticket 发放 / 绑定 / 拒绝三类诊断原因，只读计数，不改打开或切换行为）、#68（`montclip_status` / 撤销 / 重做 / 定位在未打开时给 JJ 定稿的下一步提示，状态卡显示同一句话与打开按钮，不补「没丢」保证）。#70 只改 PR lint，#64 是本任务上一轮 skill 同步。
- MontClip-Cindy 本轮实质增量（`3b9c2b9e..8af4d0cd`）：#63（worker 的 console / note / 致命错误统一走引擎的脱敏函数，缺脱敏函数或脱敏失败只写固定事件与错误码，不加文件日志，不改工具与对主播的话）。#70 只改 PR lint。仓库 main 现为 `8af4d0cd`，插件版本 0.5.1 未变，引擎锁 `de6640df`。
- MontClip-Cindy 本轮实质增量（`323cf9ef..1964bc35`）：#43 的页签那一半 / PR #73（切项目成功后任务页签的剪辑器按新 ticket 重绑、每张 ticket 带上 worker 实际绑定的项目、取不到 ticket 的 15 秒截止和定稿失败句、绑定失败先撤掉旧剪辑器——这一条是 #76 记的回归，#77 在改）。`33f0ac7` / `63e9fca` / `6ce2657` / `e64abcf` 只恢复 LF 行尾，#74 是本任务上一轮 skill 同步，都不算实质增量。main 现为 `1964bc35`，插件版本仍 0.5.1，引擎锁 `de6640df`。
- 本轮 MontClip 增量（`58921895..2534c58b`）：只有 #297 这个本任务上一轮 skill 同步的合并，没有实质新提交；#298（阶段1 把 40 个服务端文件搬进 `server/`）、#288、#284、#280 都还开着、也都不改 `skills/`。`de6640df..2534c58b` 的非合并提交数为 41。

用 `gh api repos/good-night-oppie/<repo>/compare/<旧>...main` 读增量，并用 `gh pr list` / `gh pr view` 核对合并与开放 PR，时间 2026-11-12。
