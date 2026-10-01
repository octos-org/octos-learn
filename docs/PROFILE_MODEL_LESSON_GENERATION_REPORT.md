# 课程模型路由实施报告

2026-10-01。依据 Claude 设计和执行指令，按 A → B → C 实施。三个仓库均先 fetch，再从当时最新 `origin/main` 建立 `codex/profile-model-lessons`。未合并、未部署、未修改服务器。

## 提交

| 仓库 / 阶段 | main 基线 | 特性分支提交 |
|---|---|---|
| learning-coach / A | `2a5fcc5` | `40584a1`：不可变 profile 路由、Ark 课程路径删除、凭据/地址、错误码和 trace |
| learning-coach / 经用户授权的补充 | 同上 | `a37c9eb`：结构化 `API_KEY_INVALID` 的 HTTP 400 精确映射为认证错误 |
| octos-learn / B | `81a8c23` | `d2cd499`：统一课程平台判断、模型推荐、中文错误与设置入口、配置文档 |
| octos / C1 | `ae230ce0` | `ef082360`：strict env gate 拦截未声明的敏感 `OCTOS_*` |
| octos / C2 | 同上 | `d1e82de5`：使用已解析 Config 导出 provider/model/地址/协议/revision |
| octos / C3（已撤销，见文末） | 同上 | `e9bd3892`：用户 Gemini key 规范导出、隔离宿主凭据、插件/子代理继承环境清理；由 `19b832f7` 撤销 |
| octos / C4 | 同上 | `e8195d72`：REST 保存返回 runtime 状态，与 OUP 共用转换 |
| octos-learn / C5 | `81a8c23` | `73d5250`：前端显示已生效、重启后生效、暂未就绪；兼容旧服务端 |
| octos / 验收 | 同上 | `f227b968`：动态 profile、真实技能子进程、多用户、进行中切换与真实 Coach 验收测试 |

最终交付还包含本报告、设计/执行文档及文档索引。用户已有的 `public/demo/` 未纳入提交。

## 测试结果

| 命令 / 检查 | 结果 |
|---|---|
| Coach `npm test`（含构建） | 最终 183/183 通过，构建产物已提交 |
| Learn `NODE_OPTIONS=--no-experimental-webstorage pnpm test:unit` | 复核后最终 117 文件、1100 测试通过 |
| Learn `pnpm build` | 通过，仅既有大 bundle 警告 |
| Learn 修改文件 ESLint | 0 错误；B 为 3 条警告，C5 为 1 条警告 |
| Learn `pnpm lint` | 未完成：持续停在未修改的 `selection-enhancement-layer.tsx` 后中断；复核在基线 `81a8c23` 上重现相同停滞，确认是原有问题。临时排除该文件时其余文件为 0 错误 / 35 警告，未在配置中排除该源码文件 |
| `cargo test -p octos-agent --lib strict_` | 15/15 通过；新增单测和真实子进程测试先失败再修复 |
| `cargo test -p octos-agent --lib loader_forwards_profile_blocked_env` | 1/1 通过 |
| `cargo test -p octos-cli --features api --lib resolved_profile_llm_env_` | 1/1 通过 |
| `cargo test -p octos-cli --features api --lib profile_primary_credentials` | 3/3 通过 |
| `OCTOS_NO_MODEL_DOWNLOAD=1 cargo test -p octos-cli --features api --lib my_profile_runtime_response` | 1/1 通过，覆盖四种保存结果 |
| 同上，过滤 `should_report_` | 29/29 通过，含既有 OUP 重启/重建失败状态回归 |
| `CARGO_INCREMENTAL=0 OCTOS_NO_MODEL_DOWNLOAD=1 cargo test -p octos-cli --features api --lib profile_model_dynamic_skill_acceptance` | 1/1 通过：Cloud、非 solo、动态 profile、实际技能子进程，两个用户同时隔离；进行中的 M1/revision 不变，后续使用 M2/revision |
| 过滤 `profile_model_real_coach_acceptance -- --ignored`，显式提供本地测试 key 和 Coach 路径 | 1/1 通过：真实课程生成过程中保存，当前所有调用保持 Gemini 3.6 Flash，下一课程使用 Gemini 3.5 Flash，trace 均为 `route_source=profile` |
| `cargo check -p octos-cli --features api` | C1–C4 和最终验收源码均通过 |
| `cargo fmt --all -- --check` / `git diff --check` | 通过 |
| `node --test services/hosted-tts/server.test.mjs` | 19/19 通过 |
| 现有个人火山 TTS 两次真实合成 | 两次均 HTTP 200 / code 3000，均返回 41280 字节音频 |

真实错误验证：缺 key 返回 `LESSON_CREDENTIAL_MISSING`；不存在的模型返回 `GEMINI_MODEL_NOT_FOUND`；用户批准精确例外后，无效 key 返回 `GEMINI_AUTH_FAILED`。前端结构化映射测试覆盖全部六种中文文案，错误卡片的“前往设置”入口通过组件测试。复核已完成真实浏览器三种错误与框选辅助界面验收，见下文 2.3。

## A/B 速度

相同 Gemini 3.6 Flash、相同文本请求，旧版 Coach + `OLL_PROVIDER/OLL_MODEL` 对新版 Coach + profile，交错配对，各 20 次；40 次均成功。首片段以 `lesson-prefix-published.elapsed_ms` 计。

| 指标 | 基线 | 候选 |
|---|---:|---:|
| p50（中位数） | 8054.5 ms | 7688.5 ms |
| p90（nearest rank） | 9771 ms | 12479 ms |
| model-call 总次数（包含模型输出修复） | 40 | 43 |

p50 未回退；p90 差异来自模型修复调用，与路由代码无关；上线后观察一周线上 p90。按 2026-10-01 审查结论，尾部来自 3 次 model-call 的修复样本及一个离群值；仅看 2 次调用的样本，两组中位数为 7353 和 7456 ms，基本一致，结合请求体字节一致及零新增路由请求，不阻塞上线，不再重测 A/B。原始数据仍完整保留。此前 paired bootstrap（10000 次、固定种子）的候选减基线 95% 区间：p50 -975～1136.5 ms，p90 -4099～7749 ms；这是样本统计，不作为性能等价证明。

额外调用来自非确定性的模型输出修复，未增加路由解析或配置验证的模型请求。同一 provider/model 的四类请求及有/无图片的请求体字节一致性测试通过；Gemini 流式 bootstrap 未开启。数据测量于 `40584a1`；后续 `a37c9eb` 只修改失败 HTTP 响应分类，不改变成功请求路径。

原始非敏感数据：[PROFILE_MODEL_LESSON_GENERATION_AB_DATA.json](PROFILE_MODEL_LESSON_GENERATION_AB_DATA.json)。

## 实施差异与发现

- Coach 顶层 `error_code` 原本被 Octos PluginTool → action/job 转换丢弃。先报告断点后，复用既有 `structured_metadata.error_code` 通道；前端未解析错误文本。
- 用户在执行中明确批准 A4 的精确例外：只有 Gemini HTTP 400 的结构化 `error.details[].reason=API_KEY_INVALID` 归为 `GEMINI_AUTH_FAILED`，其他 400 保持 schema 错误，无新增重试。新增 bootstrap/section 和负向测试先失败，修复后通过；流式/非流式共用该分类函数。
- 为清除宿主 key，仅删除 plugin extra env 不够，因为 manifest 允许的变量仍可从进程继承。增加通用 `blocked_env` loader 策略并传递给插件重载和子代理，未引入课程业务逻辑或新 key 变量。
- Octos 现有部署标志为 `AppState.deployment_mode`（Local/Tenant/Cloud）和 `solo_login_enabled`。将宿主部署模式传入已解析 Config；Local（含 solo 和非 solo 本地）保留回落，Tenant/Cloud 禁止 Gemini 宿主 key 回落。本项目公网配置为 Cloud。
- 普通 harness 变量审计未发现 secret-like 误判；未声明的 `OCTOS_AUTH_TOKEN`、`OCTOS_ADMIN_TOKEN` 及已注册 secret 被拒绝，显式 allowlist 的 secret 仍可使用。
- 正常用户旧模型/不支持平台的保存值不被自动改写。首次真实切换测试误选 Gemini 2.5 Flash，其拒绝现有 schema；该选择不合适，未为 2.5 添加适配，随后改用 3.6 → 3.5 完成验收。
- 旧 runtime 被进行中的任务持有时，内存数据库锁可能阻止立即重建，保存应报告 `persisted_but_not_live`。旧任务完成并释放后，下一次请求重试加载新模型；动态/真实验收确认这一行为。
- ESLint 原配置扫描 `scratch/`、`delivery/`、Android 等生成目录。增加这些生成目录的 ignore，未降低源码规则。复核已在基线重现相同停滞，按指令不修改。
- Rust 验证遇到依赖下载超时、自动模型下载等待及磁盘耗尽；恢复网络、在测试中禁止模型自动下载，并只清理可重建编译缓存后继续。未删除源码、用户数据或用户已有文件。

## 未完成项与部署顺序

复核待办已逐项执行。**第 2.2 项验收未通过：** 生成中改模型后，锁窗口阻止 session/open/框选分类；即使后端课程完成，刷新后的页面仍停在准备中，需再次进入白板恢复。按照复核要求，不修改 Octos 的 runtime 缓存、锁或会话查找逻辑，等待审查方评估修法。全量 ESLint 未跑完，但基线已确认同样停滞，属于原有问题且按指令不修。错误界面验收已完成，A/B 已按审查结论关闭复核。

部署由用户执行，本次未合并、未部署、未改服务器。建议顺序：

1. **Octos**：先上线运行时热替换修复（`241f14f5`）和 C1 安全修复。
2. **learning-coach**：至少包含 `a37c9eb`。
3. **octos-learn 前端**：放在最后，保证提示文案与实际行为一致。
4. **清理服务器 env 的 `OLL_*`**：可在任意时点进行；新版 Coach 在 profile 模式下忽略这些变量。

部署前先确认线上 Octos 的当前版本。本分支基于 `ae230ce0`；若线上更旧，本次部署会同时包含上游其他改动，需单独评估，不能把旧交接文档的版本当作当前线上版本。服务进程不得含模型 key、Vertex 凭据及 `OCTOS_AUTH_TOKEN`；管理员令牌放 `config.json`。

## 复核跟进：2.4 lint 基线对照（2026-10-01）

在 `git archive 81a8c23` 导出的独立目录中复用现有 node_modules，运行 `pnpm --config.verifyDepsBeforeRun=false lint --debug`；关闭的是 pnpm 自动依赖重装检查，没有关闭 ESLint 规则。该目录的 package.json、pnpm-lock.yaml 和 selection-enhancement-layer.tsx 与本分支 SHA-256 完全相同。

基线和本分支 `pnpm lint --debug` 均在该文件的 parsing/scope analysis successful 后持续停住，各 120 秒后中断。这是原有问题，按审查指令不修改。证据：`.local-dev/profile-model-review/2.4-baseline-lint.log`、`2.4-baseline-lint-result.json`、`2.4-candidate-lint.log`、`2.4-candidate-lint-result.json`。本轮修改文件 lint 通过（0 错误、1 条既有警告）。


## 复核跟进：2.2 真实 Cloud 服务与浏览器（2026-10-01）

环境：Octos `f227b968` 的真实 `target/debug/octos serve`，`mode=cloud`、未传 `--solo`；隔离 registry 和数据位于 `.local-dev/profile-model-review/state/`。用户 A 为本地测试账户 `review-a`，使用真实用户 JWT（隔离环境的 static-token 登录）。Coach 为 `a37c9eb` 的构建产物，前端为 `7341cac`。HTTPS 5173、Chromium、1440×1100。宿主进程中同时存在测试用 Gemini key，以验证后续 Cloud 严格 BYOK。所有测试凭据与原始状态均 gitignored；交付日志已脱敏。

| 步骤 | 实际结果 | 截图（相对于 `.local-dev/profile-model-review/`） |
|---|---|---|
| 1 | A 发起完整一次函数课程；3.6 Flash，route_source=profile，revision `2026-10-01T16:52:31.829369+00:00` | `2.2-refresh-during.png` |
| 2 | 首个 model-call started 后约 78ms，在真实设置页保存 3.5。HTTP 200，persisted_but_not_live，新 revision `2026-10-01T16:52:37.032262+00:00`；显示“已保存。当前任务结束后，下一次生成将使用新模型” | `2.2-save-status.png` |
| 3 刷新 | 当前课程仍在生成，刷新 /learn 后 1 项笔迹、待回答问题卡片和本地历史保留；但 session/open 返回 -32603 / data_dir_locked，不能恢复正常课程交付连接 | `2.2-refresh-during.png`、`2.2-history-during.png` |
| 3 框选 | 点击“选择全部笔迹”，发起现有笔迹的自动分类；session/open 返回 -32603 / data_dir_locked，分类没有成功到达工具；面板随后显示“没有可靠识别出内容，请手动选择类型” | `2.2-selection-during.png`、`2.2-M1-finished.png` |
| 4 | 后端 M1 完成：全部 model-call 保持 3.6 / 原 revision，最终 lesson-plan-generation=completed，已产出课程。但刷新后的页面仍停在“正在准备回答/正在搭建这节课”，没有实时交付到界面 | `2.2-M1-finished.png` |
| 5 | 再进入白板后 M1 可恢复；下一节真实课程用 3.5 Flash / route_source=profile / 新 revision，并完成生成 | `2.2-refresh-final.png` |
| 6 | 再刷新后，两节课程画面、两张已回答问题卡片、1 项笔迹均在；学习记录里仍有当前白板 | `2.2-refresh-final.png`、`2.2-history-final.png` |

**判定：发现问题，2.2 不通过。** 复现只需一个 serve 进程：先启动动态 profile 的课程，再保存不同模型，任务完成前刷新并全选现有笔迹。保存使重建失败，进行中 runtime 的 redb 单写锁阻止 session/open；刷新后的页面不自动恢复交付，需再次进入白板。服务端文字声称另一个进程持锁，但本次只有一个测试服务，所以不能按该报错推断为多进程冲突。

服务日志 `.local-dev/profile-model-review/service-runtime.log` 在 `2026-10-01T16:52:37.039859Z` 记录 `profile LLM mutation saved but runtime rebuild failed`，原因 episodes.redb `Database already open`。浏览器协议日志 `switch-browser-events.jsonl` 在 16:52:37.341Z、16:52:38.350Z、16:52:40.377Z 和 16:52:44.401Z 记录 session/open 失败。步骤原始结果：`switch-results.json`；trace：`traces/fe3e706e-b871-43b2-a148-b4cb7805463c.generation-trace.jsonl`（M1）、`traces/b1e56dc5-187d-4e03-89cb-2fdb86ba8887.generation-trace.jsonl`（M2）。

按复核指令，只报告现象和证据；未修改 Octos runtime 缓存、锁或会话查找逻辑。


## 复核跟进：2.3 真实中文错误界面（2026-10-01）

同一 Cloud/dynamic 环境，真实 API 更新用户设置，真实课程 action/模型响应；未 mock 网络或错误。

| 情况 | 结构化错误码 | 问题卡片与底部错误条 | 链接点击 |
|---|---|---|---|
| 删除用户 key 条目（宿主仍有测试 key） | LESSON_CREDENTIAL_MISSING | “请在设置中填写你的 Gemini API Key” | 两处均进入 /settings?tab=llm |
| 无效 key | GEMINI_AUTH_FAILED | “Gemini API Key 无效，或没有访问该模型的权限” | 两处均进入 /settings?tab=llm |
| 不存在模型 ID | GEMINI_MODEL_NOT_FOUND | “所选模型不存在或你的 Key 无权使用，请在设置中更换” | 两处均进入 /settings?tab=llm |
| 无效 key，框选辅助“解释这部分” | GEMINI_AUTH_FAILED | 新建的框选问题卡片显示无效 key 中文提示与“前往设置” | 正确进入 LLM 设置页 |

第 2.3 项通过。框选验收使用新的空白白板，等待新的选区问题卡片出现（问题 ID `0782553d-2d71-4137-b2dd-c4747257c1ae`），避免旧错误卡片造成假阳性；自动分类本身的失败提示仍为原有通用提示，第三项验证的是“解释这部分”辅助入口的课程失败展示。

截图均位于 `.local-dev/profile-model-review/errors/`：三种情况各有 `<missing-key|invalid-key|missing-model>-board.png`、`*-settings-from-card.png`、`*-settings-from-bottom.png`；框选为 `invalid-key-selection-verified.png`、`invalid-key-settings-from-selection-verified.png`。结果/脱敏协议日志：`.local-dev/profile-model-review/errors-results.json`、`errors-browser-events.jsonl`、`selection-results.json`、`selection-browser-events.jsonl`。

测试准备过程中，留空既有 key 会按 save_with_merge 语义保留原值；因此改为删除 env_vars 条目构造真正缺 key 情况。初次框选脚本在发送后读取已关闭的面板发生超时；修正脚本后完整重跑，没有应用代码变更。这些准备失败分别保留在 `fixture-empty-key-retained-*`、`panel-closed-after-send-*` 文件中，不计为验收通过记录。


## 复核交付汇总（第 4 节）

依据 [REVIEW_FOLLOWUP](PROFILE_MODEL_LESSON_GENERATION_REVIEW_FOLLOWUP.md)，继续原特性分支，未合并/部署/修改服务器；Coach 和 Octos 本轮没有源码变更。

| 待办 | 完成情况 | octos-learn 提交 |
|---|---|---|
| 2.1 保存提示 | 已完成：persisted_but_not_live 文案修正；两个界面按钮旁 role=status 常驻，编辑后清除；按钮 Saved 两秒；兼容旧接口 | `7341cac` |
| 2.2 真实生成中切换 | 已执行全部六步并记录；发现锁窗口与刷新后交付问题，验收不通过，未擅自修 Octos | `c954ae6` |
| 2.3 三种错误界面 | 已完成：三种错误在问题卡片/底部显示中文，六个链接和一次框选辅助链接均正确进入 LLM 设置 | `3edc04c` |
| 2.4 lint 基线 | 已完成：81a8c23 与本分支相同停滞；120 秒超时，原有问题，按要求不修 | `c027e52` |
| 2.5 报告 | 已调整部署顺序、线上版本前提和 A/B 结论，补充本表及 2.1–2.4 证据；本次文档提交哈希随交付提供 | 最终文档提交 |

测试命令与结果：

- `NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run src/settings/llm-tab.test.tsx src/learning/setup-whiteboard.test.tsx`：22/22 通过（新增验收测试先失败，再修复）；红/绿日志 `2.1-red.log` / `2.1-green.log`。
- `NODE_OPTIONS=--no-experimental-webstorage pnpm test:unit`：117 文件、1100/1100 通过；`2.1-unit.log`。
- `pnpm build`：通过；`2.1-build.log`。
- `pnpm exec eslint src/settings/settings-api.ts src/settings/llm-tab.tsx src/settings/llm-tab.test.tsx src/learning/setup-whiteboard.tsx src/learning/setup-whiteboard.test.tsx`：0 错误、1 条既有 warning；`2.1-lint.log`。
- 基线 `pnpm --config.verifyDepsBeforeRun=false lint --debug` 和本分支 `pnpm lint --debug`：均 120 秒停滞；`2.4-*-lint.log` / `2.4-*-lint-result.json`。
- `CARGO_INCREMENTAL=0 cargo build -p octos-cli --features api`：通过，真实本地服务使用该二进制；日志 `/private/tmp/octos-review-build-second.log`。未改 Rust 源码。
- `node .local-dev/profile-model-review/browser-review.mjs switch`：全部六步执行完成，验收发现上述问题；`switch-results.json` / `switch-browser-events.jsonl`。
- 同脚本 `errors` 和 `selection`：三种错误、六处文字入口链接和新建选区问题的链接通过；结构化协议实际观察到三个预期错误码和 `learning.lesson.generate-from-selection` action。
- `git diff --check`：通过。没有重新进行付费 A/B 测试。

除单独写出的编译日志外，上述证据路径均相对于 `.local-dev/profile-model-review/`。该目录为 gitignored，测试配置/会话文件 0600，截图和交付日志不包含 key。用户已有 `public/demo/` 保留。本次启动的本地前端和测试后端已停止，证据与私有测试状态保留，未修改用户日常 profile。

未完成的修复：2.2 所发现的 Octos 锁窗口/会话恢复问题，按明确指令留给审查方评估；未完成的检查：全量 lint，原因是已经确认的基线停滞。没有其他待办未执行。


## 后续：撤销 C3 与运行时热替换修复（2026-10-01，Claude 接手）

### 撤销 C3

用户决定撤销 C3（`e9bd3892`）。原因是它把 Octos Learn 的产品策略写进了通用的 Octos：只对 Gemini 生效，并且按部署模式推断“禁止使用宿主 key”，会影响在 Cloud 模式下由平台提供 key 的其他 Octos 服务。

- 提交 `19b832f7`：revert C3。两个验收测试改为使用 profile 的标准 `GEMINI_API_KEY`，删除 `plugin_blocked_env` 断言。
- 严格自带 key 改由部署保证：服务进程的 env 中不放任何模型 key。已写入 `PUBLIC_DEPLOYMENT_RUNBOOK.md`。
- Coach 不依赖 C3。用户的 `GEMINI_API_KEY` 本来就由 Octos 从 profile 传给技能（`bdce758a`）。

### 运行时热替换修复（解决 2.2）

- 提交 `241f14f5`，单独成提交，方便向上游提 PR。
- 根因：配置提交后，Octos 冷启动一个新 ProfileRuntime，需要重新打开只允许单写者的 `episodes.redb`；而进行中的任务仍持有旧 runtime，锁未释放，打开失败。
- 修法：
  - 提交配置时，以弱引用保留被移出缓存的旧 runtime。
  - 下一次 bootstrap 若存储形态不变（数据目录、embedder 配置、recall 维度均相同），就共享旧 runtime 的 episode/memory/recall/tool-config 存储、cron 服务和 lifecycle，并接管 memory refresh（停掉旧的 sweep，用新模型重新启动）。其余由配置推导的部分全部按冷启动方式重建。
  - 不满足条件时退回冷启动。如果这时撞锁，返回 `profile_runtime_switching`，不再误报为“另一个进程占用”。
- `MemoryRefreshService` 新增可等待的 `shutdown()`：先释放 profile 锁，替换者才能立即接管。

测试：

| 测试 | 结果 |
|---|---|
| `profile_model_dynamic_skill_acceptance`（改为不 `drop(old)`） | 通过：保存返回 `reloaded`；紧接着即可拿到 M2 的新 runtime；存储句柄与旧 runtime 是同一对象；进行中的任务仍为 M1/旧 revision；用户 B 的 runtime 指针不变 |
| 同一测试在去掉修复后 | 失败：`persisted_but_not_live`，与 2.2 的现象一致 |
| `should_share_stores_and_match_cold_bootstrap_when_replacing_runtime` | 通过：旧 runtime 存活时冷启动失败、替换成功；释放后冷启动，配置推导状态（env、provider、model、工具集、system prompt）与替换得到的完全一致 |
| `should_refuse_sharing_when_storage_shape_changes` | 通过：数据目录、embedding、recall 维度、embedding key 变化时都拒绝共享 |
| `should_release_lock_after_shutdown_for_replacement_runtime` | 通过 |
| `profile_runtime_switching_error_is_not_reported_as_a_second_process` | 通过 |
| `cargo test -p octos-cli --features api --lib` 全量 | 4138 通过，0 失败 |
| `cargo test -p octos-agent --lib` 全量 | 2999 通过，3 失败。失败的 3 个是 Docker sandbox 测试；本机没有 Docker，在上游基线 `ae230ce0` 上同样失败，与本次改动无关 |
| `cargo fmt --all -- --check`、`git diff --check` | 通过 |

前端未改。`ui-protocol-bridge.ts` 本来就会对失败的 `session/open` 做退避重连。2.2 中页面停在“准备中”，是因为首次连接有 10 秒的启动期限（`DEFAULT_INITIAL_CONNECT_TIMEOUT_MS`），而锁要等整节课结束才释放，重试在期限内都会失败。修复后第一次 `session/open` 就能成功。

### 待完成

真实服务器加浏览器的 2.2 重跑尚未完成，需要提供 Gemini 测试 key。
