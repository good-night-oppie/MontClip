# ADR：Cindy 插件里，听写程序和模型第一次用时下载

- 日期：2026-11-05
- 拍板：Deja（首席工程师）
- 产品复核：JJ
- 来源：P8。DD 在 europa 上用插件 0.5.1-preview.2 时发现，听写一调用就报「the editor stopped reporting progress」。查下来的原因是：插件包里没有 `desktop/asr-manifest.json`，引擎在加载听写模块时就崩了；包里也没有听写程序（sherpa-onnx）和模型。引擎侧修复见 #165，插件侧见 MontClip-Cindy#7 / #8。
- 关联：2026-11-01「国内用户首次使用：语音模型本地就绪」那份 ADR 讲的是 Windows 完整便携包（随包带模型、不联网）。本 ADR 讲的是 Cindy 插件，两者不冲突。

## 看到的事实
- 插件包本身约 2.3 MB。听写要用的东西一共四样：sherpa-onnx-node、本机的原生包（linux-x64 或 win-x64）、silero VAD、Paraformer 中文模型。按 `aboutMb`（1 MB = 1,000,000 字节，四舍五入到 10）算，Linux 一套约 260 MB，Windows 约 250 MB。
- 从 `github.com/…/releases/download/…` 下载时，GitHub 会 302 跳转到 `release-assets.githubusercontent.com`，跳一次就到文件本身。2026-11-05 在本机（Windows）和 europa 上各实测了一次，结果一样。插件的 `ghost.json` 声明的网络主机正好是这两个。
- 这两台测试机都**不在国内**，测到的速度（约 21 MB/s 和 85 MB/s）不能代表国内。

## 决定
1. **第一次用时下载，不随插件包带**（Deja 拍板）。只从 MontClip 自己在 GitHub 上的 release 下载（`asr-runtime-<版本>`）。清单（插件的 `node/asr-runtime.json`）里每个文件都钉死 url、sha256 和字节数，不走 registry.npmjs.org，也不走别的网站。
2. **下载前必须先问**：用 Cindy 自己的确认框，写清四样东西——从哪个网站下、一共多大、用的什么许可、会不会发出别的数据。用户点〔下载〕才下；点〔先不下〕就什么都不下，也不换个说法再问；以后可以从状态卡「听写」那一行的按钮重新打开。文字以 JJ 定稿为准。
3. **下完再核**：worker 对每个文件先量字节数、再算 sha256。所有文件都先解压或复制到临时目录，全部通过以后才一起放到位；任何一步失败都会删掉临时目录，数据目录里不留东西。
4. **只装进插件自己的目录**：数据目录下的 `asr/` 和 `asr-models/`，不能落进服务器自己写的任何目录（拒绝名单和 #146 一致）。按真实路径比较，所以经由链接、junction 进去的也会被拒。
5. **许可**：sherpa-onnx 是 Apache-2.0，里面带的 ONNX Runtime 是 MIT；silero VAD 是 MIT；Paraformer 模型是 Apache-2.0。LICENSES.md 里要有 Linux 原生包那一行（本 PR 补上）。

## 上线门槛：国内网络实测（JJ，2026-11-05）
**这一项卡住上线：没测完不能上线。**

- 上线前必须在**国内网络**上实测下载，记下：
  - 能不能下完：`github.com` 的 release 地址，以及它跳转去的 `release-assets.githubusercontent.com`，各自能不能连上；
  - 要多久：每个文件，以及整套（Linux 约 260 MB、Windows 约 250 MB）；
  - 测的时间、网络环境（地区、运营商，是不是家用宽带），还有中途有没有断、能不能续传。
- **下不了，或者慢到不能用**：准备国内能用的下载地址，作为备用源（文件、sha256、字节数都和 release 一致；清单里写明先试哪个、再试哪个）。同意框里「从哪下」那一句要跟着改成真实的来源网站。改完给 JJ 和 QQ 看。
- 测试由 Deja 安排在国内的机器上做；结果补进本 ADR，以及 MontClip-Cindy#8。

## 还不知道的
- 国内能不能连上、多快（见上一节）。
- Cindy 自己的下载缓存：下到一半失败时，Cindy 可能会留着这份部分下载，以便下次续传，缓存由 Cindy 自己管理和回收。MontClip 自己的数据目录和临时目录已经测过不会留东西；状态卡上那句「下了一半的文件已经清掉了」是否也要涵盖 Cindy 的缓存，请 JJ 定。
- release 资产还没上传：等 #165 和 MontClip-Cindy#7 合并、JJ 定好文字以后，由 Deja 确认文件清单再传。
