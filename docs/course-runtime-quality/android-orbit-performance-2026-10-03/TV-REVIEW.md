# Claude 审核后电视复测（2026-10-03）

## 版本与安装

- 前端 PR [#41](https://github.com/octos-org/octos-learn/pull/41)，分支 `codex/android-performance`，测试源码 `433b1b4ce797d4eadc6da2d17ca8af88d43128bd`。
- OLL PR [#20](https://github.com/alan0x/octos-lesson-language/pull/20)，分支 `codex/slider-live-performance`，依赖 `78b444fac4a2ed09edb2ed03158774aa789d0fc4`。
- 用户要求先提交另一个任务的 `codex/horion-app-drawer`：已提交 `faf1df2` 并创建 [PR #42](https://github.com/octos-org/octos-learn/pull/42)，然后原工作区切回上述性能分支。独立 checkout 的安装准备已停止，没有从该目录构建 APK。
- 原工作区 `pnpm install --frozen-lockfile`、Android/Vite、Gradle debug 构建及 v2 签名验证通过。构建时无 tracked 改动；`public/demo/` 是用户既有未跟踪目录，因此 build-info 的 dirty=true。它未加入任何提交。
- APK：`delivery/android-review-tv/octos-learn-reviewed-20261003.apk`，107,349,088 字节，SHA-256 `30658aa199f36b7c1af0e521a7bc8f6d14e82b1f5ba21ee2779b2dfeb35c1d9c`；电视实际安装 base.apk 哈希一致。build-info revision=433b1b4，builtAt=`2026-10-03T17:10:25.498Z`。
- 使用 `adb install -r` 更新电视 192.168.1.63:5555；未清除学习数据、未改显示/默认桌面/侧边栏、未部署公网。9 个内置 archive.ocpack 与上一轮已验收 APK 逐字节一致，见 [APK 核验](review-tv/apk-verification.json)。

## 审核修复及结果

1. **二维图旧 SVG 叠加**：范围变化时替换已有 SVG，而不是追加。电视新 APK 的既有“斜率是什么？”课程主图和大图各执行 10 轮放大 + 平移，始终只有一个 SVG，当前 SVG 保持键盘事件处理；恢复后坐标轴和曲线几何一致，参数、白板镜头、笔迹不变。[主图/大图结果](review-tv/plot-regression.json)。另外通过 Android `input swipe` 拖动真实图内视角：收到 touch 事件、曲线几何改变、六次 DOM 观察均为单一 SVG，镜头与笔迹不变；随后恢复并关闭探索。[原生触摸结果](review-tv/plot-native-after.json)。
2. **三维图第二触点泄漏到白板导航**：pointerdown 的 preventDefault/stopPropagation 提前到已有拖拽判断之前。在同一电视 WebView 挂载临时独立白板，使用 APK 构建所用的锁定依赖打包 renderer；CDP Input.dispatchTouchEvent 输入两个可信触点，移动 8 次。得到一次 start、8 次 update、一次 commit；第二触点未冒泡到白板，镜头固定，最终 yaw=1.008、pitch≈0.47、zoom=1；144 个曲面元素全部保留。[双触点结果](review-tv/touch-scene.json)。测试不调用学生课程 Runtime、不写学习操作日志。
3. **待处理/失败问题卡片笔迹穿透**：真实 SelectionEnhancementLayer 源码临时挂载两张卡，不请求模型、不创建问题记录。两张卡均包含 data-oll-ink-input=ignore，Android 原生 bridge 的避让矩形覆盖整卡。[避让配置](review-tv/question-before.json)。开启书写后，通过 Android 原生 input 对两卡各点击、拖拽一次：四个 touch down 交给卡片，拖拽回调更新位置，笔迹序列完全相同、数量仍为 64。[触摸结果](review-tv/question-after.json)。随后移除临时卡，恢复浏览工具。

测试夹具调试时先误选了连接层 SVG、又在自动取景未结束时比较镜头；修正为三维 SVG 并等待取景稳定后，完整回归通过。二维恢复按坐标轴/曲线几何比较，避免正常重建时唯一 clipPath ID 的变化导致错误判定。这些调整没有改生产源码。

## 性能回归对照

审核前为上一轮用户已接受的旋转优化 renderer，审核后为当前锁定 renderer。在同一电视 WebView 按 A/B/A/B 交错测量：samples=12、144 面片、一个截面；每组 30 帧，每帧发送 4 个合成 pointermove，callback 回传到 3D controller。

| 顺序 | 事件组 p50 | rAF 间隔 p50 | update / commit |
|---|---:|---:|---:|
| 审核前 A1 | 1.1 ms | 53.4 ms | 29 / 1 |
| 审核后 B1 | 1.1 ms | 47.2 ms | 29 / 1 |
| 审核前 A2 | 0.9 ms | 43.4 ms | 29 / 1 |
| 审核后 B2 | 0.9 ms | 46.8 ms | 29 / 1 |

输入合并行为与审核前一致，本次小样本未观察到明确回退；不能据此声称进一步提速。绘制已移到 rAF，事件组约 1 ms 不是整帧绘制耗时。测量隔离了课程 Runtime/React，不能当作完整预制课的物理触屏 FPS；双触点为 CDP 可信浏览器输入，也未包含触屏硬件采样链路。问题卡片与二维图另经 Android 原生输入路径验证。复杂隐式曲面和多卡负载仍需用户真实触屏确认。[完整性能数据](review-tv/performance.json)。

## 其他检查与收尾

- 针对审核改动的两文件 34 项单元测试通过（9 项 slider-rendering、25 项 selection-enhancement-layer）。两个 PR 的 CI 全套测试已经通过，本轮没有再次跑全量浏览器套件。
- 安装前后既有课程均为 4 个节点、64 项笔迹；两个滑块值为 -2.95 / 0，7 beats 完成且暂停。未重置参数或学习记录。重开时课程自身的镜头恢复行为仍保留。
- 最近 6,000 行日志的 AndroidRuntime 错误过滤未发现崩溃。
- 最后刷新 WebView 清除全部临时夹具/监听器，并恢复原课程供人工触屏验收。未合并任何 PR。
- 电视日志、临时测试代码及最终截图在 gitignored `delivery/android-review-tv/`。本次结果不再使用上一轮“52 个模块全部与旧验收包相同”的结论：board-view 与 scene3d 是 Claude 本次修复的新版本，已重新构建并安装验收。
