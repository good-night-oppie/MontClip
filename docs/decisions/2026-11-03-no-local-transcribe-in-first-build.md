# 第一版不带本机听写

- 日期：2026-11-03
- 状态：已定（主人 11-03 决定，Deja 转达）
- 相关：#34（文稿面板中文、听写开关）

## 决定
MontClip 第一版（Windows 内部试用包以及之后的第一个发布包）**不带本机听写**，也就是把录像里的说话转成文字的功能。

- 打包版默认关掉听写：文稿面板里不显示「听写」按钮，也不显示模型和语言的选择；不会开始听写，也不会下载模型。
- 字幕照常用：导入 SRT / VTT 字幕文件、按句选段、高光候选、导出字幕和时间映射都不受影响。
- 开发版（从源码运行）保留听写，方便继续开发和测试。
- #34 的做法维持不变，这份 ADR 只是把决定记下来。

## 理由
- **安装时初始化模型这一项，这一版不交付。** 听写要用语音模型（Whisper，77–250 MB），需要在安装或第一次使用时准备好。这一步没有做，也没有验证。
- **这一版也不联网下载模型。** 第一版默认不出网。桌面窗口只允许访问本机服务，除 `blob:` / `data:` 外的请求一律拦掉（`desktop/main.js` 里的 `ses.webRequest.onBeforeRequest`）。所以就算打开开关，桌面版也下载不到模型。
- 主播的主要流程是「导入录像 + 字幕 → 选句 → 导出」，字幕可以来自录播工具或别处的 SRT，不依赖本机听写。

## 代码里由哪个开关控制
- `desktop/features.js` 里的 `transcribeEnabled({ isPackaged, argv, env })`：
  - 开发版（`app.isPackaged` 为 false）：开；
  - 打包版：关。只有主进程带 `--montclip-dev-transcribe` 启动参数，或者设了环境变量 `MONTCLIP_DEV_TRANSCRIBE=1`（只认 `"1"`）时才开。
- 主进程通过 `montclip:features:get` 把结果交给页面（`desktop/main.js`）。preload 只读一次，冻结在 `window.montclipFeatures` 上（`desktop/view-preload.js`），页面没有办法改它，也没有对应的 set 通道。
- 页面里由 `transcribeAvailable()` 判断：
  - 关的时候，文稿面板不显示听写入口（`buildTranscriptPage`）；
  - `transcribeSrcs()` 第一行就会以 `TRANSCRIBE_DISABLED` 拒绝。面板按钮和代理 / MCP 发来的听写任务都要经过这一步，所以不会创建听写 worker，也不会下载模型。
- 测试：`test/zh-transcript-release.test.js` 断言了上面这条路径，以及「开关关闭时 Worker 和 fetch 都是 0 次」。
- 注意：以上代码在 #34 里，#34 合并之前，main 上还没有这个开关。

## 以后什么情况下再带上
同时满足下面几条时，另写一份 ADR 推翻本条：
1. 模型怎么到用户电脑上已经定了，并且做了、验证了。可以是随包附带，也可以是安装时由用户明确同意后初始化；不能悄悄联网下载。
2. 在没有系统 FFmpeg、没有网络的 Windows 电脑上，用合成素材实测过听写能跑通，速度和准确度有记录。
3. 中文听写的效果有合成或已授权素材的测试，文案（JJ）和实窗（VV）都过了。
4. 安装包大小、许可（模型和运行库）都按实际组件记录好了。

满足之后，把打包版的默认值改成开，或者在设置里加一个用户能看到的选项。`--montclip-dev-transcribe` 和环境变量这两个开发开关保留不变。
