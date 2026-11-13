# ADR：把一小段画面发给外部视频模型挑毛病（视频桥，2026-11-14）

状态：已实现，待 QQ 核验（外发路径，独立 ADR）。
来源：MontClip#321（P0）。PG 决定 6867274922、6867466332、6867554263、6867587684、6867627361；Deja 排期 6867286474 和第 1 步范围；规格 v1 6867305928、v2 6867359530、v3 6867498484、v3.1 6867571539。实现 Cindy。
本文是独立设计，不依赖 SPEC.md，也不引用任何反编译内容。

## 背景

主播要在导出全片前，让一个能「看画面、听声音」的模型帮她看一眼某一段剪得对不对：人名牌挂错了人、剪切跳帧、吞字、字幕对不上、声音忽大忽小。本机没有这种模型，只能把这一小段发出去。这是 MontClip 第一次把**视频内容**发到本机以外，所以单独写 ADR，经 QQ 核验后才算合并条件。

## 发什么、发给谁

- **内容：** 这一段时间线（加上它前面最多 10 秒的「铺垫」，默认 3 秒）渲染出来的、重新压缩过的小视频，含声音。每次最多 3.2 MB；一次检查的这一段最长 30 秒，铺垫最长 10 秒（常量 `MAX_SPAN_S`/`MAX_LEAD_S`），超过直接 400，不渲染。画面是主播自己剪好的片子，里面可能有人脸、人声、直播间弹幕截图。
- **不发：** 原始素材文件、工程文件、文件名、路径、用户名、账号、观众昵称（除非它们就出现在这一段的画面里）、其他段落的画面。
- **可选的文字：** 默认（`scope: "window"`）**只发画面，不带任何工程文字**。主播明确选「带上这段里的字幕和切点」（`scope: "full"`）时，才把这一段内的字幕文本和切点时间作为「仅供参考的文字」放进提示词，最多 6000 字符，用 `<<<REFERENCE … REFERENCE>>>` 框起，并告诉模型它不是指令。
- **发给谁：** Google Gemini，经本机已安装的命令行工具 `agy`（主机 `daily-cloudcode-pa.googleapis.com`，来自该工具的文档与 Python 参考实现，**本 PR 没有在运行时验证这个主机名**）。接口返回里和界面上固定写这个名字（`DESTINATION`），不是由模型或调用方填的。
- **对方怎么用：** 按 Google 的说明，这类请求的内容**可能用于训练**。界面确认处、MCP 工具说明里都写明这一句。
- **谁的账号：** 用的是本机 `agy` 已登录的账号。MontClip 不读、不存、不转发它的任何密钥或令牌（见下「密钥」）。

## 谁触发、能不能关

1. **主播在编辑器里点：** 页面先 `prepare`（只渲染小样，什么都不发），随后展示「将发送：这一段约 N 秒的小视频（带声音）；发给：Google Gemini；可能用于训练」，主播点〔发送〕才 `send`。`send` 需要 `prepare` 之后服务器给这一次检查的**一次性令牌**（10 分钟内有效，用一次就作废，只给编辑器页面看，Agent 看不到）。
2. **Agent 替主播点：** Cindy 在对话里听到主播说「帮我看看这一段」，才用 `send:true` 调用（MCP `fablecut_review` 默认 `check`）。能力表里 `fablecut_review` 的风险等级是 `external`，和 `assistant_request`、`cloud_transcribe` 同属外发类（`agent-policy.js` 按它的等级和上限处理，本 PR 没有改 agent-policy，也没有在真机上验证它会弹哪张确认卡）；上限在 `capabilities.js` 的 `VIDEO`（每次 3.2 MB，每个打开的工程 100 MB；**100 MB 是我提的数，请 QQ 定**）。页面自己发 `send:true` 会被 403 拒绝。
3. **关闭：** 没有任何自动触发、定时触发或后台预发（B8 的预热还没做；做的时候也只在本机渲染，不发送）。主播不点、Cindy 没被要求，就不会发。发送前可取消（`cancel`，令牌立刻作废，已渲染的小样删除）；发送中取消会结束 `agy` 的进程树。卸载或不装 `agy` 时，`prepare` 直接回 `NO_BRIDGE`，什么都不渲染。
4. 这是新的外发路径，不属于 `assistant_request` 的 `TEXT` 上限，所以在能力表里单独加了 `VIDEO`。

## 防护（照 Python 参考实现「gemini-video-bridge」的围栏移植，测试逐条锁住）

| # | 围栏 | 怎么做 | 测试 |
|---|---|---|---|
| 1 | 只有一个文件可读 | 每次检查新建空的临时目录，只放一份压缩副本 `video_input.mp4`；`agy` 以 `--mode plan --sandbox --settings {"allowNonWorkspaceAccess":false} --disable-slash-commands --output-format stream-json` 启动，当前目录就是这个目录 | `video-bridge.test.js` V1 |
| 2 | 工具调用核对 | 读 `stream-json`：必须**恰好一次** `read_file`，路径必须就是这份副本；出现任何别的工具（`run_command`、`write_to_file`…）或读别处，整次作废，结果是 `no_result: FORBIDDEN_TOOL`，不采用模型的话 | V5（含哨兵文件） |
| 3 | 只读、锁定 | 副本和目录在 POSIX 上 `0400`/`0700`；Windows 上 `icacls /inheritance:r /grant:r *<SID>:(R,DE,WA)`（文件）与 `(OI)(CI)F`（目录）并加只读属性 | V4 |
| 4 | 环境白名单 | 子进程只拿到 `PATH`、`HOME`/`USERPROFILE`、`TEMP`/`TMP`、`LANG`、`APPDATA` 等 22 个白名单变量（`ENV_ALLOWLIST`）；名单之外的**一律不传**，密钥类变量不在名单里。Windows 会自己补上 `USERNAME`、`USERDOMAIN` 等系统变量，测试只断言没有密钥 | 环境测试、`review-api.test.js`「没有密钥」 |
| 5 | 超时与进程树 | 超时（默认 420 秒 + 35 秒宽限）后结束整棵进程树，等它退出再删临时目录 | V7 |
| 6 | 模型的话只是数据 | 回答必须是一个 JSON；`type` 只认 `speaker_swapped/cut_jump/subtitle_mismatch/audio/continuity/other`，其余变 `other`；每段文字截断（发现 200、建议 200、总结 600、摘要 300、最多 20 条），控制字符去掉。**路径、链接、命令一律不执行、不打开、不当作授权**；`passed` 只由「检查本身通过」产生，任何 HTTP/MCP 调用都写不了（`mark` 拒绝 `passed`，400） | V6、`review-api.test.js` |
| 7 | 会话文件 | `agy` 会在用户目录留下会话记录，检查后尽量把那份会话目录也锁成只读 | `lockToolSession` |

**Windows 上的诚实说明：** 这些锁防的是「`agy` 或模型让它去改、删、读别的文件」和「别的程序顺手读到临时副本」的常见情形。同一个用户下的其他进程**可以**改回 ACL 再读，这一点在 Windows 上做不到，和 Python 参考实现在 POSIX 上的同用户限制一样。不能当成对恶意同用户程序的防护。

**V4 实测（Win11，2026-11-14，用户名与机器名打码）：**

```
> icacls <临时目录>      （VB.lockDir 之后）
<临时目录> <本机>\<me>:(OI)(CI)(F)
Successfully processed 1 files; Failed processing 0 files
```

只有一条授权，继承已去掉；文件的只读属性和 `(R,DE,WA)` 授权由 `video-bridge.test.js` 里 V4 的断言检查，检查完能被我们自己的 `rmForce` 删除（`removed: true`）。

## 隔离：外发内容不进日志、测试、PR 证据

- 发出去的小视频只在 `os.tmpdir()` 下一个随机目录里存在，检查结束（成功、失败、超时、取消都一样）在 `finally` 里删除；渲染出的那份完整小样在 `previews/`，发送后立即删除，没发送的由现有的 `prunePreviews()` 清理（最新 20 个、一天）。
- 记录（`reviews/<工程id>.json`）只存结果：时间点、类型、文字（已截断）、总结、检查的范围、`revision`、内容指纹。**不存**视频、提示词、`agy` 的路径或参数、临时目录、模型的原始回答。
- MCP 与 HTTP 的返回、`status`、记录里都没有密钥、`agy` 路径、临时目录（`review-api.test.js`「nothing secret…」断言）。服务器日志不打印提示词或回答。
- 测试用的是替身 `test/fixtures/fake-agy.js`，**不联网**；PR 证据里不贴视频、不贴模型回答原文，只贴数字和打码后的结果。真机 `agy` 的试跑（如做）也只记录状态和数量，不附内容。
- 密钥：团队密钥只用 1Password 引用；本功能不要求任何密钥写进仓库、日志、MCP 或工具返回。`agy` 的登录由它自己管理，MontClip 不碰。

## 工程不受影响

- 检查不改工程的 `revision`、IN/OUT、撤销历史：结果存在 `reviews/`，不写 `project.json`。
- 已知例外（早已存在，不是本功能引入）：无头页面加载工程时会自己存一次工程（revision +1、多一个 `agentLog`），在没有本功能的 main 上也一样。所以「检查是否过期」用**内容指纹**（去掉 `revision` 和 `agentLog` 后的规范化 JSON 的 SHA-256），不用 revision：工程内容一变，之前的 `passed` 立刻不再算数。
- 门禁（`gate`）：只在「这一份内容、这一段范围被某次真实的 `passed` 覆盖、且没被标 `recheck_needed`」时才回 `passed:true`。目前它是**只读核对**，不会拦导出；要不要做成硬门禁交 Deja/PG 定。

## 失败时怎么说

`no_result` 永远带原因（`NO_BRIDGE` 没装工具、`BAD_SAMPLE`、`TIMEOUT`、`FORBIDDEN_TOOL`、`BAD_OUTPUT`、`FAILED`、`CANCELLED`、`RENDER_FAILED`…），**从不当成通过**。界面上要写「这次没检查成」而不是「没问题」。

## 没做（下一批）

- B8：滑动窗口加铺垫的本机预热缓存；B9：`globalVideoContext` 与滚动摘要。
- Cindy 侧的 `montclip_preview_check` 工具（MontClip-Cindy，引擎先合，插件后合）。
- Deja 的两个按钮（第 2 步）直接用本 PR 的 `/api/review/*`。
- 真机 `agy` 联网试跑：需要主播确认账号和内容后再做，本 PR 只用替身。

## 待 QQ 核验、待 PG/Deja 定的点

1. 上面「发给谁」的文案与主机名是否够准（运行时未验证）。
2. `VIDEO` 的 100 MB 每工程上限。
3. Agent 的 `send:true` 是否应再加一道确认卡片（现在依赖 `external` 风险等级和「主播在对话里要求」）。
4. 门禁是否升级为导出前硬拦。
