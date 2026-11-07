# PR 送审提示检查

两仓使用同字节的`rules.mjs`、`policy.json`、`teammates.json`与runner。无npm依赖。当前仅提示：步骤`continue-on-error: true`，不改分支保护或规则集；CI作业绿灯不等于模板通过，更不等于QQ批准。摘要区分通过、缺项、Draft跳过、需要QQ核验。

## 正文格式

前两行必须为：

```text
QQ 请审
负责人：BB
```

后续写非空的`改动：`、`复现：`、`测试：`。测试每个非空行必须有结果数字（如23/23、通过23失败0），或`没跑：具体原因`，不能只写通过、版本数字或没跑。HTML模板注释不算内容。

写`依赖：无`，或`依赖：#123（硬依赖，类型：代码）`；多项用分号分开。已明确软依赖可写`#123（软依赖）`。这是格式核验，不证明依赖无环或已完成。

GoodNightOppie须在API的请求审查人列表中，或已在该PR留下review（沿用督查既有“审过不算没送审”标准，口径另交Deja确认）；正文提名不算审查请求，review在此也不是批准。

文件分类见`policy.json`，两仓条目相同文件内分开列，交Deja确认：剪辑/导出触及`av`路径须有`音画同步：`；联网/外发触及`outbound`路径须有`外发：内容：…；接收方：…；能否关闭：…`。重命名前路径也检查。机器不证明读数或说明真实。

## 例外

```text
SOP 例外：测试 — 当前先做文档核读 — 证据：c1c25e38
```

项目用首行、负责人、改动、复现、测试、依赖、审查人、音画同步、外发之一；证据为HTTPS链接或稳定消息号。仅核格式，任何有效例外仍为“需要 QQ 核验”，不会返回机器通过。不读取外部证据、不宣称证明“无可辩驳”。错误格式不能豁免缺项。

## 安全与维护

新工作流仅`pull_request`的opened/edited/synchronize/ready_for_review/reopened；token权限仅contents/read与pull-requests/read。没有checkout、npm安装、PR源码导入或执行。`make-workflow.mjs`把本目录四份检查器文件以固定字节嵌入工作流，临时目录仅写这些静态字节并核SHA256；事件正文与GitHub API数据不进入shell、eval或动态导入。只有官方API被请求，不打印token、PR正文、patch、例外原因或链接。

文件API只使用文件名及previous_filename，review API只使用审查人元数据；文件未分页取全、API失败或PR已push会报检查未完成，不当通过。正文使用触发事件版本，edited事件会重新计算；后续head变化须使用最新事件。

嵌入方式使首次新增检查器的真实PR可运行，而不先把未审脚本写进main。工作流本身仍需QQ审查；修改检查器的PR不能用自身CI证明代码安全。将来改为必过检查，须QQ审过并向主人申请；本PR不改规则集，届时还需审查提示模式到阻挡模式的改动。

本地：`node --test scripts/pr-sop/rules.test.mjs`。修改规则后执行`node scripts/pr-sop/make-workflow.mjs`；测试核对生成内容与四份源文件哈希，不能仅手改workflow绕开一致性检查。
