# Android 大屏：帧拆分与 4K / 1080p 对照（2026-10-07）

## 给 Claude 的结论

已按 `deb8e88` 的方案完成首页滚动、课程集滚动、`slope-and-intercept` 播放的两组真机采样。**4K 的主要耗时在 `eglSwapBuffers` 等待，而非应用处理或 Makepad 编码 / GL 调用。降低实际 surface 像素数后等待显著下降；恢复 4K 再测课程集，慢速表现复现。** 数据支持优先处理 Android 渲染分辨率 / 呈现链路，但不能仅凭 swap 等待进一步区分纯 GPU 填充、buffer queue 和系统合成的贡献。

用户明确允许临时全系统 1080p 对照，要求测完恢复原值。已恢复 **物理默认 3840×2160、原来的 density override 640**；不是 `density reset`（物理 density 是 480）。旧 Web APK `cc.pitun.learn` 的版本、安装路径、首次安装 / 更新时间均未变。独立原生测试包保留，正常启动已关闭 `OCTOS_PERF`。本轮未实现正式降分辨率方案、未修改或升级固定 Makepad、未改主题色。

另有一个独立问题：**从首页卡片上起手的触摸拖动不滚页，从卡片间空隙起手则可以。** 降分辨率无法解决它；复现和源码线索见 §5。

## 1. 测试产物与唯一诊断补丁

- 产品基线：`deb8e88f37dc43647ab87c91b94dfe2ecf1936ff`，包含此前 `72f29b3` 的 Android 紧凑 UI、独立打包、macOS 音频实现。
- 实际 APK：上述基线 + `native/octos-learn/src/lib.rs` 的 8 行统计补丁；构建时 `productDirty=true`，不是未修改的 `deb8e88`。补丁与主报告已提交为 `3fffb158f4c3f5d7b6180db302c61db190e12cf5`，后续只整理文档 / 日志空白；完整 diff 见 [android-frame-boundary.patch](evidence/android-frame-split-2026-10-07/android-frame-boundary.patch)。`perf.rs` 仅修正统计口径注释，未改变运行代码。
- 原因：固定 Makepad Android 后端会累加 `draw`、`wait`，但没有调用 `PerfMonitor::frame_boundary`。该调用只见于 macOS 后端。因此原版 `deb8e88` 在 Android 已有 Draw 时仍打印 `frames 0`，不能直接拿来做帧拆分。[原版日志](evidence/android-frame-split-2026-10-07/original-deb8e88-frames-zero.txt)
- 补丁：仅在 Android 且 `OCTOS_PERF` 已启用时，进入应用 `Event::Draw` 时调用 `cx.perf_monitor.frame_boundary(draw.time)`，将上帧累计项折入 ring。关闭统计时仍走原有提前返回；无新定时器或 redraw。**这是应用 Draw 边界，不是已确认物理屏幕呈现。** 后端如果只重画已有 pass 而不调用应用 Draw，此口径不覆盖独立的那次 repaint。
- 固定 Makepad：`825dbb422c6d7926e111e2ee7831d697870d8671`，源码工作区干净；OLL `d59b60790e6a2775bff4b2ec16f7223f9354df6d`。配套依赖和工具链沿用 [APK 构建交接](ANDROID_APK_BUILD_HANDOFF_2026-10-07.md)。
- Release / opt-level 3 / arm64-v8a / minSdk 26，9 个锁定课程包；包名 `cc.pitun.learn.makepadtest`，标签「Octos Learn 原生测试」，版本 `202610071 / 0.1.0-makepad-test-20261007.2`。
- APK 83,683,666 bytes，SHA-256 `18937f7001e5fa2b2e71a66e4e579c6e9e8ef877129c488f3688c79ff34e8824`。最后从设备 pull 的 `base.apk` 哈希相同。[构建清单](evidence/android-frame-split-2026-10-07/diagnostic-apk-build.json)
- 产物与完整截图 / 日志保存在本机 `/Users/alan0x/Documents/projects/octos-learn/.local-dev/android-frame-split-20261007/`，不进 git。可重新安装的文件是该目录 `Deb8e88-FrameSplit-Diagnostic.apk`。两组使用同一 APK，中途只更改显示配置。

复建命令（根仓库 cwd；先将本轮诊断补丁同步到独立 checkout）：

```sh
python3 .local-dev/oll-product/octos-learn/native/octos-learn/scripts/package-android-test.py \
  --sdk /Users/alan0x/Documents/projects/makepad/tools/cargo_makepad/android_33_macos_aarch64 \
  --cargo-makepad /Users/alan0x/Documents/projects/makepad/target/debug/cargo-makepad \
  --target-dir "$PWD/.local-dev/android-makepad/target" \
  --archives "$PWD/.local-dev/oll-product/course-packs"
```

Android release 编译、Java / D8、zipalign 和 v2 / v3 签名验证通过。诊断补丁通过真实滚动、播放验证；未增加功能测试，未再跑与本补丁无关的音频和九课全量测试。

## 2. 真机与方法

设备 `192.168.1.63:5555`，Android 13 / API 33、Mali-G52。系统报告显示模式 3840×2160 / 30 Hz。原始 `wm size` 没有 override，`wm density` 为 Physical 480 / Override 640。

对照使用 `wm size 1920x1080` 和 `wm density 320`，应用逻辑视口仍 960×540，首页 / 课程集仍 918px 内宽、三列，布局相同。SurfaceFlinger 确认原生 surface buffer 从 3840×2160 变为 1920×1080，像素数为原来的四分之一，物理显示模式仍为 4K。不是单纯改了字号。[4K surface](evidence/android-frame-split-2026-10-07/surface-4k-extract.txt)、[1080p surface](evidence/android-frame-split-2026-10-07/surface-1080p-extract.txt)

- 首页：连续 16 次交替向上 / 向下触摸，每次 logical y 470↔350、1400ms；x=16 的页边空隙。4K 坐标乘 4，1080p 乘 2。避开卡片捕获。动作约 24.4s。
- 课程集：「读懂一次函数」，返回页顶后同样 16 次手势，x=325 的卡片间空隙。两组起点经截图核对；最终采用 `*-collection-matched`。4K 这一组在恢复系统设置后重新测，亦复现先前 x=16 约 6 FPS 的结果。早期 1080p 课程集未恢复相同滚动位置的两组不进入主表。
- 播放：force-stop，带 `octos.OCTOS_LEARN_OPEN=slope-and-intercept` 启动暂停预览，点击播放，预热 5s，再采 22s。两组均跳过学习进度恢复，从相同课程起点开始。
- 各场景排除前 3s 与最后 1s 的应用日志窗口，按窗口 `frames` 数加权平均。截图与 SurfaceFlinger 查询在动作窗口外；同时用 top 每秒采线程，未杀掉其他应用。温控服务两组 Status 0，没有报告 CPU / GPU 降频限制；这不等于精确 GPU 时钟测量。
- `draw` 是平台 `handle_repaint` 的 CPU 编码 / GL 驱动调用时间，扣掉 swap；`wait` 是 `eglSwapBuffers` 内阻塞时间，包含呈现链路等待。`event` 是 PerfMonitor 事件通道，不等于某一个应用 Draw handler。应用层 `[perf] busy` 也不是整进程 CPU 利用率。
- **Android 没有 GPU timer 上报，缺失 `gpu` 应读为不可用。** 本地第一版解析器填了 0，入库 JSON 改为 null；不是测得 GPU 用时 0ms。采样脚本已修正缺失值。

可复用脚本：[sample.py](evidence/android-frame-split-2026-10-07/sample.py)，支持 `OCTOS_TEST_ADB`、`OCTOS_TEST_DEVICE` 环境变量；脚本只采样 / 拖动，不改显示设置，也不负责播放 / 导航到测试起点。

## 3. 每帧拆分结果

所有时间单位 ms，来自稳定窗口加权平均。Draw 节奏 = 1000 / gap，只表示应用 Draw 边界频率。

| 场景 | 分辨率 | event | draw | wait | gap | Draw 节奏 / 秒 | 稳定窗口 / 边界数 |
|---|---|---:|---:|---:|---:|---:|---:|
| 首页滚动 | 4K | 8.59 | 3.93 | **106.30** | 118.97 | 8.41 | 20 / 176 |
| 首页滚动 | 1080p | 8.81 | 3.67 | **25.23** | 39.07 | 25.59 | 21 / 545 |
| 课程集滚动 | 4K（恢复后） | 14.13 | 5.27 | **142.87** | 162.83 | 6.14 | 18 / 121 |
| 课程集滚动 | 1080p | 14.29 | 5.18 | **31.95** | 53.83 | 18.58 | 20 / 378 |
| 一次函数播放 | 4K | 17.38 | 5.69 | **68.12** | 91.28 | 10.96 | 17 / 195 |
| 一次函数播放 | 1080p | 18.01 | 5.69 | **6.74** | 30.55 | 32.73 | 18 / 592 |

**应用事件 / 编码的单帧耗时几乎不变，等待下降约 4.2、4.5、10.1 倍。** 4K 在三个场景均主要被 swap 等待占据，课程集更严重；1080p 课程集仍慢，不能宣布性能验收通过。低分辨率下应用 busy 上升（首页约 7%→22%、课程集 9%→27%、播放 19%→59%），因为每秒处理的帧数增加，不能据此判断单帧性能退步。

这一轮 4K 播放约 11 次 Draw/s，不能与前一轮约 15 FPS 直接比较来宣称代码回退：阶段、窗口和设备背景不同。本轮有效比较是同 APK 的 4K / 1080p 配对。

## 4. SurfaceFlinger 交叉验证与刷新率限制

读取原生 BLAST SurfaceView 的 `--latency` 第二列，去掉 0 / INT64_MAX、去重、只保留晚于采样前最大值的记录。ring 只能留最后约 125–127 帧，以下是末段统计，不覆盖整个动作窗口。

| 场景 | 4K 时间戳频率 / 秒 | 1080p 时间戳频率 / 秒 | 4K / 1080p 中位间隔 ms |
|---|---:|---:|---:|
| 首页滚动 | 8.35 | 24.97 | 116.67 / 33.33 |
| 课程集滚动 | 6.01 | 18.71 | 166.67 / 50.00 |
| 一次函数播放 | 10.94 | 32.33 | 100.00 / 33.33 |

**不能把 32.33 写成物理屏幕实际显示 32 FPS。** 设备声明 30 Hz、latency 第一行也是 33333333ns，但 SurfaceFlinger 同时有 `HwcVsync mode(soft) period(16666666)`；1080p 播放 ring 中 18/125 个相邻间隔约 16.67ms。这是设备呈现时间戳 / software-vsync 与声明屏幕模式不一致的证据，尚未确认物理面板时序。应用节奏和这些时间戳均显示播放大幅改善、中位间隔接近 30 Hz 周期；不得据此声称已验证真实 33 FPS 或全程满帧。

完整汇总与每秒日志见 [summary.json](evidence/android-frame-split-2026-10-07/summary.json)，各场景同名目录保存 `result.json`、`perf.txt`、前后 latency 数值原文（入库时去掉行尾空白），便于异机重新计算。

## 5. 卡片拖动不滚动的独立复现

恢复 4K 后，从新启动的首页分别操作：

1. 第三张课程集卡片内部：logical `(910,470)→(910,350)`，1400ms，physical `(3640,1880)→(3640,1400)`。页面顶部 / hero 不移动；截图 `(200,80)-(3400,1500)` 区域像素完全相同。
2. 卡片之间：logical `(325,470)→(325,350)`，相同时间。页面顶部移出，hero / 课程集标题上移约 120 logical px。

源码线索：`lib.rs::tapped` 调用 `event.hits(cx, target.area())`；`handle_launcher_taps` 在 `self.ui.handle_event` 之前处理普通 View 卡片。源码注释明确要先于 scroll view capture。**推断**：卡片 FingerDown 提前捕获，拖动超过点击阈值后虽然不触发点击，也没有将触摸交给父 ScrollView。需 Claude 确認具体 capture 机制并修通用点击 / 滚动仲裁；不要仅将卡片起手无 Draw 的窗口当成“滚动很快”。本轮未改它。

证据：[touch-probe.json](evidence/android-frame-split-2026-10-07/touch-probe.json)、[probe 日志](evidence/android-frame-split-2026-10-07/card-probe-perf.txt)。原始三张截图留在本机 `card-probe-before.png`、`card-probe-after.png`、`gutter-probe-after.png`。

## 6. 恢复、后续实现边界

实际恢复命令：先 force-stop 原生包，再 `wm size reset`、`wm density 640`。最终 size / density 输出与测试前逐字相同；旧 Web 包版本 33 / 0.1.2、codePath、安装时间均相同。默认重开原生首页，无性能日志、无启动 crash，已从设备拉取 APK 校验 hash。[恢复与保留核对](evidence/android-frame-split-2026-10-07/restore-and-preservation.json)

建议 Claude 下一步：

1. 制定应用自身 surface 以 1080p 渲染、系统上采样到 4K 的实现；保持 logical 960×540、原 UI 大小和触摸坐标。全系统 `wm` 对照同时改变其他应用 / 合成层，因此应用独立 surface 的正式方案仍需重新跑这三场景验证。
2. 用户本轮只批准临时设备设置对照，**未批准修改 pinned Makepad**。若正式方案必须改 Makepad，应先给出具体改动与验证方法，再请用户批准；Java fixed-surface + touch / DPI 适配也尚未实现或验证。
3. 同步处理卡片起手拖动的 capture 问题。1080p 课程集仍约 19 次 Draw/s，可在降低呈现成本后继续减少层叠 / draw calls；不要只优化现在 4K 的应用代码就宣布解决。
4. 60 Hz 定时器与每 tick 整板 refresh 仍在，后续可跟随有效显示节奏、按内容变化刷新。主题色偏蓝另案交给 Claude，本轮保留现状。
