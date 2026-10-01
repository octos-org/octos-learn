# 修复指令：生成中切换模型导致会话被锁

日期：2026-10-01。交给执行者（GPT）。前置文档：`PROFILE_MODEL_LESSON_GENERATION_REVIEW_FOLLOWUP.md` 及你在 `PROFILE_MODEL_LESSON_GENERATION_REPORT.md` 中提交的 2.2 验收结果。

**本轮授权你修改 Octos 的 runtime 重建逻辑，但只限于第 3 节列出的范围。** 其余约束不变：不合并、不部署、不改服务器。

## 1. 问题定位（审查方结论）

你在 2.2 中观察到的现象，根因如下：

1. `PUT /api/my/profile` 调用 `commit_profile_llm_runtime_transition`（`ui_protocol_transport.rs`）。该函数清掉缓存后，通过 `ensure_session_profile_runtime` → `bootstrap_with_host_plugins` → `bootstrap_resolved` **完整地重新 bootstrap** 一个 ProfileRuntime。
2. `bootstrap_resolved` 的第 4 步会重新打开 `episodes.redb`（`EpisodeStore::open_with_dimension`，`runtime/profile.rs` 约 1065–1100 行）。redb 同一时间只允许一个写者。进行中的课程仍持有旧 runtime 的 `Arc`，所以锁未释放，打开失败（`Database already open`），保存结果为 `persisted_but_not_live`。
3. 缓存已被清空，因此旧任务结束之前，同一用户的每个 `session/open` 都会再次尝试 bootstrap，每次都得到 `data_dir_locked`。刷新后的页面因此无法建立会话，也就收不到课程交付。
4. 这是 Octos 上游已有的问题。OUP 的 `profile/llm/select/upsert/delete` 走的是同一个 transition，只是以前很少在任务进行中被触发。设置页保存现在也会触发它，所以变成了常见路径。

Octos 已经有现成的先例：技能变更时调用 `rebuild_plugin_layer()`（`runtime/profile.rs` 约 749 行），新 runtime **共享**旧 runtime 的长期资源，包括 `memory`、`memory_store`、`recall`、`tool_config`、`embedder` 和 `cron_service`，只重建插件层；替换时再用 `replace_profile_runtime_if_current` 做并发保护。模型切换应当采用同一思路。

## 2. 修复原则

- 模型或 key 变更时，如果缓存里已有 runtime，就**基于旧 runtime 派生新 runtime**：
  - **共享**存储与长期服务，不重新打开任何 redb 或文件锁，不新起 cron；
  - **重建**所有由配置推导出的内容：provider 链、plugin env、blocked env、插件层、system prompt、tool policy 等。
- 派生出的 runtime 内容必须与冷启动得到的完全一致（共享的句柄除外），保证派生路径和冷启动不会出现两套不同的行为。
- 无法安全共享时（见 3.3），退回现有的完整 bootstrap，并保持现有的 disposition 语义。
- 进行中的任务继续持有旧 runtime，行为不变：使用旧模型和旧 revision。

## 3. 修改范围

### 3.1 `crates/octos-cli/src/runtime/profile.rs`

1. 新增结构体 `SharedProfileResources`。字段应当是第 4、5 步以及 cron 当前创建的那些长期资源：`memory`、`memory_store`、`recall`、`tool_config`、`embedder`、`cron_service`。实现前先检查 `rebuild_plugin_layer_using` 中 `Self { .. }` 的构造（约 900–920 行），凡是从 `self` 克隆过来的长期句柄都要纳入；如有遗漏或拿不准的字段，在报告中列出。
2. 给 `bootstrap_resolved` 和 `bootstrap_with_host_plugins` 增加可选参数 `shared: Option<SharedProfileResources>`：
   - 传入 `Some` 时：跳过第 4、5 步中打开存储的操作，以及 cron 的创建，直接使用传入的句柄。
   - 其余步骤（provider、plugin env、工具注册、prompt 等）与冷启动走完全相同的代码。
   - 现有调用方一律传 `None`，行为不变。
3. 新增方法 `ProfileRuntime::shared_resources(&self) -> SharedProfileResources`。
4. 新增方法 `ProfileRuntime::can_share_resources_with(&self, new_config: &Config, data_dir: &Path) -> bool`。只有以下条件全部满足时才返回 true：
   - `data_dir` 相同（同时比较 `session_store_root`）；
   - 新配置推导出的 embedder 维度与旧的相同。可以比较 `chat::create_embedder` 的结果维度，或者比较 embedding 配置本身；选一种，并在报告中说明理由；
   - memory 相关的 host 或 profile 配置没有变化（例如 `memory_refresh_enabled`）。

### 3.2 `crates/octos-cli/src/api/ui_protocol_transport.rs`

修改 `commit_profile_llm_runtime_transition`，dynamic profile 分支的新流程如下：

1. 在 bump generation、移除缓存**之前**，先取出当前缓存的 runtime，记为 `old`，可能为空。
2. `invalidate_profile` 和 bump generation 的顺序保持不变。
3. 重建：
   - 如果 `old` 存在，且 `old.can_share_resources_with(...)` 为 true：在 `profile_bootstrap_lock` 下，用新 profile 和 `Some(old.shared_resources())` 调用 bootstrap，再用 `insert_profile_runtime_if_current(&key, generation, ..)` 写回缓存。结果为 `Reloaded`。
   - 否则走现有的 `ensure_session_profile_runtime` 路径，disposition 语义不变。
4. 把派生逻辑抽成一个函数（例如 `rebuild_profile_runtime_sharing_resources`），方便单独测试。
5. startup-pinned 分支不改，仍然返回 `restart_required`。

此外，`ensure_session_profile_runtime` 中，当 bootstrap 因 `is_episode_store_locked` 失败时，现在返回的提示是“另一个 octos 进程占用”，这会误导用户。改为：如果本进程内的 generation 在近期发生过变化（即刚做过配置切换），返回 `runtime_unavailable`，`kind` 设为 `profile_runtime_switching`，提示语为“正在切换模型，请稍后重试”。只有确实是外部进程占用时，才保留 `data_dir_locked`。如果实现这一判断会牵动较大范围，可以先只改提示语，并在报告中说明。

### 3.3 必须退回完整 bootstrap 的情况

- 缓存中没有旧 runtime（冷启动）；
- `can_share_resources_with` 返回 false；
- 旧 runtime 来自 startup-pinned 的 map（这种情况本来就返回 `restart_required`）。

### 3.4 octos-learn（防御性改动，小改）

前端 `session/open` 收到 `kind` 为 `profile_runtime_switching` 或 `data_dir_locked` 的错误时，按 1、2、4、8 秒退避重试，总时长不超过 30 秒。重试期间显示“正在切换模型，请稍候”；超时后显示现有的错误提示。

这样即使 3.3 的退回路径偶尔遇到锁冲突，用户刷新后的页面也能自动恢复，不会停在“准备中”。

## 4. 测试（先写失败的测试，再实现）

Octos：

1. **核心回归测试**：用 dynamic profile、Cloud 模式，持有旧 runtime 的 `Arc` 并让一个工具保持执行中，然后调用 `update_my_profile` 切换模型。断言以下几点：
   - 返回 `reloaded`，不是 `persisted_but_not_live`；
   - 紧接着调用 `ensure_session_profile_runtime` 成功，拿到新 runtime：model 为 M2，revision 为新值；
   - 新旧 runtime 的 `memory` 是同一个对象（`Arc::ptr_eq`），`memory_store`、`recall`、`tool_config` 和 `cron_service` 同样如此；
   - 进行中的工具结束时，结果仍为 M1 和旧 revision；
   - 不调用 `drop(old)`。**这一点就是本次修复要证明的。**

   可以在现有的 `profile_model_dynamic_skill_acceptance` 基础上修改：去掉其中手动 `drop(old)` 的依赖，或者另写一个测试。
2. **派生与冷启动等价**：对同一个 profile，分别用派生和冷启动的方式得到 runtime，比较以下内容并断言相同：`plugin_env_template`（按键排序后比较）、`plugin_blocked_env`、`provider_name`、`primary_model_id`、工具名集合、`system_prompt`。
3. embedder 维度变化时，`can_share_resources_with` 返回 false，并走现有路径。
4. 两个用户：A 切换模型时，B 的 runtime 不受影响，指针不变。
5. 并发：保存过程中同时有 `session/open` 进来，不能出现两个 runtime 同时被写入缓存，也不能出现 generation 回退。现有的 #2164 和 #2186 回归测试必须全部通过。
6. 锁冲突时的提示语和 `kind` 符合 3.2 的要求。

octos-learn：`session/open` 的退避重试逻辑和提示文案的单元测试。

验证命令：

- 相关 `cargo test`，以及 `cargo test -p octos-cli --features api --lib should_report_`（29 项）；
- `cargo check -p octos-cli --features api`、`cargo fmt --check`；
- 前端：`pnpm test:unit` 和 `pnpm build`。

## 5. 重跑真实验收

用与上一轮 2.2 完全相同的环境和六个步骤重跑（真实 `octos serve`、Cloud 模式、dynamic profile、浏览器）。通过标准：

| 步骤 | 期望 |
|---|---|
| 2 保存 | `runtime_disposition = reloaded`，页面显示“已生效，下一次生成使用新模型” |
| 3 刷新 | `session/open` 成功，没有 `data_dir_locked`；白板、问题卡片和历史完整 |
| 3 框选 | 分类请求到达工具；trace 显示使用的是 **3.5 Flash**，因为它是保存之后的新请求 |
| 4 | M1 的全部 `model-call` 仍为 3.6 Flash 和旧 revision；**刷新后的页面能收到并显示这节课**，不需要重新进入白板 |
| 5 | 下一节课为 3.5 Flash，`route_source = profile`，新 revision |
| 6 | 再次刷新后，两节课和全部历史都在 |

另外再加一项：服务日志中不能出现 `runtime rebuild failed` 或 `Database already open`。

第 4 步的特别说明：如果 `session/open` 成功了，但刷新后的页面仍然收不到进行中课程的交付，说明还存在另一个问题——进行中的 turn 绑定在旧的 SessionRuntime 上，新连接收不到它的事件。遇到这种情况，**不要修**，只报告现象和协议日志，由审查方另行评估。

## 6. 交付

- Octos 和 octos-learn 的提交哈希、测试命令和结果；
- 第 5 节每一步的实际结果，以及截图和日志路径；
- 共享资源字段清单，以及 embedder 维度的判断方式和理由；
- 未完成的事项及原因。

本修复属于 Octos 上游的通用问题。请把 Octos 的改动单独放在一个提交里（不要和 C1–C4 混在一起），方便以后向 octos-org 提交上游 PR。
