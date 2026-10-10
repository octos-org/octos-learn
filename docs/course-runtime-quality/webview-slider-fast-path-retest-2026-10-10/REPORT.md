# Android 大屏滑块第一轮优化复测 — 2026-10-10

## 给 Claude 的结论

已在同一台 M3G2 大屏测到 **learn `7c45018` + OLL `2083184` 的完整组合**。本分支已同步 `package.json`、lockfile 和 release BOM 的 OLL Runtime pin，没有仅用旧 pin 测 learn 的变化，也没有合并 OLL 分支。

第一轮优化有效，但还没有解决大屏上的全部卡顿。关闭 CPU profiler，按 A1 → B1 → A2 → B2 交错复测后，三个真实场景的 `TaskDuration / input` 改善 **16%–21%**；4 卡 / 64 笔迹斜率场景的白板 render 中位数约减半。36 卡压力场景也有收益。下一步优先检查全卡片几何观察器：候选版余弦场景 `renderedWorldRect` self **3.466s，约 16.9% active CPU**，其中 **3.351s** 来自 MutationObserver / ResizeObserver 的全卡片扫描路径。

发现一个保存语义问题：**当前实现是连续更新时不断延后的 debounce，并非持续拖动期间每 400ms checkpoint**。电视连续更新约 8.17s 只在开头保存一次；停住补写、commit 立即保存、IndexedDB 最终值和重载恢复均通过。应补一个超过 2 秒的持续拖动测试，并决定是否修正周期存档契约。

## 实际装载的版本与环境

- learn 分支：`codex/webview-slider-drag-fast-path`，测量源码 HEAD `7c4501877ade6bf95c6a55080166d970ad9fd578`。
- 候选 Runtime：`20831848627b7e20b944e03ce2e6dc4fcd134054`，来自 OLL `codex/slider-drag-fast-path`。通过正常精确依赖安装生成 dist，没有手改 node_modules。BOM 的 `reviewed_main_ref` 仍指向原 main，不将未合并分支标记为已审核 main。
- 候选 APK builtAt `2026-10-10T17:26:21.255Z`，build-info 的 `dirty: true` 来自本轮 pin/BOM/测量材料。实际打包的入口 JS 包含 `layoutRevision`、`plotsAwaitingRemeasure`、`persistDuringDrag`；TV 上确实观察到 layoutRevision、延迟重测和节流后的存档行为。
- A 版为从设备提取的原安装 APK，revision `4c1b0c7`，Runtime `67d1476`。与 Claude 的 learn 基线 `c795064` 的源码差异仅为设置页版本显示及相应 Vite 定义；白板、滑块、React 和存储实现相同。
- M3G2，Android 13，WebView **101.0.4951.61**，物理 3840×2160、CSS 960×540、DPR 4，density override 640。未调整分辨率、CPU 降速或画图精度。
- 原生包 `cc.pitun.learn`，以 `adb install -r` 交错换版，保留数据；每轮安装前恢复同一份课程数据库和学习端 localStorage。CoursePack snapshot 和 embedded lock hash 相同。
- A2 前 Thermal Status 0，SoC 63.6°C；B2 前 Thermal Status 0，SoC 63.4°C，CPU/GPU cooling state 均 0。仍未控制每帧 CPU 频率，结果不是严格的实验室性能预算。

APK 哈希、打包特征及完整热状态见 [device.json](android-tv/device.json)。候选 APK 在本机 `delivery/slider-fast-path/candidate-2083184.apk`，原 APK 备份为 `delivery/slider-fast-path/baseline-installed.apk`，两者不进 Git。

## 方法与对照范围

沿用 `scripts/profile-android-slider-drag.mjs`，通过 WebView CDP 发送真实可信触摸事件，走产品滑块、rAF、Runtime、React、BoardView、IndexedDB 路径。每组 60 步，20% → 80% → 20%，每步 CDP 返回后主机等待 16ms，抬手后追加 750ms。实际 input 数由量化和事件合并决定。

速度比较只用 `--no-cpu --instrument`。`TaskDuration / input` 是采样窗口内主线程工作总量除以实际 input，包含后台/宿主工作和收尾，**不是单次输入响应延迟**。rAF p90 包含 CDP 节奏与收尾，不能当成人手持续触摸的 FPS。第二个 rAF 的等待也只是渲染延迟代理。CPU profiler 的 200µs 采样会显著增加电视开销，带采样数据仅用于定位热点。

三个真实场景各两轮 A/B，课程阶段、卡片数、笔迹、初始滑块值、镜头和滑块屏幕尺寸对齐：

- 斜率：真实历史记录，4 卡（note 1、plot 1、math 2），64 条保存的 SVG path，editor 66 个组件，每组 59 input。
- 余弦：推进到末尾的历史合成白板，16 卡（geometry 1、plot 3、math 7、note 4、diagram 1），1 条保存的 path，editor 3 个组件，每组 55 input。它不是 Mac 的单课小白板。
- 偏导数：课程末尾，9 卡、0 笔迹，每组 56 input。
- 压力场景：在斜率底层 player projection 复制 32 张无变量绑定的静态 note，共 36 卡，仍为原 64 条笔迹。它经过 snapshot、React、BoardView 和存档，但不代表正式的多课或复杂卡片课。严格比较用 A1/A2 两组和 B2 一组，均初始值 −3.2、58 input。

`B0-loaded-stress36-*` 是换版后恢复了已持久化压力节点的探索样本；`B1-stress36-after-layout-no-cpu` 初始值为图例验证后的 1.45、59 input。这些保留诊断记录，**不纳入严格对照汇总**。每组原始 JSON 保留场景，避免误把压力白板标为 4 卡。

汇总前已核对：严格对照中卡片/笔迹/viewport/初值一致，镜头坐标差小于 0.001，所有 input 均可信，**逐条 input 的数值序列也完全一致**。

## 无 CPU profiler 的结果

下表的耗时为每组统计量的算术均值：render 列为“各组方法中位数的均值”，没有将它误称为所有调用的总体中位数。压力候选只有一组，收益的置信程度低于前三个场景。

| 场景 | 主线程 ms / input，A → B | 改善 | render ms，A → B | syncNodes ms，A → B |
|---|---:|---:|---:|---:|
| 4 卡 / 64 笔迹斜率 | 193.7 → 160.3 | 17.2% | 49.1 → 23.4 | 42.4 → 18.5 |
| 16 卡历史合成余弦 | 304.3 → 254.1 | 16.5% | 79.7 → 44.8 | 68.1 → 33.9 |
| 9 卡三维偏导数 | 205.2 → 162.0 | 21.1% | 31.1 → 28.0 | 25.1 → 22.7 |
| 36 卡 / 64 笔迹，合成压力 | 240.5 → 197.5 | 17.9% | 63.8 → 37.8 | 50.1 → 25.9 |

| 场景 | A1 / A2 帧间隔 p90 | B1 / B2 帧间隔 p90 |
|---|---:|---:|
| 斜率 | 116.7 / 83.3ms | 83.3 / 66.7ms |
| 余弦 | 266.7 / 216.7ms | 200.0 / 200.0ms |
| 偏导数 | 166.7 / 83.3ms | 66.7 / 66.7ms |
| 36 卡压力 | 200.0 / 150.0ms | B2 133.3ms |

旧版热身后的 A2 已明显快于 A1，因此只引用 A1→B1 的 22%–32% 会夸大稳定收益。候选版余弦仍有 200ms p90，偏导数仍有约 400–450ms 最长帧间隔；本轮不判定为“已经流畅”。

斜率 layout 次数 A1/A2 **142/152 → 99/114**；余弦 **156/166 → 110/111**；偏导数 **96/109 → 125/124**。偏导数计数增加但 layout 总时间降低；次数不能替代总耗时，更不能把所有布局都归因到某一个 getter。

斜率采样窗口中的 IDB.put **60/62 → 5/5**，偏导数 **159/59 → 6/7**。余弦为 **37/64 → 51/51**，没有呈现同样的减少。推进大量 Beat 会排队保存，750ms 收尾不保证清空历史队列，IDB.put 也包含 checkpoint 之外的记录；因此不从这些窗口计数推断“全部 IndexedDB 成本消失”。下文的定向存档验证区分了 checkpoint 调用和实际落库。

完整逐组数据和计算口径见 [metrics.json](android-tv/metrics.json)，每组同名 JSON 保留事件、帧、方法计时和 Chrome counters。

## CPU profile 与下一轮热点

原始压缩 `.cpuprofile` 和符号化版本均保留。[symbols.json](android-tv/symbols.json) 包含坐标/哈希验证：候选 APK 入口与本地 hidden-sourcemap 构建 **逐字节相同**；基线 APK 入口 SHA 与上轮验证文件相同，使用已验证的等长 import hash 重建映射。source map 只生成在本机，没有装入电视。

斜率两组均 58 input，active CPU **17.173s → 14.238s（−17.1%）**。下面是互斥桶，不与 inclusive 桶重复相加：

| 分类 | A1 | B1 |
|---|---:|---:|
| BoardView.render，含内部调用 | 4.694s | 2.453s |
| React / host，扣除 BoardView 和存储 | 4.568s | 4.297s |
| 浏览器原生 / 未归属 | 4.792s | 3.924s |
| Runtime 变量更新，含同步 persist | 0.776s | 0.307s |
| 异步文档 store | 0.148s | 0.007s |
| GC | 0.484s | 0.318s |
| 其他 JS，含几何观察器 | 1.711s | 2.932s |

`syncNodes` self **2.459s → 0.380s（−84.5%）**，persist/checkpoint inclusive **484ms → 28ms**，structuredClone self **293ms → 177ms**，候选约占 active 1.2%。优化削掉了原来最大的 syncNodes 单项，但全白板更新仍频繁发生。

剩余最突出的单项是 learn 的 `renderedWorldRect`，斜率 self **2.291s（16.1%）**，余弦 **3.466s（16.9%）**。父栈指向 `src/learning/oll/oll-lesson-runtime.tsx` 的 **3222–3226**：DOM geometry observer 的 rAF 回调查询所有卡片及 dock，然后逐个读取 style / 必要时 offsetWidth、offsetHeight。余弦 3.351s、斜率 2.235s 来自这条父栈，详见 [remaining-hotspots.json](android-tv/remaining-hotspots.json)。

基线这项 self 仅 255ms；候选出现成本转移，不能仅按 self 数字就断言新增了同等净成本或全部都是强制布局。源码和父栈支持的推断是：新增的 layoutRevision 跳过了主 render effect 的测量，但另一个 MutationObserver 仍观察整个 subtree 的 childList/style，plot 原位重绘会更换图例等子节点，继续触发全卡片几何扫描。是否有强制布局，需要 tracing/定向尺寸读取计时进一步拆分。

建议下一轮顺序：

1. 按几何是否变化收窄这个 observer 的刷新范围，用布局 revision 和真正的 dock resize 驱动几何读取；保留异步图例尺寸变化的通知。不要直接删除 observer，本轮延迟重排后的 host 同步依赖这类通知。
2. 继续收窄变量更新导致的 React / host 更新，减少无关卡片的 DOM 写入和 snapshot 工作。候选余弦 BoardView 仍 5.300s、React/host 6.017s active CPU，二者不能与 inclusive React 桶重复相加。
3. 明确并修正持续拖动的 400ms 存档契约。structuredClone 目前仍不适合排在上述路径之前。

## 保存与布局行为验证

### 存档：边界正确，持续周期不符合描述

[checkpoint-cadence-tv.json](android-tv/checkpoint-cadence-tv.json) 在实际 TV Session 上独立直接发送 60 次变量 update，用于隔离保存语义，不混入触摸性能比较：

- 请求间隔 50ms，受渲染工作影响实际持续 **8.171s**。
- 期间 checkpoint 仅一次：**6.8ms，值 1**；不是每 400ms 保存最新值。
- 停住后 **8.402s** 补写最后值 **1.59**。
- commit **8.731s** 写入值 **2**，同步 playback cache 和实际 IndexedDB 最终值均为 2，学生 gesture 正确完成。
- [reload-check.json](android-tv/reload-check.json)：页面重载后 Runtime 和滑块均为 2；64 条 SVG path 哈希前后一致，editor 仍 66 个组件。

[checkpoint-cadence.json](checkpoint-cadence.json) 用安装的同一 OLL Session 和 Node mock Date/setTimeout 重现：16ms update 连续 3008ms，期间没有保存；停住后保存 1.88，commit 2.5 立即保存并正确恢复。此例拖动紧接初始 checkpoint，因此连开头一次都被 debounce 延后。

原因位于 Runtime `persistDuringDrag`：只在 **timer 未存在**且距上次保存≥400ms 时立即 persist；后续每次 update 都 clearTimeout 并重新设 400ms timer。一旦 timer 存在，连续输入会不断推迟它。上游 20 帧 / 320ms 的新增测试验证了“少写”和“停住/commit”，无法证明持续每 400ms 写一次。

### 图例换行与真实 host bounds：通过

可复现脚本 `scripts/check-android-slider-layout.mjs` 在暂停的斜率课临时将图例宽度限制到 80px，真实产生换行，然后恢复样式和原滑块值。它通过 Session 驱动变量，这组用于尺寸正确性，不用于速度结论。

- 更新期间保持原 plot 399px，layoutRevision 不变；图例自身从 21px 换行到 84px。
- 停住等待后 plot 正确变为 **462px**，revision 递增，host 实际 node bounds 与 view 布局坐标/高度一致。
- 恢复图例后回到 **399px**，再次递增 revision，后续 idle 和 host bounds 均正确。
- plot 卡与 SVG 元素原位保留；恢复原值后 **整个 plot SVG markup 精确相同**。

证据：[deferred-layout-final.json](android-tv/deferred-layout-final.json)、[validation.json](validation.json)。旧的探索检查也保留为 `deferred-layout.json`。不将等待 550ms 后确认正确解释为“每次重测严格在 200ms 完成”；TV 主线程可延后定时器。

## 验证、复现与收尾

- 单元测试首轮 1,130 项通过，唯一 BOM/pin 一致性失败已同步清单并单独复测通过，共覆盖 1,131 项。
- 全部 tracked TypeScript 源文件 ESLint：0 errors、36 warnings；修改的 learn 文件直接检查为 0 errors、4 warnings。目录式 lint 长时间遍历后改用 tracked 文件列表。
- 生产 web build、Android debug APK build 成功。
- `tests/slider-rendering.spec.ts` 两项通过：2D/3D 曲线变化与静态层/原图恢复，以及 3D 旋转、滚轮、预设和复位。
- 诊断脚本通过 Node 语法检查，布局检查已在 TV 实跑，定向存档脚本在真实安装的 OLL Session 上运行。

复现命令：

```sh
adb -s 192.168.1.63:5555 shell cat /proc/net/unix | rg webview_devtools_remote
adb -s 192.168.1.63:5555 forward tcp:9240 localabstract:webview_devtools_remote_<PID>

# 暂停目标课程，等待字体/历史内容加载，并对齐镜头。会实际改变值与学生日志，先备份。
node scripts/profile-android-slider-drag.mjs --out <DIR> --label <NAME> --steps 60 --instrument --no-cpu
node scripts/profile-android-slider-drag.mjs --out <DIR> --label <NAME>-cpu --steps 60 --instrument

# 对本报告附带的 profile 重跑已验证符号表。
node scripts/symbolize-slider-profile.mjs docs/course-runtime-quality/webview-slider-fast-path-retest-2026-10-10/android-tv

# 暂停真实斜率课；脚本恢复样式和原值，但会生成学生操作记录。
node scripts/check-android-slider-layout.mjs <output.json>

# 从 OLL 2083184 导出已有 fixture；不必切换 OLL 工作区。
git -C ../octos-lesson-language show 2083184:examples/unit-circle-sine/lesson.canonical.jsonl > /tmp/unit-circle.canonical.jsonl
node scripts/measure-slider-checkpoint-cadence.mjs /tmp/unit-circle.canonical.jsonl <output.json>
```

测试结束保留候选 APK。原 **91 条数据库记录、264 个学习端 localStorage key** 已在 app 卸载页面时逐条恢复，规范化 SHA 前后一致；恢复完成后回到原披萨课、半径 10、原镜头、13 卡 / 47 editor 组件，暂停。没有临时卡片或性能 probe 留在页面，没有修改登录配置。[restoration.json](android-tv/restoration.json) 记录了恢复前后哈希及最终场景。

未部署公网，未合并 learn 或 OLL。原始备份保留在本机临时目录，私有数据库内容和 APK 不上传 Git。
