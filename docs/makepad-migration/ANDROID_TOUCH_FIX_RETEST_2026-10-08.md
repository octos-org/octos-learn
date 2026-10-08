# Android 缓存滚动触摸修复验收（2026-10-08）

## 验证结果

从干净的 **`425d25b`** 重新打包并更新独立原生测试 APK，在原 Android 大屏、默认应用1080p下完成复测。**上轮三个问题均在本轮 ADB 触屏检查中通过：第一 / 第三首页卡片起手拖动不再误打开课程集，菜单外部触摸能关闭菜单，菜单条目能打开确认框。重新开始 / 删除学习记录各自的取消和确定按钮均有效。**

滚动后点击卡片、预览、开始互动、返回后滚动和甩动也通过。缓存快速滚动节奏保留：课程集平均 Draw 间隔18.35ms，首页18.49ms。此结论只覆盖本轮检查，不代表产品全部功能或物理面板FPS已验收。

本轮未修改产品源码、主题或 pinned Makepad；仅构建、安装、检查及记录。新包留在设备，所有诊断extra关闭，默认缓存 / 应用1080p。系统显示设置和旧 Web APK安装身份未变。

## 1. 构建及产物

- 产品 `425d25b1ca2213d5cf6ea4c2d7eb47c4653d43c7`，主 / 独立构建checkout同步，`productDirty=false`。
- Makepad `825dbb422c6d7926e111e2ee7831d697870d8671`，OLL `d59b60790e6a2775bff4b2ec16f7223f9354df6d`；依赖未改。
- 沿用前轮 [构建命令](ANDROID_SCROLL_CACHE_RETEST_2026-10-07.md#1-构建和设备身份)：Rust release和Java host重新编译，9个锁定课程包、zipalign、APK v2 / v3签名通过。本轮未重跑Mac单测，实际Android构建和设备检查为本轮验证。
- 包名 `cc.pitun.learn.makepadtest`，名称「Octos Learn 原生测试」，arm64-v8a；版本仍 `202610071 / 0.1.0-makepad-test-20261007.2`。
- APK 83,708,242 bytes，SHA-256 **`3719bd12bdc7e33ab772a35566cfc945eaf841bc728d9cbbeec02abc7fba5b06`**；设备pull的base.apk一致。[构建清单](evidence/android-touch-fix-2026-10-08/apk-build.json)
- 使用 `adb install --no-incremental -r` 完整更新，没有卸载 / 清数据，原生包firstInstallTime保留、课程资源缓存命中。
- 本机版本目录 `.local-dev/android-425d25b-touch/`，APK `Octos-Learn-425d25b-Test.apk`；原始3840×2160截图、APK、完整日志仅存本机及调研镜像的同名版本目录，不入git。

## 2. 触摸检查

Android13 / SDK33 / Mali-G52，设备 `192.168.1.63:5555`。系统3840×2160，density Physical480 / Override640；应用Render scale0.5、SurfaceView1920×1080、逻辑960×540。全程没有执行wm size / density写入。输入为 `adb shell input touchscreen swipe` / `input tap`，以下均为物理坐标；未用真人手指 / 多点触控验证。

| 检查 | 本轮设备观察 |
|---|---|
| 第一首页卡片起手上拖 | fresh首页 `(500,1880)→(500,1400)` /1400ms，页面滚动、抬手留在首页，没有误导航；同一卡片向下拖回也没有打开课程集。 |
| 第三首页卡片起手上拖 | fresh首页 `(3640,1880)→(3640,1400)` /1400ms，页面滚动、抬手留在首页。与上轮失败的两种手势相同。 |
| 滚动后点击卡片 | 第三卡片 `(3500,1550)` 打开「用截面理解多元函数」；空隙滚动后第一卡片 `(500,1550)` 打开「读懂一次函数」。 |
| 菜单位置 / 外部触摸 | 课程集滚动后第一卡片 `(702,1864)` 打开菜单，位置在按钮上方；外部 `(1300,600)` 触摸后菜单消失。 |
| 预览 / 开始互动 | 第二课预览 `(1540,1864)` 打开「一次函数 y=mx+b 的图像与性质」，暂停预览；返回保持列表位置。开始互动 `(2260,1864)` 打开同课播放；暂停、两次下一Beat后保存测试进度，卡片变为「继续学习」。 |
| 重新开始 / 取消 | 第二卡片菜单 `(1945,1864)` →条目 `(1530,1500)` 出现重新开始确认框；取消 `(2290,985)` 关闭确认框，第二卡片仍可继续学习。 |
| 重新开始 / 确定 | 再次打开同一确认框，确定 `(2556,985)` 进入同课并从初始白板播放；测试进度中已有的公式 / 参数说明卡不再显示，暂停截图只剩初始函数图及滑块。 |
| 删除学习记录 / 取消 | 第二卡片菜单→条目 `(1530,1650)` 出现删除确认框；取消关闭确认框，第二卡片仍可继续学习。 |
| 删除学习记录 / 确定 | 再次打开删除确认框，确定后第二卡片变回「开始互动」、其菜单入口消失；force-stop /重启并重新进入列表后状态保持。第一卡片仍显示原来的「继续学习」。 |
| 确认流程后继续滚动 | 课程集空隙 `(1300,1600)→(1300,1900)` /1400ms，列表位置改变、内容正常可见。 |
| 首页甩动 | 空隙 `(64,1880)→(64,1760)` /80ms；抬手后release / later截图内容再上移168物理px，later / settled原始PNG相同，页面仍在首页。 |

重置 / 删除仅使用**本轮新建的第二课测试记录**：检查前第二卡片为「开始互动」、没有菜单；第一课已有记录没有执行重置或删除。第二课测试记录在检查结束时删除。没有声称读取并逐字核对第一课私人存档文件，仅核对其入口仍可继续学习。

14项细分检查、截图文件名见 [touch-results.json](evidence/android-touch-fix-2026-10-08/touch-results.json)，实际动作见 [touch-actions.jsonl](evidence/android-touch-fix-2026-10-08/touch-actions.jsonl)。hostMonotonic只用于各Python调用内排序，不用于跨调用计算时间；性能采样另用设备日志epoch。截图保留原始PNG，未编辑 / 重采样。[甩动像素分析](evidence/android-touch-fix-2026-10-08/visual-comparison.json)

## 3. 默认缓存性能复查

复用前轮启动 / 采样器。两组都fresh启动 `--es octos.OCTOS_PERF 1`，无bisect / render-scale extra；等至少三个perf窗口、导航后再等4s，预热20 logical px短拖动往返。首页x=16 logical，课程集x=325 logical，y=470↔350、16次交替、每次1400ms；物理坐标乘4。开始3s / 末尾1s排除，按设备epoch选窗及边界数加权，观察开销与前轮相同。

| 页面 / 默认缓存 | event ms | draw ms | wait ms | gap ms | SF中位 / p95 ms | 窗口 / 边界数 |
|---|---:|---:|---:|---:|---:|---:|
| 读懂一次函数课程集 | 3.65 | 2.35 | 5.80 | **18.35** | 16.67 /16.67 | 20 /1094 |
| 首页 | 3.94 | 1.64 | 6.38 | **18.49** | 16.67 /16.67 | 20 /1084 |

前轮bf83cf2默认缓存课程集 / 首页gap为17.69 /18.22ms，本轮为18.35 /18.49ms，没有出现原先约50–70ms的慢速状态。wait本轮比前轮高约3ms，未锁定CPU / GPU时钟，也不是交错配对复测，不能把细小差异归因到此次事件修复。本轮没有重复nocache对照。

`event`为应用事件通道；`draw`为平台CPU编码 / GL驱动调用；`wait`为eglSwapBuffers阻塞，包含GPU / buffer queue /同步等待，不是直接GPU执行时长。gap为应用Draw边界间隔，**不是已验证的物理面板FPS**；SurfaceFlinger约127帧环形缓冲只作交叉验证。GPU timer无数据；少数长gap仍存在，ADB交替手势也有切换间隙，平均18ms不代表所有帧均无停顿。[性能汇总](evidence/android-touch-fix-2026-10-08/summary.json)

## 4. 最终设备与范围

最终无extra启动，默认缓存 / 应用自动1080p，停在首页，perf / bisect关闭。设备安装APK hash与构建产物一致，系统size / density前后逐字相同；旧Web `cc.pitun.learn` 的codePath、版本及安装 /更新时间均一致。原生包firstInstallTime保留，后端healthy、reverse50080保持有效。[前状态](evidence/android-touch-fix-2026-10-08/state-before.json) / [后状态](evidence/android-touch-fix-2026-10-08/state-after.json) / [最终启动](evidence/android-touch-fix-2026-10-08/final-startup.txt) / [surface摘录](evidence/android-touch-fix-2026-10-08/surface-final-extract.txt)

两组性能采样及最终进程没有FATAL EXCEPTION / panicked / Fatal signal；最终无纹理高度越界日志。仍有与前轮相同的单行 `SurfaceSyncer: Failed to find sync for id=0` 平台日志，页面实际显示正常，未单独定位该日志原因。

本轮未做课程播放的持续性能采样、全部课程、语音有声输出、IME /多点 /非零safe-area或现场真人手指测试。全UI action触发重绘、60Hz timer及整板refresh仍为尚未修改的后续事项。没有为它们提出新的原因结论或改代码。

报告、perf-only证据及工具按既有用户授权提交推送到同一 `codex/macos-product-ui` 分支，不合并 /不开PR；APK /截图 /完整日志同步到既有本地调研镜像。
