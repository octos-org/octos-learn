# macOS 产品应用 v4：启动器课程集（两层导航）

> 日期：2026-09-28。目标：接手文档 §5 第 2 项。以 main 网页版（PR #29 之后）的启动器为基准，1440×900。

## 1. 结果

- **首页**与 web `CourseLauncher`（无 `?collection`）一致：
  - hero 文案"从一组课程，开始新的探索。"，带 ＋/→ 图标的"新建空白白板"按钮；
  - "CURATED COLLECTIONS / 课程集"标题配 BookOpen 图标；
  - 三张课程集卡片：封面、学段、标题、简介、"3 节课 · 约 N 分钟"、"查看课程 →"。
- **课程集页**（web `?collection=<id>`）：
  - 顶部依次是"← 全部课程集"返回、学段 + 标题、简介和"N 节课 · 约 N 分钟 · 按顺序循序学习"。
  - 课程卡按 web 新设计重做：16:9 封面（课程包缩略图，文字也画出来）、学段徽标 + 版本、"第 0N 课"、标题、简介、时长与"内置课程 · 可离线"、灰色"预览"和青色"开始互动 →"。有进度时这个按钮显示"继续学习 →"。
- 课程集数据与 `src/learning/course-collections.ts` 一致：按 packId 归组，组内顺序按编辑顺序，未归组的课进"其他课程"，空组去掉。
- 位置对照：与 web 在同一视口坐标下比较，各区块顶部误差在 1–3px 以内。例如 hero 标题中线 206/205，课程集卡片顶部 508/505，课程卡顶部 371/369。简介换行位置也与 web 相同。
- **"最近白板"不再列课程进度**。web 只列空白白板（`!session.source`），课程进度改在课程卡上显示为"继续学习"。原生没有空白白板，所以这一区块现在不显示。

## 2. 实现（octos-learn `0dee7c6`，本地提交）

- `native/octos-learn/src/lib.rs`：
  - 课程集数据 `COURSE_COLLECTIONS` 与 `group_course_packs` / `collection_summary` / `course_tags`，逻辑与 web 相同。
  - `collection_card` / `course_card` / `card_grid`：每行 3 张，行间距 22/24。
  - `equalize_card_rows`：首帧绘制后量出每张卡的高度，用卡内 spacer 把整行撑到最高那张，对应 web grid 的 stretch。
  - `handle_launcher_taps`：卡片和图标按钮都是普通 View，点击按区域判断。必须放在 `ui.handle_event` 之前，否则 ScrollYView 会先抢走指针。
- `native/octos-learn/src/svg_image.rs`：新增 SvgImage 控件。按 viewBox 做 contain 缩放；`<text>` 由 makepad_svg 的 `collect_text_cmds` 取出后用 DrawText 画（DrawSvg 本身跳过文字）；字重从源标签里解析。
- 圆角封面：Makepad 不能按圆角矩形裁剪。改为给 SVG 里铺满画面的背景 rect 加 rx，底部再补一条直角 rect（`round_cover_top`）。
- 资产：新增 5 个 lucide 图标（arrow-left/right、book-open、clock-3、eye，从 lucide-react 0.577 提取，格式与原有图标一致），以及 `public/images/course-collections/*.svg` 的副本。
- 单测：octos-learn 由 3 个增加到 6 个（课程集分组、标签文案、封面圆角）。

## 3. 文字度量规则（后续做像素对齐时通用）

- `font_size` 单位是 pt，等于 web px × 0.75。
- 单行文本框高度为 ascent + descent，约 1.18em；`line_spacing` 只影响换行后的行距。所以 web 的 `line-height: r` 对应 `line_spacing = r / 1.18`，再在上下各加 `(r − 1.18) × px / 2` 的半行距。
- **Label 的 padding 和 margin 会被计入两次**：label.rs 先把它们并进 walk，再把同一个 walk 传给内部的 draw_text。所以文字间距一律放在外层 View 上，Label 本身设 `padding: 0`。见 `web_text()`。
- Svg 图标要设 `draw_svg.preserve_viewbox: true`，否则会按路径包围盒缩放，比 web 大约 25%。
- `theme.font_code`（Liberation Mono）没有中文字形，中文会显示成方块；中文眉题要用常规字体。

## 4. 已知差异 / 未做

1. 课程卡的"⋯"菜单（重新开始 / 删除学习记录）还没做。web 只在存在学习记录时显示。原生可以删除 `progress_store` 里 `<pack>@<ver>.json` 的检查点来实现。
2. 悬停效果和阴影没做：web 的课程集卡片悬停时上浮 3px 并加阴影，新建按钮和卡片也有投影。
3. 中文没有粗体。font_bold（IBM Plex SemiBold）只含拉丁字形，中文回落到常规字重，比如"新建空白白板"。
4. 眉题的字间距（letter-spacing 0.13em）和 hero 标题的负字距没有做，Makepad Label 不支持。
5. "新建空白白板"仍然只弹出 toast 提示。空白白板、账户和登录属于既有的禁用项。

## 5. 证据

`~/Documents/projects/OctosLearn/.local-dev/macos-product-v4/`（不进 git）：
- `web-reference/`：web 的首页和三个课程集页截图，`boxes.txt`（每个元素的位置、字号、行高、颜色），截图脚本 `shoot-launcher.mjs`（与 V3 §3 相同，在 vite preview 上运行）。
- `native/`：原生首页、课程集页（滚动前后）、surface 课程集的"继续学习"，以及点击后打开的课程。
- `launch.py`（启动隐藏实例并执行点击/滚动/截图步骤）、`tree.py`（导出控件树矩形）。
