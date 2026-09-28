# 后续 Agent 接手入口（2026-09-27，Kimi 交接）

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

macOS 产品应用 **v2 已交付并推送到远端分支**：以 main 网页版真实截图为基准做过一轮像素级对齐；启动器 + 课程播放 + 手写 + 变量联动 + 进度保存/恢复可用，两门内置课（rectangle-area-from-tiles 0.1.5、slope-and-intercept 0.1.6）完整播放。**这不是"界面功能与网页版完全一致"的终态**；差异与待办见 §5。

## 1. 分支与提交（均已推送）

| 仓库 | 分支 | HEAD | 远端 |
|---|---|---|---|
| `~/Documents/projects/octos-learn` | `codex/macos-product-ui` | `173639f`（已对齐 main `e39adbb`，九门课发布版） | octos-org/octos-learn 同名分支 |
| `~/Documents/projects/octos-lesson-language` | `codex/rust-runtime-product` | `e4cfac6`（已对齐 main `f2a1c65`） | alan0x/octos-lesson-language 同名分支 |
| `~/Documents/projects/octoscript-makepad` | `fix/plot-zbias-band` | `87f0d59`（基于上游 main `b0628d0`） | fork alan0x/Octoscript-Makepad，**PR #35 待评审** |

用户指示：分支只推送不合并；PR 由用户自己跟进。GPT 时代的验证分支 `codex/macos-oll-validation`（v6 回归工具）与 `codex/rust-runtime-macos-validation` 仍在，不要删。

## 2. 工作区重建

当前工作区在 `/private/tmp/oll-product`（2026-09-27 重建，含合并后代码）。/private/tmp 会被系统定期清空，重建步骤如下（已实测可走通）。所有代码提交都在 §1 的持久分支里，证据与锁文件在本调研目录。重建工作区：

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
cp <调研目录>/phase0-evidence/Makepad.Cargo.lock makepad/Cargo.lock
cp <调研目录>/phase0-evidence/Cargo.lock octoscript-makepad/Cargo.lock
# zbias 修复（PR #35 合并前必须应用）
cd octoscript-makepad && git am <调研目录>/phase0-evidence/makepad-plot-zbias-band.patch && cd ..
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

- 测试：`cargo test --offline --locked --release --manifest-path <crate>/Cargo.toml`。基线：oll-runtime 25、oll-preview 15、octos-learn 3 全绿。
- 隐藏实例 + 远程驱动：`MAKEPAD_HIDE_WINDOWS=1 ./<binary> --remote`，日志出现 `listening on 127.0.0.1:PORT pid=N` 后，HTTP 端点 `/snap?q=<id>`（控件树）、`/click?x=&y=&wait=1`、`/m?k=down|move|up&x=&y=`（鼠标）、`/g`（截图 PNG 路径）、`/gq`（退出）。参考脚本模式：调研目录 GPT 时代 `macos-validation-v6/` 与 octos-learn 分支 `native/oll-preview/scripts/verify-*.py`。**注意：`/snap` 对动态插入的 widget 索引不可靠，UI 回归点击用截图坐标。**
- 视觉基准：`macos-product-v2/web-reference/`（main 生产构建 + Playwright，1440×900）。重新生成方法见 `OLL_MACOS_PRODUCT_V2.md` §1（**不能用 vite dev server 截图**：StrictMode 双调用 abort 首次内置目录请求，promise 缓存把 null 永久化，课程卡不渲染；用 `vite build && vite preview`）。

## 4. 关键结构与资产

- 产品 crate：`octos-learn/native/octos-learn/`（lib.rs 全部产品 UI；course_pack.rs 课程包加载；assets/icons/ 23 个 lucide SVG；assets/octos-avatar.svg 章鱼；scripts/package-macos.sh）。
- 复用组件：`octos-learn/native/oll-preview/`（spatial_board.rs 白板 widget：布局/相机/连线/笔迹/点阵/安全区取景；board_view.rs 卡片工厂：math/note/plot/geometry 卡+角标；formula_view.rs 公式混排；progress_store.rs 文件进度存储）。**v6 预览 app 是回归工具，改动这些共享文件后跑一遍它的测试。**
- Rust runtime：`oll/crates/oll-runtime/`（Session/Preview/spatial/connections/expression/timing/checkpoint/ink/api/wasm）。已支持 9 种 canonical op 全部；节点限 geometry/plot/math/note/text/diagram(sequence)。
- 九门课 runtime 覆盖（2026-09-27 实测，host_api 加载+全程播放）：linear 3 门 + trig 3 门完整播放到底；surface 3 门报 "Unsupported preview node kind"（scene3d 节点，3D 支持是下一里程碑）。
- 已交付两轮记录：`OLL_MACOS_PRODUCT_V1.md`（功能流程）、`OLL_MACOS_PRODUCT_V2.md`（像素对齐）。

## 5. 与网页版的剩余差异 / 待办（按用户关注排序）

1. **surface 三门课（3D）**：scene3d 节点未支持，是覆盖九门课的最大缺口。→ runtime 加 scene3d 节点 + 渲染层接 makepad-d3 charts_3d（注意：其 GPU 着色器 DrawSurface3D 无现成调用方，现成组件是 CPU 投影路径）。
2. **启动器课程集 UI**：main 已改为按课程集分组的两层导航（PR #29），产品启动器还是平铺 9 卡。→ 按新 main 基准重拍截图后对齐。
3. **卡片排布**：原生 spatial::layout 与 web 布局结果不完全一致；变量面板固定槽位（web 世界坐标锚定）。→ 布局引擎对照。
4. **字体**：web 用 Hanken Grotesk/Inter（仅拉丁 woff2）；makepad ttf_parser 只吃 ttf/otf。→ 构建期 woff2→ttf 预转（一次性工具）后接入。
5. **功能禁用项**（UI 上有占位，点击 toast 说明）：语音、摄像头、提问输入坞、本课目录、下一 Beat / 重播 Topic（需 runtime 加 Session::next_beat/restart_topic 与大纲结构暴露）、橡皮擦/框选/笔迹持久化（需 Ink 加 erase/select/持久化，对齐 web `oll.student-ink.svg` 格式）、旁白音频（包内 mp3 未接入；manifest narration.segments 有 beatId→文件+时长，可先做 durationMs 真实节奏）、登录/设置页、空白白板、网络课程目录。
6. **细节近似**：无真毛玻璃/阴影/markdown；滑块把手方形；探索/大图按钮纯视觉；PR #35 合并前构建依赖本地补丁。

## 6. 授权与边界（用户已确认的规矩）

- 只推送不合并；push/发 PR 前先问。git 提交可直接做在 codex/ 分支。
- 不切用户工作分支、不清用户工作区；octos-learn 持久仓库当前检出是用户的 `feat/typesafe-jev-admission-fast-gate`，OLL 是 main——工作一律在自建 worktree/临时目录。
- 固定依赖版本不得擅自升级（runtime.json 组合）；WASM target 安装（rustup target add wasm32-unknown-unknown）**尚未获授权**；Android 真机安装**未获授权**（设备 192.168.1.63，只开发打包）。
- 不确定就问用户；历史文档中的性能数字（8ms/35MB/3-10x）均不作数。

## 7. 文件地图（本调研目录）

`OLL_MACOS_PRODUCT_V2.md`（最新交付记录）→ `OLL_MACOS_PRODUCT_V1.md` → `OLL_MACOS_PRODUCT_MIGRATION_CHECKLIST.md`（迁移清单+v1 状态）→ `OLL_RUNTIME_MAKEPAD_PLAN_REVIEW.md`（方案基线）→ `macos-product-v2/`（v2 .app+截图+web 基准）→ `macos-product-v1/`、`macos-validation-v1~v6/`（历史证据）→ `phase0-evidence/`（锁文件+zbias 补丁+构建日志）。
