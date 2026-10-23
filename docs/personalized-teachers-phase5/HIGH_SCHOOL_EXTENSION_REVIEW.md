# 高中知识点本地扩展（草稿，待审核）

日期：2026-10-23。用户要求补全知识点；上游 os-taxonomy（c7ed549）只覆盖到约 14 岁，没有高中内容。本草稿按《普通高中数学课程标准（2017年版2020年修订）》的主题结构起草 42 个高中知识点，另加 2 个 Octos Learn 已在讲的大学空间曲面内容，共 44 个，数据见 [HIGH_SCHOOL_EXTENSION_DRAFT.json](HIGH_SCHOOL_EXTENSION_DRAFT.json)。

- 编号用 `lx_` 前缀，与上游 `mt_` 区分；英文名称、描述和理解表现与上游格式一致（自动分析按英文检索），另附中文名。
- 75 条前置关系，其中 26 条连到上游已有节点（如一次函数图像、二次函数图像、三角学入门、勾股定理），程序已核对每条都能对应到真实编号。
- 文字为 agent 依课标模块结构自拟，不是课标原文引用。
- **目前不被程序加载**：审核通过后才并入目录，并按目录升级规则处理（规则版本、旧结果、地图和成就不受影响）。

## 需要审核的内容

1. 名称、描述和“理解表现”是否准确、措辞是否合适。
2. 颗粒度：是否需要拆分（如“三角恒等变换”）或合并。
3. 前置关系是否合理，强（必须先会）/软（有帮助）是否标对。
4. “高中以上”两项是否保留。
5. 是否还需要补充：例如课标中的“数学建模活动”“数学探究”等综合内容暂未列入。

## 草稿清单

| 编号 | 名称 | 领域 | 出处 | 前置 |
|---|---|---|---|---|
| `lx_sets` | 集合及其运算<br>Sets and set operations | 集合与逻辑 | 必修·预备知识·集合 | Sets & Venn Diagrams（上游）、Number Sets & Infinity（上游）（软） |
| `lx_logic_conditions` | 常用逻辑用语<br>Necessary and sufficient conditions and quantifiers | 集合与逻辑 | 必修·预备知识·常用逻辑用语 | 集合及其运算 |
| `lx_inequality_properties` | 不等式性质与基本不等式<br>Properties of inequalities and the basic inequality | 不等式 | 必修·预备知识·相等关系与不等关系 | Solving Linear Equations（上游） |
| `lx_quadratic_inequalities` | 从函数观点看一元二次方程和不等式<br>Quadratic functions, equations and inequalities | 不等式 | 必修·预备知识·一元二次函数、方程和不等式 | Quadratic Graphs（上游）、不等式性质与基本不等式 |
| `lx_function_concept` | 函数的概念及其表示<br>Concept and representations of functions | 函数 | 必修·函数·函数概念与性质 | 集合及其运算、Linear Function Graphs（上游） |
| `lx_function_properties` | 函数的单调性、最值与奇偶性<br>Monotonicity, extrema and parity of functions | 函数 | 必修·函数·函数概念与性质 | 函数的概念及其表示 |
| `lx_power_functions` | 幂函数<br>Power functions | 函数 | 必修·函数·幂函数、指数函数与对数函数 | 函数的单调性、最值与奇偶性、Square and cube numbers（上游）（软） |
| `lx_rational_exponents` | 指数幂的运算<br>Rational and real exponents | 函数 | 必修·函数·幂函数、指数函数与对数函数 | Powers of Ten Notation（上游）、Square and cube numbers（上游） |
| `lx_exponential_functions` | 指数函数<br>Exponential functions | 函数 | 必修·函数·幂函数、指数函数与对数函数 | 指数幂的运算、函数的单调性、最值与奇偶性 |
| `lx_logarithms` | 对数及其运算<br>Logarithms and their laws | 函数 | 必修·函数·幂函数、指数函数与对数函数 | 指数幂的运算 |
| `lx_logarithmic_functions` | 对数函数<br>Logarithmic functions | 函数 | 必修·函数·幂函数、指数函数与对数函数 | 对数及其运算、指数函数 |
| `lx_function_zeros` | 函数的零点与二分法<br>Zeros of functions and the bisection method | 函数 | 必修·函数·函数应用 | 函数的单调性、最值与奇偶性 |
| `lx_function_models` | 函数模型及其应用<br>Function models in context | 函数 | 必修·函数·函数应用 | 指数函数、对数函数 |
| `lx_radian_measure` | 任意角与弧度制<br>General angles and radian measure | 三角函数 | 必修·函数·三角函数 | Trigonometry basics（上游）、Circles: Circumference & Area（上游） |
| `lx_trig_definitions` | 任意角的三角函数（单位圆定义）<br>Trigonometric functions of any angle | 三角函数 | 必修·函数·三角函数 | 任意角与弧度制 |
| `lx_trig_identities` | 同角关系与诱导公式<br>Basic trigonometric identities and reduction formulas | 三角函数 | 必修·函数·三角函数 | 任意角的三角函数（单位圆定义） |
| `lx_trig_graphs` | 正弦、余弦、正切函数的图像与性质<br>Graphs and properties of sine, cosine and tangent | 三角函数 | 必修·函数·三角函数 | 任意角的三角函数（单位圆定义）、函数的单调性、最值与奇偶性 |
| `lx_sinusoidal_functions` | 函数 y=Asin(ωx+φ)<br>Functions y = A sin(ωx + φ) | 三角函数 | 必修·函数·三角函数 | 正弦、余弦、正切函数的图像与性质 |
| `lx_trig_transformations` | 三角恒等变换<br>Sum, difference and double-angle formulas | 三角函数 | 必修·函数·三角函数 | 同角关系与诱导公式 |
| `lx_solving_triangles` | 正弦定理与余弦定理<br>Law of sines and law of cosines | 三角函数 | 必修·几何与代数·平面向量及其应用 | 任意角的三角函数（单位圆定义）、Applying Pythagoras' theorem（上游） |
| `lx_plane_vectors` | 平面向量及其运算<br>Plane vectors and their operations | 向量与复数 | 必修·几何与代数·平面向量及其应用 | Coordinate Transformations（上游） |
| `lx_dot_product` | 向量的数量积<br>Scalar product of vectors | 向量与复数 | 必修·几何与代数·平面向量及其应用 | 平面向量及其运算、任意角的三角函数（单位圆定义） |
| `lx_complex_numbers` | 复数<br>Complex numbers | 向量与复数 | 必修·几何与代数·复数 | 平面向量及其运算、从函数观点看一元二次方程和不等式（软） |
| `lx_solid_figures` | 基本立体图形<br>Basic solids: structure, views, surface area and volume | 立体几何 | 必修·几何与代数·立体几何初步 | Surface area and volume of solids（上游）、3-D shapes (age 11+)（上游） |
| `lx_spatial_relations` | 空间直线、平面的平行与垂直<br>Parallel and perpendicular lines and planes in space | 立体几何 | 必修·几何与代数·立体几何初步 | 基本立体图形、Angles with parallel lines（上游） |
| `lx_space_vectors` | 空间向量与立体几何<br>Space vectors and coordinates in solid geometry | 立体几何 | 选择性必修·几何与代数·空间向量与立体几何 | 平面向量及其运算、向量的数量积、空间直线、平面的平行与垂直 |
| `lx_line_equations` | 直线的方程<br>Equations of lines in the plane | 解析几何 | 选择性必修·几何与代数·平面解析几何 | Linear Function Graphs（上游）、Simultaneous Equations（上游） |
| `lx_circle_equations` | 圆的方程<br>Equations of circles | 解析几何 | 选择性必修·几何与代数·平面解析几何 | 直线的方程、Circles: Circumference & Area（上游） |
| `lx_conic_sections` | 圆锥曲线<br>Ellipses, hyperbolas and parabolas | 解析几何 | 选择性必修·几何与代数·平面解析几何 | 圆的方程、Quadratic Graphs（上游） |
| `lx_arithmetic_sequences` | 等差数列<br>Arithmetic sequences | 数列 | 选择性必修·函数·数列 | Nth-Term Rules（上游） |
| `lx_geometric_sequences` | 等比数列<br>Geometric sequences | 数列 | 选择性必修·函数·数列 | 等差数列、指数幂的运算 |
| `lx_mathematical_induction` | 数学归纳法<br>Mathematical induction | 数列 | 选择性必修·函数·数列 | 等差数列 |
| `lx_derivative_concept` | 导数的概念及其意义<br>Rate of change and the derivative | 导数 | 选择性必修·函数·一元函数的导数及其应用 | 函数的单调性、最值与奇偶性、直线的方程 |
| `lx_derivative_rules` | 导数的运算<br>Derivatives of basic functions and rules | 导数 | 选择性必修·函数·一元函数的导数及其应用 | 导数的概念及其意义、指数函数、对数函数、正弦、余弦、正切函数的图像与性质 |
| `lx_derivative_applications` | 导数在研究函数中的应用<br>Using derivatives to study functions | 导数 | 选择性必修·函数·一元函数的导数及其应用 | 导数的运算 |
| `lx_counting_principles` | 计数原理与排列组合<br>Counting principles, permutations and combinations | 计数与概率 | 选择性必修·概率与统计·计数原理 | Venn Diagrams and Counting Outcomes（上游） |
| `lx_binomial_theorem` | 二项式定理<br>Binomial theorem | 计数与概率 | 选择性必修·概率与统计·计数原理 | 计数原理与排列组合、Expanding Double Brackets（上游） |
| `lx_conditional_probability` | 条件概率与事件的独立性<br>Conditional probability and independence | 计数与概率 | 必修/选择性必修·概率与统计·概率 | Tree diagrams（上游）、Probability models（上游） |
| `lx_random_variables` | 离散型随机变量及其分布<br>Discrete random variables and their distributions | 计数与概率 | 选择性必修·概率与统计·随机变量及其分布 | 条件概率与事件的独立性、计数原理与排列组合 |
| `lx_normal_distribution` | 正态分布<br>Normal distribution | 计数与概率 | 选择性必修·概率与统计·随机变量及其分布 | 离散型随机变量及其分布、Describing distributions（上游） |
| `lx_linear_regression` | 一元线性回归模型<br>Correlation coefficient and linear regression | 数据与统计 | 选择性必修·概率与统计·成对数据的统计分析 | Scatter Graphs & Correlation（上游） |
| `lx_contingency_tables` | 列联表与独立性检验<br>Contingency tables and independence tests | 数据与统计 | 选择性必修·概率与统计·成对数据的统计分析 | 条件概率与事件的独立性 |
| `lx_surfaces_two_variables` | 二元函数的图像、等高线与截面<br>Graphs of functions of two variables | 高中以上 | 多元函数微积分·多元函数的基本概念 | 空间向量与立体几何、函数的概念及其表示 |
| `lx_quadric_surfaces` | 二次曲面<br>Quadric surfaces | 高中以上 | 空间解析几何·二次曲面 | 二元函数的图像、等高线与截面、圆锥曲线 |
