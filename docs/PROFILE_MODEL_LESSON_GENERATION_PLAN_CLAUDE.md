# 课程生成跟随设置中的主模型：方案（Claude 版，含对 GPT 方案的审查）

日期：2026-10-01。状态：仅设计，未实施、未部署。

代码基线（均为只读核对）：
- Octos：`origin/main` = `ae230ce0`。注意：本机 `octos` checkout 的 HEAD 仍为 `3916c6a8`，落后 origin/main 127 个提交。GPT 方案写的“已 fast-forward 到 ae230ce0”在这台机器上不成立，实施前需要先更新。
- learning-coach：`2a5fcc5`（= origin/main）。
- octos-learn：`origin/main` = `81a8c23`。

## 1. 结论

1. 现有链路的大部分已经接通。课程模型之所以固定，是因为 Coach 优先读取服务端的 `OLL_PROVIDER` / `OLL_MODEL`，部署 env 又设置了这两个变量。Octos 并没有缺少主模型信息。
   - Octos 已经导出 `OCTOS_PROFILE_LLM_PROVIDER/MODEL`（`profile_factory.rs:179-192`）。
   - Octos 已经把用户 profile 中的 `GEMINI_API_KEY` 传给技能（`FIRST_PARTY_SKILL_ENV_VARS`，`profile_factory.rs:32-45, 160-169`）。
   - Coach 已经读取这些变量，只是 `OLL_*` 排在它们前面（`learning-coach/src/main.ts:1039-1057`）。
   - 部署 env 写着“在 profile-to-skill 路由可用前由服务端选择”（`deploy/octos/octos-learn.env.example`）。
2. 因此分阶段实施。**P0 只改 Coach、前端和部署 env，不改 Octos**，就能在默认 Gemini 地址下实现需求。Octos 的改动作为 P1 加固，覆盖自定义地址、自定义密钥名、凭据来源收紧和保存状态回显。
3. “进行中的课程保持原配置”已经由现有机制保证，不需要新增快照机制，详见 §3。
4. 快速路径零改动：同一 provider/model 走的代码路径不变，生成时不增加任何网络往返。Gemini 流式首段是一项独立的性能优化，不与本次路由改动捆绑（§5）。

## 2. 核实到的事实（含与 GPT 方案的差异）

| # | 事实 | 位置 | 影响 |
|---|---|---|---|
| F1 | Coach 的 provider/model 解析顺序是 `OLL_PROVIDER` > `OCTOS_PROFILE_LLM_PROVIDER` > 默认 vertex；model 是 `OLL_MODEL` > `OCTOS_PROFILE_LLM_MODEL` > `DEFAULT_MODEL=gemini-3.6-flash` | main.ts:27, 1039-1057, 1012 | 固定模型的直接原因。另外 Gemini 在 model 缺失时会静默回落到默认模型 |
| F2 | 前端 Google Gemini 的模型列表只有 `gemini-3.1-pro-preview` 和 `gemini-3-flash-preview`，**没有课程调优用的 `gemini-3.6-flash`** | octos-learn `src/settings/llm-providers.ts` | 只翻转优先级的话，现有用户会被切换到另一个模型，速度和质量都会变化。这是 GPT 方案遗漏的回退风险 |
| F3 | 流式 bootstrap 只对 vertex 启用；gemini 走非流式 | main.ts:1861 | 公网 env 示例里的 `OLL_PROVIDER=gemini` 说明公网 Gemini 的现有基线是非流式。若生产实际跑的是 Vertex，切到 Gemini API 才会失去流式（见待决问题 Q1） |
| F4 | `bootstrap_resolved` 收到的是已解析的 `Config`；注释明确要求本地 OUP adapter 不要把它回推成 ProfileConfig，否则会丢失自定义 endpoint 和 api_type | runtime/profile.rs:1005-1007 | 导出给技能的路由应当取自这个 `Config`，也就是 Agent 实际使用的那一份。GPT 方案让 helper 接收 profile，会在本地 CLI 配置场景下产生偏差 |
| F5 | 只要 `PUT /api/my/profile` 的 body 含有 `config`，就会触发 runtime transition，只改 key 也算 | auth_handlers.rs:1328-1388 | 改 key 或改模型都能在下一次生效 |
| F6 | `invalidate_profile` 只清除缓存并递增 generation，不会中断进行中的 turn；子进程 env 在 spawn 时就已固定 | runtime/cache.rs:631-645；plugins/tool.rs:2765 | 进行中的生成天然保持原配置 |
| F7 | 一节课的 bootstrap、outline 和各 section 都在同一次 `oll_generate_lesson` 子进程内完成 | main.ts:2896，lesson-plan-live.ts | 不会出现半节课换模型 |
| F8 | strict env gate 对所有 `OCTOS_*` 无条件放行，且这一判断位于 secret 判断之前 | subprocess_env.rs:91-129 | 新增名为 `OCTOS_*` 的密钥变量会泄漏给所有 strict 技能。**这里还有一个已存在、需要验证的问题**：如果 serve 进程的环境里有 `OCTOS_AUTH_TOKEN`，它可能同样被放行给 strict 技能 |
| F9 | `FIRST_PARTY_SKILL_ENV_VARS` 在 profile 没有值时会回落到服务进程 env（`std::env::var`） | profile_factory.rs:160-168 | 公网若误配了进程级 `GEMINI_API_KEY`，没填 key 的用户会静默使用运营方的 key。这是隔离和计费问题，GPT 方案只处理了 auth store，没有处理这一点 |
| F10 | Ark 路径的请求体就是 OpenAI Responses 格式（`input`、`text.format=json_schema strict`），只是多了 `thinking` 字段 | main.ts:858-883 | 撤掉 Ark 后，这段代码可以改造为 OpenAI 支持，成本较低（P2） |
| F11 | REST helper 丢弃了 transition 的返回值 | ui_protocol_transport.rs:24772-24778 | 与 GPT 方案一致，属于 P1 改进 |

## 3. 生效时机（现有机制即可满足）

| 场景 | 行为 | 依据 |
|---|---|---|
| 保存后发起的下一次课程、框选分类或框选增强 | 使用新配置 | F5：重建 ProfileRuntime 后，plugin env 模板随之更新 |
| 保存时正在生成的课程 | 整节课保持旧配置 | F6 + F7 |
| startup-pinned profile（本地 `--solo`/启动配置） | 已保存，重启后生效 | transition 返回 `restart_required`。P0 用文档说明；P1 在 UI 上显示 |
| 重建失败 | 已保存，下一次请求重试 bootstrap | `persisted_but_not_live` |

需要补的只有一项验收：并发保存时，旧 generation 的 bootstrap 不能回写缓存。现有代码已做了这层保护，只需加测试。

## 4. P0：只支持 Gemini，不改 Octos

### 4.1 learning-coach

1. **一次解析出不可变的 `LessonModelRoute`**，包含 `{source, provider, model, endpoint, credential}`，在工具入口解析一次后传给所有调用。
   - **profile 模式**（`OCTOS_PROFILE_LLM_PROVIDER` 存在）：完全以 profile 为准，忽略 `OLL_PROVIDER`、`OLL_MODEL` 和 `OLL_FALLBACK_PROVIDER`。若这些变量被设置且与 profile 不同，只记一条 stage log（`ignored_server_override`），不报错，保证部署过渡期兼容。
   - **独立 CLI 或评测模式**（没有 profile 变量）：保持现有 `OLL_*` 行为，eval、probe 和测试脚本不受影响。
   - **profile 模式下 model 必填**，不回落到 `DEFAULT_MODEL`，否则用户以为在用 A，实际在用 B。
2. **课程能力表**（Coach 内部常量）：`gemini`（来自 family `google`/`gemini`）和 `vertex` 可用。`ark` 以及其他 family 返回 `LESSON_MODEL_UNSUPPORTED`。删除三个工具 manifest 中的 `ARK_*` 以及 Ark 客户端分支。Ark 的 TTS 在 Coach 之外，不受影响。
3. **endpoint**：`GEMINI_BASE_URL`（已经从 profile env_vars 透传）> 官方默认地址。P1 再加入 `OCTOS_PROFILE_LLM_BASE_URL`，优先级最高。
4. **凭据**：继续读 `GEMINI_API_KEY`。该变量已在 manifest 中声明、已注册为 secret，并来自用户自己的 profile env_vars。P0 不新增任何密钥变量。
5. **快速路径不变**：provider 和 model 相同时，请求体、thinking 级别、流式与否、重试和超时都与现在完全一致。路由解析只是读进程 env，不发网络请求。不做调用前探测，凭据错误由首个真实请求返回。
6. **错误码与提示**：Coach 只输出错误码；中文提示文案由前端负责。

| 错误码 | 触发 | 用户提示（前端） |
|---|---|---|
| `LESSON_MODEL_NOT_CONFIGURED` | profile 模式下缺少 provider 或 model | 请先在设置中选择课程模型 |
| `LESSON_MODEL_UNSUPPORTED` | family 不在能力表中（含 Ark） | 「X」暂不支持生成课程，请选择 Gemini |
| `LESSON_CREDENTIAL_MISSING` | 缺少 `GEMINI_API_KEY` | 请在设置中填写 Gemini API Key |
| `GEMINI_AUTH_FAILED`（由 401/403 映射） | key 无效或无权限 | API Key 无效或没有访问该模型的权限 |
| `GEMINI_MODEL_NOT_FOUND`（由 404 映射） | 模型 ID 错误或该 key 无权访问 | 模型「X」不存在或不可用 |
| `GEMINI_RATE_LIMITED`（由 429 映射） | 额度或限流 | 你的 Gemini 额度已用尽或请求过快 |

   现有的 `*_REQUEST_FAILED` 和 `*_SCHEMA_REJECTED` 保留。新错误码只是在它们之上按 HTTP 状态细分，原有调用方仍能识别。
7. **trace**：在 `model-call` 日志中加入 `route_source`（profile/env）。provider 和 model 已经在记录。不记录 key，也不记录带 key 的 URL（Gemini 使用 header 鉴权，URL 本身不含 key）。

### 4.2 octos-learn

1. 一份 `LESSON_CAPABLE_FAMILIES` 同时驱动新手引导、LLM 设置页和 `hasLearningModel`。`google` 全平台可用；`vertex` 仍只在本地可用（`providersForDeployment` 的规则保持不变）。
2. **在 Google Gemini 的模型列表中加入 `gemini-3.6-flash`，放在首位并标为推荐**。这是满足“相同模型不回退”的关键：新用户默认就落在当前的调优模型上。
3. 设置页的主模型下拉旁显示“可用于课程生成 / 不支持课程生成”标记。该判断在本地查表完成，不调用模型。
4. 旧 profile 迁移：
   - 已选择不支持的平台时：显示提示，不静默覆盖用户设置。`hasLearningModel` 返回 false，引导用户改选。
   - 已选择 Google 旧模型（如 `gemini-3-flash-preview`）时：保留原选择，显示一条“推荐 gemini-3.6-flash（课程已针对其调优）”的提示。
5. 课程失败卡片根据上表的错误码显示对应文案，并附“前往设置”入口。
6. 保存成功的文案改为“已保存，下一次生成课程时生效”。P1 起按 runtime 状态显示更精确的文案。
7. action 请求中不附带模型或密钥。

### 4.3 部署

1. 从 `octos-learn.env.example`、`PUBLIC_DEPLOYMENT_RUNBOOK.md`（第 5 步与验收第 3 步）、`DEVELOPMENT_HANDOFF.md` 和 `LOCAL_DEVELOPMENT_STATUS.md` 中删除 `OLL_PROVIDER` 和 `OLL_MODEL`，并改写相关说明。
2. **部署检查项**：公网服务进程的 env 中不得出现 `GEMINI_API_KEY`、`GOOGLE_API_KEY`、`VERTEX_*`（F9）。P1 会把这条要求改为代码强制。
3. 发布顺序：前端（模型列表和能力标记）→ Coach → 清理 env。Coach 在 profile 模式下忽略 `OLL_*`，所以清理 env 早一步或晚一步都不会出错。

## 5. 速度：如何保证“零新增往返、首段不回退”

- 生成时新增的只有内存中的 env 读取和查表；没有探测、没有 token 交换，也没有额外的 Agent 轮次。`skill/action/invoke` 的直调路径不变。
- 同一个 `(provider, model)` 的请求字节与现在一致，可以用单测直接比对：在 profile 模式和旧 `OLL_*` 模式下分别生成请求体，断言两者相等。
- 交错 A/B 测试：对线上实际使用的 provider/model，基线组用 `OLL_*`，候选组用 profile，各 N≥20 次文本课程，比较首个可播放片段的 p50 和 p90。基线必须取自**线上真实配置**（见 Q1）。
- Gemini 流式 bootstrap（main.ts:1861 的条件放开到 gemini）可能显著缩短首段时间，但它改变的是生成行为，而不是路由。应当作为独立的 PR 和独立的 A/B，单独验证 SSE、`responseJsonSchema` 和部分 JSON 首段交付，不与本次改动捆绑。

## 6. 多用户隔离

| 风险 | P0 处理 | P1 处理 |
|---|---|---|
| 用户 A 的 key 进入用户 B 的技能 | plugin env 模板按 ProfileRuntime 构造，数据来自各自 profile 的 env_vars。测试中用两个 profile 断言隔离 | 同上 |
| 运营方的进程 env key 被用户静默使用（F9） | 部署检查项 | 非 solo 部署下，主模型凭据只取 profile env_vars，不回落到进程 env 或 auth store |
| 新增密钥变量通过 `OCTOS_*` 例外泄漏（F8） | P0 不新增 `OCTOS_*` 密钥 | 修正 strict gate 的判断顺序：secret-like 或已注册为 secret 的名字先判断，仅当 manifest allowlist 列出时才放行，再走 `OCTOS_*` 例外。顺带验证 `OCTOS_AUTH_TOKEN` 是否属于已存在的泄漏 |
| 子账号继承父账号的 key | 需要确认这是否是期望行为（Q3） | — |

## 7. P1：Octos 加固（小改动，均可独立合入）

1. **路由导出取自已解析的 `Config`（F4）**：在 `bootstrap_resolved` 第 8 步之后，用 `configured_provider_name(&config)`、`config.model`、`config.base_url` 和 `config.api_type` 覆盖或补充以下非敏感变量：`OCTOS_PROFILE_LLM_PROVIDER`、`OCTOS_PROFILE_LLM_MODEL`、`OCTOS_PROFILE_LLM_BASE_URL`、`OCTOS_PROFILE_LLM_API_TYPE`、`OCTOS_PROFILE_LLM_CONFIG_REVISION`。gateway 路径中 `profile_plugin_env` 原有的两行保持不变，作为兼容。约 30 行代码加测试。
2. **主模型密钥导出：不新建 `OCTOS_PROFILE_LLM_API_KEY`**。
   - 改为用 `Config::get_api_key_with_env(provider, config.api_key_env)` 并设置 `bypass_auth_store=true` 解析出主模型的 key，然后写入**该 provider 的规范变量名**（如 Gemini 写入 `GEMINI_API_KEY`），并且排在 FIRST_PARTY 透传之前（`push_env_once` 先写入的生效）。
   - 这样自定义的 `route.api_key_env` 也能生效。规范名早已在 manifest 中声明并注册为 secret，Coach 无需改动，也不扩大 `OCTOS_*` 的暴露面。
   - 只对能力表内的 API-key 平台执行；Vertex 继续走 SA/token 链路。
3. **公网凭据来源收紧**：非 solo 模式下，第 2 项不回落到进程 env。具体做法是在 resolver 前设置一个开关，或者直接只读 `config.env_vars`。
4. **strict gate 修正**（F8）：约 5 行代码加测试，本身就值得作为安全修复单独合入。
5. **REST 保存返回 runtime 状态**：让 `refresh_profile_runtime_after_profile_update` 返回 transition。`ProfileResponse` 增加可选字段 `runtime_disposition`、`restart_required`、`config_revision`、`effective_from`、`runtime_error`，与 OUP 共用同一份序列化代码。前端据此显示“已生效 / 重启后生效 / 已保存但运行时未就绪”。

## 8. P2：其他平台（按成本排序）

| 平台 | 成本 | 判断 |
|---|---|---|
| OpenAI（Responses API） | 低：把 Ark 分支改为 `openai`，`thinking` 换成 `reasoning.effort`，endpoint 改为 `{base}/responses` | 需要验证课程 schema 在 OpenAI strict json_schema 下能通过（所有字段 required、`additionalProperties:false`、不支持部分关键字），并跑质量、速度和图片评测。建议在 P0 之后作为第一个扩展 |
| Anthropic | 中：需要新增一个 Messages 适配器，通过 tool-use 获得结构化输出 | 暂缓 |
| DeepSeek、Moonshot、Groq 等 OpenAI 兼容 Chat 平台 | 中到高：大多没有 strict json_schema，大 schema 的稳定性和图片能力都没有保证 | 不纳入 |

## 9. 对 GPT 方案的审查

**同意**：
- 以 `llm.primary` 为唯一来源。
- Ark 退出课程生成。
- 不在 action 中携带密钥。
- 让 REST 返回 transition 状态。
- 修正 strict gate。
- Vertex 不在公网开放。
- profile 模式下不使用服务端的 fallback。
- 验收清单的整体结构。

**建议修改**：
1. **改动顺序和范围**：GPT 方案把 Octos 契约（6 个新变量加 subprocess_env 修改）当作前置条件。但 Gemini 默认地址这个核心场景，现有链路已经能满足（§1）。把 Octos 改动降为 P1 后，P0 可以独立上线，风险和评审成本都更低。
2. **导出来源**：GPT 方案的 helper 接收 profile。应改为取 `bootstrap_resolved` 收到的 `Config`，与 Agent 实际使用的路由一致（F4）。
3. **不新增 `OCTOS_PROFILE_LLM_API_KEY`**：改为把解析出的主模型 key 写入规范名（§7.2）。理由有三：复用已有的 manifest 声明和 secret 注册；Coach 不需要改；即使 strict gate 的修复延后，也不会出现新的泄漏面。strict gate 仍然要修，但两件事不再互相阻塞。
4. **补上模型列表的回退风险**（F2）：前端缺少 `gemini-3.6-flash`，只翻转优先级会让默认体验换成另一个模型。
5. **补上进程 env 回落的隔离问题**（F9）：GPT 方案只排除了 auth store。
6. **“补齐 Gemini 流式入口”应拆出去**：它是性能变更，不属于路由变更；混在一起会让“首段不回退”的 A/B 结论失去意义（§5）。
7. **不需要额外的“配置快照”**：进行中保持原配置由 F6 和 F7 天然保证，GPT 方案中“在 bootstrap 时构造快照”的描述本身没错，但它正是现状，不是新增工作。
8. **基线事实需要更正**：本机 Octos 尚未更新到 ae230ce0。

## 10. 验收

1. **Coach 单测**：
   - profile 与 `OLL_*` 冲突时 profile 胜出，且不报错。
   - profile 模式下缺少 model 时报 `LESSON_MODEL_NOT_CONFIGURED`。
   - Ark 或其他 family 报 `LESSON_MODEL_UNSUPPORTED`。
   - 用本地 HTTP fixture 核对 Gemini 请求的 model、endpoint 和 `x-goog-api-key`。
   - 同模型下请求体字节与旧路径相同。
   - 401、403、404、429 映射到正确的错误码。
   - 文本、照片、手写选区、框选分类和框选增强五个入口全部覆盖。
2. **前端**：能力表测试、`hasLearningModel` 测试、旧 profile 提示测试，以及 `pnpm test:unit`、`lint`、`build`。
3. **端到端**（本地 dynamic profile）：
   - 用户 A 选模型 M1 并生成课程，确认 trace 中为 M1。
   - 生成进行中改存 M2，确认当前课程全程仍为 M1，下一节课为 M2。
   - 用户 B 同时使用自己的 key，trace 和计费互不串扰。
   - 不填 key 时报 `LESSON_CREDENTIAL_MISSING`，且服务端 env 中有 key 时也不会使用它（P1）。
4. **性能**：§5 的交错 A/B，首段 p50 和 p90 不回退。

## 11. 决定（2026-10-01 用户答复）

- Q1：线上为 Gemini API（非流式）。同模型基线就是现有的非流式路径，P0 不涉及流式变化。
- Q2：公网严格 BYOK。P1 第 3 项（公网主模型凭据只取 profile，不回落进程 env）改为必做；在它上线前，部署检查项是硬性要求。
- Q3：子账号继承父账号的模型和 key。这与 Octos 现有设计一致（`parent_id` 注释：继承父账号的 LLM 配置和底层 env），无需改动，只需加一条验收。
- Q4：OpenAI 不纳入本轮。

原问题如下：

- **Q1**：线上课程现在实际跑的是 Vertex（流式）还是 Gemini API（非流式）？如果是 Vertex，切换到用户的 Gemini API key 会让首段时间变长。要么把 §5 的 Gemini 流式一并上线（需要单独的 A/B），要么接受“用户选的路由本身更慢”。
- **Q2**：公网是否严格 BYOK，即没有 key 就不能生成课程？还是保留平台出资的课程额度？这决定了 P1 第 3 项是否默认开启。
- **Q3**：子账号是否应当继承父账号的模型和 key？
- **Q4**：OpenAI 是否纳入本轮？建议放在 P0 之后单独做（P2）。
