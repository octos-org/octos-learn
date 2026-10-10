# Android 滑块优化最终验证（2026-10-10）

## 改动与版本

拖动滑块时，图形重绘会触发卡片、控制条和整课镜头的重复几何读取，增加主线程布局工作。本次前端改动用稳定的交互内容 key、Runtime 的 layoutRevision 和真实 ResizeObserver 通知驱动测量；卡片内部 SVG/图例重绘不再触发全卡片几何扫描。旧 Runtime 没有 layoutRevision 时仍沿用原测量行为。

`package.json`、`pnpm-lock.yaml` 和 `learning-stack-bom.json` 均固定到 OLL `ba449c61e27d75222835525832606744fd3e4da9`。该 Runtime 包含 plot 尺寸复用、停止拖动 200ms 后校验尺寸、layoutRevision，以及持续拖动约每 400ms 保存 checkpoint 的 throttle。暂停后补存最终值，抬手 commit 立即保存。完整效果需要前端与此 Runtime 一起使用。

## 大屏结果

验证环境：Android 13，WebView 101.0.4951.61，物理 3840×2160、CSS 960×540、DPR 4。未调整分辨率、CPU 降速或图形精度。

两轮均采用关闭 CPU profiler 的 A1 → B1 → A2 → B2 对照，按相同课程阶段、卡片数、笔迹、初始值、镜头和可信触摸数值序列测量。每组 60 步来回拖动，步间等待 16ms，抬手后收尾 750ms。TaskDuration/input 是采样窗口主线程工作总量除以 input，包含收尾工作，不能作为单次触摸响应延迟；rAF p90 也包含 CDP 节奏。

第一轮：未优化版本 → learn `7c45018` + OLL `2083184`。

| 场景 | TaskDuration/input，ms，A → B | 改善 |
|---|---:|---:|
| 4 卡 / 64 笔迹斜率 | 193.7 → 160.3 | 17.2% |
| 16 卡历史合成余弦 | 304.3 → 254.1 | 16.5% |
| 9 卡三维偏导数 | 205.2 → 162.0 | 21.1% |
| 36 卡 / 64 笔迹合成压力 | 240.5 → 197.5 | 17.9% |

压力候选仅一组，其余场景每版两组；第一轮期间存档实现尚为 debounce。这一轮的数据不是最终 throttle 版本的直接基线比较。

第二轮：learn `7c45018` + OLL `2083184` → 最终 learn `f10db84` + OLL `ba449c6`。

| 场景 | TaskDuration/input，ms，A → B | 变化 | 帧间隔 p90，ms，A1/A2 → B1/B2 |
|---|---:|---:|---:|
| 4 卡 / 64 笔迹斜率 | 170.9 → 164.0 | -4.0% | 83.3/100.0 → 83.3/100.0 |
| 16 卡历史合成余弦 | 261.3 → 248.8 | -4.8% | 200.0/200.0 → 183.3/183.3 |
| 9 卡三维偏导数 | 156.5 → 160.4 | +2.5% | 66.7/66.7 → 66.7/66.7 |
| 36 卡 / 64 笔迹合成压力 | 201.5 → 203.4 | +1.0% | 133.3/133.3 → 133.3/133.3 |

第二轮每版每场景两组，方法包装计时仍开启且两版一致。压力场景通过增加静态 note 扩大白板，不代表复杂多课基准。轮间绝对数值有波动，不能叠加两轮百分比或声称最终版本相对最初版本的精确收益。

余弦单独 CPU 诊断中，renderedWorldRect self 从 3357ms 降至 416ms，但 active CPU 仅从 20.3s 降至 20.1s。几何 getter 的成本会转移到浏览器后续布局，恢复周期存档也增加了存储工作，因此函数 self 降幅不等于总耗时收益。大屏仍有卡顿，目前体验已获用户接受，本轮不继续扩大优化范围。

## 保存与布局验证

- 大屏同一次可信触摸持续 10.1s、67 次 input：期间 checkpoint 21 次，间隔中位 475.5ms、p90 550.1ms、最大 607.2ms。主线程阻塞会推迟 400ms 定时器；每次保存都对应当时最新值。
- 停住 600ms 后最终值补存，抬手 commit 立即另存；同步缓存、实际 IndexedDB 和页面重载后的值一致。64 条笔迹的 SVG 哈希重载前后相同。
- 独立确定性时钟：10.208s、638 次连续 update，期间保存 25 次，间隔精确 400ms。停住、commit 和新 Session 恢复断言通过。
- 强制 plot 图例换行，卡片高度 399 → 462 → 399px；延迟重测递增 layoutRevision，宿主 bounds 跟随变化，同尺寸下一次更新不递增。移除临时样式后位置与 SVG markup 恢复。
- 验证时 1,131 项 learn 单元测试、9 项浏览器回归通过，tracked TypeScript ESLint 无 error；生产 web 与 debug APK 构建通过。整课测试已修正为按钮仍启用时才推进 Beat，并保留结束、布局、笔迹及手动镜头断言。

## 复测工具

可复用脚本保留在 `scripts/`；原始 profile、临时场景、逐组数据和中间报告已从 PR 差异移除，并保留于本地 gitignored 归档。生成数据应放 `delivery/`。

```bash
# 桌面：使用已启动的生产模式课程服务，可用 --base 指定地址。
node scripts/profile-slider-drag.mjs --cpu 1,4 --out delivery/slider-profile

# Android：先将当前 WebView 调试 socket forward 到 9240，打开并暂停课程，确保滑块完整可见。
node scripts/profile-android-slider-drag.mjs --no-cpu --instrument --steps 60 --out delivery/android-slider-profile --label candidate
node scripts/check-android-slider-checkpoints.mjs delivery/android-slider-profile/checkpoints.json 10000

# 调度语义：使用仓库内固定变量 theta 的 canonical fixture。
node scripts/measure-slider-checkpoint-cadence.mjs src/learning/oll/fixtures/unit-circle-sine.canonical.jsonl delivery/slider-profile/checkpoint-cadence.json
```

Android 工具会通过真实 UI 改变滑块值和存档，复测应使用测试白板或预先备份设备数据。CPU profile 仅用于定位热点，速度对照应使用 `--no-cpu`；符号化工具需要与实际 bundle 匹配的 `symbols.json` 映射表。
