# 第二阶段代码审查与发布准备

2026-10-22 新增运行范围：用户恢复实时内容知识点归属开发，本轮实现课程材料保存/读取并验证 Octos 应用分析入口。请先看[实施进展](GENERATED_TOPIC_PROGRESS.md)及对应代码增量；下文最后两处维护修复的自查、旧候选审查和英文草稿不自动覆盖本轮新功能。产品 PR 尚未创建。

当前状态（2026-10-22）：基础学习记录已有实现和验收证据；旧候选的终轮独立审查完成，本轮另对 867f468 / f28cda2 完成作者增量自查，未发现新增需修复问题。这不代替其他 agent 的独立审查。速度结论仍未确定，新候选尚未做设备复验。未创建产品 PR、未合并产品分支、未发布公网。自动知识点关联的讨论暂缓，仍是未完成目标。

最新增量：原 APK 47a1843 的验收不覆盖本轮 867f468 / f28cda2。免费覆盖复核发现并修复两处后台维护遗漏，新 40 对测量已完成但速度仍未确定，见[报告](PERFORMANCE_EVIDENCE_REVIEW.md)。新增代码的重点审查范围为 `git diff 53d53d3..f28cda2 -- src/learning scripts/benchmark-learning-history-playable.mjs`；新候选未安装电视，仍需针对性复验。以下原审查范围及历史证据按原提交理解。

2026-10-22 收尾范围调整：用户已同意先整理已有交付和验收结论，再审查最后两处修复；进一步计时差异定位暂缓，不默认新增测试专项。速度结论仍未确定，合并前要求保留。现有记录能力、尚未实现的知识点关联和未发布边界须分别说明。

## 本次交付能回答什么

| 学生或老师想知道什么 | 目前实际能做到什么 | 边界 |
|---|---|---|
| 这堂课学过几遍，播放过哪些部分？ | 保存学习实例、实际播放证据、作答和提示记录，可展开原始记录；回放同一遍不重复计遍，明确重新开始另记一遍 | 只统计开始采集后有依据的内容；播放不证明掌握，生成不等于学完 |
| 断网或退出后，记录还在吗？ | 设备先保存，联网且课堂空闲后补传；重复上传不重复计数 | 服务端路径有隔离进程验收；电视验收的是本地保存、重开与冷启动，公网补传尚未验收 |
| 直接调用 Learning Coach 的原始问答能进入 Octos 吗？ | 产品持久保存交付任务，使用原始内容和固定编号追加；两端重启、丢回执重试已验收 | 送达不等于 Octos 已提炼出某条长期记忆，也不等于下一堂课已读取它 |
| 学生反复学了几次三角函数？ | 有原始课程和问答可查 | 任意问题/生成课尚未可靠关联知识点，不能提供这个知识点的准确次数；预制课对应表也未启用 |
| 老师会因此记住进度、换一种讲法吗？ | 目前准备了可供后续使用的事实与交付链路 | 生成端尚未接入事实和相关记忆；老师成长属于后续阶段 |

因此建议本次交付名称为“可靠学习记录与原始问答交付”。原始事件核查界面用于验收和排障，最终学生界面尚未定稿。本次工作为后续教学提供依据，不宣称已经交付个性化老师。

## 最后两处修复的增量自查

审查对象：`867f468` 的维护暂停判断及五项回归、`f28cda2` 的生成等待判断；同时阅读相关协调器、持久队列和服务端任务恢复代码。`e9639c4` 的完整前端场景作为既有验证依据。运行源码与 f28cda2 一致，本轮没有新增运行代码或扩大测试。

| 核对事项 | 结论与依据 |
|---|---|
| 已经发出请求时开始上课 | 不强行取消当前写入。同步器先校验响应、保存上传回执或删除信息，再在下一次请求前退出；不会把已送达记录误当成未保存而丢弃 |
| 原问答追加或删除已执行 | 当前这一项继续保存有效回执；下一项开始前检查课堂和账号状态。专用连接仍在 finally 中关闭；任务内容和认证归属未改 |
| 已领取但没有执行的任务 | 服务端继续保留，30 秒后允许重新领取；旧编号不能确认已重新分配的任务。问答仍须先交付学生原问题，再交付对应回复。这里可能延后恢复，不承诺课堂一结束就全部完成 |
| 课堂空闲后继续 | 忙碌转为空闲会安排同步；未完成事实、问答和删除计数会保留重试，间隔由 30 秒逐步增加至最多 5 分钟。记录上传的两项协调器回归已验证恢复后完成且不重复 |
| 首份课程还没到时 | 直接课程 action 被接受后，生成任务状态独立参与忙碌判断，覆盖“提交等待已结束、播放器尚不存在”的空档；终态按既有任务事件清除，未改变原音频归属逻辑 |
| 账号切换和页面退出 | 新任务仍检查所捕获账号；旧连接使用原凭据。组件清理释放本课堂忙碌标记，持久事实和任务不会因此删除。这里只停止后续维护，不承诺撤回已经发送的请求 |

结论：本次自查未发现需要继续修改代码的问题。复用了已有 5 项新回归、23 项针对性测试、1227 项完整单元和 public 构建；重新核对三个关键日志的 SHA-256 与[证据 JSON](PERFORMANCE_EVIDENCE_REVIEW.json)一致，没有重新跑测试并累计数量。消息租期到期及重启恢复有既有存储测试；删除任务的重开与账号隔离有既有测试，暂停后到期重领的组合行为由代码检查支持，不冒称有单独实机覆盖。

其他 agent 后续只需审查上述增量及相关恢复路径，无需重复整阶段审计。新候选设备复验仍待做，限定为：等待首份课程时不继续批量同步、空闲后补传恢复、退出重开后记录保留；优先使用现有课程与固定响应，无须付费生成新课。

## 建议的本次代码提交范围

将已实现的事实存储、离线队列、课堂采集、删除、核查界面、Octos 原问答交付及最后两处修复作为一个基础能力 PR 评审，保留现有按功能划分的提交供逐项查看。知识点查询代码如保留，必须继续保持未审核表停用，不将其算作已启用能力。既有性能脚本是验证材料，不能以脚本已写完替代功能验收，也不继续为它扩展新功能。

知识点自动归属、后台分析、老师读记忆和成长、地图与成就不进入本次交付承诺；仍保留在原阶段待办中。此处是可供评审的范围建议，不是用户已经批准缩减整个第二阶段。PR 可供审查与代码可合并、可发布分别判断：速度未确定和新候选设备复验须如实列出，当前不标为可合并。

## 历史独立审查范围

- 产品分支：`codex/learning-history-phase2`。
- 已核对远端 main：`4973499c0d8ede16a9897c918bdf587472fb57c8`。
- 本轮验证提交：`de64caf`，此前完整范围 `4973499..220313e` 有 40 个提交；新增提交以实际 Git 历史为准，不把主要实现清单当成完整提交列表。
- 完整审查：`git diff 4973499..de64caf`，包括之前的方案、第一阶段调查和第二阶段实现。
- 上轮审查后的重点：`git diff be7d96b..de64caf`。重点运行时代码为 `9b5ae5a` 的删除失败保留、`6d6b607` 的稀疏位置和开始去重；另有 `10d5513` 的同进程空闲性能对照与本轮真实 Octos 验证脚本。
- 当前电视 APK 对应 `47a1843`。`47a1843..de64caf` 没有改变 `src/`、`services/`、Android 或构建依赖，后续主要是文档与独立验收脚本，因此不另造“已安装最新 Git 提交”的说法。
- Octos 上游 PR #2854 已合并，实际本机使用 main `413b4b68`，有二进制散列与协议协商证据。

其他任务的 `docs/CLOSED_SOURCE_TRANSITION_PLAN.md` 及其 README 索引改动仍未包含在本轮提交中。

## 已实现的行为

产品服务保存所属账号下的原始问题、回应、课程交付、实际播放及作答事实。设备先保存、再同步；同一事实重发不会重复计数，删除先保存请求。直调课程路径的原问题与回应通过持久交付任务传给 Octos，不让 Learning Coach 另做跨课记忆整理。来源、问答归属及原始内容都可核对。

知识点查询只接受已审核且课程版本、散列一致的对应表；目前正式对应表仍待审核。原始记录核查界面是验收和排障入口，不代表最终学生界面已经定型。

## 验证证据

| 证据 | 范围和限制 |
|---|---|
| [实施记录](IMPLEMENTATION.md) | 先前前端 1222 项、服务 44 项、浏览器 4 项及构建验证。运行时代码未因本轮新增验证脚本而改变；没有把 36 项针对性复核再加进总数 |
| [真实 Octos 交付](OCTOS_INTEGRATION_ACCEPTANCE.json) | 实际进程、实际产品服务和交付客户端，丢回执后重启两端；只保留两条原问答，原回执不变，测试模型调用为零 |
| [原账号复验](DEVICE_RETEST.json) | 原账号、离线作答、重开和冷启动；不是公网同步 |
| [电视剩余项目](DEVICE_FINAL_ACCEPTANCE.json) | 导航位置、新格式实例回放去重、无凭据删除失败；未向服务器发送删除。原 150 条事实全部保留 |
| [课程生成对照](GENERATION_BENCHMARK.json) | 旧候选的六次首画面对照，额度已用完；不是完整首段音频性能结论 |
| [免费首段可播放对照](FREE_PLAYABLE_BENCHMARK.json) | 完整两版前端、三种条件各 10 对、真实浏览器音频信号；零真实供应商调用，不能代替真实模型/TTS 环境；停用的旧计时轮次另存 |
| [本轮免费性能覆盖复核](PERFORMANCE_EVIDENCE_REVIEW.md) | f28cda2 四种情况各 10 对，包含在途同步与两处修复；1227 项单元等验证通过，但两组 p50 较高、原因未定，不声明速度通过；原 APK 不含新修正 |
| [真实计时执行器准备](LIVE_PERFORMANCE_PREPARATION.md) | 费用、音画及故障检查通过；另补用户所选 alan0x / Gemini 3.8 / 小何验证及指定既有账号登录。[执行单](LIVE_PERFORMANCE_EXECUTION.md)已列保守上限和恢复步骤，用户已暂缓付费；零真实供应商调用，正常账号尚未接入测试地址 |
| [同进程 relay 对照](RELAY_BENCHMARK.json) | 固定模拟供应商延迟；不能推导真实供应商速度 |

本轮额外针对删除、播放记录与交付客户端的既有回归共 36 项通过；新增验证脚本 lint 通过。`git diff --check` 与文档引用检查通过。没有执行新增付费课程生成、TTS 合成或知识点分析。

## 必须让审查者知道的缺项

1. 自由提问和实时课程尚未自动关联 taxonomy；不能回答任意知识点的精确反复提问次数。提问次数保持未确定；预制课正式表也仍未批准。
2. Learning Coach 尚未主动读取这些事实并改变下一堂课；老师成长、知识地图、成就及主动复习没有随本轮交付。
3. 旧实验 APK `ec5b28d` 的开始记录没有固定编号，首次在新版本回放旧实例会补一条新格式开始事实。该实例两条开始事实仍属于同一个学习编号，查询按学习编号计一遍；未清理或伪改旧事实。
4. 暂停、纯旁白文字模式等播放证据限制仍见实施记录；播放不能当作掌握。
5. [合并与发布前性能计划](PERFORMANCE_ACCEPTANCE_PLAN.md)的覆盖复核完成，最新 f28cda2 四种情况各 10 对，两组中位数高约 3.7 ms、1.1 ms，原因未定，未判定速度通过。进一步定位已暂缓。AGENTS.md 要求合入前速度不回退，但没有要求必须再做付费测试。真实供应商对照为可选补充，用户已暂缓；其未执行本身不是阻止合并的理由。
6. 公网历史接口尚未部署，真实设备上传和问答交付仍需发布后验收。

因此，审查可以评估已实现的代码是否可分批合并；是否按当前范围分批收尾，需要明确决定，不能把原计划缺项默认为取消。合并评审与正式发布是两件事；独立审查通过不代替合并前性能要求。终轮意见的采纳与分歧见[处理记录](REVIEW_FOLLOWUP.md#终轮审查处理)。

## 服务器只读核查结果及拟议发布顺序

[服务器检查](PRODUCTION_READINESS.json)记录本轮只读结果：

- Octos 与现有 BYOK 服务均正常运行；服务器二进制报告 `octos 2.0.3 (fca32c4 2026-10-13)`，尚不是本轮 `413b4b68` 的部署验收。
- Node 22.23.2 已提供 SQLite `DatabaseSync` 与备份接口。
- 尚无 `product-server.mjs`、学习记录服务模块、学习数据库目录及其环境配置；Nginx 也无历史专用路由，产品单元尚无学习目录写权限。
- 现有 `/var/backups/octos-learn` 为 root 0700；`/opt/octos-learn/backups` 为 root 0755。新学习库备份可准备在后者的私有子目录，要求服务账号所有、0700，文件 0600；本轮没有创建或变更目录。

发布前仍需准备 Linux 版 `413b4b68` 构建及其散列。当前本机二进制为 macOS 验收产物，不能上传当作服务器二进制。正式环境的 Octos 配置、账号、会话和记忆也须按既有受保护备份步骤保留；学习事实备份不代替这些备份。首次发布若学习数据库尚不存在，应如实记录“不存在”，而不是声称已经备份了它。

拟议顺序：固定审查候选及 Linux 构建 → 完成性能门槛 → 核对受保护备份和恢复安排 → 获准发布 → 更新 Octos、产品模块、私有数据目录与单元权限、Nginx 路由 → 经既有脚本完整发布前端 → 验证鉴权与两账号隔离 → 真实电视上传、断网补传、查询及原问答进入 Octos。每一步保存实际版本和结果，失败停止后续步骤，回退不能丢弃发布后收到的新记录。

本轮没有重启服务器服务、上传文件、改配置、创建生产备份或执行恢复。既有本机预览为早先材料快照；正式发布前必须更新元数据和所选构建，不沿用旧“未合并”状态冒充当前发布清单。

## English PR draft

Title: **Persist account-scoped learning history and replay original classroom messages**

Direct skill invocation did not append the student's original question and delivered response to Octos, and resumable playback state did not provide an auditable record of learning activity. This change adds durable account-scoped learning facts, an offline device queue, correlated message delivery to Octos, playback and task evidence, and a history inspection interface. It preserves the boundary between product facts and Octos-managed semantic memory.

Validation covers persistence, retry deduplication, account isolation, deletion receipts, real Runtime playback, and browser behavior. Real Octos and product-process acceptance used the actual delivery client, including a lost receipt followed by restarting both services, with zero model calls. The latest runtime fixes stop starting further maintenance batches during teaching and keep maintenance paused before the first lesson artifact arrives. The candidate passed 1,227 unit tests and a public build. The previously installed Android build passed local recovery, offline operation, sparse navigation, repeat-start and failed-delete retention checks; it does not contain these last two fixes, which still require a focused device retest.

This is not a production release. Topic mappings remain inactive pending review; automatic attribution of generated lessons and knowledge-point question counts are not implemented. A free 40-pair fixed-response comparison exercised full frontend builds, real Runtime playback and Web Audio rendering with isolated product services. Two conditions had candidate p50 increases of approximately 3.7 ms and 1.1 ms; the cause is unresolved and performance acceptance remains undetermined. Further timing investigation and optional paid testing are deferred. The existing six-generation benchmark measured an earlier candidate's first visible frame, not complete first-playable audio latency. The pre-merge performance requirement and production synchronization acceptance remain outstanding. This draft is prepared for review and does not assert readiness to merge.
