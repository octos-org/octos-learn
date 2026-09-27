# 课程共享链路修复：实施与评审记录

更新：2026-09-24。代码、本课 0.1.1 和本地回归已经完成；尚未提交、推送或发布生产版本。真实模型 A/B、全量教学质量抽检和生产指标不属于已通过项。

## 对六个问题的处理

| 问题 | 通用修复 | 本课修订及验证 |
|---|---|---|
| 两幅图距离异常 | 宿主只预留可见附件；测量随附件签名更新且允许缩小；被动重排保持视口锚点 | 原空白 448 个白板单位；显式 right_of 关联，两图水平间隔小于 200，隐藏练习不再占位 |
| 投影圆不随高度变化 | 支持绑定值直接派生 label、显式零半径退化；有预算的滑块网格检查；生成器支持 radius_expression | radius=sqrt(number_01)，r 标签同源；h=0/1/4/8 验证。二维和三维均覆盖上界 |
| 后一段的起点不符旁白 | 连续演示承接状态；显式 replay 才插入起始转换；运行时从实际状态执行 | 第三节声明重演，恢复 h=1 后教师演示至 4 |
| 练习开放前已经达标 | 显式 practice 起始策略，首次开放前转换；输入、判题和旁白有屏障 | 练习开放前恢复 h=1，学生真实输入至 4 后成功 |
| 数学公式裁切 | 最终列宽下重新测量，字体完成加载触发重排，循环有上限 | 本课公式截图可见；窄列换行分式及延迟字体回归通过。未声称穷尽所有数学字形裁切 |
| 旁白邀请学生而教师操作 | 生成规范加入角色正反例；启发式只警告，不用文本猜测自动改写 | 两段口吻修订并重合成音频，其他六段按文本哈希复用 |

扩大曲面定义域到 [-3,3] 后，浏览器还暴露了三维固定取景裁切。共享渲染器现在根据基础网格的投影范围取景；截面高度不参与取景计算，避免拖动截面时相机呼吸；用户 zoom 仍然生效。小模型在原视野内保持原取景。允许用户主动放大后超出视野。当前画面见 `after.png`。

## 通用实现与兼容边界

1. 共享物化仍是 materializeOllLesson：结构解析、显式补全/展开、能力检查、预算诊断及终检。新增 WithReport 返回事件、能力、编译规则和诊断。输入不修改；同一输入输出一致；重演动作 ID 稳定，带 source_path。
2. 默认缺省语义不变。新生成器通过 construction_rules=explicit-v1 启用首次练习策略；旧的直接编译调用默认 legacy。显式阶段/标签字段自身是新语义的选择开关。
3. 执行能力版本 0.2.0 与 npm 的 0.1.0-rc.1 包名独立。最低版本由实际内容推导；未知动作、欠报能力和新功能缺声明被拒绝。实时增量在追加当前批次前检查，不等待完整课程。旧课不含新能力时仍为 0.1.0。
4. 动作和 seek 事务回滚；追加失败不推进接收游标；动画失败不先提交进度；输入失败不留下成功操作。错误带阶段、code、path、cursor；停止推进且持久化故障，刷新不跳过错误。当前恢复方式为明确重置/重新载入，不做同序号自动替换。
5. 播放 epoch、练习 retry epoch 与教学 phase 分离；恢复转换进度不重复初始化；过期旁白回调按 epoch 忽略；转换期不接收学生操作、不判题。合并课程时同时命名空间化 start/transition 的变量引用，避免跨课程污染。
6. 范围分析每绑定至多 512 个组合、总计至多 4096 次求值；记录实际检查数量。离散滑块网格与连续域分开报告，超预算/无步长/连续域均为 not_proven。已发现非法实际值报错；不将抽样包装成数学证明。
7. 显式关联为主，现有共享变量聚类继续兜底；重复共同 focus 产生建议信号，不强制重排。程序不从静态圆或旁白猜测 sqrt(h)。

协议实例、生命周期和依赖安装方式见 `PROTOCOL-AND-DELIVERY.md`。

## 仓库与交付

| 仓库 | 起点/交付 |
|---|---|
| octos-learn | 当前分支 feat/linear-function-collection，起点 88198b456823929274b695b61d5e3968cd0424b6；宿主、共享物化、诊断、测试、文档和 pnpm 补丁 |
| octos-lesson-language | 起点 2b93d67ffc30075edb3d3f34b848f799a46717f2；core/player/runtime 源码、schema、测试 |
| octos-course-library | 起点 8a80ba3c0c5fb710cd30198aff9f0f2fa971d894；清单门禁、物化报告和本课 0.1.1，包括两段新音频 |
| learning-coach | 生成协议、确定性编译、角色/联动提示、同基线 OLL 合约和可复现安装补丁 |

没有发布新上游 commit；三个消费者暂用同一 OLL 编译产物补丁。应用还带课程库浏览器 validator 补丁。正式发布需先发布 OLL、课程库、生成器，再升级应用固定依赖并移除临时补丁。仅提交应用仓库不能代替其他三个仓库的源码交付。

本课作者文件在 `../octos-course-library/courses/surface-paraboloid-level-sets/`，版本 0.1.1，最低执行版本 0.2.0。课程包作者源和 Canonical 与实时共享物化的一致性已通过，证据 `2026-09-24-course-parity.json`。本地预览目录 `/tmp/octos-reviewed-course-publication`，原 0.1.0 只从此临时目录的列表撤下，未改生产目录。

## 验证结果

- OLL core/player/web-runtime：236 项通过，含失败事务、增量能力门禁、阶段恢复和既有渲染/布局测试。
- 生成器完整测试：161 项通过。
- 课程库：20 项通过；本课目录 validator 无问题。
- 应用相关测试：88 项通过（首次合跑 87，加上重编译一致性用例后 artifacts 17 项通过）；TypeScript 通过。
- 浏览器：17 项通过，包括九门课加载/播放冒烟、三组列表、本课布局/重演/练习/联动/三维裁切、分式换行、字体重测和重排锚定。
- 生产构建通过；修改文件 ESLint 0 错误、5 条既有 hooks 警告。
- 新包与实时物化 parity 通过。截图人工复核，公式完整、两图靠近、截线和投影一致。

这些回归不等于其余八课全部旁白/数学推导已逐项审校；也不等于已测试每一类笔迹与节点重排的附着关系。

## 时延与剩余不确定性

- 新增必经模型调用：0。没有为终检新增模型审查或整课重试。prompt 只用于程序无法推断的绑定关系、阶段意图和教学角色。
- prompt 精确字符/UTF-8 字节对比在 `prompt-size-comparison.json`：outline +158 字节，section/bootstrap +541 字节。没有拿字节数冒充 token 数。供应商真实 token 和模型 P50/P95 尚未测量，不能承诺零时延影响。
- 本地九课共享物化：初始基线 P50 约 0.15–0.50ms、P95 约 0.19–0.57ms；本次 P50 约 0.20–1.47ms、P95 约 0.22–2.51ms。本课新版本 P50 0.76ms、P95 1.00ms。详见 before/after JSON；本课内容也改变了，所以不是仅算法的严格 A/B。首次 schema 编译、网络、TTS、模型均不在这些热运行数据内。
- 起始转换使用 brief 动画：常速约 1.8 秒（随播放速度调整）；同值/减少动态效果时直接完成。它是可见的教学播放等待，不能计为零开销，也不是生成时延。
- 记录了本地包首屏加载的浏览器附件，但没有将其当作实时模型首段可播放时间。真实实时首段/后续等待、交互帧 P50/P95 及重做率/逃逸率/自动修正正确率仍需有代表性的运行采样。
- 数学关系与教学意图仍由模型声明；确定性程序保证声明的执行一致性及有限范围检查，不证明任意公式的教学正确性。

## 可复现检查

```sh
# 应用目录
node node_modules/vitest/vitest.mjs run src/learning/oll/oll-lesson-runtime.test.tsx src/learning/oll/oll-artifacts.test.ts src/learning/oll/oll-construction-diagnostics.test.ts src/learning/course-pack/course-pack-catalog.test.ts src/learning/learn-trace.test.ts
node node_modules/typescript/bin/tsc -b --pretty false
OCTOS_LOCAL_COURSE_PACK_ROOT=/tmp/octos-reviewed-course-publication PLAYWRIGHT_TEST_MATCH='*{quality,collection}.spec.ts' OCTOS_COURSE_TEST_PORT=5186 node node_modules/@playwright/test/cli.js test --config playwright.course-packs.config.ts
node node_modules/vite-node/vite-node.mjs scripts/benchmark-oll-materialization.ts ../octos-course-library/courses/*/course.authoring.json
```

发布前剩余验收：真实模型对照及上述生产指标采样、完整教学抽检、上游固定依赖发布。此处保留为未完成项，不能用已通过的本地回归替代。
