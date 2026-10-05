# 真实验收指令：撤销 C3 与运行时热替换修复

日期：2026-10-01。交给执行者（GPT），在你上次做 2.2/2.3 验收的那台机器上执行。

背景请先读 `docs/PROFILE_MODEL_LESSON_GENERATION_REPORT.md` 文末的“后续：撤销 C3 与运行时热替换修复”一节。

**本轮只做验收，不改代码。** 发现问题时只报告现象、日志和复现步骤。不合并、不部署、不改服务器。

## 1. 版本

先 `git fetch`，然后使用以下版本：

| 仓库 | 分支 | 提交 |
|---|---|---|
| octos | `codex/profile-model-lessons` | `241f14f5`（包含 C3 撤销 `19b832f7`） |
| learning-coach | `codex/profile-model-lessons` | `a37c9eb`（不变） |
| octos-learn | `codex/profile-model-lessons` | `6179a16` 或更新 |

octos 需要用 `241f14f5` 重新编译 `target/debug/octos`，不能沿用上一轮的二进制。在报告中写明实际使用的二进制所对应的提交。

## 2. 环境（与上一轮 2.2 相同，有一处重要变化）

沿用上一轮的环境：真实 `octos serve`、`mode=cloud`、不加 `--solo`、dynamic profile、隔离的 registry 和数据目录、HTTPS 前端、Chromium。

**变化**：C3 已撤销，严格自带 key 现在由部署保证。所以：

- `octos serve` 进程的环境中**不得**包含 `GEMINI_API_KEY`、`GOOGLE_API_KEY`、`VERTEX_*`、`OPENAI_API_KEY` 或 `OCTOS_AUTH_TOKEN`。上一轮“宿主进程中同时存在测试用 Gemini key”的做法本轮不能再用。
- 测试 key 只通过设置页（或者 `PUT /api/my/profile`）写入测试用户的 profile。
- 启动服务前，执行 `env | grep -E 'GEMINI|GOOGLE|VERTEX|OPENAI|OCTOS_AUTH_TOKEN' | cut -d= -f1`，确认结果为空，并把这条命令的输出写进报告。

## 3. 验收 A：生成过程中切换模型（重跑 2.2）

步骤与上一轮相同：

1. 用户 A 选择 `gemini-3.6-flash`，发起一节完整的文本课程。
2. 第一个 `model-call` 开始后，在设置页把模型改为 `gemini-3.5-flash` 并保存。
3. 当前课程结束之前，完成以下两件事：
   - 刷新 `/learn`；
   - 对已有笔迹发起一次框选分类。
4. 等当前课程完成。
5. 再生成一节课。
6. 再次刷新页面。

通过标准：

| 步骤 | 期望 |
|---|---|
| 2 | 保存接口返回 `runtime_disposition = reloaded`；页面显示“已生效，下一次生成使用新模型” |
| 3 刷新 | `session/open` 一次成功，没有 `data_dir_locked`，也没有 `profile_runtime_switching`；白板、问题卡片和历史都完整 |
| 3 框选 | 请求到达工具，trace 中为 `gemini-3.5-flash`、`route_source=profile`、新的 revision |
| 4 | M1 的全部 `model-call` 都是 3.6 Flash 和旧 revision，课程正常完成；**刷新后的页面无需重新进入白板，就能看到这节课** |
| 5 | 新课程为 3.5 Flash、`route_source=profile`、新的 revision |
| 6 | 两节课和全部历史都在 |

服务日志中**不得**出现以下内容：

- `runtime rebuild failed`
- `Database already open`
- `data_dir_locked`

在报告中附上相关的日志行，或者写明搜索结果为 0。

第 4 步的特别说明：如果 `session/open` 成功了，但刷新后的页面仍然收不到进行中课程的交付，这是另一个问题——进行中的任务绑定在旧会话上，新连接收不到它的事件。遇到这种情况，只记录现象和协议日志（`session/open` 的结果，以及之后收到的事件），**不要修**。

## 4. 验收 B：同一节课生成中连续保存两次

1. 发起一节课。
2. 生成过程中，先保存 3.5 Flash，约 2 秒后再保存回 3.6 Flash。
3. 两次保存都应返回 `reloaded`。
4. 当前课程仍然全程使用最初的模型，并正常完成。
5. 下一节课使用 3.6 Flash，trace 中的 revision 是第二次保存时的值。
6. 服务日志中没有锁错误。

## 5. 验收 C：严格自带 key（C3 撤销后的回归检查）

前提：服务进程的 env 中没有任何模型 key（第 2 节）。

| 情况 | 期望 |
|---|---|
| 删除测试用户 profile 中的 `GEMINI_API_KEY` 条目后生成课程 | `LESSON_CREDENTIAL_MISSING`，页面显示“请在设置中填写你的 Gemini API Key” |
| 填入无效 key | `GEMINI_AUTH_FAILED` |
| 填回有效 key | 课程正常生成 |
| 用户 B 使用自己的 key，与用户 A 同时生成 | 两人的 trace 互不串扰；用一个无效 key 和一个有效 key 来观察错误各自归属 |

## 6. 验收 D：记忆整理与定时任务没有被破坏

这两项属于热替换中共享或接管的服务，只需要确认没有回退：

1. **记忆整理接管**：完成验收 A 后检查服务日志。保存切换之后，不应出现 `memory refresh lock held elsewhere` 这类说明新运行时没能接管 sweep 的日志。
2. **定时任务**：如果测试环境方便使用 cron（OUP 或聊天中的 cron 工具），在切换模型前创建一个任务，切换后执行 `cron list`，确认任务还在，并且没有出现重复的条目。不方便就跳过，并在报告中说明。

## 7. 交付

- 每一步的实际结果：截图、日志和协议日志的路径（放在 `.local-dev/profile-model-review/live-2/` 下，日志中不能有 key）；
- 第 2 节环境检查命令的输出；
- 服务日志中锁相关关键词的搜索结果；
- 所用三个仓库的提交，以及 octos 二进制对应的提交；
- 不通过或跳过的项目及原因。

把报告追加到 `docs/PROFILE_MODEL_LESSON_GENERATION_REPORT.md` 末尾，标题为“真实验收：热替换修复（2026-10-xx）”。提交并推送到 octos-learn 的 `codex/profile-model-lessons` 分支。只有文档提交，不改代码。
