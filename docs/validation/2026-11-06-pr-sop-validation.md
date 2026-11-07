# PR SOP 提示检查验证

只增加送审元数据规则与提示工作流，不改产品运行时代码、不设必过检查、不改别人的PR。

- 同字节规则核心/runner/分类/名单：见scripts/pr-sop/SHA256SUMS；两仓与本地督查适配副本六份文件逐字节核对。
- 核心规则24/24通过，含逐项缺失、共用账号、例外格式、文件条件、只读API分页、生成工作流一致性与真实执行嵌入检查器的测试。
- 督查适配副本221/221通过，直接导入同一rules.mjs；只在BB副本验证，未改线上脚本/台账/Inbox。
- 本地完整npm test：1973项，1826通过、15失败、132跳过。干净基线b907d0e884447d9303abddc1d8b33058d60f6212：1949项，1802通过、同样15项失败、132跳过；失败名称逐项相同，集中在听写/媒体子进程场景。不能称全套通过，不在本PR修复已有环境或基线问题。
- node .github/scripts/release-check.js：命令1/1成功。
- 实际PR与CI链接由送审正文/交付报告提供，未预造。edited事件重新核对正文。分类表单列2026-11-06-pr-sop-classification.md，待Deja确认。

机器只核模板与例外格式，不验证证据真实性或代替QQ审查。真实GUI/媒体、线上督查部署后验证没跑；不在本任务范围。无token/密钥/录像/用户数据入库。

## 追加范围：阻断检查

主人新要求取代先前提示模式。检查改名sop-pr-lint，移除continue-on-error，补四类标签/审查人事件与issues:read。规则回归27/27通过，含标签添加者、移除重加、正文与标签竞态、退出码回归。原测试数字仅对应原版；未改产品运行代码，沿用上节产品基线证据。未修改规则集、线上督查、台账、Inbox或别人PR。

## #188 文档同步增量

按Deja本轮要求，以已关闭#188（7c21b11177970394e8026cae97966f8600be69c6）的Review handoff与Draft预审说明为底稿，更新AGENTS.md及2026-11-01-development-workflow.md第5条。统一首行QQ 请审、第二行实际负责人、改动/复现/测试/依赖及按文件触发的音画同步/外发/SOP例外字段；删除旧正文使用@标签可免改的条款。保留Draft入箱与预审不等于自动审查/批准的区分，追加第二行负责人及SOP小时跟进指针。

本增量未改规则代码或产品运行代码。node --test scripts/pr-sop/rules.test.mjs 27/27通过，release-check 1/1通过；本次未重跑产品全套，复用上节已记录的候选/干净基线15个同名失败对照。QQ此前三项安全修改意见仍待范围冲突裁决，此文档增量不表示已修完或获准合并。

## 审查人补充验证

按Deja代QQ转交的第5项补充：批准后请求清空仍通过；从未请求且无review失败；旧head有最近review但当前未请求，只给notice不失败。三项回归已加入，共30/30通过；runner实际验证notice分支返回0。两仓与督查候选共享相同规则代码，保留当前head正式批准的独立检查。本轮未改产品运行代码，复用已有产品失败/基线对照；真实CI待当前head运行回执。


## Deja七项修订（2026-11-07）

两仓规则/runner/分类表逐字节一致，见scripts/pr-sop/SHA256SUMS。规则回归37/37；联网扫描回归9/9；合计46/46。扫描固定main全SHA，只读blob不执行。MontClip main 542脚本，排除39份docs/demo副本，扫描503份，80份潜在联网接口均已分类；Cindy main 23脚本，7份潜在接口均已分类。README恢复原始基线；文档改在AGENTS Review handoff及开发流程ADR第5条。

MontClip npm test 1995项：1848通过、15失败、132跳过；15项失败名称与先前同分支干净基线完全一致。Cindy npm test 27/27通过。没跑：真人媒体、人工GUI和音画同步验收，本轮没有修改产品执行路径。实际PR正负控CI及只读缺项审计随送审包附上；本文件不冒称尚未完成的CI通过。


## 标签绑定head增量

按Deja裁决：核验GoodNightOppie加标签执行人、之后未移除、created_at严格晚于当前完整head可靠timeline事件时间。缺可靠时间失败，禁止把Git提交时间/PR updatedAt当进入时间。正文不绑定，摘要提示人工重新核验例外行。GitHub官方committed字段无created_at，当前真实#200/#21无强推记录，不能以提交时间给例外放行。普通无例外PR不受此限制。
真源：https://docs.github.com/en/rest/using-the-rest-api/issue-event-types#committed

标签绑定本轮：规则46/46，联网覆盖9/9，两仓各55/55通过；督查共享适配5/5。全库媒体证据沿用上轮70a40253/444abc9c，不冒称在新head重新执行。只改标签元数据路径，相关增量回归已执行。


## QQ CHANGES_REQUESTED与Deja替代裁决：review核验版

替代pull_request为可信pull_request_target；替代标签/时间为GoodNightOppie当前head APPROVED/COMMENTED review的精确逐项行；QQ从实现名册移除；server.js双类均要求。仅read权限，无checkout、PR代码/依赖执行、cache/artifact/secrets。

尚待裁决：pull_request_review同样取PR merge workflow，直接并入同名检查会重开绕过，当前候选没有启用此不可信自动入口。澄清投递被WAIT_FOR_PEER阻止；不是已获得新裁决。主分支无此工作流，首次PR不能取得自身target实测；提供本地可信基线实际执行与攻击负控，旧CI只算历史。来源：https://docs.github.com/en/actions/reference/security/securely-using-pull_request_target 。此增量的测试数字见送审包，未宣布生效。
