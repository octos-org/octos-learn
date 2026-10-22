# 第二阶段代码审查与发布准备

当前状态：本机上游接入与最新 APK 的本地验收完成；终轮独立审查已返回并完成对照，没有新增已确认代码缺陷。合并前的完整速度证据仍待补齐。未创建产品 PR、未合并产品分支、未发布公网。自动知识点关联的讨论暂缓，仍是未完成目标，不能因此宣布第二阶段全部完成。

## 审查范围

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
| [真实计时执行器准备](LIVE_PERFORMANCE_PREPARATION.md) | 费用、音画及故障检查通过；另补用户所选 alan0x / Gemini 3.8 / 小何验证及指定既有账号登录。[执行单](LIVE_PERFORMANCE_EXECUTION.md)已列保守上限和恢复步骤，用户已暂缓付费；零真实供应商调用，正常账号尚未接入测试地址 |
| [同进程 relay 对照](RELAY_BENCHMARK.json) | 固定模拟供应商延迟；不能推导真实供应商速度 |

本轮额外针对删除、播放记录与交付客户端的既有回归共 36 项通过；新增验证脚本 lint 通过。`git diff --check` 与文档引用检查通过。没有执行新增付费课程生成、TTS 合成或知识点分析。

## 必须让审查者知道的缺项

1. 自由提问和实时课程尚未自动关联 taxonomy；不能回答任意知识点的精确反复提问次数。提问次数保持未确定；预制课正式表也仍未批准。
2. Learning Coach 尚未主动读取这些事实并改变下一堂课；老师成长、知识地图、成就及主动复习没有随本轮交付。
3. 旧实验 APK `ec5b28d` 的开始记录没有固定编号，首次在新版本回放旧实例会补一条新格式开始事实。该实例两条开始事实仍属于同一个学习编号，查询按学习编号计一遍；未清理或伪改旧事实。
4. 暂停、纯旁白文字模式等播放证据限制仍见实施记录；播放不能当作掌握。
5. [合并与发布前性能计划](PERFORMANCE_ACCEPTANCE_PLAN.md)的免费部分已执行，三种条件各 10 对及两项反向检查完成，未发现明确拖慢。待复核这些结果及调用路径是否充分覆盖本次改动；当前不预判验收通过。AGENTS.md 要求合入前速度不回退，但没有要求必须再做付费测试。真实供应商对照为可选补充，用户已暂缓；其未执行本身不是阻止合并的理由。
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

Validation covers persistence, retry deduplication, account isolation, deletion receipts, real Runtime playback, and browser behavior. Follow-up acceptance used real Octos and product processes with the actual delivery client, including a lost receipt followed by restarting both services, with zero model calls. The installed Android candidate passed local recovery, offline operation, sparse navigation, repeat-start and failed-delete retention checks.

This is not a production release. Topic mappings remain inactive pending review; automatic attribution of generated lessons is not implemented. Knowledge-point question counts remain unknown. A free 30-pair fixed-response comparison exercised full frontend builds, real Runtime playback and Web Audio rendering with isolated product services; it found sub-millisecond p50 differences within observed variation, but does not establish real-provider latency. The existing six-generation benchmark measured an earlier candidate's first visible frame, not complete first-playable audio latency; the repository’s pre-merge performance requirement and production synchronization acceptance remain outstanding. This review draft does not assert that the change is ready to merge.
