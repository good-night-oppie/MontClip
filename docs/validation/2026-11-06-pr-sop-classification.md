# PR SOP 文件分类（待Deja核读）

范围仅按列出的路径模式；不宣称机器做了语义或安全审查。重命名前的路径也匹配。新增相关路径应同步更新规则和回归。

| 准确仓库 | 触发项 | 路径模式 |
|---|---|---|
| good-night-oppie/MontClip | 音画同步 | `export*.js`、`render*.js`、`compositor*.js`、`clip*.js`、`timeline*.js`、`trim*.js`、`segment-edits.js`、`sequences.js`、`reframe.js`、`ffmpeg*.js`、`media*.js`、`desktop/ffmpeg*.js`、`desktop/repair*.js`、`desktop/desktop-export*.js`、`server.js`、`audio*.js`、`auto-slices.js`、`range-plan.js`、`retime.js`、`silence.js`、`desktop/*export*`、`desktop/*ffmpeg*`、`desktop/*repair*`、`desktop/*flv*`、`plugins/montclip-cindy/node/**`、`plugins/montclip-cindy/embed/*.js`、`plugins/montclip-cindy/main*.js`、`plugins/montclip-cindy/frame*.js`、`plugins/montclip-cindy/build.cjs` |
| good-night-oppie/MontClip | 外发三项 | `agent-conversation.js`、`agent-facts.js`、`agent-policy.js`、`external-limits.js`、`import-url*.js`、`transcribe.js`、`desktop/agent*.js`、`desktop/asr*.js`、`desktop/asr*.json`、`desktop/*download*.js`、`desktop/*fetch*.cjs`、`desktop/main.js`、`scripts/pr-sop/run.mjs`、`.github/workflows/pr-sop.yml`、`server.js`、`desktop/*consent*`、`plugins/montclip-cindy/node/**`、`plugins/montclip-cindy/main.js`、`plugins/montclip-cindy/build.cjs` |
| good-night-oppie/MontClip-Cindy | 音画同步 | `node/lib.cjs`、`node/worker.cjs`、`embed/panel*.js`、`main.js`、`frame.js`、`build.cjs`、`engine` |
| good-night-oppie/MontClip-Cindy | 外发三项 | `node/lib.cjs`、`node/worker.cjs`、`main.js`、`build.cjs`、`ffmpeg-banner.js`、`scripts/pr-sop/run.mjs`、`.github/workflows/pr-sop.yml`、`engine` |

旧plugins/montclip-cindy路径仅覆盖尚未关闭的迁移PR，不表示在那里继续开发。检查器run和workflow本身调用GitHub API，因此列在外发类；不上传主播素材。分类核读不修改任何人的现有PR。

审查人历史review沿用现有督查标准：GoodNightOppie提交review后从requested reviewers移除仍算送审，不能当正式批准。已向Deja请求确认这一口径。
