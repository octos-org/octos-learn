# macOS 产品应用 v1：Octos Learn（Makepad 原生）交付记录

> 日期：2026-09-21。接手自 GPT 的 v6 技术验证线，本轮交付**首条与 main 网页版对应的 macOS 产品流程**：启动器首页 → 课程播放 → 手写 → 进度恢复。
> 本版本是分阶段交付的第一步，**不是"界面功能与网页版完全一致"的终态**；差异清单见 §4。

## 1. 代码与版本

| 仓库 | 分支 | 关键提交 |
|---|---|---|
| octos-learn（应用） | `codex/macos-product-ui`（自 main `b670417`） | `4396fa5` 合并 v6 验证代码 → `7158e73` 产品 crate 骨架 → `803fc97` 启动器 → `171e7cc` 浅色+logo → `3646d25` 打包脚本 → `3cfae0a` 学习页视觉打磨 → `5d1e45b` 变量面板安全区 |
| octos-lesson-language（OLL） | `codex/rust-runtime-product`（自 main `2b93d67`） | `c42006d` 合并 oll-runtime → `3912d01` teacher.expression + 内置课覆盖 → `9f77a66` 变量声明暴露 |
| 固定依赖 | 只读 | Makepad `825dbb42` / Octoscript `68f6a9df` / Octoscript-Makepad `b0628d05`（未改动） |

工作区（临时，可被清理）：`/private/tmp/oll-product-20260921/`（5 个并排检出，其中三个依赖是指向 phase0 固定检出的符号链接）。提交已全部落在上述持久分支，未 push。

## 2. 本版本能力

- **启动器首页**（对照 main course-launcher）：浅色主题（以 main 实际 CSS 为准：#f7f4ec/#166a79）、真实 octopus logo（SVG 原生渲染）、Hero 区、最近白板（checkpoint 扫描 + 继续学习）、预制课程卡（原生 SVG 封面、年级学科角标、版本 meta、时长、预览/开始互动）、整页滚动。
- **课程播放页**（对照 main learning-workspace）：全屏白板 + 悬浮控件——顶栏（标题、播放/暂停、旁白开关、动作计数；下一 Beat/重播 Topic/语音/摄像头为禁用占位并注明）、左上圆形首页/设置按钮、手写工具栏（浏览/书写/调色 5 色/粗细 4 档/撤销/重做 + 笔迹计数；擦除/框选禁用注明）、小章鱼头像 + 旁白气泡、变量控制面板（滑块/步进/复位/老师演示锁定）、错误条。
- **课程包**：两门内置课（rectangle-area-from-tiles 0.1.5、slope-and-intercept 0.1.6）随 .app 打包，SHA-256 对照 `android/embedded-course-packs.json` 校验后解压进 Resources；运行时从 Resources 读取，无需网络。
- **渲染扩展**（oll-preview render()）：polygons 填充（tone 色板取自 web styles.css）、visible:false 点、点标签模板 {x}/{y}/{coords}、equal_scale 近似、caption、secant 测量（Δx/Δy/斜率，与 web board-view 文案一致）。
- **进度**：进入恢复、播放中每秒自动保存、返回首页前保存；会话卡在首页显示「进行中 · 动作 N/M / 已完成」。
- **取景**：教学内容避让顶栏与变量面板（安全区取景）。

## 3. 验证

- oll-runtime 25 项测试、oll-preview 15 项、octos-learn 3 项，全部通过；构建 0 error。
- 两门内置课完整播放到底（159/159 操作、19/19 动作）无错误。
- `--remote` 隐藏实例实测：首页渲染与滚动、开始互动自动播放、继续学习恢复（如 14/19）、预览暂停进入、滑块联动、书写/撤销/重做、进度恢复。
- 证据与 .app：`macos-product-v1/`（截图、artifact.json、binary.sha256、remote-verification.txt）。

## 4. 与网页版的差异（本版本既定边界）

1. **未迁移（禁用占位并在 UI 注明）**：登录/设置页、语音、摄像头、学生输入坞、本课目录面板、空白白板、网络课程目录、旁白音频（开关仅控气泡显隐）、下一 Beat/重播 Topic（runtime 无此操作）、橡皮擦/框选/笔迹持久化（Ink 无 erase/select/持久化）、选区增强与问题卡片、动手任务面板。
2. **简化**：小章鱼为静态圆形（皮肤动画后置）；气泡纯文本（web 用 markdown）；变量面板固定槽位（web 世界坐标锚定）；会话为一课程一档（web 多实例 + 重命名/删除）；服务器会话同步无。
3. **视觉近似**：浮层无真毛玻璃（近似色）；缩略图 SVG 的 `<text>` 不渲染（makepad 限制）；equal_scale 为坐标轴加宽近似；非凸多边形填充为垂直包络（课程内全为矩形，精确）。
4. **已知小瑕疵**：完成态下部分卡片需手动拖动看全；关系取景时右侧卡片可能贴边。

## 5. 下一步建议（按优先级）

1. runtime 补 `next_beat`/`restart_topic` 与课程大纲（Topic→Step→Beat）结构暴露 → 启用对应 UI。
2. Ink 持久化（对齐 web `oll.student-ink.svg` 格式）+ 橡皮擦/框选。
3. 旁白音频：使用 manifest narration.segments 的 mp3 与 durationMs 做真实音频同步（替代估算时长）。
4. 本课目录面板、练习等待态 UI（Session::waiting 已有）。
5. 登录/设置/语音外围（分阶段，见方案 §7 阶段 3-4）。
6. 视觉：卡片贴边/底部裁切微调；web 并排截图对照。

## 6. 复现

```sh
# 工作区准备（若 /private/tmp 被清理）：5 个并排检出，依赖版本见 §1；
# .ocpack 来源：learn.pitun.cc（rectangle 0.1.5）与 android 资产（slope 0.1.6）
cd native/octos-learn && bash scripts/package-macos.sh   # 产出 dist/Octos Learn.app
```
