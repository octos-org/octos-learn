# 学生当老师模式：交接与当前进展

> 截至 2026-11-02。给接手的会话或 agent：读完本文即可继续工作。方案见 [学生当老师模式计划](LEARNER_TEACHING_MODE_PLAN.md)，里程碑与验收见 [实施计划](LEARNER_TEACHING_MODE_IMPLEMENTATION_PLAN.md)（第 3 节进度表逐条记录了每次完成的内容）。

## 1. 一句话现状

M0–M6 已完成并通过真实浏览器 + 真实模型 + 真实火山语音验证，代码全部推送、PR 全部打开，**都还没有合并**。第一阶段（只有自己能看到）的功能已经齐了。孩子现在可以：选主题和卡片 → 逐张录课（语音实时字幕、手写、整理成公式、插入网格/函数图/单位圆/长方体、点和过两点直线、激光笔/荧光笔/箭头、“放在旁边…”、“轮到你了”练习）→ “检查我的课”（屏幕可读性 + 小章鱼点评 + 隐私）→ 改卡片 → 选形象和声音 → “看我的课” → **“保存到我的课”**（生成课程包并存到账号）→ 在“我的课”里播放（只用课程包，不需要 Key、断网也能放）→ 星图上出现“讲过”外环，获得“小讲台”成就。草稿会同步到账号。下一步是产品方做一轮端到端实测（M5 和 M6 一起测），然后合并；第二阶段 M7 开工前需要法律顾问（P4）。

## 2. 仓库、分支、PR 与合并顺序

所有 PR 都是叠加的，按下面顺序合并；合并 OLL #27 后要把应用里的 OLL 固定提交改为 #27 的合并提交（`package.json` 和 `learning-stack-bom.json` 两处）。

| 顺序 | 仓库 | PR | 分支 → 目标 | 内容 |
|---|---|---|---|---|
| 1 | octos-lesson-language | [#26](https://github.com/alan0x/octos-lesson-language/pull/26) | `claude/playback-gate-fixes` → main | M0：播放检查门槛修正（屏幕字号、去掉卡宽门槛等） |
| 2 | octos-lesson-language | [#27](https://github.com/alan0x/octos-lesson-language/pull/27) | `claude/learner-taught-contracts` → main（含 #26） | M1 与后续：`learner_taught`、笔迹、批注/替换/隐藏、视角意图；激光指向部件、`showPointer`/`showPointerAt`、`deleteSelection`/`strokeBoundsAt`、整理后的公式留在原处、辅助图可“放在旁边”、导出 `visibleBoard`。头：`595254d` |
| 3 | octos-learn | [#113](https://github.com/octos-org/octos-learn/pull/113) | `claude/readable-camera-floor` → main | M0：桌面镜头最小缩放、等待卡片渲染再取景 |
| 4 | octos-learn | [#114](https://github.com/octos-org/octos-learn/pull/114) | `claude/learner-studio` → main（含 #113） | M2–M4 + 两轮实测修复 + 录课页重设计。头：`030878dc` |
| 5 | octos-learn | [#115](https://github.com/octos-org/octos-learn/pull/115) | `claude/learner-m5` → `claude/learner-studio` | M5：看我的课、形象与声音、隐私、课程包；`scripts/teach-e2e/` 实测脚本。头：`e4e26442` |
| 5a | octos-learn | [#117](https://github.com/octos-org/octos-learn/pull/117) | `claude/learner-m6` → `claude/learner-m5` | M6：`services/learner-lessons`、我的课、播放页、保存到我的课、草稿同步、星图“讲过”外环、“小讲台”成就。头：`70f6616a` |
| 6 | learning-coach | [#37](https://github.com/alan0x/learning-coach/pull/37) | `claude/learner-teaching-actions` → main | 0.23.0：小章鱼提问、手写转公式、课程点评 |
| 7 | learning-coach | [#38](https://github.com/alan0x/learning-coach/pull/38) | `claude/learner-privacy-review` → #37 | 0.24.0：点评返回个人信息 `personal_details` |

计划文档在 octos-learn 的 `claude/learner-teaching-mode` 分支（本文也在这里），尚未开 PR；可以在合并 #114/#115 时一起合入，或单独开一个文档 PR。

**本机已安装** learning-coach 0.24.0（`~/.octos/profiles/yy/data/skills/learning-coach`，旧版本备份在 `~/.octos/backups/learning-coach-before-*`）。

## 3. 已决事项（产品方确认）

| 日期 | 决定 |
|---|---|
| 2026-10-30 | 目标市场为美国 K–12；孩子用虚拟形象和合成声音发布，不露脸、不用本人声音 |
| 2026-10-31 | 孩子可以讲任何主题，不限于星图已点亮的知识点；互动组件是一等工具 |
| 2026-10-31 | 录课时孩子可以擦除、隐藏、替换自己的笔迹（OLL 决策 0005–0008 已接受）；AI 不能改孩子的笔迹 |
| 2026-10-31 | 可读性：讲课过程中每张卡片结束时屏幕字号 ≥ 12.5 px，检查 1366×768 和 1920×1080 两种画板；课末总览不检查 |
| 2026-10-31 | 语音识别继续用火山引擎，用户自带 Key；美国英语（儿童语音）供应商以后再选（实施计划 P6） |
| 2026-10-31 | 批准 M4 最多 50 次真实模型测试调用；**截至本文已用 43 次**（M6 实测用了 6 次） |
| 2026-11-01 | 重录一张卡片：保留白板内容，只重录说的话和指点；另有“这张卡片从头来” |
| 2026-11-01 | 不做自由拖动排版，改为插入时“放在旁边…”；“检查这节课”和“请小章鱼看一遍”合并为“检查我的课” |
| 2026-11-01 | 录课页重设计稿已批准：https://claude.ai/artifact/FPVojc7DYWPFX3n6qXkzt3 （六个画面） |
| 2026-11-01 | 过两点的直线画在点所在的网格上，不再新建函数图卡片 |
| 2026-11-01 | M5：形象美术由产品方提供；课程包用独立的学习者课程包格式（不复用 `.ocpack`）；声音先从火山目录精选 |

工作方式（产品方要求）：每个仓库从最新 main 拉新分支；每个小任务一个提交；每个里程碑推送一次；何时开 PR 由开发方决定；PR 标题和描述用英文；不做临时绕过，只做真正的修复。

## 4. 代码地图

### 应用（octos-learn，`src/learning/teach/`）

| 文件 | 职责 |
|---|---|
| `teach-plan-page.tsx` | `/teach`：继续草稿、选主题、目标、卡片 |
| `teach-studio-page.tsx` | `/teach/:id` 录课页：顶部栏、卡片条、白板 + 工具坞、卡片面板（未录/录制中/录完/要改）、检查对话框、录音与实时字幕、整理、激光与笔迹标记 |
| `teach-board.tsx` | 录课白板：OLL 白板 + 笔迹运行时；选取/剪切笔迹、指针、点中笔画、取景 |
| `studio-add.tsx` | “放入”面板与“放在旁边…” |
| `recording.ts` / `recording-store.ts` | 录课数据模型（卡片、录制、事件、笔迹、整理结果、检查结果、形象与声音）与本机草稿存储 |
| `compile-recording.ts` | 录课 → OLL `learner_taught` 课程（确定性；保证不引用之后才出现的内容） |
| `board-rows.ts` / `teaching-board-setup.ts` | 每张卡片一个排版分区；当前行里可“放在旁边”的卡片 |
| `take-speech.ts` / `mic-status.tsx` | 每句话录完就转写；麦克风音量与状态 |
| `teach-assist.ts` / `assist-panels.tsx` | 小章鱼提问、手写转公式、课程点评（learning-coach 动作） |
| `readability-check.ts` / `lesson-check.ts` / `check-dialog.tsx` | 检查我的课：两种屏幕可读性 + 小章鱼点评 + 隐私，合成每张卡片要改的地方 |
| `privacy.ts` | 个人信息规则（中英文）与测试集 |
| `presenters.ts` | 形象与声音目录；形象图放 `public/teach-avatars/<id>.png` |
| `teach-watch-page.tsx` | `/teach/:id/watch` 看我的课；选形象和声音；准备分享；从课程包播放 |
| `learner-package.ts` / `make-learner-package.ts` / `learner-package-store.ts` | 课程包格式（`.olesson`）、生成（预生成旁白）、本机存储 |
| `ink-snapshot-store.ts` | 冻结笔迹快照与选区 |
| `learner-lessons-api.ts` | “我的课”服务的客户端：列表、草稿、保存课程包、下载、导出、删除 |
| `draft-sync.ts` | 本机草稿与账号草稿同步（各记上次一致的版本号；两边都改时新的胜出；账号上删了本机跟着删） |
| `teach-lessons-page.tsx` | `/teach/lessons` 我的课：已保存的课和草稿，播放、接着改、导出、下载课程包、删除 |
| `teach-lesson-player-page.tsx` | `/teach/lessons/:id/play` 播放已保存的课：只用课程包，暂停可操作组件，课后“轮到你了”练习 |

服务端（`services/`）：

| 文件 | 职责 |
|---|---|
| `learner-lessons/store.mjs` | 课程存储与状态机（`TRANSITIONS`：保存/批准/发布/撤回，带操作日志）；草稿版本号；删除；导出；把保存的课记到学习记录（`reconcileHistory`） |
| `learner-lessons/package-check.mjs`、`zip.mjs` | 服务端校验课程包：严格的 zip 读取、清单、每个文件的 SHA-256、内容哈希、只允许课程/笔迹/旁白三类文件 |
| `learner-lessons/server.mjs` | `/api/learn/lessons` 接口；身份每次向 Octos 确认 |
| `product-server.mjs` | 学习记录和我的课共用同一个学习记录库 |
| `learning-history/event-contract.mjs` | 新事件 `lesson_taught`（只能由我的课服务写入，`/events` 拒收） |
| `learning-history/map-progress.mjs` | 星图返回 `taught` |
| `learning-history/achievement-catalog.mjs`、`achievements.mjs` | “小讲台”分类 6 个成就 |

其他相关：`src/api/cloud-asr.ts`（加载用户服务后再判断识别是否可用；英语固定 `en-US`）、`src/byok/providers.ts`、`src/home/voice/use-voice-capture.ts`（`stop({ submitSpeech: true })` 保留按停止时还在说的话）、`src/learning/oll/oll-lesson-runtime.tsx`（`LearningWhiteboard` 新增 `resolveAsset`）。

### OLL（octos-lesson-language）

决策 0005–0008、`docs/LEARNER-TAUGHT-V1-FINDINGS.md`、AUTHORING §10、SPEC §9.10–9.11；样例 `learner-taught-slope-v2` 等；浏览器检查 `npm run check:learner-ink-browser`。

### learning-coach

`src/learner-teaching.ts`：`oll_teach_octo_question`、`oll_teach_ink_to_math`、`oll_teach_review`（含 `personal_details`，只保留孩子原话里出现的内容）；`test/learner-teaching.test.mjs`。

## 5. 本地运行与验证

- **Node**：用 Node 22：`export PATH=/opt/homebrew/opt/node@22/bin:$PATH`。
- **前端开发服务器**（实测脚本假设 5217 端口）：在 octos-learn 下 `./node_modules/.bin/vite --host 127.0.0.1 --port 5217 --strictPort --force`。改了 OLL 固定提交后要先 `pnpm install`，并带 `--force` 重启（否则会继续用旧的 OLL 构建）。也可按 `docs/DEVELOPMENT_HANDOFF.md` 用 `pnpm dev:https`。
- **登录**：打开 `/login`，点 “Continue without a password”（solo 模式）。
- **Octos**：`./target/release/octos serve --host 127.0.0.1 --port 50080 --solo`（在 octos 仓库下）。**安装或更新技能后必须重启 Octos**：profile 的技能动作只在启动时加载，否则会报 “skill action … is not available in this session”。技能安装步骤见 `docs/DEVELOPMENT_HANDOFF.md`。
- **用户服务**：语音识别和语音合成用 Settings → API Keys 里保存的火山 Key；模型用 profile 的模型配置（当前 Gemini）。
- **单元测试**：`./node_modules/.bin/vitest run`（当前 1536 个通过）、`tsc -b --noEmit`、`eslint`、`node scripts/check-i18n.mjs`。注意 i18n 检查只比较中英两个文件是否成对，**发现不了漏翻的新字符串**；新增 `tr("…")` 后要自己确认 `en.json` 里有。
- **真实浏览器实测脚本**（`scripts/teach-e2e/`，在 #115 分支）：先 `scripts/teach-e2e/make-speech.sh <工作目录>` 生成假麦克风音频，再 `node scripts/teach-e2e/<脚本> <工作目录>`。会调用真实模型（每张录完的卡片 1 次提问、每次检查 1 次点评、每次整理 1 次）和用户的火山 Key。

| 脚本 | 检查什么 |
|---|---|
| `studio-flow.cjs` | 新录课页全流程、“放在旁边…”、检查我的课、去改卡片，并截图 |
| `neat-before-speech.cjs` | 先整理后说话再停止（曾导致崩溃）、激光点笔画、麦克风状态、继续草稿 |
| `watch.cjs` | 录两张卡片后“看我的课”，逐张旁白和字幕 |
| `privacy.cjs` | 小章鱼找出规则抓不到的名字；改话后清除 |
| `package-offline.cjs` | 检查 → 保存到我的课 → 下载 → **断网播放零请求** |
| `my-lessons.cjs` | M6：保存到我的课 → 颁奖 → 我的课 → 播放页（**播放时零请求、零技能调用**）→ 星图“讲过” → 成就 → 删除后课、学习记录和成就都撤掉 |

脚本默认 `http://127.0.0.1:5217`，可用 `TEACH_E2E_BASE` 指定。M6 实测时开发服务器用了临时学习记录库（`OCTOS_LEARN_HISTORY_DB=<临时目录>/history.sqlite`，我的课的库放在同一目录），以免写入本机真实学习记录。

## 6. 已知问题与限制

- **美国英语声音**：火山目录没有美式英语原生或儿童音色；识别对英语短片段曾误转成中文，已通过固定 `en-US` 解决，但儿童英语识别质量未评估（P6）。
- **形象美术未到位**：六个形象位置显示占位图（Octo 和“形象 2–6”），等产品方提供图片和名字。
- **手写里的个人信息不检查**：隐私检查只看说的话和标题；孩子手写的名字不会被发现。
- **录课页里不能改卡片标题和主题**：标题里有个人信息时，“准备分享”会拦住，但需要回到规划才能改（规划页目前不能改已有草稿的标题）。
- **未做**：数轴、图形、表格组件；从笔迹“变成一个点”；“播放这张卡片”；修改画面里给要改的白板内容描边（小章鱼点评不指出具体内容）。
- **星图主题搜索**：英文星图目录里没有叫 “slope” 的知识点（最接近的是 “Linear Function Graphs”），孩子输入 slope 时没有星图建议，只能当自由主题讲。
- **观看者的播放记录**：播放页不写学习记录（第一阶段只有自己看）。
- **删除后的笔迹快照**：删除一节课不会清理本机共用的笔迹快照存储。
- **未实测**：重设计后的录课页还没有产品方实测；中文界面近期未完整走一遍；Android/APK 未测；“轮到你了”练习在“看我的课”里的课后练习未专门验证。
- OLL 的 `scripts/check-ai-ink-browser.mjs` 里“手势选区可直接拖动”一步用系统 Chrome 时本来就失败（与本工作无关，改动前后一致）。
- 火山识别偶尔在句间不加空格（“2and”），孩子可在字幕里改。

## 7. 剩余工作

**近期（合并前后）**
1. 产品方端到端实测重设计后的录课页、看我的课、隐私和课程包；按实测结果修。
2. 审查并按顺序合并 7 个 PR；合并 OLL #27 后更新应用里的 OLL 固定提交；正式环境安装 learning-coach 0.24.0。
3. 形象美术（产品方）；美国英语语音供应商选型（P6），之后更新声音目录和识别。

**M6 已完成（2026-11-02，PR #117）**。剩下的第一阶段验收：在目标设备（触屏 Chromebook / iPad）上完成 Jordan 与 Riley 两堂课的全流程；把 `scripts/teach-e2e/` 做成正式的 Playwright 测试；虚拟形象动画（另一位 agent 在做）接到播放页。

**M7 账号、同意与班级/家庭分享（第二阶段）**：年龄段与 COPPA 家长同意、家长账号、老师与班级、分享范围（私有/家庭/班级）、批准队列、只有预设反应、FERPA；开工前需要法律顾问（P4）。

**M8 公开社区**：需单独决定是否做；前置法律审核、审核人员与运营、费用评估。

**M9 K–2 图卡模式**：第一阶段之后；前置确认有足够 K–2 数学内容。

**录课功能的待补项**：数轴/图形/表格；从笔迹变成点；播放单张卡片；在录课页改标题；手写内容的隐私检查；修改画面中定位要改的白板内容。

## 8. 接手时的注意事项

- 改 OLL 后：在 OLL 仓库 `npm test`、`npm run typecheck`、`npm run check:learner-ink-browser`（可设 `OLL_CHROME_PATH` 指向系统 Chrome），推送后把应用里的固定提交改成新提交并 `pnpm install`。
- 改 learning-coach 后：`npm test`、`npm run build`，按交接文档安装到 profile，**重启 Octos**。
- 录课页的单元测试把 `TeachBoard` 换成了假白板；白板本身的行为（笔迹、指针、取景）靠 OLL 浏览器检查和 `scripts/teach-e2e/` 实测覆盖。
- jsdom 的 `Blob` 没有 `arrayBuffer()`，测试里用 `FileReader` 读。
- 每个仓库都有大量“测试中的预期报错输出”（vitest 里会打印堆栈），以 `Test Files … passed` 为准。
