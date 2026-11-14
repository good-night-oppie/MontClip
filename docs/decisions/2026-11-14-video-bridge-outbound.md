# ADR：把一小段画面发给外部视频模型挑毛病（视频桥，2026-11-14）

状态：已实现，待 QQ 核验（外发路径，独立 ADR）。
来源：MontClip#321（P0）。2026-11-14 增补：Deja 对第 1 步接口的决定 6867787475（agent 路径默认关闭、目的地同一判断、预热上限），PG 的增量产品决定 6868662787（B10–B13）。PG 决定 6867274922、6867466332、6867554263、6867587684、6867627361；Deja 排期 6867286474 和第 1 步范围；规格 v1 6867305928、v2 6867359530、v3 6867498484、v3.1 6867571539。实现 Cindy。
本文是独立设计，不依赖 SPEC.md，也不引用任何反编译内容。

## 背景

主播要在导出全片前，让一个能「看画面、听声音」的模型帮她看一眼某一段剪得对不对：人名牌挂错了人、剪切跳帧、吞字、字幕对不上、声音忽大忽小。本机没有这种模型，只能把这一小段发出去。这是 MontClip 第一次把**视频内容**发到本机以外，所以单独写 ADR，经 QQ 核验后才算合并条件。

## 发什么、发给谁

- **内容：** 这一段时间线（加上它前面最多 10 秒的「铺垫」，默认 3 秒）渲染出来的、重新压缩过的小视频，含声音。每次最多 3.2 MB；一次检查的这一段最长 30 秒，铺垫最长 10 秒（常量 `MAX_SPAN_S`/`MAX_LEAD_S`），超过直接 400，不渲染。画面是主播自己剪好的片子，里面可能有人脸、人声、直播间弹幕截图。
- **不发：** 原始素材文件、工程文件、文件名、路径、用户名、账号、观众昵称（除非它们就出现在这一段的画面里）、其他段落的画面。
- **项目里记下的审美笔记（B10）：** 每次检查都会把本项目已记下的「主播认可 / 否定过的例子」（`taste`，每条最多 200 字，最多 30 条，正例必须写明认可的是哪一方面；文字只在内存里，重启后没有）作为「仅供参考的文字」随请求发出。这是项目文字的一种，所以 `status` 的「发什么」里会写明「你的 N 条审美笔记」，有就一定写。它们由主播或 Agent 通过 `fablecut_review` 的 `taste_add` 写入，**不要写个人信息**（工具说明里写了）。主播可以在发送前看到条数，不想发就先删（`taste_remove`）或不点发送。
- **固定的剪辑标准（B10）：** 5 条主人已批准的标准（`RUBRIC`，代码里的英文常量）随每次检查发出。它们是固定文字，不含项目内容。
- **一次还是两次请求（B11）：** 默认（`mode:"single"`）同一小视频只发一次请求。`mode:"two_pass"`（深度审片推荐）会把**同一份小视频发两次请求**：第一次「盲看」只问看到、听到了什么，不带名字、不带编辑意图、不带标准、不带笔记；第二次把第一次的观察和标准、笔记一起带上做完整检查。确认框里写「分 2 次发送」，记录里写 `requests:2`。
- **可选的文字：** 默认（`scope: "window"`）**只发画面，不带任何工程文字**。主播明确选「带上这段里的字幕和切点」（`scope: "full"`）时，才把这一段内的字幕文本和切点时间作为「仅供参考的文字」放进提示词，最多 6000 字符，用 `<<<REFERENCE … REFERENCE>>>` 框起，并告诉模型它不是指令。
- **发给谁：** Google Gemini，经本机已安装的命令行工具 `agy`（主机 `daily-cloudcode-pa.googleapis.com`）。**这个主机名来自该工具的文档和 Python 参考实现，运行时没有验证，也验证不了：`agy` 自己决定连哪里、不告诉调用方（`--log-file` 的日志里只有本地语言服务的信息，没有对外地址；本机 Win11 的 `agy` 也未登录，无法实连）。** 所以 `destination()` 默认返回 `{service, host, source:"docs", verified:false}`。**QQ 要求：不能运行时确认的目的地必须 fail closed，不给例外。** 已照办：`verified:false` 时 `prepare` 直接 409 `DESTINATION_UNVERIFIED`，什么都不渲染、不发送（发送那一刻也再核对）。只有主人自己确认了地址（真机抓包核对）并设置 `MONTCLIP_REVIEW_DEST_CONFIRMED=daily-cloudcode-pa.googleapis.com`（必须与该主机逐字相同，别的值什么都不确认）时才变成 `verified:true, source:"owner-confirmed"`。**这意味着在主人确认之前，这个功能在整机上都发不出去**，包括主播点按钮这条路；有测试。Deja 要求「域名取自运行时实际要连的地址」，这一点我做不到，要么接受「文档地址 + 明说未验证」，要么真机抓包核一次（需要主播登录和一次真实发送，我没有授权去做）。同一个 `destination()` 用于三处：`status` 里展示的、**发送那一刻再核对一次的**（和 `prepare` 时展示的不一样就 409 `DESTINATION_CHANGED`，什么都不发）、记录里写的；有测试锁住。目的地不是由模型或调用方填的。
- **对方怎么用：** 按 Google 的说明，这类请求的内容**可能用于训练**。界面确认处、MCP 工具说明里都写明这一句。
- **谁的账号：** 用的是本机 `agy` 已登录的账号。MontClip 不读、不存、不转发它的任何密钥或令牌（见下「密钥」）。

## 谁触发、能不能关

1. **主播在编辑器里点：** 页面先 `prepare`（只渲染小样，什么都不发），随后展示「将发送：这一段约 N 秒的小视频（带声音）；发给：Google Gemini；可能用于训练」，主播点〔发送〕才 `send`。`send` 需要 `prepare` 之后服务器给这一次检查的**一次性令牌**（10 分钟内有效，用一次就作废，只给编辑器页面看，Agent 看不到）。
2. **Agent 替主播点：默认关闭（Deja 6867787475）。** 服务器只在环境变量 `MONTCLIP_REVIEW_AGENT_SEND=1` 时才接受 Agent 的 `send:true`（MCP `fablecut_review` 的 `check`）；没开时回 403 `AGENT_SEND_OFF`，什么都不渲染也不发。Agent 仍可 `prepare`（只渲染），由主播在页面点〔发送〕。**这个开关要等主人授权原文和范围核实后才打开；我在仓库和单里没找到「主人 11-12 授权」的原文（我最早写的接口 v0 里引用过这句，但我没有链接可附），所以这里不附，也不声称有。** 请 QQ 核验时向 Deja / 主人要原文；打开前先把链接和范围补进本节。若打开：Cindy 在对话里听到主播说「帮我看看这一段」，才用 `send:true` 调用。能力表里 `fablecut_review` 的风险等级是 `external`，和 `assistant_request`、`cloud_transcribe` 同属外发类（`agent-policy.js` 按它的等级和上限处理，本 PR 没有改 agent-policy，也没有在真机上验证它会弹哪张确认卡）；上限在 `capabilities.js` 的 `VIDEO`（每次 3.2 MB，每个打开的工程 100 MB；**100 MB 是我提的数，请 QQ 定**）。页面自己发 `send:true` 会被 403 拒绝。
3. **关闭：** 没有任何自动触发、定时触发或后台预发（B8 的预热还没做；做的时候也只在本机渲染，不发送）。主播不点、Cindy 没被要求，就不会发。发送前可取消（`cancel`，令牌立刻作废，已渲染的小样删除）；发送中取消会结束 `agy` 的进程树。卸载或不装 `agy` 时，`prepare` 直接回 `NO_BRIDGE`，什么都不渲染。
3a. **发出去的就是展示过的（ReviewInbox 对首个 head 的审查所指出的四点，已修，各有测试）：** 工程里的字幕文字和审美笔记在 `prepare` 那一刻就定下来（快照），之后改了字幕、加了笔记都不会随这次发送出去；`send` 时若打开的已是另一个工程，令牌作废（409 `PROJECT_CHANGED`），什么都不发；压缩副本还在做的时候取消，取消标志会在启动 `agy` 之前（两次请求之间也一样）被检查，`agy` 一次都不会启动（记录为 `no_result: CANCELLED`）；`gate` 以「最新的、涉及这一秒的检查」为准，之后对更小一段的检查发现问题（或被标 `recheck_needed`）就让那一段的通过失效，没检查成（`no_result`）不说明任何事。
4. 这是新的外发路径，不属于 `assistant_request` 的 `TEXT` 上限，所以在能力表里单独加了 `VIDEO`。

## 防护（照 Python 参考实现「gemini-video-bridge」的围栏移植，测试逐条锁住）

| # | 围栏 | 怎么做 | 测试 |
|---|---|---|---|
| 1 | 只有一个文件可读 | 每次检查新建空的临时目录，只放一份压缩副本 `video_input.mp4`；`agy` 以 `--mode plan --sandbox --settings {"allowNonWorkspaceAccess":false} --disable-slash-commands --output-format stream-json` 启动，当前目录就是这个目录 | `video-bridge.test.js` V1 |
| 2 | 工具调用核对 | 读 `stream-json`：必须**恰好一次** `read_file`，路径必须就是这份副本；出现任何别的工具（`run_command`、`write_to_file`…）或读别处，整次作废，结果是 `no_result: FORBIDDEN_TOOL`，不采用模型的话 | V5（含哨兵文件） |
| 3 | 只读、锁定 | 副本和目录在 POSIX 上 `0400`/`0700`；Windows 上 `icacls /inheritance:r /grant:r *<SID>:(R,DE,WA)`（文件）与 `(OI)(CI)F`（目录）并加只读属性 | V4 |
| 4 | 环境白名单 | 子进程只拿到 `PATH`、`HOME`/`USERPROFILE`、`TEMP`/`TMP`、`LANG`、`APPDATA` 等 22 个白名单变量（`ENV_ALLOWLIST`）；名单之外的**一律不传**，密钥类变量不在名单里。Windows 会自己补上 `USERNAME`、`USERDOMAIN` 等系统变量，测试只断言没有密钥 | 环境测试、`review-api.test.js`「没有密钥」 |
| 5 | 超时与进程树 | 超时（默认 420 秒 + 35 秒宽限）后结束整棵进程树，等它退出再删临时目录 | V7 |
| 6 | 模型的话只是数据 | 回答必须是一个 JSON；`type` 只认 `speaker_swapped/cut_jump/subtitle_mismatch/audio/continuity/over_explained_caption/punchline_spoiled/protected_region_occluded/other`，其余变 `other`；每段文字截断（发现 200、建议 200、总结 600、摘要 300、最多 20 条），控制字符去掉。**路径、链接、命令一律不执行、不打开、不当作授权**；`passed` 只由「检查本身通过」产生，任何 HTTP/MCP 调用都写不了（`mark` 拒绝 `passed`，400） | V6、`review-api.test.js` |
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
- **模型写的原话不落盘（QQ，#328）：** 模型的回答可能引用画面上的内容，包括观众昵称。所以 `reviews/<工程id>.json` 里**只存结构化字段**：时间点、类别（`type`）、四项结论的状态（不含理由）、检查的范围、`revision`、内容指纹、`mode`/`requests`/笔记条数、当时展示的目的地、标记（`mark`，不含备注）。**不存**：发现的文字和建议、总结、摘要、盲看的观察、各项理由、标记备注、纠正文字，也不存视频、提示词、`agy` 的路径或参数、临时目录。这些原话只放在当前进程的内存里供这一次查看（最多 200 条检查），进程退出就没了；重启后同一条记录返回 `textAvailable:false`，只有结构化字段。**升级前已经写到盘上的旧记录，在第一次被读到时就地清掉原话并重写文件。** 有合成昵称哨兵测试（`SENTINEL-NICK-7731`）：这次查看里能读到、磁盘上任何文件里都没有、重启后没有、旧文件被清理。若将来必须跨重启保存原话，先停下来报主人。**审美笔记（`taste`）的文字同样不落盘（QQ）：** 主播或 Agent 都可能把昵称写进去，工具说明只是软约束。磁盘上只留每条笔记的 id、`kind`、`aspect`、时间；文字只在当前进程内存里。重启后这些笔记还在列表里但 `textAvailable:false`，**不会被发送**（`willSend.tasteNotes` 只数还有文字的）。旧文件里的笔记文字第一次被读到时就地清掉。Agent 不会持久化任何自由文字。如果将来必须跨重启保存主播亲笔笔记，另提「仅主播可写、Agent 不可写」的独立路径并报主人，不放在现在的字段里。
- MCP 与 HTTP 的返回、`status`、记录里都没有密钥、`agy` 路径、临时目录（`review-api.test.js`「nothing secret…」断言）。服务器日志不打印提示词或回答。
- 测试用的是替身 `test/fixtures/fake-agy.js`，**不联网**；PR 证据里不贴视频、不贴模型回答原文，只贴数字和打码后的结果。真机 `agy` 的试跑（如做）也只记录状态和数量，不附内容。
- 密钥：团队密钥只用 1Password 引用；本功能不要求任何密钥写进仓库、日志、MCP 或工具返回。`agy` 的登录由它自己管理，MontClip 不碰。

## 四项分项结论（B12）与通过的硬规则

结果带 `dimensions: {fact, subtitle, pacing, packaging}`，每项 `passed | issues | insufficient_evidence` 加一句理由（≤200 字），**四项都必须有**，缺一项或出现别的值，整个回答作废（`no_result: BAD_OUTPUT`）。`status`：

- 任何一项是 `issues`，或这一段本身列出了问题 → `issues`。「名牌没贴反但画面里有说明书式花字」（`packaging: issues`）就算模型说了 `pass` 也是 `issues`，有测试。
- 没有 `issues`，但任一维是 `insufficient_evidence` → `no_result: INSUFFICIENT_EVIDENCE`（PG 6868846142 的口径）：既不通过也不算失败，什么都没查出来，具体哪几维缺证据列在 `dimensions` 里；补上下文或加长窗口即可消除。
- 其余才是 `passed`；`passed` 仍只由检查本身产生，`mark` 写不了。

## 第二轮终审（QQ 对 0c6106d0）的修改

1. **「页面」不能靠请求头认。** 令牌只发给带「页面 cookie」的请求：审片接口对还没有 cookie 的客户端，在第一次回答里给一个每次启动随机生成的 `mc_review_page`（HttpOnly、SameSite=Strict、Path=/api/review/，属性只写在 `embed.js` 一处；浏览器自己保存并带回，所以编辑器页面不需要为它写代码，而没有 cookie 罐的请求——MCP 工具、脚本——拿到了也不会再带回来）；只有 Origin / Sec-Fetch-Site 而没有这个 cookie 的请求是 Agent，看不到令牌、`/send` 回 403（有伪造头测试）。**诚实的边界：** 本机上自带 cookie 罐、有意去取的进程也能拿到这个 cookie，这和本机用户账号是同一条信任边界；所以它不是唯一的门——主人对目的地的确认、Agent 代发开关、一次性令牌各自独立存在。审片接口还**只接受本机连接**（`HOST=0.0.0.0` 时通过本机网络地址访问回 403 `NOT_LOCAL`，有测试）。`MONTCLIP_REVIEW_DEST_CONFIRMED` 和 `MONTCLIP_REVIEW_AGENT_SEND` 是服务器进程的环境变量，**Agent 不得设置或建议设置**，MCP/HTTP 都没有写它们的接口。
2. **发送前给主播看实际内容。** `willSend` 现在带 `projectText`（会随请求发出的这一段字幕和切点原文，scope full 时）和 `notes`（会发出的审美笔记原文），文字取自小样渲染完成那一刻；目的地的来源写成「主人确认」（`source:"owner-confirmed"`）或「文档，未验证」，**不写成运行时已验证**。渲染完成后若工程又被改过，旧画面不再发送（409 `PROJECT_EDITED`）。
3. **异常的模型输出不再可能变成通过或没有定位的 issues：** 有一条定位不了的发现（`t` 不是数字）整个回答作废（`BAD_OUTPUT`）；某一项写 `issues` 却没有任何发现可指也作废。
4. **不再卡死：** 写记录失败（例如磁盘满）→ 这次检查转为 `failed`、固定码 `STORE_FAILED`、不带路径，工程不再 BUSY；一直没确认的 `ready` 过了令牌期自动 `expired` 并释放；账本读不出来是错误（`LEDGER_UNREADABLE`），**不会当成空账本去覆盖**；写失败是 `LEDGER_UNWRITABLE`，都不含路径。没装 `agy` 在 `prepare` 时回 409 `NO_BRIDGE`（带结构化码）。
5. **原话不留在别处：** 每次检查结束后**删除**这次的 `agy` 会话文件（`brain/<id>`、`conversations/<id>.db`），不只是改权限；服务启动时把所有旧账本都清一遍（不管该工程有没有被打开），清不了就删文件，再不行就报固定码；静态文件兜底拒绝 `/reviews/`、`/previews/`（从仓库克隆运行时数据目录就是应用目录）；`.gitignore` 加了 `/previews/`、`/reviews/`。
6. **其余：** 提示词里只写相对名 `video_input.mp4`，不带这台电脑的路径；工具必须**恰好读一次**且读的是这份副本，没有路径的 DONE 不算、重复读取作废；锁权限没锁住（含 `icacls /remove:g` 失败）就不启动；`skeleton` 也展开合成片段里的字幕；每个工程发出的视频字节记账（`sentBytes`，每次 3.2 MB 的上限，每个工程 100 MB，超了回 409 `SEND_LIMIT`）；记录里加了每一遍实际发了什么（`passes`：类型、字节、提示词长度、是否带标准/工程文字/笔记条数/第一遍观察，没有文字）。
7. **60 秒门禁（PG 6869536456 的收窄）：** MCP `fablecut_export` 全片导出超过 60 秒，必须这一整段已有通过的视频检查（`gate`），否则拒绝；主人明令要导时可带 `bypassReason`，**原因文字不保存**，只记录「何时、哪一段」（`bypasses`）。小样、60 秒以内、编辑器自己的导出按钮不受影响。

**要 PG / JJ 书面决定的（我不替你们定）：** (a) 5 条标尺和 5 问现在是我按决定的意思写的英文，不是决定里的原文（V20 / V22）——要么给我原文，要么书面接受现在的写法；(b) B10b / B12a 的字段名和上限（`taste` 每条 200 字、最多 30 条；`dimensions` 四项各 200 字理由）与规格是否一致；(c) V21「重启后还在」与隐私门禁冲突，笔记和原话重启后没有了，请书面接受这个偏离。

## 工程不受影响

- 检查不改工程的 `revision`、IN/OUT、撤销历史：结果存在 `reviews/`，不写 `project.json`。
- 已知例外（早已存在，不是本功能引入）：无头页面加载工程时会自己存一次工程（revision +1、多一个 `agentLog`），在没有本功能的 main 上也一样。所以「检查是否过期」用**内容指纹**（去掉 `revision` 和 `agentLog` 后的规范化 JSON 的 SHA-256），不用 revision：工程内容一变，之前的 `passed` 立刻不再算数。
- 门禁（`gate`）：只在「这一份内容、这一段范围被某次真实的 `passed` 覆盖、且没被标 `recheck_needed`」时才回 `passed:true`。目前它是**只读核对**，不会拦导出；要不要做成硬门禁交 Deja/PG 定。

## 失败时怎么说

`no_result` 永远带原因（`NO_BRIDGE` 没装工具、`BAD_SAMPLE`、`TIMEOUT`、`FORBIDDEN_TOOL`、`BAD_OUTPUT`、`FAILED`、`CANCELLED`、`RENDER_FAILED`…），**从不当成通过**。界面上要写「这次没检查成」而不是「没问题」。

## 没做（下一批）

- B8：滑动窗口加铺垫的本机预热缓存（Deja 6867787475 定：最多 5 个、总计不超过 200 MB，超了先删最久没用的；本 PR 的 `previews/` 仍是 #325 的「最新 20 个、一天」，预热做的时候再收紧）；B9：`globalVideoContext` 与滚动摘要。
- B13：本机零外发的几何框和保护区审查卷（用工程里的坐标，FFmpeg `drawbox` 画在审查用的临时副本上，标签只用中性代号），作为紧接着的小补丁（Step 1.5）。外部定位/分割模型（YOLO、SAM、Meta Muse、OpenRouter）按 PG 说的：新依赖、新域名、新密钥，**不在本 PR**，要另单、QQ 核验、主人专项授权。`regionDetector` 适配口也还没留。
- Cindy 侧的 `montclip_preview_check` 工具（MontClip-Cindy，引擎先合，插件后合）。
- Deja 的两个按钮（第 2 步）直接用本 PR 的 `/api/review/*`。
- 真机 `agy` 联网试跑：需要主播确认账号和内容后再做，本 PR 只用替身。

## 待 QQ 核验、待 PG/Deja 定的点

1. 上面「发给谁」的文案与主机名是否够准（运行时未验证）。
2. `VIDEO` 的 100 MB 每工程上限。
3. Agent 的 `send:true`：默认已关；主人授权原文和范围、以及打开方式（现在是环境变量，是否要改成桌面设置里的开关）。
4. 门禁是否升级为导出前硬拦。
5. 目的地「文档地址 + 明说未验证」是否可接受，还是要真机抓包核一次。
6. 审美笔记作为项目文字随每次检查发出（有条数提示、可删）是否可接受。
7. （已按 PG 6868846142 定：四项任一缺证据都是 no_result。）

## 发送范围（PG 决定，#321 6871888446）

- `scope:"window"`（只发这一段，默认）：只发小视频和固定标准；**不带**审美笔记、字幕文字、剪辑时间点、全片上下文。prepare、ready 快照、实际发送载荷三处一致（`willSend.tasteNotes=0`、`notes=[]`、`projectText=""`）。每次 prepare 的确认令牌只对那一次有效，不能把别的检查的令牌用到这一次。
- `scope:"full"`：附带审美笔记，以及与小样区间相交的字幕条目——**整条发送**，可能包含片段前后的文字；`willSend.what` 明说这一点，`willSend.projectText` 给出实际文字，仍受长度上限约束；完全不相交的条目不发。
- 有铺垫时 `willSend.leadIn = {from,to,seconds}`，`what` 写出铺垫的起止和时长；`seconds` 是含铺垫的总时长。
- 目的地未核实：门禁不变（DESTINATION_UNVERIFIED，409 带 destination），由 QQ 另提方案。

## 固定措辞、字段与上限（PG 决定，#321 6871936322）

- 五条标准（`RUBRIC`）和五个问题（`QUESTIONS`）用已采用的原文逐字，测试用写在测试里的独立文字比对（不读回被测常量）；单轮检查和 two_pass 的第二遍都带标准、五问和固定要求「每问一条回答，带片内秒数和视听依据；缺上下文必须报 insufficient_evidence，不许编剧情」；两遍里的第一遍（盲看）不带这些。
- 笔记 `aspect` 取 fact/subtitle/pacing/packaging（旧词 caption 归 subtitle）；positive 的 other、缺失、未知值拒绝；negative 可不指定。`textAvailable` 表示文字是否还在本进程内；每工程最多 30 条、每条 200，满额报 TASTE_FULL，不静默淘汰；只有 `textAvailable` 且 scope 为 full 的笔记才随请求发送。页面提示：「文字只在本次运行保留，重启后需重新填写」。**跨重启保留文字（V21）未实现，隐私方案待定**，本 PR 不新开持久路径。
- 判决：`dimensions.{fact,subtitle,pacing,packaging}.{state,reason}`；有 `issues` 的维度必须有归属该维度的 finding（finding 的 `dimension` 由模型给出，或由类型推出；`other` 没给维度则不算任何维度的证据）。reason ≤100，observation ≤600，finding text/suggestion ≤200，summary ≤600，windowDigest ≤300，findings ≤20；字符上限按 UTF-16 code unit，先清控制字符再截，不留半个代理对。

## v4.1（PG 采用，#321 6871970875）

- 五条标准、五问、固定要求的期望值：已读回核对，并把三个 sha256 锚点（`eacb76d3…`、`db8b19fd…`、`871d39aa…`）固定在 `test/video-bridge.test.js` 里，离线运行，CI 不联网，评论改了也不会悄悄改期望值。
- 「只发这几秒」的文案固定为：`No subtitle text, edit points, or good/bad examples are attached; subtitles already burned into the picture still go out with the video.`；发送内容与之一致（`willSend.what`），并仍显示实际起止和总时长。「好坏例子」一句只在这次真的会发出有效笔记时才出现，条数取这次发送的快照。
- 重启后有几条笔记没了文字：`willSend.tasteLost`（scope=full）和 `GET /api/review/taste` 的 `lost`；页面据此写句子，不猜数字。
- **未完成，不算通过：** V21f（跨重启保留文字，隐私方案待定）；笔记的 source/note 字段（未实现，不伪造来源）。
