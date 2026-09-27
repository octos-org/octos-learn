# 已实现 Stage-Anchored Step-Stream 布局审查

日期：2026-09-26。仅审查，未修改正式源码、补丁或课程数据。

## 结论

确认2项需处理的问题：播放过程中已出现内容发生大幅重排，以及复杂课程的结束全景仍不可读。两者不否定新方案的整体方向；当前公式空列减少、控件与练习距离改善，但尚不能仅凭几何和单测判定排版完成。

### [P1] 新增卡触发整步迁出，已有卡片与镜头同时跳变

位置：`/Users/alan0x/Documents/projects/octos-lesson-language/packages/web-runtime/src/teaching-layout.ts:396`（条件分支）及`:448`（以x=0重新放置）。

马鞍面课1920窗口，逐Beat推进到第13次“下一步”（脚本索引12，新增“抛物面…马鞍面…”公式）时，第4步骤从2张卡变为3张卡，触发 trailingBlocks 分支，已显示的“多元函数极值分析方法体系”笔记与梯度公式从右侧讲解区搬到全宽区，两卡均横移468个世界坐标单位。不是窗口resize，也不是用户主动切换总览。

同时镜头缩放约0.796→1.152；笔记左上角屏幕位移约482px，梯度公式约363px。用户允许适度位移，但这不是受预算控制的小幅调整。代码虽接收 progressive/overview，分支没有用播放阶段限制这次重排。

[变化前](screenshots/surface-saddle-point-analysis-beat-12-before.png) · [变化后](screenshots/surface-saddle-point-analysis-beat-12-after.png) · [完整测量](surface-saddle-point-analysis-transitions.json)

建议：在当前步骤出现首卡时确定其排版区域，或到明确的步骤/总览切换边界再迁移；对布局位移和镜头位移联合设预算。保留当前方案，不需要重做整体算法。补充当前课第4步2→3张卡的真实回归；现有“appending cards never moves existing cards”用例虽通过，却没有覆盖迁出条件。

### [P2] 1440和700的密集课仍只做到入框，未做到可读

位置：同文件`:140`（仅按宽度选固定世界宽度）、`:298`（选择横纵结构）、`:383`（阅读区宽度）；整体候选没有正文有效字号或高度可读性约束。

马鞍面结束全景1920/1440/700实测缩放约0.706/0.422/0.410。笔记列表原字号14px（styles.css的.content-list），后两者屏幕字号约5.9/5.7px。卡片均在窗口内且无卡片间重叠，但无法按正常文字阅读。宽度1440已经出现，不只是手机场景。

[1440原图](screenshots/surface-saddle-point-analysis-ended-1440.png) · [700原图](screenshots/surface-saddle-point-analysis-ended-700.png)

建议：需要明确“整课导航总览”与“可读步骤视图”的产品行为；若坚持全景可读，布局候选必须把有效字号作为约束并报告不可行情况。不能仅调低缩放阈值或把入框当验收。该问题是仍存在的验收缺口，不声称全部由本次改动新引入。

## 已核验与范围

- 源仓库dist与应用安装包的teaching-layout.js SHA256一致，确认应用确实使用新算法。指纹见[code-hashes.txt](code-hashes.txt)。没有重新构建或同步补丁，避免审查期间改状态。
- 独立预览5187，使用既有原课程发布目录；目录缺项仅在测试浏览器补入口，长方形使用既有解包的原始课程。采集方法与原研究一致，不修改课程。
- 全15门×1920/1440/700×播放中/结束，共90张真实应用截图。[全部截图画廊](gallery.html)。窗口依次resize，不等同于全部尺寸冷启动。
- 三门复杂课另从700直接进入，6张补充截图在fresh-700/screenshots。窄屏播放器按钮隐藏，测试使用原按钮click处理器推进。马鞍面当前图可见，但右侧伴随公式仍在屏外；未将所有历史内容出屏直接判为裁切缺陷。
- 45个结束状态基于可见卡片DOM矩形，未检出卡片互相重叠或超出窗口；不代表每个Beat、工具栏遮挡、内部文字、批注与所有反馈状态都已验证。
- 应用相关81个单测通过；OLL布局30个测试通过；OLL TypeScript noEmit通过。共111个测试通过仍未捕获上述动态位移问题。日志保存在本目录。
- `probe.mjs`使用真实卡片结构及此前测量尺寸逐前缀调用安装包算法，作为找问题的辅助；它不是实时模型课程的完整端到端验证。实际位移结论以上述浏览器逐Beat结果为依据。
- 未全面测试实时生成、笔迹固定、多课混排、拖动期间新卡、练习提示展开。没有宣称这些场景无问题。
- 等价分数、余弦等课仍存在公式—笔记—公式横向排法；这是该方案当前的保序流规则。考虑用户已采用方案，本审查不把该风格偏好单独当代码缺陷，保留真实截图供确认。

## 逐课结束态缩放与截图

缩放为DOM实际宽度/offsetWidth，存在像素取整误差；不是质量分数。播放中截图见画廊。

|课程|1920|1440|700|
|---|---|---|---|
|直观理解分数的大小比较|[1.128](screenshots/fraction-comparing-unit-shares-ended-1920.png)|[0.800](screenshots/fraction-comparing-unit-shares-ended-1440.png)|[0.680](screenshots/fraction-comparing-unit-shares-ended-700.png)|
|等价分数的图形直观与原理|[1.094](screenshots/fraction-equivalent-visuals-ended-1920.png)|[0.807](screenshots/fraction-equivalent-visuals-ended-1440.png)|[0.680](screenshots/fraction-equivalent-visuals-ended-700.png)|
|直观理解分数的意义与结构|[1.163](screenshots/fraction-notation-and-parts-ended-1920.png)|[0.894](screenshots/fraction-notation-and-parts-ended-1440.png)|[0.704](screenshots/fraction-notation-and-parts-ended-700.png)|
|认识分数的初步概念：从方格到二分之一|[1.128](screenshots/fraction-what-is-a-half-ended-1920.png)|[0.866](screenshots/fraction-what-is-a-half-ended-1440.png)|[0.870](screenshots/fraction-what-is-a-half-ended-700.png)|
|正比例函数 y = kx 与斜率的几何意义|[1.218](screenshots/linear-intro-and-slope-ended-1920.png)|[0.929](screenshots/linear-intro-and-slope-ended-1440.png)|[0.870](screenshots/linear-intro-and-slope-ended-700.png)|
|一次函数 y = 2x - 1 的图像本质与画法|[1.075](screenshots/linear-plotting-points-ended-1920.png)|[0.794](screenshots/linear-plotting-points-ended-1440.png)|[0.650](screenshots/linear-plotting-points-ended-700.png)|
|二元一次方程组与一次函数的几何意义|[1.288](screenshots/linear-simultaneous-intersections-ended-1920.png)|[0.932](screenshots/linear-simultaneous-intersections-ended-1440.png)|[0.669](screenshots/linear-simultaneous-intersections-ended-700.png)|
|长方形的面积与周长|[1.128](screenshots/rectangle-area-from-tiles-ended-1920.png)|[0.866](screenshots/rectangle-area-from-tiles-ended-1440.png)|[0.609](screenshots/rectangle-area-from-tiles-ended-700.png)|
|一次函数 y = mx + b 的图像与性质|[1.163](screenshots/slope-and-intercept-ended-1920.png)|[0.894](screenshots/slope-and-intercept-ended-1440.png)|[0.695](screenshots/slope-and-intercept-ended-700.png)|
|水平截线与等高线：以 z=x²+y² 为例|[1.157](screenshots/surface-paraboloid-level-sets-ended-1920.png)|[0.861](screenshots/surface-paraboloid-level-sets-ended-1440.png)|[0.674](screenshots/surface-paraboloid-level-sets-ended-700.png)|
|偏导数：固定输入，求截线斜率|[0.845](screenshots/surface-partial-derivative-slice-ended-1920.png)|[0.649](screenshots/surface-partial-derivative-slice-ended-1440.png)|[0.585](screenshots/surface-partial-derivative-slice-ended-700.png)|
|马鞍面与鞍点：梯度为零不一定是极值点|[0.706](screenshots/surface-saddle-point-analysis-ended-1920.png)|[0.422](screenshots/surface-saddle-point-analysis-ended-1440.png)|[0.410](screenshots/surface-saddle-point-analysis-ended-700.png)|
|余弦函数与单位圆投影|[0.828](screenshots/trig-cosine-and-phase-shift-ended-1920.png)|[0.612](screenshots/trig-cosine-and-phase-shift-ended-1440.png)|[0.559](screenshots/trig-cosine-and-phase-shift-ended-700.png)|
|单位圆与正弦函数的单调性及象限循环|[1.059](screenshots/trig-quadrants-and-monotonicity-ended-1920.png)|[0.685](screenshots/trig-quadrants-and-monotonicity-ended-1440.png)|[0.645](screenshots/trig-quadrants-and-monotonicity-ended-700.png)|
|从单位圆旋转到正弦曲线|[1.249](screenshots/trig-unit-circle-to-sine-ended-1920.png)|[0.911](screenshots/trig-unit-circle-to-sine-ended-1440.png)|[0.688](screenshots/trig-unit-circle-to-sine-ended-700.png)|
