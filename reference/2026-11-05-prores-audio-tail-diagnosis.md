# ProRes 尾音：有界合成对照诊断，未修产品

按 Deja 指定与草稿交互分开。运行基于 `4ec654335113185c8648b020adc2670494527d13` 加本次诊断脚本；实际 runner hash 在 receipt。`encoding-profiles.json`、服务和混音产品代码均未改。此前 loop06 已记录自己创建的 browser/server 全部退出，55制品已归档并校验哈希；不启动旧服务、不删除原证据。本轮独立 `out/audio-tail-01` 亦记录两个进程均退出。

## 结论与限制

在本机 FFmpeg 9.0.1 gyan.dev full、Windows、30fps CFR、12秒 ProRes/PCM 条件下，**相同实际帧流和混音 WAV，仅切换 `-shortest` 即改变尾包是否保留**。原源音最后100ms为1000Hz提示音，前面静音；不是补静音掩盖缺失。

| 对象 | 视频 | 音频样本/声道（48kHz） | 末尾提示音 |
|---|---|---:|---|
| 程序源音 | 源视频360帧，30fps | 576000（12秒） | 到样本575999 |
| 浏览器混音后、上传到服务的 WAV | 实际输送360帧 | 576001 | 到样本575999，额外末样本静音 |
| 实际 MontClip 导出 | 360帧，12秒 | 573440（11.946667秒） | 截在样本573439 |
| 捕获流重放，有 `-shortest` | 360帧，12秒 | 573440 | 与实际导出 PCM 哈希一致 |
| 同输入重放，无 `-shortest` | 360帧，12秒 | 576001 | 与完整混音 PCM 逐字节一致 |

原音少2560样本=53.333ms；相对混音少2561样本，其中最后一个是既有混音器额外样本。两份重放输出都是混音PCM的完全相同前缀，不能将带 `-shortest` 的短前缀称作全长保留。混音含全尾音；实际上传和帧输送完整；不是浏览器少渲染一帧，也不是MOV先收到完整PCM包后仅隐藏其尾部。

额外同输入成对 `-debug_ts -loglevel verbose` 日志：带 `-shortest` 时音频 demux/read/decode 为141包/576001样本，末包PTS573440、duration2561，`filter_raw`也出现PTS573440；编码输出仅140包/573440样本，muxer收到140包。无该参数时末2561样本正常进入编码器并提交muxer，141包均输出。因此目前定位于**FFmpeg音频过滤后、编码提交前的最短流截止路径**；没有调查FFmpeg内部源码，不声称跨版本/跨编码器的唯一根因或已确定内部算法。调试重跑的输出也重新解码，数字一致。

## 完整命令与边界

`audio-tail-pair-report.json` 保存实际spawn的完整参数数组（未省参数）；`actual-command.local.json` 在本机输出目录保留原始绝对路径。公开副本仅用 `<FFMPEG>`、`<MIX_WAV>`、`<OUTPUT>`替换本机路径，不带账号路径/令牌。对应命令：

```text
<FFMPEG> -y -hide_banner -thread_queue_size 64 -f image2pipe -framerate 30 -c:v mjpeg -i - -i <MIX_WAV> -vf scale=in_range=full:in_color_matrix=bt601:out_range=tv:out_color_matrix=bt709,setparams=color_primaries=bt709:color_trc=bt709 -c:v prores_ks -profile:v 3 -pix_fmt yuv422p10le -c:a pcm_s16le -shortest -colorspace bt709 -color_primaries bt709 -color_trc bt709 -color_range tv <OUTPUT>/simulated-internal-review.part.mov
```

原样保存stdin JPEG流30403460字节/56次写入，解码360帧。image2pipe输入 time_base=1/30，PTS 0..359；最后PTS=11.966667秒，末帧结束=12秒。输出视频 time_base=1/15360、duration_ts=184320（12秒）。不能把末帧起点当结束点。无丢帧记录；JPEG流本身无容器PTS，输入PTS由真实命令 `-framerate 30` 生成，不称VFR源PTS。源MP4逐帧PTS另归档。

重放保留全部编码/颜色/队列参数，用同一捕获WAV替代已清理的临时WAV路径，用同一捕获JPEG流喂stdin。两支之间只有 `-shortest` 和输出文件名不同；调试成对实验双方同加日志参数。没有替换为容器视频输入，也没有调整PCM包大小或补静音。

工具SHA256：FFmpeg `57c56e369d5b4873b4d93fc1a1d833cb7cd8bc9325c14b05c34ce60b22842d8a`；ffprobe `afe05347caaabe479b3c4eae71992b6ec1e11c57266a1d665deb0f9fe9847208`。完整版本/build选项、Chrome版本、素材/帧流/混音/输出hash见报告及receipt，非 bundled 构建。

## 复现与采集方式

```text
# MONTCLIP_FFMPEG / MONTCLIP_FFPROBE 指定本机工具；输出目录必须不存在
node real-tests/draft-existing-loop.cjs out/audio-tail-new --audio-tail-diagnostic
node real-tests/audio-tail-pair.cjs out/audio-tail-new
node real-tests/audio-tail-pair.cjs out/audio-tail-new --debug-ts
```

诊断模式只建立原画面+原声两个普通未链接片段，跑一次实际浏览器 `fastExport` 后退出，不进行草稿编辑验收。沿用私有profile/CDP管道、HOST127/PORT0和IPC归属。源MP4由本机FFmpeg程序生成，未绕过应用x264设置。

只在自己服务子进程预加载 `real-tests/audio-tail-capture.cjs`：匹配实际 ProRes image2pipe spawn（排除lavfi dry run），复制上传WAV，tee写入stdin字节；保持原write返回值和背压，不改命令/素材。同步观察写盘会改变时序，故另外用全量捕获字节一次喂入重放；两种输送节奏均重现同样缺失。诊断脚本不是运行依赖，不会被正常服务加载。

证据目录 `docs/validation/2026-11-05-audio-tail-diagnostic/`：完整参数、输入PTS、输出包/流元数据、两份完整调试日志、receipt、源PTS和11制品SHA256清单。原始JPEG流/WAV/MOV位于本机 `out/audio-tail-01`，体积较大未入git，各文件hash/字节数在local-media-manifest。旧失败checker和loop06/v2原结果均保留。

## 独立修复建议（待Deja/QQ，不在本轮实施）

优先在独立分支为这份“最后100ms有声”的复现建立失败回归，再验证基于明确项目结束时间/帧数的有限输出策略，避免依赖最短流调度提前截断PCM尾包。混音器额外一个样本也应按项目量化边界明确处理。无 `-shortest` 成对结果只证明候选方向，**不建议全局删除该参数**，不接受用补静音替代真实尾音。产品修复需同时考虑无限音源/异常输入的终止约束。

后续独立回归范围：CFR/VFR、短音频/长音频/无音频、最后音画边界；本轮只做上述CFR有声病例，没有扩成全套，也没有Linux/macOS、bundled构建或人工听感通过声明。

本轮脚本语法、隔离profile守卫2/2、diff检查及release-check全部通过；产品完整单元测试不因只读诊断重跑。应用x264准确错误（旧loop01）：“这个导出设置要用 x264，需要先在设置里选一个带 x264 的 FFmpeg。也可以改用导出预设，用显卡或 Windows 自带的编码器。”对应server `exportBinary` 的HTTP400 `extNeeded` 设置门槛，不证明当前二进制缺x264，也与ProRes尾包原因不同；没有绕过门槛。
