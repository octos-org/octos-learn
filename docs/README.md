# Octos Learn 文档索引

- [课程和笔迹 IndexedDB 存储](course-runtime-quality/indexeddb-storage-2026-09-28/REPORT.md)：旧开发缓存清理范围、保存失败重试和验证结果。

## 当前使用

- [练习顺序与锁定提示复测](course-runtime-quality/pack-generated-progress-da08658-2026-10-09/REPORT.md)：da08658 四题依次开放、判分和刷新恢复通过；撤回上轮练习锁定误判；完成余弦练习后五个节点下移 16，附各阶段坐标和截图。

- [练习面板保留与布局修复复测](course-runtime-quality/pack-generated-progress-db680e3-2026-10-09/REPORT.md)：db680e3 追加课程时正弦/余弦布局位移为 0，刷新与播放回归通过；生成课练习锁定的原失败判定已撤回，最新结论见练习顺序复测。

- [刷新恢复修复复测](course-runtime-quality/pack-generated-progress-f4854d7-2026-10-09/REPORT.md)：f4854d7 两种刷新场景、A 与 C–F 播放通过；加载约 0.4–0.5 秒；布局位移仍存在，main 对照未执行。

- [预制课追加生成课首次验收](course-runtime-quality/pack-generated-progress-2026-10-09/REPORT.md)：2f36122 主流程与 C–F 播放通过；B 刷新丢失进度，两种预制课复现。“下一课”原失败判定已撤回，最新结论见刷新恢复修复复测。

- [v0.1.2 发布记录](RELEASE_V0_1_2.md)：辅助卡片原稿避让修复和完整九课 APK。

- [v0.1.1 发布记录](RELEASE_V0_1_1.md)：Android 性能与笔迹修复汇总、确切依赖和发布验证范围。

- [课程画面复用与附件归属修复](course-runtime-quality/course-visual-layout-fixes-2026-10-04/REPORT.md)：从 main 分支修复跨组件重复和跨行附件重复占位，包含依赖顺序、回归、电视验证及生产部署验收。

- [皓丽会议大屏“全部应用”入口](ANDROID_APP_DRAWER.md)：原生侧边栏自定义槽、独立 APK 构建安装、升级重绑、实机重启验收与回滚。
- [笔迹与课程布局解耦](course-runtime-quality/android-ink-layout-independence-2026-10-03/REPORT.md)：移除笔迹固定/避障，保留播放隐藏并自动回浏览模式，以及浏览器和电视验证。
- [Android 三维旋转优化](course-runtime-quality/android-orbit-performance-2026-10-03/REPORT.md)：按帧合并拖拽/滚轮、保留 SVG 图元、交线和投影缓存，以及电视对照与 Canvas/WebGL 路线评估。
- [Android 滑块实时更新优化](course-runtime-quality/android-slider-performance-2026-10-03/REPORT.md)：共用布局复用、二维曲线增量更新、三维分层和网格复用，以及电视对照数据。

- [Android 触屏拖拽起步诊断](course-runtime-quality/android-drag-start-2026-10-03/REPORT.md)：重复板书重排、合成层冷启动与暂停期间的预热修复。
- [Android 导航缓存第二阶段](course-runtime-quality/android-performance-2026-10-03-phase2/REPORT.md)：正常预制课布局基线、导航覆盖图对齐及父卡片更新的缓存失效修复。
- [Android 白板性能优化](course-runtime-quality/android-performance-2026-10-02/REPORT.md)：电视缓存开关对照、图形预览缓存、原生控件避让修复与 APK 交付记录；[预制课历史恢复布局修复](course-runtime-quality/android-performance-2026-10-02/HISTORY-LAYOUT.md)。

- [Android 原生笔迹与课程坐标收尾](course-runtime-quality/android-native-ink-2026-10-02/REPORT.md)：电视验收、原生移交与坐标修复、正式运行时依赖和回归门槛。

- [E2E 修复收尾](course-runtime-quality/e2e-closeout-2026-09-30/REPORT.md)：四仓合并、最终课程包、APK快照与分阶段上线。

- [Android 课程目录与真机更新](course-runtime-quality/android-catalog-2026-09-28/REPORT.md)：最新主线 APK、三集九课内嵌快照与 960×540 真机布局验证。
- [09-28 首轮 E2E 复测历史记录](course-runtime-quality/e2e-retest-2026-09-28/REPORT.md)：首轮四仓分支、课程版本与验证；后续版本以收尾记录为准。

- [九门课程内容与发布收尾](course-runtime-quality/nine-course-content-closeout-2026-09-27/REPORT.md)：Claude 修复整合、八段旁白重录、九门公网包校验及 27 张真实截图。
- [白板布局与镜头收尾](course-runtime-quality/whiteboard-closeout-2026-09-27/REPORT.md)：固定提交范围、15 门课真实截图、回归验证与异机协作边界。

- [本地开发交接](DEVELOPMENT_HANDOFF.md)：当前稳定基线、仓库边界、本地启动方式、与公网的差异及后续开发约束。
- [公网部署手册](PUBLIC_DEPLOYMENT_RUNBOOK.md)：构建、安装、升级、回滚和上线核验（前端部署用 `scripts/deploy-public-web.sh`）。
- [公开注册、新手设置与平台旁白语音](PUBLIC_ONBOARDING_AND_TTS.md)：当前用户入口、功能降级、共享 TTS 额度和本次上线记录。
- [发布前 E2E 清单](RELEASE_E2E_CHECKLIST.md)：文字、图片、语音、摄像头、局部辅助、回放和多用户隔离的人工验收。

- [课程集与课程卡片 UI](course-runtime-quality/course-collections-2026-09-27/README.md)：两层导航、课程集编辑配置、统一卡片操作与响应式截图。

- [会话入口与历史标题修复](course-runtime-quality/session-history-2026-09-27/README.md)：恢复侧栏、最近两行、历史标题恢复与只读数据调查。

## 产品与规划

- [产品纲要与未来规划](PRODUCT_OUTLINE_AND_ROADMAP.md)：产品定位、功能模块现状、未来规划汇总。
- [介绍与规划（对外）](ROADMAP_INVESTOR.md)：面向外部介绍的项目背景、现状与打算。
- [开发路线图](ROADMAP_DEV.md)：开发向排期、里程碑、backlog 与来源索引。

## 专题计划

- 课程模型路由：[Claude 设计依据](PROFILE_MODEL_LESSON_GENERATION_PLAN_CLAUDE.md) / [执行指令](PROFILE_MODEL_LESSON_GENERATION_EXECUTION.md) / [实施报告](PROFILE_MODEL_LESSON_GENERATION_REPORT.md) / [复核跟进](PROFILE_MODEL_LESSON_GENERATION_REVIEW_FOLLOWUP.md)。

- [课程生成跟随设置主模型](PROFILE_MODEL_LESSON_GENERATION_PLAN.md)：基于最新 Octos 的技能模型路由、凭据传递与配置生效状态修改方案；Ark 仅用于 TTS。
- [课程包平台架构与执行计划](course-pack-platform/ARCHITECTURE_AND_EXECUTION_PLAN.md)：CoursePack 分发平台的交付顺序与待决策项。
- [白板辅助执行计划](WHITEBOARD_ASSISTANCE_EXECUTION_PLAN.md) / [实施状态](WHITEBOARD_ASSISTANCE_IMPLEMENTATION_STATUS.md) / [空间融合](WHITEBOARD_ASSISTANCE_SPATIAL_INTEGRATION.md) / [兼容性](WHITEBOARD_ASSISTANCE_COMPATIBILITY.md)：AI 手写板书（board_writing）专题。
- [白板交互执行计划](WHITEBOARD_INTERACTION_EXECUTION_PLAN.md)：多指针手势、捏合、平移、误触抑制等 P1–P7。
- [数学质量改进计划](MATH_QUALITY_IMPROVEMENT_PLAN.md) / [实施状态](MATH_QUALITY_IMPLEMENTATION_STATUS.md)：数学生成质量专题。

## 历史设计记录

- [公网 BYOK 与本地 ASR 执行计划](PUBLIC_BYOK_PRIVATE_ASR_EXECUTION_PLAN.md)：记录公网架构的形成过程；其中早期邀请制等选择已经被后续实现替代。
- [独立产品抽取计划](STANDALONE_EXTRACTION_PLAN.md)：记录从 `octos-web` 抽取独立产品的过程；0–5 阶段已经完成。

实际部署行为以“当前使用”中的文档和 `main` 分支为准。历史设计记录用于解释决策过程，不作为现行配置手册。
