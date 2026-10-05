# macOS 产品应用 v6：跟进 web 白板排布 / 取景新改动、课程包 0.3.0 内容、预览模式

> 日期：2026-10-05。目标：v5 暂停期间 web 版有较大变化，本轮先摸清变化，再把原生应用跟到最新 web。
>
> 基准是用户合并后的 main：
> - OLL `67d1476`；
> - octos-learn `5e7b331`（v0.1.1、e2e 相机/布局收尾、思考题 reflections、课程包快照 `curated-e2e-closeout-2026-09-30`）。
>
> 两个产品分支都已合并各自的 main（本地合并提交：OLL `8bcfe46`、octos-learn `499e0d5`）。

## 1. web 在这期间的变化（与原生相关的部分）

| 范围 | 变化 |
|---|---|
| teaching-layout.ts | <ul><li>`composition.readingScale`（默认 .9，夹在 .3–1.5）。</li><li>单图控件**停靠在图下方、与图同宽**（DOCK_GAP 8）；多图共享控件停靠在第一张图下，与其他图冲突时放到全部图下方。</li><li>练习面板（330 宽）只在打开时放到图左侧。</li><li>附件有**唯一显示归属** `ownerNodeId`：依赖可跨行，但只在归属行占位。</li><li>新增 `placeRemainingAttachments`。</li><li>放不下时**回填早先列**（`reopenColumnFor`），不再一律换带。</li><li>短步骤（≤2 张卡）**叠在上一步的列下**（宽度 ≤1.7 倍）。</li><li>思考题卡放在锚点卡正下方，同列下方内容整体下移。</li></ul> |
| camera.ts | <ul><li>`planFocusCamera` 增加 `scaleCeiling` 与 `parts` 参数。</li><li>居中后若所有部件都离开浮动 UI 8px，就保留整块安全区。</li><li>course 模式也用 near-fit。</li><li>新增 `holdsTeachingFrame`（比例 1.18；居中容差：已框住 ∞，新内容 .05）。</li></ul> |
| board-view.ts | <ul><li>`withTeachingContext`：先并入 Beat 目标（保持 .8 比例或可读 .55），再并入本 Step 先前写下的卡片（.92）。</li><li>supporting visual 只在缩放不低于自身 .85 时并入。</li><li>`lastFramedScene` / `lastFramedBeat` 保持逻辑：已经看得见就不动。</li><li>`automaticCameraMaximumScale`。</li><li>非公式卡的布局输入用自然宽度，不把拉伸后的宽度回喂。</li><li>点/指向时用 `resolveFocusRects`。</li></ul> |
| runtime.ts | <ul><li>`compositionTargets` 并入本 Beat 已创建的卡。</li><li>新增 `stepContextTargets`、`reflections`。</li></ul> |
| core | <ul><li>`lesson.reflections`（课后思考题）。</li><li>点绑定 `hide_when_undefined`：点位无定义时隐藏而不报错（课程包播放器版本 0.3.0）。</li></ul> |
| 主机（octos-learn） | <ul><li>`boardChromeInsets`：顶部/底部浮动 UI 变成带状边距，其余仍算遮挡；桌面下限 92/120。</li><li>阅读比例 .9，自动相机上限 1.1。</li><li>控件面板改为紧凑样式：内边距 5/10、22px 按钮、演示提示改成顶边胶囊。</li><li>控件高度改为 12+24n+4(n−1)；实测 34px（一行）。</li><li>课程结束整课取景带 `parts`。</li><li>预览模式（`course-mode=preview`）：没有手写工具栏和输入坞，右上只有"开始互动学习"。</li></ul> |
| 课程包 | 9 门课中 8 门更新了版本（见 `android/embedded-course-packs.json`）。 |

## 2. 实现

**OLL `codex/rust-runtime-product`**（本地提交，未推送）

- `teaching.rs`：移植上表 teaching-layout 的全部规则。
  - `Attachment` 改为 `kind`（Control/Task/Reflection）+ `anchor_node_id` + `owner_node_id`。
  - `Region.reading_scale`。
  - `control_clusters` 改用新的面板高度和归属。
- `camera.rs`：
  - `safe_viewport` / `plan_focus` 增加 ceiling 与 parts 参数，加入"保留整块安全区"规则；
  - course 模式改用 near-fit；
  - 新增 `holds_teaching_frame`。
- `focus.rs`：
  - `View.scale_ceiling`；
  - `focus_rects` 加入 supporting visual 门槛；
  - `with_teaching_context`（Beat 目标、Step 上下文）；
  - 每次对焦都经过保持判断（`last_framed_scene/beat`）；
  - `refocus`（视口变化时）；
  - 课程结束取景在包围盒变化时重新取景（与 web 签名一致）。
  - `OLL_FOCUS_DEBUG=1` 时打印每次对焦的目标、矩形和结果。
- `preview.rs`：
  - `Frame.phase`；
  - `beat_created`（与 web 一样包含紧接着的下一条动作）；
  - `step_context_targets`；
  - `reflections()`；
  - `hide_when_undefined` 点绑定。
- fixture 生成器 `tools/teaching-reference.ts`：主机输入改为新规则（ownerNodeId、面板尺寸、思考题、readingScale）。
  - 构图增加 1920×1080@.68（会议屏）；
  - 相机用例带 ceiling 与 parts；
  - 新增 300 个 `holdsTeachingFrame` 用例。
- 重新生成 fixture 后，**布局（27 组构图 × 每个动作）、400 个相机用例、300 个保持判断用例全部与 web 在 1e-6 内一致**。
- runtime 测试数 39 → 40。

**octos-learn `codex/macos-product-ui`**（本地提交，未推送）

- `course-packs.lock.json`：跟随 main 的 `android/embedded-course-packs.json` 快照（8 门课升版，sha256 与字节数取自该文件，打包时下载并校验通过）。
- `spatial_board.rs`：
  - 构图传 `readingScale` .9，相机上限 1.1；
  - 控件附件带 `ownerNodeId`，高度用渲染高度（`controls_view::panel_height`）；
  - 非公式卡的布局输入用估算的自然宽度。
- **测量后重新决策**：原生的卡片高度在渲染后才测得。现在每个操作开始时保存 Policy 和相机快照；测量引起的重排会回到快照，用实测尺寸重新决定这一步的相机。web 是先测量再决策；不这样做时，supporting visual 和上下文的门槛会用估算高度判断，结果偏离。
- 只有视口或 insets 变化才重新取景（web 的 `resize`）；测量引起的重排不再重新取景。
- 思考题卡（`board_view::reflection_card`，对应 web `.learning-reflection-card`）：
  - 课程完成后出现在锚点卡下方；
  - 渲染后测量高度回喂布局；
  - "查看答案/收起答案"可点击（世界坐标命中测试）。
- `controls_view.rs`：紧凑停靠面板（内边距 5/10、22px 行和按钮、圆角 14）。
  - 数值按步长固定小数位，宽度按 `courseControlLabelWidth`；
  - 拖动或演示时不显示 π 形式；
  - 演示中在顶边显示"老师正在演示这个变量…"胶囊。
- `lib.rs`：
  - `board_chrome_insets`（web `boardChromeInsets`）；
  - **课程预览模式**：启动器"预览"打开时隐藏手写工具栏、输入坞和语音/摄像头，显示"开始互动学习"，点击后切换到互动模式。启动器"开始学习"直接进入互动模式。
- `lib.rs`（oll-preview）：`binding_undefined` 的点不绘制。

## 3. 结果（证据目录 `~/Documents/projects/OctosLearn/.local-dev/macos-product-v6/beats/`）

web 基准：main `5e7b331` 在独立 worktree 中构建（`pnpm install --frozen-lockfile`，然后 `VITE_SKIP_AUTH=true vite build`）。

- 现在 `/board` 有登录守卫，静态预览没有后端，所以需要 `VITE_SKIP_AUTH`。
- 课程版本与原生锁定一致（脚本会打印实际打开的版本）。
- 两边都是预览模式，视口 1440×868。

| 课程 | 结束前 ≤12px 的 Beat | 结束前最大屏幕偏差 | 说明 |
|---|---|---|---|
| linear-intro-and-slope | 0/7（全部 14.9） | 14.9 | 缩放 1.091 对 1.1，见下 |
| linear-simultaneous-intersections | 5/8 | 60.4 | 文字卡高度差 2px |
| slope-and-intercept | 0/12（13.5–23.6） | 23.6 | 缩放一致，卡片尺寸差 |
| surface-paraboloid-level-sets | 10/10 | 9.4 | |
| surface-partial-derivative-slice | 5/10 | 34.1 | |
| surface-saddle-point-analysis | 2/13（多数 ≤20） | 33.0 | 缩放基本一致（.937/.937、.709/.710、.552/.554） |
| trig-cosine-and-phase-shift | 8/12 | 39.5 | |
| trig-quadrants-and-monotonicity | 5/8 | 570.5 | 一个 Beat 落在阈值另一侧，见下 |
| trig-unit-circle-to-sine | 5/6 | 14.6 | |

- **布局**：世界坐标与 web 相同或只差几 px。控件面板的位置和尺寸在课程结束前的所有 Beat 都与 web 完全一致（attach 0.0；partial 3px 来自上方卡片高度）。
- 剩余偏差全部来自卡片尺寸，而不是策略：
  - linear-intro：可读性项是 240/卡宽，原生公式卡宽 220、web 217，于是 1.091 对 1.1（V5 已知的 NewCM/KaTeX 字宽差）。
  - trig-quadrants Beat 8：web 把组 + 两张新卡框在一起是 .551，刚好高于 .55 的可读线；原生卡片低 27px，结果 .54，于是只框新卡。
- **课程结束**：web 在完成时打开练习任务面板（330 宽，放在图左侧），整行右移。原生还没有练习面板，所以各课最后一帧仍不同；思考题卡出现在同一锚点下方，x 差 31px、高度 105 对 117（文字换行差异）。
- 定位方法：`OLL_FOCUS_DEBUG=1` 跑 `native-beats.py`，对照 web 截图，按每次对焦的矩形和缩放反推 web 的决策。本轮靠它定位了两处真实问题：插图门槛用估算高度判断，以及预览模式的顶栏。

## 4. 已知差异 / 未做

1. **练习任务面板**：最大的剩余差异，影响每门课的课程结束取景。runtime 已能布局 task 附件（归属、左侧位置都与 web 一致），缺 UI 与判定。
2. 公式字宽（NewCM 与 KaTeX）和文字卡高度差：会让缩放阈值附近的 Beat 落到另一侧。
3. 思考题"已展开"状态只保存在内存里；web 保存在 localStorage。
4. 互动模式（非预览）没有逐 Beat 对照过；web 互动模式的手写工具栏位置会影响顶部带状边距。
5. web 的 scene3d.ts 本轮改动只是性能优化（复用图层、缓存投影），原生不需要跟进。
6. Android 版的阅读比例 .68 / 上限 .8 只在 fixture 里验证（1920×1080 构图），原生没有对应的平台分支。
