# 执行指令：课程生成跟随设置中的主模型

交给执行者（GPT）。设计依据：`docs/PROFILE_MODEL_LESSON_GENERATION_PLAN_CLAUDE.md`，执行前先通读，其中 §2 是已核实的事实和代码位置。本文件是执行顺序和完成标准，两者冲突时以本文件为准。

## 0. 已定决策（不要重新讨论）

- 课程生成使用设置中保存的 `llm.primary`（平台、模型、地址、用户自己的 key）。
- 本轮只支持 **Gemini API**（family `google`/`gemini`）。Vertex 维持现状，仅本地可用。**不做 OpenAI** 或其他平台。
- **Ark 只用于 TTS**，从课程生成中移除。
- 线上现在使用 Gemini API 的非流式路径。**不要**在本次改动中开启 Gemini 流式 bootstrap（`main.ts` 中只对 vertex 开放的那个条件保持不变）。
- 公网**严格要求自带 key**：用户没有 key 就不能生成课程，绝不能使用服务端的 key。
- 子账号继承父账号的模型和 key，这是 Octos 现有行为，不要修改。
- 生成过程中**零新增模型往返或网络请求**。provider 和 model 相同时，请求体、thinking 级别、重试和超时必须与现在完全一致。

## 1. 工作约定

- 每个仓库新建一个分支，统一命名为 `codex/profile-model-lessons`。基于各自的 `origin/main` 开分支，先 `git fetch`。
  - octos：本机 checkout 落后 origin/main 127 个提交，先 fast-forward 到最新的 origin/main。
  - octos-learn：本机当前在 `codex/macos-product-ui`，不要在这个分支上改。
- 可以提交并推送到上述分支。**不要合并、不要开 PR 以外的发布、不要部署、不要改服务器**，这些步骤由用户执行。
- Octos 遵循仓库的 TDD 约定：先写失败的测试，再实现。
- 不在日志、trace、错误信息、测试快照中输出任何 key 的值。
- 每个阶段结束时汇报：commit 哈希、测试命令及其结果、未完成项。测试失败时如实报告。

## 2. 阶段 A（P0）：learning-coach

仓库：`learning-coach`。主要文件：`src/main.ts`、`manifest.json`、`test/*.test.mjs`。

### A1. 统一解析课程模型路由

在 `src/main.ts` 中，用一个函数替换 `configuredProvider()` 和 `configuredModel()` 现在的优先级逻辑。函数在工具入口调用一次，结果为不可变对象，传给后续所有调用。

```
resolveLessonModelRoute(env) -> { source: "profile" | "env", provider, model }
```

规则：

1. **profile 模式**：`OCTOS_PROFILE_LLM_PROVIDER` 非空时进入。
   - provider 和 model 都取自 `OCTOS_PROFILE_LLM_*`。
   - 完全忽略 `OLL_PROVIDER`、`OLL_MODEL`、`OLL_FALLBACK_PROVIDER`、`OLL_HEDGE_DELAY_MS`。
   - 如果 `OLL_PROVIDER` 或 `OLL_MODEL` 有值且与 profile 不同，输出一条 stage log，`status: "ignored_server_override"`，只记录变量名，不报错。
   - `OCTOS_PROFILE_LLM_MODEL` 为空时，抛出 `LESSON_MODEL_NOT_CONFIGURED`。**不得**回落到 `DEFAULT_MODEL`。
   - family 映射：`google`/`gemini` → `gemini`；`vertex`/`vertex-ai`/`vertexai` → `vertex`；其他值（包括 `ark`/`volcengine`/`bytedance`）一律抛出 `LESSON_MODEL_UNSUPPORTED`，错误信息中带上原始 family 名。
2. **env 模式**：没有 profile 变量时进入，用于独立 CLI、eval、probe 脚本。保持现有 `OLL_*` 行为和默认值不变，但 `ark` 同样抛出 `LESSON_MODEL_UNSUPPORTED`。
3. profile 模式下不构造 fallback 和 hedge 路由（`configuredFallbackProvider` 返回 undefined）。env 模式下保持现有行为。

### A2. 移除 Ark

- 删除 `createArkClient`、`arkEndpoint`、`arkThinkingType`，以及请求体、响应解析、usage 统计中所有 `provider === "ark"` 分支。`StructuredModelProvider` 类型中去掉 `"ark"`。
- `manifest.json`：从三个工具的 `env` 中删除 `ARK_API_KEY`、`ARK_BASE_URL`、`ARK_THINKING_TYPE`。
- 删除或改写依赖 Ark 课程路径的测试。改写后的测试应断言 ark 返回 `LESSON_MODEL_UNSUPPORTED`。
- 只改 learning-coach，不动 Octos 和 TTS 相关代码。

### A3. Gemini 凭据与地址

- key 继续从 `GEMINI_API_KEY` 读取，缺失时抛出 `LESSON_CREDENTIAL_MISSING`，取代现在的通用 `requireNonEmptyString` 报错。
- 地址优先级：`OCTOS_PROFILE_LLM_BASE_URL`（阶段 C 才会由 Octos 提供，现在先读取，没有就跳过）> `GEMINI_BASE_URL` > 官方默认地址。
- 如果 `OCTOS_PROFILE_LLM_API_TYPE` 有值，且不是 gemini 原生协议（空值或 `gemini` 视为原生），抛出 `LESSON_MODEL_UNSUPPORTED`。
- 在 `manifest.json` 三个工具的 `env` 中加入 `OCTOS_PROFILE_LLM_BASE_URL`、`OCTOS_PROFILE_LLM_API_TYPE`、`OCTOS_PROFILE_LLM_CONFIG_REVISION`。

### A4. 按 HTTP 状态细分错误码

在现有的 `GEMINI_REQUEST_FAILED` 基础上，按状态码细分（流式和非流式路径都要做）：

| 状态 | 错误码 |
|---|---|
| 401 / 403 | `GEMINI_AUTH_FAILED` |
| 404 | `GEMINI_MODEL_NOT_FOUND` |
| 429（重试用尽后） | `GEMINI_RATE_LIMITED` |
| 400 | 保持 `GEMINI_SCHEMA_REJECTED` |

重试策略不变：429 和 5xx 仍然重试；401、403、404 不重试。

### A5. trace

- `model-call` 和 `model-stream` 的 stage log 中加入 `route_source`。profile 模式下再加入 `config_revision`（取自 `OCTOS_PROFILE_LLM_CONFIG_REVISION`，没有就省略）。
- 不记录 key，也不记录请求头。

### A6. 测试（`npm test`，必须全部通过）

1. profile 与 `OLL_*` 冲突时 profile 胜出，并输出 `ignored_server_override` 日志。
2. profile 模式下缺少 model 时返回 `LESSON_MODEL_NOT_CONFIGURED`；family 为 ark 或其他未知值时返回 `LESSON_MODEL_UNSUPPORTED`；缺少 key 时返回 `LESSON_CREDENTIAL_MISSING`。
3. 用本地 HTTP fixture 核对 Gemini 请求：URL 中的 model、base URL 优先级、`x-goog-api-key` 头。
4. **请求体字节一致**：相同 model 下，profile 模式生成的请求体与 env 模式（`OLL_PROVIDER=gemini OLL_MODEL=<同一模型>`）完全相同。课程 bootstrap、section、框选分类、框选增强四种 label 都要覆盖。
5. 401、403、404、429 分别映射到正确的错误码，且 401、403、404 只请求一次。
6. 文本、照片、手写选区三种课程入口，以及框选分类、框选增强两个工具，都能在 profile 模式下解析出同一条路由。
7. profile 模式下不发起 fallback 或 hedge 请求（fixture 只收到一个请求）。

### A7. 构建产物

`main` 和 `lesson-plan.js` 是提交在仓库里的构建产物。`npm run build` 后必须一并提交。

## 3. 阶段 B（P0）：octos-learn

仓库：`octos-learn`。测试命令：`NODE_OPTIONS=--no-experimental-webstorage pnpm test:unit && pnpm lint && pnpm build`。

1. `src/settings/llm-providers.ts`：
   - 在 Google Gemini 的模型列表首位加入 `{ id: "gemini-3.6-flash", name: "Gemini 3.6 Flash（推荐）" }`。
   - 导出 `LESSON_CAPABLE_FAMILIES = ["google", "vertex"]` 和 `isLessonCapable(familyId, publicLinux)`。公网下 vertex 返回 false，沿用 `providersForDeployment` 的规则。
2. `src/learning/setup-state.ts` 的 `hasLearningModel`：在现有判断基础上，还要求 family 满足 `isLessonCapable`。新手引导（`setup-whiteboard.tsx`）和 LLM 设置页使用同一个判断。
3. LLM 设置页：
   - 主模型选择处显示“可用于课程生成 / 暂不支持课程生成”标记。纯本地查表，不调用接口。
   - 已保存的 family 不受支持时，显示提示并引导改选。**不要**自动改写用户的设置。
   - family 为 google、model 不是 `gemini-3.6-flash` 时，显示一条非阻塞提示：“课程已针对 Gemini 3.6 Flash 调优，推荐选择该模型”。
   - 保存成功后的文案改为“已保存，下一次生成课程时生效”。
4. 课程失败的展示：找到前端目前显示 skill 错误码的位置，为以下错误码提供中文文案和“前往设置”入口。

| 错误码 | 文案 |
|---|---|
| `LESSON_MODEL_NOT_CONFIGURED` | 请先在设置中选择课程模型 |
| `LESSON_MODEL_UNSUPPORTED` | 当前模型平台暂不支持生成课程，请在设置中选择 Gemini |
| `LESSON_CREDENTIAL_MISSING` | 请在设置中填写你的 Gemini API Key |
| `GEMINI_AUTH_FAILED` | Gemini API Key 无效，或没有访问该模型的权限 |
| `GEMINI_MODEL_NOT_FOUND` | 所选模型不存在或你的 Key 无权使用，请在设置中更换 |
| `GEMINI_RATE_LIMITED` | 你的 Gemini 额度已用尽或请求过快，请稍后再试 |

   如果某处前端目前拿不到错误码，只能拿到错误文本，先报告具体位置，再决定怎么接，不要用解析文本的方式绕过。
5. action 请求中**不得**附带模型、地址或 key。
6. 文档：
   - 从 `deploy/octos/octos-learn.env.example` 中删除 `OLL_PROVIDER`、`OLL_MODEL` 及其上方的注释，替换为：“课程模型由每个用户在设置中选择；不要在本文件中设置 OLL_PROVIDER / OLL_MODEL，也不要放任何模型 API key”。
   - 同步改写 `docs/PUBLIC_DEPLOYMENT_RUNBOOK.md` 的第 5 步和验收第 3 步。
   - 同步改写 `docs/DEVELOPMENT_HANDOFF.md` 和 `docs/LOCAL_DEVELOPMENT_STATUS.md` 中关于 `OLL_PROVIDER` 的说明（本地 eval 脚本仍可使用）。
   - 在 runbook 中加入部署检查项：服务进程 env 中不得出现 `GEMINI_API_KEY`、`GOOGLE_API_KEY`、`VERTEX_*`、`OCTOS_AUTH_TOKEN`。管理员令牌应放在 `config.json` 中。
7. 如果 octos-learn 中有固定 learning-coach 版本的地方（BOM 或部署说明），同步更新到阶段 A 的提交。

## 4. 阶段 C（P1）：Octos 加固

仓库：`octos`。每项单独提交，先写测试。验证命令：相关 crate 的 `cargo test`，加上 `cargo check -p octos-cli --features api`。

### C1. strict env gate 修正（安全修复，优先做）

`crates/octos-agent/src/subprocess_env.rs` 的 `should_forward_env_name_strict` 改为以下顺序：

1. 注入类变量：拒绝。
2. 在 manifest allowlist 中：放行。
3. 属于 `ALWAYS_RETAIN`：放行。
4. **secret-like（`is_secret_env_name`）或已注册为 secret（`is_registered_secret_env_name`）：拒绝。**
5. `OCTOS_*`：放行。
6. 其他：拒绝。

测试要求：
- 未声明的 `OCTOS_AUTH_TOKEN` 和 `OCTOS_ADMIN_TOKEN` 被拒绝。
- `OCTOS_PROFILE_ID`、`OCTOS_DATA_DIR`、`OCTOS_WORK_DIR` 等普通 harness 变量仍然放行。
- 已声明的 secret 放行。
- 在 `plugins/tool.rs` 中加一个子进程 fixture，验证 `extra_env` 中未声明的 secret 拿不到。

实现前先 grep harness 实际注入的所有 `OCTOS_*` 变量名，确认没有正常变量被误判为 secret；如果有，列出来报告。

### C2. 路由导出取自已解析的 Config

在 `crates/octos-cli/src/runtime/profile.rs` 的 `bootstrap_resolved` 第 8 步，`profile_plugin_env(profile)` 之后，用该函数收到的 `config` 覆盖或补充以下变量。新增一个 helper，放在 `profile_factory.rs`，入参为 `&Config` 和 `config_revision`。

| 变量 | 来源 |
|---|---|
| `OCTOS_PROFILE_LLM_PROVIDER` | `configured_provider_name(&config)` |
| `OCTOS_PROFILE_LLM_MODEL` | `config.model` |
| `OCTOS_PROFILE_LLM_BASE_URL` | `config.base_url`，为空则不写 |
| `OCTOS_PROFILE_LLM_API_TYPE` | `config.api_type`，为空则不写 |
| `OCTOS_PROFILE_LLM_CONFIG_REVISION` | `profile.updated_at` 的 RFC3339 形式 |

- 覆盖是指替换 `profile_plugin_env` 已写入的同名项，不能依赖“先写入者生效”。
- gateway 路径的 `profile_plugin_env` 保持不变。

### C3. 主模型 key 导出到规范变量名（严格 BYOK）

- 仅当 provider 为 gemini/google 时执行，Vertex 不处理。
- 用 `config.clone()`，设置 `bypass_auth_store = true`，**只从 `config.env_vars`（keychain 解析后）读取** key：先读 `config.api_key_env` 指定的名字，未指定时读 registry 中该平台的主名和别名。**不读取进程 env。**
- 读到后写入 `GEMINI_API_KEY`，覆盖已有的同名项。
- 读不到时，在非 solo 部署下，**从 plugin env 中删除** `GEMINI_API_KEY` 和 `GOOGLE_API_KEY`，防止 `FIRST_PARTY_SKILL_ENV_VARS` 回落到进程 env 拿到服务端的 key。solo 或本地部署保持现有回落行为。
  - 先确认代码中区分 solo 和公网的现有标志是什么，并在汇报中写明。
- 不新增 `OCTOS_PROFILE_LLM_API_KEY` 之类的变量。

测试要求：
- 自定义 `api_key_env` 生效。
- 两个 profile 的 key 互相隔离。
- 进程 env 中有 `GEMINI_API_KEY`、profile 没有 key 时，公网模式下技能拿不到 key。
- auth store 中有凭据时不会被使用。
- 子账号能继承父账号的 key：传入的是合并后的 profile，确认这一点仍然成立。

### C4. REST 保存返回 runtime 状态

- `refresh_profile_runtime_after_profile_update`（`ui_protocol_transport.rs`）改为返回 transition 结果。
- `update_my_profile`（`auth_handlers.rs`）把结果写入 `ProfileResponse` 的可选字段：`runtime_disposition`、`restart_required`、`config_revision`、`effective_from`、`runtime_error`。与 OUP 的 `stamp_profile_llm_runtime_transition` 共用同一份转换代码，不另写一套。
- 其他构造 `ProfileResponse` 的地方默认不填这些字段。
- 测试覆盖四种情况：dynamic profile 返回 `reloaded`；startup-pinned 返回 `restart_required`；rebuild 失败返回 `persisted_but_not_live`；保存失败时不触发 transition。

### C5. octos-learn 配套（C4 完成后）

`settings-api.ts` 接收上述字段，设置页按以下文案显示：

| 状态 | 文案 |
|---|---|
| `reloaded` | 已生效，下一次生成使用新模型 |
| `restart_required` | 已保存，服务重启后生效 |
| `persisted_but_not_live` | 已保存，模型暂未就绪，请检查 Key 后重试 |

字段缺失时（旧版 Octos）退回阶段 B 的通用文案。

## 5. 端到端验收

用本地环境完成（`OCTOS_LOCAL_COURSE_PACK_ROOT` 等环境说明见 `docs/LOCAL_DEVELOPMENT_STATUS.md`）。必须使用 dynamic profile，不要用 `--solo` 的 startup-pinned profile；如果本地只能起 pinned profile，先报告。

1. **切换生效**：用户 A 选 M1 并生成课程，trace 中显示 provider/model = M1、`route_source=profile`。改为 M2 并保存后，下一节课的 trace 显示 M2。
2. **进行中不受影响**：生成进行中保存 M2，当前课程的所有 `model-call` 仍为 M1。
3. **多用户隔离**：用户 B 使用自己的 key 同时生成，两边的 trace 和 key 互不串扰。可以用两个不同的无效 key 观察错误归属。
4. **错误提示**：key 为空、key 无效、模型 ID 错误三种情况，分别显示对应的中文提示。服务端 env 中放一个 key 时，公网模式（阶段 C 之后）也不会使用它。
5. **速度**：同一个 Gemini 模型（`gemini-3.6-flash`）下交错进行 A/B。基线是旧版 coach + `OLL_PROVIDER/OLL_MODEL`，候选是新版 coach + profile，各至少 20 次文本课程。报告首个可播放片段的 p50 和 p90，候选不得劣于基线（差异在噪声范围内即可）。
6. **TTS 不受影响**：切换课程模型前后，Ark TTS 都正常。

## 6. 交付物

- 各仓库分支上的提交，并附上测试命令和结果。
- 一份简短报告，列出：
  - 每个阶段的完成情况；
  - 偏离本指令的地方及理由；
  - A/B 数据；
  - 未完成项。
- 部署步骤留给用户。在报告中写出建议顺序：octos-learn 前端 → learning-coach → 清理服务器 env 中的 `OLL_*` → Octos 新版本。
