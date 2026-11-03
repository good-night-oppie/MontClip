# 本机听写的速度（Win11 测试机，2026-11-03）

准确率不在这里重测，直接引用 europa 上的实测 `~/asr-bench/RESULT.md`（sha256 da5bc67f…）。这里只补本机的速度。

- 机器：Win11，i7-11800H（16 线程），Node v22.15.1。
- 素材：europa 上同一段 10 分钟杂谈，`data/zatan_GC11_1280-1880.wav`（sha256 f1a1789d…）。
  - 只放在临时目录，用完就删，不进仓库；
  - 输出只有数字，没有文字和文件名。
- 走的是产品自己的路径（`asr-local.js`）：ffmpeg 解码 → silero VAD → Paraformer zh int8（4 线程）→ CT-Transformer 标点。

| 次 | 录像长 | 其中语音 | VAD 段 | 字数 | 总用时（含加载模型、VAD、标点） | 按录像长算 RTF | 按语音长算 RTF | 内存峰值 |
|---|---|---|---|---|---|---|---|---|
| 1 | 600 秒 | 366.1 秒 | 97 | 2308 | 13.9 秒 | 0.023 | 0.038 | 532 MB |
| 2 | 600 秒 | 366.1 秒 | 97 | 2308 | 13.5 秒 | 0.022 | 0.037 | 529 MB |

- 换算下来，一小时的录像大约 1.5 分钟听写完。
- 同一段在 Electron 45 的 utilityProcess 里另跑一次（打包版的服务就跑在这里）：
  - 识别 10.3 秒，按语音长算的 RTF 0.028；
  - 整段约 15 秒，内存约 609 MB。
- 复现：

  ```
  node desktop/fetch-asr.cjs --models asr,punct
  MONTCLIP_FFMPEG_DIR=<随包 ffmpeg 目录> node docs/validation/2026-11-03-asr-local/rtf.cjs <录音文件>
  ```
