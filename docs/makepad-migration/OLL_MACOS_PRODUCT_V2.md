# macOS 产品应用 v2：网页版像素级对齐记录

> 日期：2026-09-21。v1 用户反馈"界面与网页版完全不一样，要完全一致"。v2 以**真实网页截图**为基准做像素级对齐，基准图为 main 生产构建本地运行的截图（`macos-product-v2/web-reference/`，1440×900，与本应用窗口同尺寸）。

## 1. 基准获取方法（可复现）

1. main worktree（`/private/tmp/octos-main-audit`，b670417）`pnpm install` 后，用 `scripts/prepare-embedded-course-assets.mjs` 准备内置课程包（两 archive 已按 pin SHA-256 校验，slope 0.1.6 来自 android 资产缓存）。
2. `vite build` + `vite preview`（**不能用 dev server**：React StrictMode 双调用会 abort 首次内置目录请求，`getEmbeddedCoursePackCatalog` 的 promise 缓存把 null 永久化，课程卡不渲染——dev-only 现象，生产无此问题）。
3. Playwright 截图（脚本模式见应用仓库 `scratch/shoot-webref.mjs`，不计入交付）。线上 https://learn.pitun.cc 首页在无后端/无登录时同样只显示空目录，故以本地生产构建为准。

## 2. v2 对齐项（应用分支 codex/macos-product-ui）

| 项 | 提交 | 说明 |
|---|---|---|
| 点阵纸感背景 | `61fc582` | 24px 网格 1px 圆点，底色实测 #f8f5ed；SpatialBoard 开关默认关，v6 不受影响 |
| 胶囊顶栏三段式 | `b2b0c9f` | 标题/4 个 lucide 图标钮/语音摄像头 pill；左上圆形首页设置钮 |
| 横排手写工具栏 | `bb7c07c` | Hand/PenLine/Eraser/BoxSelect + 全选 + Undo2/Redo2 + 状态文字；按基准图移除 v1 自加的调色/粗细钮（笔固定 web 默认 #176b62/3.5px） |
| 学生输入坞 | `a04c7cf` | 720px 居中胶囊，图标/placeholder/发送钮，点击 toast 提示未迁移 |
| 小章鱼+气泡 | `461e826` | octos-avatar.tsx 内联 SVG 手工还原为 assets/octos-avatar.svg 原生渲染；状态字；目录钮；气泡样式 |
| 变量面板 | `2aeef4b` | label + 青色滑块 + 数值 + Minus/Plus/RotateCcw 图标钮 |
| 白板卡片 | `dd73069` | 白卡+kind 角标（GEOMETRY/PLOT/NOTE/MATH）+探索/大图 pill；NOTE 黄便签 #fef9c3；MATH 居中衬线公式；修复 slope 课 math 节点 latex 字符串不渲染的空白卡 bug |
| z-order 修复 | octoscript-makepad `7d8777e`（本地，未 push） | makepad-plot 图表层 draw_depth 收进 zbias 带，否则白板内容压过顶栏 UI |

lucide 图标：从 node_modules lucide-react 0.577 提取 23 个 SVG 到 `native/octos-learn/assets/icons/`，Button::draw_icon 渲染。

## 3. 依赖修复的持久化（重要）

zbias 修复提交在 /private/tmp 浅克隆上，会丢。已持久化两份：
- 持久仓库 `/Users/alan0x/Documents/projects/octoscript-makepad` 分支 `codex/plot-zbias-band`（提交 `a0ab363`，apply 于本地 b1596d9；plot 源码与 b0628d0 一致）；
- 补丁文件 `phase0-evidence/makepad-plot-zbias-band.patch`。
**构建 v2 应用依赖此修复**；phase0 临时目录重建时需把该补丁应用到 octoscript-makepad（b0628d0 之上）。归属待办：按方案 §7 推入 OctoSense-org/Octoscript-Makepad 上游——**已提 PR：https://github.com/OctoSense-org/Octoscript-Makepad/pull/35**（分支 `fix/plot-zbias-band` 基于上游 main b0628d0，已推至 fork alan0x/Octoscript-Makepad，等待评审合并；合并后升级固定版本组合并退役本地补丁）。

## 4. 剩余差异（已知、未隐藏）

1. **字体**：web 用 Hanken Grotesk/Inter 可变字体（仅拉丁，woff2）。makepad 只支持 ttf/otf（font_face.rs ttf_parser），系统无 woff2 转换工具且不加新依赖 → 跳过。中文两端同为 PingFang。
2. **布局引擎**：卡片世界坐标由原生 spatial::layout 计算，与 web 排布不完全一致（卡片位置/顺序有差异）；变量面板为固定槽位（web 世界坐标锚定）。
3. **细节近似**：气泡非对称圆角以单值近似；无 backdrop blur/阴影/markdown；滑块把手为圆角方块；探索/大图 pill 为纯视觉（白板卡不收事件）；NOTE 卡在某些取景下右缘贴屏边。
4. **功能禁用不变**：语音/摄像头/提问/目录/下一 Beat/重播 Topic/擦除/框选/笔迹持久化仍为禁用占位（外观与 web 一致，点击 toast 说明）。

## 5. 验证

- 两 crate 测试全绿（oll-preview 15 + octos-learn 3）；构建 0 error。
- v2 截图：`macos-product-v2/`（与 web-reference/ 同尺寸对照）。
- .app 已重新打包（含 zbias 修复、校验过的两门课包），ad-hoc 签名。

## 6. 下一步

1. 布局引擎对照（spatial::layout vs web layout）使卡片排布一致；变量面板世界坐标锚定。
2. 字体：构建期把 woff2 预转 ttf（一次性工具，产物入仓）后接入 Hanken/Inter 拉丁字体。
3. zbias 补丁上游化；v1 文档 §5 的 runtime 能力项（next_beat/大纲/Ink 持久化/旁白音频）不变。
