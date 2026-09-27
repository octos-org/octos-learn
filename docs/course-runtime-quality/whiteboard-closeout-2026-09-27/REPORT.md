# 白板布局与镜头收尾 — 2026-09-27

本次收尾把已完成的白板布局与镜头工作合入 main，并保留可复现的测试输入与真实截图。代码集成收尾不等于最终排版体验验收；Claude 正在另一台电脑开展的三个课程集九门课内容审查独立继续。

合并记录：[应用 #28](https://github.com/octos-org/octos-learn/pull/28)、[OLL #18](https://github.com/alan0x/octos-lesson-language/pull/18)、[Coach #19](https://github.com/alan0x/learning-coach/pull/19) 与[依赖固定 #20](https://github.com/alan0x/learning-coach/pull/20)、[课程库 #7](https://github.com/alan0x/octos-course-library/pull/7)。本次没有部署公网。

## 固定范围与分支策略

| 仓库 | 本次纳入的工作分支截止提交 | 范围 |
|---|---|---|
| octos-lesson-language | f202fad | Stage Rows × Step Columns、比较图形同行、动画与 Beat 目标镜头、动画结束回归目标 |
| learning-coach | 3482296 | 实时生成适配与 runtime 补丁同步 |
| octos-course-library | 6a8f37d | runtime 补丁同步及此前已交接成果 |
| octos-learn | 67226b6 | 白板宿主集成、镜头策略、练习空间与回归证据 |

四个仓库使用 codex/whiteboard-camera-closeout 合并到 main，保留原始提交祖先关系。四个 codex/stage-rows-step-columns 工作分支保留，避免影响异机工作。应用 72ca822 的新课程版本测试及课程库 6a8f37d 之后的课程审查/修订流水线未纳入。后端 octos 没有修改或升级。

## 集成行为与本次额外修正

- 使用阶段行与步骤列组织教学板书；明确声明比较关系的图形进入前一图形行。
- 动画镜头在可读时包含 Beat 目标，不可兼顾时优先目标；动画结束后回归 Beat 目标。
- 不再给尚未展开的练习预留空白，展开后按实际内容参与布局。预制和实时课程共享 OLL 链路，不增加模型调用。
- 本次只额外修复 E2E 时序：进入图形探索模式后确认 aria-pressed，再等待当前 SVG 可交互才开始真实拖动；保留拖动和白板未移动断言。
- 全课程 overview 测试输出改用 Playwright testInfo.outputPath，移除旧电脑绝对路径；同时消除播放控件暂时隐藏导致循环提前退出的问题，增加课程确已结束的断言。
- 将已撤回的五门历史课程包按原字节归档到课程库 authoring/layout-regression-fixtures；核对原目录 SHA-256 和字节数。它们只用于回归，不重新加入公开课程目录。

## 验证与边界

OLL 320、learning-coach 165、课程库 20、应用 1040 项测试通过；应用 public 构建通过。应用单测在本次 Node 25.6.1 环境使用 NODE_OPTIONS=--no-experimental-webstorage。

三个消费者的 OLL 补丁 SHA-256 一致：a5124051cfd4a7fdea2031a4e0467a342775811fe847a64f8216d3fccda8c3bd。补丁涉及的 37 个文件均与本次 OLL 构建产物逐字节一致。上述为迁移前的核对结果。随后远端 Linux 干净安装发现旧补丁依赖 JSON schema 的生成缩进，无法可靠应用；因此三个消费者改为直接固定到已合并的 OLL `f2a1c654041735f566385f9e208c868b270b8095`，删除已被该提交包含的 OLL 补丁，并更新锁文件与 Coach 契约。迁移后再次对这 37 个路径核对：代码产物一致，JSON 按解析后的结构一致。应用自己的 course-library 补丁仍保留。未来从这个固定 OLL 提交继续同步，不要恢复旧 OLL 补丁。

浏览器完整回归 39 项无重试通过，结果见 [validation.txt](validation.txt)。拖动测试修复后另做五次无重试重复验证，全部通过。回归只覆盖这些测试的断言，不替代逐课教学体验验收。

## 逐课真实截图

[完整截图画廊](gallery.html) 包含 15 门课在 1920、1440、700 像素窗口下的播放中与结束状态，共 90 张真实截图。[输入版本与包哈希](dataset.json) 固定本批课程；evidence 下各课 JSON 记录卡片屏幕坐标。

下表缩放为本次结束截图中节点屏幕宽度 / 原始宽度的最小值，依次为 1920 / 1440 / 700；不是新增验收阈值。

| 课程 | 版本 | 最小缩放 | 结束截图 |
|---|---|---|---|
| 直观理解分数的大小比较 | 0.1.0 | 0.995 / 0.797 / 0.473 | [1920](evidence/screenshots/fraction-comparing-unit-shares-ended-1920.png) / [1440](evidence/screenshots/fraction-comparing-unit-shares-ended-1440.png) / [700](evidence/screenshots/fraction-comparing-unit-shares-ended-700.png) |
| 等价分数的图形直观与原理 | 0.1.0 | 1.046 / 0.696 / 0.386 | [1920](evidence/screenshots/fraction-equivalent-visuals-ended-1920.png) / [1440](evidence/screenshots/fraction-equivalent-visuals-ended-1440.png) / [700](evidence/screenshots/fraction-equivalent-visuals-ended-700.png) |
| 直观理解分数的意义与结构 | 0.1.0 | 1.120 / 0.754 / 0.498 | [1920](evidence/screenshots/fraction-notation-and-parts-ended-1920.png) / [1440](evidence/screenshots/fraction-notation-and-parts-ended-1440.png) / [700](evidence/screenshots/fraction-notation-and-parts-ended-700.png) |
| 认识分数的初步概念：从方格到二分之一 | 0.1.0 | 1.124 / 0.822 / 0.446 | [1920](evidence/screenshots/fraction-what-is-a-half-ended-1920.png) / [1440](evidence/screenshots/fraction-what-is-a-half-ended-1440.png) / [700](evidence/screenshots/fraction-what-is-a-half-ended-700.png) |
| 正比例函数 y = kx 与斜率的几何意义 | 0.1.0 | 1.300 / 1.176 / 0.735 | [1920](evidence/screenshots/linear-intro-and-slope-ended-1920.png) / [1440](evidence/screenshots/linear-intro-and-slope-ended-1440.png) / [700](evidence/screenshots/linear-intro-and-slope-ended-700.png) |
| 一次函数 y = 2x - 1 的图像本质与画法 | 0.1.0 | 0.978 / 0.769 / 0.521 | [1920](evidence/screenshots/linear-plotting-points-ended-1920.png) / [1440](evidence/screenshots/linear-plotting-points-ended-1440.png) / [700](evidence/screenshots/linear-plotting-points-ended-700.png) |
| 二元一次方程组与一次函数的几何意义 | 0.1.0 | 0.875 / 0.866 / 0.478 | [1920](evidence/screenshots/linear-simultaneous-intersections-ended-1920.png) / [1440](evidence/screenshots/linear-simultaneous-intersections-ended-1440.png) / [700](evidence/screenshots/linear-simultaneous-intersections-ended-700.png) |
| 长方形的面积与周长 | 0.1.5 | 1.068 / 0.769 / 0.512 | [1920](evidence/screenshots/rectangle-area-from-tiles-ended-1920.png) / [1440](evidence/screenshots/rectangle-area-from-tiles-ended-1440.png) / [700](evidence/screenshots/rectangle-area-from-tiles-ended-700.png) |
| 一次函数 y = mx + b 的图像与性质 | 0.1.6 | 1.027 / 0.982 / 0.566 | [1920](evidence/screenshots/slope-and-intercept-ended-1920.png) / [1440](evidence/screenshots/slope-and-intercept-ended-1440.png) / [700](evidence/screenshots/slope-and-intercept-ended-700.png) |
| 水平截线与等高线：以 z=x²+y² 为例 | 0.2.3 | 1.114 / 0.729 / 0.465 | [1920](evidence/screenshots/surface-paraboloid-level-sets-ended-1920.png) / [1440](evidence/screenshots/surface-paraboloid-level-sets-ended-1440.png) / [700](evidence/screenshots/surface-paraboloid-level-sets-ended-700.png) |
| 偏导数：固定输入，求截线斜率 | 0.2.3 | 0.877 / 0.516 / 0.321 | [1920](evidence/screenshots/surface-partial-derivative-slice-ended-1920.png) / [1440](evidence/screenshots/surface-partial-derivative-slice-ended-1440.png) / [700](evidence/screenshots/surface-partial-derivative-slice-ended-700.png) |
| 马鞍面与鞍点：梯度为零不一定是极值点 | 0.2.3 | 0.679 / 0.425 / 0.253 | [1920](evidence/screenshots/surface-saddle-point-analysis-ended-1920.png) / [1440](evidence/screenshots/surface-saddle-point-analysis-ended-1440.png) / [700](evidence/screenshots/surface-saddle-point-analysis-ended-700.png) |
| 余弦函数与单位圆投影 | 0.1.0 | 0.859 / 0.640 / 0.315 | [1920](evidence/screenshots/trig-cosine-and-phase-shift-ended-1920.png) / [1440](evidence/screenshots/trig-cosine-and-phase-shift-ended-1440.png) / [700](evidence/screenshots/trig-cosine-and-phase-shift-ended-700.png) |
| 单位圆与正弦函数的单调性及象限循环 | 0.1.0 | 0.914 / 0.645 / 0.359 | [1920](evidence/screenshots/trig-quadrants-and-monotonicity-ended-1920.png) / [1440](evidence/screenshots/trig-quadrants-and-monotonicity-ended-1440.png) / [700](evidence/screenshots/trig-quadrants-and-monotonicity-ended-700.png) |
| 从单位圆旋转到正弦曲线 | 0.1.0 | 1.124 / 0.659 / 0.407 | [1920](evidence/screenshots/trig-unit-circle-to-sine-ended-1920.png) / [1440](evidence/screenshots/trig-unit-circle-to-sine-ended-1440.png) / [700](evidence/screenshots/trig-unit-circle-to-sine-ended-700.png) |

## 尚未解决的体验问题

- 窄屏结束全览仍会把长课程压得很小。马鞍面在 700 窗口约 0.253，偏导数约 0.321；应继续探索分阶段回顾或可读范围导航，不应宣称“无裁切即达标”。
- 继承的 overview 测试已不再用最小缩放作硬门槛，只记录缩放并校验容纳；这不意味着可读性要求被取消。
- 播放镜头会聚焦当前教学目标，其他历史卡片离屏不等于裁切缺陷。结束全览的基础矩形检查没有发现超出检查边界的卡片，但不等同于逐帧遮挡、所有练习状态或动态课程的完整证明。
- 历史撤回课 linear-plotting-points 的公式存在可见红色渲染文本，保留原输入用于暴露历史问题，没有修改课程数据来美化结果。当前九门课程审查由 Claude 单独处理。

## 在其他电脑复现

从四个仓库 main 初始化，按各仓库锁文件安装依赖。课程库上述归档提供五门历史 .ocpack；其他十门使用 dataset.json 的版本，在课程库本次截止提交或 main 对应历史版本构建。必须逐包核对哈希；若构建产物字节不同，说明不是同一输入，不应直接宣称复现本次证据。

本地发布目录需有 catalog.json，以及 releases/<packId>/<version>/manifest.json、archive.ocpack、files/。OCTOS_LOCAL_COURSE_PACK_ROOT 指向这个目录，它决定本地接口读取哪批课程；不设置时不能保证使用本次固定输入。截图脚本只在测试浏览器内补入五门撤回课，不写公开目录。

```sh
# 在 octos-learn 根目录；按实际路径设置环境变量
OCTOS_LOCAL_COURSE_PACK_ROOT=/path/to/publication pnpm exec vite --host 127.0.0.1 --port 5217 --strictPort
# 另一终端，同一课程根目录；脚本依赖当前仓库安装的 Playwright
OCTOS_LOCAL_COURSE_PACK_ROOT=/path/to/publication OCTOS_CAPTURE_URL=http://127.0.0.1:5217 node docs/course-runtime-quality/whiteboard-closeout-2026-09-27/capture.cjs
```

Claude 后续继续现有工作分支；提交或妥善保存正在修改的内容后 fetch origin，再 merge origin/main，保留本次合并祖先关系。不要 reset 或重写另一台电脑正在使用的工作分支。
