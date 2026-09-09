# 白板交互改造执行计划

> 制定日期：2026-09-09。依据：对 Miro / Figma(FigJam) / Excalidraw / tldraw / Microsoft Whiteboard / Apple Freeform / GoodNotes / Notability / Muse 的官方文档与源码调研，以及对 octos-learn 白板现状的代码走查。

## 0. 范围与已确认的决策

| 决策点 | 结论 |
|---|---|
| 选中笔迹的缩放/旋转 | **不做**（手柄保持隐藏，且封死 js-draw 键盘后门，确保该能力真正不存在） |
| 手写笔自动切书写模式 | 不做，保持工具栏显式切换 |
| 卡片操作进撤销栈 | 不做 |
| 滚轮模式开关（Miro 流派 vs Figma 流派） | 不做，维持现状"滚轮直接缩放"（Miro 流派）；只修触控板捏合不平滑 |
| 套索工具 | 不暴露到 UI（runtime 已有代码保留不动） |
| "我的问题"卡拖拽 | 不做（与课程卡保持一致：所有卡片位置由布局系统统一管理） |
| 课程卡片可拖拽（原 P8） | 不纳入本期；如需做，是上游 octos-lesson-language 的大型特性（布局偏移模型 + 持久化 + 教学镜头协同），单独立项 |

## 1. 目标交互形态

| 操作 | 鼠标/触控板 | 触摸屏 | 手写笔 |
|---|---|---|---|
| 平移画布 | 浏览模式拖拽 + **空格+左键拖 / 右键拖 / 中键拖**（任何工具下可用） | 单指拖空白 | — |
| 缩放画布 | 滚轮缩放（现状，锚点指针）；触控板捏合**变平滑** | **双指捏合（新增，锚点双指中心）** | — |
| 框选笔迹 | 框选工具下左键拖 | 框选工具下单指拖 + **长按空白出框（新增）** | 框选工具下笔拖 |
| 移动选中笔迹 | 拖选区（现状） | 拖选区（现状） | 拖选区（现状） |
| 缩放/旋转选中 | 不存在（手柄隐藏 + 键盘封死） | 不存在 | 不存在 |
| 移动卡片 | 不做 | 不做 | 不做 |
| 书写 | 工具栏切书写 | 工具栏切书写；**书写时手掌不误触（新增）** | 工具栏切书写；压感 + 笔杆橡皮键（现状） |
| 撤销/重做 | 工具栏按钮 + **应用级 Ctrl/Cmd+Z（新增）** | 工具栏按钮 | 同左 |
| 画布视角旋转 | 不做（行业共识） | 不做 | — |

## 2. 代码事实（计划依据）

交互逻辑主体在依赖包 octos-lesson-language（本地 checkout `/Users/alan0x/Documents/projects/octos-lesson-language`，HEAD=0e28b57，与 octos-learn 锁定的 baa75d29 代码树一致）：

- `packages/web-runtime/src/board-view.ts`：画布平移/缩放/指针处理
  - `dragging` 单指针对象（~1233 声明，~1979 赋值），无 pointerId、不跟踪多指——**第二指按下会覆盖平移起点（已知 bug）**
  - `onPointerDown` 1939-1981（不检查 `event.button`）；几何角度控制点分支 1944-1977
  - `onWheel` 1901-1910 固定 ×1.1/×0.9 步进；`zoomAt` 1920 已支持任意锚点，clamp 0.15–2.2
  - 监听注册 1281-1284：viewport 上 `wheel`(passive:false)+`pointerdown`，window 上 `pointermove`/`pointerup`——**无 `pointercancel`**
  - `render()` 1316-1331 教学镜头直接改相机；`setInputOwner` 1473-1481 切 owner 清拖拽（现成的跨层仲裁钩子）
  - `focusRects` 1881-1900 → `camera.ts:232-263` `planFocusCamera`
- `packages/web-runtime/src/camera.ts`：`TeachingCameraAuthority` 8-56；`beginManualNavigation` 21-23
- `packages/web-runtime/src/input-routing.ts`：交互 UI 豁免 18-28；滚轮路由 35-49
- `packages/web-runtime/styles.css:3`：`.oll-board-runtime { touch-action: none }`——浏览器原生手势已禁，捏合必须自实现
- `packages/ink-runtime/src/runtime.ts`：笔迹层（js-draw 1.33.0 封装）
  - `prepareBoardInput` 268-400，**capture 相**监听 viewport pointer 事件并 stopPropagation（322-323）；navigate 模式直接 return（307）
  - `pointerDevice` 279-286：`pointerType==="pen"` → Pen、压感 200、笔杆橡皮键（buttons & 0x20）→ Eraser（280）；右键目前映射 RightButtonMouse（书写模式下右键会画出笔迹，需修）
  - `setMode` 501-522 四模式；`undo()/redo()` 524-525；`restrictSelectionToTranslation` 调用点 217/382/519
  - `contextmenu` preventDefault 391-393（仅非 navigate 模式）
- `packages/ink-runtime/src/selection-lock.ts`：`restrictSelectionToTranslation` 20-37（允许平移、隐藏全部缩放/旋转手柄、四类 widget containsPoint 置 false）——**本期不动**
- js-draw 1.33.0（精确版本锁定）可配置点：
  - `EditorSettings.keyboardShortcutOverrides`（`Editor.d.ts:60`）：shortcut id 覆盖为空数组 = 等效禁用
  - 选区键盘变换（方向键/R/I/O/Ctrl+D/End）全部走 shortcut id（`SelectionTool.mjs:242-347` + `keybindings.mjs`），可配置
  - **例外**：`Delete`/`Backspace` 删除是 `SelectionTool.mjs:341-345` 硬编码，不可配置；保留（标准行为），在 keyboard-policy 注释中注明
  - 三个默认启用的键盘工具需禁用：`UndoRedoShortcut`、`ToolSwitcherShortcut`（数字键 1-9 绕过 setMode 直接切工具，与四模式模型冲突）、`SelectAllShortcutHandler`
  - js-draw keydown 挂在 renderingRegion（`Editor.mjs:277`）与选区 handleOverlay——这就是 Ctrl+Z 目前只在笔迹层聚焦时生效的原因
- octos-learn 宿主侧：
  - 工具栏 `src/learning/oll/oll-lesson-runtime.tsx` 2847-2982；撤销/重做通道 `runInkHistory` 2963；`selectAllInk` 2956
  - `mountInfiniteBoard` 1990；enhancement 宿主豁免标记 2030-2031

## 3. 阶段计划

```
P1 键盘治理                octos-lesson-language / ink-runtime   小
P2 手势状态机重构          octos-lesson-language / web-runtime   大
   ├─ P2a 多指针模型 + 双指捏合 + 修第二指 bug
   ├─ P2b 平移入口：空格/右键/中键拖
   └─ P2c 触控板捏合平滑缩放
P4 palm rejection          octos-lesson-language / ink-runtime   小（依赖 P2a）
P5 触屏长按框选            octos-lesson-language / ink-runtime   中（依赖 P2a）
P6 应用级快捷键 Ctrl+Z     octos-learn                            小（依赖 P1）
P7 收尾：README 同步、pin 更新、全量验证
```

### P1 键盘治理【ink-runtime】

- 新建 `packages/ink-runtime/src/keyboard-policy.ts`：
  - `INK_DISABLED_SHORTCUT_IDS`：R/Shift+R 旋转、I/O/,/. 键盘缩放、Ctrl+D 复制、End 置底、对齐网格
  - `applyInkKeyboardPolicy(editor)`：对上述 id `overrideShortcut(id, [])`；并 `setEnabled(false)` 三个键盘工具（UndoRedoShortcut / ToolSwitcherShortcut / SelectAllShortcutHandler——P6 由宿主应用层统一接管，避免双触发）
  - 保留：方向键平移、Delete/Backspace（硬编码例外，注释注明出处 `SelectionTool.mjs:341`）
  - 文件内留"js-draw 升级检查清单"注释（依赖的内部 API：overrideShortcut、shortcut id 清单、SelectionTool 硬编码删除）
- `runtime.ts` `prepareEditor`（~195）中调用 `applyInkKeyboardPolicy`
- `selection-lock.ts` 不动
- 验证：新增 `packages/ink-runtime/test/keyboard-policy.test.ts`（假 editor 断言 overrideShortcut 集合，仿 `runtime.test.ts:11-43` 风格）；`npm test`；harness 确认 R/I/O/数字键无反应、方向键/Delete 可用

### P2 手势状态机重构【web-runtime】

**P2a 多指针模型 + 双指捏合（大）**

- 新文件 `packages/web-runtime/src/gestures.ts`：纯状态机 `BoardGestureRecognizer`
  - 输入：归一化指针事件 `{pointerId, x, y, type: down|move|up|cancel}`
  - 输出：`panBy(dx,dy)` / `zoomAt(factor,x,y)` / `none`
  - 状态：`idle → panning`；第二指落下 → `pinching`（记录起始双指距离/中点/相机）；move：`factor = dist/dist0`，锚点=当前中点，中点位移叠加 pan；**抬一指 → 以剩余手指当前位置重建基线回 panning**（修复"第二指重置平移起点"bug）；全抬 → idle
- `board-view.ts`：`dragging` → `pointers: Map<pointerId>` + recognizer；`onPointerDown` 保留几何控制点分支不变；**补 `pointercancel` 监听**；`setInputOwner` 同步清 recognizer
- 教学镜头冲突：手势活跃期 `render()` 收到的镜头请求存 `pendingCameraFocus`，全抬后重放最新一次
- 验证：新增 `packages/web-runtime/test/gestures.test.ts` 表驱动单测（捏合数学、基线重建、cancel 复位）

**P2b 平移入口解耦（中）**

- 空格+左键：window 级 keydown/keyup（输入框聚焦忽略；keydown preventDefault 防触发聚焦按钮）；空格期间左键无条件可 pan + 抓手光标 class
- 右键/中键：`onPointerDown` 对 button 1/2 绕过 inputOwner 检查直接 pan；board-view 补 `contextmenu` preventDefault
- **跨层协议**（capture/bubble）：ink-runtime `runtime.ts:279-340` 非左键直接 return 不 stopPropagation，让事件冒泡到 board-view；两处代码互加交叉引用注释；顺带修正"右键在书写模式画出笔迹"

**P2c 触控板捏合平滑缩放（中）**

- `onWheel`：`ctrlKey===true`（各浏览器触控板捏合均表现为 ctrlKey+wheel）→ `factor = Math.exp(-deltaY * 0.0022)` 平滑缩放；普通滚轮保持固定步进；处理 `deltaMode` 行/像素换算（行 ×~33）

### P4 palm rejection【ink-runtime】

- `runtime.ts` `prepareBoardInput`：新增 `lastPenActiveAt`（pen down/move 刷新）；touch 且 `now - lastPenActiveAt < 600ms` → 不 dispatch 给 js-draw、**不 stopPropagation**（交给 board-view 当平移候选，实现"笔写+另一指挪画布"）
- 抽纯判定函数便于单测；压感/笔杆橡皮键不动

### P5 触屏长按框选【ink-runtime】

- select 模式 + `pointerType==="touch"` 的 `onPointerDown`：不立即拦截，启动 ~400ms 定时器缓冲事件
- 期间移动超 ~10px → 判平移：丢弃缓冲（事件从未拦截，board-view recognizer 自然已在 pan）
- 定时器到期 → 判框选：`board.setInputOwner("ink")`（清掉可能已开始的 pan）+ setPointerCapture + 补发缓冲序列给 js-draw 走 marquee
- 鼠标/笔行为不变；ink 层 CSS 补 `user-select:none` / `-webkit-touch-callout:none`（防 iOS 长按菜单）
- 仲裁器抽纯函数单测

### P6 应用级快捷键【octos-learn】

- `oll-lesson-runtime.tsx` 组件挂载期 window keydown：Ctrl/Cmd+Z → `runInkHistory("undo")`；Ctrl/Cmd+Shift+Z、Ctrl+Y → redo；select 模式 Ctrl/Cmd+A → `selectAllInk`；输入框聚焦跳过
- 前提：P1 已禁用 js-draw 的 UndoRedo/SelectAll（js-draw preventDefault 但不 stopPropagation，否则会双触发）
- 验证：vitest 组件测试模拟 keydown；焦点在提问输入框时 Ctrl+Z 不吞笔迹撤销

### P7 收尾

- 更新 `packages/ink-runtime/README.md`（键盘行为章节）与 `packages/web-runtime/README.md`（手势清单）
- octos-lesson-language push 后更新 octos-learn `package.json` pin，`pnpm install` 更新 lockfile
- 全量验证：octos-lesson-language `npm test`；octos-learn `pnpm test:unit && pnpm lint && pnpm build` + `tests/learning-smoke.spec.ts` 冒烟

## 4. 跨仓库工作流

1. 开发迭代：octos-lesson-language 本地 `npm run build && npm test` 验证；octos-learn 临时 `pnpm add octos-lesson-language@file:../octos-lesson-language`（触发 prepare 构建），**file: 不提交**；避免 `pnpm link`（dist 解析 + React 双实例风险）
2. 阶段交付：push 到 `alan0x/octos-lesson-language`，octos-learn pin 更新为新 commit 全 hash
3. 遵守 `.octos/AGENTS.md`：干净 main 切分支，每个 commit 说清用户可见行为 + 证明测试

## 5. 风险点

1. **教学镜头 vs 手势**：`pendingCameraFocus` 延迟重放必需，代价是手势期间（<1s）新内容不立即聚焦，可接受
2. **js-draw 内部 API 依赖**：`overrideShortcut`（@internal）、shortcut id 清单、`SelectionTool.mjs:341` 硬编码删除。js-draw 锁精确版本 1.33.0，升级时必须回归 P1/P5 全部选区行为
3. **capture/bubble 跨层协议**：ink capture 相 / board-view bubble 相，P2b（右键放行）与 P5（长按延迟拦截）都建立在此协议上，改一边必须看另一边
4. **`setInputOwner` 副作用**：P2a 重构后该函数要同步清 recognizer，遗漏会导致长按框选与平移同时生效
5. **空格平移副作用**：空格会触发聚焦的按钮，keydown 需 preventDefault；工具栏按钮点击后建议 blur
6. **iOS 验证**：`touch-action: none` 下捏合全靠自实现，需实机验证 iOS Safari 多指 pointer events；建议 `.oll-board-runtime` 补 `overscroll-behavior`
