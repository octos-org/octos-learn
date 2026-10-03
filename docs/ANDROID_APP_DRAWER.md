# 皓丽会议大屏“全部应用”入口

记录：2026-10-03（America/Los_Angeles）。已安装并实机验收。

## 使用

点屏幕左侧或右侧的皓丽把手，在展开的侧边栏点第二个四宫格图标，进入“全部应用”。Octos Learn 排在第一位。可按应用名称或包名搜索，点击图标打开；“返回”恢复之前的应用，“桌面”进入当前默认 Home。原皓丽返回、Home、工具、批注、分屏继续可用。

这是独立原生 APK `cc.pitun.appdrawer`（1.0.0 / versionCode 1，20,978 字节），源码位于 `android/tools/app-drawer/`。它是普通 Activity，没有悬浮窗、常驻服务、网络权限或应用内 root 调用。未改动 OctoSense、Octos Learn APK 和皓丽系统 APK。原 `com.octosense.sidebarstarter` 继续负责开机启动皓丽侧边栏。

## 原生侧边栏为什么以前配置无效

从本机读取的 `/system/priv-app/Horionbar/Horionbar.apk` 确认：

- `SwitchPersonalMode.getApplicationList()` 从 **Settings.Global** 读取 `personal_horionbar_app1..4`，旧实录写入的 Secure 命名空间不生效。
- `BaseApplication.mode` 由 `persist.sys.horion.personal.mode` 控制。原设备属性未设置，等效 false；此时四个自定义槽隐藏。
- `com.horion.horionSettionMenu.personal.modeChange` 广播会重新读取模式并重建左右把手及侧边栏，不需要禁用或替换系统组件。

最终状态：

| 项目 | 原值 | 最终值 |
|---|---|---|
| `persist.sys.horion.personal.mode` | 未设置（false） | `true` |
| Global `personal_horionbar_app1` | `com.horion.writer` | 原值 |
| Global `personal_horionbar_app2` | `com.horion.null` | `cc.pitun.appdrawer` |
| Global `personal_horionbar_app3` | `cn.kgzn.jkf.screenshare` | 原值 |
| Global `personal_horionbar_app4` | `com.horion.filemanager3` | 原值 |

## 应用枚举与升级

普通 `PackageManager.queryIntentActivities(MAIN + LAUNCHER)` 在此设备得到的可显示列表只有 36 个入口，`MATCH_ALL` 和按安装包查询也未补齐。最终采用 Android 专用 `LauncherApps.getActivityList()` / `startMainActivity()`，并合并 TV-only `LEANBACK_LAUNCHER` 入口，按 ComponentName 去重。完整列表为 42 个入口；隐藏抽屉自身及仅开机用的 SidebarStarter。系统可能提供某些应用的详情入口，因此列表数不能简单等同于 ADB 的 MAIN/LAUNCHER 查询数。

Manifest 为专用本机应用抽屉声明 `QUERY_ALL_PACKAGES`，应用列表仅在设备内读取。查询在后台执行；打开页面及包新增、移除、变化时刷新。采用中文名称排序，Octos Learn 优先。

皓丽 `SettingUpdateReceiver` 在 APK 替换安装时也会处理 PACKAGE_REMOVED，导致绑定该包的应用槽恢复默认值。因此**更新抽屉须使用安装脚本重新绑定**，不要只运行 `adb install -r` 后就认为入口仍在。

## 构建和安装

默认复用兄弟仓库 Makepad 的 Android 33 工具链和 debug keystore，无需 Gradle 或重建主产品：

```bash
bash android/tools/app-drawer/build.sh
bash android/tools/app-drawer/install-horion.sh 192.168.1.63:5555
```

安装脚本仅接受明确的设备 serial，核对 `ro.build.soft.customer=HORION`，先备份第二应用槽及模式，然后安装 APK、恢复绑定并发送刷新广播。设置持久模式时使用设备已有 `su 0`。它不改默认 Home，也不改其余三个应用槽。

输出 `delivery/horion-app-drawer/Octos-All-Apps.apk`。可通过 `OCTOS_DRAWER_SDK_ROOT`、`OCTOS_DRAWER_JAVA_ROOT`、`OCTOS_DRAWER_KEYSTORE`、`OCTOS_DRAWER_OUTPUT`、`OCTOS_DRAWER_ADB` 指定本机依赖路径。当前脚本使用 build-tools 33.0.1 / android-33-ext4 / androiddebugkey。

最终 APK SHA-256：`9c282c9c5a49f399545b4c3e75ef1b47f7733ece54302910008157db29807c4a`。

## 本次设备验收

设备为 `192.168.1.63:5555`，M3G2 / IWB / SKG，Android 13；3840×2160、density override 640，显示与网络配置未修改。

- 构建、APK 签名验证、Shell 语法检查通过；无 AndroidRuntime 崩溃。
- 左右皓丽侧边栏第二槽均显示四宫格图标。
- 通过侧边栏打开抽屉，显示 42 个应用入口；Octos Learn 排第一。
- 从网格真实点击启动 Octos Learn、文件管理器，前台 Activity 与目标包一致。
- 包名搜索 `com.horion.filemanager3` 显示一个匹配结果。
- 从文件管理器打开抽屉后，点“返回”恢复文件管理器；侧边栏 Home 返回 OctoSense。
- 用临时验收 APK 检查新应用发现：打开抽屉后数量为 43；保持页面打开并卸载该 APK，列表自动恢复为 42。临时应用已卸载。
- 实际重启一次大屏：默认桌面仍为 OctoSense；原 SidebarStarter 收到 BOOT_COMPLETED，侧边栏自动恢复；模式 true / 槽 2 绑定持久，点击入口仍显示 42 个应用。
- 无额外悬浮窗口；书写区仍只使用原皓丽把手。未在真实课程里新增笔迹做额外书写压力测试。

本机验收截图与 XML 放在 gitignored `delivery/horion-app-drawer/verification/`；本次创建的 `/sdcard/octos-app-drawer-*.xml` 已清理。此独立工具未更改前端，不涉及课程生成模型或生成速度；没有重新部署公网，也没有重新构建学习产品。

## 回滚

恢复本次改动前的侧边栏布局并移除新工具：

```bash
adb -s 192.168.1.63:5555 shell settings put global personal_horionbar_app2 com.horion.null
adb -s 192.168.1.63:5555 shell su 0 setprop persist.sys.horion.personal.mode false
adb -s 192.168.1.63:5555 shell am broadcast -a com.horion.horionSettionMenu.personal.modeChange -p com.horion.horionbar
adb -s 192.168.1.63:5555 uninstall cc.pitun.appdrawer
```

`false` 与原来该属性未设置时的侧边栏行为一致。保留原 SidebarStarter；OctoSense 默认桌面设置无需变动。后续升级时如设备自定义配置已有变化，应以安装脚本保存的 `before-*/app2.txt` 和 `personal-mode.txt` 为准。
