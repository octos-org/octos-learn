# 审查结论与后续指令：课程生成跟随设置中的主模型

日期：2026-10-01。交给执行者（GPT）。前置文档：
- `docs/PROFILE_MODEL_LESSON_GENERATION_EXECUTION.md`（执行指令）
- `docs/PROFILE_MODEL_LESSON_GENERATION_REPORT.md`（你的实施报告）

## 1. 审查结论

实现通过。以下内容已经核实，不需要再改：

- **learning-coach**
  - profile 模式下完全以 profile 为准，忽略 `OLL_*`。
  - profile 模式下 model 为空时报错，不回落到默认模型。
  - Ark 课程路径已删除干净。
  - 每次调用只解析一次路由，中途不会换模型。
  - 错误码通过 `structured_metadata` 传递。旧版 Octos 本来就会转发这个字段，所以新 Coach 配旧 Octos 也能正常工作。
  - 审查方在独立目录重跑 `npm test`：183/183 通过；重新构建出的 `main` 和 `lesson-plan.js` 与提交的版本一致。
- **Octos**
  - 三条 `bootstrap_with_host_plugins` 调用路径都传入了 `deployment_mode`：按需创建、serve、gateway。
  - Cloud/Tenant 模式下，key 只从 profile 的 env_vars 读取；不读进程 env，也不读 auth store。
  - strict gate 的判断顺序正确。
- **你在执行中的三处偏离，审查方同意**
  - `blocked_env` 机制：manifest 允许的变量仍会从进程继承，所以必须先清除。
  - Gemini 400 + `API_KEY_INVALID` 归为认证失败。
  - 用 `DeploymentMode` 区分本地和公网。
- **A/B 测试**
  - p50 没有回退。
  - p90 的尾部来自非确定性的修复调用（3 次 model-call 的样本），以及一个离群值。只看 2 次调用的样本，两组中位数分别为 7353 和 7456 ms，基本一致。
  - 请求体字节一致，代码层面没有能拉长尾部的机制，因此不阻塞上线。不需要重测。

## 2. 待办事项

继续在各仓库的 `codex/profile-model-lessons` 分支上工作。**仍然不要合并、不要部署、不要改服务器。** 每项完成后提交，并在报告中写明提交哈希和测试结果。

### 2.1 修正“暂未就绪”文案（octos-learn）

**问题**：课程生成过程中保存设置时，旧任务持有数据库锁，Octos 返回 `persisted_but_not_live`。前端此时显示“请检查 Key 后重试”，但 key 并没有问题，用户会被误导。另外，这条状态只在保存按钮里显示 2 秒，很容易错过。

**修改**：

1. `src/settings/settings-api.ts` 的 `profileModelSaveMessage`：`persisted_but_not_live` 的文案改为“已保存。当前任务结束后，下一次生成将使用新模型”。其他状态的文案不变。
2. `src/settings/llm-tab.tsx` 和 `src/learning/setup-whiteboard.tsx`：保存后的状态文案放到按钮旁，用 `role="status"` 常驻显示，直到用户再次修改表单。按钮本身只在 2 秒内显示“Saved”，或者沿用原有样式。
3. 补测试：
   - 四种 disposition 都显示正确的文案；
   - 字段缺失（旧版 Octos）时显示通用文案；
   - 状态文案在 2 秒后仍然存在，修改表单后消失。

### 2.2 真实服务器加浏览器验收：生成过程中保存设置

**背景**：旧任务结束之前，同一用户的其他请求也会尝试重建 ProfileRuntime，同样可能因为锁冲突而失败。`resolve_sessions_for_lookup` 在 runtime 不可用时会回退到 `state.sessions`，可能读到错误的会话存储。你的进程内验收测试是手动 `drop(old)` 之后再重建的，没有覆盖这个窗口。

**环境**：本地运行真实的 `octos serve`，使用 Cloud 模式和 dynamic profile（不是 `--solo` 的 startup-pinned profile），learning-coach 使用本分支构建的版本，前端使用本分支。

**步骤**：

1. 用户 A 选择 `gemini-3.6-flash`，发起一节文本课程。
2. 生成过程中，在设置页把模型改为 `gemini-3.5-flash` 并保存。记录保存接口返回的 `runtime_disposition` 和页面显示的文案。
3. 当前课程结束之前，完成以下两件事并记录结果：
   - 刷新 `/learn`，检查白板、课程历史和问题卡片是否完整；
   - 对已有笔迹发起一次框选分类，记录成功、失败或错误码。
4. 等当前课程完成，确认它的所有 `model-call` 都是 3.6 Flash，并且课程正常交付。
5. 再生成一节课，确认 trace 中为 3.5 Flash，`route_source=profile`，并且 `config_revision` 是新的值。
6. 再次刷新页面，确认两节课和所有历史都在。

**判定**：

- 第 3 步中刷新或框选失败、历史暂时缺失，或者第 4–6 步中任何一项不符合预期，都算发现问题。
- **发现问题时只报告现象、相关服务端日志和复现步骤，不要自行修改 Octos 的 runtime 缓存、锁或会话查找逻辑。** 这部分由审查方评估后再决定修法。
- 截图和日志保存到 `.local-dev/profile-model-review/`。日志中不能出现 key。

### 2.3 浏览器中验证三种错误的界面

在同一环境下，分别设置以下三种情况并发起一节课：

1. 不填 key；
2. 填一个无效 key；
3. 模型 ID 不存在。

对每种情况，确认以下三处都显示正确的中文文案和“前往设置”链接，并且点击链接后进入 LLM 设置页：

- 白板上的问题卡片；
- 页面底部的错误条；
- 框选辅助入口（只需验证其中一种情况）。

截图保存到 `.local-dev/profile-model-review/errors/`。

### 2.4 确认 lint 卡住是否为原有问题

在 octos-learn 的 `origin/main`（`81a8c23`）上运行 `pnpm lint`，看它是否同样卡在 `selection-enhancement-layer.tsx`。

- 如果同样卡住，就在报告中注明这是原有问题，不需要修。
- 如果不卡住，说明问题是本分支引入的，需要定位并修复。

### 2.5 更新实施报告

修改 `docs/PROFILE_MODEL_LESSON_GENERATION_REPORT.md`：

1. 把建议部署顺序改为：
   1. **Octos**：先让严格 BYOK 和环境隔离生效。
   2. **learning-coach**：至少包含 `a37c9eb`。
   3. **octos-learn 前端**：放在最后，保证提示文案与实际行为一致。
   4. **服务器 env 中 `OLL_*` 的清理**：可在任意时点进行。新版 Coach 在 profile 模式下会忽略这些变量。
2. 加一条部署前提：先确认线上 Octos 的当前版本。本分支基于 `ae230ce0`；如果线上版本更旧，这次部署会同时带上上游的其他改动，需要单独评估。
3. 把 A/B 的结论改为“p50 未回退；p90 差异来自模型修复调用，与路由代码无关；上线后观察一周线上 p90”。
4. 补上 2.1 至 2.4 的结果。

## 3. 不要做的事

- 不要开启 Gemini 流式 bootstrap。
- 不要增加 OpenAI 或其他平台。
- 不要修改 runtime 缓存、锁或会话查找逻辑（见 2.2）。
- 不要合并、不要部署、不要改服务器配置。

## 4. 交付

完成后提供一份简短报告，包含：

- 每项待办的完成情况和提交哈希；
- 测试命令及结果；
- 2.2 中每一步的实际结果（附截图和日志路径）；
- 未完成的事项及原因。
