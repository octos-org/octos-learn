# 安卓原生界面严重卡顿：现场采样结果

2026-10-07。用户反馈「整个界面，包括首页和按钮点击」都卡。本轮只读取设备状态、帧记录和源码，没有修改实现、重装/重启应用或调整设备分辨率、密度、频率及系统权限。

## 已确认

当前 `cc.pitun.learn.makepadtest` 的实际呈现约 **12 FPS**，原生事件/绘制线程接近吃满一个 CPU 核心。此线程同时处理输入事件和绘制，因此它忙不过来时，按钮响应也会延迟。不是只在三维课里出现的用户反馈。

这是当前 Android 原生版本的实际性能问题。此前安装验证只确认应用可启动、课程资源齐全和 GPU 有呈现，不能证明流畅；这次补充的数据表明还没有通过性能验收。

| 项目 | 现场证据 |
| --- | --- |
| 设备 / 应用 | `192.168.1.63:5555`，Android 13，应用 PID 7544 |
| 实际呈现 | SurfaceFlinger 前后两次记录各有 126 个有效时间戳，平均帧间隔 82.93 / 83.07ms，中位数 83.33ms，最大约 100ms；约 12 FPS |
| 持续呈现 | 两次记录之间新增 43 个呈现时间戳，采样并非读取一个已停止刷新窗口的旧帧列表 |
| 原生线程 | TID 7571，`Thread-1`，四次 top 样本约 93.5–96% 单核 CPU，运行/就绪状态为主 |
| Java 主线程 | PID/TID 7544，同期约 1–3.2% CPU；不能将 Android 的低负载 Java `RenderThread` 当成本应用原生渲染线程 |
| 刷新预算 | 系统显示模式 30Hz，VSync 周期 33,333,333ns；实际帧间隔约是预算的 2.5 倍 |
| CPU 时钟 | 采到 policy0 当前 1,920,000kHz（只作现场读数，不代表全程固定） |
| GPU | 驱动 `gpuinfo` 返回 `Mali-G52 1 cores r1p0 0x7402`；物理分辨率 3840×2160 |
| 应用内存 | 一个样本 TOTAL PSS 408,453 KiB，GL mtrack 116,768 KiB，应用 SwapPSS 155 KiB |
| 温度与降频 | thermalservice 状态 0；当前温度约 55.3°C，CPU/GPU cooling state 为 0，没有该样本的热降频报告 |
| 当前内存/I/O 压力 | vmstat 短采样 si/so 为 0、I/O wait 为 0；memory/io PSI avg10/avg60 为 0。系统 zram 已接近满，不能据此宣称系统内存永远充足，但本次没有观测到持续换页瓶颈 |

`dumpsys cpuinfo` 曾显示应用约 25% CPU，设备有四核；它与线程 top 接近一个核心满负载的结果一致，不意味着应用很轻。

## 对「为什么整个界面都卡」的解释

固定 Makepad 的 Android `Cx::main_loop` 在同一个原生线程上处理 Java 输入消息、平台事件和 `handle_drawing`，不是由 Android Java `RenderThread` 负责该画布。平均呈现间隔约 83ms，相比 30Hz 的 33ms 预算已经明显超时，输入和绘制共享线程使卡顿扩散到按钮和普通界面。

源码位置（固定依赖根目录 `.local-dev/oll-product/makepad`）：

- `platform/src/os/linux/android/android.rs:353`：主事件循环，同步分发消息后执行绘制。
- `platform/src/os/linux/android/android.rs:1629` 附近：`handle_drawing` 包含 Draw 事件、shader 编译与 repaint。
- 同文件 `present_window_for_active_backend`：OpenGL swap 的等待也在该路径，需要与 CPU 业务/布局绘制成本分开测量。
- `platform/src/perf_monitor.rs`：已有 event、draw event、GC、draw、drawable wait、GPU 的分段测量能力。

产品源码有几个需要测量而非直接判罪的方向：

- `native/octos-learn/src/lib.rs:4254` 设置了 60Hz 定时器，与大屏 30Hz 不一致；应检查是否导致静止页面仍持续分发/重绘。仅定时器存在不证明它就是主要热点。
- `lib.rs` 的 `refresh` 会同步页面标签、控件及白板，并发出 UI redraw；需要区分值未变时的重复更新与必要更新。
- `native/oll-preview/src/spatial_board.rs:2145` 遍历课程卡片并绘制、测量布局；检查不可见内容剔除和稳定布局的重复工作。这是课程场景候选，不能解释性地替代首页测量。
- 首页有 SVG 封面和中文文字。固定 Makepad 的静态 SVG 代码本身已有几何缓存，不能未采样就认定每帧重新细分 SVG；文本排版、字体缓存、GPU 提交与 driver 成本也需分段定位。

4K 和设备 GPU 会放大绘制成本，但尚未做保持逻辑布局一致的分辨率对照实验，因此 **不能把全部问题归因于 4K 或大屏硬件，也不能断言 Makepad 必然比 Web 慢**。当前交付确实为 Rust release，不是误装了 debug APK。

## 尚未定位到具体热点函数

尝试设备已有 simpleperf 的 `cpu-cycles` 和软件 `cpu-clock` 采样，均被 Android 的 perf-event 权限拒绝。没有修改系统权限、root、降低安全设置或覆盖用户应用来绕过。此次尚无函数级调用栈，也没有可用的 GPU 耗时样本；不能凭单核满负载断定全部耗时来自业务 CPU 而非 GL driver 调用。

下一步应使用独立可采样的 release 测试包，或启用现有 Makepad PerfMonitor，记录首页静止、首页点击/滚动、课程播放及三维互动的分段耗时。先区分事件/布局、CPU 绘制/GL 提交、swap 等待与 GPU 时间，再做针对性修改。可在证据支持后评估：停止无变化重绘、缓存布局与图形、剔除视口外节点、调整设备绘制分辨率。不要先用整体降分辨率掩盖其他热点。

## 证据目录

`/Users/yangyang/Downloads/android-perf`：

- `threads.txt`：四个线程 CPU 快照。
- `latency-before.txt`、`latency-after.txt`：SurfaceFlinger 实际呈现时间戳。
- `gpu.txt`、`frequency.txt`、`gpuinfo-vmstat.txt`、`pressure.txt`：显示模式、GPU/CPU、换页与压力现场数据。
- `simpleperf-record.txt`、`gpu-sampling.txt`：采样权限受限的记录。
