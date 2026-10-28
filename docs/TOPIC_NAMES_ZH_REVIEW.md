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


## 2026-10-28：按目录描述修正名称

星图开场问题（PR #103）按每个知识点的目录描述和例子撰写。核对时发现不少中文名和实际内容对不上，例如“十分之几（8 岁+）”实际讲百分之几，“测量温度”实际讲负数情境中的差值。原因在目录本身：英文名常常只是粗略的标签，原先的中文名是照英文翻译的。

- 过程：3 个 agent 分批逐条对照描述和例子核对全部 567 个名称，只在学生看名字会以为是另一种技能时才改，共提出 93 处。另一个 agent 独立审查：接受 82 处，调整 11 处（例如用教材里的“几个一数”“归一问题”“保留几位小数”；“分数单位”在国内教材里指单位分数，不能用来表示“精确到几分之一”），没有驳回。
- 按用户 2026-10-26 的决定，中文名由模型判断，不做人工审核。只改显示名，知识点 id 不变，学习记录、地图状态和成就都不受影响。
- 英文名仍按目录原样显示在中文名下方，所以有的条目中文名和英文名会不一致。这是有意的：中文名跟着实际内容走。
- 改后 567 个名称仍互不相同。审查提到“小数的大小比较”和“比较小数”很接近，但两者是不同年龄段的知识点，保留。

| id | 原名 | 新名 | 目录英文名 | 原因 |
|---|---|---|---|---|
| `mt_e8CZ7E5qW7` | 9 以内的数的组成 | 10 的组成 | Number bonds to 9 | Teaches number bonds to 10 (complements of 1-9), not compositions of numbers up to 9 |
| `mt_anAe11HAEH` | 两步方程 | 四则运算两步应用题 | Two-Step Equations | Match sibling 四则运算多步应用题; 四则混合 is not a textbook phrase |
| `mt_JH_6RpNWjr` | 加减法计算策略（10 岁+） | 小数加减法 | Addition and subtraction strategies (age 10+) | Teaches adding and subtracting decimals to hundredths, not general strategies |
| `mt_i2F1nWxJjv` | 数轴上的数（11 岁+） | 一元一次不等式 | Numbers on a number line | Teaches writing, solving and graphing linear inequalities |
| `mt_3qrCtdoVAU` | 简单公式 | 公式变形 | Simple formulae | Teaches rearranging formulae to change the subject |
| `mt_Yw27nweoTj` | 估算答案（13 岁+） | 利用图像求近似解 | Estimating answers (age 13+) | Uses linear/quadratic graphs to estimate values and approximate solutions |
| `mt_z5iwdZyeDr` | 代数式变形 | 用式子和图像表示关系 | Algebraic Transformations | Teaches modelling situations with expressions, formulae, tables and graphs, not transforming expressions |
| `mt_nvdpxAJTBG` | 两个两个地数 | 2 个、5 个、10 个一数 | Counting in 2s | Textbook phrasing 几个一数 instead of 跳着数 with content in brackets |
| `mt_7rJM8eWUfw` | 六个六个地数 | 6、7、9、25、1000 个一数 | Counting in 6s | Textbook phrasing 几个一数; consistent with the 2/5/10 sibling |
| `mt_aHAM29nidj` | 顺数和倒数 | 三个三个地数 | Counting forwards and backwards | Teaches counting forwards and backwards in steps of 3 |
| `mt_OkSJfrmFb_` | 顺数和倒数（6 岁+） | 从任意数起十个十个地数 | Counting forwards and backwards (age 6+) | Teaches counting in tens from any number, forwards and backwards |
| `mt_dmNvjroCPT` | 一共有多少？ | 最后数到几就有几个 | How Many in Total? | Teaches the cardinality principle; 一共有多少 signals an addition problem |
| `mt_ChjMU2GDJa` | 条形统计图 | 折线统计图（8 岁+） | Bar graphs | Examples are time graphs showing change over time, not bar charts |
| `mt_1VSfm9yiLn` | 分类（6 岁+） | 根据分类数据回答问题 | Sorting into categories (age 6+) | Teaches interpreting categorical data (totals, how many more/fewer), not sorting |
| `mt_u5HkSxZECM` | 象形统计图和计数表（6 岁+） | 统计图表的术语 | Pictograms and tally charts (age 6+) | Teaches the vocabulary of data collection and display |
| `mt_eKJG-0eC6D` | 象形统计图和计数表（11 岁+） | 频数分布表与统计图 | Pictograms and tally charts (age 11+) | Teaches frequency tables, bar charts, pie charts and line charts for grouped data |
| `mt_Fl7b8q9pI1` | 小数的数位 | 一位小数的四舍五入 | Decimal place value | Teaches rounding one-place decimals to the nearest whole number |
| `mt_Ii1hV4V5ql` | 小数的数位（9 岁+） | 两位小数的四舍五入 | Decimal place value (age 9+) | Teaches rounding two-place decimals to a whole number and to one place |
| `mt_4K1dr204Hi` | 小数和分数（10 岁+） | 分数、小数和百分数的互化 | Decimals and fractions (age 10+) | Teaches fraction as division and fraction-decimal-percentage equivalences |
| `mt_4Km38F4L-6` | 整体的几分之几（10 岁+） | 分数与除法的关系 | Fractions of a whole (age 10+) | Teaches a/b = a ÷ b and sharing problems with fractional answers |
| `mt_HJA2Oz-Zh1` | 整体的几分之几（9 岁+） | 分数乘整数应用题 | Fractions of a whole (age 9+) | Teaches word problems multiplying a fraction by a whole number |
| `mt_SsLWS_APM7` | 比较分数（7 岁+） | 分数的综合应用 | Comparing fractions (age 7+) | Mixed fraction problem solving, of which comparison is only one part |
| `mt_kdWoAel3Zl` | 十分之几（9 岁+） | 千分之几 | Tenths (age 9+) | Teaches thousandths, not tenths |
| `mt_a1FdAsRKOF` | 简单的分数加法 | 同分母分数加减法 | Simple Fraction Sums | Adds and subtracts same-denominator fractions |
| `mt_IegHBHERVa` | 小数的数位（8 岁+） | 小数的大小比较 | Decimal place value (age 8+) | Teaches comparing and ordering decimals with up to two places |
| `mt_AYzE1EAvI0` | 整体的几分之几（8 岁+） | 整数写成分数 | Fractions of a whole (age 8+) | Teaches writing whole numbers as fractions and fractions equal to wholes |
| `mt_gNUE4B3vuk` | 带分数与假分数（11 岁+） | 有理数的四则运算 | Mixed & Improper Fractions | Four operations on positive/negative integers, decimals and fractions, not just mixed/improper conversion |
| `mt_SBkTGjiZjZ` | 小数和分数（11 岁+） | 有限小数与分数的互化 | Decimals and fractions (age 11+) | Teaches converting between terminating decimals and fractions |
| `mt_J339bO7qLe` | 分数乘法（11 岁+） | 求一个数的几分之几和百分之几 | Multiplying fractions (age 11+) | Fractions and percentages as operators on an amount, including discounts |
| `mt_k2WE0-22-4` | 单位分数 | 求一组物体的几分之几 | Unit fractions | Fractions of a set, including non-unit fractions |
| `mt_doX1BhmFgk` | 十分之几（8 岁+） | 百分之几 | Tenths (age 8+) | Teaches hundredths, not tenths |
| `mt_b7T-CjOYUR` | 约分 | 约分与通分 | Simplifying Fractions | Also covers finding common denominators |
| `mt_wB-GBDkoNr` | 小数和分数 | 钱和测量中的分数小数问题 | Decimals and fractions | 度量问题 is vague; money and measures are what is taught, distinct from sibling 测量中的分数小数应用题 |
| `mt_e4V6hvcuEJ` | 角的分类（8 岁+） | 几何图形的标注符号 | Types of angles (age 8+) | 几何图 is not a standard term; the topic is the marks and notation |
| `mt_89riIKwGYp` | 量角（9 岁+） | 利用角的和差求未知角 | Measuring angles (age 9+) | Angle additivity and unknown angles, not protractor measuring |
| `mt_KFKUR_gBg_` | 认识角（9 岁+） | 利用长方形的特征求边和角 | Understanding angles (age 9+) | Rectangle properties to find missing lengths and angles |
| `mt_QDTO3GAgcq` | 认识角（10 岁+） | 周角、平角和对顶角 | Understanding angles (age 10+) | Angles at a point, on a line, vertically opposite; finding missing angles |
| `mt_hdrMoiTgqu` | 平面图形（10 岁+） | 按给定边长和角度画图形 | 2-D shapes (age 10+) | Accurate drawing with ruler and protractor |
| `mt_sBcRdUfAzV` | 平面图形（6 岁+） | 按边数和对称性描述图形 | 2-D shapes (age 6+) | Properties of 2-D shapes: sides and vertical symmetry |
| `mt_yGv8doDAmp` | 立体图形（5 岁+） | 描述和比较图形的特征 | 3-D shapes (age 5+) | Comparing 2-D and 3-D shapes by sides and vertices |
| `mt_wUSbRt3-qw` | 立体图形（9 岁+） | 根据平面图识别立体图形 | 3-D shapes (age 9+) | 平面表示 is translationese; 平面图 covers nets and drawings |
| `mt_vJUa62bxeR` | 平面图形（7 岁+） | 画平面图形和做立体模型 | 2-D shapes (age 7+) | Drawing 2-D shapes and building 3-D models |
| `mt_REwgr0d_ss` | 立体图形（10 岁+） | 立体图形与展开图 | 3-D shapes (age 10+) | Building 3-D shapes and making nets |
| `mt_nRksLqt-iR` | 立体图形（11 岁+） | 立体图形的性质与截面 | 3-D shapes (age 11+) | Using face/edge/vertex properties and cross-sections to solve problems |
| `mt_tedML_iu4Y` | 认识角（11 岁+） | 综合运用角的性质求角 | Understanding angles (age 11+) | Multi-step missing-angle problems using angle facts |
| `mt_hR2Y7NhMSY` | 对称轴 | 补全轴对称图形 | Lines of symmetry | Completing a figure about a given mirror line |
| `mt_hRZyKvz1KN` | 平面图形（8 岁+） | 轴对称图形 | 2-D shapes (age 8+) | Identifying line-symmetric figures and drawing lines of symmetry |
| `mt_2jbUekyTu4` | 延续表格中的规律 | 从重复推理中归纳（7 岁+） | Extending Table Patterns | Generalising from times-table patterns, not data tables |
| `mt_aivrWs6jrS` | 乘法口诀（8 岁+） | 从重复推理中归纳（8 岁+） | Times tables (age 8+) | Generalising from patterns, not times-table recall |
| `mt_jCy07DyBNU` | 用等量关系推理 | 从重复推理中归纳（9 岁+） | Reasoning with Equivalences | Generalising rules from repeated reasoning |
| `mt_HY8Yycu_rz` | 理解分数（7 岁+） | 准确的数学表达（7 岁+） | Understanding fractions (age 7+) | Precise vocabulary, units and notation |
| `mt_hImiKNiaNh` | 四则运算顺序（10 岁+） | 利用数学结构（10 岁+） | Order of operations (age 10+) | Using structure across topics, not order of operations alone |
| `mt_DW2D1c0fKx` | 图形规律 | 利用数学结构（6 岁+） | Shape patterns | Using operation and place-value structure, not shape patterns |
| `mt_FAXjFkgG6X` | 图形规律（7 岁+） | 利用数学结构（7 岁+） | Shape patterns (age 7+) | Using place-value and operation structure |
| `mt_hlGKg5M7qJ` | 分数、小数与百分数 | 利用数学结构（9 岁+） | Fractions, Decimals & Percentages | Looking for and using structure across topics |
| `mt_3VmBdlAeOZ` | 数轴上的分数 | 在多种表示方式间转换 | Fractions on a number line | Moving between situations, diagrams, number lines and equations |
| `mt_9KmVWCuh5_` | 理解分数（10 岁+） | 在多种表示方式间转换（10 岁+） | Understanding fractions (age 10+) | Connecting representations incl. algebra and coordinate grids |
| `mt_dXq9VWm31W` | 理解分数 | 在多种表示方式间转换（7 岁+） | Understanding fractions | Moving between situations, diagrams and equations |
| `mt_CUmjcE7W6c` | 数轴上的分数（9 岁+） | 在多种表示方式间转换（9 岁+） | Fractions on a number line (age 9+) | Connecting several representations, not fractions on a number line |
| `mt_SmghasIvbT` | 多步骤解题 | 多步骤解题（8 岁+） | Multi-Step Problem Solving | Same name as mt_RKeheOL9uo; add age suffix |
| `mt_iQYPw8bMfN` | 认识和使用钱 | 测量、钱和时间问题的建模 | Working with money | Modelling measurement, money and time problems |
| `mt_2ESZh70NyS` | 理解分数（9 岁+） | 用推理说明理由 | Understanding fractions (age 9+) | Building and critiquing mathematical arguments |
| `mt_nyK25mNOeR` | 写出解题过程 | 说说解题过程 | Showing Your Working | Showing and telling with objects and words, not writing |
| `mt_zMEvtigoM3` | 数轴上的数 | 选择数学工具（6 岁+） | Numbers on a number line | Choosing tools and representations for problems |
| `mt_MJZA90uc6H` | 周长（10 岁+） | 周长与面积的关系 | Perimeter (age 10+) | Same area different perimeter and vice versa |
| `mt_2yas4Unc8o` | 认读时间（精确到分，9 岁+） | 时间单位换算 | Telling time to the minute (age 9+) | Converts hours/minutes/seconds/days, not reading clocks |
| `mt_skYly2Qm01` | 测量长度 | 比较物体的长短 | Measuring length | Orders and compares lengths (incl. indirectly), no measuring |
| `mt_5HV4mbgSGH` | 数轴上的分数（测量） | 测量中的分数小数应用题 | Fractions on a number line | Measurement word problems with fractions and decimals |
| `mt_zd0YkB3xNj` | 比较物体的轻重 | 测量物体的轻重 | Measuring mass and weight | Measures and records mass with units, not just comparing |
| `mt_AF2BeFQwfX` | 算钱和找零 | 用不同硬币组成同一钱数 | Adding money and giving change | Coin combinations for one amount, not adding or change |
| `mt_2VpdPjvewx` | 小数的数位（测量） | 用小数进行单位换算 | Decimal place value | Converting measurement units with decimal notation |
| `mt_ghK1mnEstc` | 二分之一和四分之一（8 岁+） | 精确到几分之一的测量与点状图 | Halves and quarters (age 8+) | 分数单位 means unit fraction in mainland textbooks, which misleads |
| `mt_mFJ-2ZF6Tk` | 估算和比较钱数 | 量的估算、比较与计算 | Estimating and comparing money | Estimating and comparing several measures, money is one of them |
| `mt_wPgpMJ0-PA` | 乘法和除法（10 岁+） | 乘除以 10、100、1000（10 岁+） | Multiplying and dividing (age 10+) | Multiplying/dividing by 10, 100, 1000 with decimals |
| `mt_LlMl2PbaZe` | 乘法和除法（9 岁+） | 乘除以 10、100、1000（9 岁+） | Multiplying and dividing | Multiplying/dividing by 10, 100, 1000 only |
| `mt_p-nbe0w_lf` | 有余数的除法 | 四则运算多步应用题 | Division with remainders | Multi-step four-operation word problems; remainders only one part |
| `mt_0Wg5F97osg` | 因数、倍数和质数（9 岁+） | 因数、倍数与平方数、立方数 | Factors, multiples, and primes (age 9+) | Uses factors, multiples, squares and cubes; no primes |
| `mt_SoDP1fSQEB` | 小数的数位（乘除） | 小数乘整数 | Decimal place value | Multiplying decimals by whole numbers |
| `mt_A-FyLLLLzy` | 图形规律（乘法） | 按规则生成数与图形的规律 | Shape patterns | Generating number/shape patterns from a rule; not multiplication |
| `mt_U4cIBXVug4` | 倍数比较（应用） | 用乘法算式表示倍数关系 | Multiplicative Comparison | Interpreting/writing equations as comparisons, not applied word problems |
| `mt_wh3UqnWsa7` | 乘法是求几个相同加数的和（6 岁+） | 用乘除法解决简单问题 | Multiplication as repeated addition (age 6+) | Solving multiplication and division problems, not repeated-addition meaning |
| `mt_ZOJ6EbdPOb` | 理解分数（乘除） | 简单的比例与归一问题 | Understanding fractions | 比率 is not a primary term; recipe/price examples are 归一问题 |
| `mt_hCVPYlF-7Y` | 平方数与立方数（数的表示） | 乘方与开方 | Square and cube numbers | Integer powers and square/cube/higher roots |
| `mt_U9sme87C32` | 小数的数位（11 岁+） | 保留几位小数和有效数字 | Decimal place value (age 11+) | 保留几位小数 is the standard textbook wording |
| `mt__casygEB85` | 小数的数位（数的表示） | 小数和整数的四舍五入 | Decimal place value | Rounding decimals and whole numbers, not place value |
| `mt_Ac7oMWhyPw` | 数的读写（10 岁+） | 小数的读写与比较 | Reading and writing numbers (age 10+) | Reading, writing and comparing decimals to thousandths |
| `mt_PsylzZ9lHW` | 数轴上的分数（数的表示） | 数位与数轴上的有理数 | Fractions on a number line | Matches sibling 有理数的大小比较; covers integers, decimals and fractions |
| `mt_uDJY0X0hgo` | 数轴上的分数（11 岁+） | 有理数的大小比较 | Fractions on a number line (age 11+) | Ordering/comparing integers, decimals, fractions incl. negatives |
| `mt_bO-njVOige` | 10 的幂的记法 | 科学记数法 | Powers of Ten Notation | Standard form A × 10ⁿ |
| `mt_RVK655t391` | 测量温度 | 负数情境中的差值计算 | Measuring temperature | 跨越零的负数差值 reads unnaturally; covers contexts and intervals across zero |
| `mt_VVn1IXjkzn` | 用四舍五入估算（12 岁+） | 近似值的误差范围 | Estimating by rounding | Upper/lower bounds and error intervals of rounded values |
| `mt_FnUJMXPUZX` | 理解分数（比与比例） | 按比分配（10 岁+） | Understanding fractions | Unequal sharing problems; suffix avoids clash with 按比分配 |
| `mt_ESgc4YBw-a` | 百分数（9 岁+） | 比和比例的术语 | Percentages (age 9+) | Vocabulary of ratio and proportion, not percentage calculation |
