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
  - 许可证：模型卡写的是 Apache License 2.0（modelscope iic/punc_ct-transformer_zh-cn-common-vocab272727-pytorch）。
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
