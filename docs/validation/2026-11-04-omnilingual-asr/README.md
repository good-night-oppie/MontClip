# Meta Omnilingual ASR：评估和 Windows 验收（#133，2026-11-04）

主人原话：「其他那些 SenseVoice / Paraformer 不用动，加入 Meta 对应的开源模型，如果能找得到匹配的模型」。

#133 把 Meta 的 Omnilingual ASR（CTC 300M int8，k2-fsa 转的 ONNX）接成了可选的第二个听写模型。这份文档补两样：

1. 第一步的评估：准不准、快不快，时间戳、长音频、故障、许可证。主要在 europa 上做。
2. Deja 要求的 Windows 验收。**europa 的数字不能顶替 Windows 的**，所以两边分开写。

默认没变：Paraformer zh 还是默认。SenseVoice（#122）这个分支上没有代码。

## 结论

- **可以接，但只适合英文和其他语言，不推荐给中文主播。**
  - 普通话：FLEURS 只算汉字的字错率，300M 是 13.88%，Paraformer 是 3.33%，大约 4 倍。主播开发集（伪标准）也一样，差距更大。
  - 英文：FLEURS 词错率，300M 是 17.95%，Paraformer 是 20.64%，只好一点；1B 是 11.04%，明显好。
- 时间戳逐字给，和 Paraformer 对得上（中位差 0.03 秒，97% 在 150 毫秒以内），不需要强制对齐。
- 每段前后补静音是必须的。#133 补 0.25 秒，我测下来够用（第 3 节）。
- 不需要升级 sherpa-onnx：2.0.1 已经带 `omnilingual`。
- Meta 的模型现在在自己的子进程里跑（Deja 11-04 定的）：坏模型、崩溃、内存不够，都只让它失败，用白话提示，服务和 Paraformer 照常（第 5 节）。
- 中文标点模型只跑在以中文为主的 Meta 段上，英文结尾不会再多一个「。」。
- 还剩的问题写在第 9 节：路径超过 260 个字符（另外排期），Linux 上内存峰值偏高（原因没查）。

## 本机开放权重推理 ≠ 云端 API

- 这里说的全是**在主播自己电脑上跑开放权重**：模型文件下载到本机，由随包的 sherpa-onnx 在本机推理，声音不出这台电脑。
- 这和 Meta 的云端 Model API 是两回事。这次没用它，也**不假设** Meta Model API 托管了 Omnilingual ASR，**不假设**它兼容 OpenAI API。
- SeamlessM4T 是非商业许可（CC BY-NC 4.0），不用。

## 1. Node 绑定

- `sherpa-onnx-node@2.0.1` 有 `OfflineOmnilingualAsrCtcModelConfig {model}`（`types.js`），用法是 `modelConfig.omnilingual`。
  Linux（europa，npm 包）和 Windows（`vendor/asr` 里的 win-x64 2.0.1）都实际跑通了。**没有升级。**
- 输出：一个字符一个 token，小写，没有标点，词与词之间是一个空格 token，每个 token 带开始时间。
- 不到 400 个采样点（25 毫秒）的音频返回空结果，不抛错；纯静音也返回空。
- CTC 没有语言提示：1 秒的英语开头曾被写成阿拉伯字母（`آسكنا`），整句就正常。

## 2. 准确率（europa）

- 机器：europa，Xeon 8259CL，4 物理核 / 8 超线程，是共享机器，测试时 loadavg 5–25。4 线程，`sherpa-onnx-node@2.0.1`，Node 18.20.4。
- **FLEURS**（人工转写，CC BY 4.0）：
  - 中文用 RESULT.md 那 100 条。英文 en_us test 用同样的取法：按 test.tsv 顺序，取前 100 条不含阿拉伯数字的，共 2083 个词。
  - 每条整句识别，不过 VAD。
  - 归一化：中文同 RESULT.md（NFKC、小写、去标点空白，「仅汉字」一列两边都只留汉字）；英文是 NFKC、小写、标点换成空格，再按词算。
- **主播开发集**：RESULT.md 那三段（GC06 480–1080 歌回、GC14 500–1100 恐怖、GC11 1280–1880 杂谈），只在 europa 上。
  - 按 ADR #122 第 5 节，这三段都在开发集这边。**没碰任何测试集。**
  - 没有人工答案。「伪标准」= RESULT.md 另外 5 个模型的投票（FireRedASR2-AED、FireRedASR2-CTC、Fun-ASR-Nano fp16、Qwen3-ASR、SenseVoice），**不含 Paraformer，也不含 Omnilingual**，所以各行用的是同一把尺子。**伪标准，非人工校对。**
  - 用 RESULT.md 的同一批 VAD 段。Paraformer 一行直接用 RESULT.md 的输出，重算的数和 RESULT.md 的 LOO 一致。

| 模型 | FLEURS 中文 字错率（全部字符） | FLEURS 中文 字错率（仅汉字） | FLEURS 英文 词错率 | 歌回 差异率 | 恐怖 差异率 | 杂谈 差异率 |
|---|---|---|---|---|---|---|
| Paraformer zh（默认） | 10.32% | 3.33% | 20.64% | 43.9% | 6.7% | 5.0% |
| Omnilingual 300M int8（#133 用的） | 20.33% | 13.88% | 17.95% | 48.0% | 28.0% | 16.7% |
| Omnilingual 1B int8 | 15.66% | 9.15% | 11.04% | 46.0% | 26.7% | 17.1% |
| Omnilingual 300M v2 int8 | 23.96% | 18.06% | 17.14% | 没测 | 没测 | 没测 |
| Omnilingual 1B v2 int8 | 19.52% | 13.25% | 10.13% | 没测 | 没测 | 没测 |

- 开发集上 300M 一行是补 0.25 秒静音（#133 的做法），1B 一行是补 0.5 秒。
- 普通话全面不如 Paraformer。1B 比 300M 好一些，但普通话还是 Paraformer 的约 3 倍错字。
- 英文只有 1B 明显好过 Paraformer。v2 的英文略好（300M 17.95% → 17.14%，1B 11.04% → 10.13%），普通话反而更差（300M 13.88% → 18.06%，1B 9.15% → 13.25%）。
- 歌回三个模型都很差，这是唱歌本身难，不是 Omnilingual 的问题。

## 3. 补静音和时间戳

**补静音**。VAD 切得很紧时，这个模型会大量丢字。europa 上用 flite（ffmpeg lavfi）合成的一句英语：

- 整个文件识别：`the quick brown fox jumps over the lasy dog please calls telling and ask her to bring these things with her from the store`
- 只送 VAD 切出来的那段：`ron fo jumps ove the lae dg pes ca tn and ask he to brig the hin wt he om the o`
- 同一段前后各补 0.1 / 0.25 / 0.5 秒静音：都恢复成 `quick brown fox jumps over the la(e)sy dog …`（开头的 the 是 VAD 自己切掉的，补静音补不回来）

在主播开发集上，补多少的影响很小：

| 补静音 | 歌回 | 恐怖 | 杂谈 |
|---|---|---|---|
| 0 秒 | 50.0% | 26.3% | 16.5% |
| 0.25 秒（#133） | 48.0% | 28.0% | 16.7% |
| 0.5 秒 | 48.6% | 27.4% | 16.9% |
| 1.0 秒 | 48.4% | 29.3% | 18.2% |

所以 #133 的 0.25 秒够用，不用改。#133 说德语句子「第一个词被截掉一点」，和这里看到的一致：那是 VAD 切掉的，补静音补不回来。

**时间戳**。CTC 逐 token 给开始时间，有字的段 287/287 都有逐字时间（补 0.25 秒时）。和 Paraformer 比（同一批 VAD 段、两边写成同一个字的字，按最长公共子序列配对）：

| | 配对字数 | 时间差中位数 | 90 分位 | 150 毫秒以内 | 平均偏差 |
|---|---|---|---|---|---|
| 300M，补 0.25 秒 | 3867 | 0.03 秒 | 0.08 秒 | 96.9% | +0.003 秒 |
| 1B，补 0.5 秒 | 3921 | 0.02 秒 | 0.08 秒 | 96.8% | −0.002 秒 |

Paraformer 的时间不是真值，这只说明两边一致。#133 的 `letterWords`：汉字一个字一个词，字母拼到空格为止，结束时间规则和 Paraformer 一样。所以**不需要强制对齐**。

## 4. 速度和内存

### Windows（katana：Win11，i7-11800H，16 个逻辑核；4 线程）

| 路径 | 素材 | 模型 | 用时 | RTF（按录像长） | 内存峰值 | 结果 |
|---|---|---|---|---|---|---|
**现在的路径**：Electron 45.2.1 utilityProcess 里的 server.js → `asr-meta-engine.js` → 子进程 `asr-meta-run.js` → asr-local.js（`{model:"asrMeta"}`）。Paraformer 还在 server 自己的进程里。

| 路径 | 素材 | 模型 | 用时 | RTF（按录像长） | 内存峰值 | 结果 |
|---|---|---|---|---|---|---|
| **子进程（现在）** | 8.7 秒合成英语（Windows 自带 TTS） | Meta 300M | 2.8 秒（含加载模型） | — | Meta 子进程 669 MB，utilityProcess 119 MB | 24 个词全对，结尾没有「。」，文稿记为 `omnilingual-meta` |
| **子进程（现在）** | 2 小时合成英语（同一个 TTS，见第 10 节） | Meta 300M | 977 秒 | **0.136** | Meta 子进程 **845 MB**，utilityProcess 120 MB | complete，0 个没听写出的段，20666 个词 |
| 在 server 进程里（#133 原来的做法，供对比） | 同上 | Meta 300M | 1202 秒 | 0.167 | utilityProcess 837 MB | complete，20666 个词（那时英文还会被加标点，所以慢一些） |
| server 进程（不变） | 8.7 秒同上 | Paraformer | 4.0 秒（含加载模型） | — | utilityProcess 501 MB | 24 个词全对 |
| server 进程（不变） | 2 小时同上 | Paraformer | 345 秒 | 0.048 | utilityProcess 571 MB | complete，0 段，20626 个词 |

- utilityProcess 的内存峰值是它自己的 `PeakWorkingSet64`，听写完以后读的；Meta 子进程的峰值是它自己报的 `maxRSS`。每一行都开一个新的 utilityProcess，互不混。
- 1B 在 Windows 上（Node，不是 #133 的路径，是我另一个分支的子进程路径，补 0.5 秒）：2 小时合成英语 2364 秒，RTF 0.328，内存 1354 MB。300M 同样条件 1247 秒，RTF 0.173，702 MB；Paraformer 259 秒，RTF 0.036，494 MB。
- 一段连续 20 秒的合成语音（VAD 一段最长 20 秒）：300M 峰值 888 MB，1B 1480 MB。

### europa（Linux，共享机器）

| 路径 | 素材 | 模型 | 用时 | RTF | 内存峰值 | 结果 |
|---|---|---|---|---|---|---|
| asr-local.js（#133） | 2 小时直播（GC06 整场 4797 秒 + 开头 2403 秒，开发集，只在 europa） | Meta 300M，补 0.25 秒 | 1547 秒 | 0.215（按语音长 0.339） | 2771 MB | complete，670 段，0 个没听写出的段（loadavg 6→16） |
| asr-local.js | 同上 | Paraformer | 710 秒 | 0.099 | 656 MB | complete，670 段，0 个没听写出的段 |

- europa 上的 Meta 内存峰值比 Windows 高很多：#133 的路径 2771 MB，我另一个分支的子进程路径在这段上也是 2772 MB，所以和代码路径无关。原因没查清，可能是 Linux 上 onnxruntime 的内存池按最长的段长大，也可能是 glibc 不还内存。**这是 Linux 的数，不代表 Windows。**
- Meta 官方说 1B 推理约需 3 GiB 显存，条件是 A100、BF16、30 秒音频、batch 1。这里是 CPU 上的 int8，不能拿那个数当承诺。

## 5. 故障

- 模型文件缺了或被改过：sha256 / 大小对不上，就不算装好，不加载（#133 原有的校验）。
- 没有同意记录：不用（这次加的，第 6 节）。
- **Meta 在自己的子进程里跑**（`asr-meta-engine.js` fork `asr-meta-run.js`；在 Electron 的 utilityProcess 里用 `ELECTRON_RUN_AS_NODE` 起同一个程序）。崩溃、被杀、内存耗尽，都只结束这个子进程：服务回 `ASR_OPTIONAL_CRASHED`，白话提示「Paraformer 不受影响」。
- 引擎读不了一个通过了校验的模型（文件坏了、或者不是这种模型）：`ASR_OPTIONAL_MODEL_BROKEN`，白话提示撤销后重下。
- 开始前看空闲内存，不到 1000 MB（manifest 的 `ramMB`，按 Windows 上 20 秒一段时实测的 888 MB 定的）就不启动：`ASR_OPTIONAL_NO_MEMORY`，白话提示要多少、还剩多少。
- 实测（Windows，Electron 45.2.1，`electron-server.cjs kill`）：Meta 听写 2 小时的文件，5 秒时杀掉它的子进程（pid 53436）→ 服务回 500 `ASR_OPTIONAL_CRASHED`「Meta's model stopped (exit code 1); Paraformer is not affected」→ **同一个服务**接着用 Paraformer 听写同一个文件：20626 个词，299 秒，服务一直在。
- 测试（`test/asr-meta-engine.test.js`，Windows 和 Linux 都过）：坏模型只报一句白话错误，同一个进程接着用 Paraformer 听写；Meta 的子进程被杀 / abort / 堆耗尽，只有 Meta 失败，Paraformer 不受影响；内存不够和取消；真引擎下 Meta 文件损坏在子进程里被挡下、Paraformer 接着读出测试句；真模型下英文走子进程、没有「。」，中途被杀后 Paraformer 照常。

## 6. 同意流程（这次加的，ADR #122 第 6 节）

- 选 Meta → 宿主自己的对话框先弹许可证原文（模型自带的 LICENSE，逐字节随 MontClip 附带，按 sha256 核对），默认按钮是「不同意」。
- 点「同意」→ 如果文件还没在这台电脑上，再弹一个框选从哪个站下：hf-mirror.com（固定到提交 6abf1ece…）或 github.com（压缩包，固定 sha256）。写明会连的完整域名，只发下载请求（带 IP，不带录像、弹幕、字幕、账号）。只下选中的那个站；失败了换站要再选一次。
- 下完、核对通过，才写同意记录：`<模型目录>/consent/asrMeta.json`，内容是模型 id、修订号、许可证 sha256、时间、MontClip 版本。只在本机，不上传，不进日志。
- 从 U 盘导入的文件，没有同意记录也不用；点「看许可证并使用」，看过许可证、点了同意才用。
- 撤销：删模型文件、删下了一半的部分、删同意记录，回到 Paraformer。
- 没有 agree 参数：服务端收到带 agree / consent / accept 字段的请求一律 400；没有同意记录的 Meta 请求一律 409「等主播同意」。服务端从不写同意记录。

## 7. 许可证

- Meta 官方仓库 github.com/facebookresearch/omnilingual-asr：「Omnilingual ASR code and models are released under the Apache 2.0.」
- 模型卡 huggingface.co/facebook/omniASR-CTC-1B：「License: apache-2.0」。
- 转换后的仓库（k2-fsa 的 csukuangfj / csukuangfj2）：模型卡没有 `license:` 字段；仓库和 GitHub 压缩包里的 `LICENSE`（581 字节，sha256 a70a523b…）写的是「Copyright 2025 (c) Meta Platforms, Inc. and affiliates. Licensed under the Apache License, Version 2.0」。四个仓库（300M、1B、两个 v2）的这个文件逐字节相同。
- MontClip 把它逐字节放在 `licenses/asr/omnilingual-asr-LICENSE.txt`（同意框里显示的就是它），Apache 2.0 全文在 `licenses/asr/omnilingual-asr-Apache-2.0.txt`；它也作为模型文件之一一起下载、核对。`LICENSES.md` 已加一节。

## 8. 回归测试（#133 加上这次的提交）

- **Windows（katana，Node 22.15.1，`vendor/asr` 里有真引擎和 Paraformer、标点模型，`MONTCLIP_TEST_META_DIR` 指向真的 Meta 模型）**：`node --test` 1513 个，**1513 过，0 失败，0 跳过**（head `6a3ce802`）。
  - 其中走真引擎的：`the real engine on the model's own public test sentence`（Paraformer + VAD + 标点，`asr-local.js`）、`the real engine: "@" in place of 「嗯」…`（Paraformer 的 tokens 坑）、Meta 的两条真引擎测试（损坏的 Meta 文件、真模型走子进程再被杀）。
  - 新加的 `test/asr-consent.test.js` 8 个、`test/asr-meta-engine.test.js` 6 个、`test/asr-meta-punct.test.js` 1 个全过；#133 原有的 `test/asr-meta.test.js` 按新的 manifest（多了 LICENSE、hf-mirror 源）改了两处断言，全过。
- **Windows 桌面 smoke（Electron 45.2.1，全新 profile，隐藏窗口）**：`desktop/asr-smoke.cjs` **ASR_SMOKE_PASS**（Paraformer：导入、听写、标点），`desktop/asr-gaps-smoke.cjs` **ASR_GAPS_PASS**（VAD 段坏了只记一段）。
  - 第一次跑 asr-smoke 失败过：profile 放在很长的临时目录里，标点 token 的缓存文件路径约 275 个字符，超过 Windows 的 260 字符限制，sherpa-onnx 读不到。换短路径就过了。这是测试环境的问题，不是代码的；但用户的数据目录如果很深，也会撞上，另记一笔。
- **Linux（europa，Node 18.20.4，系统 ffmpeg 5.1，引擎从 `~/asr-bench`，`MONTCLIP_TEST_META_DIR` 指向真的 Meta 模型）**：`node --test` 1513 个，**1488 过，6 失败，19 跳过**（head `6a3ce802`）。Meta 的真引擎测试在 Linux 上也过了。
  - 6 个失败（`a silent mix through the real ffmpeg…` 和 5 个 song-scan）在没改过的 `origin/main` 上用同一台机器也一样失败：europa 用的是 Debian 的 ffmpeg 5.1，不是 MontClip 固定的那个版本。和听写无关。
  - 19 个跳过：没有 H.264 编码器、没有固定版本的 ffmpeg、zipDir 只在 Windows 上跑。
- sherpa-onnx **没有升级**（2.0.1 本来就支持），所以「升级后回归」这一项实际上就是上面这些。

## 9. 已知问题

已经修了的（Deja 11-04 定的）：Meta 改在子进程里跑（第 5 节）；中文标点不再加到 Meta 的英文和其他外语上。

还没修的：

1. **很深的数据目录**：标点 token 的缓存路径超过 260 个字符时，sherpa-onnx 读不到（第 8 节，第一次跑 asr-smoke 时撞上）。Paraformer 和 Meta 都会碰到，不是这次引入的。Deja 另外排期。
2. **Linux 内存峰值偏高**（第 4 节），原因没查。Windows 上 Meta 子进程 2 小时的峰值是 845 MB。
3. **hf-mirror.com 在国外会失败**：它把下载转到 huggingface.co，不在白名单里。失败时文稿页提示「再点一次，改选 github.com」（文案草稿，交 JJ）。国内能不能直接下：没测。

## 10. 复现

europa，`~/asr-bench/omni/`：

```bash
bash models/dl.sh                        # 300M、1B、1B v2 int8，固定提交，从 huggingface.co
bash scripts/dl2.sh                      # 300M v2 int8（GitHub release 压缩包，先核对整包 sha256），FLEURS en_us test
python3 -I data/mk_en.py                 # data/fleurs_en100.json
bash scripts/run_omni.sh; bash scripts/run_omni3.sh   # node scripts/bench_omni.js <model> 4 data/<set>.json out/<model>[_padX]__<set>.json
bash scripts/run_pad.sh                  # 补静音 0.5 / 0.25 / 1.0 秒
python3 -I scripts/score.py              # out/score.json
bash scripts/run_133.sh                  # 2 小时，#133 的路径（docs/validation/2026-11-04-omnilingual-asr/rtf.cjs），然后跑 Linux 的 node --test
```

Windows（素材都是合成的，不涉及主播）：

```bash
# 模型放成 app 的样子：<目录>/asrMeta/{model.int8.onnx, tokens.txt, LICENSE}
<electron 45> docs/validation/2026-11-04-omnilingual-asr/electron-server.cjs <目录> meta <音频>
<electron 45> docs/validation/2026-11-04-omnilingual-asr/electron-server.cjs <目录> paraformer <音频>
node docs/validation/2026-11-04-omnilingual-asr/rtf.cjs <音频> meta|paraformer <asr 目录> 4
```

2 小时合成文件：Windows 自带 TTS（System.Speech）念 7 句英语（36.5 秒），`ffmpeg -stream_loop -1 -t 7200 -ac 1 -ar 16000 -c:a aac -b:a 64k`。

文件 sha256（europa）：

```
# europa, ~/asr-bench/（主播素材只在 europa 上，不出机器）
da5bc67fbd76eaa4ebeda16c9d5f6a42cbacef6e2f71c6e4f0b97b1620138812  RESULT.md
12509be8ffb1cf6493a2f999588dc91aa3e2e273e84a94e914b0c998aebe0619  scripts/bench.js
fe0a2adfce75aa68f618c10121428b34ad712c6adc2b053c982c1ae1214b614e  scripts/analyze.py
09d19ad18f5d7e91076880807e866cd16abd924c7052b55f71cdae91714fc166  data/fleurs/test.tar.gz
5734461648f816181d7dab5fc79204b18c4b9bc2cd5138225b25c72d18385d21  data/fleurs/test.tsv
dd5901f408e9d58187d790674b2a68b320089d60f6d5ce9088d90e80119f83e2  omni/scripts/bench_omni.js
1286389b894f3641bdac96208c975e736c661ed68e16a372eb8a00000590d98b  omni/scripts/score.py
6161e16b655dcd5696c95614be90863b597867479f91da647c35db7a7c774057  omni/scripts/run_omni.sh
54a039a4c413083dd1000315b6f578ddcbd24859a386ea3979b2d5982f68cb0a  omni/scripts/run_omni2.sh
2107e3b7191c7b5c81789f417381ff82b94d20dd2a3bd87c02a06d99cc80d675  omni/scripts/run_omni3.sh
edef334e9887565a0d287baa4a64dd868115f6e89c111f37cfc1c1e6adfa48ea  omni/scripts/run_pad.sh
68bf27bb72f4d23e12592c86d989f03641cd5b4d284f121fa58dab49292f00fc  omni/scripts/run_133.sh
e9b2bbef6dfff715a66f3b389babd01d9f9e5784a759569afe58027e33bcc67a  omni/scripts/dl2.sh
25a24c1680247602ad8f589bfc5218d8fb7a9baa523186b94c372f34b6118b02  omni/models/dl.sh
ea832d8f25e2b0bd2826415d0a4e5e8c727910cb9345bb4d13274c5c74aab179  omni/data/mk_en.py
bc78fc82dad4de22adf1dc6f2820a385f787c5943dc9a73a89e970facd1077f8  omni/data/fleurs_en100.json
74c046239374deeb60fa63f258f907388093a32bcaa3140965f70ef05c79f7ca  omni/data/fleurs_en/test.tsv
d9c2e37b41aacd41bc283554a0a82b5476b36887049774ecb2819dcaaa55a356  omni/data/fleurs_en/test.tar.gz
415fafd868ca03ea88fbc8404ccfe93953d0ff9988d897c548c662c9b1be9182  omni/data/fleurs_cmn100.json
c02707bd4018fac719436052003bb239b5ef106c0a53d533ca8832dcf3ce218f  omni/data/live.json
809cf106629dd4a441cf989fb175034e955eff2042c4a33adba68caf33a9529b  omni/data/long_GC06x2h.m4a
ee224b89a3a29a723323fc0fb2afe199bd94bae64bee5fbc4e8f4f66c52ff68f  omni/out/score.json
e7c4e54ee4c4c47829cc6667d5d00ed8ea7bef1dcfeef0fce766f77752a2726c  omni/models/omni-300M-int8/model.int8.onnx
a7a044c52cb29cbe8b0dc1953e92cefd4ca16b0ed968177b6beab21f9a7d0b31  omni/models/omni-300M-int8/tokens.txt
f7b74c964039162423b83e3fa950ce24810c9a635d9ff8468b5f4d142b7c1e8c  omni/models/omni-1B-int8/model.int8.onnx
a7a044c52cb29cbe8b0dc1953e92cefd4ca16b0ed968177b6beab21f9a7d0b31  omni/models/omni-1B-int8/tokens.txt
e3042b2f3b3ef0af2211bf99d2b4bf94a21f5ac0e9898827e7dd6d003a860e91  omni/models/omni-300M-v2-int8/model.int8.onnx
7d99997ef207ff14c2cfe825f2aa037528ea250113cc3c6392bfe49326884ba6  omni/models/omni-300M-v2-int8/tokens.txt
8af72da192fc2c8567c328d4f8059bdf47f182a0369077893c295ef39740c637  omni/models/omni-1B-v2-int8/model.int8.onnx
7d99997ef207ff14c2cfe825f2aa037528ea250113cc3c6392bfe49326884ba6  omni/models/omni-1B-v2-int8/tokens.txt
a70a523bafbb595c2844104feb313d204904dac91c3d186c05f22a10a71c7a94  omni/models/*/LICENSE（四个相同）
cdcd0559c7c73efed54209a926e321afc914d046c5fdbf3665f00dc78180e5ed  omni/arch300.tar.bz2（GitHub 压缩包，#133 的第二个源）
# Windows（合成音频，scratchpad，不进仓库）
b2c3c5416be343483c5762719dea0244c16cd7dfd437431d81998b94fe02f764  synth2h.m4a（2 小时）
639a6dd3e4651c9279cea56d9532103bb248bf72ab42cddd63c1eff96aba8ed2  long1.wav（36.5 秒，循环用的那段）
9ccf956f56835e5a18d26cc7a63cb49a617ef6b877d625143cea3d68cf49291d  en.wav（8.7 秒）
```

## 11. 没测的

- 国内网络能不能从 hf-mirror.com 下载：**没测**。在美国出口的机器上，hf-mirror 会跳到 huggingface.co，不在白名单里，所以这个站在那边会失败，主播可以换 GitHub。
- 真人点一遍「选 Meta → 看许可证 → 同意 → 选站 → 下载 → 听写 → 撤销」：**没跑**，Deja 安排 VV 来走。逻辑由单元测试覆盖；Electron 里服务端那一段实跑了，对话框没有真人点。
- 1B 走 #133 的路径：**没跑**（#133 只带 300M）。
- 男声、说唱、伴奏很响的英语：**没测**。英语只测了 FLEURS（朗读）和合成语音。
