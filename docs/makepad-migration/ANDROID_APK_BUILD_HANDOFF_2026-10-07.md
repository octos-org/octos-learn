# Android 原生测试 APK 编译打包交接（2026-10-07）

> 本文记录首次 `bc9d240` 打包背景。后续已基于 Claude `0960f29` 更新、对齐 Android UI 并提交原先本地补丁；当前 APK 身份、源码提交、hash 和大屏结果见 [最新复测记录](ANDROID_UI_PARITY_AND_PERF_RETEST_2026-10-07.md)。下文旧产物 hash 不再代表当前可下载 APK。

供 Claude 接手当前大屏卡顿问题。本文说明**设备上实际安装的 APK 如何产生**，不代表 Android 功能或性能已经验收。本轮只补充文档，没有重新编译、安装或修改运行中的应用。

## 1. 源码与构建目录

根仓库：`/Users/alan0x/Documents/projects/octos-learn`，分支 `codex/macos-product-ui`。实际构建在独立 checkout：

```text
/Users/alan0x/Documents/projects/octos-learn/.local-dev/oll-product/
  octos-learn/native/octos-learn/   产品 crate、Android 包装脚本
  octos-learn/native/oll-preview/   共享白板/绘图组件
  oll/crates/oll-runtime/          OLL Rust runtime
  makepad/                        固定 Makepad 源码
  octoscript/
  octoscript-makepad/
  course-packs/                   已下载的九个 .ocpack
```

| 来源 | 实际版本 |
| --- | --- |
| octos-learn 基线 | `bc9d2401ec60446effeeb48a545ae73f68c00481` + 下述本地改动 |
| OLL | `d59b60790e6a2775bff4b2ec16f7223f9354df6d` |
| Makepad Rust / 最终 Java host | `825dbb422c6d7926e111e2ee7831d697870d8671` |
| octoscript | `68f6a9df55692b5d8ef8873a12721e279a3f40d6` |
| octoscript-makepad | `b0628d05a89369b0c3bae2750db6da06996a05c2` + 仓库 evidence 的 zbias 补丁 |

固定依赖没有升级或改源码。根仓库与构建 checkout 的产品 `Cargo.lock`、课程锁文件和本轮八个源码/包装文件在本次交接时逐字节相同。**此同步不会自动发生**：Claude 修改根仓库后，必须同步到构建 checkout，否则重打包仍会用旧源码。

上述本地改动尚未提交或推送。仅拉取 GitHub 分支，不能得到当前 APK 的完整源码状态。复建工作区的前置步骤见 [本地环境](LOCAL_TEST_ENVIRONMENT_2026-10-07.md) 和 [环境交接](AGENT_HANDOFF.md)。

## 2. 使用的现有工具链

| 项目 | 值 |
| --- | --- |
| 主机 | Apple Silicon / macOS |
| Rust | stable `1.96.0`；缓存工具调用 `rustup run stable cargo rustc` |
| 缓存打包工具 | `/Users/alan0x/Documents/projects/makepad/target/debug/cargo-makepad` |
| 缓存工具所在持久仓库 HEAD | `d4502ef1e4d196d2829a07aa137740cb0581e9b4`；仅记录来源，不是最终运行时版本 |
| SDK 根目录 | `/Users/alan0x/Documents/projects/makepad/tools/cargo_makepad/android_33_macos_aarch64` |
| Java 编译 SDK | `platforms/android-33-ext4/android.jar`（compileSdk 33） |
| Build tools | `build-tools/33.0.1`：aapt、D8、zipalign、apksigner |
| NDK | 现有 `ndk/28.2.13676358` 目录 |
| JDK | SDK 自带 OpenJDK `17.0.2`；javac source/target `1.8` |
| Android target | `aarch64-linux-android`，APK ABI `arm64-v8a` |

没有安装、升级工具链，也没有重建或修改缓存 cargo-makepad。SDK 目录名里的 `android_33` 与 manifest 的 targetSdk 是不同概念：**最终包 compileSdk 33、minSdk 26、targetSdk 35**，已用 aapt 检查。

## 3. 为什么有本地包装脚本

入口是根仓库 `native/octos-learn/scripts/package-android-test.py`，实际执行它在独立 checkout 中的副本。它解决三个构建问题：

1. **重复 Android JNI 入口**：产品和共享预览库都调用 `app_main!`，首次编译出现重复 `Java_dev_makepad_android_MakepadNative_activityOnCreate`。给预览库增加默认 `standalone` feature，条件编译预览的 `app_main!`；产品依赖使用 `default-features=false`，预览二进制声明 `required-features=["standalone"]`。最终由产品导出唯一入口。
2. **缓存工具 Java host 比固定 runtime 旧**：先让已有 cargo-makepad 构建 Rust 和基础 APK；再用固定 `825dbb4` checkout 的 Makepad Java 文件、基础包生成的 `R.java`、产品 `MakepadApp.java` 重新 javac/D8。包装脚本丢弃基础包的旧 DEX，换成新 `classes.dex`。**基础 APK 没有安装到设备，最终 Rust 和 Makepad Java 均对应固定提交**。
3. **完整离线课程与中文字体**：基础资源收集不包含产品动态字体目录。脚本补入 `assets/fonts`，并按 `course-packs.lock.json` 验证每个 .ocpack 的大小/SHA-256 后展开九课到 APK，生成 `catalog.json` 和课程锁文件 hash 标记。

相关源码文件：

```text
native/octos-learn/Cargo.toml
native/octos-learn/src/lib.rs
native/octos-learn/src/audio_playback.rs
native/oll-preview/Cargo.toml
native/oll-preview/src/lib.rs
native/octos-learn/resources/android/AndroidManifest.xml.template
native/octos-learn/resources/android/java/MakepadApp.java
native/octos-learn/scripts/package-android-test.py
```

产品 `lib.rs` / `audio_playback.rs` 是此前 macOS 旁白修复：`AVAudioPlayer` 仅在 macOS 条件编译启用，Android 仍走原 Makepad 音频入口；本次 Android 包没有增加音频后端。

## 4. 可复现命令

以下命令在根仓库执行；要求独立 checkout、课程档案和 Cargo 离线依赖已经准备好。先同步上述本地文件（今后新增文件也需纳入）：

```sh
cd /Users/alan0x/Documents/projects/octos-learn
python3 - <<'PY'
from pathlib import Path
import shutil
root = Path.cwd()
checkout = root / '.local-dev/oll-product/octos-learn'
assert (checkout / '.git').exists(), '先准备独立 checkout'
files = [
    'native/octos-learn/Cargo.toml',
    'native/octos-learn/src/lib.rs',
    'native/octos-learn/src/audio_playback.rs',
    'native/oll-preview/Cargo.toml',
    'native/oll-preview/src/lib.rs',
    'native/octos-learn/resources/android/AndroidManifest.xml.template',
    'native/octos-learn/resources/android/java/MakepadApp.java',
    'native/octos-learn/scripts/package-android-test.py',
]
for relative in files:
    dest = checkout / relative
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(root / relative, dest)
PY

python3 .local-dev/oll-product/octos-learn/native/octos-learn/scripts/package-android-test.py \
  --sdk /Users/alan0x/Documents/projects/makepad/tools/cargo_makepad/android_33_macos_aarch64 \
  --cargo-makepad /Users/alan0x/Documents/projects/makepad/target/debug/cargo-makepad \
  --target-dir "$PWD/.local-dev/android-makepad/target" \
  --archives "$PWD/.local-dev/oll-product/course-packs"
```

脚本设 `CARGO_TARGET_DIR` 为独立 Android target、`CARGO_NET_OFFLINE=true`、`JAVA_HOME=<sdk>/openjdk`，清除 `MAKEPAD_PACKAGE_DIR`。它实际调用：

```sh
cargo-makepad android --abi=aarch64 --min-sdk-version=26 \
  --sdk-path=<上述SDK> \
  --package-name=cc.pitun.learn.makepadtest \
  --app-label='Octos Learn 原生测试' \
  --version-code=20261007 --version-name=0.1.0-makepad-test-20261007 \
  --no-icon build -p octos-learn --release --locked
```

这是命令展开说明，`<上述SDK>` 需替换真实路径；推荐直接执行上面的 Python 入口。产品 release profile `opt-level=3`，日志确认 `Finished release profile [optimized]`。**cargo-makepad 位于 `target/debug` 只是打包工具自身的构建模式，不会把产品变为 Debug。**

`--skip-build` 只跳过 Rust/基础 APK 构建，复用已有基础 APK 重新包装；修改 Rust、Cargo 配置或 manifest 后不要用它，否则可能把旧二进制包装成看似新的包。

## 5. 最终 APK 结构与启动过程

```text
lib/arm64-v8a/libmakepad.so       Rust 产品与固定 Makepad runtime
classes.dex                     固定 Makepad Java host + MakepadApp
assets/makepad/...               基础包原有 Makepad 资源和字体
assets/makepad/octos_learn/assets/fonts/...
assets/makepad/octos_learn/resources/course-packs/
  <packId>/<version>/manifest.json、course.oll.jsonl、audio/...
  catalog.json
  build-id.txt
```

Java `MakepadApp` 继承固定 Makepad 的 `MakepadActivity`。它在 `super.onCreate` 前把内嵌课程复制到本应用私有 `getFilesDir()/course-packs`，检查 build-id 以避免每次复制，设置 `OCTOS_LEARN_PACK_DIR` 后进入 Makepad。首次资源准备实测 772ms；这一次性启动开销没有被证明是持续卡顿的原因。

Manifest：横屏、全屏、硬件加速、OpenGL ES 3、普通/电视启动器；`debuggable=false`、`allowBackup=false`、`extractNativeLibs=true`，允许本地后端 HTTP，仅声明 INTERNET / ACCESS_NETWORK_STATE。

包装时去掉基础包旧签名，执行 `zipalign -f 4`，使用**固定 Makepad 随仓库提供的测试 debug.keystore** 重新签名（不是生产签名）；最终 v2/v3 校验通过。测试签名与 Rust Release 优化是两件独立的事。

## 6. 已安装产物与设备连接

| 项目 | 值 |
| --- | --- |
| APK | `/Users/alan0x/Documents/projects/octos-learn/.local-dev/android-makepad/Octos-Learn-Makepad-Test.apk` |
| 大小 | 83,201,742 bytes |
| SHA-256 | `d07248c149c77f9dd0139c2782c8e57915dffa1de188fa005501dfc0f4e70c58` |
| 包名 / 显示名 | `cc.pitun.learn.makepadtest` / Octos Learn 原生测试 |
| Activity | `cc.pitun.learn.makepadtest.MakepadApp` |
| 版本 | versionCode `20261007`，versionName `0.1.0-makepad-test-20261007` |
| 大屏 | `192.168.1.63:5555`，IWB/M3G2，Android 13，3840×2160 |

首次安装前确认测试包不存在，执行 `adb install`，没有使用 `-r`。原 Web 包 `cc.pitun.learn`（33 / 0.1.2）的安装路径、版本、首次安装/最后更新时间在安装前后相同；未卸载或清理旧包。后续测试更新仍应保持独立包名。

配置了 `adb -s 192.168.1.63:5555 reverse tcp:50080 tcp:50080`，让安卓回环地址连接本机已有 solo 后端。离线课程画面不依赖该连接；没有向模型发送生成请求，也没有把凭据打进 APK。

## 7. Claude 定位性能时应知道的边界

- 当前包是优化 Release，但未声明 Android `profileable`。设备现有 simpleperf 对 `cpu-cycles` 和 `cpu-clock` 都返回权限拒绝，尚无函数调用栈；不能把高 CPU 直接认定为某个布局/字体函数。
- 已只读测得约 12 FPS、事件/绘制线程 93.5–96% 单核占用，系统当前 30Hz；不是完整逐课基准测试。详见 [卡顿证据](ANDROID_UI_STUTTER_INVESTIGATION_2026-10-07.md)。
- 当前包保留设备已有 4K 分辨率和 density override 640，没有做分辨率 A/B；没有改设备性能模式。
- Android 纯音频入口仍是固定 Makepad TODO；产品 Java host 尚未接入预览的 `MakepadAppExtension` / `NativeInkBridge`。不能用此包评价完整旁白、原生手写功能；相机/麦克风也不在此次验收范围。
- 后续若增加 profileable 或 Makepad PerfMonitor 分段计时，应记录新 APK hash、源码状态和运行场景，避免把新包的采样混记到本包。

## 8. 本机证据入口

均在 gitignored `.local-dev/` 下：

- `android-build.log`：Rust Release、基础 APK 构建及字体清单。
- `android-package.log`：最终 Java host 重编译、v2/v3 签名校验。
- `android-prep-native-tests.log`：JNI 入口分离后的产品 11 项测试；不是 Android 真机自动化测试。
- `android-makepad/apk-build.json`、`apk-badging.txt`：产物身份/hash/SDK/ABI。
- `android-makepad/web-preservation.json`、`web-package-{before,after}.txt`：旧 Web APK 保留证据。
- `android-makepad/startup-*.txt`：启动、内存和实际 Surface 呈现。
- `android-perf/`：当前卡顿现场采样。

构建与首次安装的原记录见 [安卓大屏测试版](ANDROID_LAN_PERFORMANCE_TEST_2026-10-07.md)。
