# 全仓库整理与交接（2026-09-26）

用户已授权访问、整理项目涉及的所有仓库，并确认公开推送。此次只保存与核验已有工作，不合并main，不部署、不重新生成或发布课程。

## 仓库分支

| 仓库 | 分支 | 当前基线 |
| --- | --- | --- |
| octos-learn | `feat/linear-function-collection` | `776bf04` |
| octos-lesson-language | `codex/stage-stream-layout-handoff` | `184fe8f` |
| learning-coach | `codex/course-generation-handoff` | `b945fa8` |
| octos-course-library | `codex/course-library-handoff` | `aa73d3e` |
| octos | `main` | `3c0fc104` |

应用列是本次归档提交之前的基线，最新归档提交通过本文件所属分支历史查找。

## 本轮处理

- Learning Coach：源码、协议、构建产物、补丁脚本与用例一并提交；npm build及165项测试通过。
- Course Library：工具链与课程资产/历史分开提交；构建及20项测试通过。三课0.2.3目录另行全部通过包校验。
- 校验发现三课NOTICE与thumbnail不匹配manifest。原文件归档到课程库各课 `unpublished-assets-2026-09-26/`；当前课程目录恢复为已有发布目录中哈希匹配的0.2.3原文件。没有改写课文、公式、事件流、音频或manifest。详情在课程库 `authoring/reviews/CLEANUP-2026-09-26.md`。
- 原delivery和scratch完整归档在本目录，哈希见manifest.json。候选、previous、reviewed资料保留为历史，不删除。
- OLL无效pnpm-workspace和Coach重复pnpm-lock已备份在此，然后从各自根目录移除。OLL和Coach继续使用npm；应用与课程库使用pnpm。
- 通用后端octos原本干净，本轮未修改。

## 接手阅读与残余问题

1. 应用根README和 `docs/DEVELOPMENT_HANDOFF.md`：产品和服务职责；后者较旧，勿照搬旧版本状态。
2. `docs/course-runtime-quality/layout-review-2026-09-26/handoff/LAYOUT-HANDOFF-2026-09-25.md`：布局背景和补丁工作流。
3. `docs/course-runtime-quality/layout-review-2026-09-26/REVIEW.md`：最新实际截图审查。
4. 各仓库README；Learning Coach使用SKILL.md、oll-contract.json描述生成入口与协议。

布局仍有两项已复现问题，未在此次归档中修复：马鞍面新增卡造成旧卡横移468世界单位并伴随镜头变化；1440/700结束全景文字过小。111项布局相关测试通过不等于排版验收。

依赖仍采用固定旧提交加本地补丁的现有链路，源码交接分支推送不会自动替换应用依赖。OLL修改后遵循构建→更新补丁→宿主离线安装→force重启，并校验安装包版本。不要在OLL运行pnpm install。首次启动前检查本机课程发布根目录；捕获脚本有本机绝对路径，不能当作跨机器即用脚本。
