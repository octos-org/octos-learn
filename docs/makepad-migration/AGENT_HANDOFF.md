# 后续 Agent 接手入口（2026-10-06 更新：v7 功能补齐与界面对齐，可交付测试；2026-10-05：跟进 web 新排布/取景、课程包 0.3.0、预览模式；2026-09-28：scene3d、启动器课程集、白板排布与取景；2026-09-27 Kimi 交接版为底）

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

**最新 Android 缓存复测（2026-10-07）**：干净 `bf83cf2` 已重打并安装独立APK，课程集缓存gap17.69ms /wait2.89ms，nocache70.43 /47.72ms；首页缓存gap18.22ms，nocache54.93ms。性能显著改善；首页卡片起手拖动抬手误打开课程集，在第一 / 第三卡片各复现一次。预览、开始互动、菜单打开与位置、返回后滚动、甩动通过；菜单触摸外部不关闭、条目触摸无响应，是否新增未确定。系统 / Web包不变，默认缓存、应用1080p、诊断全关。未改产品 / pinned Makepad；报告和证据已于2026-10-08经用户明确授权推送（ac4beac、3dba03a）。优先读 [纹理缓存复测](ANDROID_SCROLL_CACHE_RETEST_2026-10-07.md)。下列为历史阶段结果。

**最新 Android 成本拆分（2026-10-07）**：干净 `b6da998` 已重打独立诊断 APK，十组有效对照完成。默认滚动约 19 次 Draw/s，现有 batch 无改善；静止 tinyredraw,batch 的 event 12.55→3.24ms，而 gap 40.21→39.51ms、wait 增至31.26ms。nocardtext 总体改善最大（约28），但占位替换改变排版，需先保持几何验证。系统4K / density640未变、Web包保留；当前开关全关、默认应用1080p。未改产品 / Makepad 源码，报告和证据随本轮提交推送。优先读 [课程列表成本拆分](ANDROID_COURSE_LIST_BISECTION_2026-10-07.md)。下列数字为此前阶段结果。

**最新 Android 修复验收（2026-10-07）**：已拉取 Claude `72e90eb`（含 `053cfaf`），补一处 Java checked ErrnoException 编译处理后重打独立 APK。默认只将应用 surface 设为 1920×1080，实际显示仍 4K，逻辑 UI 960×540；同 APK 原生 4K / 默认缩放三场景对照完成：首页约 8→25、课程集约 6→18 次 Draw/s，播放中位呈现间隔 100→33ms。卡片起手拖动 / 点击、边缘按钮、三处笔迹、滑块、3D 旋转 / 复位通过 ADB 触屏输入检查。系统显示设置全程不变、旧 Web APK 未覆盖；当前大屏留下默认缩放且关闭性能日志的新包。本地后端与 reverse 50080 已恢复。优先读 [surface 缩放与触摸复测](ANDROID_SURFACE_SCALE_AND_TOUCH_RETEST_2026-10-07.md)；清晰度需用户现场判断，课程集仍需优化。

**最新性能调查（2026-10-07）**：已基于 Claude `deb8e88` 重打独立 APK，完成三场景 4K / 临时 1080p 对照。4K 每帧 swap 等待：首页 106ms、课程集 143ms、播放 68ms；1080p 分别降到 25 / 32 / 7ms，应用 event / 平台 draw 单帧时间几乎不变。恢复 4K 重测课程集仍约 6 次 Draw/s。已恢复原始 3840×2160 与 density override 640，Web APK 安装身份不变。只加默认关闭的 Android PerfMonitor Draw 边界诊断补丁，未改固定 Makepad、正式渲染分辨率或主题色。另确认卡片区域起手拖动不滚页；交给 Claude 修复。优先读 [帧拆分与分辨率对照](ANDROID_FRAME_SPLIT_AND_RESOLUTION_TEST_2026-10-07.md)，含日志 / 产物 hash / 统计限制。

**最新交付（2026-10-07）**：已合入 Claude `0960f29`，保留此前 Android 独立打包与 macOS 音频修复，并实现 Web Android 的紧凑 UI 密度。新 APK 继续使用 `cc.pitun.learn.makepadtest`，旧 Web `cc.pitun.learn` 保留。首页空闲不再连续 Draw；一次函数播放仍约 15 FPS，性能尚未完全验收。源码和记录随本轮提交推送；后续优先读 [Android UI 对齐与复测](ANDROID_UI_PARITY_AND_PERF_RETEST_2026-10-07.md)，下列早期“未提交”等状态为历史。

**Android 构建背景补充（2026-10-07）**：用户要求向 Claude 说明已安装 APK 的编译打包过程。已补充 [构建交接](ANDROID_APK_BUILD_HANDOFF_2026-10-07.md)，包括独立 checkout 同步、Release 工具链、固定 Makepad Java host 重编译、唯一 JNI 入口、课程/字体封装与 APK hash。本轮仅更新文档，未重新构建安装；实现改动仍未提交推送。

**最新安卓测试反馈**：用户报告全界面卡顿，包括首页与按钮。只读采样确认实际约 12 FPS，Makepad 原生事件/绘制线程约 93.5–96% 单核 CPU；具体热点函数尚未定位。本轮未改实现或设备设置，当前安卓版本未通过性能验收。证据见 [卡顿探索记录](ANDROID_UI_STUTTER_INVESTIGATION_2026-10-07.md)。

**后续用户授权（2026-10-07）**：安装局域网安卓大屏用于性能测试，保留已有 Web APK。独立 `cc.pitun.learn.makepadtest` release APK 已安装并启动；九课与中文字体就绪，Web 包安装身份完全保留。安卓打包与预览 JNI 入口适配为本地未提交改动，旁白跨平台实现仍未继续处理。见 [安卓大屏性能测试记录](ANDROID_LAN_PERFORMANCE_TEST_2026-10-07.md)。

**最新用户指示（2026-10-07）**：停止继续修改实现，整理问题探索结果交给 Claude。已确认固定 Makepad 的 Android/Windows 纯音频入口为空实现；原有 macOS 本地修复保留且未提交推送。本轮只新增报告并更新文档，详见 [旁白与跨平台音频探索结果](NARRATION_AUDIO_INVESTIGATION_2026-10-07.md)。

**2026-10-07 alan0x 本机复测**：`bc9d240` + OLL `d59b607` 的本地测试环境已准备。旁白约一秒截断已在产品层绕过固定 Makepad 视频播放器，改用 macOS `AVAudioPlayer`；产品 11 项测试与连续多段实际播放通过，修复版已重新打包。源码改动尚未提交推送。见 [旁白截断修复](NARRATION_AUDIO_FIX_2026-10-07.md)。

**2026-10-06 v7（可交付测试）**：功能补齐并逐屏对齐 Web，记录见 `OLL_MACOS_PRODUCT_V7.md`，逐项进度和接手清单见仓库根目录 `NATIVE_MACOS_PROGRESS.md`（每完成一块就更新并推送）。
- 新增：练习任务、plot / geometry 卡片、旁白音频、课程目录、大图、手写编辑、学习记录、卡片菜单。
- 视觉巡检修掉了 Makepad 圆角 / 边框按 2 倍绘制、公式撇号与函数名间距、pt / px 字号混用等问题。
- 中文字体：用户选方案 A，打包 Noto Sans SC（`native/octos-learn/assets/fonts/`，`src/cjk_fonts.rs`）。

**2026-10-05 v6**：v5 暂停期间 web 有较大变化，本轮已合并两仓 main 并跟进（记录见 `OLL_MACOS_PRODUCT_V6.md`）。改动涉及：
- 停靠式控件面板、附件归属、回填列、短步骤叠放、思考题卡；
- 相机上限/parts、保持判断、Beat/Step 上下文；
- 课程包升版与 `hide_when_undefined`；
- 预览模式顶栏。

runtime fixture 与 web 全部 1e-6 一致；逐 Beat 对照的剩余偏差来自卡片尺寸和缺失的练习面板。**v6 已于 2026-10-05 推送**（OLL `9a86f8e`，octos-learn `490de05` + 本文档更新）。 建议下一项：练习任务面板。

**2026-09-28 暂停点**（历史）：用户要求在 v5 完成后暂停。

macOS 产品应用 **v5（白板排布与取景）已推送**（记录见 `OLL_MACOS_PRODUCT_V5.md`）：runtime 移植了 web 最新的阶段行×步骤列布局、安全视口相机与教学对焦策略，原生白板逐 Beat 与 web 对照，大部分 Beat 在 15px 以内；变量滑块改为世界坐标面板；"下一 Beat"可用。v4（启动器课程集，已推送，记录见 `OLL_MACOS_PRODUCT_V4.md`）：启动器改为与 web 一致的两层导航（课程集首页 → 课程集页），课程卡换成 web 新设计，有进度的课显示"继续学习"。**v3（scene3d）已推送**（`OLL_MACOS_PRODUCT_V3.md`）：九门预制课全部可打开并播放到底，其中三门 surface 课的三维场景支持拖动旋转、预设视角和滚轮缩放，并与滑块变量联动。v2 已推送：以 main 网页版真实截图为基准做过一轮像素级对齐；启动器 + 课程播放 + 手写 + 变量联动 + 进度保存/恢复可用。**这不是"界面功能与网页版完全一致"的终态**；差异与待办见 §5。

## 1. 分支与提交

当前安装 APK：干净 `bf83cf2ba838000bbba4b835b49647cb04cb5868`，`productDirty=false`；SHA-256 `5f058bd296944ad628e40f31d3039c33316311a51740d52a626e5f03176c3728`，设备 pull 一致。包名仍 `cc.pitun.learn.makepadtest`，默认缓存、perf / bisect 关闭。本轮报告、证据与工具已于2026-10-08经用户明确授权推送（ac4beac、3dba03a）；同分支不合并 / 不开 PR；OLL `d59b607`、Makepad `825dbb4` 不变。安装使用 `adb install --no-incremental -r`，本次原生包 firstInstallTime 保留。

2026-10-07 在 alan0x 本机准备测试环境：持久 `octos-learn` 经用户明确要求切换到本分支并拉取到 `bc9d240`；测试源码快照为 `bc9d240`，现已同步本地未提交的旁白修复，配套 OLL 从远端拉到 `d59b607`。其他持久仓库分支未切换，未推送或合并；未创建 PR。具体版本、启动入口与验证见 [本机测试环境](LOCAL_TEST_ENVIRONMENT_2026-10-07.md)。

| 仓库 | 分支 | HEAD | 远端 |
|---|---|---|---|
| `octos-learn` | `codex/macos-product-ui` | **最新产品基线 `bf83cf2` + 纹理缓存真机复测报告（ac4beac、3dba03a；2026-10-08已推送）**；**v7 已推送**（每块单独提交，详见 V7 §1–2 与 NATIVE_MACOS_PROGRESS.md）。**v6 已推送**：合并 main `5e7b331`（`499e0d5`）+ v6 原生改动与 V6 文档 `490de05`。此前截至 v5 文档全部已推送：v4 启动器 `0dee7c6`、合并 main `f006919`（`183838c`）、v5 原生排布/相机 `3ca18ba` 和 `fde93a7`，以及 V5 文档 | octos-org/octos-learn 同名分支 |
| `octos-lesson-language` | `codex/rust-runtime-product` | **v7 已推送**：练习 `ab2a0ca`、plot `8b3e132`、geometry `556f3ae`、旁白 `527fc6d`、目录 `bb158ad`、手写 `bf79296`、plot 探针 `30c1eff`。**v6 已推送**：合并 main `67d1476`（`8bcfe46`）+ v6 runtime 移植与 fixture `9a86f8e`。此前 `d4d5af1`（已推送）：teaching/camera/focus `962f9e1`、控件分组 `08e5a32`、Beat 步进 `d4d5af1`；此前 `b7d079f` 为 scene3d；基于 main `f2a1c65` | alan0x/octos-lesson-language 同名分支 |
| `~/Documents/projects/octoscript-makepad` | `fix/plot-zbias-band` | `87f0d59`（基于上游 main `b0628d0`） | fork alan0x/Octoscript-Makepad，**PR #35 待评审** |

两个仓库的持久路径：原机器在 `~/Documents/projects/`，新机器在 `~/Documents/projects/OctosLearn/`。新机器上的提交先落在工作区 clone，再用 `git pull --ff-only <工作区clone> <分支>` 同步回持久仓库。

用户指示：分支只推送不合并；PR 由用户自己跟进。GPT 时代的验证分支 `codex/macos-oll-validation`（v6 回归工具）与 `codex/rust-runtime-macos-validation` 仍在，不要删。

## 2. 工作区重建

2026-10-07 bf83cf2 缓存复测：主 / 独立构建checkout同步；`.local-dev/android-bf83cf2-cache/`保存APK、四组性能样本与触摸截图。使用完整非增量更新，firstInstallTime保留、资源cached=true；本机后端healthy、reverse50080有效。镜像版本目录同名。当前交互有首页拖动误导航和菜单外部触摸不关闭、条目触摸无响应，见最新报告。

2026-10-07 b6da998 诊断补充：主 / 独立构建 checkout 已同步，版本目录 `.local-dev/android-b6da998-bisect/` 保存 APK、截图和日志。首次完整安装启动出现约39s平台初始化停顿，空帧样本废弃；有效采样等至少三个 perf 窗口再导航。本机后端 healthy、reverse 50080 保持有效。

2026-10-07 surface 复测补充：主 checkout 与独立构建 checkout 已同步 `72e90eb` 和本轮编译适配；新 APK / 原始截图日志在 `.local-dev/android-72e90eb-retest/`。本机 Octos solo 后端重新启动于 127.0.0.1:50080，并恢复大屏 `adb reverse tcp:50080 tcp:50080`；测试后仍运行。

2026-10-07 alan0x 本机新增持久测试目录 `/Users/alan0x/Documents/projects/octos-learn/.local-dev/oll-product/`，含五个固定依赖 checkout 和本地后端源码快照；启动脚本在 `.local-dev/start-macos.command`，原生进度在 `.local-dev/app-data`。脚本直接启动包内可执行文件，避开本机 LaunchServices 在构建目录资源访问时的阻塞。构建、九课测试、后端与可见窗口均已验证，步骤见 [本机测试环境](LOCAL_TEST_ENVIRONMENT_2026-10-07.md)。下面保留历史机器的重建步骤。

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

- 测试：`cargo test --offline --locked --release --manifest-path <crate>/Cargo.toml`。基线（2026-10-06）：oll-runtime 45、oll-preview 17、octos-learn 4 全绿。
- web 一致性 fixture：`oll/crates/oll-runtime/tools/teaching-reference.ts`（esbuild 打包真实 web 模块）重新生成 `tests/fixtures/teaching-reference.json`。用法写在该文件头；需要 `NODE_PATH` 指向已安装依赖的 OLL 检出。**web 主机规则变了就要同步改生成器里的主机输入（附件尺寸、归属、readingScale），再重新生成。**
- 逐 Beat 对照 web 与原生：见 `OLL_MACOS_PRODUCT_V6.md` §3；最新脚本在 `macos-product-v7/beats/`（`web-beats.mjs` 支持 `WEB_H`，原生窗口被屏幕可见区域裁剪时让 Web 用相同高度），交互脚本在 `macos-product-v7/tasks/`。要点：
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

- 应用自身1080p surface与 bf83cf2 启动器缓存性能已真机验证，系统仍4K；首页 / 课程集gap约18ms，软件Draw节奏不等同已验证面板FPS。60 Hz Timer / 整板refresh仍保留，本轮未重测播放性能。
- **当前首页卡片起手拖动抬手误导航，两张卡片复现；历史053cfaf通过不代表新缓存版本通过。** 菜单触摸外部不关闭、条目触摸无响应，是否本次引入未确认。其余滚动后点击 / 预览 / 互动 / 菜单位置 / 惯性 / 返回后滚动通过ADB检查。主题色偏蓝另案交Claude，本轮保持现状。
- Android 紧凑首页、顶栏、手写工具、输入栏、老师头像与取景密度已实现；未宣称所有页面逐像素一致。窄屏、相机实画面、AI/ASR、Android 有声旁白仍需专项实测。

2026-10-07 本机反馈：旁白只读前几个字已修复，见 [音频修复记录](NARRATION_AUDIO_FIX_2026-10-07.md)。固定依赖无改动；接手时保留并同步当前本地未提交音频模块后再构建。真实 MP3 与连续片段已验证，服务端实时 TTS 的实际有声输出仍待验证。

2026-10-07 本地测试环境已准备，尚待用户功能测试反馈；本次机器未启动 ASR 服务，实际摄像头/麦克风与模型生成未实测。参见 [本机测试环境的测试范围](LOCAL_TEST_ENVIRONMENT_2026-10-07.md#测试范围)。

> 2026-10-06 起以 `OLL_MACOS_PRODUCT_V7.md` §4 和 `NATIVE_MACOS_PROGRESS.md` §6 为准。下面是历史条目，已完成的已在 V7 中实现：练习面板、思考题持久、目录、重播、橡皮/框选/持久化、旁白音频、卡片菜单、卡片 focused 描边。

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

- 只推送不合并；发 PR 前先问。2026-10-05 起用户授权：原生两条分支每完成一块就提交并推送，并更新根目录 `NATIVE_MACOS_PROGRESS.md`。git 提交可直接做在 codex/ 分支。
- 不切用户工作分支、不清用户工作区；持久仓库被其他会话占用（2026-10-05：octos-learn 在 `codex/android-native-ink-stroke-handoff`，OLL 在 `codex/native-ink-exclusion-smoothing`），不要切换——工作一律在 `.local-dev/oll-product` 工作区 clone 或自建 worktree。web 基准用工作区 clone 的 `git worktree add` 到临时目录构建。
- 原生课程包锁定（`native/octos-learn/course-packs.lock.json`）始终与 main 的 `android/embedded-course-packs.json` 快照保持一致（用户 2026-10-05 确认）；合并 main 时同步，并在交付记录里写明。
- 固定依赖版本不得擅自升级（runtime.json 组合）；WASM target 安装（rustup target add wasm32-unknown-unknown）**尚未获授权**。2026-10-07 用户明确授权在 `192.168.1.63` 安装独立原生性能测试包，要求保留 Web APK；本次安装已完成，具体身份与验证见 Android 性能测试记录。
- 不确定就问用户；历史文档中的性能数字（8ms/35MB/3-10x）均不作数。

## 7. 文件地图（本调研目录）

新机器上没有原调研目录。v3 起，构建产物和证据放在 `~/Documents/projects/OctosLearn/.local-dev/macos-product-v3/`、`macos-product-v4/`、`macos-product-v5/`、`macos-product-v6/`、`macos-product-v7/`（web-reference、native 截图、驱动脚本）。锁文件和 zbias 补丁已入库，见 `docs/makepad-migration/evidence/`。


`OLL_MACOS_PRODUCT_V7.md`（最新交付记录，功能补齐与界面对齐）→ `OLL_MACOS_PRODUCT_V6.md`（跟进 web 2026-10 改动）→ `OLL_MACOS_PRODUCT_V5.md`（白板排布与取景）→ `OLL_MACOS_PRODUCT_V4.md` → `OLL_MACOS_PRODUCT_V3.md` → `OLL_MACOS_PRODUCT_V2.md` → `OLL_MACOS_PRODUCT_V1.md` → `OLL_MACOS_PRODUCT_MIGRATION_CHECKLIST.md`（迁移清单+v1 状态）→ `OLL_RUNTIME_MAKEPAD_PLAN_REVIEW.md`（方案基线）→ `macos-product-v2/`（v2 .app+截图+web 基准）→ `macos-product-v1/`、`macos-validation-v1~v6/`（历史证据）→ `phase0-evidence/`（锁文件+zbias 补丁+构建日志）。
