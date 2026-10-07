# macOS 产品应用 v7：功能补齐与界面细节对齐（可交付测试）

> 日期：2026-10-05 至 2026-10-06。目标（用户 2026-10-05）：完整实现原生版本，功能 / UI / UX 对齐 Web，每完成一块提交并推送，可测试时通知用户。
>
> 基准：Web 为 octos-learn main `5e7b331`（运行时为 octos-lesson-language `67d1476`）。
> 原生分支：octos-learn `codex/macos-product-ui`，OLL `codex/rust-runtime-product`。全部提交已推送，没有合并，也没有开 PR。
> 逐项进度与接手信息见仓库根目录 `NATIVE_MACOS_PROGRESS.md`。

## 1. 本轮新增功能

| 功能 | 原生实现 | 提交 |
|---|---|---|
| 课后练习任务 | runtime `tasks.rs`（评分、提示、重试、吸附、动画）；白板练习面板；滑块提交与角度拖拽提交 | OLL `ab2a0ca`；learn `6232584` |
| plot 卡片 | runtime `plot.rs` 移植 Web drawPlot / plot-explorer；`PlotView`：工具条、说明、图例；多曲线图例复选框；悬停探针与读数行 | OLL `8b3e132`、`30c1eff`；learn `36191b1`、`b4dbe36` |
| geometry 卡片 | runtime `geometry.rs`；`GeometryView`：角度点拖拽；分组框 | OLL `556f3ae`；learn `77b7069` |
| 旁白音频 | 播放课程包内的 mp3（AVPlayer），按录音时长计时；语音开关 | OLL `527fc6d`；learn `a668466` |
| 课程目录 | 目录面板：步骤 / Beat 的查看与播放；重新开始 | OLL `bb158ad`；learn `da9d7a5`、`bba039a` |
| 大图 | plot / geometry 大图对话框，与卡片共享缩放和平移状态 | learn `120b26e`、`bcc7dc8` |
| 卡片状态 | 聚焦描边、强调、写入高亮 | learn `12bdd9b` |
| 手写 | 橡皮、框选、全选、删除、撤销 / 重做，随进度保存与恢复 | OLL `bf79296`；learn `d1f7315` |
| 启动器 | 课程卡「⋯」菜单（重新开始 / 删除学习记录） | learn `e9562a6` |
| 学习记录 | ☰ 学习记录抽屉：本机课程记录按时间倒序，可搜索、可切换课程；从课程集进入时返回按钮为 ← | learn `affaea6` |
| 预览模式 | 预览不保存也不恢复进度；「开始互动学习」开新实例（同 Web） | learn `affaea6` |
| 思考题 | 「查看答案」的展开状态按设备记忆 | learn `a848b47` |

## 2. 界面细节对齐（2026-10-06 视觉巡检）

| 问题 | 根因 / 处理 | 提交 |
|---|---|---|
| 所有卡片和按钮的圆角是 Web 的两倍 | Makepad `sdf.box` 实际画 2×r，DSL 中所有 `border_radius` 减半 | `c88bcf5` |
| 边框偏粗偏深 | sdf stroke 实际画 2×宽度，所有 `border_size` 减半 | `153c5bc` |
| 公式 `g'(x)` 显示成 `g‖(x)` | latex_math 把 `'` 解析为 ‖，`parser_safe` 改写为 `\text{′}` | `8b50731` |
| `( cos θ, sin θ)` 多余空格；θ 为正体 | 函数名按 TeX 规则加空；小写希腊字母改用数学斜体码位 | `e1729f7`、`7de3749` |
| 公式靠左、混排基线错位、`\text{ }` 空格丢失 | 公式在卡片内居中；文字和公式按基线对齐；边缘空格转为外边距 | `de8067d` |
| 顶栏标题被裁切；多处文字偏大 | 把照抄的 px 数值统一改为 pt（px×0.75）：顶栏、气泡、输入栏、手写工具栏、模式按钮 | `b4dbe36`、`5f92f8a`、`52c5173`、`dfccc70` |
| 连线箭头 | 颜色 #6e8d86，8px 圆角，16px 箭头（同 Web marker） | `e39954a` |
| 老师指针 | 红色脉冲圆点；只在最新操作是 teacher.point 时显示 | `d96937e`、`8c5a19b` |
| 老师状态文字 | 跟随 Web lessonOwnsNarration（「课程播放中」/「继续播放」/「课程完成」） | `acdfc1e` |
| 课程完成态 | ▷ / › 透明度 28%；气泡文字 17px | `5f92f8a` |
| 滑块 | 拇指不超出输入框；−/+ 字形 | `c86b7c0` |
| 老师头像 | 圆角方形（同 Web） | `c88bcf5` |
| 大图对话框层级 | 遮住老师头像和输入栏；plot 底板 #f8f5ed | `bcc7dc8` |

## 3. 验证（2026-10-06）

- **测试**：oll-runtime 45、oll-preview 17、octos-learn 4，全部通过。
- **逐 Beat 对照**：九门课，原生与 Web 视口高度相同（852）。
  - 布局与 Web 的差在 1e-6 以内。
  - 卡片屏幕位置多数 ≤15px；课程结束画面 ≤17px。例外是 slope-and-intercept 结束画面 35px，原因是 KaTeX 与 NewCM 的字形宽度不同。
  - 脚本与截图在 `~/Documents/projects/OctosLearn/.local-dev/macos-product-v7/beats/`。
- **交互脚本**（`macos-product-v7/tasks/`）全部通过：
  - 练习滑块：两次未答中后进入 needs_hint，再拖到目标值附近吸附成功（提示按钮的点击未在脚本里覆盖）；
  - 角度拖拽吸附到 π/2；
  - 旁白音频播放到课程结束；
  - 目录「播放此步」；
  - 大图、图例复选框与探针；
  - 手写：画、擦、全选删除、撤销；
  - 思考题展开状态在重新打开后保留；
  - 学习记录：搜索与切换课程；
  - 预览 → 返回后仍显示「开始互动」，互动 → 返回后显示「继续学习」。
- **可测试的 app**：`octos-learn/native/octos-learn/dist/Octos Learn.app`（工作区 `.local-dev/oll-product`），对应 octos-learn `bcc7dc8` 之后的 HEAD。重新打包：`OCTOS_PACK_ARCHIVES=<workspace>/course-packs bash scripts/package-macos.sh`。

## 4. 剩余差异与待定事项

1. ~~中文字体~~：用户 2026-10-06 选方案 A。app 现在打包 Noto Sans SC Regular/Bold（OFL），作为 CJK 回退字体排在 LXGW 之前（`src/cjk_fonts.rs`，打包见 `scripts/package-macos.sh`）。
2. 依赖后端的功能仍是占位（点击弹 toast）：语音、摄像头、提问输入、设置、登录、新建空白白板。学习记录只列本机记录，不同步服务器。
3. 小差异：
   - 中文换行不避头尾；
   - Label 的省略号不显示（只截断）；
   - 大图对话框的「探索」工具条位置（Web 在底板外）；
   - 卡片阴影与毛玻璃效果；
   - 公式字形宽度。
4. scene3d 练习提交：现有课程包都没有用到。
