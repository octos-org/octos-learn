# Octos Learn 文档索引

## 当前使用

- [本地开发交接](DEVELOPMENT_HANDOFF.md)：当前稳定基线、仓库边界、本地启动方式、与公网的差异及后续开发约束。
- [公网部署手册](PUBLIC_DEPLOYMENT_RUNBOOK.md)：构建、安装、升级、回滚和上线核验（前端部署用 `scripts/deploy-public-web.sh`）。
- [公开注册、新手设置与平台旁白语音](PUBLIC_ONBOARDING_AND_TTS.md)：当前用户入口、功能降级、共享 TTS 额度和本次上线记录。
- [发布前 E2E 清单](RELEASE_E2E_CHECKLIST.md)：文字、图片、语音、摄像头、局部辅助、回放和多用户隔离的人工验收。

## 产品与规划

- [产品纲要与未来规划](PRODUCT_OUTLINE_AND_ROADMAP.md)：产品定位、功能模块现状、未来规划汇总。
- [介绍与规划（对外）](ROADMAP_INVESTOR.md)：面向外部介绍的项目背景、现状与打算。
- [开发路线图](ROADMAP_DEV.md)：开发向排期、里程碑、backlog 与来源索引。

## 专题计划

- [课程包平台架构与执行计划](course-pack-platform/ARCHITECTURE_AND_EXECUTION_PLAN.md)：CoursePack 分发平台的交付顺序与待决策项。
- [白板辅助执行计划](WHITEBOARD_ASSISTANCE_EXECUTION_PLAN.md) / [实施状态](WHITEBOARD_ASSISTANCE_IMPLEMENTATION_STATUS.md) / [空间融合](WHITEBOARD_ASSISTANCE_SPATIAL_INTEGRATION.md) / [兼容性](WHITEBOARD_ASSISTANCE_COMPATIBILITY.md)：AI 手写板书（board_writing）专题。
- [白板交互执行计划](WHITEBOARD_INTERACTION_EXECUTION_PLAN.md)：多指针手势、捏合、平移、误触抑制等 P1–P7。
- [数学质量改进计划](MATH_QUALITY_IMPROVEMENT_PLAN.md) / [实施状态](MATH_QUALITY_IMPLEMENTATION_STATUS.md)：数学生成质量专题。

## 历史设计记录

- [公网 BYOK 与本地 ASR 执行计划](PUBLIC_BYOK_PRIVATE_ASR_EXECUTION_PLAN.md)：记录公网架构的形成过程；其中早期邀请制等选择已经被后续实现替代。
- [独立产品抽取计划](STANDALONE_EXTRACTION_PLAN.md)：记录从 `octos-web` 抽取独立产品的过程；0–5 阶段已经完成。

实际部署行为以“当前使用”中的文档和 `main` 分支为准。历史设计记录用于解释决策过程，不作为现行配置手册。
