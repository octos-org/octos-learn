# macOS 原生版（Makepad）进度文档

> 任何 Agent 接手前先读本文件，再读 `docs/makepad-migration/AGENT_HANDOFF.md`（详细交接规矩与历史版本 V1–V6）。
> 每完成一块工作：更新本文件的「已完成」「待做」两节，随代码一起提交并推送。

最后更新：2026-10-07（语音提问）

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

## 3.1 本地 octos 服务（服务端功能开发用，2026-10-07 起）

- octos 克隆在工作区 `oll-product/octos`（用户的 `~/Documents/projects/OctosLearn/octos` 只读，不要在里面构建或切分支）。
  构建：`cargo build --release -p octos-cli --no-default-features --features api`。
- 数据目录 `.local-dev/octos-home`（`config.json`：`mode: local`，provider gemini）；learning-coach 复制到 `.local-dev/octos-skills/learning-coach`（来源是用户的 learning-coach 仓库，不在原仓库里运行）。
- LLM key：用户放在 `~/.octos/llm.env`（`GEMINI_API_KEY=…`，权限 600）。**不要打印或提交其内容**；启动时用 `set -a; . ~/.octos/llm.env; set +a` 加载。
- 启动：
  ```sh
  L=~/Documents/projects/OctosLearn/.local-dev
  set -a; . ~/.octos/llm.env; set +a
  OCTOS_SKILLS_PATH=$L/octos-skills OCTOS_HOME=$L/octos-home \
    $L/oll-product/octos/target/release/octos serve --solo --data-dir $L/octos-home --config $L/octos-home/config.json --port 50080
  ```
- 登录：`POST /api/auth/solo`（没有本机档案时 404）→ `POST /api/auth/solo/create {"name": …}`，返回 token。
- Web 对照：在 web-main worktree 运行 `npx vite --port 5173`（dev server 才代理 `/api` 和 WebSocket），抓包脚本 `.local-dev/macos-product-v8/protocol/capture-turn.mjs`（自动填 key 时只从文件读取，日志里会把 key 打码）。
- 一次文字提问的协议（Web 实测）：WebSocket `/api/ui-protocol/ws?token=…`（JSON-RPC 2.0）
  1. `session/open {session_id: "learn-<毫秒>-<随机>", profile_id}`；
  2. `session/title.set`；
  3. `skill/action/invoke {action_id: "learning.lesson.generate", arguments: {turn_id, learner_request, request_source: "self_contained", language: "zh-CN", input_modality: "text", client_timing}}`；
  4. 服务端推送 `skill/action/job/updated`（queued → running → succeeded，`result.artifacts[].handle` 指向 `*.octos-lesson.json`，另有 `.part-00N` 渐进片段）；
  5. `GET /api/files/<handle>` 下载 authoring 课程，原生用 `oll_runtime::authoring::materialize_jsonl` 转成 canonical JSONL 后交给 `Session::load`。
- 首次进入白板时 Web 有「把白板准备好」设置页：`POST /api/my/test-provider` 测试 key，`PUT /api/my/profile` 保存模型（profile.config.llm.primary）。

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
- `a31aac5` 中文字体（用户选定方案 A）：随 app 打包 Noto Sans SC Regular/Bold（SIL OFL 1.1，`native/octos-learn/assets/fonts/`，约 17MB），`src/cjk_fonts.rs` 在启动时把它插到主题字体链里 LXGW 之前；`package-macos.sh` 复制到 `Resources/octos_learn/assets/fonts/`（已验证打包后不依赖源码目录）
- OLL `adfa0ff` 课程生成格式：移植 Web `materializeOllLesson`（authoring → canonical），OLL 全部示例与 Web 输出一致，本地生成的课程可在原生播放到底
- `9eb25c7` 服务端第一块：`src/server.rs`（solo 登录、ui-protocol WebSocket JSON-RPC、协商 ui_feature、会话文件下载）；「新建空白白板」打开实时白板（启动器按钮与学习记录抽屉）；输入栏改成真正的文本框，回车或发送按钮提问 → `skill/action/invoke learning.lesson.generate` → 等待 job → 下载 `.octos-lesson.json` → 原生物化后播放；「我的问题」卡（正在准备回答 / 已回答 / 没有生成成功）与「正在搭建这节课」加载卡（同 Web 位置），老师「正在想 / 轻触开始」；白板根 turtle 改为不裁剪（世界坐标可为负）；含中文 `\text` 的公式卡宽度估计加余量。已用本地 octos 实测（勾股定理、质数、相反数、绝对值、倒数）
- `ba269da` 实时白板保存到本机（`<数据目录>/live/<session>.json`：问题、生成的课程 canonical、播放进度与笔迹），学习记录里显示为「自由白板」，点开恢复到保存时的状态（离线可用；生成中的问题恢复为「没有生成成功」）
- `7962cd9` 新手设置页（Web SetupWhiteboard）：首次打开实时白板时显示，三张卡片——连接模型（Google Gemini、模型名称、API Key，`/api/my/test-provider` 测试后 `PUT /api/my/profile` 保存，显示 Web 的保存结果文案）、旁白语音（试听 `/api/voice/synthesize`，可展开填写个人火山 TTS 并保存试听）、使用提示；「进入我的白板 / 先用白板，稍后设置 AI」记住跳过（`setup-skipped-<profile>`）。DIFF：老师形象选择器未做（原生只有 Ocean），「完整设置」入口为提示
- `45815b5` 生成课程旁白（Web useOllNarrationTts）：课程载入/恢复时按 Beat 逐个调用 `/api/voice/synthesize`，缓存到 `<数据目录>/tts/<session>/`，作为该 Beat 的旁白片段播放，WAV 时长作为 Beat 时长；TTS 不可用时保持无声、按文本计时。本机服务 TTS 返回 502，只验证了失败路径与 WAV 时长解析，**需在另一台电脑验证有声播放**
- `d3832cd` 语音提问（Web 启用语音）：顶栏「启用语音 / 关闭语音」与输入栏麦克风按钮；`src/voice.rs` 用 Makepad 音频输入采集默认麦克风（系统回声消除），能量 VAD（≥300ms 语音、静音 700ms 结束，DIFF：Web 用 Silero 模型），转 16kHz WAV → `POST /api/upload`（recording）→ `voice/admit` 得到转写 → 以 `input_modality: "voice"` 提问；老师「我在听 / 正在想」。Info.plist 增加麦克风/摄像头用途说明。自动化测试用 `OCTOS_VOICE_TEST_WAV=<wav>` 注入一段语音（不打开真实麦克风）：本机 OminiX ASR 转写正确并生成课程。**真实麦克风采集需在另一台电脑验证**
- `7fdb3a4`（OLL `2d7b4ec`）节点/连线图（Web renderDiagram）：生成的课程常含 `kind:"diagram"` + `elements/edges/regions`，之前原生拒绝加载（"supports sequence diagrams only"），导致语音提问的课程失败。OLL `src/diagram.rs` 移植 diagramLayout（2–8 个元素的单链 → 蛇形排列的圆角方框，中文按 2 单位折行；否则语义位置/环形圆点 300×190）、片段连线目标矩形与图内连线几何；原生 `oll-preview/src/diagram_view.rs`（DiagramView，viewBox meet 居中，区域多边形、边与边标签、强调色、图内片段连线与标签徽章），`board_view::diagram_node` 卡片（标题 + 图，高度 calc(100%-24px)）。用本次失败的课程复现并截图核对；`OCTOS_VOICE_TEST_WAV` 语音提问全流程重新跑通（转写 → 生成 → 播放）。DIFF：节点文字 Web 用 STKaiti 600，原生用主题粗体
- `36a4117` 摄像头提问（Web 启用摄像头）：顶栏「启用摄像头 / 关闭摄像头」与输入栏摄像头按钮（实时白板）；`src/camera.rs` 用 Makepad `camera_frame_input` 取默认摄像头（≤1080p，转 I420 保存最新一帧，约 15fps），右上角监视窗（Web .learning-camera-monitor：「老师看到的画面」+「本轮已发送」）；提问（文字或语音）时截取当前帧 → JPEG（文档模式：长边 1600、质量 .88）→ `POST /api/upload` → `learning.lesson.generate-from-camera`（`paths`、`request_source: "current_image"`）。新增依赖 `image 0.25`（仅 jpeg/png，已在依赖树中）。自动化测试用 `OCTOS_CAMERA_TEST_IMAGE=<png/jpg>` 代替摄像头：本机生成的课程正确识别图中题目（x²−5x+6=0 因式分解）。DIFF：Web 的画面调整对话框（旋转/镜像/缩放/偏移/文档模式）未做，使用 Web 默认值。**真实摄像头采集与系统权限弹窗需在另一台电脑验证**
- `2c895ea` 图片提问（Web sendImage，输入栏图片按钮）：系统文件选择框（Makepad `open_select_file_dialog`）→ `POST /api/upload` → 代理对话 `turn/start`（Web buildTurnText 的 LEARNING_SESSION/LEARNING_CONTEXT 前缀 + 固定提示「请看我上传的题目，把题目和关键步骤整理到白板上。」，图片作为 media）；从 `projection/envelope` 的 `assistant_persisted.meta.media` 取最终 `<turn>.octos-lesson.json`（忽略 `.part-NNN.`）→ `/api/files?path=<绝对路径>&session=` 下载 → 原生物化播放；`turn_terminal` 未带课程时，问题标为失败并提示代理的回复。同时：`server::uuid()` 改为 /dev/urandom 的 v4 UUID，会话号后缀改为 6 位随机 base36（与 Web createLearningSessionId 一致；之前的 id 高位取自时钟、互相同前缀）；`OCTOS_SERVER_DEBUG` 也记录发出的 WS 帧和 HTTP 响应前 300 字。测试钩子 `OCTOS_IMAGE_TEST_FILE=<图片>` 跳过选择框。
  - **已知问题（服务端/技能，Web 同样复现）**：本机 gemini-3.6-flash 代理处理上传图片时，常以 `request_source: "current_image"` 且不带 `camera_media` 调用 `oll_generate_lesson`，技能报 `LESSON_CAMERA_IMAGE_REQUIRED`，代理重试后放弃，整轮没有课程。原生连续 6 次、Web 后来 1 次都这样（Web 早先 2 次走 self_contained 成功）。两端发送的 `turn/start`、上传文件、服务端提示长度（30405 字节、66 个工具）完全一致，所以不是原生协议问题；需要在技能或代理提示里修。课程下载这一步已用成功的 Web 会话直接验证（`/api/files` 绝对路径 200）
- `79ef62b`（OLL `ba16c14`、`b692425`）同一白板多次提问拼成一个课堂（Web composeOllClassroomEvents）：OLL `src/classroom.rs` 移植 namespaceCanonicalLesson（后续课程的变量/任务加 `v<hash>_` 前缀）、composeOllClassroomEvents（`learning-session-<id>`、无 lesson.close、节点放进各自 topic 区域）与 loadOllLessonArtifact 的 host（`learn-<session>-<turn>.octos-lesson.json`、`learning-board-<session>`、`topic-…`）；`tests/classroom.rs` 用 Web 代码（esbuild 打包 web-main 的 oll-artifacts/oll-materialization）生成的三课 fixture 逐事件比对，一致。原生实时白板保存 `lessons` 列表（兼容旧的单个 `lesson`），新回答到达后重新组合、增量加载、跳到新 topic 第一步继续播放，前面的 topic 保留在白板上。另修：生成课程里的 `lesson.phase.start`（Beat 开始时把变量回放到起始值，Web beginPhaseTransition）之前被原生拒绝导致「没有生成成功」，现在按 brief 1.8s easeInOutQuad 动画播放（`tests/authoring.rs` 新增回放用例）。已用本机服务连续问「相反数」「绝对值」验证
- `3670b30` 课程内提问（Web activeOllEvents = compose([课程包事件, ...回答])）：互动模式的课程白板上，文字、语音、摄像头、图片提问都可用；第一次提问时课程变成「课堂」（`Live.base` = 课程 canonical，`Live.course` = 包 id/版本），回答作为新 topic 接在课程后面，跳到回答的第一步播放（Web 用 6 倍速快进到回答旁白，原生直接定位，终态一致）。课程自带旁白音频保留，服务端 TTS 只合成回答的 Beat。课堂保存在 `live/<session>.json`（带 `course` 字段，不在学习记录里单独列出）；从学习记录或启动器再打开这门课时恢复最新课堂（进度、提问、回答、笔迹）；「开始互动学习」仍是新的实例。已用本机服务在 linear-intro-and-slope 上提问并重新打开验证
- `3a6ed18`（OLL `d59b607`）框选笔迹提问第一部分：选择工具框选笔迹后，工具条显示「正在识别选区…」→ 快捷操作（解释这部分 / 检查并建议 / 生成函数图像，按识别类型）和「问小章鱼」；面板（Web .learning-selection-question）含覆盖到的白板卡片（只看我的笔迹 / 整个内容块）、内容类型（Web 下拉框，原生用按钮组）、自动识别结果、操作建议和问题输入框。选区图片按 Web selectionSnapshotToPngFile 只画选中笔迹（#fbfaf5 底，min(2, 1600/长边) 倍），上传后调用 `learning.selection.classify`（同步结果）；「解释这部分」与「选中笔迹时在底部输入框提问」走 `learning.lesson.generate-from-selection`（`request_source: ink_selection`，提问文字按 formatSelectionLessonRequest 带上识别内容/选中卡片），回答拼进课堂。课程白板未提问前也有学习会话（识别用，之后的课堂沿用）。OLL `selection.rs`：工具表、isSelectionLessonRequest、selectionAnswerPresentation、整卡级 board target、来源/白板参数、SHA-256。本机实测：手写 x+1=3 → 识别为公式 → 生成「一元一次方程」课程。DIFF：选中白板卡片时 Web 图片里还会画出卡片，原生仍只画笔迹（卡片信息在文字里）；面板里的语音提问未做；卡片片段级 target（公式片段、图上的点等）未做
- `bc9d240` 框选笔迹提问第二部分＝批注卡片（Web SelectionEnhancementLayer）：「检查并建议」「生成函数图像」和面板里的自由提问调用 `learning.selection.enhance`（`delivery_mode: card`；原生没有 AI 板书，相当于 Web 无 board_writing 能力时的表现），从结果里找到 `<turn>.octos-selection-enhancement.json` 下载后显示为白板上的卡片：放在选区右侧 30（避开已有卡片向下找空位），330 宽；卡片含「我的问题」+状态、「小章鱼辅助 / 来自当前选区」、标题、正文、要点列表、函数图（`selection_plot.rs`，Web SelectionPlot 300×164，显式/隐式曲线）、「当前无法生成这个图像」+替代建议、「系统理解：」；生成中/失败占位；虚线连线从选区指向卡片；右上角「最小化 / 删除」，最小化后是「?」圆钮，点击展开。卡片随课堂保存（位置、状态、结果）。本机实测：x+1=3 检查并建议、y=x² 生成函数图像、最小化/展开/删除。DIFF：Markdown 只显示纯文本（去掉 ** 与 $，公式不排版）；卡片拖动与缩放未做；3D（scene3d）结果只显示文字
- （本次提交）完整设置页第一部分（Web /settings）：启动器右上「设置」（替换原来的「登录」占位；solo 自动登录，无「退出」）、新手设置页的「完整设置 / 打开完整模型设置 / 语音设置与用量」都打开它；顶栏（返回、齿轮、OCTOS LEARN / Settings / 副标题、「新手设置白板」= 打开新白板并强制显示新手设置）；左侧分组导航（PERSONAL / LEARNING / ACCESS / DEVELOPER，Authentication 带 ADMIN 标记，搜索框过滤）；内容区 768 宽卡片。已做的 tab（`src/settings.rs`，按 Web 字段与文案）：Profile（Profile ID、Display Name、Auto-start Gateway、Admin Mode、Created、Save Changes；Gateway Status 与 Start/Stop/Restart；Environment Variables 编辑/新增/删除）、LLM（Provider 下拉 + 是否可用于课程生成提示、Model 预设/自定义、Custom Provider ID、Service Account JSON、Base URL、Key 是否已在 API Keys 配置、Test Connection、Fallback Models 增删、Adaptive Routing 开关与说明、Prompt & Output、Gateway Parameters、Save Changes/Reset 及 Web 的保存提示文案）、API Keys（LLM Providers / Channels / Infrastructure 三组，Configured/Not set，保存时空值删除、未改的掩码值原样回传）、Voice（识别语言、TTS 路线及说明、Auto/Cloud 时的火山凭据卡：App ID、Token、Voice、Advanced（Cluster/Encoding）、校验提示；Save、Test TTS（先保存再试听））。`server.rs` 新增通用 `json()` REST 调用。本机实测：各 tab 截图与 Web 对照、Test Connection 显示 Connected、Profile 保存显示 Saved 且之后连接测试仍通过（掩码密钥未被破坏）。DIFF：无深色主题切换；Stop/Restart 没有确认弹窗；Profile 的 Danger Zone（删除 profile）未做；下拉菜单弹层用 Makepad 默认样式
- `acdfc1e` 老师状态文字跟随 Web lessonOwnsNarration（下一 Beat 后显示「课程播放中」，用户暂停后「继续播放」）

**九门课逐 Beat 对照（2026-10-06，同视口高）**：布局与 Web 差 1e-6 以内；屏幕位置大多 ≤15px，
结束画面 ≤17px（slope-and-intercept 35px，源于 KaTeX 与 NewCM 字形宽度差异，属已知限制）。

## 6. 待做（按优先级）

1. 继续逐课视觉巡检（native vs web 截图）。已知小差异：
   - ~~中文字体~~：2026-10-06 用户选方案 A，已改用打包的 Noto Sans SC。
   - 大图对话框里「探索」工具条 Web 在底板外上方，原生在底板内（PlotView 自带工具条）
   - 中文换行不避头尾（如「。」出现在行首），Makepad 文本换行限制
2. 练习任务中 scene3d 视角提交（目前没有课程包使用，优先级低）。
3. ~~再跑一次九门课全量对照~~（2026-10-06 完成，无回归）。
4. ~~写交付文档 V7、更新 AGENT_HANDOFF.md、通知用户测试~~（2026-10-06 完成，见 `docs/makepad-migration/OLL_MACOS_PRODUCT_V7.md`）。等待用户测试反馈与中文字体决定。

5. 2026-10-07 用户要求继续做（每完成一块提交推送并更新本文档）：
   - [x] 框选笔迹提问（两部分均完成；剩余 DIFF：卡片拖动/缩放、Markdown 公式排版、scene3d 卡片、面板语音提问、片段级 target）
   - [~] 完整设置页：第一部分（框架、Profile、LLM、API Keys、Voice）已完成；剩 Learning Companion、Authentication、Developer Options
   - [ ] 摄像头画面调整对话框（旋转/镜像/缩放/偏移/文档模式）
   - [ ] 加载卡粒子与流光动画

## 6.2 本分支合并之后再做（用户 2026-10-07 指示：先记录，合并后开始）

- **图片提问时技能拒绝（服务端/技能问题，Web 同样复现）**：上传图片走代理对话 `turn/start` 时，代理（本机 gemini-3.6-flash）调用 `oll_generate_lesson` 用 `request_source: "current_image"` 却不带 `camera_media`，learning-coach 报 `LESSON_CAMERA_IMAGE_REQUIRED`，代理重试几次后放弃，整轮没有课程。原生 6/6 次、Web 后来 1/1 次都如此（Web 早先 2 次代理选了 self_contained 才成功）。两端 `turn/start`、上传文件、服务端提示（30405 字节、66 个工具）一致。可选修法：(a) 技能在 `current_image` 缺 `camera_media` 时回退到本轮 user_message 的图片附件；(b) 工具描述/代理提示明确上传图片应走 self_contained 或带上 `camera_media`；(c) 客户端改用 skill action（类似摄像头 `generate-from-camera` 直接带 `paths`）。复现：本机 octos solo + `OCTOS_IMAGE_TEST_FILE=<图片>` 点输入栏图片按钮；技能源码 `octos-skills/learning-coach/src/main.ts` 中 `LESSON_CAMERA_IMAGE_REQUIRED`。

## 6.1 依赖后端功能的建议路线（2026-10-06 提出，待用户确认）

| 顺序 | 功能 | 依赖 | 说明 |
|---|---|---|---|
| 1 | 登录 + 原生 API 客户端 | 服务器地址、测试账号、原生端登录方式 | 其余功能的前提；对齐 Web `api/typesafe-client.ts` |
| 2 | 提问输入栏（文字） | 1 | 老师回复、选区提问、白板助教卡，是互动学习的核心闭环 |
| 3 | 学习记录服务器同步 | 1 | 学习记录抽屉合并服务器记录（Web `discoverServerLearningSessions`） |
| 4 | 设置页 | 1 | 设备偏好、语音设置等 |
| 5 | 语音对话 | 1、2 | 麦克风权限（entitlement）、音频流、TTS |
| 6 | 摄像头 | 1、2 | 相机权限、拍照上传 |
| 7 | 新建空白白板 | 部分可离线 | 本地手写白板可先做；AI 生成内容依赖 2 |

已知限制（服务端第一块）：框选笔迹提问（ink_selection / board_context 引用）还没做；加载卡没有粒子与流光动画。

服务端语音现状（本机）：octos 通过 `OMINIX_API_URL=http://127.0.0.1:8080` 接上 OminiX 后 ASR 就绪；TTS 的本机路线固定用 GPT-SoVITS 引擎，本机 OminiX 只有 Qwen3-TTS，所以 `/api/voice/synthesize` 返回 502（云端路线需要火山 TTS key）。课程旁白 TTS 在本机无法实测，需要在用户的另一台电脑验证。

## 7. 明确不做 / 占位（依赖后端或未迁移）

（2026-10-07 起语音、摄像头、提问输入框、新手设置、solo 登录、新建空白白板已接入本地 octos，见 §5。）仍未做：完整设置页、摄像头画面调整对话框。
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
