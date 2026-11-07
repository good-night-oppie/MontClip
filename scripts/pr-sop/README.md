# PR 送审检查 sop-pr-lint

两仓与本地督查使用逐字节一致的共享规则，无新增依赖。固定检查名为 sop-pr-lint；缺项、API失败、未核验例外返回非零退出码。没有允许失败或路径过滤。草稿成功跳过，转为待审重新检查。

正文前两行必须为「QQ 请审」和「负责人：<伙伴名>」。名单为 Deja、QQ、Rea、VV、JJ、DD、BB、GG、Cindy；共用账号无效。改动、复现、测试不能为空；测试每个非空行须有结果数字，或「没跑」加具体原因。依赖写「无」或「#123（硬依赖，类型：代码）」；软依赖写清软依赖。请求审查人须有GoodNightOppie，或已留下review（沿用督查口径，待Deja确认；不代表批准）。

文件分类见policy.json和docs/validation/2026-11-06-pr-sop-classification.md。剪辑/导出须音画同步行；联网/外发须「外发：内容：…；接收方：…；能否关闭：…」。重命名前路径也核对。机器只核格式，不证明说明或测试真实。

## 例外与标签

格式：「SOP 例外：测试 — 当前先做文档核读 — 证据：https://github.com/good-night-oppie/MontClip/issues/200」。项目可为首行、负责人、改动、复现、测试、依赖、审查人、音画同步、外发；证据须HTTPS链接或稳定消息号。

格式错失败。格式正确也先失败并提示「等 QQ 核验」。只有当前存在sop-exception-verified标签，且完整issue events里最后一次相关增删记录为GoodNightOppie添加，例外项才放行。他人重加、标签已移除、事件不全不放行。标签不能豁免其他缺项或API错误。

限制：标签事件不记录添加当时正文和完整head，不是当前head的正式批准；本程序不宣称证明QQ核验了新版本的具体材料。QQ须在例外材料变化后重新核验；自动版本绑定的进一步规则待Deja/QQ裁决，不以updatedAt假装版本证据。

## 安全、权限与生效

只监听pull_request：opened、edited、synchronize、ready_for_review、reopened、labeled、unlabeled、review_requested、review_request_removed。无路径过滤。只读contents、pull-requests和issues；增加issues:read仅为读取每个PR的标签增删执行人事件，不开写权限。API固定GitHub官方地址，仅GET，分页有界，前后核head/正文/Draft/标签和事件变动。旧正文事件不能覆盖新正文检查。

无checkout、PR代码执行、安装依赖或打印token。静态检查器字节嵌入工作流并核哈希，支持首次新增检查器PR；哈希只证明一致性，QQ仍需核工作流本身。规则源改动后运行node scripts/pr-sop/make-workflow.mjs，并运行node --test scripts/pr-sop/rules.test.mjs。

主人已同意必过方向，但生效顺序仍为BB交PR→QQ审→Deja定合并及生效时间→QQ用GoodNightOppie设置两仓main必过检查并读回。BB不改规则集；工作流返回失败不等于规则集已经生效。生效前现有PR缺项仅列清单，不改别人的PR。
