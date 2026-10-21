# Octos Learn 文档索引

- [课程和笔迹 IndexedDB 存储](course-runtime-quality/indexeddb-storage-2026-09-28/REPORT.md)：旧开发缓存清理范围、保存失败重试和验证结果。

## 当前使用

- [2026-10-20 BYOK 公网部署与电视安装](BYOK_PUBLIC_DEPLOYMENT_2026_10_20.md)：Octos 2.0.3 升级、本人凭据产品服务、网页资源校验、Android 13 Keystore 测试与待完成的电视 E2E。

- [统一语音路由与云端降级](UNIFIED_VOICE_FALLBACK.md)：本地、网页与 APK 私有优先，ASR/TTS 故障回退及配置与验证说明；[2026-10-18 公网部署验收](public-voice-deployment-2026-10-18.json)。

- [Android 滑块优化最终验证](course-runtime-quality/webview-slider-performance-2026-10-10/REPORT.md)：完整 Runtime pin、几何扫描优化、电视最终结果、持续存档与布局恢复验证。

- [v0.1.5 发布记录](RELEASE_V0_1_5.md)：选区通用按钮立即可用，后台识别补充专用操作，附验证范围与交付约定。
- [v0.1.4 发布记录](RELEASE_V0_1_4.md)：框选内容的语音提问不再被文字预判提前要求澄清，附验证范围与交付约定。
- [v0.1.3 release record](RELEASE_V0_1_3.md): Android slider improvements, progress restoration, version display, and geometry generation update.
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

- [个性化老师与学习记忆实施方案](PERSONALIZED_TEACHERS_AND_MEMORY_PLAN.md)：包含老师基础设定、情境范例、课堂反应和性格验证；记忆统一由 Octos 处理，并规划学习进展、知识地图、趣味成就及老师间共享等待定事项；附[独立审查核对与修订记录](PERSONALIZED_TEACHERS_REVIEW_FOLLOWUP.md)。

- [第二阶段实施计划：学习历史与进展](PERSONALIZED_TEACHERS_PHASE2_PLAN.md)：提出产品服务端 SQLite、设备离线记录和 Octos 记忆的职责建议，明确计数口径、知识点关联、问答交付、分批提交与验收；已授权开始实施，实际进展见[第二阶段实施记录](personalized-teachers-phase2/IMPLEMENTATION.md)；知识点启用前请看[课程对应表审核材料](personalized-teachers-phase2/TOPIC_MAPPING_REVIEW.md)；附[独立审查处理记录](PERSONALIZED_TEACHERS_PHASE2_REVIEW_FOLLOWUP.md)，记录采纳项、不同判断及已核对的代码依据。

- [第二阶段实现审查处理](personalized-teachers-phase2/REVIEW_FOLLOWUP.md)：未登录删除保留、复习位置与开始事件去重、Octos PR #2854 CI 修正、性能对照补测及逐项判断；附实际验证边界。

- [个性化老师第一阶段核验与接入设计](personalized-teachers-phase1/REPORT.md)：最新 main 基线、本机接口与无模型测试、事实存储比较、Octos 最小扩展草案和《斜率与截距》的知识点映射候选；后续[职责与必要性复核](personalized-teachers-phase1/OCTOS_GAP_REASSESSMENT.md)收窄了原扩展建议。

- [Octos 应用记忆接入](personalized-teachers-phase1/APP_MEMORY_ACCESS.md)：实际链路测试、正文和更新记录的限制，以及复用现有记住、纠正、遗忘和资料挑选能力的最小应用接口草案；旧任务写回按复杂度处理，不作为本轮必做条件。

- [第一阶段独立审查收尾](personalized-teachers-phase1/REVIEW_CLOSEOUT.md)：审查意见的处理、旧建议撤回、测试边界及后续接口实现事项；记录实施前的审查结论，后续接口实现另有审计入口。

- [Octos 记忆接口实施与审计入口](personalized-teachers-phase1/IMPLEMENTATION.md)：两个通用接口的实现提交、验证结果、源文件及限制；上游 PR #2848 已审批并合入 main，附合并前后的提交对应。

- [复用现有 Octos 的 BYOK 修订方案](BYOK_WITH_EXISTING_OCTOS_PLAN.md)：关闭 Octos PR #2839；复用现有 profile / Key 存储与认证，APK 本机录入后加密保存并直连，网页转发放回 octos-learn，不导出已存 Key，包含迁移与验收边界。

- [全面 BYOK 候选实现与验收记录](FULL_BYOK_IMPLEMENTATION_STATUS.md)：当前分支、已实现的管理 / 直连 / 网页 BYOK 转发边界、自动验证与尚未完成的真实供应商 / 电视 / 上线验收。

- [全面 BYOK 与首次使用体验实施方案](FULL_BYOK_IMPLEMENTATION_PLAN.md)：Octos 统一管理课程模型、ASR、TTS 与可选 Jev 本人凭据；电视 ASR、TTS、Jev 直连与网页受限时 VPS 转发，首期语音仅火山新版 API Key，包含 onboarding、缺配置恢复、分阶段改造及平台代付退出。

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
