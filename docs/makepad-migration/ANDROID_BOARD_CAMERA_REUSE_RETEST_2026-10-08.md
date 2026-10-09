# 安卓白板镜头复用与播放成本复测（2026-10-08）

## 结论

`8439a78` 已重打、安装并在大屏上完成成本开关、四比例播放、单指平移与双指缩放复测。**省掉无变化重绘和单指镜头帧复用都生效；双指缩放在本次测试中没有复用。约1440p仍未达到连续动作约33ms预算，默认0.5保持。**

连续单指平移：1080p 33.3ms、约1440p 46.2ms、1620p 55.6ms；双指缩放：35.9 /43.4 /52.4ms。单指约1440p的新旧 gap 46.2 /47.1ms 接近，而应用busy 9.0 /33.4%：明显省CPU，本次未获得相应的帧间隔改善。

同一 APK 的约 1440p、相同课程和采样口径：新默认稳态 Draw 46 次，完整旧行为 382 次，减少 88.0%；主线程应用忙碌比例 35.0% → 7.8%。新版 20 个窗口中有 11 个没有 Draw。`tick_unchanged` 1125、`tick_refresh` 26。这是省去无变化刷新及 CPU 遍历的证据，不等于动画已满足 33ms 帧预算。

## 构建和设备

- 产品干净 `8439a78a265c46fa1eaa493bc0f065ee676a93ae`（含 `ae38705` 与 `8439a78`）；OLL `4263b2216f3968f2200b05f40b2dc1e94db5d802`。
- Makepad 固定 `825dbb422c6d7926e111e2ee7831d697870d8671`，保留用户已授权的 `native/patches/makepad-825dbb4-vector-color-unorm8.patch`；没有升级依赖或修改产品实现。
- 现有工具链，Release / ARM64 / locked offline。由 `native/octos-learn/scripts/package-android-test.py` 重编固定 Makepad Java host 和产品 `MakepadApp.java`，九个锁定课程包和中文字体均包含。
- 包 `cc.pitun.learn.makepadtest`；APK 83905047 bytes；SHA-256 `f7e6ac7777bc1d35721b8c8460adb6edc2d769b3d785f8ea609a3d73e2193107`，设备已安装文件哈希相同。非增量 `-r` 更新，首次安装时间保留。
- 设备 `192.168.1.63:5555`，M3G2 / Android 13 / Mali-G52 MC1；系统 3840×2160，density 物理480 / override640，全程未修改。只改变应用 intent 的 renderScale。
- 产品现有单元测试16 passed / 2 ignored；共享白板19 passed。

## 测量方法和限制

按 [Claude 的测量表](ANDROID_BOARD_PLAYBACK_COST_SPLIT_PLAN_2026-10-08.md)，同一 APK 顺序测各开关。`OCTOS_PERF=1`，`OCTOS_LEARN_OPEN=slope-and-intercept` 从头进入**预览**；确认实际播放后采样约24秒。预览不恢复或保存课程学习进度，不发课程生成请求。主表取采样开始后3秒到动作结束前1秒内的完整每秒窗口；wait/draw 按 Draw 数量加权，busy 取窗口均值。

- `gap` 是应用 Draw 边界间隔，`wait` 是 `eglSwapBuffers` 等待，不能分别当作已确认物理显示 FPS / 精确 GPU 执行时间。Android 没有 GPU timer 数据。
- 新版有大量静止段。它们的0次 Draw 是预期行为；下一次 Draw 的 gap 含整段静止时间，event 也可能累计静止期间的事件处理。**不能将全程平均 gap 或 event/Draw 当成动画帧耗时**。完整数据保留这些值，不用于分辨率结论。
- 分辨率表中的“连续窗口”筛选为每秒至少5次 Draw、max gap≤150ms；只有1–2个窗口时只是短片段证据。持续拖动 / 捏合另采约5秒，取注入开始后1秒至结束间的完整窗口，可更直接观察连续帧。
- 初始一次没有真正开始播放的 A 样本，以及旧行为启动校验不兼容的两次尝试均排除，放本地 `invalid-*`。后续测试脚本校验实际播放；旧行为没有新 tick 计数，因此改用 Draw/set_state 校验。
- 每组一次、串行运行；重复一组默认用于检查漂移。卡片内容和动画时段会影响统计，隐藏内容的结果不能精确相减解释为独立组件成本。
- 尤其 `nocards` 也跳过自然高度测量，可能改变布局和镜头；该组只能作为卡片总体相关性的线索。
- **I 组 census 不可从原始 APK 的 intent 启用**：`MakepadApp.java` 只转发 `OCTOS_PERF` / `OCTOS_LEARN_OPEN` / `OCTOS_BISECT`，不转发 `OCTOS_CENSUS`。没有为采数改产品；本轮没有 shader census 数据。

## 约 1440p 成本拆分

时间单位ms；Draw 数及walk/reuse是同口径稳态窗口的合计。

| 组 | 开关 | Draw | 0 Draw窗口 | busy | 平台draw | wait | walk / reuse |
|---|---|---:|---:|---:|---:|---:|---:|
| A-1440 | 默认 | 46 | 11 | 7.8% | 6.1 | 22.3 | 28 / 18 |
| A-repeat-1440 | 默认重复 | 46 | 11 | 8.0% | 5.9 | 22.7 | 28 / 18 |
| B-tick | tickredraw | 378 | 0 | 34.9% | 6.1 | 28.7 | 378 / 0 |
| C-no-cards | nocards | 63 | 12 | 6.5% | 3.7 | 12.1 | 25 / 38 |
| D-no-shadow | noshadow | 48 | 12 | 7.9% | 5.9 | 20.3 | 28 / 20 |
| E-no-grid | nogrid | 48 | 12 | 7.8% | 5.8 | 19.7 | 28 / 20 |
| F-no-vector | novector | 46 | 11 | 7.8% | 6.1 | 22.1 | 28 / 18 |
| G-no-camera-animation | nocamanim | 45 | 11 | 7.9% | 6.0 | 22.2 | 28 / 17 |
| H-no-pointer-pulse | nopulse | 37 | 12 | 7.9% | 6.4 | 16.3 | 28 / 9 |
| J-no-reuse | nocamreuse | 45 | 11 | 9.1% | 6.2 | 17.1 | 45 / 0 |
| K-no-cull | nocull | 46 | 10 | 7.8% | 6.1 | 22.3 | 28 / 18 |
| L-old | tickredraw,nocamreuse,nocull | 382 | 0 | 35.0% | 6.1 | 28.4 | 382 / 0 |

## 新默认分辨率对照

| 比例 | 实际surface | 稳态Draw数 | wait(ms) | 连续窗口gap(ms) |
|---|---|---:|---:|---:|
| 0.5 | 1920×1080 | 56 | 13.4 | 33.4（1 个窗口） |
| 0.667 | 2561×1441 | 46 | 22.3 | 51.4（2 个窗口） |
| 0.75 | 2880×1620 | 43 | 27.5 | 59.8（2 个窗口） |
| 1 | 3840×2160 | 35 | 48.7 | 96.0（1 个窗口） |

## 注入触屏事件拖动 / 双指缩放

使用独立、临时 Instrumentation 测试 APK，通过 Android UiAutomation 注入 `SOURCE_TOUCHSCREEN` / finger pointer MotionEvent；不是鼠标滚轮模拟。原生产品与 Web APK 均未被该工具覆盖，结束后卸载工具。预览播放约5秒后暂停，空白纸面 `(650,1100)` 物理像素处注入各5秒单指平移或双指捏合。没有笔迹；含笔迹时会走不同的缩放复用安全条件，本轮未覆盖。

| 组 | 连续窗口gap(ms) | 采样段wait(ms) | 采样段walk / reuse | 平均walk / reuse CPU(ms) |
|---|---:|---:|---:|---:|
| pan-A-1080 | 33.3 | 3.1 | 1 / 132 | 14.0 / 0.1 |
| pinch-A-1080 | 35.9 | 8.9 | 116 / 0 | 13.0 / — |
| pan-A-1440 | 46.2 | 37.1 | 1 / 90 | 14.4 / 0.1 |
| pinch-A-1440 | 43.4 | 20.0 | 106 / 0 | 13.2 / — |
| pan-J-1440 | 47.1 | 25.8 | 101 / 0 | 13.0 / — |
| pinch-J-1440 | 43.3 | 19.3 | 108 / 0 | 12.9 / — |
| pan-A-1620 | 55.6 | 46.3 | 1 / 86 | 14.8 / 0.1 |
| pinch-A-1620 | 52.4 | 30.1 | 84 / 0 | 13.4 / — |

单指约1440p采样窗口有90次复用、1次完整遍历；关闭复用后101次完整遍历、0复用。双指约1440p默认却是106次完整遍历、0复用，关闭复用后108次完整遍历、0复用，gap 43.4 /43.3ms 接近。

双指默认窗口里有107次 `refresh` / `board_set_state`，逐秒日志中的 `Actions` 与Draw数量接近。源码 `native/octos-learn/src/lib.rs` 的 `control_event = matches!(event, Event::Actions(_))`，以及后面的 `if control_event { self.refresh(cx); }` 与这些日志相符；随后 `set_state` / 内容重绘会影响复用条件。**已确认缩放时频繁刷新与零复用；未记录具体action的来源，不能确定是哪个控件发出。** 本轮未加日志补丁或改实现。

另起两次带录屏的约1440p平移 / 缩放，录屏数据排除在性能结论之外。以每秒一帧抽查前6秒：图卡、公式与控制条随镜头平移 / 缩放，未见内容突然消失、缺块或明显闪烁；放大超出屏幕的裁切是视窗边界。这里只是短录屏抽帧检查，不是对任意轨迹和每一帧的保证。未在现场拍正常观看距离照片，原始4K截图和视频均保存在本地。

连续窗口gap排除了手势开始前的暂停空档；wait及计数仍使用注入开始后1秒至结束的采样窗口，包含首个新绘制窗口。原始窗口逐行保留，不能将这两种口径的帧数直接等同。

## 3D 课程补测

- A-saddle：Draw 39，busy 6.8%，wait 35.6ms，walk/reuse 20/19。
- B-saddle：Draw 415，busy 22.3%，wait 30.7ms，walk/reuse 415/0。

只补测马鞍面从头播放相同约24秒，没有覆盖其整课，也没有在3D卡片内部旋转 / 滑块拖动。本轮不是新登录、提问生成、全部大屏UI或旁白的完整验收。

## 最终设备状态与证据

默认比例仍0.5、正常启动无任何诊断 extra。系统尺寸 / density 与安装前一致；旧 Web `cc.pitun.learn` 的路径、版本和安装时间全部一致。

完整 APK、截图、视频、原始日志、测试脚本：根仓库 `.local-dev/android-8439a78-camera/`（gitignored）；调研镜像同名目录。温度中途快照：HAL当前54.4°C（cached64.4°C），Thermal Status 0、CPU/GPU cooling均0；仅一次快照，不覆盖所有时段。正常启动日志未出现性能输出；所采应用日志未见FATAL EXCEPTION / panic / SIGSEGV。

只将构建身份、筛选后的性能行与汇总上传到 Git，见 [证据](evidence/android-8439a78-camera/aggregate.json)。截图和APK不进Git。
