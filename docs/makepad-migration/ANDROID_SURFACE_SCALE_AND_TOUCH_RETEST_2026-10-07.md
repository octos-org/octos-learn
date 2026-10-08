# Android 应用 surface 缩放与触摸复测（2026-10-07）

## 给 Claude 的结果

已拉取 `72e90eb`，重新编译 Java wrapper、Rust release 并更新独立测试 APK。**应用自身的 1080p surface 在大屏上生效，系统仍为 4K；卡片起手拖动也已修复。** 同 APK 用 `octos.OCTOS_RENDER_SCALE=1` 关闭降采样做了三个场景对照：自动缩放下首页约 25、课程集约 18 次 Draw/s，播放中位呈现时间戳间隔约 33ms；关闭后回到约 8、6、11 次 Draw/s。课程集仍未达到稳定 30 Hz，需要继续优化。

按钮、卡片拖动 / 点击、三个区域笔迹、滑块、3D 旋转 / 复位均通过本轮 ADB 触屏输入检查。默认自动缩放的新包已留在大屏上，关闭性能日志和 A/B extra。系统 size / density 全程未改；旧 Web APK 安装身份逐项一致。本机测试后端和 ADB reverse 已恢复，供后续功能测试使用。

## 1. 源码与编译适配

- 产品：`72e90eb28e7f945766326f15f2edf94d501c86ba`，含 `053cfaf` 的卡片捕获顺序修复，以及此前 GPT 的 Android PerfMonitor Draw 边界补丁。
- **构建时有一处本地 Java 编译修正**，`productDirty=true`；不是未经修改的 `72e90eb`。原版 `MakepadApp.java:66` 在外层 try 之外调用 `Os.unsetenv("OCTOS_RENDER_DPI")`，javac 报 checked `ErrnoException` 未捕获。[原始错误](evidence/android-surface-scale-2026-10-07/original-java-build-error.txt)
- 只增加 `ErrnoException` import，给找不到 surface 的 fallback 分支加 try / catch，失败时抛带 cause 的 `IllegalStateException`。渲染尺寸、DPI、MotionEvent 转换和 Rust / 卡片处理均保持 Claude 的实现。该补丁随本报告提交，见 [Java 编译适配 diff](evidence/android-surface-scale-2026-10-07/java-checked-exception.patch)。
- Makepad 仍为 `825dbb422c6d7926e111e2ee7831d697870d8671`，未修改源码或升级；OLL `d59b607`。工具链、打包命令沿用 [编译交接](ANDROID_APK_BUILD_HANDOFF_2026-10-07.md)。

实际命令（根仓库 cwd；独立 checkout 已同步产品及上述 Java 修正）：

```sh
python3 .local-dev/oll-product/octos-learn/native/octos-learn/scripts/package-android-test.py \
  --sdk /Users/alan0x/Documents/projects/makepad/tools/cargo_makepad/android_33_macos_aarch64 \
  --cargo-makepad /Users/alan0x/Documents/projects/makepad/target/debug/cargo-makepad \
  --target-dir "$PWD/.local-dev/android-makepad/target" \
  --archives "$PWD/.local-dev/oll-product/course-packs"
```

打包脚本重新 javac 固定 Makepad Java host、生成的 R.java 和产品 `resources/android/java/MakepadApp.java`，随后 D8 替换 APK 中的 DEX。解包 DEX 确认含 `chooseRenderScale`、`scaleSurface`、`OCTOS_RENDER_DPI`、`octos.OCTOS_RENDER_SCALE`；不是只打了 Rust 改动。Java wrapper 文件 SHA-256 记录在 [产物清单](evidence/android-surface-scale-2026-10-07/apk-build.json)。

- 包名 `cc.pitun.learn.makepadtest`，标签「Octos Learn 原生测试」；版本 `202610071 / 0.1.0-makepad-test-20261007.2`，仅对独立测试包 `adb install -r`。
- Release / opt-level 3、arm64-v8a、minSdk 26；9 个课程包锁定哈希校验、javac / D8、zipalign、v2 / v3 签名校验通过。
- 83,687,762 bytes；APK SHA-256 **`fcd527ec204b64bd03e760078e754d6b1596b1443ac3e80cc2aa2e238c3974a1`**。设备 pull 的 base.apk 完全一致。
- 本机 APK：`/Users/alan0x/Documents/projects/octos-learn/.local-dev/android-72e90eb-retest/Octos-Learn-72e90eb-Test.apk`。该目录还保存原始截图、完整日志和构建输出；产物不进 git，另同步到调研目录 `android-72e90eb-retest/`。

## 2. 真机渲染与布局

Android 13 / API 33，Mali-G52 大屏 `192.168.1.63:5555`。系统前后输出始终为 Physical size **3840×2160**（无 size override），Physical density 480 / Override density **640**。

默认启动日志 `Render scale 0.5`；SurfaceFlinger 原生 BLAST SurfaceView 的 buffer 是 **1920×1080**，layer 变换矩阵是 2×，输出可见区域 3840×2160。Android 的其他窗口 buffer 仍为 4K。关闭降采样时日志 `Render scale 1.0`，同一 surface 的 buffer 为 3840×2160。两者 Rust `[android-ui] viewport 960x540 catalog 918px/3cols chrome 36/27/29px` 相同，截图中的按钮 / 卡片大小与位置一致。

证据：[自动缩放启动](evidence/android-surface-scale-2026-10-07/startup-auto.txt)、[原生启动](evidence/android-surface-scale-2026-10-07/startup-native.txt)、[自动 surface](evidence/android-surface-scale-2026-10-07/surface-auto-extract.txt)、[原生 surface](evidence/android-surface-scale-2026-10-07/surface-native-extract.txt)。

## 3. 同 APK 的三场景 A/B

沿用 [前轮方法与口径](ANDROID_FRAME_SPLIT_AND_RESOLUTION_TEST_2026-10-07.md)：首页 x=16 页边空隙、课程集 x=325 卡片间空隙，16 次 logical y 470↔350、每次 1400ms；本轮两种模式的 ADB 坐标都乘 **4**，因为系统保持 4K，Java wrapper 自行做触摸转换。播放从 `slope-and-intercept` 暂停预览的同一起点开始，点击播放后预热 5s、采 22s。

每秒日志排除开始 3s / 末尾 1s，并按边界数加权；新版采样器用设备日志 epoch 计算窗口，避免 ADB 传输延迟将旧窗口计入。首页两组和原生 4K 课程集采样增加一对 20 logical px 的短预热拖动；默认缩放课程集使用原采样步骤，设备 epoch 窗口与起始位置已核对。早期 `auto-home-gutter` 的首个边界包含长空闲累积，已弃用，主表采用重新采集的 `auto-home`。课程集切页后恢复相同顶部位置，截图核对。工具采样会产生少量额外负载，原生首页窗口中另有一次 SurfaceFlinger 状态查询。

时间单位均为每边界平均 ms。`draw` = Makepad CPU 编码 / GL 驱动调用，`wait` = eglSwapBuffers 阻塞，`event` = PerfMonitor 事件通道。Android GPU timer 未上报，JSON 为 null。边界来自产品的 `Event::Draw`，不等于确认物理屏幕呈现。

| 场景 | 模式 | event | draw | wait | gap | Draw 节奏 / 秒 | 稳定窗口 / 边界数 |
|---|---|---:|---:|---:|---:|---:|---:|
| 首页滚动 | 原生 4K | 8.45 | 3.95 | **105.30** | 118.02 | 8.47 | 20 / 179 |
| 首页滚动 | 默认 1080p surface | 9.44 | 3.56 | **24.51** | 39.00 | 25.64 | 20 / 516 |
| 课程集滚动 | 原生 4K | 14.94 | 5.37 | **139.36** | 159.84 | 6.26 | 18 / 123 |
| 课程集滚动 | 默认 1080p surface | 14.62 | 5.29 | **31.07** | 54.60 | 18.32 | 20 / 372 |
| 一次函数播放 | 原生 4K | 17.32 | 5.72 | **67.51** | 90.66 | 11.03 | 18 / 208 |
| 一次函数播放 | 默认 1080p surface | 18.47 | 5.82 | **6.56** | 30.95 | 32.31 | 18 / 586 |

主要改善仍来自 wait，分别下降约 **4.3× / 4.5× / 10.3×**，平台 draw / 应用事件通道单帧成本接近。首页停止滚动后连续稳定窗口无 Draw、只剩 60 Hz Timer，app busy 约 4%，未发现新的重绘风暴。

SurfaceFlinger 原生 layer latency 末段 ring 交叉验证：

| 场景 | 原生 4K 时间戳速率 / 秒 | 默认缩放时间戳速率 / 秒 | 原生 / 默认中位间隔 ms |
|---|---:|---:|---:|
| 首页 | 8.39 | 24.83 | 116.67 / 33.33 |
| 课程集 | 6.15 | 17.94 | 166.67 / 50.00 |
| 播放 | 10.95 | 31.65 | 100.00 / 33.33 |

ring 只保留最后约 125–126 帧，不覆盖整个动作窗口。设备声明模式 30 Hz，但软件 vsync / 呈现时间戳存在此前发现的 16.67ms 记录；**31.65 不是物理屏幕实际 32 FPS 的验证**。播放中位间隔接近 30 Hz 周期，显著改善，但未测物理面板真实刷新时序。

完整每秒日志、窗口数据和 latency 在 [summary.json](evidence/android-surface-scale-2026-10-07/summary.json) 及同目录六个场景子目录。可复用 [sample.py](evidence/android-surface-scale-2026-10-07/sample.py)；支持 `OCTOS_TEST_ADB` / `OCTOS_TEST_DEVICE`，只采样和拖动，不改变系统设置 / 导航 / 播放状态。

A/B 启动仅增加 `--es octos.OCTOS_RENDER_SCALE 1`；每次 force-stop 后启动，以避免 Activity 复用旧 extra。最终不带该 extra 和 `OCTOS_PERF` 正常启动。

## 4. 触摸与交互专项

采用 `adb input tap` / `input touchscreen swipe` 注入 Android MotionEvent，验证物理像素 → wrapper buffer → Rust logical 坐标 → 绘制的闭环；不是现场真实触笔压力 / 多点 / 防掌触验收。各项均在默认 scale 0.5、系统 4K / density 640 下完成。

| 检查 | 物理坐标 / 操作 | 结果 |
|---|---|---|
| 卡片起手拖动 | `(3640,1880)→(3640,1400)`，1400ms | 首页 hero / 课程集标题滚动约 120 logical px；没有误触打开课程集 |
| 拖动后点击卡片 | `(500,1550)` | 正常打开「读懂一次函数」 |
| 右上设置 | `(3600,112)` | 打开 Settings；首次后台未连接时显示读取中，后端恢复见 §5 |
| 左上返回 | Settings `(190,160)`；白板 `(84,96)` | 返回首页 / 课程集均正确 |
| 左下预览按钮 | 第一门课 `(300,2100)` | 打开「正比例函数 y = kx 与斜率的几何意义」暂停预览 |
| 课程预览按钮 | 第二门课 `(1500,2100)` | 打开一次函数预览，下一 Beat 按钮有效 |
| 右下目录按钮 | `(3700,1628)` | 打开课程目录，再次点击可关闭 |
| 笔迹中心区域 | `(800,700)→(1400,900)`，1200ms | 5 个截面中心与预期斜线路径误差 0.33–0.67 physical px |
| 笔迹左下 / 右下 | `(200,1700)→(750,1700)`；`(3000,1600)→(3500,1900)` | 检查截面中心误差 0–0.5 physical px；三条测试笔迹已撤销 |
| 斜率滑块 | `(1588,1748)→(1760,1748)`，1000ms | m 从 1.00 到 3.45，图像 / Q 点同步变化；截图滑块中心 x≈1759.5，贴合终点；复位回 1.00 |
| 3D 曲面拖动 | `(2400,1100)→(2640,1000)`，1200ms | 只旋转曲面，相邻卡片保持位置；`复位` `(2170,1532)` 后场景区域像素与原图完全一致 |

笔迹数据：[ink-coordinate-check.json](evidence/android-surface-scale-2026-10-07/ink-coordinate-check.json)。滑块：[slider-check.json](evidence/android-surface-scale-2026-10-07/slider-check.json)。3D 使用 `surface-paraboloid-level-sets`，推进到第二个 Beat；[scene-check.json](evidence/android-surface-scale-2026-10-07/scene-check.json)。其余步骤：[touch-checks.json](evidence/android-surface-scale-2026-10-07/touch-checks.json)。原始前后截图留在本机测试目录，未入库。

## 5. 清晰度、环境与剩余范围

同逻辑尺寸的原生 4K / 默认缩放截图比较：中文标题、正文、数学公式仍可辨，小字、点阵和细线边缘明显更柔和。未见布局尺寸变化、文字截断或因缩放出现的按钮偏移。**能否接受大屏实际观看距离下的清晰度需用户现场判断**；截图可辨性不能替代现场验收。

触摸测试中发现原本本机 Octos 后端已停止、ADB reverse 为空，导致空白板提示连接失败。复用已有本地 backend 以 `--solo --host 127.0.0.1 --port 50080` 重启，并恢复 `adb reverse tcp:50080 tcp:50080`；health 正常。首次使用引导只选择进入白板，未修改模型凭据、未发送 AI 学习请求。该恢复发生在六组主要性能采样之后；性能对照用内置离线课程。最终后端保持运行，端口映射仍在，Mac / ADB 断开后需按原本环境步骤重新恢复。

课程集约 18 次 Draw/s、末段中位 50ms，仍是明确遗留。当前数据证明默认缩放生效，不证明封面网格是剩余根因；应由 Claude 继续 profile 再优化。60 Hz Timer、整板 refresh 仍在。系统复制粘贴菜单 / IME、非零 safe-area、屏幕旋转、多点与真实笔压力未在本轮覆盖。主题色偏蓝保持此前状态，未改颜色实现。未宣称全课程 / AI / 有声旁白功能完全验收。

系统前后 size / density、Web 包 codePath / 版本 / 安装时间、设备 APK hash，以及最终 `Render scale 0.5`、无 perf / crash 日志的核对见 [最终状态](evidence/android-surface-scale-2026-10-07/preservation-and-final-state.json)。
