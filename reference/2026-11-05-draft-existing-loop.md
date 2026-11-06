# 既有能力 simulated 闭环：操作与画面通过，尾音未通过

本次遵从 Deja 最新收窄：没有新增 shotSlot/schema、导出拦截、review 模式、版本删除限制、split 限制或全轨 ripple。旧契约已标 DEFERRED，不是执行要求。使用 main `d51b27a1` 现有 clip/project/comp/text/version 和同一 undo/保存路径。

材料来源：VV `2026-11-05-宫格与缺口卡验收/验收与标注规范.md` v2 §3/§4/§9，定版范围见同目录现状矩阵。五行卡文案复用，末行“恢复办法还没验”保持原样；另加内部证据标记 `simulated`。手部近景只是验卡说明，程序测试图没有真人/手部动作，不计真实缺镜头覆盖。没有新增产品 UI 或定稿声明。

## 可复现入口

Windows Node 22.15.1、Chrome 156.0.8078.80、FFmpeg 9.0.1 gyan.dev full（非 bundled）。零新依赖。设置 MONTCLIP_FFMPEG / MONTCLIP_FFPROBE 为本机明确的工具路径；Chrome 可用 MONTCLIP_TEST_CHROME 指定。输出必须是不存在的新目录。

```text
node real-tests/draft-existing-loop.cjs out/draft-loop-new
node real-tests/draft-existing-check.cjs out/draft-loop-new
```

runner 是现有能力的内部验收，不是可发布演示。checker 对比源 WAV，目前尾音项必须返回失败，不能改阈值/去掉长度检查来伪造通过。正常播放导出未改变规则。

启动只用本次生成的数据目录：服务 HOST=127.0.0.1、PORT=0、随机会话认证，接收自己 child 的 IPC `montclip-ready` 后才请求；Chrome 新建 profile + 私有 CDP 管道，无调试端口发现/用户工程探测。结束只关闭自己创建的进程并等待退出，receipt 记录 PID、归属方式、cleanup；不读取或复制 #186/VV 的旧 runner。profile/认证值不入证据包。

## 工程与真实操作

12 秒 CFR 30fps 640×360 程序测试图，独立 12 秒 440Hz 原声音轨，2 秒无声黄色补画面。卡为普通 comp + text，纯色 comp background，放在 [8,10)。所有素材仅程序生成；源媒体 PTS、time_base、帧号/哈希见制品。第一段从 0 开始，没有将开头正常空档误报成黑屏 bug。

全程原声片段未链接到画面，全部声音轨排除在 Source replace 的目标外；这是明确的测试条件，不推广成任何工程默认保原声。插卡用 Project 中 comp 的既有 `+` 按钮；在 V1 上覆盖原画面但不删它。替换用既有 Source Replace，仅 overwrite V1 的 [8,10)，原画面拆为 [0,8) 和 [10,12)，未移动后续内容。声音仍 [0,12)。

| 步骤 | 实际入口 | 工程结果 |
|---|---|---|
| 加入卡 | comp `+` 按钮 | 一个新增 comp clip，一次 undo；原画面/原声仍在 |
| 换画面 | Source Replace 按钮（预先指定素材及 In=0/Out=2） | 卡被替换，V1 指定区间换成黄色画面，声音完全不变 |
| 撤销替换 | Undo 按钮 | 返回卡，不称恢复原实拍 |
| 撤销加入 | Undo 按钮 | 返回原画面/原声工程 |
| 重做两步 | Redo 按钮各一次 | 卡、补画面依次回来 |
| 保存重开 | flushSave + page reload | 媒体引用、参数、时间及原声不变；联动关系按成员比较 |
| 普通删除 | 选择补画面后 Delete 按钮 | 只删选中的画面；[8,10) 留黑色空档，原声保留，后段仍从10秒开始。不做自动闭合，不称完整成片 |
| 独立恢复版本 | 清空 runtime undo/redo 后调用已有 versions restore，再重开 | 返回已保存的原工程，与 undo 持久化分开验证 |

计数：7 次真实 CDP 鼠标按钮点击（加/换/撤销2次/重做2次/删），另有重载、版本恢复2个自动化步骤，receipt 共9步。选素材、设 In/Out、目标音轨、选中片段等前置准备通过现有函数/状态完成，不算“真人只要9步”，也不是全流程 UI 操作数基线。接缝前后播放用现有播放器1×从7秒起，500ms采样8次，卡与补画面均跨过8秒/10秒边界；未做人类听感评分。

快照逐字段核验；重载会删掉单成员 linkGroup 并重建其他联动 ID，因此比较实际组员关系，不忽略真实伙伴，也不忽略其他编辑参数。此归一化原因在原始快照可复查。

## 实际输出与阻塞

真实 `fastExport({profile:'prores422',silent:true})` 输出四份12秒 ProRes MOV：原工程、卡、补画面、版本恢复。使用同一浏览器 compositor，不用 FFmpeg 拼接冒充应用导出。导出后用 FFmpeg/ffprobe 解码逐帧：

- 每份360帧，共1440帧；PTS=序号/30，time_base=1/15360，首帧0、末帧11.966667，视频12秒。
- 卡与补画面的差异均恰在帧240–299，即 [8,10)；其余300帧分别与原工程逐像素一致。
- 版本恢复与原工程全部360帧逐像素一致。
- 四份导出音频彼此逐样本一致；**这只证明相对基线不变，不能证明原声音频全长保留**。
- 对照原始 WAV 后失败：源576000样本/声道（12秒），导出573440（11.946667秒），尾部短2560样本，即53.333ms。共有部分零偏移相关约0.999999965、增益比约0.999785，并非全片静音；仍不能放行全长原声保留。`prores422` 预设包含 `-shortest`，具体修法已交 Deja 决定，不在本验收任务擅自修改导出器。

未把带缺口卡或删除后黑屏称为完整成片。截图目视只确认合成卡可读、补画面与恢复画面，不代替连续播放、源内容标注或人工审批。

## 证据与早期运行

提交证据位于 `docs/validation/2026-11-05-draft-existing-loop/`，取自本地 `out/draft-loop-06`：各步工程JSON/浏览器截图/预览PNG、4份导出抽帧、逐帧framemd5和PTS、receipt、decoded-checks、源PTS及SHA256清单。runner 14项检查通过、cleanup两进程均已退出；解码检查12通过/1失败（源音频全长）。`*-viewing-copy.mp4` 是实际MOV的H.264观看副本，**不是MontClip直接输出**；MOV哈希在各自export.json/receipt中，原始MOV保留在该本地输出目录。观看副本有独立哈希，不能代替MOV逐帧测量。

早期运行如实保留在本机 out/，不计成功：

1. draft-loop-01：draft/x264 预设被现有外部FFmpeg设置检查拒绝；改用已有ProRes，不绕过权限或更改产品规则。
2. draft-loop-02/03：只排除已有A1，加载Source时新增A2伴随片段，音频集合检查失败。最终工程预置A1–A4并全部排除，原声检查通过；没有把该首次失败说成“默认自动保原声”。
3. draft-loop-04：保存重开比较被单成员linkGroup清除触发，其他字段一致；按实际联动关系比较后重跑。
4. draft-loop-05：操作通过；最初只比较四份音轨，后来加入源WAV对照暴露尾部缺失，checker保留失败。
5. draft-loop-06：加入实际播放采样、启动error处理和等待自己进程退出，14项工程检查及cleanup通过；源音频全长仍失败，作为提交的证据集。
6. draft-loop-07：仅再改用仓库静态检查能识别的cp.spawn写法并记录runner hash；14项工程检查通过，但浏览器退出未在10秒内确认，completed保守标false，checker拒绝读取。不计为成功；随后按记录PID只读核查，两进程都已不存在。本次未伪改receipt来放行，源音频缺失也未解决。

没有可比的人类基线，不报提速、30秒骨架、90%准确率。没有真实素材、全流程缺镜头UI、±1帧按钮、Linux/macOS实窗验证；VFR由先前独立cut-frame测试覆盖数据/实际解码，不称本CFR闭环已经覆盖VFR。

## 仓库回归记录

Windows 最终执行 `npm test -- --test-concurrency=2`：1748 项，1741 通过、0 失败、7 跳过，耗时 137.172 秒。跳过项为未下载的 ASR 模型2项、bundled FFmpeg/指定构建哈希2项、POSIX 权限/所有者3项。`node .github/scripts/release-check.js` 全部通过；两个新增 runner 的语法检查和 `git diff --check` 通过。既有切点相关定向回归58项通过。

此前默认并发回归首次仅失败于新 runner 的 spawn 别名无法被现有静态检查识别，改为 `cp.spawn` 后该检查2项通过；另一轮与浏览器导出并行的默认并发测试发生 MCP FLV import tools/call 超时，未计通过。最终降低测试并发独立重跑完整套件，不以局部重跑替代全量。默认并发环境稳定性尚未得到本轮确认。

这些单元/回归通过不覆盖上述原声音频尾部失败，也不覆盖 run07 的退出确认超时。Draft 仅提交现状证据、可复现脚本和已有行为测试；后续修法待 Deja 决定。
