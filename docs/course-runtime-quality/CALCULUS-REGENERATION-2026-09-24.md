# 三课重新生成与交付记录

三课均已更新为 0.2.0，并发布到当前 5173 服务使用的本地目录 `/tmp/octos-reviewed-course-publication`。目录仍有 10 门不同课程；没有删除其他课程或发布到生产环境。

## 教学目标

课程集《用截面理解多元函数：从等高线到鞍点》围绕一个方法组织：根据问题选择固定的量，推导截线，再判断它能支持什么结论。

1. **水平截线与等高线：以 z=x²+y² 为例**：固定输出 z=h，推导 r²=h，区分空间圆与投影圆；讨论零、负高度边界。预测后演示一次 1→4→0，课后由半径 √3 反求高度，初始值 1。
2. **偏导数：固定输入，求截线斜率**：固定 y，选择 y=1 后得到 g(x)=x²+1，在 P=(1,1,2) 推导斜率 2 与切线 z=2x。区分平移截面与求导；课后反求非负 y₀，初始值 0。
3. **马鞍面与鞍点：梯度为零不一定是极值点**：同时展示 y=0、x=0 的截面，比较 ±t²，用任意小邻域中的正负值否定局部极值；说明两个方向都上升不能证明局部极小。

教案：`../octos-course-library/authoring/reviews/CALCULUS_COLLECTION_TEACHING_PLAN_2026-09-24.md`，详细输入在各课 `generation-input.json`。

## 真实生成与人工校订边界

| 课程 | 原始候选 | 模型调用 | 整课生成 | 首段可播放 | 音频段数 |
|---|---|---:|---:|---:|---:|
| 等高线 | candidate-008 | 4 | 29.225s | 9.814s | 11 |
| 偏导数 | candidate-006 | 4 | 30.191s | 13.703s | 11 |
| 鞍点 | candidate-003 | 4 | 25.830s | 8.995s | 15 |

以上为单次观测，不是 P50/P95，也不包括 TTS。生成器为本地 learning-coach，模型为配置中的 gemini-3.6-flash。每个候选保存原始请求/返回、草稿、解析计划、authoring、生成报告及源码差异哈希。服务 503 中断与教学不合格候选均保留，未伪装为成功。

交付副本在各课 `reviewed-0.2.0/`，`editorial-review.json` 逐项记录原稿哈希与改动。分别有 5、3、4 处文字/标题校訂，例如纠正“截平面退化”、错误的左右指图、把导数性质归因于二次齐次、局部/全局混淆。没有手工补图、修改绑定、动画、变量或任务判定。音频根据校订后的文本重新生成。

旧版完整备份在各课 `previous-<旧版本>/`；正式源码在 `../octos-course-library/courses/<课程ID>/`。

## 这次发现并修复的通用问题

- 生成上下文删除完整 learner_request，导致全课约束遗漏：各阶段保留原始请求。无新增模型调用，但增加输入文本，不能承诺零时延影响。
- 后续小节未声明再次聚焦已有图形时，Schema 隐藏其绑定变量，导致课后任务无法生成：已创建且仍保留的图形变量可在后续小节引用。
- 图形清理把“高度驱动半径公式”误认为直接半径变量用途冲突：保留显式 radius_expression 的绑定输入。
- 多曲线比较因为出现“斜率”等词而自动添加割线：限制该启发式适用范围，不覆盖显式多曲线比较。
- 函数图支持明确轴标签；静态曲面支持 section_value=0，无需制造无教学意义的滑块。
- 播放器探索视窗覆盖坐标轴标签：合并范围时保留标签；自定义坐标轴不再附加错误的 y=… 图例，探针使用实际轴名。
- 三课使用数学 SVG 专用封面；更新可复用打包元数据。未知封面类型报错，不再静默回落到面积方格图。

OLL 修复已同步至应用、课程库、生成器的同一依赖补丁与锁文件；未发布上游提交。

## 验证与限制

- 生成器 164 项、OLL core/player/web-runtime 236 项、课程库 20 项通过；应用 TypeScript 检查通过。
- 浏览器 9 项通过：三课列表、封面解码、整课推进、公式上下边界、第一课间距/半径联动/零半径/练习初值/成功反馈、第二课 z 轴、第三课 t/z 轴与两个静态截面，以及字体重测和重排锚定。
- 三课通过共享实时物化与打包 Canonical 的完全一致性检查，音频文本哈希与段落一一对应。证据：`calculus-regeneration-parity.json`；复验脚本：`scripts/verify-calculus-regeneration.ts`。
- 本次修复不保证模型每次正确。第一课 candidate-009 把 radius_expression 写进 steps，最终圆未联动，已排除；candidate-008 则生成了正确绑定。不能把本次筛选通过宣称为联动生成成功率 100%。教学表述仍需审校。
- 连续动画取值域仍报告 not_proven；滑块网格通过不等于连续域证明。
- 此次新课没有独立重演阶段，验证的是连续演示和练习初始化；独立重演仍由原有协议/运行时回归覆盖。
- 先前讨论的“取景同时覆盖讲解公式”并未在本轮另行实现。全课结束时白板内容可能超出屏幕，需要平移或缩放；公式节点内部上下裁切与屏幕取景是不同问题。

## 用户测试

刷新 `https://127.0.0.1:5173/`，从首页选择上述新标题，确认卡片显示 **0.2.0**。旧课堂仍指向旧包；应从新版卡片重新进入，不在旧课堂点继续。

第一课观察 h=1→4→0 时 r=1→2→0，结束后练习回到 h=1，答案 h=3。第二课观察一次 y₀=0→1、截线与实际切线、纵轴 z，练习回到 0。第三课比较两个正交截面和 ±t²，确认没有无意义调参任务。

```sh
node node_modules/vite-node/vite-node.mjs scripts/verify-calculus-regeneration.ts ../octos-course-library/courses
OCTOS_LOCAL_COURSE_PACK_ROOT=/tmp/octos-reviewed-course-publication PLAYWRIGHT_TEST_MATCH='*{course-runtime-quality,college-calculus-surface-collection,runtime-quality}.spec.ts' OCTOS_COURSE_TEST_PORT=5186 node node_modules/@playwright/test/cli.js test --config playwright.course-packs.config.ts
```

5186 仅为自动测试临时端口；用户当前服务仍是 5173。
