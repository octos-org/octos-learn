# macOS / Android 最新修复重建（2026-10-08）

按用户要求重新构建两平台原生版本，供用户重新测试。产品为干净的 `2666794d20cea9083a756f19ef447000a77bc4fa`，包含 Claude 的 f1f4130、87b3b81、11cc594、43815a4、2666794 五块修复。**本轮仅构建、安装与首页启动检查，不是十五项修复的功能验收。**

## 依赖

- 独立构建 checkout：`.local-dev/oll-product/`，产品与主仓库同步。
- OLL 更新至 `4263b2216f3968f2200b05f40b2dc1e94db5d802`，含 `40162b3` 与 `4263b22` 音频时钟修复。没有切换其他持久仓库的工作分支。
- Makepad 仍固定 `825dbb422c6d7926e111e2ee7831d697870d8671`；在该独立 checkout 应用已获授权的 [矢量颜色补丁](../../native/patches/makepad-825dbb4-vector-color-unorm8.patch)，反向 `git apply --check` 通过。此版本不能用未打补丁的 Makepad 打包。
- 其余依赖见 [source-versions.json](evidence/rebuild-2666794-2026-10-08/source-versions.json)。九个锁定课程包保持原哈希，两个打包脚本均校验通过。

## 产物与测试入口

- Mac（Apple Silicon）：`.local-dev/oll-product/octos-learn/native/octos-learn/dist/Octos Learn.app`；release 构建、ad-hoc 签名及 `codesign --verify --deep --strict` 通过。新版已直接启动包内可执行文件，使用原 `.local-dev/app-data`，Metal 首页抓图正常。运行日志 `.local-dev/native-app.log`。
- 日常重开仍用 `.local-dev/start-macos.command`，沿用 `http://127.0.0.1:50080` 本地 solo 后端。后端本轮健康检查通过。
- 本地交付目录 `.local-dev/rebuild-2666794/`，包含 `Octos Learn.app`、`Octos-Learn-2666794-macOS.zip`、`Octos-Learn-2666794-Test.apk`、原始首页截图与完整构建 / 测试日志；同步到既有调研镜像的同名目录。二进制、截图和完整日志不入 Git。
- APK：独立 `cc.pitun.learn.makepadtest` /「Octos Learn 原生测试」，arm64-v8a release，83,839,414 bytes；SHA-256 `632660cf51afe3843c1f9e1438ff31ca12054e22de84e4f4202f19be4265bf61`。Java host 重新编译、zipalign、v2 / v3 签名校验通过。[构建清单](evidence/rebuild-2666794-2026-10-08/apk-build.json)
- APK 已用 `adb install --no-incremental -r` 更新原局域网大屏；安装后 pull 的 base.apk 哈希与产物一致。firstInstallTime 保留，没有卸载或清数据。默认诊断全关、应用自动1080p，停在首页。启动5s时第一张截图仍黑屏，后续抓图已显示首页正常；未定位这段初始化耗时原因。
- 系统仍3840×2160 / Physical density480、Override640；旧 Web `cc.pitun.learn` 的身份 / 安装更新时间前后相同。[前状态](evidence/rebuild-2666794-2026-10-08/state-before.json) / [后状态](evidence/rebuild-2666794-2026-10-08/state-after.json)

## 验证范围

现有 release 测试：OLL runtime 61 passed；产品15 passed /2 ignored；共享白板18 passed。两项忽略测试为显式启用的音频文件 / 全课程音频时长检查，本轮没有启用。测试输出及汇总保留在本地，[汇总](evidence/rebuild-2666794-2026-10-08/test-summary.json)。九课程这里只做打包哈希核验，未逐课回放。

两个平台首页均实际抓图查看。安卓启动进程没有匹配到 FATAL EXCEPTION / panicked / Fatal signal；仍有平台 SurfaceSyncer / swap behavior 日志，不能据此宣称所有设备行为无问题。Android 构建有固定 Makepad 的 `stdin_apply_native_geom` 及 filesystem-watcher 的 `emit` dead_code 警告，未修改或抑制。

本轮未实测双指缩放、笔模式双指、现场有声旁白、辅助卡片按钮及拖动、十五项逐项验收或新性能数据；它们留给用户本次重新测试。Mac 现有学习进度未清理，Android 学习记录未执行重置或删除。Windows 本轮没有构建。
