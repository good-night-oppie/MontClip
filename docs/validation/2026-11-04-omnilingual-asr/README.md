# Meta Omnilingual ASR 能不能作为可选听写引擎（2026-11-04）

主人原话：「其他那些 SenseVoice / Paraformer 不用动，加入 Meta 对应的开源模型，如果能找得到匹配的模型」。
这份是第一步的评估。现有听写一点没动：默认还是 Paraformer zh；SenseVoice gated4 按 #122 的 ADR 作为可选，也没动。

## 结论

- **接，但只作为「多语言 / 英文」的可选项，不推荐给中文主播。默认不变，也不迁移任何现有模型。**
- 接的是 **Omnilingual ASR CTC 300M int8**（`csukuangfj/sherpa-onnx-omnilingual-asr-1600-languages-300M-ctc-int8-2025-11-12`，提交 6abf1ece…）。理由见第 2、4 节：
  - 中文明显比 Paraformer 差：FLEURS 只算汉字的字错率 300M 13.88%、1B 9.15%，Paraformer 3.33%。所以不推荐给中文主播，界面上也这么写。
  - 1B 比 300M 准一些，但模型 1 GB（300M 是 350 MB），在 europa 上慢约 4 倍，内存更多，中文仍是 Paraformer 的约 3 倍错字。{{EN_1B_NOTE}}
- 时间戳：CTC 逐字给时间，和 Paraformer 在同一批 VAD 段上对得上（中位差 0.04 秒，97% 在 150 毫秒以内），符合「一个汉字一个词」的规则（第 3 节）。
- 一个必须处理的坑：这个 CTC 模型读「VAD 切得很紧、前后没有静音」的段很差。产品里每段前后各补 0.5 秒静音再识别，时间再减回去（第 3 节）。
- 不需要升级引擎：现有的 `sherpa-onnx-node@2.0.1` 已经带 `omnilingual` 配置（第 1 节）。

## 本机开放权重推理 ≠ 云端 API

- 这里说的全是**在主播自己电脑上跑开放权重**：模型文件下载到本机，由随包的 sherpa-onnx 引擎在本机推理，录像的声音不出这台电脑。
- 这和 Meta 的云端 Model API 是两回事。这次没有用它，也**不假设** Meta Model API 托管了 Omnilingual ASR，**不假设**它兼容 OpenAI API。
- SeamlessM4T 是非商业许可（CC BY-NC 4.0），不用。

## 1. Node 绑定里有没有 omnilingual

- 有。`sherpa-onnx-node@2.0.1` 的 `types.js` 里有 `OfflineOmnilingualAsrCtcModelConfig {model}`，`modelConfig.omnilingual` 就是它；
  `sherpa-onnx-linux-x64@2.0.1` 的原生库里有 `offline-omnilingual-asr-ctc-model.cc` 等符号。europa（Linux）和 Win11（`vendor/asr` 里的 win-x64 2.0.1）都实际跑通了。
- **不用升级**，所以现有 Paraformer 和 VAD 不受影响。现有的听写测试照常通过（第 7 节）。
- 用法：`modelConfig: { omnilingual: { model: "model.int8.onnx" }, tokens: "tokens.txt", numThreads: 4 }`，和 Paraformer 一样用 `decodeAsync`。
- 输出：一个字符一个 token，小写，没有标点，词与词之间是一个空格 token，每个 token 有开始时间。
- 不到 400 个采样点（25 毫秒）的音频返回空结果，不抛错；纯静音返回空。CTC 没有语言提示：1 秒的英语开头曾被写成阿拉伯字母（`آسكنا`），整句就正常。

## 2. 准确率

europa（Xeon 8259CL，4 物理核 / 8 超线程，共享机器，测试时 loadavg 13–25），全部 4 线程，`sherpa-onnx-node@2.0.1`，Node 18.20.4。

- **FLEURS**（人工转写，CC BY 4.0）：
  - 中文 cmn_hans_cn test：和 RESULT.md 同一批 100 条（按 test.tsv 顺序取前 100 条原文不含阿拉伯数字的），归一化同 RESULT.md（NFKC、小写、去标点空白）。「仅汉字」一列两边都只留汉字再算，更能代表中文。
  - 英文 en_us test：同样的取法，100 条，2083 个词。词错率 = 词级编辑距离 / 参考词数，归一化：NFKC、小写、标点换成空格。数字写法不做归一（所以选了不含数字的句子）。
  - 每条整句识别（不过 VAD），前后有录音自带的静音。
- **主播开发集**：RESULT.md 里那三段（GC06 480–1080 歌回、GC14 500–1100 恐怖、GC11 1280–1880 杂谈），只在 europa 上。
  - 按 ADR #122 第 5 节，GC06 整场只做开发集，GC11 1280–1880、GC14 500–1100 不进听写测试集，所以这三段都在开发集这边。**这次没有碰任何测试集。**
  - 没有人工标准答案。「伪标准」= RESULT.md 里另外 5 个模型（FireRedASR2-AED、FireRedASR2-CTC、Fun-ASR-Nano fp16、Qwen3-ASR、SenseVoice）的投票（同一个 ROVER 写法），**既不含 Paraformer 也不含 Omnilingual**，所以两边用的是同一把尺子。**伪标准，非人工校对。**
  - 用 RESULT.md 的同一批 VAD 段。Omnilingual 的「补静音」一列是每段前后各补 0.5 秒静音（产品就这么做，第 3 节）。

| 模型 | FLEURS 中文 字错率（全部字符） | FLEURS 中文 字错率（仅汉字） | FLEURS 英文 词错率 | 歌回 差异率 | 恐怖 差异率 | 杂谈 差异率 |
|---|---|---|---|---|---|---|
| Paraformer zh（默认） | {{P_CMN_ALL}} | {{P_CMN_HZ}} | {{P_EN}} | {{P_GH}} | {{P_KB}} | {{P_ZT}} |
| Omnilingual CTC 300M int8 | 20.33% | 13.88% | 17.95% | 50.0%（补静音 48.6%） | 26.3%（补静音 27.4%） | 16.5%（补静音 16.9%） |
| Omnilingual CTC 1B int8 | 15.66% | 9.15% | {{O1_EN}} | {{O1_GH}} | {{O1_KB}} | {{O1_ZT}} |
{{V2_ROWS}}

- 中文：300M 的汉字错误是 Paraformer 的约 4 倍，1B 约 3 倍。主播开发集上也一样，差距更大。**不推荐给中文主播。**
- 补静音对真实直播的中文几乎没影响（±1.4 个百分点内），但对干净的合成语音是决定性的（第 3 节）。

## 3. 时间戳

- CTC 逐 token 给开始时间。三段开发集里，有字的段 288/288 都有逐字时间（补静音后）。
- 和 Paraformer 比（同一批 VAD 段，两边写成同一个字的 3868 对，按最长公共子序列配对）：时间差中位数 0.04 秒，90 分位 0.08 秒，97.0% 在 150 毫秒以内，平均偏差 +0.005 秒（不补静音时 3899 对：0.04 / 0.08 / 96.85% / −0.002）。Paraformer 的时间不是真值，这只说明两边一致。
- 对得上 MontClip 的规则（`asr-optional-words.js`）：汉字（和假名）一个字一个词；其他文字把字母拼回到空格为止的整词。词的结束时间和 Paraformer 一样：到下一个词开始，最多比最后一个字晚 0.5 秒，不超过段尾。`FableCutTranscribe.join`（现在叫 `MontClipTranscribe`）读出来汉字之间不加空格，英文词之间加空格。所以**不需要强制对齐**。
- **补静音**：VAD 切得很紧时，这个模型会丢很多字。europa 上用 flite（ffmpeg lavfi）合成的一句英语：
  - 整个文件识别：`the quick brown fox jumps over the lasy dog please calls telling and ask her to bring these things with her from the store`
  - 只送 VAD 切出来的那段：`ron fo jumps ove the lae dg pes ca tn and ask he to brig the hin wt he om the o`
  - 同一段前后各补 0.5 秒静音：`quick brown fox jumps over the laesy dog please calls telling and ask her to bring these things with her from the store`（开头的 the 是 VAD 自己切掉的）
  - 所以产品里每段前后各补 0.5 秒静音（`asr-optional-run.js` 的 `PAD`），时间减回去。补 0.25 秒、1.0 秒的对比：{{PAD_SWEEP}}
  - 代价：每段多算 1 秒静音。

## 4. 长音频（2 小时级，走产品自己的路径）

都走 `asr-optional-engine.js`：子进程里 ffmpeg → silero VAD（一段最长 20 秒）→ 补静音 → Omnilingual。线程数 4。内存峰值是子进程自己的（`process.resourceUsage().maxRSS`）；服务进程那边另记。

| 机器 | 素材 | 引擎 | 用时 | RTF（按录像长） | RTF（按语音长） | 内存峰值 | 段数 | 结果 |
|---|---|---|---|---|---|---|---|---|
| Win11，i7-11800H，安静 | 2 小时合成英语（Windows 自带 TTS 的 36.5 秒循环，见下） | Omnilingual 300M | 1247 秒 | 0.173 | 0.211 | 子进程 702 MB，服务进程 59 MB | 1381 | complete，0 个没听写出的段 |
| 同上 | 同上 | Paraformer（默认，`asr-local.js`，同一进程） | 259 秒 | 0.036 | 0.044 | 494 MB | 1381 | complete，0 段（第一次跑报 `ASR_READ_FAILED`、ffmpeg 没给出错信息，第二次正常；原因没查清） |
| europa，共享机器，loadavg {{LA}} | 2 小时直播（GC06 整场 4797 秒 + 前 2403 秒，开发集，只在 europa） | Omnilingual 300M | {{L_O_WALL}} | {{L_O_RTF}} | {{L_O_RTFS}} | {{L_O_MEM}} | {{L_O_SEG}} | {{L_O_ST}} |
| 同上 | 同上 | Paraformer | {{L_P_WALL}} | {{L_P_RTF}} | {{L_P_RTFS}} | {{L_P_MEM}} | {{L_P_SEG}} | {{L_P_ST}} |

- 1B 没跑 2 小时：europa 上它在 FLEURS 上 4 线程 RTF 约 1.5（300M 约 0.4），2 小时要跑 3 小时以上，没跑。**没测。**
- Meta 官方说 1B 推理约需 3 GiB 显存，条件是 A100、BF16、30 秒音频、batch 1。这里是 CPU 上的 int8，不能拿那个数当承诺；本机实测见上表。
- 声音是边读边送的，2 小时的录像不会整个进内存（内存峰值和 10 分钟的差不多）。

## 5. 故障隔离

- 可选引擎每次听写**在自己的子进程里跑**（`asr-optional-engine.js` fork `asr-optional-run.js`），不在服务进程里。
- 模型文件**缺了或被改过**：sha256 / 大小对不上，就不算「装好」，根本不加载；听写回到默认引擎（测试：`test/asr-optional.test.js`、`test/asr-optional-engine.test.js`）。
- 模型**坏了**（文件能读但不是模型）：引擎在子进程里报 `Failed to create offline recognizer`，变成 `ASR_OPTIONAL_MODEL_BROKEN`，白话提示。真引擎实测：Win11 Node 22 和 **Electron 45 的 utilityProcess**（打包版的服务就跑在这里）里都是这样，同一个 utilityProcess（pid 1196）紧接着用好模型听写成功（`electron-utility.cjs`）。
- **子进程崩溃 / 被杀 / 内存不够死掉**：`ASR_OPTIONAL_CRASHED`，白话提示「默认引擎不受影响」，服务进程照常应答（测试里用 `process.abort()`、`exit(137)`、32 MB 堆上限造的内存耗尽）。
- **内存不够**：开始前看空闲内存，小于模型实测需要的（manifest 的 `ramMB`）就不启动，白话提示要多少、还剩多少（`ASR_OPTIONAL_NO_MEMORY`）。
- 取消：杀掉子进程。

## 6. 许可证

- Meta 官方仓库 github.com/facebookresearch/omnilingual-asr：「Omnilingual ASR code and models are released under the Apache 2.0.」
- 模型卡 huggingface.co/facebook/omniASR-CTC-1B：「License: apache-2.0」，并写明 Apache-2.0 适用于模型和代码。
- 转换后的 ONNX 仓库（k2-fsa 的 csukuangfj / csukuangfj2）：模型卡**没有** `license:` 字段；仓库里的 `LICENSE` 文件（581 字节，sha256 a70a523b…）写的是「Copyright 2025 (c) Meta Platforms, Inc. and affiliates. Licensed under the Apache License, Version 2.0」。四个仓库（300M、1B、两个 v2）的这个文件逐字节相同。
- MontClip 把这个 `LICENSE` 逐字节放在 `licenses/asr/omnilingual-asr-LICENSE.txt`（同意框里显示的就是它），Apache 2.0 全文在 `licenses/asr/omnilingual-asr-Apache-2.0.txt`；它也作为模型文件之一一起下载、按 sha256 核对。
- 来源：sherpa-onnx 官方文档 k2-fsa.github.io/sherpa/onnx/omnilingual-asr/ 列出了 300M int8 这个包。
- `LICENSES.md` 已加草稿一节。

## 7. 测试

- Win11（i7-11800H，Node 22.15.1）：{{WIN_TESTS}}
- Linux（europa，Node 18.20.4，系统 ffmpeg 5.1，引擎和模型从 `~/asr-bench`）：{{LINUX_TESTS}}

## 复现

europa，`~/asr-bench/omni/`：

```bash
bash models/dl.sh                        # 300M、1B、1B v2 int8，固定提交，从 huggingface.co
bash scripts/dl2.sh                      # 300M v2 int8（只有 GitHub release 压缩包，先核对整包 sha256），FLEURS en_us test
python3 -I data/mk_en.py                 # data/fleurs_en100.json
bash scripts/run_omni.sh; bash scripts/run_omni3.sh   # node scripts/bench_omni.js <model> 4 data/<set>.json out/<model>[_padX]__<set>.json
bash scripts/run_pad.sh                  # 补静音 0.5 / 0.25 / 1.0 秒
python3 -I scripts/score.py              # out/score.json
bash scripts/run_long.sh                 # 2 小时，产品路径：mc/docs/validation/2026-11-04-omnilingual-asr/rtf.cjs
```

本机（Windows，素材是合成的，不涉及主播）：

```bash
node docs/validation/2026-11-04-omnilingual-asr/fetch-model.cjs <目录>        # 用 MontClip 自己的下载代码，不写同意记录
MONTCLIP_TEST_OMNI_DIR=<目录>/optional/omnilingual-ctc-300m-int8 node --test test/asr-optional-engine.test.js
node docs/validation/2026-11-04-omnilingual-asr/rtf.cjs <2 小时文件> optional <模型目录> 4
node docs/validation/2026-11-04-omnilingual-asr/rtf.cjs <2 小时文件> default vendor/asr 4
<electron 45> docs/validation/2026-11-04-omnilingual-asr/electron-utility.cjs <模型目录> <音频> crash
```

2 小时合成文件：Windows 自带 TTS（System.Speech）念 7 句英语（36.5 秒），`ffmpeg -stream_loop -1 -t 7200 -ac 1 -ar 16000 -c:a aac -b:a 64k`。

## 文件 sha256

{{SHA}}

## 没测的

- 国内网络能不能从 hf-mirror.com 下载：没测（在美国出口的机器上，hf-mirror 会跳到 huggingface.co 和 us.aws.cdn.hf.co，三个都在白名单里，实测下载、核对都通过）。国内跳到别的 CDN 域名的话，那个源会失败，主播可以换另一个站。
- 1B 的 2 小时长音频：没测。v2 的主播开发集：没测。
- 男声、说唱、伴奏很响的英语：没测。英语只测了 FLEURS（朗读）和合成语音。
- 带标点：这个引擎不出标点，CT-Transformer 标点模型没接到它上面，没测。
- 打包后的安装包里实际点一遍「选用 → 同意 → 选站 → 下载 → 听写 → 撤销」：没跑（逻辑由单元测试覆盖，Electron utilityProcess 里的子进程单独跑通了）。
