# 小章鱼辅助实施状态

日期：2026-09-07。代码、远端可安装依赖与本地验收已完成；OLL 开发分支已推送，尚未合并或发布。实施依据见[执行计划](WHITEBOARD_ASSISTANCE_EXECUTION_PLAN.md)，兼容边界见[兼容说明](WHITEBOARD_ASSISTANCE_COMPATIBILITY.md)，卡片与板书的统一空间方案见[空间融合方案](WHITEBOARD_ASSISTANCE_SPATIAL_INTEGRATION.md)。

## 完成的体验

- 有效说话开始时同步冻结选区、白板身份和 revision。之后清空 A、改选 B、上传等待或保存让出事件循环，本轮仍只使用 A；取消、切换会话或卸载后的异步结果不能写回。
- 框选识别期间，工具栏持续显示“正在识别选区…”，识别完成后再用功能按钮替换。选区请求始终显示右下角小章鱼气泡；卡片型请求同时在最终位置显示卡片 loading，板书型请求不创建卡片 loading；两者都不再出现课程 loading，也不让教师承诺正在准备课程。
- `检查并建议`、改写、纠错和转写可返回 `board_writing`，在原稿旁写简短说明和公式。`y=x^2+z^3` 的“改成可以绘图的形式”得到等价的 `x^2-y+z^3=0`，不画图、不生成卡片、不称原式错误。普通解释和明确绘图仍使用原交付类型。
- 新板书与学生笔迹使用同一个 Editor。它可以选择后直接拖动、擦除、撤销、重做、保存、刷新恢复和参与回放；擦除原稿不联动删除板书。来源只用于完整性校验和学习证据过滤。
- 一旦桥接层判定请求超时，按 session+turn 保存的消费屏障永久拒绝迟到结果。下一次成功请求即使同时枚举到两份文件，也只读取和显示自己的结果；未延长超时、未增加重试、未做问题去重。

## 实现与兼容

- learning-coach 的实际 action/tool 参数解析均接收 `board_writing` 能力；模型 schema、程序解析和 artifact 版本共同约束结果。板书使用 artifact v0.3，旧解释/图形继续使用 v0.2。
- OLL 提交 `5bc24423a845c13b644c2e31cd6b661caed2d61c` 已推送至远端分支 `codex/whiteboard-assistance`。它提供原子 AI 笔迹事务、稳定组件 ID、`origin: student | ai`、文档 v2、来源纳入校验的选区 v5，以及旧 v1-v4 兼容读取，并在真实框选 pointer-up 后再次同步选区变换状态，使手势框选的笔迹无需额外模式即可直接拖动。旧写入器会拒绝新文档，避免悄悄丢掉消费记录。
- 字体轮廓解析和排版在 Web Worker 中完成；约 7.3 MiB 的 WOFF 使用低优先级预热，板书模块动态加载。功能开启后立即声明已经协商的写入能力，结果排队等待字体，字体失败会显示可重试错误，不会降级成卡片。
- learning-coach 的 package、lock 与 OLL contract，以及 octos-learn 的 package、pnpm lock 与 release BOM，均精确固定到上述远端提交并从 GitHub 重装验证。`VITE_ENABLE_BOARD_WRITING` 仍默认关闭，用于先发布兼容读取器、再开启新输出的分阶段发布。

## 验证结果

- octos-learn：87 个测试文件、802 项完整单元测试通过，生产构建通过；lint 为 0 error（25 条既有 warning）。真实 React 白板验证板书避开已展开卡片、选中后直接移动、撤销只移除批注、刷新不复活。
- learning-coach：安装态 OLL contract 通过，154 项完整测试通过。新增 `delivery_mode` 输入、schema 和解析三层一致性验证。既有真实模型质量矩阵保持不变。
- OLL：227 项完整测试通过。真实浏览器覆盖写入、来源、幂等、undo/redo、刷新、保存故障、并发、复制、局部擦除、选中后直接拖动、v5 防篡改和回放合并。
- 超时交错的 workspace 测试让第一次请求超时、第二次成功并同时发现两份文件；第一次文件从未被加载或渲染，第二次正常交付。存储写失败的两种顺序也有覆盖。安装态 Chrome 探针截图见 [product-board-preview-installed-pin.png](whiteboard-assistance-results/product-board-preview-installed-pin.png)。

## 速度证据

最终配置只对 Vertex `gemini-3.6-flash`、已声明板书能力、`custom-question`/`check-and-suggest` 使用 MINIMAL；任何显式 thinking 配置优先。课程、普通解释、明确绘图和旧客户端保持既有配置。

20 轮交错配对结果如下，原始阶段数据和最终摘要位于 [whiteboard-assistance-results](whiteboard-assistance-results/scoped-final-summary.json)：

| 场景 | 基线 p50 / p95 | 候选 p50 / p95 | 单次输入 token | 结果 |
| --- | ---: | ---: | ---: | --- |
| 改写 | 4307 / 6988 ms | 4197 / 6894 ms | 891 → 673 | 20/20 成功，板书路径未回退 |
| 检查 | 4960 / 5985 ms | 3789 / 6215 ms | 319 → 311 | 20/20 成功；13/20 配对更快，p95 的 230ms 差异未形成一致偏移 |
| 普通解释 | 4983 / 8206 ms | 4313 / 7422 ms | 314 → 314 | 请求体与代码路径相同；候选保留 1 次独立进程 30s 失败 |
| 明确绘图 | 4547 / 7168 ms | 4272 / 11149 ms | 893 → 893 | 请求体与代码路径相同；候选 p95 含 1 次 23.7s provider 长尾，13/20 配对更快 |

异常没有被删样本。普通解释与明确绘图的 provider 请求体经拦截比较完全相同；两条路径的模型配置也未变，因此孤立超时和长尾不构成可复现的代码回退。改写与检查没有增加调用，输入 token 均低于基线，输出也更短。

课程生成的 `lesson-plan.js` 在基线与候选的 SHA-256 都是 `abb763c6a3bee045b188a08aa82767fe4feeb6942f6ab936bf098a061d77157d`；OLL 的 player-core、web-runtime 和 playback harness 在旧 pin 与新提交之间无源码差异。此次 follow-up 再做 100 轮本地生产构建冷浏览器交错对照：DOMContentLoaded 的逐对差值 p50 为 -0.2ms，候选 52/100 次更快；load 的逐对差值 p50 为 -0.1ms，候选 51/100 次更快，没有观察到一致的启动回退。字体、opentype 和排版仅在板书能力开启后异步进入 Worker，不占课程关键路径。

最后固定到 OLL `5bc24423` 后又做 30 轮冷浏览器交错复验：wall p50 为 174.25 → 174.59ms，DOMContentLoaded p50 为 143.5 → 143.7ms，load p50 为 143.8 → 144.1ms；候选分别有 14/30、14/30、14/30 轮更快。中位差为 0–0.3ms，方向近似均分，没有可复现回退。最终 pin 数据见 [loading-drag-final-pin-startup.json](whiteboard-assistance-results/loading-drag-final-pin-startup.json)。

## 交付边界

OLL 远端分支为 `codex/whiteboard-assistance`，提交为 `5bc24423a845c13b644c2e31cd6b661caed2d61c`。learning-coach 本地分支 `codex/selection-intent-alignment` 的本次提交为 `1c2f21a`。本文件所在的 octos-learn 分支包含产品接线、精确 pin、BOM 与验收证据。未执行合并、发布或生产功能开关变更；发布时应先上线兼容读取器，再开启 `VITE_ENABLE_BOARD_WRITING=true`。
