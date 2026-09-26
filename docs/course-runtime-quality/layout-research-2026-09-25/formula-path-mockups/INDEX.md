# 第二版：连续公式路径与按出场区间旁置笔记

**状态：15门×3宽度，共45张独立方案效果图。未修改正式应用布局、OLL补丁或课程数据；未进行应用验收。**

[新旧效果图对比画廊](gallery.html) · [可切换课程的原型](preview.html) · [全部45张图片](all-45-mockups.zip)

## 本轮规则

按步骤顺序排大行；步骤内图形先组成图区，非图形卡保持原创建序列。遇到公式开始一个局部行，该公式之后、下一公式之前的笔记进入这个出场区间。空间够时公式在左、该区间笔记在右；下一条公式从下一行开始。先于第一条公式的笔记仍在前面。该规则只有时间关系，不推断“解释谁”。

公式共用左起点，旁置笔记从当前公式实际右缘加14px开始，不设全课固定公式列。旁置候选要求两侧各至少320px可用空间，长卡按自然宽度提高要求；不够就保序上下排。没有新增“表示与说明”等语义标签。步骤序号和标题沿用上一版示意框架，不是本次新增生产UI。

图区与阅读区按自然宽度决定左右或上下排列。控件与练习位于该步骤内容下方，组成独立操作区；可用宽度达到736px时并排顶对齐，否则上下紧接。320/736等为统一原型参数，并非课程或节点特判，也不是实测最优值。

## 实测边界

图片是浏览器渲染的独立排版原型，不是实际应用运行时。静态图形、文字、公式与全部声明练习沿用上一版原型输入；公式在蕴含符处的分行和字体适配也沿用。图形不交互，练习全部展开。高度随内容增长，不能作为一屏全景可读性的证明。未验证流式播放、镜头、墨迹、练习按时出现及位移预算。

控件归属沿用上一版从原课程导出的映射，导出器用变量名匹配图形内容，尚不是正式依赖解析器；当前15门计数完整，不构成任意新课程的归属正确性证明。没有新增模型调用、改写课程或人工逐课调坐标。

检查45帧卡片与练习数量和输入一致，无检测到的卡片水平溢出，无浏览器脚本异常；这是原型完整性检查，不是排版达标。已通过逐组三尺寸缩略图检查整体结构，并查看等价分数的完整图。

## 结果与取舍

**不建议把这版直接作为最终算法。** 它解决了截图中笔记横插、练习斜对角相邻两个问题，但把所有公式一律竖排，桌面高度普遍增加，并留下大量右侧空白。时间区间只能解释位置规则，无法保证笔记的真实语义归属。

下一步值得比较的候选是：无笔记插入的连续公式允许按原顺序同行；出现笔记的区间才使用旁置/上下模板。另需比较操作区紧贴图区与放在步骤底部的代价，尤其双图课程。该候选本轮未混入截图，避免把不同规则的收益混为一谈。

## 逐课图片与对比

高度变化对比的是上一版同宽度、同内容的完整效果图，不是当前应用；包括页面标题与页脚。图片链接为完整PNG。

| 课程 | 1920 | 1440 | 700 | 高度变化（1920 / 1440 / 700） | 观察 |
| --- | --- | --- | --- | --- | --- |
| 直观理解分数的大小比较 | [效果图](images/fraction-comparing-unit-shares-1920.png) | [效果图](images/fraction-comparing-unit-shares-1440.png) | [效果图](images/fraction-comparing-unit-shares-700.png) | +9% / +9% / +16% | 公式左边界连续，短式全部竖排使后续步骤增高。 |
| 等价分数的图形直观与原理 | [效果图](images/fraction-equivalent-visuals-1920.png) | [效果图](images/fraction-equivalent-visuals-1440.png) | [效果图](images/fraction-equivalent-visuals-700.png) | +12% / +12% / +18% | 首步消除了公式—笔记—公式横向夹排；第三步先出的笔记仍在公式上方。 |
| 直观理解分数的意义与结构 | [效果图](images/fraction-notation-and-parts-1920.png) | [效果图](images/fraction-notation-and-parts-1440.png) | [效果图](images/fraction-notation-and-parts-700.png) | +3% / +3% / +11% | 先出的说明保持在公式上方，不伪造公式归属；操作区邻接清楚。 |
| 认识分数的初步概念：从方格到二分之一 | [效果图](images/fraction-what-is-a-half-1920.png) | [效果图](images/fraction-what-is-a-half-1440.png) | [效果图](images/fraction-what-is-a-half-700.png) | +7% / +7% / +12% | 首步两条笔记保持原顺序；后续孤立短公式仍留下大面积右侧空白。 |
| 正比例函数 y = kx 与斜率的几何意义 | [效果图](images/linear-intro-and-slope-1920.png) | [效果图](images/linear-intro-and-slope-1440.png) | [效果图](images/linear-intro-and-slope-700.png) | +8% / +8% / +7% | 操作区并排顶对齐，但图右侧与操作区上方仍有留白。 |
| 一次函数 y = 2x - 1 的图像本质与画法 | [效果图](images/linear-plotting-points-1920.png) | [效果图](images/linear-plotting-points-1440.png) | [效果图](images/linear-plotting-points-700.png) | +20% / +20% / +5% | 操作区集中；末步先笔记后公式不改序，纵向长度增加。 |
| 二元一次方程组与一次函数的几何意义 | [效果图](images/linear-simultaneous-intersections-1920.png) | [效果图](images/linear-simultaneous-intersections-1440.png) | [效果图](images/linear-simultaneous-intersections-700.png) | +19% / +19% / +25% | 第一步图式注接近；第二步三条短式强制竖排，明显浪费桌面横向空间。 |
| 长方形的面积与周长 | [效果图](images/rectangle-area-from-tiles-1920.png) | [效果图](images/rectangle-area-from-tiles-1440.png) | [效果图](images/rectangle-area-from-tiles-700.png) | +0% / +0% / +0% | 首步图与说明位置基本延续，操作区更明确；各步骤只有一张卡，不能靠本规则消除长尾。 |
| 一次函数 y = mx + b 的图像与性质 | [效果图](images/slope-and-intercept-1920.png) | [效果图](images/slope-and-intercept-1440.png) | [效果图](images/slope-and-intercept-700.png) | +10% / +10% / +5% | 控件与练习不再斜对角相邻；后续单公式步骤仍偏疏。 |
| 水平截线与等高线：以 z=x²+y² 为例 | [效果图](images/surface-paraboloid-level-sets-1920.png) | [效果图](images/surface-paraboloid-level-sets-1440.png) | [效果图](images/surface-paraboloid-level-sets-700.png) | +12% / +12% / +6% | 双图桌面仍并排；后续两条公式由同行变竖排，整课增高。 |
| 偏导数：固定输入，求截线斜率 | [效果图](images/surface-partial-derivative-slice-1920.png) | [效果图](images/surface-partial-derivative-slice-1440.png) | [效果图](images/surface-partial-derivative-slice-700.png) | +2% / +2% / +0% | 控件练习同区；第二步多公式保持纵向路径，首步长式旁的笔记因空间不足仍下接。 |
| 马鞍面与鞍点：梯度为零不一定是极值点 | [效果图](images/surface-saddle-point-analysis-1920.png) | [效果图](images/surface-saddle-point-analysis-1440.png) | [效果图](images/surface-saddle-point-analysis-700.png) | +19% / +14% / +3% | 双图保留，但长式、先出的笔记和后续说明使纵向流很长；该规则无法解决密集课程全景问题。 |
| 余弦函数与单位圆投影 | [效果图](images/trig-cosine-and-phase-shift-1920.png) | [效果图](images/trig-cosine-and-phase-shift-1440.png) | [效果图](images/trig-cosine-and-phase-shift-700.png) | +18% / +18% / +6% | 第三步连续两式及第四步多条式注占用更多高度；双图对照仍清楚。 |
| 单位圆与正弦函数的单调性及象限循环 | [效果图](images/trig-quadrants-and-monotonicity-1920.png) | [效果图](images/trig-quadrants-and-monotonicity-1440.png) | [效果图](images/trig-quadrants-and-monotonicity-700.png) | +26% / +26% / +4% | 短式步骤和末步两式全部竖排，桌面高度退化最大，说明公式路径不应一律竖排。 |
| 从单位圆旋转到正弦曲线 | [效果图](images/trig-unit-circle-to-sine-1920.png) | [效果图](images/trig-unit-circle-to-sine-1440.png) | [效果图](images/trig-unit-circle-to-sine-700.png) | +10% / +25% / +9% | 1920图旁式注可并排；1440解释移到双图下方，操作区又在解释下，图到控件距离增加。 |

[原设计报告和现状真实截图](../REPORT.md) · [检查数据](render-metrics.json)

复现：`node render-mockups.cjs`（需当前项目的Playwright和本地浏览器权限）；`python3 build-prototype.py`从归档的上一版输入构建本版页面。导出脚本仍使用本机项目绝对路径。