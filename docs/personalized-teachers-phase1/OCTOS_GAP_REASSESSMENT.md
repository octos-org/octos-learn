# Octos 缺口复核：职责归属与现有能力

日期：2026-10-20

本次依据用户提出的两条标准重新核查：能力是否通用且应由 Octos 负责；需求是否真实、现有接口是否已经能够完成。下列结论修正[第一阶段报告](REPORT.md)中把业务记录存储过早列为 Octos 前置扩展的建议。本次没有修改业务代码或创建新的存储。

后续已在 Octos 独立分支补充实际链路测试，形成[应用记忆接入方案](APP_MEMORY_ACCESS.md)。用户已明确：防止旧任务写回若容易可做，需要较大改动则可以暂不处理；不能将其重新列为这一轮的强制前置条件。

## 1. 结论

不能将此前三个问题整体认定为“必须先补的 Octos 通用能力”。

| 此前提出的问题 | 通用性与职责判断 | 现有能力判断 | 修正结论 |
|---|---|---|---|
| 永久学习事实保存、精确查询与统计 | 业务需要真实；做成通用记录接口是可选设计，但不能证明这些记录必须由 Octos 内核管理 | Recall 不提供完整业务账本契约，符合它作为检索投影的定位；Octos 架构明确由应用持有业务记录 | 撤回“必须新增 app/records 作为实施前置”的结论；原始记录的具体存放方式另行设计 |
| 长期记忆纠正、遗忘与执行结果 | 通用需求；真正修改记忆、清理索引与衍生内容应由 Octos 执行 | CLI 已有 remember、forget、status、refresh；工具已有 correction 暂存；WS 缺少对应的完整操作入口与逐请求状态契约 | 确认应用协议的接入缺口，优先复用现有机制；不能说 Octos 完全不会遗忘或必须重建记忆处理系统 |
| 区分学生陈述与应用资料 | 来源和信任边界通用；课堂事件本身的定义仍是业务职责 | ingest 已保存 source、kind 等字段，强制外部资料为 untrusted；已有带来源的晋升函数和 CLI promote。append_message 的提炼路径仍主要依据消息角色 | 部分已具备；撤回“来源区分完全缺失”的表述，先核验已有应用资料路径，再决定最小扩展 |

记忆的提炼、合并、纠正和遗忘仍统一由 Octos 处理。是否让 Octos 同时托管全部业务原始记录，是另一项存储架构选择；用户尚未在本次复核中确定该选择。

## 2. 为什么永久账本不能直接算作 Octos 缺口

Octos 的 AGENTS.md 将 app records 与适配器归给 product host；集成指南要求通过 host adapter 访问业务数据库。个人记忆 ADR 则把 Recall 定义为业务记录的检索投影，业务应用保持原始数据的权威性。

所以，Recall 会淘汰冷记录，只能证明不能用它统计永久学习次数，不能推出它的架构缺陷或必须扩为业务数据库。课程计数、进展与知识点映射可以由业务程序按原记录计算，不涉及另一个模型或偏好提炼器。

通用记录服务可能有价值，但“能抽象为通用接口”不足以证明“应当放进 Octos 公共内核”。若产品希望所有原始记录也通过 Octos 托管，应单独说明这一部署或存储要求，再比较既有能力和最小扩展。

依据：[Octos 职责约定](../../../octos/AGENTS.md)、[业务数据库边界](../../../octos/docs/octosense-integration-walkthrough.md)、[记忆分层决定](../../../octos/docs/adr/personal-memory-tiers.md)。

## 3. 遗忘缺的是哪一层

Octos CLI 的 remember 和 forget 会将用户请求写成 host 来源的暂存笔记，现有整合流程负责执行；按 ID 硬删除已有副本清理。memory_note 工具能够提交 correction，但不允许模型自行授权 forget。当前 WS 的 memory 方法为 overview、entity、search、load、ingest，缺少等价的正式记忆修改请求入口。

上层可信服务可以封装调用 Octos CLI；这属于适配现有能力，记忆处理仍发生在 Octos。它也说明“任何已有入口都无法完成遗忘”不成立。但浏览器不能把操作者 CLI 当作自己的直接协议，正式 API 仍需要认证归属、授权与状态说明。

现有 status 主要展示服务、队列和额度，不能直接当作一次具体遗忘请求的完成回执。完整的逐请求状态是候选协议扩展，应按界面实际需要定义。

后台已有单实例锁、增量提炼游标及匹配暂存清理。本次未复现迟到结果重新加入的问题，不能把统一版本屏障、完整衍生关系图等实现方案全部列为已证明必须新增。更强的遗忘保证需要先定义范围，再针对实际路径验证。

依据：[CLI 操作](../../../octos/crates/octos-cli/src/commands/memory.rs)、[请求写入](../../../octos/crates/octos-cli/src/commands/memory.rs)、[模型记忆工具](../../../octos/crates/octos-agent/src/tools/memory_note.rs)、[协议方法](../../../octos/crates/octos-core/src/ui_protocol.rs)、[后台服务](../../../octos/crates/octos-cli/src/memory_refresh/service.rs)。

## 4. 来源区分已有多少

memory/ingest 将业务资料写为 Document 或 Episode，保留 source、id、timestamp 等字段，并强制 trust=untrusted。这里的 untrusted 表示资料不能成为指令，不表示资料没有价值或必然错误；source 仍是生产者提供的标签，不能作为独立的安全授权身份。

Octos 的 nominate_for_promotion 会将满足访问条件的应用记录写为带 provenance 的 fact 笔记，交给已有整合流程。当前源码中可确认的非测试调用入口是 CLI memory promote；没有据此发现 ingest 后自动晋升的完整后台调度，不能承诺每次提交都自动成为长期记忆。

因此需要分开判断：

- 让应用资料可被记忆搜索和读取：已有接口可以支持。
- 不将程序观察伪装成学生原话：可以先正确选择消息与 ingest 的入口。
- 让外部资料按产品需要及时进入长期提炼，并保留所需证据语义：需要核验触发、权限、内容限额与状态；优先复用已有晋升机制。
- 从一段 source 标签获得不可伪造的来源权威：现有字段不提供这种保证，是否需要新增能力取决于具体信任边界。

这不足以证明必须新增一种证据等级或一个永久通用事件库。真实学生原话继续走 user 消息；应用记录先按已有 Document 路径评估。

依据：[ingest 契约](../../../octos/api/OCTOS_UI_PROTOCOL_V1_SPEC_2026-04-24.md)、[接收时信任检查](../../../octos/crates/octos-cli/src/api/ui_protocol_transport.rs)、[带来源的晋升](../../../octos/crates/octos-agent/src/memory_index.rs)、[CLI 晋升入口](../../../octos/crates/octos-cli/src/commands/memory.rs)、[消息提炼的角色依据](../../../octos/crates/octos-cli/src/memory_refresh/extract.rs)。

## 5. 收窄后的工作范围

下一步应围绕已有能力的应用接入验证：明确记忆修改请求的正式入口和状态需求，核验 ingest 到晋升和整合的链路，并确定来源需要保留的最少信息。业务学习记录的存储责任单独设计，暂不以 app/records 草案作为 Octos 必须接受的前置条件。

本次重新运行了 Octos 现有的 5 项 memory_ingest 测试，全部通过，覆盖外部资料的信任强制、Knowledge 拒绝及参数检查。本次未运行模型、未写入个人记忆，也未复现跨任务遗忘故障；判断依据限于所列源码、协议与这些测试。

主报告中的接口比较仍可说明各接口适用范围；第 3 节“必须放在 Octos”的推导、第 4.1 节永久记录 API 候选及第 8 节的原实施顺序，以本次复核的收窄结论为准。没有恢复 Learning Coach 自行处理记忆的安排。
