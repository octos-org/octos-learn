# 学生讲师虚拟形象：当前交接

更新：2026-11-04。**当前质量线交付入口为[星狐完整样板](LEARNER_AVATAR_STAR_FOX_2D_SAMPLE.md)**，工作区 `/Users/yy/Documents/projects/OctosLearn/octos-learn-avatar-local-rig`、分支 `codex/avatar-local-rig`；回退基线 `dc3ac1b6`。双耳、三组主要发束、偶发自然动作、高清口腔及独立口型已实现，原 5173 预览默认启用新版星狐。六项执行门槛与证据见[持续清单](LEARNER_AVATAR_STAR_FOX_TODO.md)。当前交付提交用 `git log -1` 查询。

全量 206 文件 / 1725 项单元测试通过，最后 UI 回归 24 项、构建与原生绘制检查通过；没有新的真人摄像头、浏览器或设备验收。可见耳接缝的有效处理由用户表示比之前明显改善，完整样板尚待用户评价。正式课包、其他三角色和 PR #119 仍由整体推进线维护；本轮没有合并、部署或改动其工作区。

以下为接入主线截至 `e20c489e` 的历史交接记录，其中“未提交”“只做一耳/一束”“最新测试”等状态不能覆盖上面的当前交付。

## 历史接入记录

更新日期：2026-11-03。仓库 `octos-org/octos-learn`，本机 `/Users/yy/Documents/projects/OctosLearn/octos-learn`。本文件已按当前状态重整，阶段文档保留历史过程，不再把多轮相互覆盖的“最新方向”并列为现状。

## 1. 接手先看这六点

1. **当前路线是细腻插画风 2D 学生头像**：MediaPipe Face Landmarker → 表情/头姿参数 → 平滑与校准 → Canvas 2D 局部纹理与网格绘制。不是 Live2D Cubism、完整 3D、真人卡通化或逐帧生成式推理。
2. **预览页已有四款独立角色**：星狐、小熊猫、白兔、月猫（用户要求新增的女性角色）。小熊猫不等于浣熊。四款均有自己的画稿和面部拟合，支持选角、摄像头、手动表情、动作回放与配音嘴型排练。
3. **2026-11-03 第三轮（用户试用后）**：耳朵随头部滞后跟随（无回弹）、转头侧耳朵变窄外张、头发惯性、张嘴下唇改为光滑抗锯齿弧线，见[耳发随头动与张嘴线条](LEARNER_AVATAR_HEAD_FOLLOW_MOUTH.md)。以下第 3 条是上一轮状态。
   上一轮：**最新耳动代码已实现，并随本交接一并提交**：独立转向 → 保持 → 回正，小角度耳廓平面投影；发梢单独保留有限惯性。上一轮耳部正弦甩动/弹簧回弹已被用户否定，不要恢复。细节见[当前耳动实现](LEARNER_AVATAR_EAR_ORIENTATION.md)。
4. **用户认可过完整耳朵/眉眼修正后的星狐**，随后要求扩展角色；后来否定四款第一轮耳动自然度。最新耳廓转向版本已交付程序输出，**尚未收到用户对最新自然度的认可**。代码/像素测试通过不能代替这个判断。
5. **本交接所在提交包含完整最新耳动**，位于 `18299841` 之后；接手时拉取 `origin/codex/avatar-capture-prototype` 并核对 `git log -1`，不要停留在四角色首次提交。用户已要求提交并推送，暂不开 PR、合入 main 或部署。
7. **2026-11-03 第四轮（接入）**：用户表示耳朵/头发仍不够自然，改由其他 agent 继续迭代（本 agent 不再改 `painted-secondary-motion.ts`），本线转向接入。录课时可选“用摄像头带动我的形象”，表情和转头按最终配音重新对齐进课包，三个播放页与配音嘴型合成，见[录课摄像头动作接入课程](LEARNER_AVATAR_CAMERA_PERFORMANCE.md)。
6. **正式课程接入（2026-11-03 第二轮）**：带嘴型 v2 包已能保存到“我的课”（服务端完整校验）；`presenters.ts` 目录已换成四角色；“看我的课”、下载课包播放、“我的课”播放页都用课程自己的二维角色并跟随包内最终配音嘴型。**仍未完成**：摄像头表演（眉眼/头动）与录课 Take 的绑定和按最终配音的时间重映射；正式播放中的耳发自然动作（等待用户认可，目前关闭）；浏览器/设备实测。用户没有要求现在操作设备，不要把浏览器设置/开摄像头变成继续工作的前提。

## 2. 用户目标、约束与已否定方向

孩子在平板/电脑数字白板讲课，使用虚拟形象和合成声音，避免在作品里暴露真人画面/原声。后续目标包括项目原有安卓触摸大屏；用户有可用于未来测试的 iPhone/iPad。当前头像范围以面部和头动为主，手臂暂缓。

- 美术保持细腻毛发、琥珀/青蓝眼、学院服和完整耳朵；自然姿态头正、肩平。用户已否定简化卡通、此前粗糙 3D、歪头原画直接驱动及可见头/身体/手臂拼接。
- 内部可以使用局部底画、口腔和遮罩，但不要把效果描述为任意单张 PNG 无需准备就可自动绑定。
- 耳朵应有方向和停留感；不可用“位移更大、像素变化更多”当作动物自然度。真实行为依据与不确定性见[调研](LEARNER_AVATAR_ANIMAL_EAR_RESEARCH.md)。
- 用户不接受反复道歉、空承诺、无必要确认、等待其说“继续”、谎称后台仍在工作。已授权且可独立完成的工作应连续推进，只有真实依赖才询问。
- 捕捉在本地运行，头像页不请求麦克风、不上传摄像头帧；课程 TTS/模型继续本人 BYOK。不要把“只存参数”解释成整个课程隐私已完成审核。
- 另一个 agent 研究手势写白板是独立任务，不意味着本头像页恢复手臂。其[可转发 prompt](LEARNER_GESTURE_WHITEBOARD_RESEARCH_PROMPT.md)要求独立分支/worktree；不要改其工作或把其未验证结果计为本轮结果。
- 用户最新要求提交并推送当前工作，然后提供接手 prompt；暂不开 PR。没有新增部署/合并/真实付费模型或语音调用授权。

## 3. Git：交接检查点

| 引用 | 实际状态 |
|---|---|
| 工作分支 | `codex/avatar-capture-prototype` |
| `d89ebae1` | 四角色进入正式形象目录；看我的课/下载课包播放/我的课播放页改用二维角色与包内嘴型 |
| `6aefa3a0` | “我的课”服务端接受并严格校验 v2 嘴型课包；超过 32 MiB 明确提示 |
| 本交接所在提交 | `feat(avatar): refine animal ear orientation and handoff`，包含最新耳发源码、测试、脚本、媒体及交接；接手时核对远端分支实际 HEAD |
| `18299841` | 四角色素材、独立面部绑定、同页切换，前一已推送检查点 |
| `af2b1f08` | 完整耳朵、眉眼联动等星狐确认版与此前研究记录，已推送 |
| `51acb03f` | 较早的张嘴响应与头部边缘修复，已包含在后续分支 |
| `748c6d23` | 将 M0–M6 的 main 合入头像分支 |
| 本地 `main` | `619960e5`，含 M0–M6；本次文档更新未 fetch，不称其为 GitHub 最新 main |
| 远端 | `git@github.com:octos-org/octos-learn.git` |

**本次交接提交完整包含 `18299841` 之后的耳发工作。** 范围为：

- `painted-fox.ts`、`painted-characters.ts`、`illustrated-avatar-stage.tsx`：接入分角色耳动、独立头发随动、静止动画调度与自然时钟。
- `avatar-lab-page.tsx`、`avatar-lab.css`、中英消息：自然动作默认开关、回放/定格冻结策略。
- 对应舞台/页面/绘制器测试，`scripts/avatar-characters-validate.ts` 的静止基线范围修正。
- **新增必需源码**：`src/learning/avatar/painted-secondary-motion.ts`、`painted-secondary-motion.test.ts`、`scripts/avatar-secondary-validate.ts`。
- **新增文档/证据**：`LEARNER_AVATAR_SECONDARY_MOTION.md`、`LEARNER_AVATAR_ANIMAL_EAR_RESEARCH.md`、`LEARNER_AVATAR_EAR_ORIENTATION.md`，以及 `docs/avatar-animation-phase-a/{secondary-motion,ear-orientation-v2}/`。
- 主交接、四角色说明、文档索引同步更新。接手时用 `git status --short` 检查是否又有其他人的修改。

源码、文档与媒体均纳入同一交接提交，无需依赖此前本机未跟踪文件。若接手时出现新的工作区修改，保留它们，不执行 `git clean` 或丢弃其他 agent 的工作；先核对提交与文件归属。

历史 main 整合保留了 M6 的 `/teach/lessons`、账号保存、草稿同步、成就刷新和失效任务取消，同时保留头像分支的权威音频时钟/嘴型扩展。`teach-watch-save.test.tsx` 的迟到任务与保存顺序回归不得删除。OLL 固定引用来自该次合并；不要顺手升级依赖或其他仓库。

## 4. 本地运行与入口

| 入口 | 当前行为 |
|---|---|
| `/teach/avatar-2d` / `/teach/avatar-lab` | 四角色主试验室，摄像头/手动表情/动作轨/白板/片段库/配音排练 |
| `/teach/avatar-2d/example` | 旧示例页面，共享绘画舞台，默认星狐 |
| `/teach/package` | 本地课程包查看/逐卡试听；不是 M6 账号播放页 |
| `/teach/:id/watch` | 看我的课；选形象（四角色）；课包有嘴型时可显示该角色的二维动态小窗 |
| `/teach/lessons` | M6 账号课程/草稿 |
| `/teach/lessons/:id/play` | M6 正式课程播放；课包有嘴型时右侧显示课程角色并跟随配音，否则显示角色头像 |

正常环境必须沿用 HTTPS `https://127.0.0.1:5173`、Octos `127.0.0.1:50080`、本人既有 `~/.octos` 账号/配置/技能。本次更新时实际监听进程为前端 Node PID `83679`、后端 Octos PID `88231`；这只是当时本机状态，新会话应重新检查，不能从文档断言进程仍活着。不要另开临时端口、账号、数据目录或只支持部分功能的人工验收环境。

Node 22 路径为 `/opt/homebrew/opt/node@22/bin`，pnpm 11.5.2。产品依赖已经安装，本轮仅写文档无需重新安装/重启。确需重建环境时：

```sh
export PATH=/opt/homebrew/opt/node@22/bin:$PATH
pnpm install --frozen-lockfile
pnpm dev:https --host 127.0.0.1 --port 5173 --strictPort
```

正常安装不要跳过 Git 包的 prepare；过去 `--ignore-scripts` 曾造成 OLL 导出未构建。开发/构建前置脚本会准备头像模型/WASM/经典 Worker，不要手改生成目录代替源码。

## 5. 四角色素材与坐标

| ID / 显示名 | 资源 | 说明 |
|---|---|---|
| `star-fox` / 星狐 | `public/teach-avatars/star-fox/painted-v0.2/` 与 `painted-v0.3/portrait-extended.png` | 原 512px 面部素材保留；v0.3 补全耳尖，完整画面 704px |
| `red-panda` / 小熊猫 | `public/teach-avatars/red-panda/painted-v0.1/` | 栗红发、黑/酒红学院服；保留白色眉部毛色，不能把它当眉线抹掉 |
| `white-rabbit` / 白兔 | `public/teach-avatars/white-rabbit/painted-v0.1/` | 白发长耳、红色蝴蝶结/学院服 |
| `moon-cat` / 月猫 | `public/teach-avatars/moon-cat/painted-v0.1/` | 新增女性猫族角色，银紫发、青蓝眼、紫色月纹学院服 |

新三款每个目录有 `portrait.png`（704×704）、`source.png`/`clean.png`（512×512）、`asset-info.json`；小熊猫/白兔的原概念稿另存 `concept-original.png`。提示词、内置 imagegen 来源、准备方法、哈希均在各目录元数据；产品不依赖 `~/.codex/generated_images`。三款共用星狐口腔内部素材，但眼/眉/嘴曲线独立拟合。

`PAINTED_FOX_VIEW={size:704,x:96,y:192,frame:736}`。原面部坐标在完整画面的偏移为 `(96,192)`；输出 736px 定格时边距 16，故到输出坐标加 `(112,208)`。绘制器先在 512px 上操作面部，再将 `(128,128,272,210)` 区域放回完整立绘，最终统一变形。网格为 **22×22、覆盖整个 704px 画面**，不是旧 14×14/512px。

完整插画、局部底画、口腔共同构成素材准备。替换人物需要重新拟合，不能只换 URL。旧 512px 固定坐标导出脚本不适用于当前布局。

## 6. 当前实现与关键代码

### 捕捉与参数

`face-capture.ts` 拥有摄像头流、Worker 和提交节奏；点击后才启动，`audio:false`，理想 640×480/30FPS，约 20Hz 提交帧且只允许一帧在处理。隐藏/停止/卸载和迟到权限释放资源。`face-capture.worker.ts` 使用 `@mediapipe/tasks-vision@0.10.32`、CPU delegate、VIDEO、单人脸；当前页不启用可选身体/手部捕捉。

`face-frame.ts` 的 `FaceFrame` 包含时间、来源、tracked、按名通道和弧度 `[pitch,yaw,roll]`。`FaceSmoother` 提供自然校准、失跟归位和分通道平滑：其他/头动约 65ms、嘴型 22ms、闭眼上升 12ms、睁开 50ms、失跟 180ms。不要把快速闭眼重新统一平滑到 65ms。

`paintedBlinkAmount` 只给 MediaPipe 做 0.06–0.80 的闭眼行程映射；张颌增益 1.6、皱眉增益 1.6、视线增益 1.5，手动/ARKit 保持直接控制。这些是角色拟合参数，不是儿童捕捉准确率承诺。

`scripts/prepare-avatar-assets.mjs` 生成 `public/avatar-runtime/`；人脸模型源在 `public/models/avatar-face/`，SHA-256 `64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff`。Worker 是经典 IIFE，不要直接换成不能使用 `importScripts` 的模块 Worker。

### 绘制、表情与耳发

| 文件 | 接手重点 |
|---|---|
| `painted-characters.ts` | 四角色目录、资源、独立眼/眉/口拟合、耳形与时序 |
| `painted-fox.ts` | 名称保留历史；是四款共用绘制器，眉口残差、口腔双三次采样、完整头部网格 |
| `painted-eyes.ts` | 角色可配置双眼、连续眼皮、视线移动、笑眼与皱眉眼形 |
| `painted-secondary-motion.ts` | 当前二级动作模块；耳廓主动朝向与独立头发随动 |
| `illustrated-avatar-stage.tsx` | 五项资源加载、按角色建绘制器、30/60 上限、自然时钟、隐藏/释放和错误状态 |
| `avatar-lab-page.tsx` / `.css` | idle/demo/camera/manual/replay，四款选择、自然动作开关、表情滑杆、录制与白板 |
| `avatar-audio-preview.tsx` | 所选角色同步到配音排练，保留已导入音频与进度 |

眉毛/眼皮区域重叠：眉毛必须只叠加像素差，整块写回会覆盖眼皮的皱眉变化。小熊猫窄眼必须保留羽化区的额外纹理余量，避免开始眨眼时跳变。嘴部仍是基础口腔/唇线变化，不是音素级口型。

最新耳动由 `paintedEarLook` 的单调转向/平台保持/单调归位驱动；`paintedEarProjection` 对耳廓内部使用同一局部平面投影，改变内耳纹理与轮廓的投影宽度，接合处做过渡。**耳部没有弹簧反弹**；只有发梢使用减弱的阻尼积分。耳部头姿响应时间约 65ms，发梢积分步长最大 1/120s、阻尼 0.72、角频率 12。角色的 `looks` 时长是人工动画参数，不能称动物行为统计。

| 角色 | 左耳开始 / 转向 / 保持 / 回正（秒） | 循环周期（秒） |
|---|---|---|
| 星狐 | 1.2 / 0.22 / 1.1 / 0.65 | 16 |
| 小熊猫 | 2 / 0.3 / 0.75 / 0.5 | 18 |
| 白兔 | 3.2 / 0.5 / 1.6 / 0.85 | 20 |
| 月猫 | 1.8 / 0.14 / 0.9 / 0.35 | 17 |

右耳独立事件见配置。自然动作默认开启，即使没有摄像头也维持渲染；定格/回放模式关闭额外自然动作，暂停后保持。取消勾选只关自然装饰，头动随动仍有效。隐藏页面停止调度。角色/开关重新启用时自然时钟从零开始。

耳廓仍是**正面纹理的小角度二维近似**：没有侧/背耳原画，没有真正背面毛色、厚度和完整遮挡；不能称真实 3D 耳廓重建。当前输出已给用户，尚未获得新的视觉确认。

### 动作、音频与课包

`performance-track.ts` 支持 `octos.avatar-performance.v1` 和带身体的 v2，最多 60s/3601 帧；`performance-store.ts`/片段库按 profile 隔离 IndexedDB 元数据与动作。**当前轨道不保存选角 ID、自然耳动或发梢积分历史，也没绑定录课 Take。** 同一轨道可换角色重放，但不等于已能逐像素导出整段表演。

积分用 `FaceFrame.timeMs`：重复时间冻结，倒退或间隔超过 250ms 重置。自然动作是绘制时间函数；完整连续播放、不同采样率和跳转后的物理细节不保证逐像素一致。精确导出需固定时间步长重算或另存二级动作轨，尚未实现。

`lip-sync.ts`/`prepare-preview-audio.ts` 从最终音频计算 `envelope-v1` 基础张颌轨，绑定音频 SHA-256、时长和文本。接口能读取 `aligned-visemes-v1` 不代表已有生产者。试听解码限制为单段 ≤60s、≤10MB、≤双声道。保持权威媒体时钟、暂停/定位、结束闭口、错配拒绝和取消资源释放，不另起播放器猜同步。

`learner-package.ts`/`make-learner-package.ts` 支持普通 v1 和可选嘴型 v2。**原摄像头说话节奏和最终 TTS 不同**，不能直接照搬原嘴部动作；非嘴表情对卡片/最终音频的时间重映射仍需设计。

### 正式目录与播放（2026-11-03 第二轮）

- `presenters.ts`：`PRESENTER_AVATARS` 为 `star-fox`/`red-panda`/`white-rabbit`/`moon-cat`，ID 同时是二维舞台角色 ID 和课程 `avatar:` 引用；默认 `star-fox`。旧占位 `octo`、`avatar-2…6` 从未有画稿，旧课按默认角色显示（`presenterOfReference`）。头像缩略图直接用各角色完整立绘裁到脸部；`presenters.test.ts` 保证与 `painted-characters.ts` 的立绘一致且文件存在。`presenters.ts` 不导入绘制器，避免把画布代码带进录课页首包。
- `lesson-avatar-preview.tsx`：改用 `IllustratedAvatarStage`，按课包 `author.avatar_ref` 画角色；嘴型仍只读包内最终音频轨，时钟只用当前卡片、当前课包的媒体时钟（`onMediaClock`），暂停/无时钟/别的卡片一律闭嘴。`mode="player"` 去掉作者向说明。**正式播放不开耳发自然动作**（`idleMotion` 未传），等用户认可耳动后再打开。
- 三处使用：看我的课（`teach-watch-page.tsx`）、下载课包播放（`learner-package-viewer.tsx`）、我的课播放页（`teach-lesson-player-page.tsx`，课包含嘴型时用 `teach-watch-layout` 右侧显示，没有时保留静态头像）。旧三维 `AvatarStage` 只剩试验室历史用途。

### “我的课”保存 v2（2026-11-03 第二轮）

`services/learner-lessons/package-check.mjs` 与客户端读取规则一致：v1/v2 两种 schema；v2 必须且只能声明 `avatar-lip-sync-v1`，每张有配音的卡片一个 `mouth/<n>.json`；嘴型条目的音频哈希/文字哈希必须等于对应旁白；轨道本身逐项校验（schema、时长 ±50 ms 且 ≤60 s、方法、≤6001 个严格递增关键帧、首 0 尾等于时长、仅嘴/颌/舌通道且权重 [0,1]）。另外检查：每个文件按角色恰好被引用一次；旁白可为 mp3/wav/ogg/m4a 且扩展名与类型一致；清单不允许未知字段（防止夹带个人信息）；清单作者与课程内作者一致；清单旁白与课程内每张卡片的文字一致。服务端嘴型通道表 `MOUTH_CHANNELS` 与 `lip-sync.ts` 由测试保持一致。

限额：账号保存上限仍是 32 MiB（nginx 33 MiB），客户端构建上限 100 MB 只用于本机/下载。超过 32 MiB 时客户端不上传，直接提示（服务端 413 也给同样提示，不再显示“连不上”）。

回归：`learner-package.test.ts` 用客户端真实构建的 v1/v2 包与 `calibration-mouth-course.olesson` 验证服务端接受，并验证改文字/换音频后被拒；`store.test.mjs` 覆盖 v2 的各类篡改；`server.test.mjs` 覆盖 v2 经 HTTP 保存与逐字节下载、伪造嘴型 422。

## 7. 未完成事项与下一步

### 先评估当前耳动效果

第三轮已处理“看不出来”和“不随头动”：见[耳发随头动与张嘴线条](LEARNER_AVATAR_HEAD_FOLLOW_MOUTH.md)。仍无侧/背耳素材。

2026-11-03 第二轮接手时的观察：`ear-orientation-v2/idle-poses.jpg` 中“单耳转向/保持”与“自然”在正常尺寸下几乎看不出差别；近景 `fox-ear-detail.jpg` 也只有轻微变化。也就是说当前耳动不是“不自然”，而是“基本看不出来”。只在正面纹理上加大拉伸已被否定，要让转耳可读就需要对齐的侧/背耳分层素材（每角色每耳），这是需要用户决定的素材方向，本轮没有改耳动代码。

先确认已取得本次交接提交，阅读当前实际动画与用户反馈，再调整自然度。不自动更换路线、重画所有角色或恢复旧弹簧。若仍需明显后转/压耳，应准备对齐的侧/背耳素材或受控局部结构，保持已认可脸部；不能只增大正面纹理拉伸。

### 正式产品接入缺口（本次再次只读确认）

1. ~~P0：嘴型 v2 包保存到账号~~ —— 已完成（`6aefa3a0`），见第 6 节。
2. ~~P1：正式舞台与目录~~ —— 已完成（`d89ebae1`），见第 6 节。仅单元测试与构建验证，**未做浏览器实测**。
3. **P1：正式表演数据** —— 第四轮已接入表情/转头（见[录课摄像头动作接入课程](LEARNER_AVATAR_CAMERA_PERFORMANCE.md)）；选角已在课程 `avatar_ref`；耳发装饰动作仍不入包、播放时关闭。以下为原始描述： 若用户要求录制最终耳动/头发/选角，先明确时间轴与课包格式；当前没有这些数据的正式保存/重建约定。
4. **P2：设备。** iPhone/iPad、安卓触摸大屏、持续运行的功耗/热量/相机延迟未验收。30/60 是目标、20Hz 是提交调度，不是端到端实测值。不要无必要要求用户现在测试。

### 研究线是参考，不替换当前工作

用户曾要求双线研究 Snap Cartoon 3D Style；之后明确优先现有星狐并扩展角色。DCT-Net 已在本机跑通静态输出、ONNX 转换和 Node 单线程网页 WASM 计算，288px WASM 单帧约 0.4s，不满足本项目网页实时目标；没有浏览器/WebGPU/电视/连续真人输入验收，而且保留真人特征，不等于匿名固定角色。见[双线实测](LEARNER_AVATAR_TWO_TRACK_PROGRESS.md)。当前没有商业 SDK 接入或新研究模型默认运行。

旧 `avatar-stage.tsx`/sculpt-v0.1、简化 `illustrated-fox.ts`、倾斜原图 `original-fox.ts`、被否定的身体拼接 `puppet-fox.ts` 保留作历史/兼容。LivePortrait 人像版/动物版离线实测曾失败，未接入；不要把调研到的产品当成已采用。iOS ARKit 工程在 `native/avatar-capture-ios/`，格式/工程检查不等于 Face ID 真机效果或手机驱动电视传输已完成。

## 8. 验证、媒体与复现

**第二轮（接入）**：全量 vitest 201 文件 / 1696 项通过；`pnpm test:history` 107 项通过；`tsc -b`、`pnpm build`、改动文件 ESLint、i18n（2848 对）通过。均为自动化，未做浏览器、真人摄像头或设备验证。

**上一轮（耳动）：7 个文件、60 项相关测试通过**；TypeScript、`pnpm build`、修改文件 ESLint、84 UI 文件/2852 对中英消息、`git diff --check` 通过。不是最新全量仓库测试。构建有既有 CSS 属性/大包提示，本轮没有发布。提交前再次以 Node 22.23.3 运行上述 60 项，全部通过；默认 shell 的 Node 20.20.2 曾使配音测试出现跨环境 ArrayBuffer 的 crypto.digest 类型错误，切换到文档约定的 Node 22 后通过，未改动产品或测试来规避。

```sh
export PATH=/opt/homebrew/opt/node@22/bin:$PATH
node_modules/.bin/vitest run src/learning/avatar/painted-secondary-motion.test.ts src/learning/avatar/painted-fox.test.ts src/learning/avatar/illustrated-avatar-stage.test.tsx src/learning/avatar/avatar-lab-page.test.tsx src/learning/avatar/avatar-audio-preview.test.tsx src/learning/avatar/illustrated-avatar-page.test.tsx src/learning/avatar/face-frame.test.ts
node scripts/check-i18n.mjs
pnpm build
node_modules/.bin/vite-node scripts/avatar-secondary-validate.ts /private/tmp/octos-2d-preview
node_modules/.bin/vite-node scripts/avatar-characters-validate.ts /private/tmp/octos-2d-preview scratch/avatar-ear-orientation-regression
```

`/private/tmp/octos-2d-preview` 是本机素材工具依赖目录，含 `@napi-rs/canvas`、`gifenc`，不随分支提供；脚本参数可换成安装了这些依赖的工具目录。产品运行不依赖它，也不依赖忽略的 scratch。脚本用系统中文字体，跨平台可替换字体路径。不要将缺少素材导出环境说成产品无法启动。

| 证据/目录（相对 `docs/avatar-animation-phase-a/`） | 当前含义 |
|---|---|
| `ear-orientation-v2/fox-ear-closeup.gif`、`fox-ear-detail.jpg` | 最新星狐耳部近景；实际产品绘制器、模拟时钟 |
| `ear-orientation-v2/idle.gif` / `following.gif` | 最新四角色 12s 自然动作 / 7s 头动 |
| `ear-orientation-v2/report.json` | 四款保持期、眼鼻嘴检查区、下部衣服差异均 0；复位/重复一致、全不透明、极值网格面积为正 |
| `four-characters/` | 已推送的四角色首次输出；不是当前耳动 |
| `ears-expressions-v2/` | 用户认可过的星狐完整耳朵/眉眼阶段；不是最新动物耳动 |
| `secondary-motion/` | 后来被用户否定自然度的弹簧/正弦版本，保留历史，不能作为当前交付 |
| `painted-v0.1/`、`painted-v0.2/`、`real-input/` | 更早画稿和输入实验，指标不可外推当前角色/设备 |

当前原生像素/几何还验证：耳根固定、耳平面共线性/投影缩短、单耳独立、归位无反弹、发梢回落、静止表情保留、闭唇优先/嘴外保护、录制参数回读。星狐静止表情与 `af2b1f08` 差异为 0；旧头动故意已改变，不再要求旧耳动逐像素一致。**这些证据不代表动物动作已获用户认可、真实摄像头或设备性能通过。**

历史整合曾跑过 196 文件/1672 项全量测试，另一次新增保存测试 2 项、服务回归 104 项；都属旧 main 整合阶段，不是当前全量结果。旧画稿原生 MediaPipe Python 0.10.21 曾对 5 段公开本地视频做 966 次真实推理（666 视频、200 空白、100 恢复），不能当当前网页 0.10.32/WASM 或用户真人拍摄的结果。此前短时桌面浏览器 30FPS/p95 11ms 同样不可外推。

本轮构建/测试原始日志在临时目录，可能被清理；可交付的媒体/报告位于上述 docs。旧 `export-painted-fox.ts`、`avatar-expression-validate.ts`、`avatar-mouth-head-validate.ts` 的固定 512px 断言是历史入口；当前使用本节两个脚本，避免覆盖旧证据。

**2026-11-03 媒体清理（合并前）**：`docs/avatar-animation-phase-a/` 中被取代的 GIF/MP4/预览 HTML/大图共 77 个文件（含 `public/` 中无引用的 `star-fox/painted-v0.1/`、`concept-idle.png`、`concept-explaining.png`），约 124 MB，已从分支删除；保留了脚本输入（`facial-rig/materials/*.png`、`single-image/source.png`、`real-input/recorded-track.json`）、测试夹具 `calibration-mouth-course.olesson`、全部 JSON/代码/报告，以及 `head-follow-v1` 和用户认可阶段 `ears-expressions-v2` 的静态图。文档里指向已删媒体的链接改为“原文件见提交 `30a3e3d5`”。验证脚本仍可把媒体重新生成到默认输出目录（建议输出到 scratch，不再提交大 GIF）。PR：https://github.com/octos-org/octos-learn/pull/119（未合并）。**合并到 main 请用 squash**，否则这些大文件仍会随分支历史进入 main。

仍在 `public/` 的旧渲染器素材（约 11 MB：`sculpt-v0.1` 三维模型、`puppet-v0.1`、`original-v0.1`、`illustrated-v0.1`、`concept-thinking.png`）只被不可达的旧代码（`avatar-stage.tsx`、`star-fox-asset.ts`、`puppet-fox.ts`、`original-fox.ts` 的素材部分）或示例页引用；删除它们需要改代码并触及 `painted-fox.ts`/`painted-eyes.ts` 的类型导入，与耳发迭代的 agent 可能冲突，留作后续单独清理。

## 9. 浏览器与权限历史

前期曾报 `Local browser use is disabled in Work settings`，之后工具列表也未提供浏览器控制。用户表示没有改设置，根因未确认；不能据此指责用户关闭设置或声称确认产品 bug。打开页面面板不证明 agent 能点击网页。

用户后来明确取消继续浏览器验证。不要反复让用户改设置、开摄像头、重启或发“继续”，也不要未经要求改用另一套浏览器控制绕过。当前页面可供用户直接看，最新媒体是离线实际绘制；未进行新浏览器/真人摄像头/电视复验。只读端口/静态资源检查不等于浏览器验收。

## 10. 推荐阅读顺序

1. 本文：当前状态、提交范围、约束与产品衔接。
2. [最新耳廓转向](LEARNER_AVATAR_EAR_ORIENTATION.md)与[动物耳动调研](LEARNER_AVATAR_ANIMAL_EAR_RESEARCH.md)：当前实现、证据和侧背耳缺口。
3. [四角色](LEARNER_AVATAR_FOUR_CHARACTERS.md)、[星狐完整耳朵/表情](LEARNER_AVATAR_EARS_EXPRESSIONS.md)：素材提示词与独立拟合。
4. [M0–M6 产品交接](LEARNER_TEACHING_MODE_HANDOFF.md)、[音频同步](LEARNER_AVATAR_AUDIO_SYNC.md)：正式保存/播放与当前原型的边界。
5. [真实输入旧实验](LEARNER_AVATAR_REAL_INPUT_VALIDATION.md)、[LivePortrait 失败实测](LEARNER_AVATAR_SINGLE_IMAGE_VALIDATION.md)、[卡通化双线实测](LEARNER_AVATAR_TWO_TRACK_PROGRESS.md)：避免重复已否定方向或将历史实验误称当前结果。

可直接用于接手的简短指令：

> 在 octos-learn 的 codex/avatar-capture-prototype 工作区继续。先读 docs/LEARNER_AVATAR_HANDOFF.md 并核对 git status / git log；拉取最新头像分支，本交接提交已包含四角色耳廓转向代码、测试、脚本和媒体，不要停留在旧 18299841。按最新用户要求推进现有 2D，耳朵采用转向/保持/回正、发梢单独随动；不要恢复弹簧甩耳，也不要把测试通过当视觉认可。正式 M6 目录/2D 播放/v2 保存仍未接通。无需用户先操作设备，不擅自合并、部署或调用付费服务。
