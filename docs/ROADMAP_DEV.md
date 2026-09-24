# Octos Learn 开发路线图

## 全局约束

- **速度是硬门槛**：任何合入不得回退首个可播放片段的生成速度（p50 对照交错基线，零新增模型往返）。
- **跨仓库协作**：octos-learn（前端）/ octos（后端）/ learning-coach（课程生成）/ octos-lesson-language（OLL DSL）/ octos-course-library（内容与发布）/ agora-sensevoice-demo（ASR）。多数里程碑需要多仓库 PR 协同。
- 来源索引见文末。

## 当前焦点

**分支 `feat/linear-function-collection`**：线性函数三课合集（精品课程包内容线的延续），浏览器验证中，待人工编辑审批。

## 里程碑

### M1 · 数学质量专题发布（近期，最高优先级）

状态：代码已合并（2026-09-06），**未部署公网**。

- 在精确提交上重跑短问题冒烟生成。
- 按发布清单执行公网回归。
- 部署公网。

### M2 · 小章鱼板书（board_writing）灰度放量

状态：**代码已合并至 main**（commit `692f143` 等），目前由 Feature Flag（`VITE_ENABLE_BOARD_WRITING`）控制。

1. 确认读取端兼容性覆盖。
2. 生产环境配置开启 `VITE_ENABLE_BOARD_WRITING=true` 全量生效。

后续候选（不在本期）：板书复制成文本、逐笔动画、完整数学排版引擎（分式/根式）；一句话混合意图的"卡片 vs 板书"中途判定（受速度约束，暂缓）。

### M3 · 白板交互改造（P1–P7）

状态：部分修复已陆续落地，整体未完成。详见 `docs/WHITEBOARD_INTERACTION_EXECUTION_PLAN.md`（2026-09-09），跨 OLL 与 octos-learn 两个仓库。

- P1 键盘治理
- P2a 多指针 / 双指捏合（修第二指 bug）
- P2b 空格 / 右键 / 中键平移
- P2c 触控板捏合平滑
- P4 手掌误触抑制
- P5 触屏长按框选
- P6 应用级 Ctrl+Z
- P7 收尾

移出本期：课程卡片可拖拽——如需做，属 OLL 大型特性（布局偏移模型 + 持久化 + 教学镜头协同），单独立项。

### M4 · 课程包平台（当前最重要的产品演进）

状态：部分落地（本地发布目录适配器、统一相机语义、单 APK 内嵌课程包 Local-First）。完整计划见 `docs/course-pack-platform/ARCHITECTURE_AND_EXECUTION_PLAN.md`（2026-09-15，Proposed）。

交付顺序：

1. **contract**：课程包格式与平台契约定稿（含 10 项待决策：进度是否上云、包大小上限、签名机制、首个数学包的课标映射等）
2. **本地播放**：octos-learn 侧播放能力
3. **服务端目录**：octos-course-library 构建发布 + Nginx 暴露不可变 release
4. **启动页 `/`**：课程卡片 + "新建空白白板"，Web 与 Android 同一信息架构（待决策：匿名播放策略、空白白板是否强制登录）
5. **课程实例**：Immutable CoursePack → Mutable CourseInstance，Continue / Restart
6. **APK 缓存**：标准 APK 课程包下载 / 校验 / 原子激活 / LRU 缓存
7. **Spotlight 构建**：独立包名共存、构建时锁定嵌入课程、离线免登录播放
8. **首个数学课包**：与 M1 的数学内容线汇合
9. **真机彩排**

### M5 · 数学质量第二阶段

详见 `docs/MATH_QUALITY_IMPROVEMENT_PLAN.md`。

- 函数图卡片尺寸分档（小/标准/大）
- 高级坐标设置：手动轴范围、单轴缩放、等单位锁定、网格开关
- 关键点辅助显示：截距 / 顶点 / 交点

发布门槛（沿用并加严）：自然输入集 ≥95% 通过正确性/选图/可读性/目标覆盖；短输入与详细输入通过率差 ≤5 个百分点；首段 15 秒不退化。

## 内容线（并行）

- rectangle-area-from-tiles 0.1.5、slope-and-intercept 0.1.6、线性函数三课合集（当前分支）
- 待人工编辑审批后走发布流程
- 每个后续学科都会制作预制课程集，制作过程中检验 OLL 表达力

## Backlog（明确推迟）

| 事项 | 触发条件 |
|---|---|
| ASR 多 worker / 多 Bridge 调度 | 真实使用量证明有需要之后 |
| 认证迁移（Bearer token → Secure/HttpOnly Cookie） | 开放注册后单独评估 |
| Slice 6：octos-web 旧 `/learn` 入口下线 | 待排期 |
| 课程卡片可拖拽 | 单独立项（OLL 大型特性） |
| 更广泛的解题板书 / 板书替代辅助卡片 | 远期方向 |

明确不做：Google Secret Manager、用户上传 Vertex SA JSON、电子白板厂商 SDK 接入。

## 来源索引

| 里程碑 | 文档 |
|---|---|
| M1 / M5 | `docs/MATH_QUALITY_IMPLEMENTATION_STATUS.md`、`docs/MATH_QUALITY_IMPROVEMENT_PLAN.md` |
| M2 | `docs/WHITEBOARD_ASSISTANCE_EXECUTION_PLAN.md`、`docs/WHITEBOARD_ASSISTANCE_IMPLEMENTATION_STATUS.md`、`docs/WHITEBOARD_ASSISTANCE_SPATIAL_INTEGRATION.md` |
| M3 | `docs/WHITEBOARD_INTERACTION_EXECUTION_PLAN.md` |
| M4 | `docs/course-pack-platform/ARCHITECTURE_AND_EXECUTION_PLAN.md` |
| 部署 | `docs/PUBLIC_DEPLOYMENT_RUNBOOK.md` |
| 总体状态 | `docs/DEVELOPMENT_HANDOFF.md`、`docs/LOCAL_DEVELOPMENT_STATUS.md` |
