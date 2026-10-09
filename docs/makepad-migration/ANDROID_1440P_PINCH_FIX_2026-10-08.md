# Android 默认 1440p 与双指缩放刷新修复（2026-10-08）

## 结果

用户接受一定卡顿以提高可读性，并授权 GPT 直接定位、修复和真机验证。基于 Claude 的 `5bbadde`，产品修复提交 **`3b32127`** 已重新打包安装。无任何启动 extra 时，SurfaceFlinger 确认实际 buffer **2560×1440**，compositor 以 **1.5×** 放大至 3840×2160；逻辑布局仍为 960×540。

双指缩放零复用的来源已定位为 **`main_window` 最外层 View 的 `ViewAction::FingerMove`**。修复后同一手势采样中的完整遍历 / 复用从 **112 / 0** 变为 **5 / 100**，主线程应用 busy 从 **37.2%** 到 **12.4%**。连续窗口 gap **42.4 → 43.0ms**，没有证据表明本次修复提升了帧率；1440p 仍受平台等待限制，尚未达到稳定 33ms。默认保持用户选定的 1440p。

## 定位证据与修法

临时在 `Event::Actions` 中记录 `as_widget_action()` 的 UID、控件树路径、类型与变体，每秒计数，未打印动作正文。真机日志为：

```text
[actions] uid=WidgetUid(3) path=[0, main_window]
type=TypeId(0x2d03c10902240ab3b17beb22a69a953e)
is_view=true variant=FingerMove count=24
```

同一段的其他窗口 count 为 16、24、18、31 等；来源一直是窗口 View，未发现卡片或滑块持续发动作。完整逐秒证据在 [修复前动作与性能日志](evidence/android-1440-pinch-fix-2026-10-08/before-path-perf.txt)。

固定 Makepad 的 `Window` 内嵌 `View`，默认带 cursor；`View::handle_event` 在处理子控件后执行 hit 检测并发出原始 Finger 动作。产品 `SpatialBoard::pinch_event` 处理多点 `TouchUpdate` 后直接返回，不走单指 hit 路径。窗口捕获未被子控件捕获的手指是与源码一致的解释；此次未记录逐手指 capture 状态。**窗口 View 持续发 FingerMove、应用收到 Actions 后 refresh → set_state → 内容标脏，是日志和源码共同确认的链路。**

修复在产品 UI 分发边界进行：

- 仅 `ANDROID_UI && learning_visible` 时，使用 `cx.map_actions` 过滤**本次 UI 分发新增**的动作；窗口 UID 动态从 `main_window` 取得，没有硬编码 3。
- 仅丢弃该窗口自身的 `ViewAction` 指针变体：Down / Move / Up / LongPress / HoverIn / HoverOut。输入事件仍完整传给 UI，原有 hit、capture、cursor 和子控件处理照常执行。
- 保留子控件动作、按钮、滑块、文本输入、窗口生命周期、键盘和非 widget 动作；`handle_server` 在边界之外，它产生的动作也保留。现有 Actions 刷新语义未整体改写，没有用不完整的 TickKey 去拦截所有控件变化。
- 首页 / 课程集和正常 macOS UI 不走该过滤；没有修改固定 Makepad，也没有引入白板纹理缓存。

实现：`native/octos-learn/src/board_actions.rs` 与 `lib.rs` 的 UI dispatch。增加两项动作路由测试，涵盖根 / 子 View、按钮、滑块、输入、键盘、窗口关闭和非 widget 动作。临时 action 跟踪已经移除；交付包保留原来的默认关闭 OCTOS_PERF / OCTOS_BISECT。

## 性能复测

M3G2 / Android 13 / Mali-G52 MC1，同一锁定 `slope-and-intercept` 课程预览。预览播放约 5 秒后暂停，中心物理坐标 `(650,1100)`，临时独立 Instrumentation APK 注入约 5 秒 `SOURCE_TOUCHSCREEN` finger MotionEvent。双指半径随相同正弦轨迹变化，单指按相同轨迹平移；不是鼠标模拟。

修复前为 `5bbadde` 加临时 trace；修复后先使用保留 trace 的诊断构建验证来源消失，再用无 trace 的干净 `3b32127` 复核。trace 自身成本包含在修复前 busy 中，精确成本未单独扣除。所有组均未指定 render scale，使用新的精确 2560×1440 默认。

| 组 | 完整遍历 / 复用 | refresh | busy | 平台 draw(ms) | wait(ms) | 连续窗口 gap(ms) |
|---|---:|---:|---:|---:|---:|---:|
| 修复前双指，第一次 | 103 / 0 | 106 | 40.0% | 6.2 | 20.6 | 43.6 |
| 修复前双指，附路径 | 112 / 0 | 114 | 37.2% | 6.3 | 19.2 | 42.4 |
| 修复后双指，诊断包 | 5 / 105 | 0 | 11.5% | 5.0 | 28.2 | 42.8 |
| 修复后单指，诊断包 | 1 / 100 | 0 | 9.0% | 5.5 | 36.6 | 45.7 |
| 修复后双指，最终包 | 5 / 100 | 0 | 12.4% | 5.0 | 29.1 | 43.0 |

表中 draw / wait、计数与 busy 取注入开始后 1 秒至结束的每秒窗口；gap 另外取至少 5 Draw 且 max gap ≤150ms 的连续窗口，排除触摸开始前暂停所造成的长 gap。两种口径不能视为完全相同的帧集合。原始窗口保留在 [aggregate.json](evidence/android-1440-pinch-fix-2026-10-08/aggregate.json)；表内 draw 经四舍五入，若有差异以 JSON 为准。

少量完整遍历仍是绘制覆盖范围等复用安全条件所需；不是所有缩放帧都应该复用。此性能样本没有笔迹，存在笔迹 / 选区时原有缩放安全条件仍可能要求完整绘制。

最终包从头预览播放约 24 秒：稳态 19 个窗口中 Draw **46**，完整遍历 / 复用 **28 / 18**，busy **7.9%**，wait **21.6ms**，tick_unchanged **1070**、tick_refresh **26**；静止时无 Draw 的行为保持。只有 2 个连续窗口，gap **55.8ms**，不能代表整课帧率。未重跑全部成本开关和九门整课。

gap 是应用 Draw 边界间隔，wait 是 eglSwapBuffers 等待；没有 Android GPU timer 数据，不能把它们当成已确认物理 FPS / 精确 GPU 执行时间。本次省 CPU 和取消无变化刷新已确认，稳定 30fps 未确认。

## 触摸与清晰度

最终包触屏检查：

- 左上角返回首页有效；右下角课程目录开 / 关有效。
- 课程内「大图」及「关闭大图」有效。
- 拖斜率滑块，值从 1.00 到 3.85，直线、割线标签同步更新，说明控件动作没有被过滤。
- 新建空白测试板，取消登录后写线，物理 `(1200,800)` 到 `(1800,1100)` 对应截图落点；在 `(1100,700)` 到 `(1900,1200)` 框选，显示「已选 1」，选框覆盖该笔迹。未发现比例偏移。
- 框选自动识别再次要求公网登录；已取消，没有发验证码、提问或课程生成请求。只确认选区坐标，不作为登录 / 识别 / 生成流程验收。该无问题的新白板按 `save_live` 空内容条件不持久化，课程预览也不保存学习进度。

原始截图为系统合成后的 3840×2160，内部绘制缓冲区为 2560×1440；不是原生 4K 渲染。课程截图：`.local-dev/android-1440-pinch-fix/final-pinch/before.png`；首页：`touch-check/final-home.png`；笔迹和选区：`touch-check/ink-line.png`、`selection-login-dismissed.png`。本轮未拍现场正常观看距离照片，清晰度最终接受程度由用户看图 / 现场确认。

## 构建与最终设备状态

- 产品干净 **`3b321277f0a3482d10b1a64db15a12d92c2eeceb`**，`productDirty=false`；OLL `4263b2216f3968f2200b05f40b2dc1e94db5d802`。
- 固定 Makepad `825dbb422c6d7926e111e2ee7831d697870d8671`，保留此前用户授权的矢量颜色补丁；没有新增 Makepad 改动。
- 既有打包脚本 / SDK / cargo-makepad，ARM64 release、locked offline，Java host 与产品 MakepadApp.java 均重新编译；9 个课程包与中文字体包含。构建步骤见 [APK 构建交接](ANDROID_APK_BUILD_HANDOFF_2026-10-07.md)。
- 独立包 `cc.pitun.learn.makepadtest`，83,892,759 bytes；SHA-256 **`148869d60193918d32dbfe0c1fa99817546f1ded0b0b529bc2e248fe98b64ae3`**，设备安装文件哈希一致。APK v2 / v3 签名校验通过，使用非增量 `-r` 更新，首次安装时间保留。
- 产品测试 **18 passed / 2 ignored**；共享白板 **19 passed**。两个 ignored 是原有音频依赖测试。本轮未重新打包 macOS 应用。
- 默认公共后端 learn.pitun.cc 和邮箱认证保持；没有改回 solo。
- 正常启动，无任何 extra，perf / bisect 关闭，临时手势包已卸载，电视留在首页。原系统 size 3840×2160、density 物理480 / override640 未变，旧 Web `cc.pitun.learn` 的安装路径、版本及安装时间未变。最后进程日志未见 fatal / panic。

完整 APK、构建 / 原始日志、截图与脚本位于 `/Users/alan0x/Documents/projects/octos-learn/.local-dev/android-1440-pinch-fix/`，镜像位于调研目录下同名 `android-1440-pinch-fix/`。版本目录镜像包含本报告、交接与进度副本。可随 git 交接的测量摘要、逐秒数据、动作来源、构建身份与测试输出在 [evidence 目录](evidence/android-1440-pinch-fix-2026-10-08/)。代码 / 记录只推同分支，不合并、不开 PR。
