# 嵌入 Cindy 时，编辑器属于哪个任务：绑在连接上（E5b），侧栏频道按任务分开（E3）

Status: 已裁决。E5b：QQ 在 MontClip-Cindy#18 选①（issuecomment-6723202388），实现 MontClip#251（合入 main `0524c96a`，QQ 批准绑定 `620ba9ca`）。E3：QQ 在 MontClip#215 选①（issuecomment-6726997672）。

这份 ADR 是补写的：#251 合入时没有单独的 ADR 文件。QQ 在 E3 裁决里要求把 E3 写进「E5b ADR 的后续一节」，所以这里先把 E5b 的决定按 #251 正文和 CLAUDE.md「Embedded in Cindy」记下来，再写后续。来源都是本仓库的 issue / PR 评论和代码；没有用到 SPEC.md 或逆向材料。

## 决定（E5b，#251）

- 一个 Cindy 页面框住所有任务的编辑器，它们共用一个 cookie 罐，所以 cookie 只说明「这是嵌入的编辑器」，不承载任务身份。
- worker 用 `X-MontClip-Session` 调 `POST /api/embed/ticket {project, session}` 登记一次性任务票据：256 位随机数，60 秒，只能用一次。
- 父页把票据放进编辑器第一次加载的地址（`?host=cindy&ticket=…`）。页面立刻从地址里去掉它，带上自己 SSE 连接的 id 调 `POST /api/embed/claim {ticket, conn}`，这条连接在内存里绑到该任务，连接关了绑定就没了。
- UI 命令和导出票据只投给绑了该任务的连接；没有就 409 `NO_EDITOR`。回执只认引擎下发的一次性命令 id。
- 伪造、重复、过期、别的引擎的票据一律 403 `TASK_TICKET_REFUSED`，不建立任何绑定。错误出口遮住票据（`tool-error.js`、`problem-redact.js`；#256 补了结构化键名）。

## 后续：E3，侧栏频道按任务分开（MontClip#215，QQ issuecomment-6726997672）

问题：插件的文稿 / 属性侧栏和编辑器是同一个引擎 origin 下的页面，旧 pin（`5b312e63`）用 `BroadcastChannel("montclip-editor")` 互通。BroadcastChannel 按 origin 共享，同时开着任务 A、B 时，A 的侧栏发 seek 会让 A、B 一起跳，B 的状态也会进 A 的侧栏，等于把 E5b 刚堵上的串号重新打开。用 projectId 过滤挡不住同一项目的两个任务。

决定（QQ 选①，② 引擎中转不做，③ 只按 projectId 过滤不接受）：

1. 频道名是 `montclip-editor:<channel>`。`channel` = HMAC-SHA256(引擎启动时 `crypto.randomBytes(32)` 的密钥, `project + "\0" + session`) 的前 128 位 hex。密钥不复用 embed token，不落盘，重启即换。任务 id 不允许含 `\0`（`TASK_ID_RE`），分隔符不会有歧义。
2. 只能经一次性任务票据拿到：编辑器在 claim 成功的回答 `{bound, channel}` 里拿；侧栏用自己的票据调 `POST /api/embed/channel {ticket}` → `{channel}`，不绑定任何连接，也收不到 UI 命令。票据被拒的情况和 claim 一样，403，不回后缀。
3. fail-closed：拿不到后缀就不开频道，不退回共用名。桌面单机（非嵌入）原来就不开这个频道，现在仍然不开。
4. 后缀只在页面内存里，不进地址、history、console 和错误文本。`channel` 键名的字符串值、以及 `channel=` / `channel:` 后面的 32 位 hex 由两个错误出口遮住。文字里只遮 32 位 hex 这个形状，是为了不把 `templates.js` 报错里的 `{channel: [{t, v}]}`、「audio channel: 2」这类正常文字弄乱（结构化键名照 QQ 原话全部遮）。
5. 频道上的消息不带身份：`editor-state` 是 `{type, time, playing, selId, revision}`（旧 pin 里的 `projectId` 去掉了）；编辑器只收 `{type:"seek", t}` 和 `{type:"hello"}`，多一个键、类型不对、`t` 不是非负有限数都丢掉。
6. 旧插件配新引擎：旧 `panel.js` 用不带后缀的名字，新引擎下的编辑器不在那个频道上，结果是侧栏 seek 没反应、不会串号。可以接受，但插件侧的侧栏改动（给侧栏一张票据，换后缀再开频道；侧栏不再读 `projectId`）要和这次引擎一起在 MontClip-Cindy#48 的同一次升 pin 里上。
7. 测试：`test/embed-host-channel.test.js`，照 #251 的 A/B 场景。

已知的小代价（QQ 接受）：同一任务在引擎存活期间后缀不变，一个 SSE 已断、还没重连的旧编辑器页面仍能收到同一任务侧栏的 seek。它本来就是这个任务的页面，不算串号。

哪些是独立想的：频道名带任务后缀、后缀由引擎用票据发放，是 QQ 在 #215 的裁决；HMAC 的具体算法、长度和不复用 token 是 QQ 的硬条件；文字规则只遮 32 位 hex、消息键名白名单、重连时同名不重开，是 Deja 实现时定的，理由写在上面。
