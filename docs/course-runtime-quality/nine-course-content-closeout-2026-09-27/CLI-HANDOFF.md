# CLI Agent 接手说明

你正在接手 Octos Learn：React/TypeScript 前端 + Rust Octos 后端的 AI 数学白板产品。实时课程与预制课程共享 OLL 播放链路。你被授权检查涉及的全部仓库；按各仓库职责修改，不将课程数学或通用 Runtime 问题简单写成前端特例。

## 初始化

先确认工作区是否有未提交内容，再依次在 `octos-learn`、`octos-course-library`、`octos-lesson-language`、`learning-coach` 执行：

```bash
git status --short
git fetch --prune origin
git switch main
git pull --ff-only origin main
```

不要使用 reset --hard 或强制推送来消除分支差异。Octos 后端是例外：此次课程收尾没有升级后端，已验证基线为 `3c0fc104`；远端 main 的后续更新需另行评估，不能把“这次课程已收尾”当作新版后端已验收。

按各仓库锁文件安装依赖。当前 OLL 固定提交 `f2a1c654041735f566385f9e208c868b270b8095` 已包含此前布局补丁，不要恢复历史 OLL 补丁工作流。

## 首先阅读

1. 前端根 `AGENTS.md`、`docs/README.md`、`docs/DEVELOPMENT_HANDOFF.md`：产品、仓库边界、本地启动。旧 09-06 部署段已标为历史，不能据此判断当前公网版本。
2. `docs/course-runtime-quality/nine-course-content-closeout-2026-09-27/REPORT.md`：本次最终版本、合并范围、测试、公开发布及已知限制。
3. `docs/course-runtime-quality/whiteboard-closeout-2026-09-27/REPORT.md`：此前 Stage Rows × Step Columns、镜头策略、共享链路与 15 门历史回归输入。
4. `docs/course-runtime-quality/layout-research-2026-09-25/REPORT.md` 及该目录相关方案：此前失败方案和教学排版目标。历史提案不等于当前实现，必须结合代码与截图判断。
5. `docs/course-runtime-quality/course-collections-2026-09-27/README.md`、`docs/course-runtime-quality/session-history-2026-09-27/README.md`：最新课程集分层、卡片、学习记录与标题恢复。
6. 各仓库自己的 README、docs 索引和适用 AGENTS.md。

## 本次状态

- 公网仅三个课程集，各三门：一次函数、三角函数、多元微积分。
- Claude 的七个课程审查提交已整合到课程库 PR #9，八段旁白重录也已入库。课程库 main 合并提交 `67ffdea282324af784a02ac7af6f1d7a39cfe580`。
- 前端 PR #30 已合并，恢复白板学习记录入口、限制最近白板两行、恢复历史标题；课程卡片与课程集 UI 已在更早 PR #29 合并。
- 九门课程源及音频均在 `octos-course-library/courses/`。课程版本和哈希以本目录 `final-dataset.json`、`public-verification.json` 为准；不需要旧电脑 /tmp 文件。
- 被撤回的历史分数等课程是回归材料，不是这次公开目录的一部分，不要重新发布到公网。

## 接下来可以做什么

如果继续探索布局：先复现当前实现，读全部历史方案，再提出自己的通用方案与真实课程对比。不得硬编码课程 ID/节点名来迎合截图；不得增加模型调用或生成重试；不得改课程数据掩盖布局问题。已有卡片允许适度位移，但须说明发生时机和幅度。每门课在 1920/1440/700 窗口都要有真实截图；无重叠、无裁切只是几何要求，不等于板书达标。

现存问题包括窄屏结束全览文字过小、阶段分隔不足。一次函数完整旁白曾有一次批量超时，独立与最终批次通过；保留诊断，若再次复现需查明根因，不要仅增加超时或假造音频完成事件。

本地确定性测试需要先用课程库 CLI 构建 `.ocpack`，再用 publisher CLI 生成含 `catalog.json` 和 `releases/` 的目录，将 `OCTOS_LOCAL_COURSE_PACK_ROOT` 指向它。这个变量选择本地课程输入，不是后端安装要求；不设置时前端可能取公网课程。普通公网体验无需本地打包。

不要在文档或日志中输出 profile、API Key、TTS token。课程重录可能产生第三方服务费用；后续新增外部调用应按用户授权范围执行。前端上线只使用项目的 `scripts/deploy-public-web.sh`；不要手动上传单个构建文件。
