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

## 真实验收：热替换修复（2026-10-01）

按 `PROFILE_MODEL_LESSON_GENERATION_LIVE_ACCEPTANCE.md` 执行。结论：**整体不通过**。真实技能生成期间的热替换仍出现单写者锁错误；连续保存测试中服务发生栈溢出；无宿主 Key 时，缺 Key 的课程错误提示没有到达预期路径。无效 Key、有效 Key、双用户归属检查通过。仅记录验收结果，未修改三个仓库的产品代码，未合并、未部署、未改公网服务器。

### 版本与隔离环境

先完成三个仓库的 `git fetch`，使用各自的 `codex/profile-model-lessons` 分支。Learn 同分支快进到远端最新文档提交，没有生成合并提交。

| 项目 | 实际版本 |
|---|---|
| octos | `241f14f595d46a51b9147c78a0942e41d01c00df` |
| learning-coach | `a37c9eb7d519301c57b2dff667eca24ac50334f1` |
| octos-learn（验收时） | `428428c89871787750af1ccc55f351a9fb22f693` |
| Octos 编译 | 在 `241f14f5` 执行 `CARGO_INCREMENTAL=0 cargo build -p octos-cli --features api`，成功，用时 1m15s |
| 实际二进制 | `/Users/alan0x/Documents/projects/octos/target/debug/octos` |
| 二进制 SHA-256 | `fed3d3171fe02fced7261cfe84218dbbe8f1a7d4a8fd1c17852585fa2511247e` |

证据目录统一为本仓库的 `.local-dev/profile-model-review/live-2/`，下文简称 **E**；本机绝对路径为 `/Users/alan0x/Documents/projects/octos-learn/.local-dev/profile-model-review/live-2/`。`build-octos.log`、`binary-and-environment.json` 记录编译和二进制对应关系。证据不提交 Git；目录权限 0700，凭证 JSON 为 0600。

环境为真实 `octos serve`、`mode=cloud`、不加 `--solo`，独立 registry/data/config，动态测试 profile `live-a`、`live-b`。Octos 仅监听 `127.0.0.1:50080`，Vite HTTPS 前端为 `https://127.0.0.1:5173`，Playwright 驱动 Chromium，通过真实 HTTP/OUP 和 Gemini API 执行。每个 profile 使用上述 Coach 提交的已构建技能；没有模型返回 mock。只使用 3.6 Flash、3.5 Flash。

服务启动前，在**实际传给服务进程的环境**中执行以下命令；崩溃重启时再次执行，均为空输出：

```sh
env | grep -E 'GEMINI|GOOGLE|VERTEX|OPENAI|OCTOS_AUTH_TOKEN' | cut -d= -f1
```

实际输出：**空，0 字节**，见 `E/env-check.txt`。启动包装脚本删除全部匹配名称后断言检查结果为空，没有向宿主进程传入模型 Key。服务认证凭据来自隔离配置文件。A 的有效 Key 和 B 的独立无效 Key 仅通过 `PUT /api/my/profile` 写入各自测试 profile；没有修改正常用户 profile。`OCTOS_NO_MODEL_DOWNLOAD=1`，本机无 embedding 模型，日志显示记忆搜索使用 keyword-only；未下载模型。所有下文时间为 UTC。

### A：生成过程中切换模型

旧 revision 为 `2026-10-01T18:08:50.514278+00:00`，保存 3.5 Flash 后的新 revision 为 `2026-10-01T18:08:54.804981+00:00`。总记录为 `E/A-results.json`、`E/A-protocol.jsonl`。

| 步骤 | 实际结果 | 判定与截图 |
|---|---|---|
| A1 3.6 发起完整文本课程 | 18:08:54.625 首个 `model-call` 开始，模型 3.6、profile 路由、旧 revision。发起前画入一项笔迹并等待保存 | 通过；`E/A-A1-started.png` |
| A2 生成中设置页保存 3.5 | HTTP 200，但 `runtime_disposition=persisted_but_not_live`，`runtime_error` 指向 `episodes.redb: Database already open`。页面显示“已保存。当前任务结束后，下一次生成将使用新模型”，没有显示要求的“已生效” | **不通过**；`E/A-A2-save.png` |
| A3 课程完成前刷新 `/learn` | 第一条 `session/open` 返回 -32603，`data.kind=data_dir_locked`；之后三次重试仍同样失败。笔迹保存数量 1、原问题卡片和历史项仍在，但连接未成功 | **不通过**；`E/A-A3-refresh.png`、`E/A-A3-history.png` |
| A3 对已有笔迹发起分类 | 点击“选择全部笔迹”，显示已选 1 项；在生成仍进行时观察 20 秒，没有分类工具 trace，也没有 `learning.selection.classify` 到达工具的协议记录 | **不通过，受连接失败阻断**；`E/A-A3-selection.png` |
| A4 等原课程完成 | 18:09:21.727 后端 `lesson-plan-generation=completed`，4 次调用全部为 3.6/profile/旧 revision。完成后继续等待 45 秒，到 18:10:06.850 页面仍是“正在准备回答”，loading block 仍在。期间未重新进入白板 | 后端路由冻结通过；**刷新后的课程交付不通过**；`E/A-A4-complete-without-reentry.png` |
| A5 再发起课程 | 在同一页面提交下一问题；这次操作触发新的 `session/open`，18:10:08.038 成功。2 次调用全部为 3.5/profile/新 revision，18:10:24.943 后端完成 | 新模型/revision 通过；`E/A-A5-next-complete.png` |
| A6 再次刷新 | 两个问题均“已回答”，无 pending/loading/error；笔迹仍为 1 项，原白板历史项仍在，两节课程恢复可见 | 通过；`E/A-A6-refresh.png`、`E/A-A6-history.png` |

A5 操作时，A3 留下的笔迹仍处于选中状态，因此前端实际调用 `learning.lesson.generate-from-selection`，问题内容附带“引用的白板选区”；该次确实生成了下一节课，但不是纯文本入口。A5 前没有导航或手动重新进入白板；**后续操作触发的连接恢复不能算作 A3 的一次连接成功或 A4 的自动交付通过**。

关键协议时间线（完整请求 ID、响应、通知在 `A-protocol.jsonl`）：

- 18:08:55.058 / 55.077：刷新后的首条 `session/open` 请求 / `data_dir_locked` 响应。
- 18:08:56.082、18:08:58.097、18:09:02.117：三次重试，均为 `data_dir_locked`。
- 刷新后到 A4 截图期间，仅有错误响应、heartbeat 等记录，没有该课程的成功交付通知。
- 18:10:07.908 / 18:10:08.038：下一操作触发 `session/open` 并成功；紧接着派发下一课程。

文档提到的“`session/open` 成功但旧任务交付丢失”的独立问题，**本轮不能单独确认**：A 的首次 open 本身就失败了。可以确认的现象是：在后端完成 45 秒后，刷新页面仍未恢复课程，直到后续操作/刷新恢复。

A 的 trace 位于 `E/state/profiles/live-a/data/users/learn-1790877662972-0ctg68/workspace/skill-output/study/oll/`：

- 当前课程：`0ec6c1d3-ebf7-4fc6-8b32-1dadbd50f4b9.generation-trace.jsonl`。
- 下一课程：`db30bc82-f7d3-424b-9eb3-658373cea275.generation-trace.jsonl`。

### B：同一节课生成中连续保存两次

总记录为 `E/B-results.json`、`E/B-protocol.jsonl`。B 首次课程使用 3.6/profile，revision 为 `2026-10-01T18:10:49.131935+00:00`。

| 步骤 | 实际结果 | 判定与证据 |
|---|---|---|
| B1 发起课程 | 首个调用 18:10:50.916 开始，3.6/profile/初始 revision | 通过；`B-results.json` 的 `B1-current-started` |
| B2 首次保存 3.5 | 18:10:51.024 收到结果，HTTP 200，`persisted_but_not_live`，revision `2026-10-01T18:10:50.975138+00:00`，同样的 redb 锁错误 | **不通过**；`E/B-B2-first-save.png` |
| B2 约 2 秒后保存回 3.6 | 18:10:53.153 收到结果，两次结果相距 2.129 秒，HTTP 200，仍为 `persisted_but_not_live`，revision `2026-10-01T18:10:53.131910+00:00` | **不通过**；`E/B-B2-second-save.png` |
| B4 当前课程完成 | 首轮调用完成，仍使用初始模型/revision；trace 最后停在 `lesson-plan-outline-ready`。随后服务栈溢出中止，180 秒观察没有完成记录 | **被服务崩溃阻断，不能判为完成** |
| B5 下一课程使用第二次保存 revision | 服务中止，未执行到下一节课程验证。停止 B 的浏览器脚本，避免重启服务后继续发请求干扰 C | **阻断** |
| B6 无锁错误 | 两次保存均有 `Database already open` | **不通过** |

服务原始 fatal 输出已保存在 `E/server-run1.log`：

```text
thread 'tokio-rt-worker' (3732399) has overflowed its stack
fatal runtime error: stack overflow, aborting
```

包装进程退出码 250，对应 Python 子进程返回 -6（SIGABRT）。当时本地 50080 已不再监听。fatal 行没有时间戳；最后一条滚动服务日志为 18:10:53.139275，因此不把这条日志时间冒充精确崩溃时间。没有 Rust backtrace，**未确认栈溢出根因，也未推断它一定由第二次保存直接触发**。这是本轮观测到的真实服务崩溃。

B trace：`E/state/profiles/live-a/data/users/learn-1790878249577-djm8cw/workspace/skill-output/study/oll/421a3725-1f43-4677-a629-ffd6d6db8f5d.generation-trace.jsonl`。B 协议记录覆盖两次保存期间，后续完成步骤因崩溃没有完整截图。`B-results.json` 保留超时、验收脚本停止及单独记录的服务 fatal 证据。

为完成 C/D，仅重启同一二进制、同一隔离数据目录；启动环境检查再次为空。重启后的 stdout 为 `E/server.log`，滚动日志与第一次运行均汇总在 `E/service-runtime.log`。没有重新编译或修改实现。

### C：严格自带 Key 回归

`E/C-results.json`、`E/C-protocol.jsonl` 记录最终一轮完整 C。第一轮缺 Key 测试因无法取得工具 trace 而停止，保留在 `E/C-first-attempt-results.json`、`E/C-first-attempt-protocol.jsonl`；调整的只是 gitignored 验收脚本，使其记录这一阻断后继续其余情况。

| 情况 | 实际结果 | 判定与截图 |
|---|---|---|
| 删除 A profile 的 `GEMINI_API_KEY` 条目 | PUT 200、`persisted_but_not_live`；`session/open` 返回 `runtime_unavailable`，消息为 `failed to create LLM provider ... GEMINI_API_KEY not set or empty`。问题提交后无课程工具 trace，问题卡仍“正在准备回答”，没有 `LESSON_CREDENTIAL_MISSING` 和指定中文提示。第一轮已等待 45 秒，仍未产生工具 trace | **不通过**；`E/C-C1-missing.png`、`E/C-harness-error-0.png` |
| A 写入无效 Key | PUT `reloaded`，真实 Gemini 请求失败，trace 为 `GEMINI_AUTH_FAILED`；问题卡与底部均显示“Gemini API Key 无效，或没有访问该模型的权限”，有“前往设置” | 通过；`E/C-C2-invalid.png` |
| A 写回有效 Key | PUT `reloaded`，3.6/profile 课程正常完成，OUP job 为 `succeeded`，问题卡“已回答” | 通过；`E/C-C3-valid.png` |
| A 有效 Key、B 自己的无效 Key，同时提交 | 两条派发请求时间相距约 15ms。A 成功，B `GEMINI_AUTH_FAILED`。所有 `skill/action/job/updated` 的 page/profile 归属检查错配 0；trace 在不同 profile/session 工作区、revision 不同，A 页面没有 B 的错误，B 页面没有 A 的课程 | 通过；`E/C-C4-a.png`、`E/C-C4-b.png`、`E/D-C4-post-completion.png` |

并发提交不等于模型调用一定重叠：本轮 B 在 A 开始模型调用前失败，协议能够证明请求同时提交以及结果各自归属。最终 A 页面复查为 pending 0、loading 0、error 0。有效 Key 课程刚完成时的截图可能还显示短暂 loading，后续截图记录最终状态。

C4 A revision：`2026-10-01T18:15:45.088248+00:00`；B revision：`2026-10-01T18:15:53.168476+00:00`。trace：

- A：`E/state/profiles/live-a/data/users/learn-1790878553869-s3iqyf/workspace/skill-output/study/oll/64aa55b8-6654-46f6-ac56-f0f53210365c.generation-trace.jsonl`。
- B：`E/state/profiles/live-b/data/users/learn-1790878553631-zhd97s/workspace/skill-output/study/oll/859de958-8f9b-41fb-9b91-e1adc3fc32fe.generation-trace.jsonl`。

缺 Key 检查确认服务没有借用宿主 Key，但**这不等于指定错误体验通过**。阻断发生在通用 ProfileRuntime 创建 provider 时，课程技能尚未执行，所以没有到达 Coach 的缺凭证错误映射。原样记录，未修复。

### D：记忆整理和定时任务

- D1：检查两次服务运行的完整日志，`memory refresh lock held elsewhere` 为 **0 行**，满足该告警的负向检查。A/B 的 `runtime_disposition` 没有达到 `reloaded`，因此**不能把告警为 0 扩大为热替换接管已验证成功**。保存期间还观察到 `cron service shutdown signalled`，见服务日志；未据此推断任务丢失。
- D2：**任务保留/不重复检查跳过**。隔离测试环境没有已有 cron 任务，当前设置页/OUP 面板只有 `cron/list` 和 `cron/toggle`，没有创建入口；本轮未通过模型驱动聊天创建任务。实际调用真实 OUP `cron/list` 得到 `jobs=[]`、`count=0`、`gateway_running=false`，仅说明查询可用，不能证明热替换保留已有任务。记录为 `E/D-results.json`、`E/D-protocol.jsonl`，截图 `E/D-D2-cron-list.png`。这是第 6 节允许的跳过项。

### 日志搜索、证据与交付边界

对 `E/service-runtime.log` 按关键词搜索，计数单位为**命中的日志行**：

| 关键词 | 行数 | 说明 |
|---|---:|---|
| `runtime rebuild failed` | 5 | A 保存 1、B 保存 2、C 缺 Key 两轮各 1 |
| `Database already open` | 3 | A 保存 1、B 保存 2 |
| `data_dir_locked` | 0 | 此字符串未进入服务日志；A 浏览器 RPC 错误中出现 **4 次**，不能以服务日志 0 行判断通过 |
| `profile_runtime_switching` | 0 | A 实际返回的是 `data_dir_locked` |
| `memory refresh lock held elsewhere` | 0 | 只证明未见这条告警 |

`E/lock-search.json` 保存计数及全部命中日志行。服务日志 67、102、105 行分别是 A 保存、B 两次保存的 redb 锁错误；138、150 行分别是两次缺 Key 的 provider 初始化失败。完整消息和数据目录都在该文件中。

`E/acceptance-summary.json` 汇总判定、模型/revision、协议和用户归属检查；`E/secret-scan.json` 记录对全部 `.log`、`.jsonl`、`*-results.json` 的扫描结果：已知真实 Key、JWT、服务 token 的匹配为 0，未发现需要后补脱敏的日志文件。隔离凭证文件保持私有，不随报告提交。验收脚本也只留在 gitignored 证据目录。

验收结束后已停止本轮创建的 Octos 和 HTTPS 前端，见 `E/cleanup.json`。其他仓库工作区未改。Learn 唯一提交内容为本报告追加；原有 `public/demo/` 未跟踪内容保留。没有为修复失败项改代码，没有合并、部署或改服务器。由于本轮没有实现改动，不重跑前端单元测试或全量 lint；本轮有效验证是指定版本重新编译、真实服务/浏览器验收、协议/trace/日志核对和文档 `git diff --check`。


## 后续：第一轮真实验收失败的修正（2026-10-01，Claude）

- octos `e8dab732`：被替换 runtime 的存储改为强引用保留。真实路径中进行中任务的 Agent 直接持有 `episodes.redb`，而 ProfileRuntime 在会话缓存失效后就被释放，所以第一版的弱引用会失效。验收测试已改为同样的形状；去掉修复后，该测试按预期失败，返回 `persisted_but_not_live`。同时把 bootstrap future 和 retiree 的配置改为 Box：`should_keep_spawn_only_sent_file_identity_and_one_hydrated_attachment` 在 1.5 MiB 栈上通过，而上游 `ae230ce0` 在 1.5 MiB 上会溢出。
- octos `019db9cc`：serve 的 tokio worker 栈改为 8 MiB，与 chat/acp/mcp-serve 一致。
- octos-learn `445dda9`：profile 中缺少模型 key 时，前端视为模型不可用，提交前就给出具体提示和设置链接。
- 测试：`cargo test -p octos-cli --features api --lib` 全量 4138 通过；前端 `vitest` 全量 1101 通过；修改过的文件 lint 结果为 0 错误；build 通过。
- 第二轮真实验收指令：`PROFILE_MODEL_LESSON_GENERATION_LIVE_ACCEPTANCE_2.md`。


## 真实验收（第二轮）

按 `PROFILE_MODEL_LESSON_GENERATION_LIVE_ACCEPTANCE_2.md` 执行，A/B 各跑 debug、release，C/D 使用 release。A：debug 通过、release 通过；单列 A4-交付：debug 通过、release 通过。B：debug 通过、release 通过。C1 部分满足、未完整通过：提示位置与文档不符，提交子项被禁用控件阻断；C2–C4 的无效/有效 Key、双用户回归通过。D 的日志检查和真实 cron 保留检查通过。本轮只验收，不修改产品代码、不合并、不部署、不改公网服务器。

### 版本、构建和环境

三个仓库先 fetch，并同步指定特性分支。Learn 在验收时为 `cc69d4c0e07b0f58c82d6238b979bf32cef0bcfc`，Coach 为 `a37c9eb7d519301c57b2dff667eca24ac50334f1`，Octos 为 `019db9ccb0ec219f26b26ca6e6138dd96e6242ad`。两套 Octos 二进制都由该提交重新构建：

| 构建 | 命令 | 二进制 SHA-256 |
|---|---|---|
| debug | `cargo build -p octos-cli --features api` | `bda7b61bd0f573b35640eebe97d89c35004f924ce4a467b7a4a19be2c7f284e5` |
| release | `cargo build --release -p octos-cli --features api`（环境设 `CARGO_BUILD_JOBS=2` 控制本机占用） | `3836e78123ac1f434b5ef5fc6ce07bc6d6f890e24563146275cf914ea46d5dcb` |

debug 编译成功，用时 1m36s；release 编译成功，用时 12m48s。编译日志为 `E/build-debug.log`、`E/build-release.log`；实际二进制分别为 `/Users/alan0x/Documents/projects/octos/target/debug/octos` 和 `/Users/alan0x/Documents/projects/octos/target/release/octos`。每套服务启动前核对 HEAD 和 SHA-256，记录在 `E/{debug,release}/binary-and-environment.json`。

下文 **E** 为 `.local-dev/profile-model-review/live-3/`，本机绝对路径为 `/Users/alan0x/Documents/projects/octos-learn/.local-dev/profile-model-review/live-3/`。debug/release 使用不同的独立 registry、data、配置和浏览器状态，均为真实 `mode=cloud`、不加 `--solo`、dynamic profile、真实 Coach 技能与 Gemini API；测试用户为各自隔离 registry 中的 `live-a`、`live-b`。先停 debug 再启 release，共用本机 `127.0.0.1:50080` 和 HTTPS 前端 `https://127.0.0.1:5173`；Chromium 无模型 mock。只使用 3.6 Flash、3.5 Flash。下文时间均为 UTC。

每套服务启动前，在实际传给进程的环境中执行：

```sh
env | grep -E 'GEMINI|GOOGLE|VERTEX|OPENAI|OCTOS_AUTH_TOKEN' | cut -d= -f1
```

debug 与 release 的实际输出均为 **空，0 字节**，分别见 `E/debug/env-check.txt`、`E/release/env-check.txt`。宿主没有模型 Key 或 `OCTOS_AUTH_TOKEN`；服务认证来自隔离配置文件；真实模型 Key 仅通过 `PUT /api/my/profile` 写入测试用户 profile。正常用户 profile 未修改。`OCTOS_NO_MODEL_DOWNLOAD=1`，无本地 embedding 模型，记忆搜索使用 keyword-only。

### A：生成中切换、刷新与分类

| 检查 | debug | release |
|---|---|---|
| 保存 3.5 为 reloaded，页面明确已生效 | 通过 | 通过 |
| 刷新首次 session/open 成功 | 通过 | 通过 |
| 原课程未结束时分类到达工具，3.5/profile/新 revision | 通过 | 通过 |
| 原课程完成，全部调用保持 3.6/profile/旧 revision | 通过，4 次 | 通过，4 次 |
| A4-交付：刷新页无后续操作自动显示课程 | 通过 | 通过 |
| 下一节课程完成，全部调用使用 3.5/profile/新 revision | 通过，2 次 | 通过，2 次 |
| 最终刷新两课、问题卡、笔迹和历史恢复 | 通过 | 通过 |

| 路由 revision | debug | release |
|---|---|---|
| 当前课程旧 revision | `2026-10-01T19:32:10.860803+00:00` | `2026-10-01T19:46:21.030671+00:00` |
| 保存后新 revision | `2026-10-01T19:32:13.902566+00:00` | `2026-10-01T19:46:23.983887+00:00` |

A4 后端完成与页面检查时间：debug `2026-10-01T19:32:36.399Z` / `2026-10-01T19:32:36.672Z`（间隔 0.273s）；release `2026-10-01T19:46:47.548Z` / `2026-10-01T19:46:47.823Z`（间隔 0.275s）。这段观察期间未再次刷新、提交或重新进入白板；A3 的规定分类操作完成后直接等待后端完成并检查页面。A5 前通过“浏览白板”退出选区，两套下一课均从文本入口调用 `learning.lesson.generate`。

每套 A 的逐步结果、完整 OUP 协议为 `E/<构建>/A-results.json`、`A-protocol.jsonl`。首次刷新 open 的完整结果、全部后续通知与时间保留在 `A-results.json` 的 A3/A4 记录；通知 method/time 摘要另见 `acceptance-summary.json` 的 `A.delivery`。截图：`A-A1-started.png`、`A-A2-save.png`、`A-A3-refresh.png`、`A-A3-history.png`、`A-A3-selection.png`、`A-A4-complete-without-reentry.png`、`A-A5-next-complete.png`、`A-A6-refresh.png`、`A-A6-history.png`，均在相应构建目录。原笔迹保留 1 项，最终问题卡 2 张，pending/loading/error 均为 0；历史对白板的列表与课程恢复截图已保存。

### B：同一课程连续保存两次

| 检查 | debug | release |
|---|---|---|
| 两次保存都为 reloaded | 通过 | 通过 |
| 两次保存结果之间的间隔 | 2.155s | 2.136s |
| 当前课程正常完成并保持初始 3.6/旧 revision | 通过，4 次调用 | 通过，4 次调用 |
| 下一课程使用 3.6/第二次保存 revision，完成 | 通过，2 次调用 | 通过，2 次调用 |
| 服务不崩溃 | 通过 | 通过 |

| B revision | debug | release |
|---|---|---|
| 初始 | `2026-10-01T19:33:27.854410+00:00` | `2026-10-01T19:47:15.562482+00:00` |
| 首次保存 | `2026-10-01T19:33:29.874617+00:00` | `2026-10-01T19:47:17.409297+00:00` |
| 第二次保存 | `2026-10-01T19:33:32.046092+00:00` | `2026-10-01T19:47:19.563565+00:00` |

两套证据均为 `E/<构建>/B-results.json`、`B-protocol.jsonl`，截图 `B-B2-first-save.png`、`B-B2-second-save.png`、`B-B4-current.png`、`B-B5-next.png`。两节后台 job 完成记录可在协议中核对。两套 B 均未崩溃，文档的 lldb/backtrace 条件步骤不适用。

### C：release 的自带 Key 回归

| 情况 | 实际结果 | 证据 |
|---|---|---|
| 删除用户 Key 并刷新 /learn | 未完整通过：提示文字/设置链接正确，无课程 action、无 pending，旧课程卡与笔迹保留；但提示实际在底部，输入和发送禁用，无法验证提交时错误 | `C-C1-missing-before-submit.png`、`C-C1-missing.png` |
| 无效 Key | `GEMINI_AUTH_FAILED`，问题卡和底部中文鉴权错误 | `C-C2-invalid.png` |
| 恢复有效 Key | 课程正常完成 | `C-C3-valid.png` |
| A 有效/B 无效同时提交 | A completed；B `GEMINI_AUTH_FAILED`；错配 job 事件 0 个 | `C-C4-a.png`、`C-C4-b.png`、`D-C4-post-completion.png` |

缺 Key 时实际提示文字为：“请在设置中填写你的 Google Gemini API Key，笔迹和已有课程仍可使用。”，提示中的“前往设置”指向 `/settings?tab=llm`。该提示位于底部输入框上方，与文档的“顶部提示条”位置不符。输入框和发送按钮均为 disabled，无法通过正常 UI 输入并提交问题，因此没有验证到“提交时立即显示同样文字”这一子项；本轮按严格标准将 C1 记为部分满足、未完整通过。首次脚本对禁用输入框的 fill 等待超时，保存在 C-first-attempt-results.json、C-first-attempt-protocol.jsonl、C-first-blocked-input.png；随后仅调整 gitignored 验收脚本，记录控件禁用并继续 C2–C4。未用 DOM 强制启用或直接调用内部函数替代真实提交。观察期间没有新增正在准备的卡片，也没有发出课程 `skill/action/invoke`。`session/open` 的 `runtime_unavailable` 是文档明确允许的底层行为，未作为 C 失败项；缺 Key 时服务的 provider 初始化失败日志需与 A/B 热替换锁错误区分。详情为 `E/release/C-results.json`、`C-protocol.jsonl`。两个用户 trace、revision、job 归属均保留在汇总中；并发提交不扩大解释为模型调用必须重叠。

### D：release 的记忆整理与 cron

保存期间的记忆锁告警 0 行，cron 关闭日志 0 行；debug 也均为 0。取日志的时间在主动停止测试服务之前，避免把结束测试的 shutdown 与模型保存混淆。

cron 保留检查：**通过**。通过真实 OUP 聊天调用 cron 工具，创建一次性任务；设置页切换模型返回 reloaded，之后真实 cron/list 中同一任务 ID 与同名任务各只有一个。验收后通过 cron/toggle 将该测试任务禁用。

任务名 `live-3-runtime-swap-check`，ID `846c5c2b`；工具在 19:52:06.658 返回创建成功，`mode=notify`、`after_seconds=86400`。OUP 的 `projection/envelope` 在 19:52:08.218 收到 `turn_terminal`，`outcome=completed`；19:53:04.458 模型保存返回 `reloaded`，新旧列表中 ID 和同名任务数量均为 1，19:53:05.691 禁用成功。截图 `E/release/D-D2-cron-after-switch.png`。

验收脚本最初只匹配平铺的 `turn/completed`，没有匹配投影事件，因而等满 60 秒并尝试 interrupt。复核完整协议后确认聊天早已正常完成；`D-results.json` 追加的 `D2-projection-protocol-review` 保留工具和终态证据，不把脚本等待误报为产品超时。

证据为 `E/release/D-results.json`、`D-protocol.jsonl`，记录初始列表、聊天 turn、工具调用、创建后的列表、模型保存、新列表和清理。截图在该目录中；测试任务仅存在于隔离数据目录，不发往其他用户。

### 日志计数、额外观察和交付

关键词计数单位：服务为匹配行，协议为匹配事件。范围为停止服务前保存的日志，两套详见 `E/<构建>/lock-search.json`、`service-runtime.log`。

| 关键词 | debug 服务 | release 服务（含 C/D） | debug 协议 | release 协议 |
|---|---:|---:|---:|---:|
| `runtime rebuild failed` | 0 | 2 | 0 | 0 |
| `Database already open` | 0 | 0 | 0 | 0 |
| `data_dir_locked` | 0 | 0 | 0 | 0 |
| `profile_runtime_switching` | 0 | 0 | 0 | 0 |
| `memory refresh lock held elsewhere` | 0 | 0 | 0 | 0 |
| `cron service shutdown signalled` | 0 | 0 | 0 | 0 |
| `stack overflow` | 0 | 0 | 0 | 0 |

完整 release 日志的 2 行 `runtime rebuild failed` 均来自 C 删除 Key（首次及重跑），原因均为 `GEMINI_API_KEY not set or empty`，属于文档允许的底层初始化行为。**debug/release 的 A、B 时间段内，上表全部服务关键词和协议锁错误均为 0**；D 的服务关键词也均为 0。分阶段计数在 `acceptance-summary.json` 的 `phase_service_keyword_matching_lines`，具体命中行在 `lock-search.json`。

另外观察到 debug 新白板早期 `session/title.set` 返回 `unknown_session`，A 两次、B 一次，未影响本轮要求的 open、生成和最终历史恢复。debug A4 截图有一块公式显示红色 LaTeX 源码；本轮未排查该内容/渲染问题，作为范围外现象保留截图，不据此修改实现。

所有课程与分类 trace 都在 `E/<构建>/state/profiles/<用户>/data/users/<会话>/workspace/skill-output/study/oll/`，具体完整路径在各阶段 results 和 `acceptance-summary.json`。所有已知真实 Key、JWT、服务 token 的日志扫描结果记录在 `secret-scan.json`，两套已知凭证匹配均为 0；凭证文件权限 0600，证据目录 0700，日志和截图不进入 Git。

验收结束后停止本轮创建的服务和 HTTPS 前端，保留 `cleanup.json`。唯一交付提交为此报告追加，原有 `public/demo/` 未跟踪内容保留；Octos/Coach 工作区未改，未合并或部署。两套二进制构建与真实验收是本轮验证内容；没有实现改动，未重跑无关全量单元测试或 lint。文档 `git diff --check` 通过。
