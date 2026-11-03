# 本机听写：sherpa-onnx + Paraformer zh，模型三条路

- 日期：2026-11-03
- 状态：已定。听写选型由 Deja 定；这份 ADR 写的是 #70 怎么落实。
- 取代：同一天早些时候本文件的旧版「Whisper（transformers.js）打进安装包」。那一版没合进 main，这次整份换掉。
- 依据：
  - europa 上的实测报告 `~/asr-bench/RESULT.md`（sha256 da5bc67f…），里面有复现命令和每个文件的 sha256；
  - ADR `2026-11-03-local-capability-boundary.md` 第 6 行：听写不联网，加两条不联网的路。

## 决定

- **引擎**：`sherpa-onnx-node@2.0.1`，Apache-2.0。
  - 由本机服务（`asr-local.js`，在 Electron 的 utilityProcess 里）来跑，不在浏览器里跑。
  - 识别用 `decodeAsync`，所以服务在听写时照样能应答。
- **默认模型**：`sherpa-onnx-paraformer-zh-2023-09-14`，int8。
  - 大小 232 MB，Apache-2.0，带逐字时间戳。
  - 在 europa 上测：4 线程 RTF 约 0.05；FLEURS 只算汉字的字错率 3.33%。
  - **别拿错**：`sherpa-onnx-paraformer-zh-int8-2025-10-07` 是四川话版。manifest 里写明了不能用它，测试也断言它不会出现。
- **VAD**：先过一遍 silero_vad。
  - 参数和 RESULT.md 一样：阈值 0.5，最短语音 0.25 秒，最短静音 0.5 秒，一段最长 20 秒。
  - VAD 文件只有 643 KB，许可证是 MIT，所以每个包都带上。
- **标点**：sherpa-onnx 的 CT-Transformer 中文标点模型，作为可选的第二个文件。
  - 用的是 int8 版：`sherpa-onnx-punct-ct-transformer-zh-en-vocab272727-2024-04-12-int8`，模型文件 76 MB。
  - 许可证：Apache License 2.0。2026-11-03 按 Deja 的要求重新核对过：
    - 两份官方模型卡都写 Apache-2.0：ModelScope `iic/punc_ct-transformer_zh-cn-common-vocab272727-pytorch`，以及 FunASR 自己在 Hugging Face 上的 `funasr/ct-punc`。
    - FunASR 的 README 写明：模型权重的许可证看各自的模型卡；只有模型卡链接了 FunASR 模型协议（MODEL_LICENSE，§3 写的是 "reference and learning purposes only"）时，才适用那份协议。
    - 这两份模型卡都没有链接 MODEL_LICENSE。SenseVoice 的官方模型卡链接了，所以 SenseVoice 不用，这个可以用。
    - 来源和原文登记在 `LICENSES.md` 和 `licenses/asr/ct-transformer-Apache-2.0.txt`。
  - Node 绑定支持（`OfflinePunctuation`），已经实测能用。
  - 没装标点模型时，听写照样能用，只是没有标点。
- **SenseVoice 不用**。它的许可证问题 issue #334 在 08-29 被重新打开，到现在没有定论。
- **时间**：中文每个字算一个「词」，时间到这个字为止。英文按 `@@` 把拆开的部分拼回整词。标点加在它前面那个字上。
  - 文稿和字幕里，汉字之间不加空格，英文词之间照常加空格（`FableCutTranscribe.join`）。

## 模型从哪来（三条路，每个文件都按 sha256 核对）

`desktop/asr-manifest.json` 写死了每个文件的 sha256、大小和下载源。下载源按顺序试：

1. **「完整版」包**：两个模型都在包里（`resources/asr/models`），会先用它。
   - 打包命令：`node desktop/package-win.cjs --full`，包名多一个 `-full`。
   - 打包前先核对一遍，打进包以后再核对一遍。
2. **下载**：主播在文稿页点〔下载听写模型〕，由主进程弹出宿主自己的确认框，写明大小和网站。默认按钮是「取消」，点了「下载」才会发请求。
   - 主源：hf-mirror.com/csukuangfj/sherpa-onnx-paraformer-zh-2023-09-14，固定到一个提交；
   - 备用：GitHub release k2-fsa/sherpa-onnx asr-models 里的 tar.bz2，先核对整包 sha256 再解包，解开后逐个文件再核对。
   - 只连 manifest 里列出的域名；重定向也一样，跳到名单外的域名就不跟，换下一个源。
   - 网络出错会重试一次。文件对不上 sha256 就不重试，直接换下一个源。
   - **断点续传**（Deja 11-03）：每个文件（或压缩包）先下载到 `asr-models/.partial/<它的 sha256>.part`。
     - 断了，已下载的部分留着，下次用 HTTP Range 从断开的地方接着下。服务器回 206 就接在后面，回 200 就从头下。
     - 已在 github 的 release 上实测过：从第 100 KB 接着下完，sha256 对得上。
   - **先核对，再改名**：下完先核对大小和 sha256，通过了才改名放到正式位置。
     - 没通过就删掉这个文件，界面提示「下载的文件不完整，已删掉，请再下载一次」（`ASR_CHECK_FAILED`）。
   - 下载前先看硬盘空间。不够就不下，提示是哪个盘、要多少、还剩多少（`ASR_NO_SPACE`）。
   - 网断了：已下载的部分留着，提示「接着下载」（`ASR_DOWNLOAD_INTERRUPTED`）。〔取消下载〕也一样，已下载的部分留着。
   - 白名单写死在主进程 `desktop/main.js` 的 `ASR_HOSTS` 里：hf-mirror.com、github.com，加上 github 下载会跳到的 release-assets / objects.githubusercontent.com。
     - manifest 里有同样一份；测试断言两份一致。
   - ModelScope 上只有个人转存，不用。
3. **从 U 盘或文件导入**：主播选一个文件夹，比如 U 盘。
   - 文件夹里的模型文件，以及官方的 tar.bz2，都靠「大小 + sha256」认出来，不看文件名。
   - 对不上的文件一律不复制。

下载和导入的模型放在用户数据目录的 `asr-models/` 里。页面只能说「要哪个模型」，传不了路径，也传不了网址。

## 联网例外

- 「下载听写模型」本来就在联网例外清单里。
- 本机服务本身从不下载。
- 窗口的 session 照样拦截所有不是本机服务的请求。
- 旧版为 wasm 加的 CSP `'wasm-unsafe-eval'` 已经去掉。

## 开关

- 打包版默认打开听写（`desktop/features.js`）。
- 用 `--montclip-no-transcribe` 或 `MONTCLIP_NO_TRANSCRIBE=1` 可以关掉。

## 界面文案

- 以 JJ 的定稿 v2 为准：JJ workspace 下的 `documents/2026-11-03-MontClip-听写文案定稿-JJ.md`。
  - 用到的是文稿页的模型一行和下载的各个状态（下载中、装好了、没下载完、空间不够、校验不过），以及空文稿那一句。
  - 一律逐字照搬，测试也逐字断言。
- 标点模型（Deja 11-03 的决定，因为许可证是 Apache-2.0）：主播可以自己装。
  - 设置页和「设置 › 听写」写「字幕默认不带标点；另外装一个标点模型（下载约 60 MB）就有标点。」；已经装好标点模型时，这一行不显示。
  - 「设置 › 听写」在装好听写模型、还没有标点模型时，给一个〔装标点模型〕按钮。下载也是先由宿主弹出确认框，再逐个文件核对；也可以从 U 盘导入。
  - 「完整版」里自带标点模型。
  - 大小一律写下载的大小「约 60 MB」（压缩包 62 MB；装好以后大约 76 MB）。Deja 11-03 定的，设置页和确认框写的是同一个数。
  - 原来 JJ v2 的「这一版的字幕不带标点」不再用了。
- **首次打开的听写设置页**（设计 v10，Deja 冻结：说明 sha256 a4c4e3d8…，原型 6cd20e5c…）：
  - 什么时候自己打开：在桌面版里、听写开着、还没有模型、主播也没选过「以后再说」。
  - 另外两个入口：「设置 › 听写」的〔去装〕，以及 P3 的〔去装〕。
  - 三选一，加上 5 种状态：下载中、装好了、没下载完、空间不够、文件不完整。
  - 主播的选择（local / later）由主进程存在 `asr-choice.json` 里，因为页面的 origin 每次启动都不一样。
  - 下载停在半路时，下次打开直接显示「没下载完」。
  - 「（我们的测试电脑上大约 {n} 分钟）」先隐藏（`ASR_TEST_MINUTES = null`），等 Deja 给数字。
  - **「用云端听写」这一张卡片先不显示**：云端听写还没有做，它是另一个联网例外，要 QQ 审。不能放一个点了没反应的按钮。

## 已知不足

- **唱歌的段落错字多。** 在 europa 的歌回片段里，两首歌一秒只出 1.06 / 1.37 个字，主要的句子出得来，但错字多。后面的「按歌词校准字幕」就是补这一块的。
- 中文字幕没有逐字动画：字幕按句子计时，和导入的 SRT 一样（#34 的规则）。字幕渲染是按空格分词的，中文要逐字做动画得另做。
- 标点的 int8 模型只在 k2-fsa 的 GitHub release 上有。官方 HF 仓库只有 294 MB 的 fp32 版，所以标点模型没有 hf-mirror 这个源。
- **国内能不能下载，没有实测。** 在这台机器（美国出口）上，hf-mirror 会把请求重定向到 huggingface.co 和 us.aws.cdn.hf.co。这两个都不在名单里，所以这里每次都是 GitHub 那个源成功。
- 在线演示站（`docs/demo/`）没有本机服务，所以用不了听写。

## 实测

- 准确率直接引用 RESULT.md（europa，Xeon 8259CL，共享机器，测试时其他进程在跑）。这里不重测。
- 本机 RTF：测试机 Win11，i7-11800H。用 europa 上同一段 10 分钟杂谈（GC11 1280–1880 秒，sha256 f1a1789d…，只放在临时目录，用完就删）。
  - 走产品自己的路径（`asr-local.js`），跑了两次：10 分钟的录像 13.5–13.9 秒做完（含加载模型、VAD、标点）。
    - 按录像长算 RTF 0.022–0.023，按语音长算 0.037–0.038；
    - 内存峰值约 530 MB；
    - 一小时的录像约 1.5 分钟。
  - 在 Electron 45 的 utilityProcess 里也跑通了：识别 RTF 0.028，整段约 15 秒。
  - 复现方法和数字见 `docs/validation/2026-11-03-asr-local/`。
