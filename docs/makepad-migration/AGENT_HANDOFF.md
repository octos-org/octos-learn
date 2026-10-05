# 后续 Agent 接手入口（2026-10-05 更新：跟进 web 新排布/取景、课程包 0.3.0、预览模式；2026-09-28：scene3d、启动器课程集、白板排布与取景；2026-09-27 Kimi 交接版为底）

> 本文件是当前最新接手入口。GPT 的 2026-09-21 版入口见同目录 `AGENT_HANDOFF_CURRENT_2026-09-21.md`（历史）。方案基线仍是 `OLL_RUNTIME_MAKEPAD_PLAN_REVIEW.md`（v4+§13），产品迁移清单见 `OLL_MACOS_PRODUCT_MIGRATION_CHECKLIST.md`。
>
> **本文档在 git 中的 canonical 位置：`octos-learn` 仓库 `codex/macos-product-ui` 分支 `docs/makepad-migration/AGENT_HANDOFF.md`；本调研目录的副本是镜像。改一处请同步另一处（以 git 版为准）。**

## 交接维护规矩（接手者必读，强制执行）

为了让"任何时候都能换 agent 接手"，每个工作阶段结束（或会话结束前）必须更新本文件：

1. **§1 分支与提交表**：更新 HEAD、推送状态、PR 状态。
2. **§2 环境**：工作区被清理过、依赖版本变化、新增工具授权，都要改写对应步骤，让重建步骤始终可直接照抄。
3. **§5 差异与待办**：划掉已完成的，补上本轮新发现的问题，保持优先级排序反映最新判断。
4. 交付记录另起新文件（OLL_MACOS_PRODUCT_V3.md……），不要改写历史版本；本文件只更新指针和当前状态。
5. 构建产物（.app/APK/截图）不进 git，放本调研目录的版本目录里，并在交付记录里写清路径与对应提交。
6. 不确定的信息写"待确认"，不写猜测。

## 0. 一句话现状

**2026-10-05 v6**：v5 暂停期间 web 有较大变化，本轮已合并两仓 main 并跟进（记录见 `OLL_MACOS_PRODUCT_V6.md`）。改动涉及：
- 停靠式控件面板、附件归属、回填列、短步骤叠放、思考题卡；
- 相机上限/parts、保持判断、Beat/Step 上下文；
- 课程包升版与 `hide_when_undefined`；
- 预览模式顶栏。

runtime fixture 与 web 全部 1e-6 一致；逐 Beat 对照的剩余偏差来自卡片尺寸和缺失的练习面板。**v6 已于 2026-10-05 推送**（OLL `9a86f8e`，octos-learn `490de05` + 本文档更新）。 建议下一项：练习任务面板。

**2026-09-28 暂停点**（历史）：用户要求在 v5 完成后暂停。

macOS 产品应用 **v5（白板排布与取景）已推送**（记录见 `OLL_MACOS_PRODUCT_V5.md`）：runtime 移植了 web 最新的阶段行×步骤列布局、安全视口相机与教学对焦策略，原生白板逐 Beat 与 web 对照，大部分 Beat 在 15px 以内；变量滑块改为世界坐标面板；"下一 Beat"可用。v4（启动器课程集，已推送，记录见 `OLL_MACOS_PRODUCT_V4.md`）：启动器改为与 web 一致的两层导航（课程集首页 → 课程集页），课程卡换成 web 新设计，有进度的课显示"继续学习"。**v3（scene3d）已推送**（`OLL_MACOS_PRODUCT_V3.md`）：九门预制课全部可打开并播放到底，其中三门 surface 课的三维场景支持拖动旋转、预设视角和滚轮缩放，并与滑块变量联动。v2 已推送：以 main 网页版真实截图为基准做过一轮像素级对齐；启动器 + 课程播放 + 手写 + 变量联动 + 进度保存/恢复可用。**这不是"界面功能与网页版完全一致"的终态**；差异与待办见 §5。

## 1. 分支与提交

| 仓库 | 分支 | HEAD | 远端 |
|---|---|---|---|
| `octos-learn` | `codex/macos-product-ui` | **v6 已推送**：合并 main `5e7b331`（`499e0d5`）+ v6 原生改动与 V6 文档 `490de05`。此前截至 v5 文档全部已推送：v4 启动器 `0dee7c6`、合并 main `f006919`（`183838c`）、v5 原生排布/相机 `3ca18ba` 和 `fde93a7`，以及 V5 文档 | octos-org/octos-learn 同名分支 |
| `octos-lesson-language` | `codex/rust-runtime-product` | **v6 已推送**：合并 main `67d1476`（`8bcfe46`）+ v6 runtime 移植与 fixture `9a86f8e`。此前 `d4d5af1`（已推送）：teaching/camera/focus `962f9e1`、控件分组 `08e5a32`、Beat 步进 `d4d5af1`；此前 `b7d079f` 为 scene3d；基于 main `f2a1c65` | alan0x/octos-lesson-language 同名分支 |
| `~/Documents/projects/octoscript-makepad` | `fix/plot-zbias-band` | `87f0d59`（基于上游 main `b0628d0`） | fork alan0x/Octoscript-Makepad，**PR #35 待评审** |

两个仓库的持久路径：原机器在 `~/Documents/projects/`，新机器在 `~/Documents/projects/OctosLearn/`。新机器上的提交先落在工作区 clone，再用 `git pull --ff-only <工作区clone> <分支>` 同步回持久仓库。

用户指示：分支只推送不合并；PR 由用户自己跟进。GPT 时代的验证分支 `codex/macos-oll-validation`（v6 回归工具）与 `codex/rust-runtime-macos-validation` 仍在，不要删。

## 2. 工作区重建

当前工作区：原机器在 `/private/tmp/oll-product`（2026-09-27）；**新机器（yangyang，2026-09-28）在 `~/Documents/projects/OctosLearn/.local-dev/oll-product`**（持久目录，不会被系统清空；持久仓库在 `~/Documents/projects/OctosLearn/{octos-learn,octos-lesson-language}`，已分别检出 `codex/macos-product-ui` / `codex/rust-runtime-product`）。2026-09-28 在新机器按下列步骤实测走通：锁文件与 zbias 补丁已入库（`docs/makepad-migration/evidence/`），无需调研目录；Homebrew Rust 1.98.1 构建/测试全绿（原机 1.96.0）；空 cargo 缓存时先在 crate 目录跑一次 `cargo fetch --locked`，再走离线打包。/private/tmp 会被系统定期清空，重建步骤如下（已实测可走通）。所有代码提交都在 §1 的持久分支里，证据与锁文件在本调研目录。重建工作区：

```sh
WS=/private/tmp/oll-product  # 自选空目录
mkdir -p $WS && cd $WS
# 五个并排检出（名字必须是这五个，路径依赖按 ../../../ 解析）
git clone ~/Documents/projects/octos-learn octos-learn && git -C octos-learn checkout codex/macos-product-ui
git clone ~/Documents/projects/octos-lesson-language oll && git -C oll checkout codex/rust-runtime-product
git clone https://github.com/OctoSense-org/makepad.git makepad && git -C makepad checkout --detach 825dbb422c6d7926e111e2ee7831d697870d8671
git clone https://github.com/OctoSense-org/Octoscript.git octoscript && git -C octoscript checkout --detach 68f6a9df55692b5d8ef8873a12721e279a3f40d6
git clone https://github.com/OctoSense-org/Octoscript-Makepad.git octoscript-makepad && git -C octoscript-makepad checkout --detach b0628d05a89369b0c3bae2750db6da06996a05c2
# 锁文件（防依赖漂移）
E=octos-learn/docs/makepad-migration/evidence   # 已入库，与调研目录 phase0-evidence 同内容
cp $E/Makepad.Cargo.lock makepad/Cargo.lock
cp $E/Cargo.lock octoscript-makepad/Cargo.lock
# zbias 修复（PR #35 合并前必须应用）
cd octoscript-makepad && git am ../$E/makepad-plot-zbias-band.patch && cd ..
# 空 cargo 缓存时：(cd octos-learn/native/octos-learn && cargo fetch --locked)
# 课程包：无需人工拷贝。9 门课的 SHA-256 锁定在 octos-learn 分支的
# native/octos-learn/course-packs.lock.json，打包脚本自动从 learn.pitun.cc 下载校验
```

<调研目录> = `/Users/alan0x/Documents/projects/YY/working/octos-learn/2026-0919-makepad数学渲染与去webview化调研`。

构建与打包（离线锁定，需本机 cargo 缓存完整；Rust 1.96.0，Apple Silicon）：

```sh
cd $WS/octos-learn/native/octos-learn
OCTOS_PACK_ARCHIVES=$WS/course-packs bash scripts/package-macos.sh   # 产出 dist/Octos Learn.app，含 ad-hoc 签名
```

产品应用运行时不依赖 `OCTOS_LEARN_PACK_DIR`（.app 内 Resources 自带课程包）；开发态直跑二进制时用 `OCTOS_LEARN_PACK_DIR=<pack-root>` 指向解压后的课程目录（pack-root 结构：`<packId>/<version>/{manifest.json,course.oll.jsonl,thumbnail.svg,audio/}` + `catalog.json`，由打包脚本同款 python 生成）。

## 3. 验证方法

- 测试：`cargo test --offline --locked --release --manifest-path <crate>/Cargo.toml`。基线（2026-10-05）：oll-runtime 40、oll-preview 17、octos-learn 4 全绿。
- web 一致性 fixture：`oll/crates/oll-runtime/tools/teaching-reference.ts`（esbuild 打包真实 web 模块）重新生成 `tests/fixtures/teaching-reference.json`。用法写在该文件头；需要 `NODE_PATH` 指向已安装依赖的 OLL 检出。**web 主机规则变了就要同步改生成器里的主机输入（附件尺寸、归属、readingScale），再重新生成。**
- 逐 Beat 对照 web 与原生：见 `OLL_MACOS_PRODUCT_V6.md` §3（脚本在 `macos-product-v6/beats/`）。要点：
  - web 基准必须是 main 的独立 worktree（`pnpm install --frozen-lockfile`），用 `VITE_SKIP_AUTH=true vite build` 构建后 `vite preview`；
  - 原生用 `OCTOS_LEARN_OPEN=<packId>` 直接打开课程（预览模式），`OLL_PREVIEW_DATA_DIR` 隔离进度存档；
  - `OLL_FOCUS_DEBUG=1` 打印每次相机决策。
- 启动器与 web 对照：web 截图脚本与元素度量方法见 `OLL_MACOS_PRODUCT_V4.md` §5；原生的文字度量规则（px×0.75、line_spacing=行高/1.18、半行距放在外层 View 上）见 V4 §3。**后续所有像素对齐都按这套规则做。**
- 九门课覆盖：`OLL_PACK_ROOT=<.app>/Contents/Resources/course-packs cargo test --release --test course_packs -- --nocapture`（在 oll-runtime 目录下）。逐课加载、播放到底、布局，并渲染每个 scene3d。
- scene3d 实机驱动与 web 基准的生成方法：见 `OLL_MACOS_PRODUCT_V3.md` §3。
- 隐藏实例 + 远程驱动：`MAKEPAD_HIDE_WINDOWS=1 ./<binary> --remote`，日志出现 `listening on 127.0.0.1:PORT pid=N` 后，HTTP 端点 `/snap?q=<id>`（控件树）、`/click?x=&y=&wait=1`、`/m?k=down|move|up&x=&y=`（鼠标）、`/g`（截图 PNG 路径）、`/gq`（退出）。参考脚本模式：调研目录 GPT 时代 `macos-validation-v6/` 与 octos-learn 分支 `native/oll-preview/scripts/verify-*.py`。**注意：`/snap` 对动态插入的 widget 索引不可靠，UI 回归点击用截图坐标。**
- 视觉基准：`macos-product-v2/web-reference/`（main 生产构建 + Playwright，1440×900）。重新生成方法见 `OLL_MACOS_PRODUCT_V2.md` §1（**不能用 vite dev server 截图**：StrictMode 双调用 abort 首次内置目录请求，promise 缓存把 null 永久化，课程卡不渲染；用 `vite build && vite preview`）。

## 4. 关键结构与资产

- 产品 crate：`octos-learn/native/octos-learn/`（lib.rs 全部产品 UI；course_pack.rs 课程包加载；assets/icons/ 23 个 lucide SVG；assets/octos-avatar.svg 章鱼；scripts/package-macos.sh）。
- 复用组件：`octos-learn/native/oll-preview/`（spatial_board.rs 白板 widget：布局/相机/连线/笔迹/点阵/安全区取景；board_view.rs 卡片工厂：math/note/plot/geometry 卡+角标；formula_view.rs 公式混排；progress_store.rs 文件进度存储）。**v6 预览 app 是回归工具，改动这些共享文件后跑一遍它的测试。**
- Rust runtime：`oll/crates/oll-runtime/`（Session/Preview/spatial/connections/expression/timing/checkpoint/ink/api/wasm）。已支持 9 种 canonical op 全部；节点限 geometry/plot/math/note/text/diagram(sequence)。
- 九门课 runtime 覆盖（2026-09-28 实测）：九门全部加载并播放到底（surface 三门依赖 `b7d079f`）。
- scene3d：几何在 `oll/crates/oll-runtime/src/scene3d.rs`（移植自 web scene3d.ts，输出 420×270 viewBox 下的图元，与渲染层无关）；绘制在 `oll-preview/src/scene3d_view.rs`（Scene3dView）；卡片在 `board_view::scene3d_node`；输入路由在 `SpatialBoard::scene_event`，因为白板卡片本身收不到事件。
- 交付记录：`OLL_MACOS_PRODUCT_V1.md`（功能流程）、`OLL_MACOS_PRODUCT_V2.md`（像素对齐）、`OLL_MACOS_PRODUCT_V3.md`（scene3d）、`OLL_MACOS_PRODUCT_V4.md`（启动器课程集）、`OLL_MACOS_PRODUCT_V5.md`（白板排布与取景）、`OLL_MACOS_PRODUCT_V6.md`（跟进 web 新排布/取景、思考题、预览模式）。
- 相机与测量：原生卡片高度在渲染后才测得；`SpatialBoard` 在每个操作开始时保存 Policy 和相机快照，测量引起的重排会用实测尺寸重新决定相机（`operation_start` / `measure_relayout`）。只有视口或 insets 变化才走 `reframe`。
- 白板排布与相机：runtime `teaching.rs`（阶段行×步骤列 + 控件分组）、`camera.rs`（安全视口相机）、`focus.rs`（教学对焦策略）；原生 `SpatialBoard::compute_layout`（web 的测量流程）、`controls_view.rs`（世界坐标滑块面板）。
- 启动器：`native/octos-learn/src/lib.rs` 的 `COURSE_COLLECTIONS` / `collection_card` / `course_card` / `card_grid` / `equalize_card_rows` / `handle_launcher_taps`；`src/svg_image.rs`（渲染带文字的 SVG 缩略图）。

## 5. 与网页版的剩余差异 / 待办（按用户关注排序）

1. ~~**surface 三门课（3D）**~~：2026-09-28 完成（v3）。没有用 makepad-d3，而是照搬 web 的 CPU 投影 + SVG 画家算法，所以与网页版像素一致。遗留：
   - 学生调整过的场景相机没有写进进度存档；
   - 坐标轴标签不是等宽字体；
   - 不在九门课里的 3D 对象（implicit_surface、box/sphere/cone/cylinder、highlights）还没做过视觉对照。
   - 注意：固定版本的 makepad-latex-math 遇到普通的 `]` 会死循环，已由 `formula_view::parser_safe` 绕开（V5 §2）。新增任何公式渲染入口都必须先经过它。
   详见 V3 §4。
2. ~~**启动器课程集 UI**~~：2026-09-28 完成（v4）。遗留：
   - 课程卡"⋯"菜单（重新开始 / 删除学习记录）未做；
   - 悬停效果和阴影未做；
   - 中文没有粗体字形；
   - 眉题字间距未做。
   详见 V4 §4。
3. ~~**卡片排布/取景**~~：2026-09-28 完成（v5）。2026-10-05 跟进 web 新规则（v6，见 V6）。遗留：
   - **练习任务面板**（web 在课程完成时打开，放在图左侧，并算进整课取景；最大的剩余差异）；
   - 思考题展开状态不持久；
   - 互动模式没有逐 Beat 对照；
   - 公式字形宽度差（NewCM 与 KaTeX）；
   - plot 与 text 卡片内部细节；
   - 卡片 focused 描边。
   详见 V5 §4。建议下一项做**练习任务面板**：runtime 已支持 task 附件布局。
4. **字体**：web 用 Hanken Grotesk/Inter（仅拉丁 woff2）；makepad ttf_parser 只吃 ttf/otf。→ 构建期 woff2→ttf 预转（一次性工具）后接入。
5. **功能禁用项**（UI 上有占位，点击 toast 说明）：语音、摄像头、提问输入坞、本课目录、重播 Topic（需 runtime 加 restart_topic 与大纲结构暴露；下一 Beat 已在 v5 实现）、橡皮擦/框选/笔迹持久化（需 Ink 加 erase/select/持久化，对齐 web `oll.student-ink.svg` 格式）、旁白音频（包内 mp3 未接入；manifest narration.segments 有 beatId→文件+时长，可先做 durationMs 真实节奏）、登录/设置页、空白白板、网络课程目录。
6. **细节近似**：无真毛玻璃/阴影/markdown；滑块把手方形；探索/大图按钮纯视觉；PR #35 合并前构建依赖本地补丁。

## 6. 授权与边界（用户已确认的规矩）

- 只推送不合并；push/发 PR 前先问。git 提交可直接做在 codex/ 分支。
- 不切用户工作分支、不清用户工作区；持久仓库被其他会话占用（2026-10-05：octos-learn 在 `codex/android-native-ink-stroke-handoff`，OLL 在 `codex/native-ink-exclusion-smoothing`），不要切换——工作一律在 `.local-dev/oll-product` 工作区 clone 或自建 worktree。web 基准用工作区 clone 的 `git worktree add` 到临时目录构建。
- 原生课程包锁定（`native/octos-learn/course-packs.lock.json`）始终与 main 的 `android/embedded-course-packs.json` 快照保持一致（用户 2026-10-05 确认）；合并 main 时同步，并在交付记录里写明。
- 固定依赖版本不得擅自升级（runtime.json 组合）；WASM target 安装（rustup target add wasm32-unknown-unknown）**尚未获授权**；Android 真机安装**未获授权**（设备 192.168.1.63，只开发打包）。
- 不确定就问用户；历史文档中的性能数字（8ms/35MB/3-10x）均不作数。

## 7. 文件地图（本调研目录）

新机器上没有原调研目录。v3 起，构建产物和证据放在 `~/Documents/projects/OctosLearn/.local-dev/macos-product-v3/`、`macos-product-v4/`、`macos-product-v5/`、`macos-product-v6/`（web-reference、native 截图、驱动脚本）。锁文件和 zbias 补丁已入库，见 `docs/makepad-migration/evidence/`。


`OLL_MACOS_PRODUCT_V6.md`（最新交付记录，跟进 web 2026-10 改动）→ `OLL_MACOS_PRODUCT_V5.md`（白板排布与取景）→ `OLL_MACOS_PRODUCT_V4.md` → `OLL_MACOS_PRODUCT_V3.md` → `OLL_MACOS_PRODUCT_V2.md` → `OLL_MACOS_PRODUCT_V1.md` → `OLL_MACOS_PRODUCT_MIGRATION_CHECKLIST.md`（迁移清单+v1 状态）→ `OLL_RUNTIME_MAKEPAD_PLAN_REVIEW.md`（方案基线）→ `macos-product-v2/`（v2 .app+截图+web 基准）→ `macos-product-v1/`、`macos-validation-v1~v6/`（历史证据）→ `phase0-evidence/`（锁文件+zbias 补丁+构建日志）。
