# Android 大屏滑块测量 — 2026-10-10

## 给 Claude 的结论

已在皓丽 M3G2 大屏 WebView 上复测，包含“斜率是什么？”的真实 4 卡 / 64 条已保存 SVG path 白板、当前披萨课、余弦课、三维偏导数课，以及在斜率课上增加无关静态卡片的数量对照。**没有修改产品或 OLL 的实现。**

优先处理全白板更新和 React / 宿主组件工作。4 卡斜率课暖机后的 `BoardView.render` 中位数为 **70.7ms**，其中 `syncNodes` 为 **64.6ms**；关闭 V8 CPU profiler 后分别为 **51.4ms / 47.5ms**，完整交互的帧间隔 p90 仍为 **116.7ms**。Profiler 会显著增加这台设备的耗时，因此不能把带采样的数值直接当作日常触摸体验。

`structuredClone` 有随卡片数增加而增长的迹象，但仍不是主要瓶颈。保存路径也在拖动期间工作，可以优化，但当前采样没有证据支持把它排在全白板 / React 更新之前。

## 固定环境与方法

- 工作区已切到 `codex/webview-slider-profile`，HEAD `f88b875`，基线 `c795064`。
- 设备 `192.168.1.63:5555`，M3G2，Android 13，WebView **101.0.4951.61**；4 个 CPU part `0xd05`。
- 已安装 APK：`cc.pitun.learn`，0.1.2 / versionCode 33，revision **4c1b0c7**，builtAt `2026-10-10T16:07:02.944Z`，干净构建。与 `c795064` 的源码差异只有设置页版本显示及对应 Vite 定义；滑块、白板、React、存储实现相同。没有安装新 APK。
- 物理 3840×2160，CSS 960×540，DPR 4；density override 640。没有调整分辨率、图形采样精度或 CPU 降速，也没有启动 scrcpy。
- 使用 ADB 转发 WebView CDP，调用 `Input.dispatchTouchEvent`。采到的 input 均为 `isTrusted: true`，走页面实际的滑块事件、rAF 合并、Runtime、React、BoardView 和存储路径；没有直接调用 `setVariable` 代替拖动。
- 主测每组发送 90 步往返，20% → 80% → 20%；数量对照每组 60 步。实际 input 数少于步数，包含量化、输入合并等影响，以实际计数为准。
- CDP 每步完成后在主机等待 16ms；往返延迟也影响输入节奏。这是自动触摸路径测量，**不是人手连续拖动的稳定 FPS 或原生触摸屏硬件延迟验收**。帧间隔也包含步骤间的空隙及收尾。
- CPU sampling interval 200µs；同时记录 Chrome Performance counters、rAF、long tasks。带 `--instrument` 的组额外直接计时 BoardView 方法和 `IDBObjectStore.put`，计时桶存在包含关系。
- 采样在抬手后追加 750ms 收尾；这不保证所有排队的 IndexedDB 写入均已完成。IDB 计数和 CPU 只表示采样窗口内的工作，不能据此推算整次操作的全部磁盘成本。

完整环境见 [device.json](device.json)，汇总见 [metrics.json](metrics.json)。末段热状态记录为 Thermal Status 0、SoC 约 71.6°C，未记录逐组频率；不能用本轮结果拟合精确的线性复杂度。

## 真实白板结果

| 场景 | 实际渲染卡片 | input | render 中位数 | syncNodes 中位数 | 帧间隔 p90 | 最长帧间隔 |
|---|---:|---:|---:|---:|---:|---:|
| 斜率，首组采样 | 4 | 88 | 未加方法计时 | 未加方法计时 | 200.0ms | 1316.7ms |
| 斜率，暖机 + 方法计时 | 4 | 87 | 70.7ms | 64.6ms | 166.7ms | 533.3ms |
| 斜率，关闭 CPU profiler + 方法计时 | 4 | 87 | **51.4ms** | **47.5ms** | **116.7ms** | 233.3ms |
| 当前披萨课，采样时暂停状态 | 9 | 88 | 未加方法计时 | 未加方法计时 | 316.7ms | 633.3ms |
| 余弦，早期 Beat 暖机 | 2 | 86 | 96.9ms | 89.3ms | 233.3ms | 666.7ms |
| 余弦，推进到末尾后的历史合成白板 | 16 | 82 | **117.4ms** | **102.3ms** | **350.0ms** | 1833.3ms |
| 偏导数三维课，最终白板 | 9 | 83 | 47.6ms | 37.5ms | 200.0ms | 1433.3ms |

除明确标注“关闭 CPU profiler”的一组，均开启 CPU 采样。这里的“首组”只是本轮保存的第一份有效采样，不保证是应用启动后第一次触摸；不要据此宣称严格的冷启动对照。

斜率记录的已保存 SVG 有 64 条 path；加载后的 Ink editor 返回 66 个组件，两者口径不同。没有增加其笔迹。余弦记录含 1 条已保存笔迹，editor 计数为 3。卡片数量取 `.board-node` 实际 DOM 计数；余弦末尾为 geometry 1、plot 3、math 7、note 4、diagram 1，包含历史合成内容，**不是 Mac 基线的 8 卡单课**。因此这两组余弦数据不能当作只改变卡片数的控制实验。

斜率暖机组有 87 次 input、89 次白板 render，确认仍在频繁走整块白板的 render。该组有 **186 次 layout / 422 次 style recalc**，分别耗时 **1.454s / 2.753s**。

## CPU 调用栈，避免重复计算

生产 APK 的 JS 已压缩，不能按原始函数名直接套 Mac 的桶。已重建安装版本的 source map，并验证整个入口 JS 除等长的动态 import 文件哈希外完全一致：代码长度、行和列坐标均一致。只在本机重建 source map，没有换掉大屏执行的 bundle。[symbols.json](symbols.json) 保存符号映射及哈希证据；每组同时保留原始和还原后的 `.cpuprofile`。

斜率暖机组 active CPU **22.261s**，以下是互斥分类：

| 分类 | CPU | 占 active |
|---|---:|---:|
| BoardView.render，含内部调用 | 6.544s | 29.4% |
| React 栈及宿主工作，已扣除上项和存储 | 6.447s | 29.0% |
| `(program)` 原生 / 未归属 | 4.862s | 21.8% |
| Runtime 变量更新，含同步 persist | 1.293s | 5.8% |
| GC | 0.684s | 3.1% |
| 异步存储 / 文档 store | 0.148s | 0.7% |
| 其他 JS | 2.283s | 10.3% |

React 分类包含 `LearningWhiteboard`、`LearningWorkspace`、布局 / 附件测量等宿主工作，不能解释为 React 库自身的净成本。Inclusive 桶的 React 时间 **13.027s** 包含 BoardView，不可与 BoardView 的 **6.544s** 相加。

该组 `syncNodes` inclusive **5.896s**，`updatePlotExplorer` **2.187s**，persist/checkpoint **0.833s**，structuredClone self **0.374s（1.7%）**。布局 getter 采样桶仅约 **12ms**：**本轮不能复现或直接沿用 Mac “offsetWidth 强制布局是主要 JS 栈成本”的比例**。Chrome layout/style 的总体耗时确实很高，但没有采集完整 tracing 来逐次归因到某个尺寸读取。

源码确认 `syncNodes` 的 plot 不属于 `fixedVisualSize`，签名变化时仍会设置 `height=auto` 再读 `scrollHeight`；同时对全部节点写 class、同步 emphasis、调用 `setRect`。跳过固定尺寸图卡的测量和减少无关节点 DOM 写入仍值得做 A/B，不能把本轮所有 layout/style 都先归咎于这一个读取。

## 数量对照

在真实斜率课底层 player projection 中复制**无变量绑定的静态 note**，保留原 plot、变量、数学内容和笔迹。这样增加的卡片也经过 snapshot、persist、React 和 BoardView。它是临时构造的压力场景，不是正式多课 CoursePack；完成后已还原数据。

顺序：真实 4 卡基线 → 20 卡 → 36 卡 → 回到 4 卡。后三组均 60 步、58 次 input、开启同样的 profiler / 方法计时。

| 卡片数 | render 中位数 | syncNodes 中位数 | 帧间隔 p90 | React / host CPU 每 input | clone CPU 每 input |
|---|---:|---:|---:|---:|---:|
| 20 | 88.2ms | 73.7ms | 233.3ms | 95.6ms | 4.0ms |
| 36 | 90.4ms | 76.1ms | 266.7ms | 97.3ms | 5.6ms |
| 4，最后复测 | 64.2ms | 58.2ms | 150.0ms | 64.0ms | 3.0ms |

无关卡片增加后，render / React-host / clone 的开销确实增加，回到 4 卡又下降。20 → 36 卡的 render 增量很小，说明静态卡已有缓存收益；**不能宣称耗时按卡片数严格线性增长**。新增的是便宜的静态 note，也不能代表新增复杂 plot、几何或三维卡的成本。笔迹数量本轮没有做独立变量对照，不能给出“每条笔迹增加多少 ms”的结论。

## 建议 Claude 的下一步

1. 优先对变量依赖卡片做更新，减少 React snapshot / 宿主测量和全白板同步；同时保留尺寸真实变化时的完整重排回退。4 卡场景中 BoardView 与 React-host 合计约 58% active CPU。
2. 为 plot 固定尺寸路径做 A/B，减少 `height=auto` + 尺寸读取及无关节点的 class / rect / emphasis 写入。同步记录 layout/style counters，避免只看某个 JS 方法。
3. 拖动期间合并 / 延迟 checkpoint 与 IndexedDB 写入，commit 时可靠保存。继续保留学生操作日志、任务反馈和异常恢复契约。优化时补充“所有保存队列完成”的测量，本轮窗口只覆盖部分写入。
4. 以 **关闭 CPU profiler** 的触摸测试作为最终速度对照，以带 CPU profile 的组解释调用栈；不能用 Mac 4× 等同电视真实运行速度。

## 运行与文件

```sh
adb -s 192.168.1.63:5555 shell cat /proc/net/unix | rg webview_devtools_remote
adb -s 192.168.1.63:5555 forward tcp:9240 localabstract:webview_devtools_remote_<PID>

# 先等课程、字体和历史内容加载完成，暂停，并让目标滑块完整可见。
# 该工具会实际改变滑块值并写入学生操作记录；测原记录前需备份。
node scripts/profile-android-slider-drag.mjs --out <DIR> --label <NAME> --instrument
node scripts/profile-android-slider-drag.mjs --out <DIR> --label <NAME>-no-cpu --instrument --no-cpu

# 本目录所附原始 profile 可用已验证的符号表重新分析。
node scripts/symbolize-slider-profile.mjs docs/course-runtime-quality/webview-slider-profile-2026-10-10/android-tv
```

- `<NAME>.json`：场景、事件、帧间隔、长任务、Chrome counters、CPU 桶和方法原始计时。
- `<NAME>.cpuprofile`：未经改写的 V8 profile，可导入 DevTools。
- `<NAME>.symbolized.cpuprofile`：文件 / 行号还原后的 profile。
- [metrics.json](metrics.json)：便于后续脚本读取的汇总。
- [restoration.json](restoration.json)：还原证据。测前备份仅存于本机临时目录，权限 0600，未加入 Git；91 条 IndexedDB 文档和 264 项学习相关 localStorage 在重开应用前与备份哈希完全一致。原披萨记录、半径 10、暂停状态、镜头 `(-258.264, 76.6861, 0.448829)` 已恢复；无临时节点 / 探针。重新加载后完整历史合成白板显示 13 卡，不能把初次读取时尚未稳定的 7 卡当成持久化记录差异。

测量工具语法检查、定向 ESLint 和 diff whitespace 检查通过；本轮没有产品实现修改，未运行前端全量测试，也没有推送 / 部署。
