# Android 大屏滑块第二轮复测 — 2026-10-10

## 结论

已在同一台 M3G2 大屏复测 **learn f10db84 + OLL ba449c6** 的完整组合，Runtime pin、lockfile 和 release BOM 均已同步。此次 A 版是上一轮优化版 **learn 7c45018 + OLL 2083184**，不是最初未优化版；下面的百分比表示本轮额外变化。

400ms 存档已从 debounce 修正为 throttle。确定性时钟连续更新 10.208s 得到 25 次期间保存，间隔精确 400ms；真实大屏连续可信触摸 10.1s 得到 21 次期间 checkpoint，间隔中位 475.5ms、p90 550.1ms。每次都保存当时滑块最新值；停住、抬手 commit、IndexedDB 最终值、重载恢复和原 64 条笔迹均通过。

几何扫描的诊断 self 明显下降，但实际总耗时收益有限。关闭 CPU profiler 的 A1 → B1 → A2 → B2 对照如下；三维场景的略慢也如实保留。仅两轮，不能把小幅波动当成稳定的性能预算，也不能宣布大屏已经流畅。

| 场景 | TaskDuration / input，ms，A → B | 相对变化 | 各组 render 中位数的均值，ms，A → B |
|---|---:|---:|---:|
| 4 卡 / 64 笔迹斜率 | 170.9 → 164.0 | -4.0% | 25.5 → 24.8 |
| 16 卡历史合成余弦 | 261.3 → 248.8 | -4.8% | 45.5 → 44.3 |
| 9 卡三维偏导数 | 156.5 → 160.4 | +2.5% | 27.9 → 27.6 |
| 36 卡 / 64 笔迹合成压力 | 201.5 → 203.4 | +1.0% | 36.0 → 37.0 |

| 场景 | A1 / A2 帧间隔 p90，ms | B1 / B2 帧间隔 p90，ms |
|---|---:|---:|
| 4 卡 / 64 笔迹斜率 | 83.3 / 100.0 | 83.3 / 100.0 |
| 16 卡历史合成余弦 | 200.0 / 200.0 | 183.3 / 183.3 |
| 9 卡三维偏导数 | 66.7 / 66.7 | 66.7 / 66.7 |
| 36 卡 / 64 笔迹合成压力 | 133.3 / 133.3 | 133.3 / 133.3 |

## 版本与方法

- 分支：codex/webview-slider-drag-fast-path；候选 APK 源码 HEAD f10db84a4b711335bcf10a195afbbbe7bd80a97c，精确 Runtime ba449c61e27d75222835525832606744fd3e4da9。没有只用旧 Runtime 测前端变化，也没有合并 OLL/main。BOM reviewed_main_ref 保持原 main。
- A APK 是上轮已验证的 candidate-2083184.apk，入口 SHA256 b70dd2edfdf162d1c64f137027a0f3067d3e32308f7badc8edc7e2ac7bf342c6；B APK 入口 SHA256 ed6785fc751d1c1ed1dfb081eccadc6f63e8ec192a1805b784553078e655b50b。B 的 dirty:true 来自 pin/BOM/测量文件，builtAt 2026-10-10T18:06:44.626Z。完整 APK/入口哈希与 build-info 见 [device.json](android-tv/device.json)。
- Android 13、WebView 101.0.4951.61；物理 3840×2160、CSS 960×540、DPR 4、density override 640。无 CPU 降速、分辨率或精度调整。
- 换版用 adb install -r。每轮开始恢复同一份本次新备份的学习数据库和学习端 localStorage；没有使用上午旧备份覆盖用户之后的体验操作。
- 每个场景每版两组，60 步可信 CDP touch，20% → 80% → 20%，每步 CDP 返回后等 16ms，抬手后收尾 750ms；使用 scripts/profile-android-slider-drag.mjs --instrument --no-cpu。CPU 采样完全关闭；方法包装计时和 IDB.put 包装仍开启，两版相同。
- 斜率真实记录 4 卡、64 条保存的 SVG path、editor 66 组件；余弦末尾历史合成白板 16 卡、1 条 path、editor 3 组件；偏导数末尾 9 卡、无笔迹。压力场景在斜率 player projection 加 32 张无绑定的静态 note，保留原 64 条笔迹，覆盖 snapshot、React、BoardView、存档；它不是正式多课压力基准。
- [scene-verification.json](android-tv/scene-verification.json) 验证四轮卡片、笔迹、viewport、初始值一致，镜头和 slider box 差 <0.001；逐条 input 数值序列完全一致，全部事件可信。
- TaskDuration/input 是采样窗口主线程工作总量除以 input，包含宿主/后台及收尾工作，不是硬件触摸响应时间。rAF p90 包含 CDP 节奏与收尾，不等价于人手持续触摸 FPS。两轮均值不能提供统计显著性。
- B1/A2/B2 安装后 SoC 温度分别约 67.2 / 69.1 / 67.4°C，Thermal Status 0，CPU/GPU cooling state 0。A1 未额外抓热状态；未控制 CPU 每帧频率。完整热状态保留在 device.json。

## 逐组关闭 profiler 数据

| 样本 | input | Task ms/input | 帧 p90 ms | layout 次数 | style recalc 次数 | IDB.put |
|---|---:|---:|---:|---:|---:|---:|
| A1-slope-no-cpu | 58 | 167.8 | 83.3 | 87 | 265 | 2 |
| A1-cosine-no-cpu | 55 | 260.0 | 200.0 | 117 | 239 | 52 |
| A1-surface-no-cpu | 56 | 156.9 | 66.7 | 119 | 292 | 5 |
| A1-stress36-no-cpu | 58 | 202.2 | 133.3 | 75 | 235 | 2 |
| B1-slope-no-cpu | 58 | 164.8 | 83.3 | 78 | 260 | 19 |
| B1-cosine-no-cpu | 55 | 245.7 | 183.3 | 107 | 220 | 51 |
| B1-surface-no-cpu | 56 | 162.5 | 66.7 | 113 | 297 | 26 |
| B1-stress36-no-cpu | 58 | 199.3 | 133.3 | 70 | 226 | 21 |
| A2-slope-no-cpu | 58 | 173.9 | 100.0 | 83 | 256 | 2 |
| A2-cosine-no-cpu | 55 | 262.7 | 200.0 | 117 | 239 | 56 |
| A2-surface-no-cpu | 56 | 156.1 | 66.7 | 127 | 315 | 6 |
| A2-stress36-no-cpu | 58 | 200.8 | 133.3 | 72 | 233 | 2 |
| B2-slope-no-cpu | 58 | 163.3 | 100.0 | 77 | 249 | 19 |
| B2-cosine-no-cpu | 55 | 252.0 | 183.3 | 110 | 232 | 45 |
| B2-surface-no-cpu | 56 | 158.3 | 66.7 | 120 | 290 | 26 |
| B2-stress36-no-cpu | 58 | 207.6 | 133.3 | 75 | 243 | 19 |

[metrics.json](android-tv/metrics.json) 还包含 script/input、syncNodes、第二个 rAF 等统计。上述汇总为各组统计量的算术均值；render 列不是把所有调用混在一起计算的总体中位数。IDB.put 也包括操作记录、Beat 推进队列等，不能用这列代替 full checkpoint 周期。

## CPU 诊断与剩余热点

单独抓余弦 A1/B2 的 200µs CPU profile，仅用于定位，未混入上面的性能汇总。原始与符号化 profile 都保留。候选 source map 对应 bundle 与 APK 逐字节相同，基线使用上轮已验证的同一入口 mapping；map 仅在本机生成，未装进大屏。见 [symbols.json](android-tv/symbols.json) 和 [remaining-hotspots.json](android-tv/remaining-hotspots.json)。

renderedWorldRect self 3357.3 → 415.8ms，占 active CPU 16.5% → 2.1%。active CPU 20.3 → 20.1s。它的 self 降幅不是净收益：原本在 getter 中触发的布局可以转移到浏览器之后的布局阶段。

两项修复一起测量，不能从这个 A/B 单独分配各项净收益。恢复周期 checkpoint 也恢复了相应的存储工作：余弦采样中的 persist/checkpoint inclusive 100 → 650ms，异步文档 store 21 → 376ms；这些 inclusive 数字不应与下面互斥桶重复相加。此处增加工作量符合周期存档契约，不能再用停止期间存档来换取更低耗时。

下面是互斥桶，可相加；详细文件中的 inclusive buckets 不可相加：

| 分类 | A1 | B2 |
|---|---:|---:|
| Browser native / unattributed | 4.1s | 6.5s |
| Other JavaScript | 4.1s | 1.3s |
| React and host work (excluding BoardView / storage) | 6.0s | 5.6s |
| Runtime variable update (including sync persist) | 0.6s | 0.7s |
| Async storage / document store | 0.0s | 0.4s |
| BoardView.render | 5.1s | 5.2s |
| GC | 0.4s | 0.4s |

本轮几何 getter 已不再是同等规模的热点。仍有 BoardView / plot 重绘、React/host 和浏览器布局样式工作；这是单场景采样，不能据此把所有 native 时间归因于 SVG。Claude 提议复用动态曲线元素、仅更新 d 值值得下一轮 A/B 验证，仍需保持静态层、标签/图例变化、尺寸重排和恢复一致，并继续看关闭 profiler 的总耗时。全白板 React 更新也仍需关注。structuredClone 不应仅凭直觉列为首要项。

## 持续存档与重载

新增 scripts/check-android-slider-checkpoints.mjs，在真实产品 UI 上保持同一次 touch 手势超过 10 秒，包装实际 Session.store.save，只计完整 checkpoint，不把操作日志当 checkpoint。

- 67 次可信 input；最大 input 间隔 270.9ms。期间保存 21 次，checkpoint 间隔中位 475.5ms、p90 550.1ms、最大 607.2ms。大屏定时器受主线程阻塞影响，不保证墙钟每 400.0ms 准点。
- 所有期间 checkpoint 的值与保存时 slider.value 一致。停住 600ms 后存档为 -0.8；抬手 commit 另有立即保存；最终值 -0.8 在同步缓存和实际 IndexedDB 均一致。
- Page.reload 后 runtime 值和 slider 值均恢复；64 条保存 path 的完整 SVG SHA256 不变。
- 独立 Node 确定性时钟测试已升级为 10.208s 连续 update，并断言期间 24–26 次保存、间隔 400ms、每次值保持最新、pause 最终值、commit 与新 Session 恢复。它隔离调度语义，不能替代大屏真实触摸结果。

原始数据：[TV checkpoint](android-tv/checkpoint-cadence-tv.json)、[重载](android-tv/reload-check.json)、[确定性时钟](checkpoint-cadence.json)。复现需先备份设备学习数据，并打开暂停且滑块完整可见的课程：

```bash
node scripts/check-android-slider-checkpoints.mjs <output.json> 10000
node scripts/measure-slider-checkpoint-cadence.mjs <unit-circle.canonical.jsonl> <output.json>
```

## 异步重排与检查结果

强制 plot 图例宽 80px，plot 高度 399 → 462 → 399px。延迟重测会递增 layoutRevision，同尺寸下一次更新不递增；learn 的实际 host bounds 跟随新卡片位置和高度。移除 CSS 后布局恢复，plot node / SVG 根保留，最终 SVG markup 与原始完全相同。收窄 MutationObserver 后没有丢失本次真实尺寸变化通知。见 [layout-check.json](android-tv/layout-check.json)、[functional-verification.json](android-tv/functional-verification.json)。

验证：1,131 项 learn 单元测试通过；两项滑块渲染测试、三项完成字幕镜头测试、四项整课布局/手写测试通过；tracked TypeScript ESLint 0 error、36 个既有 warning；生产 web、Android/debug APK 构建通过。

原整课布局用例有一次可复现的超时：马鞍面课程结束后，硬编码次数继续点击已禁用的下一 Beat，失败在推进循环，尚未进入布局断言。tests/course-overview.spec.ts 改为按钮启用时才继续，并断言完成后禁用；保留全部原布局、视口、手写和手动镜头断言，四项重跑通过。此次只修测试推进，没有额外修改产品渲染逻辑。

最后已恢复本次备份的 91 条数据库记录、264 个学习端 localStorage 键，写回比较哈希完全一致；测试临时 32 张卡和 probe 已清理。大屏保留完整新版 APK，并回到用户开始本轮时的“披萨尺寸与面积比例：为什么直径差一点，面积差很多？”课程、原半径 14.65 和原视角，可以继续体验。原用户记录/笔迹未写入 Git，备份仅在本机私有临时文件中。没有部署公网。
