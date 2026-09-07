# 板书兼容与本地验收

此功能已完成本地功能与性能验收；生产构建仍默认不声明新输出能力，等待精确远端依赖 pin。

| 消费端 | 数据 | 行为 |
| --- | --- | --- |
| 新前端 + 新 Ink Runtime | 旧 artifact v0.1/v0.2、学生文档 v1、快照 v1–v4 | 沿用原读取与校验规则 |
| 新前端 + 新 Ink Runtime | 板书 artifact v0.3、AI 文档 v2、快照 v5 | 校验后追加，消费记录与笔迹同存，恢复不补字 |
| 新前端 + 旧服务端 | 不认识能力参数 | 依服务端既有结果类型处理，不能视为板书验收通过 |
| 旧前端或缓存旧代码 | 新 artifact v0.3 / 文档 v2 | 拒绝读取，不能保证完整体验；禁止直接回滚到旧写入器 |
| 新前端 + 旧 Ink Runtime | 准备新请求 | 不声明 board_writing 能力 |
| 新前端 + 旧 Ink Runtime | 已存在的板书 artifact | 明确提示需要更新，不静默丢失内容 |
| 已启用的新前端 + 字体正在准备 | 新请求或已返回板书 | 能力由构建与 Runtime API 协商；结果排队等待 Worker，失败时显示重试错误，不改成卡片 |

正式启用需要先发布支持 v0.3/v2/v5 的最低客户端，再开启输出；目前最低 OLL 实现为本地提交 `6c5cfb983a825216af7f96f20d9969e7d4a4496c`。最终客户端最低提交待固定。回滚保留该读取器，只关闭新输出，不能回滚到会丢失消费记录的旧实现。现有已生成板书在关闭新输出后仍按普通笔迹恢复。

超时屏障保存在本浏览器、按 session+turn 分隔。旧历史请求若没有可靠超时记录无法推断其终态；清除浏览器存储或跨设备不会携带本机屏障。正式验收不得宣称支持跨设备持久终态，目前需求覆盖同浏览器刷新、重连和重新枚举。

## 本地浏览器验证

启动开发服务器时设置 `OCTOS_LOCAL_OLL_PATH` 指向本地 OLL 仓库，并设置 `VITE_ENABLE_BOARD_WRITING=true`。先构建该 OLL，再运行 `scripts/check-board-writing-browser.mjs`。脚本通过隔离浏览器页面加载 `scripts/whiteboard-assistance-probe.tsx`，不会向真实会话发消息。可用 `OLL_BROWSER_EXECUTABLE` 指定本机 Chromium，`BOARD_PROBE_URL` 指定 Vite 地址。

`eval-selection-assistance.mjs` 要求明确提供 LEARNING_COACH_DIR、SELECTION_BASELINE_EXECUTABLE 和模型所需环境配置。凭据不写入结果；输出包含模型正文、实际 token 和时延。基线须从实施前提交构建，不能拿当前文件冒充基线。

`benchmark-static-startup.mjs` 使用两个已经构建的 dist 目录和全新浏览器上下文交错测量启动；设置 `BASELINE_DIST`、`CANDIDATE_DIST`，可用 `STARTUP_REPEATS` 指定轮数。它只验证本地静态资源解析与启动，不替代公网下载或 provider 时延测试。
