# 独立 ProRes 尾音修复验收

分支 `fix/prores-project-end`，独立worktree `prores-project-end`，fetch后的main为 `d51b27a1ef5196725d73bca2d7d96c0de8c767bc`。#189保持证据PR，本分支仅携带必要自写合成验收启动代码，未cherry-pick草稿材料。产品边界见 [ADR](../docs/decisions/2026-11-05-prores-project-end.md)。没有新运行依赖，没有安装/下载/部署，没有新主播界面文案。

## 先失败再通过

`prores-red.log`：主线实际FFmpeg JPEG→ProRes导出12秒最后100ms提示音，解码573440样本/声道，断言576000失败。扩展旧实现11项中10失败/1通过。不是仅检查argv。

修复只在带明确frames的JPEG/prores422调用中，用完整帧区间终点代替-shortest：视频 frames/fps；音频 round(frames/fps×48000)，固定48kHz输出并裁去混音额外1样本。不以末帧起点当结束点，不补静音。短直接上传WAV保持短；浏览器短源片段之外的静音是原有全范围混音语义。

独立只读审查指出音频filter别名可能被覆盖，先补实际静音输出失败用例再修复：保留最后生效的-af/-filter:a/-filter:a:0链。另以自定义-ar44100复现采样时钟不一致，再明确输出48kHz；两份失败日志均归档。当前边界测试含实际末尾波形、非整数秒/30000/1001及29.97、短/长/无音频、可编辑音频过滤链和非法时钟。

REST实际服务测试：IPC归属+PORT0/127.0.0.1，5秒音源按1秒项目结束，30帧完整；取消后会话失效、临时混音和半成品均消失。初版把非法frames验证放在临时目录创建之后，测试发现4个空目录；已移至分配之前。第一次测试token长度写错被现有鉴权拒绝，已修正测试生成器，不改变鉴权规则。

MP4防回归使用可在LGPL工具上运行的MPEG-4/AAC：有/无新增frames字段的实际输出PCM、音频包PTS/duration一致；AAC负首PTS与skip_samples均按实际元数据处理，不把编码预留/尾部padding算作丢失。既有H.264色彩与安全检查也通过，未宣称所有MP4交付预设均经过人工界面验收。

## 最终代码的真实浏览器导出

`out/prores-cfr-reviewed` 与 `out/prores-vfr-reviewed` 是最终产品代码的独立运行。receipt记runner和app/server/encode-profiles三个源码SHA256，可与提交内容逐字节核对。每次只有自有数据目录、服务子进程、私有Chrome profile/CDP管道；最终cleanup均双true。素材均程序生成，无真人材料。

| 场景 | 项目范围与实际输出 | 末尾提示音 |
|---|---|---|
| CFR源 → 30fps项目 | 360帧，12秒，576000样本/声道；末PTS11.966667，非终点 | 零偏移相关0.9999999972，增益0.9999364 |
| 已读真实PTS的VFR源 → 30000/1001项目 | 37帧，1.234566667秒；59259样本/声道，末PTS1.201200 | 同等相关与增益，最后100ms保留 |

VFR来源通过相邻解码PTS间隔不同断言，不拿平均fps冒充源帧号；源PTS和输出PTS分别归档。首次浏览器使用MPEG-4源时取帧超时，没有尾音验收结果；换成浏览器可解码的程序H.264源后成功。仅生成器用本机libx264，不绕过应用x264导出设置门槛。最终预览/导出抽帧已目视确认有测试图，不以截图证明音频。

证据 `docs/validation/2026-11-05-prores-project-end/`：25项制品SHA256清单、失败/通过日志、两场景工程/预览/截图/导出抽帧、源/输出PTS、代码与工具hash。`viewing-copy.mp4` 为实际ProRes MOV转码的观看副本，不能代替原MOV测量；原MOV保留于上述本机out目录，哈希在result-export.json/receipt。没有上传浏览器profile或认证token。

## 平台与测试数字

| 环境 | 结果 |
|---|---|
| Windows，Node22.15.1，系统FFmpeg9.0.1 gyan.dev full | 最终 `npm test -- --test-concurrency=2`：1754项，1747通过、0失败、7跳过，71.360秒 |
| Windows定向回归 | 最终32/32通过；实际浏览器CFR3项/VFR4项通过；profile归属守卫另2/2 |
| 发布检查 | `node .github/scripts/release-check.js`全部通过；已重建docs及demo |
| Windows包内工具 | 未运行：本worktree未有可用包内FFmpeg，不自动下载 |
| Linux/macOS | 未运行；不把Windows数字记到其他平台 |

7跳过：ASR模型2、bundled FFmpeg/指定构建哈希2、POSIX权限/所有者3。一次中间全量因既有安全测试按源码字符串定位profile声明失败，调整声明位置保留原安全入口后最终完整重跑通过；没有删除安全测试。一次大Buffer失败打印使测试进程异常退出，改为布尔字节比较避免失败报告转储海量数据，之后实际filter失败和通过均留记录。

本次有限输出不替代客户端永不发送EOF时既有空闲超时；复杂自定义filter图未验。旧REST不传frames、RGBA/Annex-B/delivery及其他profile保留旧规则，不给它们新的尾音保证。等待现head的QQ/Rea审查，不自行批准/合并。
