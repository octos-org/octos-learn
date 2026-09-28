# macOS 产品应用 v5：白板卡片排布与取景（跟随 web 最新相机工作）

> 日期：2026-09-28。目标：接手文档 §5 第 3 项。基准是用户合并后的 main：
> - OLL `f2a1c65`（#18 whiteboard-camera-closeout：阶段行×步骤列、比较视图并入所在行、Beat 目标保持在画面内）；
> - octos-learn `f006919`（#28 相机收尾、#33 course-end-camera、#35 IndexedDB）。
>
> 产品分支已合并该 main（`183838c`）。

## 1. 结果

九门课逐 Beat 与 web 对照：两边各按"下一 Beat"步进，都用 1440×868 视口（原生窗口去掉 32px 标题栏后的白板尺寸），比较每张卡片在屏幕上的位置。

| 课程 | Beat 数 | 课程结束前误差 ≤12px 的 Beat | 结束前最大屏幕偏差 |
|---|---|---|---|
| linear-intro-and-slope | 8 | 7/7 | 0 |
| linear-simultaneous-intersections | 9 | 8/8 | 5.5 |
| slope-and-intercept | 13 | 11/12 | 13.7 |
| trig-unit-circle-to-sine | 10 | 8/9 | 14.6 |
| trig-cosine-and-phase-shift | 13 | 11/12 | 15.6 |
| trig-quadrants-and-monotonicity | 9 | 6/8 | 83.4 |
| surface-paraboloid-level-sets | 11 | 10/10 | 5.2 |
| surface-partial-derivative-slice | 11 | 4/10 | 36.1 |
| surface-saddle-point-analysis | 15 | 2/14 | 33.0 |

- 相机缩放在绝大多数 Beat 与 web 完全一致（例如 1.099、0.931、0.906、0.975、0.667）。剩余偏差来自公式卡宽度：原生 NewCM 数学字体与 KaTeX 的字形宽度不同，改变了整齐列宽，trig-quadrants 还因此少一次换带。
- 课程结束那一步两边不同：web 在课程完成时打开**练习任务面板**，并把它算进整课取景；原生还没有练习 UI（见 §4-1）。
- 这次对照还修掉了一个既有缺陷：trig-quadrants 课在第一张公式卡处会冻结。固定版本的 makepad-latex-math 解析器遇到任何普通的 `]` 都会死循环（见 §2）。

## 2. 实现

**OLL `codex/rust-runtime-product`**（提交 `962f9e1`、`08e5a32`、`d4d5af1`）

- `teaching.rs`：移植 web `computeTeachingRegion`（阶段行 × 步骤列）。包括：
  - 引入列与操作列（单图时控件/练习放在图左）；
  - 比较对、joiners 并入所在行；
  - plannedSteps 按均衡分列，超宽换带，窄屏单列流；
  - 移植 `buildInteractionClusters` 与主机控件面板尺寸（`control_clusters`）。

  主机从不传 relations，所以与 relations 相关的路径没有移植。
- `camera.rs`：移植 `planFocusCamera` / `safeViewport` / `planRevealCamera`，包括 insets、遮挡物、细条过滤，以及"拟合度接近时取最居中候选"的规则。
- `focus.rs`：移植每次渲染的教学相机策略，包括：
  - board-view 的声明焦点、动画取景（缩放 ≥ 0.75 才连同 Beat 目标一起框）、新建卡回退；
  - 主机的 Beat 构图覆盖、supportingVisual、控件面板进入对焦矩形；
  - 课程结束整课取景；
  - `beat.end` 边界时回到上次关注目标。
- `Preview`：提供 current_beat、Beat focus_targets、主机 nodeSections/plannedSteps，以及 `from_board`。
- `Session::advance_beat`：与 web `advanceBeat` 一致。
- `tests/teaching.rs` + `tools/teaching-reference.ts`：用 esbuild 打包**真实 web 模块**生成 fixture。九门课 × 宽窄两种构图、每个动作的布局，外加 400 个随机相机用例，全部 1e-6 一致；控件分组也与 web 函数一致。
- runtime 测试数 32 → 39。

**octos-learn `codex/macos-product-ui`**（提交 `3ca18ba`、`fde93a7`）

- SpatialBoard 把视口与主机 insets 组成教学区域的构图。浮动 UI 作为遮挡物上报：顶栏、首页/菜单、手写工具栏、输入坞、小章鱼头像。
- 尺寸流程与 web `render()` 相同：
  - 先用 measureSemanticNode 估算做临时布局；
  - 再用实测尺寸重排：宽度取临时布局宽（公式卡取渲染宽），公式/便签/文字卡高度取渲染后的实际高度；
  - 最多重排 3 轮。
- 相机：`focus::Policy`。手势进行中的镜头移动延后到手势结束；被动布局变化用锚点卡补偿；窗口尺寸变化时重新取景。**暂停时也推进镜头过渡**（`fde93a7`，之前单步 Beat 后镜头不动）。
- 变量滑块从固定浮层改为世界坐标中的 `ControlsCard`（对应 web `.learning-variable-controls.is-world`）：由白板做命中测试，应用负责写回变量。只显示 slider 变量，与 web 一致。
- 卡片盒模型对齐 web：
  - math/note 角标脱离文档流；
  - 公式按推出符号拆成多行，最宽 680，超宽的行等比缩小；
  - 公式字号与 KaTeX 相同（24.96px）；
  - 便签改为标题 + 项目符号列表。
- "下一 Beat"已可用，不再是占位。
- 新增 `OCTOS_LEARN_OPEN=<packId>[@ver]`：启动时直接打开课程，供脚本使用。
- `formula_view::parser_safe`：把普通的 `[`/`]` 改写为 `\lbrack`/`\rbrack`（保留 `\sqrt[..]` 和 `\left[`/`\right]`），绕开固定版本解析器在 `]` 上的死循环。九门课 76 个公式片段全部可解析。
- 测试：oll-preview 17、octos-learn 4 全绿，构建无警告。

## 3. 验证方法（证据目录 `~/Documents/projects/OctosLearn/.local-dev/macos-product-v5/`）

- web：`beats/web-beats.mjs` 在 `vite preview` 上运行，视口 1440×868：逐课点"下一 OLL Beat"，记录 DOM 卡片矩形、控件面板和 world transform，并截图。
- 原生：`beats/native-beats.py <app> <out> <packs…>`。用 `OCTOS_LEARN_OPEN` 加独立的 `OLL_PREVIEW_DATA_DIR` 打开课程（避免恢复旧进度），逐次点击"下一 Beat"，记录白板快照（camera/destination/nodes/attachments/insets）并截图。
- 对照：`beats/compare.py` 输出逐 Beat 表，`beats/summary.py` 汇总（结果见 `compare.txt`）。
- 控件面板交互：`beats/panel-test.py`（＋ 按钮和拖动，确认白板镜头不动）。

## 4. 已知差异 / 未做

1. **练习任务面板**：web 在课程完成时打开，并算进整课取景。原生没有，所以每门课最后一步的取景不同。它是下一个自然的工作项：runtime 已经支持 task 附件布局，缺的是 UI 与任务判定。
2. 公式字形宽度：NewCM 与 KaTeX 的差异使部分整齐列宽相差 10–30px，saddle、partial 和 trig-quadrants 受影响较明显。要彻底消除，需要换用 KaTeX 字体，或按 KaTeX 的度量表估算宽度。
3. 卡片细节：
   - plot 卡片内部没有对齐（图例、样式；底边被裁）；
   - text 卡（fragments）仍用旧盒模型；
   - 卡片没有 focused/active 描边。
4. web 预览模式的顶栏不同：web 显示"开始互动学习"，没有手写工具栏；原生沿用互动模式的顶栏。
5. 窄视口（≤900px）的 insets 已按 web 设置，但没有逐 Beat 对照过。
