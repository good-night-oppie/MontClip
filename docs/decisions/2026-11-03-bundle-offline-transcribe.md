# 本机听写打进安装包，全程离线

- 日期：2026-11-03
- 状态：已定（主人 11-03 决定「这一版要带本机听写」，Deja 转达）；带哪个模型待 Deja 定
- 取代：同日早些时候的「第一版不带本机听写」。那份 ADR 已在 #69 里撤回（`50a339c`）。

## 决定
- 这一版带本机听写，**全程离线**：安装包解压就能用，不连任何海外网站，国内主播不会因为连不上 jsdelivr 或 Hugging Face 而用不了。
- 以前 `transcribe.js` 运行时从 jsdelivr 拉 transformers.js，从 Hugging Face 拉 Whisper 模型。这两条都去掉了。现在打进包里的有：
  - transformers.js 4.3.1 的 `dist/transformers.min.js`（Apache-2.0）；
  - onnxruntime-web 1.31.0-dev.20260914-8d85527a0 的 `ort-wasm-simd-threaded.jsep.{mjs,wasm}`（MIT），也就是 transformers.js 4.3.1 依赖的那个版本；
  - Whisper 模型，8 位 ONNX、带逐词时间：`onnx-community/whisper-{base,small}_timestamped`，固定在某个提交，权重来自 openai/whisper-base 和 openai/whisper-small（Apache-2.0）。
- 打包版的听写默认打开，并保留一个开发开关可以关掉。见下文「开关」。

## 怎么做到离线
- **来源固定**：`desktop/transcribe-manifest.json` 记下每个文件的版本、来源（npm tarball 的 integrity、Hugging Face 的提交号）、大小和 SHA-256。
- **下载和校验**：`desktop/fetch-transcribe.cjs` 只在开发或出包时运行，把文件下载到 git 忽略的 `vendor/transcribe/`，逐个校验 SHA-256，对不上就失败，什么都不留。
- **打包**：`desktop/package-win.cjs` 先校验 `vendor/transcribe/`，复制到包里的 `resources/transcribe/`，再在包里校验一遍；打包时不下载任何东西。
- **服务**：`server.js` 只从 `MONTCLIP_TRANSCRIBE_DIR` 提供 `/transcribe-assets/`。这个目录在打包版里由 `desktop/main.js` 设成 `resources/transcribe`，在源码运行时是 `vendor/transcribe`。返回正确的 wasm 和 mjs 类型，目录外的路径一律拒绝。
- **worker**（`transcribe-worker.js`）：
  - 从 `/transcribe-assets/` 加载库；
  - `env.allowRemoteModels = false`；
  - `env.localModelPath = "/transcribe-assets/models/"`。这里必须写成不带协议的路径：transformers.js 4.3.1 只对不带协议的本地路径检查文件是否存在，写成 http 地址时会认为分词器不存在；
  - `env.useBrowserCache = false`；
  - `wasmPaths` 指向本地的 jsep 文件。
- **桌面窗口**：
  - CSP 的 `script-src` 只多加了 `'wasm-unsafe-eval'`，这是 ONNX Runtime 编译 wasm 必需的，没有放开一般的 `eval`。
  - session 仍然拦掉所有不是本机服务的请求（`ses.webRequest.onBeforeRequest`）。所以即使哪里漏了一个远程地址，也发不出去。

## 「除了 AI 起名，其他都不联网」仍然成立
- 桌面窗口和它的 worker 发出的每个请求都要经过 `desktop/main.js` 的 session 过滤：只放行本机 MontClip 服务、`blob:` 和 `data:`，其余全部取消。
- 听写用到的文件现在都在本机，所以听写不再需要联网。
- `desktop/offline-transcribe-smoke.cjs` 包装了 main.js 自己的过滤器，记下每个请求和放行或拦截的结果。实测对外请求为 0，见 PR。
- AI 服务（包括起名）是主进程用用户自己的 key 发出的请求，不经过窗口，这一条不变。
- 另外两项代码里写着远程地址的功能，在桌面版里本来就发不出请求：
  - 按人像抠图（MediaPipe，jsdelivr）；
  - 字幕里使用本机和 `library/fonts` 里都没有的 Google 字体。

  它们不会联网，只是在桌面版里用不了。这一点这次没改，列在 PR 里。

## 开关
- `desktop/features.js` 的 `transcribeEnabled` 在 #34 里，main 上还没有。
- #34 现在的行为是：打包版默认关，只有 `--montclip-dev-transcribe` 或 `MONTCLIP_DEV_TRANSCRIBE=1` 才打开。
- 本 ADR 的决定是反过来：打包版默认打开，保留一个开发开关可以关掉。具体改法在 PR 里说明（#34 合并后改它的默认值，并补测试）。

## 带哪个模型
由 Deja 定，看 PR 里的实测数据：中文字错率、每小时录像的听写耗时、内存峰值、安装包增量。定下来之前，清单里两个都登记了。只带一个时，`fetch-transcribe.cjs --models <名字>` 和打包脚本只放那一个，`transcribe.js` 的模型选项也要跟着收窄。

## 没做的、要注意的
- 没有真正打出安装包来验证。打包现在暂停（主人 11-03 的决定），所以「打包版」的验证是用源码运行加同一套 session 过滤做的，打包脚本只做了代码和测试上的改动。
- 在线演示（`docs/demo/`）是静态网站，没有 `/transcribe-assets/`，在线演示里的听写会用不了。
