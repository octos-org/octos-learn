# macOS 原生版（Makepad）进度文档

> 任何 Agent 接手前先读本文件，再读 `docs/makepad-migration/AGENT_HANDOFF.md`（详细交接规矩与历史版本 V1–V6）。
> 每完成一块工作：更新本文件的「已完成」「待做」两节，随代码一起提交并推送。

最后更新：2026-10-06（v7 交付文档，可交付测试）

## 0. 目标

用 Makepad 实现原生 macOS 版 Octos Learn，**功能 / UI / UX 与 octos-learn Web 版（main 分支）一致**。
完成到可交付测试的程度后再通知用户（用户授权：每完成一块就提交并推送，不必每步停下询问）。

## 1. 工作规矩（用户要求，必须遵守）

- 只在 `codex/` 分支开发。可以本地提交；**push 已获授权（每完成一块就推送），但不合并、不开 PR**（开 PR 前先问用户）。
- 不擅自升级固定依赖版本（makepad 固定在 `825dbb4`，所以不改 makepad 源码，需要绕过的问题在本仓库里处理）。
- 不切换用户持久仓库的工作分支，也不清理它们的工作区（其他会话在用）：
  - `~/Documents/projects/OctosLearn/octos-learn` 在 `codex/android-native-ink-stroke-handoff`
  - OLL 持久仓库在 `codex/native-ink-exclusion-smoothing`
- 未授权：安装 WASM target、往 Android 设备安装。
- 课程包锁定：`native/octos-learn/course-packs.lock.json` 始终与 main 的 `android/embedded-course-packs.json` 保持一致。
- 每次工作结束，按 AGENT_HANDOFF.md 里的「交接维护规矩」更新交接文档（以及本文件）。
- 拿不准的事先问用户。

## 2. 仓库与分支

工作区：`~/Documents/projects/OctosLearn/.local-dev/oll-product/`（独立 checkout，可放心操作）

| 目录 | 分支 | 说明 |
|---|---|---|
| `octos-learn` | `codex/macos-product-ui` | 原生 app：`native/octos-learn`（产品 app）、`native/oll-preview`（board/卡片/plot 等组件库） |
| `oll` | `codex/rust-runtime-product` | Rust 运行时 `crates/oll-runtime`（布局、镜头、会话、plot/geometry 场景、练习、墨迹） |
| `makepad` | `825dbb4`（固定） | 不要修改 |
| `octoscript`, `octoscript-makepad` | — | 依赖 |
| `course-packs/` | — | 本地课程包 `.ocpack` |

remote：`github`（GitHub）和 `origin`（本机持久仓库），推送时两个都推：
`git push github HEAD && git push origin HEAD`

## 3. 构建 / 运行 / 测试

```sh
# 构建产品 app
cd octos-learn/native/octos-learn && cargo build --release
cp target/release/octos-learn "dist/Octos Learn.app/Contents/MacOS/octos-learn"
codesign -s - --force "dist/Octos Learn.app"
# 或完整打包：OCTOS_PACK_ARCHIVES=<workspace>/course-packs bash scripts/package-macos.sh

# 测试
cd oll/crates/oll-runtime && cargo test          # 45 个
cd octos-learn/native/oll-preview && cargo test   # 17 个
cd octos-learn/native/octos-learn && cargo test   # 4 个
```

常用环境变量：`OCTOS_LEARN_OPEN=<packId>`（直接以预览模式打开课程）、`OLL_PREVIEW_DATA_DIR=<dir>`（进度目录）、
`MAKEPAD_HIDE_WINDOWS=1` + `--remote`（无窗口远程控制，HTTP 接口 `/click /m /k /snap /g /quit`）、
`OLL_FOCUS_DEBUG=1`（镜头决策日志）、`OCTOS_AUDIO_DEBUG=1`（音频日志）。

## 4. 对照 Web 的验证工具

- Web 参考：scratchpad 里有 main 的 worktree `web-main`（`pnpm install --frozen-lockfile`），
  `VITE_SKIP_AUTH=true npx vite build --outDir <dist>` 后 `npx vite preview --outDir <dist> --port 5190`。
  **注意**：Web 实际使用的运行时是 `node_modules` 里固定的 octos-lesson-language（`67d1476`），
  plot 交互在 `packages/web-runtime/src/plot-explorer.ts`，不只看 `board-view.ts`。
- 证据与脚本：`~/Documents/projects/OctosLearn/.local-dev/macos-product-v7/`
  - `beats/`：`web-beats.mjs`（`WEB_H` 环境变量设视口高）、`native-beats.py`、`compare.py`、`summary.py`
    - 用法：`python3 native-beats.py "<app>" . <packs...>`，`python3 compare.py . <packs...> > compare.txt; python3 summary.py compare.txt`
    - 原生窗口会被屏幕可见区域裁剪（本机常为 845–852 高），对比前让 Web 用相同高度截图（`WEB_H=852`）。
  - `tasks/`：单项交互脚本（task/angle/audio/outline/enlarge/ink/launcher/hist/legend/refl）。
- 远程截图坐标为窗口点坐标，包含 32px 标题栏；`/g?scale=1` 为 2x 像素。

## 5. 已完成（全部已提交并推送）

V6 之前的内容见 `docs/makepad-migration/OLL_MACOS_PRODUCT_V6.md`。V6 之后：

**OLL `codex/rust-runtime-product`**
- `9a86f8e` 跟进 main 2026-10 的教学布局、镜头、聚焦
- `ab2a0ca` 课后练习任务（practice tasks）
- `8b3e132` plot 场景（Web drawPlot 移植）；`556f3ae` geometry 场景
- `527fc6d` 按录音时长计时的旁白、语音开关
- `bb158ad` 课程目录、seek、重新开始
- `bf79296` 墨迹编辑历史、橡皮、选择、保存/恢复
- `30c1eff` plot 探针读数（probe）与图例曲线索引

**octos-learn `codex/macos-product-ui`**
- `490de05` 跟进 Web 2026-10 布局/镜头/反思卡/预览模式
- `6232584` 练习任务面板、课程完成态
- `36191b1` Web 风格 plot 卡片（PlotView）；`77b7069` geometry 卡片、角度拖拽、分组框
- `a668466` 课程旁白音频播放
- `da9d7a5` 课程目录面板、重新开始
- `120b26e` 大图对话框（plot / geometry）
- `12bdd9b` 卡片聚焦 / 强调 / 写入高亮
- `d1f7315` 手写：橡皮、选择、删除、撤销、持久化
- `e9562a6` 课程卡「⋯」菜单（重新开始 / 删除学习记录）
- `d96937e` 老师指针改为 Web 的红色脉冲圆点
- `a848b47` 反思卡「查看答案」展开状态按设备记忆（`open-reflections.json`）
- `8b50731` TeX 撇号 `'` 渲染为 ′（makepad latex_math 会画成 ‖，在 `parser_safe` 中改写）
- `affaea6` 学习记录抽屉（☰）、从课程集进入时返回按钮为 ←、预览模式不保存/不恢复进度、开始互动学习=新实例
- `b4dbe36` 多曲线 plot 图例复选框（隐藏/显示曲线）、悬停探针十字线与读数行、顶栏标题字号修正
- `de8067d` 公式在卡片内居中；文字/公式混排基线对齐；`\text{ }` 边缘空格保留
- `e39954a` 连线：#6e8d86、圆角、16px 箭头（同 Web marker）
- `e1729f7` `\sin` `\cos` 等函数名按 TeX 规则加间距：括号/关系符旁不加空，普通原子旁加 `\,`（latex_math 原本两侧总加细空）；函数名用 `\text{}` 绘制以保持正体
- `7de3749` 公式小写希腊字母（\theta、\pi…）改用数学斜体码位，与 KaTeX 一致
- `c86b7c0` 滑块面板：拇指在输入框内移动（左右各内缩 8px，同浏览器 range），−/+ 字形改为 Web 12px 文本字形粗细
- `c88bcf5` 所有 RoundedView/Button 的 `border_radius` 减半：Makepad `sdf.box` 实际画 2×r 圆角，之前从 CSS 照抄的数值都圆了一倍（卡片、按钮、大纲按钮、开始互动学习等）；老师头像改为 Web 的圆角方形（94px，约 40px 圆角），状态字 10px
- `153c5bc` 所有 DSL `border_size` 减半：sdf stroke 实际画 2×宽度的边框，1px CSS 边框之前画成了 2px（按钮、卡片边框偏深）
- `5f92f8a` 课程完成后 ▷/› 图标 28% 透明度（同 Web disabled）；老师气泡文字 17px / 行高 1.55（之前约 21px）
- `52c5173` 互动模式：输入框占位文字 14px；麦克风按钮显示 Web 的禁用态（语音不可用，opacity .38）；手写工具栏「全选」与状态文字 10px
- `dfccc70` 顶栏「启用语音 / 启用摄像头 / 开始互动学习」文字 9px（同 Web .learning-mode-button）
- `bba039a` 课程目录：步骤标题单行（Web nowrap/ellipsis，Beat 标题最多 2 行）、行距 46px（去掉 Button 默认外边距与折叠时的 Beat 列表外边距）、▶ 与展开箭头尺寸/颜色同 Web
- `8c5a19b` 老师指针只在最新操作是 teacher.point 时显示（同 Web renderPointer；下一 Beat 停在 beat.end，不显示）
- `bcc7dc8` 大图对话框移到老师头像/输入栏之上（Web 模态遮住全部），plot 区域加 Web 的 #f8f5ed 底板
- `acdfc1e` 老师状态文字跟随 Web lessonOwnsNarration（下一 Beat 后显示「课程播放中」，用户暂停后「继续播放」）

**九门课逐 Beat 对照（2026-10-06，同视口高）**：布局与 Web 差 1e-6 以内；屏幕位置大多 ≤15px，
结束画面 ≤17px（slope-and-intercept 35px，源于 KaTeX 与 NewCM 字形宽度差异，属已知限制）。

## 6. 待做（按优先级）

1. 继续逐课视觉巡检（native vs web 截图）。已知小差异：
   - **待用户决定**：中文字体。Web 在 macOS 上用 PingFang SC（无衬线），原生用 Makepad 内置的 LXGW WenKai（楷体风格，含粗体）。
     Makepad 825dbb4 无法加载系统 .ttc 字体；可选：(a) 随 app 打包开源无衬线中文字体（Noto Sans SC / 思源黑体，OFL，约 10–16MB）并设为 CJK 回退；(b) 保持现状。
   - 大图对话框里「探索」工具条 Web 在底板外上方，原生在底板内（PlotView 自带工具条）
   - 中文换行不避头尾（如「。」出现在行首），Makepad 文本换行限制
2. 练习任务中 scene3d 视角提交（目前没有课程包使用，优先级低）。
3. ~~再跑一次九门课全量对照~~（2026-10-06 完成，无回归）。
4. ~~写交付文档 V7、更新 AGENT_HANDOFF.md、通知用户测试~~（2026-10-06 完成，见 `docs/makepad-migration/OLL_MACOS_PRODUCT_V7.md`）。等待用户测试反馈与中文字体决定。

## 7. 明确不做 / 占位（依赖后端或未迁移）

语音输入、摄像头、底部提问输入框、设置页、登录、新建空白白板：保留与 Web 一致的按钮外观，点击弹 toast 说明「仅网页版可用」。
学习记录抽屉只列本机课程进度记录（Web 还会同步服务器记录）。

## 8. Makepad 踩坑备忘

- **`border_size` 实际画 2×宽度**（`stroke_keep` 取 |d| < width）：1px 边框写 0.5。
- **`border_radius` 实际效果是 2×r**（`sdf.box` 内部 `k = min(2r, …)`）：CSS 写 16px 圆角，DSL 要写 8。DrawVector 的 `rounded_rect` 是真实半径，不受影响。

- `#[derive(Script)]` 字段类型不能写 `::` 限定路径（如 `std::time::Instant`），要先 `use` 再写短名。
- 自定义 widget 没有 DSL `visible`，需要包一层 View。DSL 颜色 `#12606e` 会被当成指数，写 `#x12606e`。
- DrawVector 坐标是 draw-list 绝对坐标；在 widget 内画要先 `begin_turtle` 固定到 widget 矩形。对齐父容器（align）只移动文字不移动矢量，用 `set_walk(abs_pos)` 定位。
- `event.hits` 需要 Area：用 `cx.walk_turtle_with_area`。Makepad 会把 hit 发给所有 widget，模态层需要在 board 上 `set_input_blocked`。
- Makepad `Button` 默认有竖向外边距 `theme.mspace_v_1`，紧凑列表里要写 `margin:0`。Label 的 `text_overflow: Ellipsis` 在本版本不显示「…」，但 `max_lines` 有效。
- 在 Fit 高度的 Overlay 里 `height: Fill` 的 Button 高度为 0，点不到；列表行用 View + `tapped()` 命中测试。
- TextInput 刚显示时没有 area，`take_key_focus` 要延后到下一帧。
- Label 的 `font_size` 是 pt（= px × 0.75）。从 CSS 照抄 px 数值是常见错误，已全量核对 lib.rs 中的字号。latex_math 不渲染 CJK，`\text` 中文由 formula_view 拆成 Label。
- `RefCell`：不要在持有 `borrow::<T>()` 时调用 `borrow_mut`。
- Mac 睡眠会导致 API 中断（"Your computer went to sleep"），长任务可用 `caffeinate -dims`。
