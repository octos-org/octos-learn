# Android UI 密度对齐与修复后大屏复测（2026-10-07）

用户要求基于 Claude `0960f29` 重新打包，保留之前的 Android 打包补丁、保留旧 Web APK，并让 Makepad 具备 Web Android 模式的紧凑 UI。**首页持续重绘已在大屏验证消失；一次函数课程播放仍约 15 FPS，不能宣布整体性能问题全部解决。**

## 源码、构建与安装

- 根仓库分支：`codex/macos-product-ui`，从 `bc9d240` 快进到 Claude `0960f2940f558ebea25184989f613c0388e701dd`，随后加入本轮适配。根仓库及独立构建 checkout 的旧改动均做 stash 备份，保留至今。
- 独立构建 checkout：`/Users/alan0x/Documents/projects/octos-learn/.local-dev/oll-product/octos-learn`。构建前同步完整 native 源码，而非只拷贝几个旧文件，避免遗漏新设置页、相机、加载动画、perf 和皮肤资产。
- 保留 `package-android-test.py`、Manifest、Java host、预览 `standalone` feature/JNI 入口分离、`audio_playback.rs`。macOS `AVAudioPlayer` 修复不变，未新增 Android/Windows 音频实现。
- Makepad 仍固定 `825dbb422c6d7926e111e2ee7831d697870d8671`，未修改或升级。OLL `d59b607`，Octoscript `68f6a9d`，Octoscript-Makepad `b0628d0` 加既有 zbias 补丁不变。
- Rust **release / opt-level=3**、ABI `arm64-v8a`，Rust 1.96.0、NDK 28.2.13676358、OpenJDK 17.0.2、build-tools 33.0.1。compileSdk 33、minSdk 26、targetSdk 35。缓存 cargo-makepad 位于 `target/debug/` 不代表 APK 为 debug；固定 Makepad 的 Java host 仍独立 javac + D8 重编译并替换旧 DEX，v2/v3 签名校验。
- 九个 SHA-256 锁定课程包、中文字体、全部产品 assets（包括 Claude 新增的 PNG 老师皮肤）进入 APK。课程缓存复用，日志 `cached=true`，本次启动解包约 20ms。
- 独立包名 `cc.pitun.learn.makepadtest`，应用名「Octos Learn 原生测试」，versionCode `202610071`，versionName `0.1.0-makepad-test-20261007.2`。
- 最终产物位置：`/Users/alan0x/Documents/projects/octos-learn/.local-dev/android-makepad/Octos-Learn-Makepad-Test.apk`。确切源码提交、是否有未提交改动、bytes/hash 记录在同目录 `apk-build.json`，最终交付记录补充于本文末尾。

复建命令（固定依赖及 SDK 准备方式见 [首次构建背景](ANDROID_APK_BUILD_HANDOFF_2026-10-07.md)）：

```sh
cd /Users/alan0x/Documents/projects/octos-learn
python3 .local-dev/oll-product/octos-learn/native/octos-learn/scripts/package-android-test.py \
  --sdk /Users/alan0x/Documents/projects/makepad/tools/cargo_makepad/android_33_macos_aarch64 \
  --cargo-makepad /Users/alan0x/Documents/projects/makepad/target/debug/cargo-makepad \
  --target-dir "$PWD/.local-dev/android-makepad/target" \
  --archives "$PWD/.local-dev/oll-product/course-packs"
```

设备仍为 `192.168.1.63:5555`，IWB/M3G2、Mali-G52、物理 3840×2160、30 Hz。`getprop` 确认 **Android 13 / API 33**，不是口述的 Android 11。设备原有 density override 为 640，逻辑 viewport 960×540；本轮没有改分辨率、density、刷新率等系统设置。

旧 Web 包 `cc.pitun.learn`：versionCode 33、versionName 0.1.2，codePath/firstInstallTime/lastUpdateTime 前后相同（见保留证据 JSON）。未卸载、清数据、覆盖 Web 包；只 `adb install -r` 更新独立原生测试包。

## Web Android 密度在 Makepad 中的实现

基准直接读取本仓库 `src/learning/course-launcher.css`、`learning-workspace.css`、`setup-whiteboard.css` 和 `src/learning/oll/board-chrome-insets.ts` 的教学取景参数。`native/octos-learn/src/android_ui.rs` 按 Android 编译目标及实际逻辑 viewport 应用产品尺寸，不在 60 Hz timer 中反复应用，也不对整个白板做额外缩放。

| 区域 | Android 模式 |
|---|---|
| 首页 / 课程集 | 内宽 `min(960, viewport−42)`；960×540 时 918px、三列、14px 间隔；封面 `clamp(100,24vh,160)` 即 129.6px；安卓字号和内边距 |
| 首页标题 | `clamp(24,2.6vw,34)`；Label 字号转换为 px×0.75 pt |
| 白板顶栏 | 左74 / 右6 / 上6，36px 高；隐藏额外 eyebrow；标题13px |
| 返回 / 设置 / 播放 | 30px / 30px / 25px，显式设置最小高度、居中图标、移除空文本占位 |
| 手写工具 | 左8 / 上48，27px 按钮、2px 间隔；文字按钮保留自适应宽度 |
| 输入栏 | 底部8px，宽上限520px；图片/相机/发送29px、麦克风32px、输入字号10px |
| 老师 / 旁白 | 56px 头像，230px 旁白框、11px 文字；目录按钮34px、面板260px |
| 新手设置 / 相机 / 选区 | 配置卡字号、间隔和输入高度收紧；相机预览128px；选区问答面板300px |
| 课程取景 | Android readingScale 0.68 / camera ceiling 0.8；安全区域使用实际 chrome 尺寸，取消额外桌面安全区下限 |

发现并处理了 Makepad Android 主题的 `Button.min_height=48` 和 `TextInput.min_height=48`。仅设置 height 不够，实机曾测得 25px 的播放按钮实际高48px；本轮在产品层同时设置 min_height。最终实测返回按钮矩形30×30、播放25×25、顶栏880×36、老师头像56×56。

只按平台应用这些产品尺寸；macOS/Windows 原有桌面参数保持。白板逻辑坐标、触摸转换、点阵间距均未加全局缩放。Android 课程自动取景采用 Web 的阅读尺度，因此同一课程取景会与之前桌面密度版不同，这是预期变化。

验证了首页、课程集点选/滚动、课程预览、播放、切换互动学习后的手写栏和输入栏布局。根据 CSS 源码及原生实测矩形核对，**未对登录后的 Web 课程首页做逐像素截图比较**。窄屏仅有尺寸策略测试，未声称手机真机验收；摄像头实画面、完整设置七个 tab、模型/ASR 请求及 Android 有声旁白未验收。

## 修复后的 Android 性能证据

`OCTOS_PERF` 在 Android 通过 Makepad log 输出到 logcat（原 eprintln 不可见）。默认关闭；诊断启动才通过白名单 intent extra 设置。只在诊断模式记录一次主要组件矩形。

### 首页静止

- 冷启动首 Draw 约550ms、Startup约205ms，属于初始化阶段。
- 之后连续约7秒没有 Draw，只有每秒60–61次 Timer。
- 每秒事件耗时约38–40ms，profiler busy约4%，单次 Timer 最大约0.7–1ms。
- `top -H` 原生事件/绘制线程约4–6.6%单核 CPU。确认 Claude 的静态 SVG 改动消除了首页持续重绘。

### 一次函数课程播放

在 `slope-and-intercept` 课程的公式、二维曲线、参数滑块及旁白字幕可见时采样。SurfaceFlinger `--latency` 的实际呈现时间戳，**只统计采样前最后呈现时间之后的新帧**，去除0/INT64_MAX，不把启动或首页静止的长间隔混入 FPS：

| 项目 | 数值 |
|---|---:|
| 新呈现帧 | 112 |
| 首尾新帧跨度 | 7.567s |
| 以帧间隔计算 FPS | 14.67 |
| 平均 / 中位帧间隔 | 68.17 / 66.67ms |
| p95 / 最大间隔 | 83.33 / 150.00ms |
| 原生线程稳态 CPU | 27–40% 单核 |
| profiler busy | 约21–31% |
| 每秒 Draw | 约13–18次，单次平均约14–16ms |

此段采样来自相同 `0960f29` 性能代码和 Android 密度适配的诊断构建，后续仅修正 Button/TextInput 最小高度并增加一次性尺寸日志。不是严格配对的旧/新 APK 同场景 A/B，不能宣称原报告的12 FPS精确提升到14.67 FPS。

Mac 的“每次重绘1ms”不能直接当成 Android 结果。Android 事件 Draw 仍约15ms；事件 profiler 不包括完整 GL 提交、驱动/EGL等待及最终合成呈现，**现有证据不能确定剩余瓶颈就是 GPU/4K 或定时器**。设备总内存约3.9GB，当时系统内存使用约3.6GB、swap接近满，也保留在采样里；未重启/清理其他应用来改变测试环境。

给 Claude 的下一步：先将 refresh/白板布局/Draw/GL提交/eglSwapBuffers 分段计时，再与 SurfaceFlinger 呈现对照。60 Hz timer跟随30 Hz屏幕、内容变化时才refresh仍是可测试的优化方向，本轮未实现，也未修改固定 Makepad。

## Android 诊断复现

```sh
ADB=/opt/homebrew/bin/adb
"$ADB" -s 192.168.1.63:5555 reverse tcp:50080 tcp:50080
"$ADB" -s 192.168.1.63:5555 shell am force-stop cc.pitun.learn.makepadtest
"$ADB" -s 192.168.1.63:5555 shell am start -W \
  -n cc.pitun.learn.makepadtest/cc.pitun.learn.makepadtest.MakepadApp \
  --es octos.OCTOS_PERF 1 --es octos.OCTOS_LEARN_OPEN slope-and-intercept
"$ADB" -s 192.168.1.63:5555 shell pidof cc.pitun.learn.makepadtest
# 用实际 PID 替换 <PID>，按播放后采样
"$ADB" -s 192.168.1.63:5555 logcat -v threadtime --pid=<PID>
"$ADB" -s 192.168.1.63:5555 shell top -H -b -d 1 -n 8 -p <PID>
"$ADB" -s 192.168.1.63:5555 shell dumpsys SurfaceFlinger --list
# 挑选该包的 SurfaceView 层，播放前后各抓一次 --latency，按上面的新帧过滤
```

关闭诊断：force-stop 后不带两个 `--es` 参数重新启动。Java host 会 unset 这两个变量，应用图标正常启动默认不打印 perf。调试过程中未更改课程生成/音频后端；本机 Octos 健康，使用已有50080端口，ADB reverse只为这台原生测试应用访问本机后端。

## 验证与证据入口

- 产品：`cargo test --release --locked --lib`，14 passed / 1 ignored；包含三个尺寸策略测试和 macOS 真实课程 MP3 的暂停/恢复/seek回归。macOS音频测试需允许媒体服务访问，第一次沙箱运行不能初始化AudioPlayer，按同样命令允许访问后通过。
- 共享预览：同样命令，17 passed。Android release构建、javac/D8、zipalign、签名和aapt身份检查通过。
- 完整本机证据：`/Users/alan0x/Documents/projects/octos-learn/.local-dev/android-update-0960f29/`。APK、截图、完整日志不进 git；可分享的 profiler/尺寸/线程/帧统计和保留证据在 `evidence/android-retest-2026-10-07/`，不含用户输入或凭据。
- 最终交付启动会关闭 perf、回到原生首页，保留旧Web应用；用户从「Octos Learn 原生测试」继续测试即可。
