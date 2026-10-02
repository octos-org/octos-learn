# 课程生成跟随设置中的主模型：修改方案

日期：2026-10-01。状态：代码调查与设计完成，尚未实施。

## 范围与基线

- 用户在设置中保存的 `llm.primary` 决定下一次课程生成的供应商、模型、地址和凭据。
- 进行中的生成使用启动时的配置快照；保存新配置不修改进行中的任务。
- Ark 不用于课程生成；其在本产品中的用途仅为 TTS。保留独立的语音配置、平台额度与凭据链路。
- 第一阶段实现 Gemini API，保留并验证已有 Vertex 路径在本地的适用性。公网 Vertex 的凭据存储限制单独处理，不在本次开放。
- 其他课程模型平台只有在新增适配并通过结构化输出、图片、课程正确性与速度验收后才开放。
- Octos 本地 main 已从 `3c0fc104` fast-forward 到 `ae230ce0`，与本次 fetch 后的 `origin/main` 一致；共纳入 189 个提交（包含 merge）。更新前后工作区干净。
- 本次更新的是源码 checkout，没有重新编译二进制、重启本地服务或修改公网部署。

## 最新 Octos 的有关事实

1. `profiles::config_from_profile` 已把 `llm.primary` 的 family/model、route.base_url、route.api_key_env、route.api_type 投影到 Config，不需要增加一套课程专属 profile 配置。
2. `runtime::profile::configured_provider_name` 统一运行时的供应商解析：显式 family 优先，其次从 model 检测。近期抽取了这个共享函数，应复用解析规则。
3. `runtime/profile.rs` 的 `bootstrap_resolved` 使用上述 Config 创建模型，但第 8 步技能环境模板仍从 `profile_plugin_env(profile)` 构造。该函数导出了 `OCTOS_PROFILE_LLM_PROVIDER/MODEL` 和固定白名单中的环境变量，没有完整导出 primary.route。
4. gateway 中另有 `build_plugin_env`，会映射部分模型地址与凭据。它不能代表 AppUI 课程 action 的实际路径；本次不能只修这个 gateway helper。
5. `PUT /api/my/profile` 在保存 config 后已调用 `refresh_profile_runtime_after_profile_update`。它复用 `commit_profile_llm_runtime_transition`，清除 profile 的 SessionRuntime、递增 generation、移除动态 ProfileRuntime，然后重建。已有机制覆盖并发旧 bootstrap；不重写缓存。
6. REST refresh helper 丢弃了 transition 的返回值，而 OUP `profile/llm/*` mutation 会返回 runtime_disposition/restart_required/config_revision/effective_from/runtime_error。REST 设置页因此不能区分保存成功和运行时已切换。
7. startup-pinned profile 目前只能在重启后重建。动态公网用户可以重新加载；本地 solo 是否命中 pinned 路径要通过真实启动验收，不承诺所有部署均即时生效。
8. skill/action/invoke 仍通过受 profile/session 权限约束的 SessionRuntime 调用工具，直接 action 快速路径无需增加外层 Agent 调用。
9. 本次拉取的近期变化主要为 host-managed serve、host-owned app peer、工具来源/白名单与连接所有权。host-managed 是 opt-in；普通公网 serve 不需要迁移到该模式。新增 app-binding 缓存检查应保留。
10. PluginTool 对非空 manifest.env 使用严格环境过滤，但 `subprocess_env::is_harness_env_name` 当前把所有 `OCTOS_*` 视为例外。新增 `OCTOS_PROFILE_LLM_API_KEY` 若只注册为 secret 而不修这一例外，仍可能进入未声明该变量的技能。这是本方案必须同时处理的接口边界。

## Octos 修改 A：给技能导出完整的主模型路由

### 契约

沿用现有环境传递接口，建议增加以下通用字段；命名是拟议接口，当前代码尚不存在后四个字段。

| 变量 | 值与用途 |
|---|---|
| OCTOS_PROFILE_LLM_PROVIDER | 当前主模型的供应商，复用已有字段 |
| OCTOS_PROFILE_LLM_MODEL | 设置中保存的模型 ID，复用已有字段 |
| OCTOS_PROFILE_LLM_BASE_URL | 主模型显式 route.base_url；未指定时可取 registry 的官方地址 |
| OCTOS_PROFILE_LLM_API_TYPE | 显式协议覆盖；缺省表示供应商原生协议 |
| OCTOS_PROFILE_LLM_API_KEY | 当前主模型的 profile 范围 API key；仅 API-key 认证平台使用 |
| OCTOS_PROFILE_LLM_CONFIG_REVISION | 本次配置快照对应的 profile.updated_at，仅用于确认切换 |

API key 不写进 REST 响应、action 参数、课程文件、trace 或日志。Vertex 不把服务账户 JSON 当作通用 API key，继续走原有显式声明的 SA/token/project 环境与宿主 token source。

### 实现落点

- 在 CLI 的共享技能环境构造层增加 `profile_primary_llm_env` 一类 helper；让 `profile_plugin_env` 调用它，保持 AppUI runtime 和 gateway 都走同一导出逻辑。
- helper 接收有效 profile，使用 `config_from_profile` 的归一化结果和共享的供应商解析规则；不要再维护一套 family/model 推断表。
- primary.model 必须保持用户保存的 ID；缺失时让 Coach 返回配置未完成，不能替换成 catalog 默认模型后仍声称使用用户选择。
- 优先取 primary.route.base_url，未指定时使用 provider registry 的默认地址。不要读取另一个 fallback 的地址。
- 显式 primary.route.api_key_env 是排他的密钥来源；未指定时使用 registry 的主名称及已声明 alias。密钥从当前 profile.env_vars 读取，并使用已有 keychain resolver 解引用。
- 本产品的 BYOK 导出不借用服务器全局 auth store 或环境中的另一个人的 key。不要直接调用默认 `Config::get_api_key` 就视为 profile 凭据：目前该 resolver 优先读全局 auth store，然后才读 profile/keychain/process env。通用 Agent 既有认证优先级保持不变，新增技能契约明确为 profile 范围。
- 注册通用 API-key 变量和自定义源变量为 secret。复用 `PluginTool.extra_env` 和 manifest 过滤，并补齐 `should_forward_env_name_strict` 的判断顺序：明确 manifest allowlist 可以放行；未声明的 secret-like 或 registered-secret 必须在 `OCTOS_*` harness 例外之前拒绝。普通非敏感 harness 字段保持兼容。非 strict 路径已有 secret 判断，保持原有行为。
- 保留原有平台命名的环境变量，避免影响其他技能；新版 Coach 在 profile 模式只使用新的主模型字段，防止固定变量覆盖所选 route。
- 配置快照在 runtime bootstrap 时构造。每次调用只注入快照；没有新增模型调用、凭据探测或远端请求。

### 文件范围

- `crates/octos-cli/src/commands/gateway/profile_factory.rs`：共享导出 helper 与测试。
- `crates/octos-cli/src/runtime/profile.rs`：确认使用归一化后的主模型配置；必要时给 helper 传入已解析 Config，避免重复解析。保留现有 reload 模板和插件重载流程。
- `crates/octos-agent/src/subprocess_env.rs`：修正 strict 模式的 `OCTOS_*` 例外不可自动放行凭据；添加声明/未声明/registered-secret/harness 普通字段回归测试。
- `crates/octos-agent/src/plugins/tool.rs`：补充实际子进程契约测试，复用已有 extra_env 注入机制。
- 契约文档：记录新增变量的 profile 范围、严格 opt-in 和缺失凭据语义。

## Octos 修改 B：REST 保存返回真实运行时状态

- 让 `refresh_profile_runtime_after_profile_update` 返回已有 transition 的可序列化公共 DTO，而不是丢弃结果。
- `ProfileResponse` 增加可选字段，名称与 OUP mutation 一致：runtime_disposition、restart_required、config_revision、effective_from、runtime_error。
- `update_my_profile` 只在 config 已成功保存后进行 transition；持久化失败不清除健康 runtime。复用现有逻辑，不增加第二次 rebuild。
- 只对本次保存结果填状态字段；普通 GET / 无 config 的保存保持兼容。其他 ProfileResponse 构造函数默认这些字段为空。
- 对 `persisted_but_not_live` 明确表示“已保存，运行时尚未就绪”，后续请求仍使用现有重试 bootstrap。
- 对 `restart_required` 明确表示“已保存，服务重启后生效”。本次不把不可变启动快照改为动态 profile，避免扩展修改范围。
- runtime_error 采用已有脱敏错误机制，不把凭据或完整敏感配置写入响应。

REST status DTO 的字段与 OUP stamp 使用同一份序列化定义/转换，避免后续两套状态语义漂移。私有 transition 类型无需作为公共 RPC 接口暴露。

## Learning Coach 与前端配套

### Coach

- 一次解析 provider/model/base_url/api_type/key，形成不可变客户端配置。profile 模式优先且完整；没有 profile 时才允许独立 CLI 使用 OLL_PROVIDER/MODEL。
- 有 profile 但字段缺失、凭据缺失或协议不支持时返回可解释错误；不拼接 CLI 默认值补出另一条路由。
- Gemini 支持 native Gemini 协议；若同 family 的 route.api_type 指向尚未实现的 OpenAI/Responses 协议，明确拒绝，不能只凭 family 猜协议。
- 为课程生成、框选分类、框选增强三类工具在 manifest.env 中声明需要的新字段。
- 去掉 Ark 的课程 provider 分支及三个工具的 ARK_* 环境声明；删除或调整相关课程测试。产品 TTS 配置与实现不动，Octos 面向其他技能的通用 Ark 变量不因本产品规则而全局删除。
- 首段流式入口当前只对 Vertex 启用。Gemini 流式函数已有协议处理基础，补齐入口后需测试 SSE、schema 和部分 JSON 到首段交付的过程，不能仅改条件后声称已完成支持。
- profile 模式本阶段使用 primary；服务端 OLL_FALLBACK_PROVIDER 不覆盖用户所选模型。暂不新增用户 fallback 或 adaptive routing 到课程路径。
- trace 只记录实际 provider、model、config_revision，便于验收切换；不记录 key 或带鉴权信息的地址。

### Octos Learn

- 新手引导、完整 LLM 设置、hasLearningModel 使用同一份课程平台能力定义。Gemini 优先；本地 Vertex 延续现有可用性，公网不开放。
- 旧 profile 若保存了不支持的平台，显示原因并允许改为受支持平台；不静默覆盖历史设置。
- 设置页在测试/保存时使用同一模型与 route，显示课程实际使用的主模型。需要自定义 Gemini 地址时，开放相应输入并保存 route。
- settings-api.ts 接收保存结果的 runtime 状态；LLM 设置页与新手引导按 reloaded/deferred/restart_required/persisted_but_not_live 显示准确结果。
- 保存后回到 /learn，下一次课程 action 使用后端新 runtime；前端不在 action 中附带模型或密钥，不额外调用模型做同步。
- 对 fallback/adaptive 控件明确其适用范围，避免用户把它们理解成课程路由规则。

### 部署

- 删除产品部署 env 示例、本地启动文档以及实际服务环境的固定 OLL_PROVIDER/MODEL；清理用于课程的 OLL_FALLBACK_PROVIDER。
- 先构建、安装和验证新 Coach 与含契约的 Octos 二进制，再切换配置；仅更新 Octos checkout 不会更新运行服务。
- 前端按 scripts/deploy-public-web.sh 发布；跨仓库版本与新旧接口兼容写入发布记录。

## 验证与实施顺序

1. Octos 按仓库 TDD 约定先写失败测试：主模型 route、自定义 key 名、registry alias、keychain、未配置 key 时拒绝借用全局 key、两用户导出隔离。
2. PluginTool 子进程 fixture 验证：manifest 声明时可读取主模型 key，未声明时完全不可读；shell 和其他技能不获得新增凭据。
3. REST 测试覆盖动态 profile 的 reloaded、startup-pinned 的 restart_required、重建失败的 persisted_but_not_live；保存失败不影响旧 runtime。
4. 同一 session 的真实 action fixture：先调用 A，保存 B，再调用得到 B/model/endpoint/key；进行中的 A 不改变。并发保存后旧 generation 的 bootstrap 不得重新入缓存。
5. Coach 使用本地 HTTP/SSE fixture 核对实际请求的 model、endpoint、key 与协议；文本、照片、手写选区生成及框选辅助都覆盖。profile 与 OLL_* 冲突时 profile 胜出；Ark 请求直接拒绝。
6. 前端设置切换、旧账户迁移提示与 runtime 状态测试。前端运行 pnpm test:unit、pnpm lint、pnpm build；Coach 运行 npm test；Octos 运行相关测试及 cargo check -p octos-cli --features api。
7. 使用相同供应商/模型做交错基线与候选评测，首个可播放片段 p50 不回退、零新增模型往返。用户选择本身较慢的模型不归因于路由实现，但记录实际耗时。
8. 真正公网部署前再核对实际运行版本与配置，进行多用户隔离和即时切换验收。Gemini 不受支持的模型/凭据应在调用或保存测试中明确失败；TTS 切换与课程主模型互不影响。

不在本次重写缓存、不切换 host-managed 模式、不建立课程模型代理服务、不修改 OLL 语义。增加其他课程平台时复用上述路由契约，再为 Coach 补协议适配和能力验证。
