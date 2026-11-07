# PR送审检查 sop-pr-lint（review核验版，待复审）

来源：QQ在MontClip#200 @183af9ac和MontClip-Cindy#21 @1075445c的CHANGES_REQUESTED，以及Deja本轮裁决。取代原pull_request触发、标签/时间核验、QQ可作实现负责人三项；原缺项失败、当前head证据和职责分工保留。本次仍不修改规则集或执行合并。

## 正文与分类

第一物理行「QQ 请审」，第二物理行「负责人：<伙伴名>」。实现名单：Deja、Rea、VV、JJ、DD、BB、GG、Cindy。QQ是审查人，不作负责人；QQ写PR时由Deja指定实际负责人，共用作者账号也无效。

改动、复现、测试非空；测试每行有结果数字或「没跑」加原因；依赖写无或#编号并说明类型。审查请求或历史GoodNightOppie review满足送审；只有旧head review时只提示重新请审，不冒充当前批准。

policy.json和classification文档列出路径。MontClip的server.js明确同时触发音画同步和外发，两段必须提供；docs/demo/**原样副本排除，重命名前路径也检查。改动文件里出现`.github/workflows/**`或`.github/actions/**`（含重命名前路径）时，机器不能放行，状态为needs_qq，摘要只列文件名、不打印文件内容；这类改动可能新增或改写同名检查job。确需合入时，按同一格式写`SOP 例外：工作流 — 原因 — 证据：<HTTPS链接或消息号>`，并由GoodNightOppie在当前head的APPROVED或COMMENTED review中写精确一行`SOP 例外已核验：工作流`；旧head不算，缺任一项仍为needs_qq。联网扫描在普通测试中只读main blob，不导入执行源码，非元数据工作流checkout。

## 例外改用当前head的review

PR中格式：「SOP 例外：测试 — 原因 — 证据：<HTTPS链接或消息号>」。机器只核格式；每个项目都要有匹配的核验。

只有GitHub API中GoodNightOppie提交的review、commit_id等于当前完整head、state为APPROVED或COMMENTED、正文有精确整行「SOP 例外已核验：测试」，才覆盖对应项目。多个项目逐项对齐，可由多个有效review覆盖。旧head、其他账号、DISMISSED/PENDING/CHANGES_REQUESTED、项目不符、引用或代码块均不算。标签和timeline不再参与。QQ负责人资格不能靠例外恢复。

不做PR正文SHA绑定。job摘要固定提醒：「例外内容以 QQ 提交核验review时的正文为准，改了例外内容请重新请 QQ 核验」。其他缺项不因一个例外被放行。前后读取review的账号、head、state、正文并比较，撤销/编辑竞态导致失败。不打印PR正文、review正文、例外理由、token或证据URL。

已知限制：GoodNightOppie是团队共享审批账号，只证明该账号做过操作，不能证明QQ本人。主人已接受该分工；QQ仍须在review说明核了什么，真实性靠人工把关。机器通过不替代正式批准、媒体/界面验收或main CI。

## 信任边界与人工重检

当前候选只启用pull_request_target的opened、edited、synchronize、ready_for_review、reopened、review_requested、review_request_removed，以及merge_group的checks_requested；工作流与job名固定sop-pr-lint。静态Node检查器内嵌并核SHA256；不checkout、不执行PR代码/依赖、不使用cache/artifact/secrets。只有contents:read、pull-requests:read、issues:read，无写权限、无路径过滤。PR正文、标题、分支名不插入shell；正文只从事件/API JSON读取。merge_group阶段没有PR正文，直接返回通过并在摘要写「合并队列阶段不重复检查，PR 阶段已检查」；权限不变，不读取API。

**主人本轮已选择「仅target，人工重跑」**，取代此前追加pull_request_review自动触发的要求。唯一PR检查入口为pull_request_target；不启用pull_request_review。该事件运行时GITHUB_SHA是PR最后merge commit、GITHUB_REF是refs/pull/N/merge，即使用PR可修改的工作流，会重新打开「PR改检查放行自己」的入口；QQ在当前head的CHANGES_REQUESTED也确认当前没有review触发是对的。QQ提交当前head的例外核验review后，人工重跑匹配当前完整head、正文及规则版本的最新可信target运行。若head、正文或可信规则版本已变，先触发新的target（例如编辑PR正文），不重用旧结果。

同名伪造残余风险：PR可新增`on: pull_request`工作流，把job也取名sop-pr-lint并让它永远成功。当前防线是工作流/动作文件改动一律判needs_qq、QQ必审、按run核对event与head，不接受同名成功；根治为规则集「Require workflows to pass before merging」，能力核查与未决项见`docs/decisions/ADR-004-pr-sop-workflow-trust.md`。BB不改规则集。

人工操作：QQ用GoodNightOppie执行`gh run rerun <run-id>`重跑最近一次sop-pr-lint；重跑前核对run的完整head、事件和规则哈希。也可在Actions页面选Re-run jobs / Re-run all jobs。重跑沿用原运行SHA、ref及权限，需有仓库write权限的操作者执行；检查器本身仍只读，不增加actions:write。不能重跑旧pull_request运行冒充target。核验review发生后本程序每次都会重新从API读取review。

重跑语义来源：https://docs.github.com/en/actions/how-tos/manage-workflow-runs/re-run-workflows-and-jobs

官方来源：https://docs.github.com/en/actions/reference/security/securely-using-pull_request_target

两仓main目前都不存在本工作流，因此首次交审不能触发自身新增target工作流。本地可信基线夹具会实际执行内嵌检查器，证明PR伪造workflow/rules为exit0不会被执行；这不是已在main上线的真实target CI。旧pull_request CI链接仅作历史，不冒充新target实测。合入及真实验证仍由QQ审、Deja定顺序后执行，BB不合并或设置必过。

## 复现

运行 `node scripts/pr-sop/make-workflow.mjs` 后执行 `node --test scripts/pr-sop/*.test.mjs`。规则、runner、名单和分类应两仓逐字节一致。触发方案已按主人选择确定；首次main启用、真实target验证与QQ安全复审仍须完成，不能仅凭本地测试宣布统一生效。
