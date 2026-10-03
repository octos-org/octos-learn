# Android 三维旋转性能 — 2026-10-03

## 交付

在上一轮滑块优化基础上，专门优化三维图卡内旋转及滚轮缩放。已保留数据覆盖安装电视 `192.168.1.63:5555`，并重新打开应用。没有部署公网、推送代码或改变预制课程内容。

- APK：`delivery/android-orbit-performance/octos-learn-orbit-performance-20261003.apk`。
- SHA-256：`47e782b8eafd6dbc61e0c33d1159e44c7ebccd5e1edb2ea92d5a45fc3e497ada`。电视已安装包哈希完全一致；APK v2 签名通过，大小 107,349,073 字节。
- builtAt：`2026-10-03T15:05:59.218Z`；本地未提交工作区构建。
- 九门内置正式课的 `archive.ocpack` 与上阶段 APK 逐字节一致。采样密度、分辨率、显示配置、颜色及透明度未调整。
- 回滚：上一轮 `delivery/android-performance/octos-learn-slider-performance-final-20261003.apk`，使用 `adb install -r` 保留数据。
- 更新后重新进入“斜率是什么？”记录，4 张卡片、64 项笔迹、斜率 2、截距 0 及暂停完成状态与更新前一致。重新进入时镜头使用该记录的课程恢复取景，`(-594.58,55,0.577778)`，未保持安装前临时手动镜头；节点布局不在本轮修改范围。
- [安装和课程包核验](apk-verification.json)、[安装前状态](tv-before-install.json)、[恢复后状态](tv-restored.json)。

## 原因及实现

上一轮已让显式曲面的可视绘制读取缓存网格，并将静态物体、截面、强调层分开。纯截面滑块因此无需重绘曲面。但旋转会使所有面片的投影和深度改变，旧旋转路径仍清空各层、创建全部 SVG 图元；每个 pointermove/wheel 都立即重绘并同步通知 Runtime。还会重复求相机无关的截面交线和截面平面边界。

本轮改变：

1. **保留 SVG 图元**：相机变化时保留各层已有元素，按原来的深度排序结果更新对应槽位的投影坐标。深度排序及透明度的绘制顺序不变，多个盒子的面片目标 ID 也随槽位更新。物体、表达式变量、截面或强调结构改变时使相应层失效，正常重建。
2. **相机无关计算缓存**：保留截面交线、平面边界及网格。物体和相关变量改变时重新准备网格；截面改变时重新求交线。直接旋转期间不再序列化整个 objects 或重新查询网格缓存。Runtime 回传内容时仍比较内容键，以识别实际变化。
3. **投影计算简化**：一个视角只计算一次归一化及三角函数；显式/隐式曲面共享顶点投影，隐式三角形不再为排序和绘制各投影一次；fit 扫描跳过重复顶点。保持原有浮点运算顺序和 fit 行为。
4. **按帧合并输入**：pointermove 和 wheel 保留最近视角，每帧最多各更新一次。松手/取消捕获时同步绘制并提交最终值；缩放结束、预设和复位前正确关闭上一操作。保留 operation_id、输入方式和一次最终 commit。减少中间 update 数量，不丢最终值。
5. **生命周期与回传**：本地手势期间忽略迟到的旧相机回传，仍允许内容更新。节点删除、替换、清空白板或销毁时取消 rAF 和滚轮结束定时器，避免旧图卡继续发出操作。

源码在 OLL 的 `codex/slider-live-performance` 分支，修改 `packages/web-runtime/src/scene3d.ts` 和 `board-view.ts`。[本轮增量源码差异](oll-orbit-source.patch)。产品继续通过正式 pnpm patch 集成固定 `7009c4b...` 依赖；没有直接修改 node_modules。补丁附有对应 TypeScript 源码映射。上一轮 plot/布局改动保留。

## 电视测量

M3G2，Android 13、WebView 101，3840×2160、CSS 960×540、DPR 4。没有启动 scrcpy 或改变显示设置。基线是**已经包含上一轮滑块优化的版本**，不是更早的全量重绘版本。

在相同 WebView 中挂载临时独立曲面卡，`z=x²-y²`、samples=12、144 个四边形、一个截面。结束后移除，不改当前课程或学习记录。每组相机更新 40 次，按旧/新/旧/新交错顺序执行。耗时包含 controller.update 和 SVG 属性更新；rAF 间隔还受浏览器排版、绘制及系统负载影响。

| 顺序 | 更新 p50 | 更新 p95 | rAF 间隔 p50 |
|---|---:|---:|---:|
| 旧 A1 | 46.6 ms | 135.7 ms | 109.8 ms |
| 新 B1 | 22.3 ms | 36.1 ms | 57.4 ms |
| 旧 A2 | 38.0 ms | 109.2 ms | 103.8 ms |
| 新 B2 | 19.1 ms | 63.9 ms | 47.8 ms |

两轮更新耗时中位数减少约 **50–52%**。新版本保留全部 145 个 polygon（144 个曲面面片加截面），相机更新的 SVG 子节点新增/删除均为 0；旧版每组各新增/删除 6,357 个节点。[最终渲染原始数据](final-render-benchmark.json)；[第一轮候选对照](retained-svg-benchmark.json)。

另用合成 touch PointerEvent 测高频输入：每次 rAF 后连发 4 个移动，共 30 组、120 个移动事件；回调同步回传相机到 controller，模拟图卡回传，但不调用真实课程 Runtime/React、不写学生日志。

| 顺序 | 单组事件处理 p50 | rAF 间隔 p50 | 中间 update / 最终 commit |
|---|---:|---:|---:|
| 旧 A1 | 149.9 ms | 221.9 ms | 120 / 1 |
| 新 B1 | 1.2 ms | 72.8 ms | 29 / 1 |
| 旧 A2 | 137.1 ms | 206.7 ms | 120 / 1 |
| 新 B2 | 0.9 ms | 41.6 ms | 29 / 1 |

新版事件处理只安排刷新，实际绘制移入 rAF，所以不能将 1 ms 解释为绘制只需 1 ms。最后一组待刷新的值由 commit 同步完成，两版最终视角都为 yaw=1.44、pitch≈0.37、zoom=1。[输入合并原始数据](gesture-benchmark.json)。

这些是隔离渲染/合成事件实验，**不是完整预制课物理触屏 FPS 验收**；仍出现长帧，不承诺稳定 30/60 FPS。复杂隐式曲面、同时改变函数参数及多个可见三维卡片仍可能较重。

## 验证

- 前端 118 文件、1,118 项单元测试通过；7 项增量渲染 DOM 测试包括多事件合并、旧回传、最后值、图元保留、wheel → preset 的顺序、节点移除/销毁取消回调。
- OLL 339 项测试通过，真实 OLL 源码仓库构建通过。
- 8 项产品浏览器回归通过：滑块往返、真实浏览器指针旋转/滚轮/预设/复位及布局保持、Android 历史布局、预览缓存、笔迹/镜头和 smoke。测试涉及本地后端时采用既有测试替身，不代表公网生成服务验收。
- 独立前后版本对照 12 组状态通过：显式曲面、隐式曲面、盒子/球/圆锥/圆柱、多个实体排序、坐标轴开关、点/边/面标注、不同截面、表达式变量、俯视及 zoom .2/3。全部 SVG 属性和截图相同。测试期间曾因容器 CSS 优先级使截图发生在不同屏幕坐标，已修正容器重叠位置后完整通过；生产 CSS 没有为测试改动。
- lint 0 errors、35 项既有 warnings；新增测试定向 lint 无错误/警告。Web/Android、Gradle、签名、diff 检查通过。正式依赖渲染 JS 与已测试源码构建产物逐字节一致。
- 日志与对照工具位于 `delivery/android-orbit-performance/`；关键原始数据归档本目录。

## 是否更换 Canvas / WebGL

| 做法 | 本轮判断 |
|---|---|
| 保留 SVG，更新坐标 | 已实施、有电视对照收益；复用现有透明度、标签、教学目标及截图语义 |
| Canvas 2D | 可作为后续渲染后端实验，减少 SVG DOM 操作；仍需当前 CPU 投影和深度排序，不能假定换后稳定高帧率。需要重新核验高 DPR、缩放、线宽、文字、透明度、目标强调和截图 |
| WebGL | 电视可创建 WebGL 1.0，renderer=Mali-G52、最大纹理 4096；有硬件渲染基础。需要设计透明面排序、文字/线条叠层、教学目标拾取、上下文丢失和静态降级，属于专门渲染器迁移；本轮没有完成或声称测量其收益 |

[电视能力读取](tv-capabilities.json)。WebGL 使用硬件图形 API 的依据见 [MDN WebGL API](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API)；高 DPR 与资源预算的实现约束见 [WebGL best practices](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices)。Canvas 后续应按实际设备测量，并参考 [Canvas 优化建议](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Optimizing_canvas)。

本轮用已有技术栈消除了可确认的重复工作。若用户触屏验收仍不满足需求，再用同样的内容和相机序列验证 Canvas/WebGL 后端原型，依据整帧耗时、视觉一致性及内存开销决定是否迁移。


## PR 集成及人工验收

用户在电视上验证后确认“现在比之前好很多”。通用渲染优化已提交到 OLL：

- 分支：`codex/slider-live-performance`。
- 提交：`6bf5f9009f70eae0483d68d90b971b47ec1b3da6`。
- PR：[octos-lesson-language#20](https://github.com/alan0x/octos-lesson-language/pull/20)。

前端分支为 `codex/android-performance`。提交 PR 时将临时的 OLL 编译补丁替换为该源码提交的固定 Git 依赖；上文的补丁方式描述的是电视 APK 构建时状态。电视验收 APK 保持不变，正式依赖的 core、player、web 和 ink Runtime 共 52 个 JavaScript 模块与已验收源码构建逐字节一致，见 [依赖一致性核验](pr-runtime-parity.json)。随后复跑产品回归。该依赖版本可在 OLL PR 合并前按提交哈希安装；两个仓库分别审查，前端依赖 OLL 的这组源码改动。

PR 依赖切换后，118 文件 / 1,118 项前端单元测试通过，9 项 CI 浏览器用例无重试通过，lint 0 errors / 35 项既有 warnings，普通 Web、公网模式、Android 资源和 Gradle 构建通过。初次复跑发现 BOM 仍锁定旧 ref，已同步更新两项 Runtime ref；字体未就绪时的布局基线竞态通过等待 fonts.ready 和两次 rAF 修正。未改变渲染源码或电视安装包。见 [PR 验证汇总](pr-validation.json)。
