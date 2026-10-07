# 局域网安卓大屏原生性能测试版（2026-10-07）

## 安装结果

用户明确授权安装到局域网大屏，并要求保留原 Web APK。已在 `192.168.1.63:5555` 安装并启动 **Octos Learn 原生测试**：

| 项目 | 值 |
| --- | --- |
| 原生测试包名 | `cc.pitun.learn.makepadtest` |
| Activity | `cc.pitun.learn.makepadtest.MakepadApp` |
| versionCode / versionName | `20261007` / `0.1.0-makepad-test-20261007` |
| 构建 | ARM64，Rust release，minSdk 26，targetSdk 35 |
| 大屏 | IWB / M3G2，Android 13（API 33），3840×2160 |
| 密度 | 物理 480，已有 override 640；本次未修改 |
| 内容 | 九门锁定课程及旁白文件、Noto Sans SC 字体 |

原 Web 版 `cc.pitun.learn` 保留，版本为 `versionCode=33 / versionName=0.1.2`。安装前后比较：codePath、versionCode、versionName、firstInstallTime、lastUpdateTime 全部相同，最后更新时间仍为 `2026-10-06 02:10:22`。安装前确认测试包不存在，使用 `adb install`，未用 `-r`，未卸载或清理其他应用。

验证证据位于 gitignored `.local-dev/android-makepad/`：`web-preservation.json`、`web-package-before.txt`、`web-package-after.txt`、`native-package.txt`。

## 使用入口

大屏应用列表打开「Octos Learn 原生测试」，与旧 Web 应用并存。当前实例已启动并留给用户测试。课程在 APK 中，首次启动会解压到本包私有 `files/course-packs`，学习进度也在该包独立存储中。

若需从本机重新连接并启动：

```sh
adb connect 192.168.1.63:5555
adb -s 192.168.1.63:5555 reverse tcp:50080 tcp:50080
adb -s 192.168.1.63:5555 shell am start -n cc.pitun.learn.makepadtest/cc.pitun.learn.makepadtest.MakepadApp
```

本次配置了 ADB reverse，使 Android 的 `127.0.0.1:50080` 连接已有本机 Octos solo 后端；后端继续只监听回环，健康检查通过。ADB 断开或设备重启后需重新设置 reverse。离线预制课的画面测试不依赖此连接。本次未发送模型生成请求。

## 源码与打包适配

供 Claude 复建和性能定位的完整说明见 [Android APK 编译打包交接](ANDROID_APK_BUILD_HANDOFF_2026-10-07.md)，包含精确工具链、checkout 同步命令、Java host 替换过程和 Release/测试签名区别。

基线仍为产品 `bc9d240` + OLL `d59b607`，Makepad 固定 `825dbb422c6d7926e111e2ee7831d697870d8671`，没有改动或升级固定依赖。之前本地 macOS 音频修复保留，音频跨平台实现未继续修改。

本轮新增/修改：

- `native/oll-preview/Cargo.toml`、`src/lib.rs`：默认启用 `standalone`；产品依赖关闭该功能，避免预览组件与产品重复导出 Android JNI `activityOnCreate`。独立预览二进制声明 `required-features=["standalone"]`。
- `native/octos-learn/Cargo.toml`：组件库依赖 `default-features=false`。
- `native/octos-learn/resources/android/AndroidManifest.xml.template`：独立测试身份，横屏，普通/电视启动器入口；仅声明网络权限。
- `native/octos-learn/resources/android/java/MakepadApp.java`：在 Makepad 启动前准备私有课程文件，设置现有 `OCTOS_LEARN_PACK_DIR`；未修改课程加载或教学逻辑。
- `native/octos-learn/scripts/package-android-test.py`：构建并打包，不执行安装。逐包校验大小和 SHA-256，包含完整课程和动态中文字体，校验最终包名及签名。

使用已有 `/Users/alan0x/Documents/projects/makepad/target/debug/cargo-makepad`、其已有 Android SDK/NDK/JDK，没有安装新的工具链。该缓存工具的 Java 源码较固定依赖旧，因此脚本用已有 javac/D8 重新编译固定 Makepad checkout 的 Java host，再加入应用自己的启动类；最终 Rust 与 Makepad Java 源码都来自固定提交。没有改缓存工具或其持久仓库。

构建在 `.local-dev/oll-product/octos-learn` 独立 checkout；源文件需先从根项目同步。安卓产物和 target 放在独立目录，避免与 macOS release 产物混用：

```sh
python3 .local-dev/oll-product/octos-learn/native/octos-learn/scripts/package-android-test.py \
  --sdk /Users/alan0x/Documents/projects/makepad/tools/cargo_makepad/android_33_macos_aarch64 \
  --cargo-makepad /Users/alan0x/Documents/projects/makepad/target/debug/cargo-makepad \
  --target-dir "$PWD/.local-dev/android-makepad/target" \
  --archives "$PWD/.local-dev/oll-product/course-packs"
```

本轮代码与文档尚未提交、推送。此前「停止音频实现」指示继续有效；此次新授权用于安卓性能测试打包与设备安装。

## 产物与验证

APK：`/Users/alan0x/Documents/projects/octos-learn/.local-dev/android-makepad/Octos-Learn-Makepad-Test.apk`。

- 大小：83,201,742 bytes（约 79 MiB）。
- SHA-256：`d07248c149c77f9dd0139c2782c8e57915dffa1de188fa005501dfc0f4e70c58`。
- v2 / v3 签名验证通过，最终包名/label 校验通过。
- ZIP 校验：九门课程入口、清单引用的所有旁白文件、中文字体及 ARM64 原生库均在 APK 中；没有重复 ZIP 条目。
- 原生 JNI 启动符号唯一；安装返回 Success；Activity 已 resumed，进程持续存活，启动日志无 FATAL / panic / shader error。
- SurfaceFlinger 已建立本包 SurfaceView，查询记录有 125 个有效历史帧呈现时间戳，确认 GPU 实际呈现。查询的刷新周期为 33,333,333ns；这不是应用课程播放的帧率测量。
- 共享入口分离后产品 release 测试 11 项通过（包含原有 macOS 真实 MP3 回归），预览 Cargo metadata 的独立入口配置通过。构建中固定依赖有现存 dead_code 和 Java 弃用 API 警告，未通过修改依赖消除。

日志：`.local-dev/android-build.log`、`.local-dev/android-package.log`、`.local-dev/android-prep-native-tests.log`。大屏启动、内存及帧呈现记录在 `.local-dev/android-makepad/startup-*.txt`。

## 性能测试范围与当前限制

后续用户反馈首页和按钮都严重卡顿。现场采样已确认约 12 FPS、原生事件/绘制线程接近占满一核；当前版本未通过流畅度验收，原因与验证边界见 [卡顿探索记录](ANDROID_UI_STUTTER_INVESTIGATION_2026-10-07.md)。

可以在大屏手动比较：首页与课程进入、播放时的绘图、白板拖动/缩放、变量滑块，以及三维课程的旋转/缩放。本次完成安装、启动和帧呈现验证，未逐课完成 Android 交互或性能基准测试，不能宣称课程已达到目标帧率。

启动后的一个首页样本：首次准备课程资源 772ms；进程 TOTAL PSS 305,957 KiB（约 299 MiB），TOTAL RSS 391,732 KiB。它们是单次启动样本，不能代表课程峰值内存或稳定性能，也不能直接与 Web 版作结论性比较。

Android 旁白入口仍是 Makepad 的 TODO 空实现，当前测试版没有解决旁白播放。共享白板在 Android 通过 `oll.ink` 命令使用 Java 手写 overlay；本次产品包尚未接入独立预览里的 `MakepadAppExtension` / `NativeInkBridge`，手写反馈与手写性能不在验收范围。相机/麦克风权限未在性能测试 manifest 中声明，这两个功能同样不在本次验收范围。音频探索交接见 [原生旁白与跨平台音频探索结果](NARRATION_AUDIO_INVESTIGATION_2026-10-07.md)。
