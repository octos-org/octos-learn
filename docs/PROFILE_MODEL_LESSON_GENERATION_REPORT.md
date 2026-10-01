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
| octos / C3 | 同上 | `e9bd3892`：用户 Gemini key 规范导出、隔离宿主凭据、插件/子代理继承环境清理 |
| octos / C4 | 同上 | `e8195d72`：REST 保存返回 runtime 状态，与 OUP 共用转换 |
| octos-learn / C5 | `81a8c23` | `73d5250`：前端显示已生效、重启后生效、暂未就绪；兼容旧服务端 |
| octos / 验收 | 同上 | `f227b968`：动态 profile、真实技能子进程、多用户、进行中切换与真实 Coach 验收测试 |

最终交付还包含本报告、设计/执行文档及文档索引。用户已有的 `public/demo/` 未纳入提交。

## 测试结果

| 命令 / 检查 | 结果 |
|---|---|
| Coach `npm test`（含构建） | 最终 183/183 通过，构建产物已提交 |
| Learn `NODE_OPTIONS=--no-experimental-webstorage pnpm test:unit` | 最终 117 文件、1089 测试通过 |
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

真实错误验证：缺 key 返回 `LESSON_CREDENTIAL_MISSING`；不存在的模型返回 `GEMINI_MODEL_NOT_FOUND`；用户批准精确例外后，无效 key 返回 `GEMINI_AUTH_FAILED`。前端结构化映射测试覆盖全部六种中文文案，错误卡片的“前往设置”入口通过组件测试。未完成浏览器中三种真实错误的人工视觉验收。

## A/B 速度

相同 Gemini 3.6 Flash、相同文本请求，旧版 Coach + `OLL_PROVIDER/OLL_MODEL` 对新版 Coach + profile，交错配对，各 20 次；40 次均成功。首片段以 `lesson-prefix-published.elapsed_ms` 计。

| 指标 | 基线 | 候选 |
|---|---:|---:|
| p50（中位数） | 8054.5 ms | 7688.5 ms |
| p90（nearest rank） | 9771 ms | 12479 ms |
| model-call 总次数（包含模型输出修复） | 40 | 43 |

p50 改善约 4.5%，未回退。候选 p90 高约 27.7%，本次样本不足以确认尾延迟无回退。20 对样本的 paired bootstrap（10000 次重采样、固定随机种子）给出候选减基线的 95% 区间：p50 为 -975～1136.5 ms，p90 为 -4099～7749 ms；区间包含 0，但这不等于证明性能等价。因此尾延迟验收保留为待复核。

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
- ESLint 原配置扫描 `scratch/`、`delivery/`、Android 等生成目录。增加这些生成目录的 ignore，未降低源码规则。全量 lint 停滞问题仍未修复。
- Rust 验证遇到依赖下载超时、自动模型下载等待及磁盘耗尽；恢复网络、在测试中禁止模型自动下载，并只清理可重建编译缓存后继续。未删除源码、用户数据或用户已有文件。

## 未完成项与部署顺序

未完成项：全量 ESLint 检查；p90 尾延迟复核；浏览器中三种真实错误的视觉验收。主模型路由、用户 key 隔离、进行中稳定性、保存状态和主要自动化验证已完成。

部署留给用户。建议顺序：octos-learn 前端 → learning-coach（至少 `a37c9eb`）→ 清理服务器 env 中的 `OLL_*`，并确认没有模型 key、Vertex 凭据和 `OCTOS_AUTH_TOKEN` → Octos 新版本。管理员令牌放 `config.json`。


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
