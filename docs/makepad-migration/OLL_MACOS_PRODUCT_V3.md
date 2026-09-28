# macOS 产品应用 v3：scene3d（surface 三门课）

> 日期：2026-09-28。机器：yangyang 的 Mac（新接手机器）。目标：接手文档 §5 第 1 项。完成后九门预制课在原生应用里全部可以打开并播放到底。

## 1. 结果

- 三门 surface 课原来报 "Unsupported preview node kind"，现在都能打开并完整播放：
  - surface-paraboloid-level-sets 0.2.6
  - surface-partial-derivative-slice 0.2.7
  - surface-saddle-point-analysis 0.2.7（两张 scene3d 并排）
- 交互与网页版一致：
  - 拖动画面旋转，偏航 ×0.012/px，俯仰 ×0.01/px。
  - 滚轮缩放，zoom·exp(-deltaY·0.0015)，限制在 0.2–5。
  - 四个按钮：等轴、正视、俯视、复位。
  - 滑块变量通过 `sections[].value` 绑定驱动截面移动（partial 课 y₀）。
- 与网页版的像素对照：面板渐变的采样点与 web 基准一致（边缘 #edf4f0 完全相同；中心 #f7faf8，web 为 #f6faf8）。曲面网格、虚线截面、交线、坐标轴、按钮条、提示徽章、静态说明逐项目测一致。

## 2. 实现（均为本地提交，**未推送**）

| 仓库/分支 | 提交 | 内容 |
|---|---|---|
| OLL `codex/rust-runtime-product` | `b7d079f` | `oll-runtime/src/scene3d.rs`：把 `packages/web-runtime/src/scene3d.ts` 完整移植为与渲染无关的模块。覆盖投影、曲面、隐式曲面、box/sphere/cone/cylinder、截面平面、平面求交与串链、高亮、fitted frame；输出为 420×270 viewBox 下按画家顺序排列的图元。Preview 接受 scene3d 节点（create/revise 时校验）。`bind()` 改为 web 的 binding 能力表，新增 `guides.value` 与 `sections.value`。新增 6 个单测，以及 `tests/course_packs.rs`（设置 OLL_PACK_ROOT 才运行，逐课播放到底并渲染所有场景）。 |
| octos-learn `codex/macos-product-ui` | `31ad389` | `oll-preview/src/scene3d_view.rs`：新增 Scene3dView 控件，内容见表下说明。`board_view::scene3d_node`：卡片外框取自 web `.board-node` 规则（padding 16/18、标题 16px 粗体、SCENE3D 角标），尺寸 460×360 与 web measureSemanticNode 一致。`SpatialBoard`：落在场景内的指针事件交给场景处理，每个节点的相机状态保留到课程重置为止。 |

Scene3dView 包含：
- 面板背景：按像素计算的径向渐变。注意 DrawVector 的渐变**必须先 `add_gradient_row` 并设置 `cur_gradient_row_v`**，否则只画出第一个 stop 的颜色。
- 场景图元：映射到 SVG 视口，按视口裁剪；描边宽度不随缩放变化；虚线手工切段。
- 按钮条、静态说明、"拖动画面旋转 · 滚动缩放"提示徽章。

## 3. 验证

- `cargo test`：oll-runtime 32（原 25 + scene3d 6 + course_packs 1）、oll-preview 15、octos-learn 3，全绿。构建无警告。
- `OLL_PACK_ROOT=<.app>/Contents/Resources/course-packs cargo test --release --test course_packs -- --nocapture`：九门课全部加载、播放到底，布局与场景渲染无错误。
- 实机驱动脚本 `drive-scene3d.py <app> <out> <0|1|2>`（在下面的证据目录里）：
  - 流程：打开课程 → 播放直到场景出现 → 暂停 → 截图 → 拖动旋转 → 点俯视 → 滚轮放大 → 复位。card=1 时还会点 40 次滑块 ＋。
  - 同时断言以上操作不会移动白板相机。
  - 坐标依赖当前启动器布局：假设滚动到底后的第一行是三门 surface 课，布局变了要重新取点。
- 网页基准：
  - 用法：OCTOS_EMBEDDED_PACKS_JSON=`embedded-nine.json`（即 course-packs.lock.json 加上 snapshotId/generatedAt）跑 `node scripts/prepare-embedded-course-assets.mjs`，然后 `vite build --outDir <dir>`，再用 `vite preview` 起服务，最后跑 `shoot-surface-lessons.mjs`。
  - 这个脚本放在 octos-learn 仓库根目录下运行，才能解析到 playwright；截图尺寸 1440×900。
  - 课程包可以预先放进 `node_modules/.cache/course-packs/<id>-<ver>-<sha>.ocpack`，省去下载。

证据目录（不进 git）：`~/Documents/projects/OctosLearn/.local-dev/macos-product-v3/`，其中：
- `web-reference/`：web 截图与脚本；
- `native/`：原生截图，包括默认视角、旋转、俯视、放大、复位、partial 课 y₀=0.4、saddle 课；
- `drive-scene3d.py`、`png-pixel.py`：驱动脚本和纯 Python 的 PNG 取色工具。

对应提交：OLL `b7d079f`，octos-learn `31ad389`。

## 4. 已知差异 / 未做

1. 学生调整过的场景相机没有写进进度存档。web 把 scene3dViews 存进学生操作记录；原生目前只在内存里保留，课程重置或重开就回到作者设定的相机。
2. 坐标轴标签用的是 IBM Plex SemiBold，web 是 700 11px 等宽字体；尺寸和位置一致，只是字形不同。
3. 卡片的 focused/active 边框（紫色或青色描边加外发光）没有画。这是原生卡片的共同缺口，plot/geometry 卡也没有。
4. scene3d 的 implicit_surface、box/sphere/cone/cylinder、highlights 已经移植并有校验，但九门课里都没用到，所以没有用真实课程内容做过视觉对照。
5. saddle 课两张卡并排时，原生相机只框住第二张，web 在相应 beat 能同时显示两张。两边截图时机不同（web 是按 beat 步进截的，原生是按时间播放截的），还不能确定是真差异，归入 §5 第 3 项"卡片排布/取景"。
6. "下一 Beat"在原生里仍然禁用，实机验证只能靠播放加等待，比较慢。
