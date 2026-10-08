# Android 启动器纹理缓存复测（2026-10-07）

## 验证结果

从干净的 **`bf83cf2`** 重新打包并安装独立原生 APK，在同一台 Android 大屏、默认应用 1080p 下，完成首页和「读懂一次函数」课程集列表的缓存 / `nocache` 对照。**缓存显著改善滚动性能：课程集平均 Draw 边界间隔 70.43→17.69ms，首页 54.93→18.22ms；swap wait 分别 47.72→2.89ms、39.79→3.42ms。** 前轮 `b6da998` 默认课程集间隔约 51.89ms，本轮缓存也明显优于该历史结果。

交互没有全部通过：**从首页卡片起手竖直拖动，抬手误打开课程集，两个不同卡片均复现。** 从空隙起手滚动后再点击卡片正确；滚动后的预览、开始互动、菜单打开及位置、返回后继续滚动、甩动均通过本轮 ADB 触屏输入检查。另观察到菜单打开后，触摸外部不能关闭，触摸「重新开始」条目没有出现确认框；菜单问题是否由缓存改动引入未确定。

本轮仅构建、安装、采样和记录，未改产品源码或 pinned Makepad。已关闭 perf / bisect 等 extra，设备留下默认缓存版本。系统显示设置、旧 Web APK 安装身份均保持不变。

## 1. 构建和设备身份

- 产品源码：`bf83cf2ba838000bbba4b835b49647cb04cb5868`，主仓库与独立构建 checkout 一致，`productDirty=false`。
- Makepad：`825dbb422c6d7926e111e2ee7831d697870d8671`；OLL：`d59b607`，沿用前轮固定依赖。
- 包名 **`cc.pitun.learn.makepadtest`**，名称「Octos Learn 原生测试」；arm64-v8a / Rust release，9 个锁定课程包；版本 `202610071 / 0.1.0-makepad-test-20261007.2`。
- APK 83,708,242 bytes，SHA-256 **`5f058bd296944ad628e40f31d3039c33316311a51740d52a626e5f03176c3728`**；最终从设备 pull 的 base.apk hash 一致。[构建清单](evidence/android-scroll-cache-2026-10-07/apk-build.json)
- `adb install --no-incremental -r` 完整传输成功，原生包 firstInstallTime 保留；启动日志课程资源 `cached=true`。Rust、产品 Java wrapper、固定 Makepad Java host 均重新编译，javac / D8、zipalign、v2 / v3 签名通过。
- Android 13 / SDK33 / Mali-G52，设备 `192.168.1.63:5555`。系统 3840×2160，density Physical480 / Override640；应用 Render scale0.5，SurfaceView buffer1920×1080，逻辑960×540 / 三列。[最终 surface 摘录](evidence/android-scroll-cache-2026-10-07/surface-final-extract.txt)

实际构建命令（从本仓库根运行）：

```sh
python3 .local-dev/oll-product/octos-learn/native/octos-learn/scripts/package-android-test.py \
  --sdk /Users/alan0x/Documents/projects/makepad/tools/cargo_makepad/android_33_macos_aarch64 \
  --cargo-makepad /Users/alan0x/Documents/projects/makepad/target/debug/cargo-makepad \
  --target-dir /Users/alan0x/Documents/projects/octos-learn/.local-dev/android-makepad/target \
  --archives /Users/alan0x/Documents/projects/octos-learn/.local-dev/oll-product/course-packs
```

本机版本目录 `.local-dev/android-bf83cf2-cache/`，APK `Octos-Learn-bf83cf2-Test.apk`；APK / 原始3840×2160截图 / 完整日志不入 git，另同步调研镜像的 `android-bf83cf2-cache/`。本轮没有重新运行 Mac 单测；实际 Android release 编译及设备检查为本轮验证。

## 2. 采样口径与对照边界

每组 force-stop 后独立启动 `--es octos.OCTOS_PERF 1`；缓存组无 bisect extra，关闭缓存组加 `--es octos.OCTOS_BISECT nocache`，均未设置 render-scale extra。等待至少三个 perf 窗口，课程集组从首页物理 `(500,1800)` 进入「读懂一次函数」，再等4s；首页组保持首页。截图确认场景与开关，无课程播放。

复用前轮采样器：y=470↔350 logical，16次交替、每次1400ms，约24.5s；物理坐标乘4。课程集 x=325 logical 空隙，首页 x=16 logical 左侧空隙，避免卡片误触。正式动作前20 logical px短拖动往返预热。每秒窗口剔除前3s / 后1s，以设备日志 epoch 选窗、按边界数加权；所有组都有相同 top / logcat 开销。一次各组、按下表顺序执行，未锁设备时钟，不把细微差异当作稳定排名。

`event` 为应用事件通道，`draw` 为平台 CPU 编码 / GL 驱动调用，`wait` 为 eglSwapBuffers 阻塞，`gap` 为应用 Draw 边界平均间隔。**wait 包含 GPU / buffer queue / 同步等待，不是直接 GPU 执行时长。** GPU timer 未返回数据（null）。SurfaceFlinger latency 末段环形缓冲约125帧仅作交叉验证。

**本 APK 的 `nocache` 不是原 b6da998 的完整旧渲染路径。** 源码 `scroll_cache.rs` 的 `nocache` 每帧重渲染整个内容到离屏 pass，再绘制纹理四边形；旧版本直接绘制 viewport 内的页面。当前 `nocache` 课程集70.43ms比历史 b6da998 51.89ms更慢，不能将70.43ms写作旧 APK 基线。表格证明同一新构建中复用纹理的收益；历史结果另列比较。

软件 Draw / SurfaceFlinger 时间戳出现约55–56次/秒，而此前设备硬件模式报告30Hz。**这些数不是本轮已验证的物理面板 FPS**，未用外部摄像或硬件显示时序校准。缓存组仍有少数较长 gap，ADB 手势切换有间隙；平均值不等于每帧都无卡顿。Android draw-call census 没有启用，本轮没有实测主 pass 的6次 draw call。

## 3. 性能数据

| 页面 / 模式 | event ms | draw ms | wait ms | gap ms | 1000/gap（Draw边界/秒） | SF中位 / p95 ms | 窗口 / 边界数 |
|---|---:|---:|---:|---:|---:|---:|---:|
| 课程集 / 默认缓存 | 3.41 | 2.18 | 2.89 | 17.69 | 56.52 | 16.67 / 16.67 | 20 / 1134 |
| 课程集 / nocache | 14.82 | 5.59 | 47.72 | 70.43 | 14.20 | 66.67 / 83.33 | 19 / 281 |
| 首页 / 默认缓存 | 2.92 | 2.15 | 3.42 | 18.22 | 54.89 | 16.67 / 16.67 | 20 / 1100 |
| 首页 / nocache | 8.88 | 4.13 | 39.79 | 54.93 | 18.20 | 50.00 / 66.67 | 20 / 374 |

课程集缓存 event+draw 约5.59ms，wait约2.89ms，未缓存分别约20.41 / 47.72ms。首页同样明显减少。本轮数据与“滚动复用整页纹理减轻重复渲染及呈现链路负担”一致；没有进一步定位特定 GPU shader。

每组完整 perf-only 日志、窗口 JSON、latency、启动信息及配置见 [汇总](evidence/android-scroll-cache-2026-10-07/summary.json) 和四个场景子目录。[采样器](evidence/android-scroll-cache-2026-10-07/sample.py) / [启动导航工具](evidence/android-scroll-cache-2026-10-07/run.py) 已保留。

## 4. Android 触摸验证

默认缓存、perf关闭，使用 `adb shell input touchscreen` / `input tap`，坐标均为3840×2160物理坐标；不是现场真人手指测试。动作记录见 [touch-actions.jsonl](evidence/android-scroll-cache-2026-10-07/touch-actions.jsonl)，结果及截图文件名见 [touch-results.json](evidence/android-scroll-cache-2026-10-07/touch-results.json)。

| 检查 | 设备结果 |
|---|---|
| 首页卡片上开始拖动 | **未通过**：fresh首页第三张卡片 `(3640,1880)→(3640,1400)` /1400ms，抬手打开「用截面理解多元函数」；fresh首页第一张 `(500,1880)→(500,1400)` /1400ms，抬手打开「读懂一次函数」。两次不同卡片均误导航。 |
| 首页空隙拖动，之后点击卡片 | 通过：`(64,1880)→(64,1400)` /1400ms 保持首页且页面滚动，随后 `(500,1550)` 打开正确第一课程集。 |
| 课程集滚动后「预览」 | 通过：滚动后 `(300,1864)` 打开第一课「正比例函数 y=kx 与斜率的几何意义」，暂停预览；返回保留滚动位置。 |
| 课程集滚动后「开始互动」 | 通过：`(1013,1864)` 打开同课并播放，截图有暂停按钮及「课程播放中」；暂停、返回后卡片更新为「继续学习」，进度状态刷新可见。 |
| 滚动后「⋯」菜单 | 打开和位置通过：`(702,1864)` 打开第一卡片菜单，位于其上方；未执行重新开始 / 删除记录。 |
| 点击菜单外部 | **未通过**：菜单打开后 `(1300,600)` 未关闭；随后滚动页面时菜单仍停留原屏幕位置。是否由本次缓存引入未建立对照。 |
| 菜单条目触摸 | **未通过**：重新进入列表、滚动并打开菜单，点「重新开始」行内 `(250,1500)`，没有确认框、菜单保持原样；同一行另一个位置 `(500,1500)` 结果相同。未执行重置或删除。 |
| 首页甩动 / 惯性 | 通过：空隙 `(64,1880)→(64,1760)` /80ms，抬手后页面继续移动；release与later截图内容再向上移166物理px，之后两图稳定。 |
| 从课程返回后再次滚动 | 通过：无弹出菜单时从预览返回，`(1300,1600)→(1300,1900)` /1400ms，列表位置变化，文字和封面继续正常显示。 |

源码中可核查的事件顺序：`ScrollCache::handle_event` 在子 view 处理后执行 `track_press(event,true)`；对 TouchState::Stop 会清除 `press_scroll`。外层 `App` 在 `ui.handle_event` 返回后又调用 `ScrollCache::map_event`，再做 `handle_launcher_taps`。后一次映射此时可使用当前滚动偏移。**这是源码顺序的观察，未插入逐事件日志确认它就是误点击原因。** 菜单外部关闭分支目前只匹配 `Event::MouseDown`；菜单条目也在 `handle_launcher_taps` 中用传入事件做 hit-test，而菜单位于屏幕坐标的浮层。没有为这些发现修改代码。

此前 `053cfaf` 的卡片拖动真机通过记录是历史结果，本次 `bf83cf2` Android 同类交互未通过，不能继承以前的通过结论。

## 5. 视觉与清晰度

检查了默认缓存的首页、课程集、滚动后卡片和菜单原始截图，未见明显新增文字模糊、整页空白或当前内容截断。课程集 cache / nocache 截图预热后的滚动停止位置相差2物理px；对齐后顶部/正文ROI `(100,0)–(3650,1300)` 平均通道差约0.00056/255，变化像素约0.0061%。首页相同区域对齐2px后差约0.00074/255。以上只是选定ROI，不代表全页面逐像素完全相同。

缓存课程集与前轮b6截图同一ROI差约0.111/255；图片对照未显示明显新增清晰度损失。[像素分析](evidence/android-scroll-cache-2026-10-07/visual-comparison.json)。甩动截图对齐分析确认 release→later 再移动166物理px。未编辑或重采样交付截图，均保留设备原始3840×2160 PNG。

应用仍以1080p surface缩放到4K；缓存效果是在这一相同分辨率下比较。本轮未重新做4K原生对照，现场观看距离的清晰度接受度仍由用户判断。当前页面无 texture-height-limit 日志；超过8192物理px的页面未测试。

## 6. 最终交付状态

最终启动无额外参数，默认缓存 / 应用自动1080p，perf / bisect关闭，停在首页。四组性能运行无 FATAL EXCEPTION / panicked；最终进程无此类错误或内容高度越界日志。启动有平台 `SurfaceSyncer: Failed to find sync for id=0` 单行，实际页面显示正常，未单独定位该日志原因。

系统 size / density 前后逐字一致；旧 Web `cc.pitun.learn` 的 codePath、versionCode / Name、firstInstallTime、lastUpdateTime 均一致。新原生包更新后 firstInstallTime 保留、资源缓存命中、设备 APK hash 与构建产物一致。Mac后端health=healthy，reverse50080有效。[前状态](evidence/android-scroll-cache-2026-10-07/state-before.json) / [后状态](evidence/android-scroll-cache-2026-10-07/state-after.json) / [最终启动](evidence/android-scroll-cache-2026-10-07/final-startup.txt)

本轮报告、perf证据和复测工具提交推送到同一 `codex/macos-product-ui` 分支；没有产品实现改动、PR或合并。APK / 原始截图与日志同步到既有调研目录版本镜像。
