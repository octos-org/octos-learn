# 真实验收指令（第二轮）：热替换修复的修正

日期：2026-10-01。交给执行者（GPT），在上一轮的同一台机器、同一套环境中执行。

**本轮只做验收，不改代码。** 发现问题时只报告现象、日志和复现步骤。不合并、不部署、不改服务器。

## 1. 上一轮失败的原因与本轮修正

| 上一轮问题 | 根因 | 修正（提交） |
|---|---|---|
| A/B：保存返回 `persisted_but_not_live`，`session/open` 报 `data_dir_locked` | 第一版只以**弱引用**保留被替换的 ProfileRuntime。真实路径中，会话缓存失效后 ProfileRuntime 立即被释放（日志中的 `cron service shutdown signalled` 就是它被释放的痕迹），但进行中任务的 Agent 仍直接持有 `episodes.redb`。弱引用失效后，代码退回冷启动，于是撞锁。单元测试一直持有整个 ProfileRuntime，所以没有暴露这个问题 | octos `e8dab732`：改为**强引用**保留旧 runtime 的存储和长期服务（包括 cron 与 lifecycle），供替换者接管；替换失败时放回，供下一次尝试。验收测试已改成与真实路径相同的形状：释放 ProfileRuntime，只保留 Agent 持有的存储 |
| B：服务栈溢出崩溃 | 在 debug 构建中，serve 的 tokio worker 使用默认的 2 MiB 栈；上游的同类测试在略低于 2 MiB 时就会溢出，第一版改动又让请求 future 变大了一些。chat、acp、mcp-serve 这些入口都已设为 8 MiB | octos `e8dab732`：把 bootstrap future 和 retiree 的配置改为 Box，请求 future 因此比上游更小（同一测试在 1.5 MiB 栈上通过，上游在 1.5 MiB 上会溢出）。octos `019db9cc`：serve 的 worker 栈改为 8 MiB |
| C：删除 key 后页面停在“准备中” | profile 没有 key 时，Octos 在创建 provider 这一步就失败了，ProfileRuntime 起不来，课程技能根本没有运行，自然也不会返回 `LESSON_CREDENTIAL_MISSING`。这是 Octos 原有的行为 | octos-learn `445dda9`：前端根据 profile 中打码后的 `env_vars` 判断 key 是否存在。key 缺失时视为“模型不可用”，提交前就拦截，显示“请在设置中填写你的 Google Gemini API Key，笔迹和已有课程仍可使用。”，并给出“前往设置”链接 |

## 2. 版本

| 仓库 | 分支 | 提交 |
|---|---|---|
| octos | `codex/profile-model-lessons` | `019db9cc` |
| learning-coach | `codex/profile-model-lessons` | `a37c9eb`（不变） |
| octos-learn | `codex/profile-model-lessons` | 本文档所在的提交或更新的提交 |

octos 需要编译**两个**二进制：

- debug：`cargo build -p octos-cli --features api`
- release：`cargo build --release -p octos-cli --features api`

A、B 两项**各跑两遍**，debug 和 release 各一遍。C、D 只用 release 跑。报告中写明每个二进制对应的提交和 SHA-256。

环境要求与上一轮相同，包括：启动服务前检查环境变量，结果必须为空（`env | grep -E 'GEMINI|GOOGLE|VERTEX|OPENAI|OCTOS_AUTH_TOKEN' | cut -d= -f1`）；key 只写入测试用户的 profile。

## 3. 验收项与通过标准

### A：生成过程中切换模型

步骤与上一轮相同。通过标准：

| 步骤 | 期望 |
|---|---|
| A2 保存 | `runtime_disposition = reloaded`，页面显示“已生效，下一次生成使用新模型” |
| A3 刷新 | 第一次 `session/open` 就成功；白板、问题卡片和历史完整 |
| A3 框选 | 请求到达工具，trace 显示 3.5 Flash、新的 revision |
| A4 | 原课程全程为 3.6 Flash 和旧 revision，后端正常完成；**刷新后的页面无需任何操作就能看到这节课** |
| A5、A6 | 与上一轮相同 |

日志中 `runtime rebuild failed`、`Database already open` 的出现次数为 0；浏览器协议日志中 `data_dir_locked` 的出现次数为 0。

A4 的特别说明：如果 `session/open` 成功了，但刷新后的页面在原课程完成 30 秒后仍没有显示这节课，就记录下来：

- `session/open` 的结果；
- 之后收到的所有通知（method 和时间）；
- 后端完成的时间。

这是另一个独立的问题（进行中的任务绑定在旧会话上），本轮只记录，不判 A 整体不通过，单独列为“A4-交付”项。

### B：连续保存两次

步骤与上一轮相同。两次保存都返回 `reloaded`；当前课程完成；下一节课使用第二次保存的 revision；服务全程不崩溃。

如果仍然崩溃，按以下方式取得 backtrace：

1. 用 `lldb -- target/debug/octos serve <同样的参数>` 启动服务，然后执行 `run`；
2. 崩溃时依次执行 `thread backtrace`、`thread backtrace all`，把输出保存到 `E/B-lldb-backtrace.txt`；
3. 另外用 release 二进制再跑一遍 B，比较两者结果。

### C：自带 key

| 情况 | 期望 |
|---|---|
| 删除 `GEMINI_API_KEY` 条目，然后刷新 `/learn` | 顶部提示条显示“请在设置中填写你的 Google Gemini API Key，笔迹和已有课程仍可使用。”，并带“前往设置”链接；提交问题时立即显示同样的文字，不会停在“准备中”，也不会发出课程 action |
| 无效 key、恢复有效 key、A/B 双用户 | 与上一轮相同（上一轮均已通过，本轮作为回归） |

注意：缺 key 时，`session/open` 仍可能返回 `runtime_unavailable`。这是 Octos 原有的行为，本轮不判为失败；判定只看页面能否给出明确提示、不卡在“准备中”。

### D：记忆整理与定时任务

1. A 通过之后，检查保存后的服务日志：
   - 不应出现 `memory refresh lock held elsewhere`；
   - 也不应在保存时刻出现 `cron service shutdown signalled`。修复后 cron 由新旧 runtime 共享，不应在保存时被关闭。
2. cron 任务保留检查：如果可以通过聊天让模型创建一个 cron 任务，就创建，然后切换模型，再执行 `cron/list`，确认任务还在，且没有重复。做不到就跳过并说明原因。

## 4. 交付

报告追加到 `docs/PROFILE_MODEL_LESSON_GENERATION_REPORT.md` 末尾，标题为“真实验收（第二轮）”。内容包括：

- 每一项的结果、证据路径（`.local-dev/profile-model-review/live-3/`），以及 debug/release 的对比；
- 日志关键词的出现次数；
- 若 B 崩溃，附上 lldb backtrace；
- 未通过或跳过的项目及原因。

只提交文档，并推送到 octos-learn 的 `codex/profile-model-lessons` 分支。
