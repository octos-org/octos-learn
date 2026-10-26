# 数学知识点中文名的审定（2026-10-26）

用户 2026-10-26 决定中文名由模型直接判断，不再人工审核。agent 逐条对照英文名、目录说明和国内教材叫法审阅了全部 567 个数学知识点的中文名，改了下面 65 条，其余保持原译。文件：`src/learning/map/topic-names-zh.json`（状态改为 `agent-reviewed`）。

改动的原因主要有四类：术语不准（如 Lines 是“直线”不是“线段”，Trigonometry basics 按国内初中叫“锐角三角函数”，Linear number sequences 是“等差数列”）；有歧义（“三个小数目相加”里的“小数”会被读成带小数点的数）；违反“不说掌握”的原则（“熟练掌握乘除法基本算式”）；不符合国内教材的说法（如“乘法是求几个相同加数的和”“相等的分数”“四则运算顺序”）。

| 领域 | 英文名 | 原译 | 改为 |
|---|---|---|---|
| Addition & Subtraction | Adding Three Small Numbers | 三个小数目相加 | 三个一位数连加 |
| Addition & Subtraction | Adding numbers | 数的相加 | 加法计算 |
| Addition & Subtraction | Grouping numbers to add | 凑数分组相加 | 凑整分组相加 |
| Addition & Subtraction | Inverse: addition undoes subtraction | 互逆关系：加法和减法互相抵消 | 加法与减法互为逆运算 |
| Addition & Subtraction | Missing number problems (age 7+) | 填未知数问题（7 岁+） | 填空求未知数（7 岁+） |
| Algebra | Expanding Double Brackets | 展开两个括号的乘积 | 两个括号相乘的展开 |
| Algebra | Expressions & Equations Vocabulary | 式子与方程的术语 | 代数式与方程的术语 |
| Algebra | Generating Sequences | 生成数列 | 按规律写出数列 |
| Algebra | Linear number sequences | 线性数列 | 等差数列 |
| Data & Statistics | Average distance from the mean | 与平均数的平均距离 | 平均绝对偏差 |
| Data & Statistics | Dot plots | 点图 | 点状图 |
| Data & Statistics | How far apart two groups are | 两组数据相差多远 | 两组数据的差异程度 |
| Data & Statistics | How samples vary | 样本的变化 | 样本的波动 |
| Data & Statistics | Line plots with fractions | 含分数的线图 | 含分数的点状图 |
| Fractions | Addition and subtraction word problems | 加减法应用题（分数） | 分数加减法应用题 |
| Fractions | Equivalent fractions | 等值分数 | 相等的分数 |
| Fractions | Equivalent fractions (age 8+) | 等值分数（8 岁+） | 相等的分数（8 岁+） |
| Fractions | Equivalent fractions (age 9+) | 等值分数（9 岁+） | 相等的分数（9 岁+） |
| Fractions | Equivalent fractions on a number line | 数轴上的等值分数 | 数轴上的相等分数 |
| Fractions | Fractions of amounts | 求一个数量的几分之几 | 求一个数的几分之几 |
| Fractions | Fractions of amounts (harder) | 求一个数量的几分之几（较难） | 求一个数的几分之几（较难） |
| Fractions | Multiplication as scaling | 乘法是放大或缩小 | 把乘法看作放大或缩小 |
| Geometry | 2-D faces on 3-D shapes | 立体图形上的平面 | 立体图形的面 |
| Geometry | Angle Sum Rules | 角的和的规律 | 角度和的规律 |
| Geometry | Degrees and turns | 度数与转动 | 角的度数与旋转 |
| Geometry | Describing Movements | 描述移动 | 描述物体的移动 |
| Geometry | Lines, Rays & Angles | 线段、射线和角 | 直线、射线和角 |
| Geometry | Parallel and perpendicular lines | 平行线与垂线 | 平行与垂直 |
| Geometry | Patterns & Sequences | 图案与序列 | 图形的排列规律 |
| Geometry | Similarity and enlargement | 相似与放大 | 相似图形与放大 |
| Geometry | Trigonometry basics | 三角学入门 | 锐角三角函数 |
| Geometry | Which triangles are possible | 能构成哪些三角形 | 三角形的构成条件 |
| Mathematical Thinking | Early Maths Vocabulary | 早期数学用语 | 数学启蒙用语 |
| Mathematical Thinking | Order of operations (age 10+) | 运算顺序（10 岁+） | 四则运算顺序（10 岁+） |
| Measurement | Area by Tiling | 用铺砖求面积 | 用面积单位铺满求面积 |
| Measurement | Coin Values | 硬币的面值 | 认识硬币的面值 |
| Measurement | Counting Unit Cubes | 数单位立方体 | 数小正方体求体积 |
| Measurement | Elapsed time problems | 经过时间问题 | 求经过的时间 |
| Measurement | Measurement Line Plots | 测量数据的线图 | 测量数据的点状图 |
| Measurement | Measuring Liquids & Masses | 测量液体和质量 | 测量容量和质量 |
| Measurement | Measuring mass and weight | 称质量和重量 | 比较物体的轻重 |
| Measurement | Measuring mass and weight (age 4+) | 称质量和重量（4 岁+） | 比较物体的轻重（4 岁+） |
| Measurement | Roman numeral and 24-hour clocks | 罗马数字钟面和 24 小时制 | 24 时计时法与罗马数字钟面 |
| Measurement | Sequence intervals of time | 时间段的先后 | 给时间段排序 |
| Measurement | Telling time to 5 minutes | 认读到 5 分钟的时间 | 认读时间（精确到 5 分） |
| Measurement | Telling time to the minute (age 9+) | 认读到分钟的时间（9 岁+） | 认读时间（精确到分，9 岁+） |
| Measurement | Time to the nearest minute | 精确到分钟的时间 | 认读时间（精确到分） |
| Measurement | Volume as additive | 体积可以相加 | 体积的可加性 |
| Multiplication & Division | All times tables to 12×12 | 12×12 以内的全部乘法表 | 12×12 以内的乘法表 |
| Multiplication & Division | Fluent multiplication and division facts | 熟练掌握乘除法基本算式 | 乘除法基本算式（熟练计算） |
| Multiplication & Division | Multiplication as repeated addition | 乘法是相同加数连加 | 乘法是求几个相同加数的和 |
| Multiplication & Division | Multiplication as repeated addition (age 6+) | 乘法是相同加数连加（6 岁+） | 乘法是求几个相同加数的和（6 岁+） |
| Multiplication & Division | Multiplying and dividing | 乘法和除法 | 乘法和除法（9 岁+） |
| Multiplication & Division | Order of operations | 运算顺序 | 四则运算顺序 |
| Multiplication & Division | Priority of operations | 运算的优先级 | 运算顺序（11 岁+） |
| Multiplication & Division | Rounding Answers | 答案取近似值 | 计算结果取近似值 |
| Multiplication & Division | Short division with remainders | 有余数的短除法 | 有余数的除法竖式（简写） |
| Multiplication & Division | Sign Rules for Multiplication | 乘法的符号法则 | 有理数乘法的符号法则 |
| Number Representation & Place Value | Rounding Large Numbers | 大数的近似 | 大数的四舍五入 |
| Probability | Independent and dependent events | 独立事件与非独立事件 | 相互独立事件与不独立事件 |
| Probability | The 0-to-1 Probability Scale | 0 到 1 的概率刻度 | 用 0 到 1 表示可能性大小 |
| Probability | The Probability Scale | 概率刻度 | 可能性大小的刻度 |
| Ratio & Proportion | Area from scale drawings | 由比例图求面积 | 由比例尺图求面积 |
| Ratio & Proportion | Proportion Graphs | 正比例图像 | 正比例关系的图像 |
| Ratio & Proportion | Scale drawings and maps | 比例图与地图 | 比例尺图与地图 |
