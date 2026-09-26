# Octos Learn 白板布局：独立复现与设计评审

日期：2026-09-25。状态：**研究与设计交付；未修改布局源码、补丁、课程数据。新方案尚未实现，不宣称排版验收通过。**

建议保留“步骤行”，但不原样实施待评审的三区提案。改为 **步骤行 + 对照块 + 连续讲解流 + 可侧置的交互附件**。类型用于决定可选排版模板，不用于决定固定列，也不把公式和对应说明拆成两条独立的阅读线。

## 补充：全课程方案效果图（本轮新增）

已制作15门课程 × 1920 / 1440 / 700宽度，共45张独立效果图。它们展示本报告建议的结构，**不是应用实测，也不证明正式算法已实现或已达标**。全部声明练习展开，图形用静态简图，文字与公式来自原课程；长推导只在蕴含符号处分行。图片为完整可读长图，高度随课程内容变化，不能当作一屏全景。

[查看全部45张效果图](proposal-mockups/INDEX.md) · [图片画廊](proposal-mockups/gallery.html) · [下载全部图片](proposal-mockups/all-45-mockups.zip)

## 1. 证据范围与复现方法

已完整阅读用户指定的交接文档和关联行提案，核对四仓 git 状态及应用安装包中的实际算法。应用仍是步骤×类型矩阵：plannedSteps 触发 660px 公式列预留、460px 笔记列预留；宽度低于1600时视觉列只容纳一张图；练习追加最后一行。代码及仓库状态指纹见 [provenance.json](provenance.json)。本轮没有执行 OLL 构建或补丁同步，因为没有源码改动。

交接文档标题说10门，结构表列14门；本地 release 目录有15个课程ID。全部纳入，不能只测微积分或启动器里的9门。目录没有公布的5门（四门分数课和描点课），采集器仅在测试浏览器请求中补充由原 manifest 和原 archive 哈希构成的目录入口，原始课程内容完全不变。长方形目录残缺，读取应用已经内置的0.1.5原包；不修复、不重发布课程。其余使用本地发布目录的最新包。

隔离预览：`OCTOS_LOCAL_COURSE_PACK_ROOT=/tmp/octos-reviewed-course-publication`，Vite local-https，端口5186。Chromium实际运行 React/OLL/KaTeX/3D 渲染；测试账号屏蔽实时模型请求。本轮没有模型生成或重试。逐 Beat 推进至约一半进度后暂停，截取播放中状态；继续至播放器禁用下一步，再等待课后面板稳定，截取结束状态。同一状态依次设为1920×1080、1440×900、700×1000，因此这组证据也覆盖窗口切换，但不等同于三个尺寸各自冷启动。播放中的旧卡可能在镜头外，这与结束全景的“全卡入框”要分别判断。

**15门×3尺寸×2阶段=90张原始截图**，已逐课查看；缩略页只用于人工检查，原图未拼接、修饰或裁掉失败区域。截图和各卡 DOM 尺寸/位置均保留。[打开截图索引](gallery.html)，[实测摘要](summary.json)，[原始课程结构](course-structure.json)。采集脚本附于同目录：本机先运行 `python3 prepare-inputs.py`，在上述5186服务运行时运行 `node capture.cjs`；浏览器使用本项目已安装的Playwright。目录路径为本机环境固定路径，不影响所提布局算法的通用性。该样本不是每个Beat的回归验收，也没有覆盖所有练习成功、失败、展开提示的状态。

## 2. 现状结论：不是缺少一种更聪明的装箱

1. **固定类型列制造了错误的视觉距离。** 二元方程第一步公式实宽约185px，仍分到660px；1920窗口中公式右缘与“直线的交点”笔记左缘相隔约367px。分数比较课同类间隙约454px。学生很难把说明当作眼前图和式的解释。
2. **关联归属与实际位置不一致。** 正比例函数只有一个建卡步骤，结束时控件到练习最近边缘仍约934px；偏导课约469px。不是课程长才出现这个问题，是“练习放最后笔记格”的构造必然产生的。
3. **固定断点牺牲了对照。** 等高线、马鞍面和三角函数的双图在1920并排，1440变成竖排；等高线结束缩放由0.890降到0.483。实际两图宽460+440，加局部间距约916px，1440不能一律因为低于1600就拆开；需看可用画布和伴随内容实际尺寸。
4. **同一类型并不等于同一阅读链。** 马鞍面第四步是“注→式→式→注→式”，等价分数第三步是“注→式”。独立公式列和笔记列会迫使学生来回找对应解释；三区提案仍保留这个风险。
5. **结束全景与阅读视图不是同一个可行性问题。** 700窗口下全部课程都依赖缩小，全景scale范围0.252–0.756；马鞍面0.252时原16px文字只相当于约4px。即使几何入框，也不能称为能读的板书。1440的范围为0.369–0.796，1920为0.563–1.090。scale来自DOM实际宽/offsetWidth，微小差异有像素取整影响。
6. **还存在布局与镜头协调的缺口。** 播放中resize到700时马鞍面的当前图几乎完全移到右边界外；双图课程1440播放中常只看见一图和另一图的部分。此处只确认可见症状，不把根因未经调试就归咎某一个函数。

面积占用率仅作诊断：紧密的细长单列可能占用率高，却不能读；统一放大的松散矩阵也可能大部分都是空格。不能再用任意一个面积/scale分数代表教学效果。


### 700直接进入的补充复核

另对偏导、马鞍面、正弦生成三课从700宽度直接进入，用现有播放器按钮处理器推进相同Beat前缀（按钮在窄屏被隐藏，测试直接调用其click处理器），保存播放中与结束共6张截图。**马鞍面直接进入时当前对照图能完整显示，而1920→1440→700后几乎移出屏幕**，确认存在路径依赖，不能把该失败概括为“700永远显示不了当前图”。直接进入仍有上方公式与工具栏重叠/出屏，正弦课的说明也延伸到下方界面；局部焦点框仍需要关联上下文与遮挡区协同。

| 课程 | 直接700播放中 | 直接700结束 | 宽转窄播放中 |
| --- | --- | --- | --- |
| 偏导数 | [原图](fresh-700/screenshots/surface-partial-derivative-slice-playing-700.png) | [原图](fresh-700/screenshots/surface-partial-derivative-slice-ended-700.png) | [原图](screenshots/surface-partial-derivative-slice-playing-700.png) |
| 马鞍面 | [原图](fresh-700/screenshots/surface-saddle-point-analysis-playing-700.png) | [原图](fresh-700/screenshots/surface-saddle-point-analysis-ended-700.png) | [原图](screenshots/surface-saddle-point-analysis-playing-700.png) |
| 正弦生成 | [原图](fresh-700/screenshots/trig-unit-circle-to-sine-playing-700.png) | [原图](fresh-700/screenshots/trig-unit-circle-to-sine-ended-700.png) | [原图](screenshots/trig-unit-circle-to-sine-playing-700.png) |

## 3. 对现有提案的评审

| 提案条目 | 判断与修订 |
| --- | --- |
| 行=步骤 | 保留。步骤按首次创建事件排序；无新卡步骤不制造空白行。 |
| 实测自然宽度、不预留 | 保留方向。自然宽度应是受可读宽度范围约束、字体稳定后的真实尺寸，不能拿估算宽度截断公式。 |
| 图/推导/笔记三区 | 改。公式和笔记合成按讲解次序的连续解释流；图与解释流两侧排或上下排。 |
| 练习在控件下方 | 改为与控件构成同一交互单元，允许下接或侧邻。下方只是候选，不能无条件拉高整行。 |
| 多控件锚点取最左图 | 不足。四门课共享控件绑定双图；应挂整个对照块。任务指向多个簇时保留多目标边，不随意取第一个。 |
| 旧行永远不变 | 与“第一行课后加练习”矛盾。应分播放阶段和课后结构切换，给位移预算，不能两者同时承诺。 |
| 700按出场顺序单列 | 只保证顺序，不保证可读。需同时规定焦点镜头、可读内容窗和总览行为。 |
| 所有相邻卡间距上限 | 不合适。步骤间应比同簇间距大；高图旁短公式留下空白并非错误。只约束强关联卡和局部阅读流。 |

注意：实际应用把当前可用的练习合并为面板，并非声明几道练习就始终显示几张独立卡。附件高度要用当前真实测量；不能按tasks数量乘固定高度。偏导课第二张图没有同一滑块变量绑定，因此不能推断它是该滑块的实时联动对象。布局也不应读课程标题或文本来补造关系。

## 4. 建议算法：受阅读顺序约束的局部模板选择

### 输入与语义层

共用同一个布局入口，输入创建步骤与次序、已出现节点、实际测量尺寸、显式placement/group/connection、变量依赖、taskTargets、当前教学焦点、上一帧布局、可用视口及遮挡区。全部来自现有运行时，不加模型调用，不改课程。

关系分等级：任务→控制变量→视觉对象是强交互关系；同一步显式连接/分组的图是对照候选；同一步相邻创建内容是弱阅读关系。一般的below锚链只给顺序，不能传递闭包把整课并成一块。共享变量也不能自动吞并跨步骤的全部图和说明。跨步骤引用保留为引用边，焦点时强调，步骤归属不改。

预制课与实时课都对“当前可见前缀”运算。预制课已有plannedSteps可以暂留兼容管线，但不能据未来卡数提前占空列；实时课不需要知道未来内容。

### 两级构造

外层仅按步骤垂直排，每步共用左起点和一致的步骤间隔。行不是固定高度网格；也不为没有新卡的步骤留空行。

内层先建立对照块（共享基线的视觉对象）、交互附件块（控件与当前可用练习）、连续解释流（公式与说明保留教学次序）。优先保护显式对照与交互关系，不按类型把说明统一甩到最右边。对照图有不同高度时保顶线、保各自比例，不拉伸图形。

只枚举可解释的少数模板：

- 图/对照块在左，连续解释流在右；
- 图/对照块在上，连续解释流在下；
- 无图步骤直接使用有序阅读流；
- 交互附件置于视觉块下方，或置于其侧旁。双图足够宽时，控件与练习可共享一条底部横带。

流内对连续子序列做有序换行，而非任意重排卡片。每个断行点用实测尺寸评估；动态规划保留各宽度下的高度、关系距离与位移候选。示意转移为 `D[j] = best(D[i] + cost(连续卡 i…j 形成的一行))`。比较模板时保留非支配候选，再用固定规则决胜。这是有限模板内的相对优化，**不声称全体二维布局的全局最优**。

先检查硬约束：不重叠、不截内容、显式顺序与目标不丢、pinned/墨迹保护。然后按优先级评估：当前焦点可读且可操作 → 强关系是否被拆开、最大关联距离 → 阅读逆序/不必要换行与对齐误差 → 整体长宽和多余空白 → 位移成本。同等教学可读性下才比较利用率。缩放是可行性和展示策略，不能压倒前面的语义约束。

宽度断点由“候选实测宽度能否放入可用区”产生，不由课程ID、节点名、公式数值或固定1600门槛决定。文字宽度变化必须重新测高后再提交布局；不能只改width沿用旧height。

### 播放、课后、窄屏

播放中：当前步骤的内容窗包含当前卡及必要的图/公式上下文。镜头目标不是单张新卡的框；至少包含当前被讲解的关联单元。过去步骤保留在世界画布，不能靠重新排成密集小卡假装全课都清楚。

结束：收束成步骤顺序明确的全景。练习归属实际交互块，按宽度选择侧邻或下接。若全景在可读性约束下不可行，应明确输出“只能作导航总览”的状态；可读视图聚焦步骤/交互块，复用已有“查看整课”和缩放能力。

700：先尝试局部单列及保序短卡同行，不能把全部卡强缩为可读通过。可读步骤窗和整课总览需要分工；若产品坚持“700一屏显示全部卡且全字可读”，本方案也不能保证，必须以真实渲染验证其可行性。这里不是悄悄放宽验收红线：允许历史内容在可读焦点视图之外，应作为明确产品行为评审；全景本身仍不裁卡。

### 位移时机和幅度

- 字体/尺寸稳定后，在Beat边界批量提交，不在滑块拖动或3D手势过程中重排。
- 播放时已结束步骤的位置保持；当前步骤允许局部移动，建议预算为安全视口短边的15%（屏幕坐标），超预算候选改用追加子行，不整板跳动。此比例是待验证的通用产品参数，不是课程特判。
- 练习开放或主动切换总览时允许一次结构收束。单纯下接练习会令后续行平移“新增高度+间距”；按偏导实测194px练习和28px间距估算，若直接下接，世界坐标多222px，在当前0.563缩放约125px。这解释了为何要有侧邻候选。实际需扣除原行可利用高度，不能无条件宣称零位移。
- 布局变更和镜头变更同一事务，以当前关注对象维持屏幕锚点；节点世界位移与相机位移分别记录。跨过预算的大变动留到显式视图切换，不把动画当成消除位移。
- 有手写批注/pinned时保护其关联对象，转入受约束的增量排放；不能让正文移走留下墨迹。

## 5. 预期效果比较：是推算，不是实现结果

| 场景 | 当前矩阵 | 原三区提案预期 | 本建议预期与代价 |
| --- | --- | --- | --- |
| 二元方程 | 公式列空宽，三条短式竖排 | 消除空列，但式与注仍两条线 | 图旁同一解释流；短式有序同行，同时减宽与减高；局部卡会重排 |
| 偏导数 | 练习留在末尾 | 移到第一图下，后续行下推 | 图+控件+练习选侧邻/下接；不把第二步图合并进第一步；仍需真实测量决定模板 |
| 等高线/三角函数1440 | 双图强制竖排 | 若仍按旧断点，问题保留 | 双图用实际宽度争取并排，解释可转到下方；更紧凑但局部阅读方向可能变化 |
| 马鞍面 | 三图与长公式共同压缩整板 | 自然宽度只解决一部分 | 保对照，式注同流，拒绝破坏可读性的压缩；700总览仍可能不可读 |
| 单图、多练习课程 | 简单课程也有长距离操作 | 下挂练习提升邻近，但可能增高 | 为实际可用练习面板选择局部侧邻，不按声明任务数预留 |

二元方程的一个可复核尺寸推算：用本次1920实测自然尺寸不变，第一步图440×360，公式185×101，笔记308×135。图右侧竖排公式与笔记，只需约780×360（示例局部水平间距32、卡间距16），而当前第一步占宽约1524。第二步三式若同排，宽约453、高101，替代高277的竖排；第四步两式同排宽约597、高101，替代高189的竖排。保持当前48px步骤间隔，整课高度约1105→841，减少264px（约24%）。若安全区仍提供约776px高度，纯高度约束下scale上限由约0.70提升到约0.92。

**这只是同一批DOM尺寸下的构造可行性推算，不是新算法实测scale，也未验证字体重测、镜头、墨迹与流式稳定性。** 它说明“先保护阅读结构，再减少空宽和无必要竖排”值得原型验证，不能代替新算法的全课程截图。其他课程不借用此数值承诺收益。

## 6. 逐课视觉审阅与原图

表中缩放均为结束全景；间距是1920结束时控件面板与练习面板的最近矩形边缘距离（含斜向距离），不是语义评分。每个截图链接指向完整原始PNG。全部课程数据未改。

### 直观理解分数的大小比较

`fraction-comparing-unit-shares @ 0.1.0`；控件2，声明练习2；步骤：图1式2注1；图0式2注0；图0式1注0；无新卡。

桌面首行笔记远离两条短公式；后续推导竖直堆积；练习偏右。改为图旁连续解释流，短公式同行，练习贴控件。

结束缩放1920 / 1440 / 700：**0.758 / 0.582 / 0.475**；1920控件—练习距离：375px。

| 阶段 | 1920×1080 | 1440×900 | 700×1000 |
| --- | --- | --- | --- |
| 播放中 | [原图](screenshots/fraction-comparing-unit-shares-playing-1920.png) | [原图](screenshots/fraction-comparing-unit-shares-playing-1440.png) | [原图](screenshots/fraction-comparing-unit-shares-playing-700.png) |
| 结束 | [原图](screenshots/fraction-comparing-unit-shares-ended-1920.png) | [原图](screenshots/fraction-comparing-unit-shares-ended-1440.png) | [原图](screenshots/fraction-comparing-unit-shares-ended-700.png) |

### 等价分数的图形直观与原理

`fraction-equivalent-visuals @ 0.1.0`；控件2，声明练习3；步骤：图1式2注1；图0式1注1；图0式1注1；图0式0注1。

多步骤“等价关系—说明”被类型列拆开，笔记形成参差右边界；700 是很细的长条。保留每步公式与解释的先后关系。

结束缩放1920 / 1440 / 700：**0.631 / 0.458 / 0.363**；1920控件—练习距离：383px。

| 阶段 | 1920×1080 | 1440×900 | 700×1000 |
| --- | --- | --- | --- |
| 播放中 | [原图](screenshots/fraction-equivalent-visuals-playing-1920.png) | [原图](screenshots/fraction-equivalent-visuals-playing-1440.png) | [原图](screenshots/fraction-equivalent-visuals-playing-700.png) |
| 结束 | [原图](screenshots/fraction-equivalent-visuals-ended-1920.png) | [原图](screenshots/fraction-equivalent-visuals-ended-1440.png) | [原图](screenshots/fraction-equivalent-visuals-ended-700.png) |

### 直观理解分数的意义与结构

`fraction-notation-and-parts @ 0.1.0`；控件2，声明练习2；步骤：图1式1注1；图0式1注1；图0式1注0；无新卡。

首行“分子/分母”与名称笔记隔得很远；下一步同样重复空列。合并解释流，不能只把公式列变窄。

结束缩放1920 / 1440 / 700：**0.797 / 0.578 / 0.485**；1920控件—练习距离：378px。

| 阶段 | 1920×1080 | 1440×900 | 700×1000 |
| --- | --- | --- | --- |
| 播放中 | [原图](screenshots/fraction-notation-and-parts-playing-1920.png) | [原图](screenshots/fraction-notation-and-parts-playing-1440.png) | [原图](screenshots/fraction-notation-and-parts-playing-700.png) |
| 结束 | [原图](screenshots/fraction-notation-and-parts-ended-1920.png) | [原图](screenshots/fraction-notation-and-parts-ended-1440.png) | [原图](screenshots/fraction-notation-and-parts-ended-700.png) |

### 认识分数的初步概念：从方格到二分之一

`fraction-what-is-a-half @ 0.1.0`；控件2，声明练习2；步骤：图1式0注2；图0式1注0；图0式2注0；图0式0注1。

无公式的第一行比其他分数课连贯，但后续短公式拉长整课，练习离图远。说明无空公式列时较好，仍需局部换行与交互附属。

结束缩放1920 / 1440 / 700：**0.677 / 0.528 / 0.427**；1920控件—练习距离：365px。

| 阶段 | 1920×1080 | 1440×900 | 700×1000 |
| --- | --- | --- | --- |
| 播放中 | [原图](screenshots/fraction-what-is-a-half-playing-1920.png) | [原图](screenshots/fraction-what-is-a-half-playing-1440.png) | [原图](screenshots/fraction-what-is-a-half-playing-700.png) |
| 结束 | [原图](screenshots/fraction-what-is-a-half-ended-1920.png) | [原图](screenshots/fraction-what-is-a-half-ended-1440.png) | [原图](screenshots/fraction-what-is-a-half-ended-700.png) |

### 正比例函数 y = kx 与斜率的几何意义

`linear-intro-and-slope @ 0.1.0`；控件1，声明练习2；步骤：图1式1注1；无新卡；无新卡。

只有一个建卡步骤仍把练习放到最右下，控件—练习间距最大。优先使用图+控件与练习侧邻的局部模板。

结束缩放1920 / 1440 / 700：**1.09 / 0.796 / 0.756**；1920控件—练习距离：934px。

| 阶段 | 1920×1080 | 1440×900 | 700×1000 |
| --- | --- | --- | --- |
| 播放中 | [原图](screenshots/linear-intro-and-slope-playing-1920.png) | [原图](screenshots/linear-intro-and-slope-playing-1440.png) | [原图](screenshots/linear-intro-and-slope-playing-700.png) |
| 结束 | [原图](screenshots/linear-intro-and-slope-ended-1920.png) | [原图](screenshots/linear-intro-and-slope-ended-1440.png) | [原图](screenshots/linear-intro-and-slope-ended-700.png) |

### 一次函数 y = 2x - 1 的图像本质与画法

`linear-plotting-points @ 0.1.0`；控件2，声明练习3；步骤：图1式1注1；无新卡；图0式1注1。

笔记离图远；末段长公式形成宽块，与此前窄公式失衡。原始数据存在红色公式渲染错误，保留原样，不能用布局修复掩盖。

结束缩放1920 / 1440 / 700：**0.913 / 0.603 / 0.494**；1920控件—练习距离：376px。

| 阶段 | 1920×1080 | 1440×900 | 700×1000 |
| --- | --- | --- | --- |
| 播放中 | [原图](screenshots/linear-plotting-points-playing-1920.png) | [原图](screenshots/linear-plotting-points-playing-1440.png) | [原图](screenshots/linear-plotting-points-playing-700.png) |
| 结束 | [原图](screenshots/linear-plotting-points-ended-1920.png) | [原图](screenshots/linear-plotting-points-ended-1440.png) | [原图](screenshots/linear-plotting-points-ended-700.png) |

### 二元一次方程组与一次函数的几何意义

`linear-simultaneous-intersections @ 0.1.0`；控件0，声明练习0；步骤：图1式1注1；图0式3注0；图0式0注1；图0式2注0。

“直线的交点”笔记被空公式列推远；第二步三张短公式纵向排。紧凑解释流和有序短公式同行可同时减少宽度与高度。

结束缩放1920 / 1440 / 700：**0.702 / 0.539 / 0.471**；1920控件—练习距离：无控件练习。

| 阶段 | 1920×1080 | 1440×900 | 700×1000 |
| --- | --- | --- | --- |
| 播放中 | [原图](screenshots/linear-simultaneous-intersections-playing-1920.png) | [原图](screenshots/linear-simultaneous-intersections-playing-1440.png) | [原图](screenshots/linear-simultaneous-intersections-playing-700.png) |
| 结束 | [原图](screenshots/linear-simultaneous-intersections-ended-1920.png) | [原图](screenshots/linear-simultaneous-intersections-ended-1440.png) | [原图](screenshots/linear-simultaneous-intersections-ended-700.png) |

### 长方形的面积与周长

`rectangle-area-from-tiles @ 0.1.5`；控件2，声明练习1；步骤：图1式0注1；图0式1注0；图0式1注0；图0式0注1。

第一行图与说明较合理；后续公式、总结、练习形成长尾。保留第一行优点，练习靠近控件，公式按阅读顺序紧凑排列。

结束缩放1920 / 1440 / 700：**0.724 / 0.565 / 0.495**；1920控件—练习距离：333px。

| 阶段 | 1920×1080 | 1440×900 | 700×1000 |
| --- | --- | --- | --- |
| 播放中 | [原图](screenshots/rectangle-area-from-tiles-playing-1920.png) | [原图](screenshots/rectangle-area-from-tiles-playing-1440.png) | [原图](screenshots/rectangle-area-from-tiles-playing-700.png) |
| 结束 | [原图](screenshots/rectangle-area-from-tiles-ended-1920.png) | [原图](screenshots/rectangle-area-from-tiles-ended-1440.png) | [原图](screenshots/rectangle-area-from-tiles-ended-700.png) |

### 一次函数 y = mx + b 的图像与性质

`slope-and-intercept @ 0.1.6`；控件2，声明练习3；步骤：图1式1注1；无新卡；图0式1注0；图0式1注0。

参数说明孤悬右上；末尾练习与双滑块分离。真实最新包第4步是 math，交接表的“注1”不准确，布局不可依赖表中类型假设。

结束缩放1920 / 1440 / 700：**0.847 / 0.6 / 0.549**；1920控件—练习距离：371px。

| 阶段 | 1920×1080 | 1440×900 | 700×1000 |
| --- | --- | --- | --- |
| 播放中 | [原图](screenshots/slope-and-intercept-playing-1920.png) | [原图](screenshots/slope-and-intercept-playing-1440.png) | [原图](screenshots/slope-and-intercept-playing-700.png) |
| 结束 | [原图](screenshots/slope-and-intercept-ended-1920.png) | [原图](screenshots/slope-and-intercept-ended-1440.png) | [原图](screenshots/slope-and-intercept-ended-700.png) |

### 水平截线与等高线：以 z=x²+y² 为例

`surface-paraboloid-level-sets @ 0.2.3`；控件1，声明练习1；步骤：图2式0注1；图0式2注0；无新卡；无新卡。

1920 双图并排便于对照；1440 强制堆叠显著缩小全景，播放中第二图部分出屏。按实际双图宽度决定换行，共享控件不只附属第一图。

结束缩放1920 / 1440 / 700：**0.89 / 0.483 / 0.462**；1920控件—练习距离：403px。

| 阶段 | 1920×1080 | 1440×900 | 700×1000 |
| --- | --- | --- | --- |
| 播放中 | [原图](screenshots/surface-paraboloid-level-sets-playing-1920.png) | [原图](screenshots/surface-paraboloid-level-sets-playing-1440.png) | [原图](screenshots/surface-paraboloid-level-sets-playing-700.png) |
| 结束 | [原图](screenshots/surface-paraboloid-level-sets-ended-1920.png) | [原图](screenshots/surface-paraboloid-level-sets-ended-1440.png) | [原图](screenshots/surface-paraboloid-level-sets-ended-700.png) |

### 偏导数：固定输入，求截线斜率

`surface-partial-derivative-slice @ 0.2.3`；控件1，声明练习1；步骤：图1式1注1；图1式2注0；图0式1注1；图0式0注1。

两步分别有图，讲解与图分离；练习回指上方控件却出现在最后。跨步骤不整体合并；保持两步阅读顺序，练习附属实际交互图。

结束缩放1920 / 1440 / 700：**0.563 / 0.409 / 0.326**；1920控件—练习距离：469px。

| 阶段 | 1920×1080 | 1440×900 | 700×1000 |
| --- | --- | --- | --- |
| 播放中 | [原图](screenshots/surface-partial-derivative-slice-playing-1920.png) | [原图](screenshots/surface-partial-derivative-slice-playing-1440.png) | [原图](screenshots/surface-partial-derivative-slice-playing-700.png) |
| 结束 | [原图](screenshots/surface-partial-derivative-slice-ended-1920.png) | [原图](screenshots/surface-partial-derivative-slice-ended-1440.png) | [原图](screenshots/surface-partial-derivative-slice-ended-700.png) |

### 马鞍面与鞍点：梯度为零不一定是极值点

`surface-saddle-point-analysis @ 0.2.3`；控件0，声明练习0；步骤：图2式1注0；图1式3注0；图0式1注1；图0式3注2。

内容最密集：双3D图、后续对照图、长公式和总结；1440竖排双图加重缩放，700结束只有0.252。应保对照块、合并公式笔记阅读流；窄屏仍需可读局部视图。

结束缩放1920 / 1440 / 700：**0.626 / 0.38 / 0.252**；1920控件—练习距离：无控件练习。

| 阶段 | 1920×1080 | 1440×900 | 700×1000 |
| --- | --- | --- | --- |
| 播放中 | [原图](screenshots/surface-saddle-point-analysis-playing-1920.png) | [原图](screenshots/surface-saddle-point-analysis-playing-1440.png) | [原图](screenshots/surface-saddle-point-analysis-playing-700.png) |
| 结束 | [原图](screenshots/surface-saddle-point-analysis-ended-1920.png) | [原图](screenshots/surface-saddle-point-analysis-ended-1440.png) | [原图](screenshots/surface-saddle-point-analysis-ended-700.png) |

### 余弦函数与单位圆投影

`trig-cosine-and-phase-shift @ 0.1.0`；控件1，声明练习1；步骤：图2式0注0；无新卡；图1式2注0；图0式2注2。

1920单位圆与曲线对照清楚；1440被拆为上下，结束时第三图与长尾推导共同拉高画布。保持对照块，后续图按自己的步骤排。

结束缩放1920 / 1440 / 700：**0.603 / 0.369 / 0.317**；1920控件—练习距离：503px。

| 阶段 | 1920×1080 | 1440×900 | 700×1000 |
| --- | --- | --- | --- |
| 播放中 | [原图](screenshots/trig-cosine-and-phase-shift-playing-1920.png) | [原图](screenshots/trig-cosine-and-phase-shift-playing-1440.png) | [原图](screenshots/trig-cosine-and-phase-shift-playing-700.png) |
| 结束 | [原图](screenshots/trig-cosine-and-phase-shift-ended-1920.png) | [原图](screenshots/trig-cosine-and-phase-shift-ended-1440.png) | [原图](screenshots/trig-cosine-and-phase-shift-ended-700.png) |

### 单位圆与正弦函数的单调性及象限循环

`trig-quadrants-and-monotonicity @ 0.1.0`；控件1，声明练习3；步骤：图2式0注1；图0式2注0；图0式1注0；图0式2注0。

双图是教学主轴，后面长公式不可当普通短卡缩小；最后练习离角度滑块很远。保对照与长公式可读性，练习回到共享控制单元。

结束缩放1920 / 1440 / 700：**0.655 / 0.393 / 0.359**；1920控件—练习距离：483px。

| 阶段 | 1920×1080 | 1440×900 | 700×1000 |
| --- | --- | --- | --- |
| 播放中 | [原图](screenshots/trig-quadrants-and-monotonicity-playing-1920.png) | [原图](screenshots/trig-quadrants-and-monotonicity-playing-1440.png) | [原图](screenshots/trig-quadrants-and-monotonicity-playing-700.png) |
| 结束 | [原图](screenshots/trig-quadrants-and-monotonicity-ended-1920.png) | [原图](screenshots/trig-quadrants-and-monotonicity-ended-1440.png) | [原图](screenshots/trig-quadrants-and-monotonicity-ended-700.png) |

### 从单位圆旋转到正弦曲线

`trig-unit-circle-to-sine @ 0.1.0`；控件1，声明练习1；步骤：图2式1注1；无新卡；图0式2注1。

第一行同时有双图、式、注，横向预留导致笔记偏远；1440双图堆叠，700呈长条。双图块+混合解释流，附属控件与练习。

结束缩放1920 / 1440 / 700：**0.841 / 0.496 / 0.406**；1920控件—练习距离：348px。

| 阶段 | 1920×1080 | 1440×900 | 700×1000 |
| --- | --- | --- | --- |
| 播放中 | [原图](screenshots/trig-unit-circle-to-sine-playing-1920.png) | [原图](screenshots/trig-unit-circle-to-sine-playing-1440.png) | [原图](screenshots/trig-unit-circle-to-sine-playing-700.png) |
| 结束 | [原图](screenshots/trig-unit-circle-to-sine-ended-1920.png) | [原图](screenshots/trig-unit-circle-to-sine-ended-1440.png) | [原图](screenshots/trig-unit-circle-to-sine-ended-700.png) |

## 7. 实施边界与下一轮验收

本轮到设计评审为止。建议下一轮在隔离原型中比较当前矩阵、原关联三区提案、本建议三个候选，输入同一份真实事件、同一时刻、同一字体和测量结果，不更改课程。正式改 OLL 时必须按交接流程 npm build → 补丁脚本 → 应用/课程库离线安装 → force重启，且确认board-view模块被同步。

几何、排版、注意力三个维度分别出结果。几何检查重叠/遮挡/裁切；排版逐图审阅步骤顺序、图式注对应、双图对照、练习到所有目标的距离、正文有效字号；注意力记录新卡、练习开启、窗口切换时的世界位移和屏幕位移。不能用“平均提高”抵消某一门课的严重退化。

至少保留本次90帧的逐课对比，再增加首屏、每次新增卡、练习开放前后、练习反馈/提示展开、末帧、双向resize、窄屏冷启动。实时链路用同一事件流按前缀释放，不给未来plannedSteps的空间预留。候选通过几何测试后仍需逐图人工审阅；未拿到新算法真实截图之前，本报告只推荐方向，不判定胜出。
