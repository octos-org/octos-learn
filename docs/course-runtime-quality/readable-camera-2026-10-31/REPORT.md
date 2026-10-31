# 课程进行中的可读性（小屏镜头）— 2026-10-31

用户决定：课程进行中每个 Beat 结束时必须可读，课程结束后的全览不要求；检查白板 1366 × 768（学校常见 Chromebook）与 1920 × 1080；正文屏幕字号门槛 12.5 px（桌面阅读缩放 0.9 下 14 px 正文约 12.6 px）。

## 改动

| 仓库 | 改动 |
|---|---|
| octos-lesson-language（分支 `claude/playback-gate-fixes`，固定提交 `4662b9a`） | 宿主设置自动镜头下限后，多卡片同框不再低于下限；放不下时保留最新卡片，画面移向被留下的卡片。Observer 与 Harness 的检查修正见该仓库 `docs/PLAYBACK-GATE-REVIEW-2026-10-31.md` |
| octos-learn（分支 `claude/readable-camera-floor`） | 桌面端自动镜头下限 = 阅读缩放 0.9（`teachingCameraFloor`）；会议屏保持 0.55；固定新 OLL 提交 |

## 实测方法

`measure-readability.cjs`：在本地开发服务器（Node 22，课程包取自公网目录）中打开 9 门已发布课程，暂停后逐个点击“下一 Beat”，等待布局稳定，记录焦点卡片（无焦点时为画面内完整可见的卡片）的屏幕正文字号与镜头缩放。最后一次点击后课程结束、显示整课全览，单独列出，不作门槛。

```sh
# octos-learn 根目录，Node 22
./node_modules/.bin/vite --host 127.0.0.1 --port 5217 --strictPort
node docs/course-runtime-quality/readable-camera-2026-10-31/measure-readability.cjs results.json
```

## 结果

| 课程 | 窗口 | 课程中 Beat 数 | 最小正文 px | 最小镜头 | 结束全览正文 px |
|---|---|---|---|---|---|
| linear-intro-and-slope | 1366×768 | 8 | 14.40 | 0.90 | 16.83 |
| linear-intro-and-slope | 1920×1080 | 8 | 17.60 | 1.10 | 17.6 |
| linear-simultaneous-intersections | 1366×768 | 9 | 14.40 | 0.90 | 14.65 |
| linear-simultaneous-intersections | 1920×1080 | 9 | 17.60 | 1.10 | 26.4 |
| slope-and-intercept | 1366×768 | 13 | 14.40 | 0.90 | 15.9 |
| slope-and-intercept | 1920×1080 | 13 | 17.60 | 1.10 | 17.6 |
| surface-paraboloid-level-sets | 1366×768 | 12 | 13.91 | 0.92 | 13.75 |
| surface-paraboloid-level-sets | 1920×1080 | 12 | 10.93 | 0.78 | 17.6 |
| surface-partial-derivative-slice | 1366×768 | 12 | 14.40 | 0.78 | 5.32 |
| surface-partial-derivative-slice | 1920×1080 | 12 | 14.40 | 0.78 | 10.82 |
| surface-saddle-point-analysis | 1366×768 | 14 | 14.40 | 0.90 | 4.18 |
| surface-saddle-point-analysis | 1920×1080 | 14 | 13.62 | 0.90 | 7.75 |
| trig-cosine-and-phase-shift | 1366×768 | 13 | 12.61 | 0.90 | 7.73 |
| trig-cosine-and-phase-shift | 1920×1080 | 13 | 12.61 | 0.90 | 13.89 |
| trig-quadrants-and-monotonicity | 1366×768 | 9 | 12.61 | 0.90 | 11.47 |
| trig-quadrants-and-monotonicity | 1920×1080 | 9 | 13.76 | 0.98 | 24.28 |
| trig-unit-circle-to-sine | 1366×768 | 7 | 12.62 | 0.90 | 8.89 |
| trig-unit-circle-to-sine | 1920×1080 | 7 | 15.42 | 1.10 | 15.43 |

全部 9 门课程、两种尺寸下，课程进行中的 Beat 正文都不低于 12.5 px。结束全览在长课程上仍会很小（例如马鞍面 1366 × 768 约 4 px），按用户决定不作门槛。

说明：

- 修改前，同一方法下 `slope-and-intercept` 在 1366 × 768 的镜头约 0.79、正文约 12.6 px（16 px 正文）；14 px 正文会降到约 11 px。修改后桌面镜头不低于 0.9。
- `surface-paraboloid-level-sets` 1920 × 1080 第 1 个 Beat 曾在一次采样中测得 10.9 px，重测为单张 15.4 px 卡片；判断为镜头过渡中的采样，不是稳定状态。
- 三门三角函数课程的焦点有时落在连线或无外框分组上，脚本无法定位到卡片；这些 Beat 改用画面内完整可见的卡片测量。
