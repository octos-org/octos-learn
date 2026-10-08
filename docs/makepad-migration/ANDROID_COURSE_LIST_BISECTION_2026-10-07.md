# Android 课程集列表成本拆分（2026-10-07）

## 给 Claude 的结果

已从干净的 `b6da998` 重打并安装独立诊断 APK，完成要求的七组对照；补测 `nosvgtext`、`noshapes` 和末尾基线，共十组有效数据。**默认滚动约 19 次 Draw/s；`batch` 没有改善滚动，也没有在滚动中显著降低 event。** 静止页面 `tinyredraw,batch` 将 event 从 12.55ms 降至 3.24ms（约 74%），但 gap 仍约 40ms，wait 从 22.66ms 增至 31.26ms，呈现节奏几乎不变。这支持仍有 GPU / buffer queue / 呈现链路限制，不能只默认打开现有 batch 就宣布列表卡顿已修好。

`nocardtext` 是本轮最大滚动改善（约 28 次 Draw/s，中位时间戳间隔 33ms）；但是它用固定尺寸占位替代文本，会改变卡片排版，不能将全部收益直接算作文字 GPU 成本。背景圆角 / 边框和封面均有部分成本，单独去掉任何一项都未获得稳定 30Hz。封面文字、图形分别去掉的效果比全部去掉小；本页没有密集网格，勿据此重新归因到网格。

本轮没有改产品或固定 Makepad 源码。测完已正常启动，所有诊断 / perf / render-scale override extra 关闭，保留应用自动 1080p、系统 4K。旧 Web APK 安装身份不变。

## 1. 构建与安装

产品 `b6da998faa00cdd93bd014ef6bf7023adc57be21`，`productDirty=false`，已包含 GPT 的 Java checked exception 处理。独立构建 checkout 同步后，沿用 [打包背景](ANDROID_APK_BUILD_HANDOFF_2026-10-07.md) 与 [前轮实际命令](ANDROID_SURFACE_SCALE_AND_TOUCH_RETEST_2026-10-07.md)。Rust release 重新编译，固定 Makepad Java host 与产品 wrapper 重新 javac / D8；DEX 验证含 `OCTOS_BISECT`，诊断截图验证隐藏内容确实生效。九个课程包锁定校验、zipalign、v2 / v3 签名通过。

- Makepad `825dbb422c6d7926e111e2ee7831d697870d8671`、OLL `d59b607` 不变。
- APK：`cc.pitun.learn.makepadtest` /「Octos Learn 原生测试」，arm64-v8a，release / opt-level 3。
- 版本仍 `202610071 / 0.1.0-makepad-test-20261007.2`，83,687,762 bytes。
- SHA-256 **`14c74100d43fd65d053a919ac0ebae09a72281b821345244223e880e3a2c998b`**，设备 pull 完全一致；[清单](evidence/android-course-list-bisect-2026-10-07/apk-build.json)。
- 本机版本目录 `.local-dev/android-b6da998-bisect/`，APK `Octos-Learn-b6da998-Diagnostic.apk`，原始截图、构建 / 日志和无效冷启动样本均留在这里；不入 git。另同步调研镜像的 `android-b6da998-bisect/`。

首次 `adb install -r` 走增量安装，虽返回 Success，但随后 `pm path` / 包查询找不到测试包，Activity 不能启动。改为 **`adb install --no-incremental -r`** 完整传输后成功，后续应使用该命令。没有主动执行 uninstall / clear，也没有对旧 Web 包操作。原生测试包重新复制了课程资产（cached=false）；未验证此前原生测试包的本地学习记录是否保留。

完整安装后的首次启动在第一帧平台初始化处停留约 39s，第一次采样截图黑屏、有效边界为 0，已废弃，未进入下表。随后采样器先等待该进程至少三个 perf 窗口，再点击课程集、预热 4s 后采样。后续启动缓存正常，所有有效采样都核对了可见列表截图。初始化长停顿的内部热点未单独定位，不把它混入稳态滚动结论。

## 2. 场景与口径

Android 13 / Mali-G52，局域网设备 `192.168.1.63:5555`。全程系统 size 3840×2160、density Physical 480 / Override 640；应用 `Render scale 0.5`，实际 SurfaceView buffer 1920×1080 / layer 2×。Rust UI 960×540、3 列。[最终 surface](evidence/android-course-list-bisect-2026-10-07/surface-final-extract.txt)

每组都 force-stop 后独立启动 `--es octos.OCTOS_PERF 1`，诊断组加 `--es octos.OCTOS_BISECT <tokens>`，未设置 `octos.OCTOS_RENDER_SCALE`。点击首页物理 `(500,1800)` 进入 **读懂一次函数**，顶部相同，页内三门课程，未启动课程播放。

滚动：logical x=325 卡片间空隙，y=470↔350，16 次交替，每次 1400ms；ADB 物理坐标全部乘 4。正式动作前用 20 logical px 的短拖动往返预热。每组动作约 24.5s。`tinyredraw` 两组停在列表顶部，采 24s；进入页面后及采样窗口内无触摸输入，定时器每 tick 只请求 launcher_brand 重绘。**静止顶部与滚动过程中可见卡片面积不同，不能将两者 gap 差异全部归因到输入 / CPU。** 两个静止组互相的视口位置相同。

每秒 perf 窗口排除开始 3s / 最后 1s，按边界数加权；使用设备日志 epoch 而非 ADB 收到时间选窗。`event` 是应用事件通道，`draw` 是平台 CPU 编码 / GL 驱动调用，`wait` 是 eglSwapBuffers 阻塞；边界是应用 `Event::Draw`，不等同物理屏幕已呈现。GPU timer 未提供（JSON null）。wait 可包含 GPU、buffer queue 和垂直同步等待，**不是直接 GPU 执行时长**；event + draw 小于 33ms 也不单独证明 CPU 不在关键路径。

SurfaceFlinger latency 只交叉验证末段约 125–127 帧；软件 vsync 与硬件模式存在前轮已记录的时序差异，时间戳速率不当作物理 FPS。所有组都同时运行相同的 top / logcat 采样，会有一致的观察开销。按下表顺序执行，末尾基线复测控制粗略漂移，未锁定设备 GPU / CPU 时钟，细小差异不作精确排名。

## 3. 全部有效数据

| 开关 / 动作 | event ms | draw ms | wait ms | gap ms | 重绘节奏 / 秒 | SF 中位间隔 ms | 稳定窗口 / 边界数 |
|---|---:|---:|---:|---:|---:|---:|---:|
| baseline（滚动） | 14.64 | 5.05 | 30.69 | 51.89 | 19.27 | 50.00 | 20 / 390 |
| nosvg（滚动） | 12.21 | 4.55 | 23.21 | 41.06 | 24.35 | 50.00 | 20 / 491 |
| nocardtext（滚动） | 8.18 | 4.19 | 22.23 | 36.06 | 27.73 | 33.33 | 21 / 589 |
| nocardbg（滚动） | 14.23 | 3.88 | 26.53 | 45.99 | 21.74 | 50.00 | 21 / 462 |
| batch（滚动） | 14.24 | 5.07 | 32.02 | 54.26 | 18.43 | 50.00 | 20 / 375 |
| tinyredraw（不输入） | 12.55 | 4.90 | 22.66 | 40.21 | 24.87 | 33.33 | 20 / 500 |
| tinyredraw-batch（不输入） | 3.24 | 4.94 | 31.26 | 39.51 | 25.31 | 33.33 | 19 / 494 |
| nosvgtext（滚动） | 11.82 | 4.67 | 27.35 | 46.45 | 21.53 | 50.00 | 20 / 436 |
| noshapes（滚动） | 14.09 | 4.87 | 27.86 | 48.23 | 20.74 | 50.00 | 20 / 421 |
| baseline-repeat（滚动） | 13.96 | 5.05 | 31.35 | 51.54 | 19.40 | 50.00 | 20 / 396 |

两次基线 gap 51.89 / 51.54ms，平台 draw 5.05 / 5.05ms，wait 30.69 / 31.35ms；说明这一轮默认慢速状态稳定。每组完整日志 / 窗口 / latency、配置见 [summary.json](evidence/android-course-list-bisect-2026-10-07/summary.json) 及其场景子目录。[采样器](evidence/android-course-list-bisect-2026-10-07/sample.py) / [启动与导航工具](evidence/android-course-list-bisect-2026-10-07/run.py) 可复用。

## 4. 开关有效性与结论边界

- `nosvg`：三张缩略图全部消失，固定 cover 区域仍保留，卡片主体文字保留；约 19→24 次 Draw/s，event / draw / wait 均减少，是部分成本，不能称封面零成本，也不是单项完整解法。
- `nosvgtext` / `noshapes`：分别仅去掉封面的五段 SVG 文本 / 矢量部分，截图符合预期；约 21.5 / 20.7 次 Draw/s，均有剩余卡顿。不得把两组改善直接相加，GPU / 呈现排队与重绘节奏并非线性。
- `nocardtext`：隐藏卡片主体九类文本，封面 SVG 文字仍在。源码将标签改成 `View{width:10 height:18}`，tag 宽度、正文换行高度等改变；截图中空标签和卡片内容重排可见。event 14.64→8.18ms，gap 51.89→36.06ms，为最大总体收益，但不是保持几何的纯文字剔除实验。
- `nocardbg`：去掉卡片 RoundedView 底色 / 边框、标签与按钮底色、分隔线，封面 SVG 自己的背景不在此开关内。draw 5.05→3.88ms，gap 51.89→45.99ms；本轮收益小于 nocardtext，仍以 50ms 中位间隔呈现。
- `batch`：内容和布局视觉核对与默认一致；滚动 event 14.24ms、draw 5.07ms、gap 54.26ms，没有复现 Mac 的滚动 CPU 节省。不能宣布现有候选已能修复滚动。
- `tinyredraw,batch`：静止 event 下降约 74%，说明缓存路径在这种模式确实有效；但 draw 4.90 / 4.94ms 基本相同，gap 40.21 / 39.51ms、时间戳速率约 25 均接近。单纯避免 CPU 重建没有让完整可见场景稳定达到每次 33ms 呈现，节省时间被 wait 吸收，支持 GPU / 呈现链路仍有主导限制。

因此，现有七组不是一个简单的“gap 50 或 33”二选一：静止完整场景约 40ms，batch 只改变 CPU；滚动约 52ms，现有 batch 连 CPU 都未明显改变。具体 GPU shader / draw call 仍未用 GPU timer 定位。

## 5. 建议 Claude 接下来做什么

1. 优先将 `nocardtext` 诊断改成**保留原测量尺寸与卡片布局，只跳过文字绘制**，再确认文字相关的 GPU / 驱动 / 呈现成本。卡片主体文字是最值得继续验证的方向；不应直接删文字或凭此排名确定某个 shader 是根因。
2. 核对滚动期间 `batch` 是否每帧失效，以及 draw command 缓存 / clipping / 位置变化的处理；静止缓存命中不等于滚动命中。即使修复 CPU 缓存，还需在相同滚动视口验证能否降低 gap，不能仅报告 event 变小。
3. 基于真机证据评估产品层降低文字 / 卡片叠加绘制成本或缓存完整外观的方案；保留用户界面，不修改 pinned Makepad。封面与背景均有一定成本，圆角 / 边框不是本轮最大提速方向，也没有单独解决问题。

全屏 60 Hz Timer / 整板 refresh 仍作为后续。本轮不改主题色、旁白、Makepad 或默认优化开关；未重新做播放 / 手写 / 全课程功能验收。

## 6. 最终设备与交付状态

正常启动的诊断 APK 已留在大屏，所有 perf / bisect extra 关闭、默认应用 1080p。最终日志无 perf / crash，显示设置前后逐字相同；旧 Web `cc.pitun.learn` 的 codePath、versionCode / Name、firstInstallTime、lastUpdateTime 相同。Mac backend health=healthy，reverse 50080 仍有效。[前状态](evidence/android-course-list-bisect-2026-10-07/state-before.json) / [后状态与 APK hash](evidence/android-course-list-bisect-2026-10-07/state-after.json) / [最终启动](evidence/android-course-list-bisect-2026-10-07/final-startup.txt)

本报告、十组原始 perf / JSON / latency 和工具随本轮文档提交推送至 `codex/macos-product-ui`；主源码仍是未修改的 b6da998。APK 与截图仅留本机版本目录和调研镜像，不入 git。
