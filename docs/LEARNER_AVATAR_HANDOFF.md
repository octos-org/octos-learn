# 学生讲师虚拟形象：完整交接

日期：2026-11-03。仓库 `octos-org/octos-learn`；交接分支 **`codex/avatar-capture-prototype`**。这是头像专项的接手入口；学生当老师 M0–M6 的产品交接另见 [Claude 的交接](LEARNER_TEACHING_MODE_HANDOFF.md)。

## 1. 接手后先知道的结论

1. **最新方向是细腻插画风的 2D 面部与头部跟随。** 苹果 Memoji 级 3D、此前简化卡通、独立头/躯干/手臂拼接均被用户否定。不要重新以这些旧方案为默认交付。
2. **当前画稿是 `painted-v0.2` 正面直立立绘**。上轮用户指出头一直歪着，已重新编辑完整画稿，摆正头/颈/肩/衣襟，并重新拟合眼口眉和头部支点。不是给旧倾斜图片再叠一个固定旋转。当前自然姿态预览见[实际程序输出](avatar-animation-phase-a/painted-v0.2/neutral.png)。**用户尚未确认新画稿满意。**
3. **目前是可运行的工程原型，尚非正式产品整体交付。** 互动试验室已使用新 2D 绘制器；正式看课里的动态预览仍引用旧三维舞台，“我的课”的新播放页仍是静态形象，服务端尚不接受带嘴型的 v2 课程包。不能因为测试通过就称 M6 与头像已经接通。
4. **用户已明确取消继续浏览器验证**：“不用你验证了……请改正”。不要再将浏览器设置、开摄像头、连接设备作为用户必须操作的事项。其最新请求是更新 main、详细交接、提交推送当前分支，**暂不开 PR**。
5. 本地 `main` 已快进到 **`619960e5`**（M0–M6 全部合并后的 main），并通过合并提交 **`748c6d23`** 整合进当前头像分支。正面姿态修改提交 **`82e070a0`**；没有把头像工作合入 main，没有部署。

## 2. 用户目标、范围和工作要求

孩子在平板/电脑数字白板上讲课，摄像头捕捉表情和动作，用虚拟形象与合成声音呈现。长期考虑安卓触摸大屏；用户有可用于未来测试的 iPhone/iPad（最好带 Face ID），当前不要求用户测试。最初提过手部，但用户随后明确 **手臂暂缓**，当前舞台不请求身体/手部捕捉。

- 美术：延续星狐概念图的细腻毛发、琥珀眼、深蓝星图服装；正面自然姿态。完整立绘内部可有局部底画与表情素材，不采用多块身体的可见拼接。
- 团队：只有用户和 agent，没有 3D/Live2D 专职美术。需要诚实说明手工绑定成本，不能声称任意单图已能自动高质量动画化。
- 技术效果：目前支持眨眼、基本开口/圆唇/微笑、抬眉及有限头动。无视线转动、头发物理、大角度侧脸或全身跟随。不再追求与苹果完全相同。
- 实时捕捉在设备本地进行，头像试验室不采集音频、不上传相机帧。课程合成语音仍遵守本人 BYOK；不能拿“头像只存参数”代替课程整体隐私审核。
- 用户非常反感重复道歉、空承诺、等待其说“继续”以及无必要的工具循环。能独立做的工作直接完成；只有真正依赖用户时才询问。进展只报事实，完成后直接交付，不谎称后台持续工作。
- 本次仅授权推送交接分支；不开 PR、不合入 main、不部署、不调用付费模型/语音做验收。M6 文档中历史真实模型预算不是头像接手 agent 自动获得的新调用授权。

## 3. Git 与 main 整合记录

| 引用 | 含义 |
|---|---|
| `origin` | `git@github.com:octos-org/octos-learn.git` |
| `main` / 本次获取的 `origin/main` | `619960e5`，含 #114、#115、#117、#116 等合并 |
| `82e070a0` | 正面 `painted-v0.2` 立绘、眼口眉重新绑定、姿态说明及预览 |
| `748c6d23` | 将上述 main 合入头像分支，保留 M6 与头像功能，附两项保存流程回归 |
| `2c3052ad` | 旧画稿的真实模型输入验证、快速眨眼修正 |
| `7f1076ca` | 绘画表情舞台接入捕捉/手动控制/录制回放 |
| `a6ac3a30` | 双眼连续性与独立闭眼修正 |
| `803eb8ba` | LivePortrait 单图评估，质量门槛未通过，未采用 |

本次显式处理五个冲突文件：`src/App.tsx`、中英消息 JSON、`teach-plan-page.tsx`、`teach-watch-page.tsx`。处理原则与结果：

- 保留 M6 `/teach/lessons`、`/teach/lessons/:id/play`，同时保留头像/课程包入口，均放在动态 `/teach/:id` 之前。
- 规划页同时保留“我的课”“体验动态头像”“播放课程包”。
- 中英消息取双方完整并集；同键没有值冲突，中英成对检查通过。
- `teach-watch-page.tsx` 采用 M6 的 `learnerLessonTopic`、账号课程列表/保存、草稿同步、保存后成就刷新与播放期间奖项暂缓；保留本分支的音频解锁、权威媒体时钟、可选嘴型生成、准备任务取消和迟到结果检查。
- 保存按钮保留 M6 语义“保存到我的课”，不是退回旧“准备分享”。只有需要新合成时才要求所选语音可用；已有匹配课程包可以直接保存。
- `package.json`、锁文件、`learning-stack-bom.json` 保留 M6 的 OLL 固定提交 **`7f6dbd6998747467e4d3268db20bcc7207d459a8`**，同时保留头像分支所需 MediaPipe/Three 和资源准备脚本。

新增 `src/learning/teach/teach-watch-save.test.tsx`：验证普通保存仍调用草稿同步→账号保存→成就刷新，以及更换形象后迟到的准备结果不会继续写入/上传。该测试对存储/API 做模拟，不代表 v2 服务端兼容已解决。

## 4. 当前实际入口

| 路径 | 当前用途 |
|---|---|
| `/teach/avatar-2d` | 主要互动试验室；正面 v0.2、摄像头、手动表情、录制回放、白板、片段库、音频试听 |
| `/teach/avatar-lab` | 同一互动页别名 |
| `/teach/avatar-2d/example` | 示例/本地配音小样，共享绘画舞台 |
| `/teach/package` | 本地课程包查看器，读取包并逐卡试听嘴型 |
| `/teach/:id/watch` | 看我的课；M6 保存流程 + 旧三维动态预览的可选入口，待换成 2D |
| `/teach/lessons` | M6 我的课：已保存课程/草稿 |
| `/teach/lessons/:id/play` | M6 已保存课程播放页；目前没有动态 2D 头像接入 |

**默认舞台不是所有头像都已实现。** `presenters.ts` 的六个形象仍是目录占位；星狐目前硬编码在试验室绘制器里，没有完成选择某个目录 ID 就加载相应绑定的机制。不要把各个 `avatar-*` 都画成同一只狐狸并声称目录完成。

## 5. 运行架构与代码地图

### 5.1 摄像头 → 参数 → 平滑

`src/learning/avatar/face-capture.ts`：唯一拥有摄像头流、Worker 与取帧定时器的对象。用户点击才启动；请求 `audio:false`、理想 640×480/30 FPS，实际按约 20Hz 提交 ImageBitmap，同一时刻只处理一帧；停止/页面隐藏/卸载/迟到权限均释放资源。

`face-capture.worker.ts`：经典 Worker，MediaPipe `@mediapipe/tasks-vision@0.10.32`，CPU delegate，`VIDEO` 模式、单人脸，输出 blendshape 系数与姿态矩阵。姿态/手部模型仍保留可选实现，但当前试验室调用 `start()` 不启用它们。

`scripts/prepare-avatar-assets.mjs`：校验模型哈希，把 WASM 与模型放到自托管 `public/avatar-runtime/`，构建经典 IIFE Worker。该目录是生成输出，不能当成手改源代码；修改 Worker 后必须重新准备。正常 dev/build 生命周期均会执行。不能直接把经典 Worker 换成不兼容 `importScripts` 的模块 Worker。

人脸模型源 `public/models/avatar-face/face_landmarker.task`，SHA-256：
`64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff`。
模型许可/来源清单在相同目录；身体模型另在 `public/models/avatar-body/`。

`face-frame.ts`：统一 `FaceFrame`：`timeMs`、`source`（mediapipe/arkit/demo）、`tracked`、按名映射的可选表情通道、弧度制 `[pitch,yaw,roll]`。不按数组下标猜通道，也不把缺失能力补成已支持。MediaPipe 矩阵按列优先提取角度。

`FaceSmoother`：校准保存自然参考；头动/其他约 65ms，嘴型 22ms，闭眼上升 12ms、重新睁开 50ms、失跟衰减 180ms。快速闭眼参数曾被统一 65ms 滤掉，勿无理由改回。`paintedBlinkAmount` 只对 MediaPipe 做绘画行程映射（0.06 以下自然睁眼，0.80 全闭），手动/ARKit 保留直接 0–1 控制；这些是当前样本拟合，不是所有儿童的通用准确率保证。

### 5.2 2D 画面

| 文件/目录 | 作用 |
|---|---|
| `painted-fox.ts` | 当前默认资源、口腔/嘴唇/眉毛残差绘制、14×14 网格头部形变与逆向采样 |
| `painted-eyes.ts` | 按 v0.2 手工拟合的双眼曲线；固定眼球纹理，眼皮移动/遮挡，连续闭合 |
| `illustrated-avatar-stage.tsx` | React Canvas 舞台，四素材载入、分辨率上限、30/60 目标帧率、失效/隐藏/卸载处理和绘制耗时 |
| `avatar-lab-page.tsx` | 页面状态机：idle/demo/camera/manual/replay；手动九参数、自然归位、校准、录制、回放/定位、白板 |
| `public/teach-avatars/star-fox/painted-v0.2/` | 当前完整正面源画稿、局部底画、口腔与 `asset-info.json` |

显示端是一张完整插画。内部还有眼/嘴/眉移动后露出的底画及口腔，不能描述成“只有一张 PNG、完全无需素材准备”。眼皮/唇线来自原画与底画的残差，局部控制后再统一作有限头动；无 Live2D Cubism SDK、无三维重建、无逐帧生成式推理。画稿更换须重拟合坐标；只替换图片 URL 会错位。

v0.2 两张新素材由内置 imagegen 编辑、归一化为 512×512；口腔沿用 v0.1，映射位置上移 10px。完整实际提示词、原始生成文件名、处理说明和逐文件哈希都在 `asset-info.json`。产品用的文件均已进仓库，不依赖 `~/.codex/generated_images`。耳尖仍在裁剪外；当前不是新制作的全身立绘。

### 5.3 动作、音频与课程包

| 文件 | 作用/重要约束 |
|---|---|
| `performance-track.ts` | `octos.avatar-performance.v1`；兼容带身体的 v2；最多 60s/3601 帧，严格校验与随机定位插值 |
| `performance-store.ts` / `avatar-clip-library.tsx` | IndexedDB `octos-avatar-performances`，按 profileId/id 隔离元数据和轨道；命名/回收/恢复；不是 M6 云端课程存储 |
| `lip-sync.ts` | `octos.avatar-lip-sync.v1`、最终音频 SHA-256/时长绑定、音量包络基础嘴型与媒体位置采样 |
| `prepare-preview-audio.ts` | 浏览器解码并一次性分析本地/最终合成音频；单段 ≤60s、≤10MB、≤双声道；取消/超时关闭音频上下文 |
| `avatar-audio-preview.tsx` | 试验室本地音频与包内逐卡试听，使用绘画舞台 |
| `home/voice/audio-playback.ts` | 读取真实媒体位置的时钟及浏览器音频解锁 |
| `oll/use-oll-narration-tts.ts` / `oll-lesson-runtime.tsx` | 将实际播放媒体时钟交给上层；没有权威时钟时不靠墙上时间猜嘴型 |
| `teach/learner-package.ts` | v1 普通课程包 + v2 嘴型扩展；严格文件/音频/文本哈希与能力声明 |
| `teach/make-learner-package.ts` | 先生成最终 TTS，再可选分析其嘴型，封装进 `.olesson` |
| `teach/learner-package-viewer.tsx` | 本地包导入/试听，不是 M6 的账号播放页 |
| `lesson-avatar-preview.tsx` | 看课动态小窗；仍导入 **`AvatarStage` 三维舞台**，需要替换 |

嘴型生成目前 `method=envelope-v1`，主要是音量→张颌，不是识别音素的精细 viseme。接口可读取 `aligned-visemes-v1`，不代表已接入生产者。音频哈希不匹配、文本变更、播放结束或没有可靠时钟时闭口/不给旧轨道续播。不要另起第二个播放器来“同步”。

**摄像头动作录制和课程嘴型是两条不同的数据线。** 前者是短时面部/角度参数，未绑定到录课卡片、未保存进课程包。后者从最终合成声音生成。孩子原说话节奏与合成声音节奏可能不同，不能直接把原嘴部动作照搬到最终 TTS。

### 5.4 保留的旧方案

`avatar-stage.tsx`、`star-fox-model.ts`、`star-fox-asset.ts`、rig-contract/binding 和 sculpt-v0.1 属旧三维工程样例；`illustrated-fox.ts` 是早期简化卡通；`original-fox.ts` 是直接驱动旧倾斜原画；`puppet-fox.ts`/puppet-v0.1 是被否定的身体拼接。为历史和兼容保留，当前不要把它们当主方向。

`native/avatar-capture-ios/` 保留 ARKit 原生捕捉工程（Xcode 项目、Swift、Info.plist、导出结构与测试）；可输出同一参数轨道。此前仅完成工程/格式层检查，未证明真机 Face ID 的实际捕捉效果，也没有完成手机实时驱动电视的传输产品。详见 [iOS 说明](LEARNER_AVATAR_CAPTURE_IOS.md)。

## 6. 接手优先处理的 M6 衔接缺口

### P0：带嘴型的包无法直接保存到账号

代码审阅确认：客户端 `learner-package.ts` 在启用嘴型时生成 `octos.learner-lesson-package.v2`，带 `requiredCapabilities:["avatar-lip-sync-v1"]`、`lipSync`、`mouth/*.json`/`role:"lip-sync"`。而 **`services/learner-lessons/package-check.mjs` 仅接受 v1**，文件白名单只有 lesson/ink/narration，旁白仅 mp3；服务限额 32MiB，客户端上限 100MB，支持的音频类型也更宽。

因此整合后普通 v1 保存路径保留，但勾选“保存基础嘴型（预览）”生成的 v2 包会被服务拒绝。**本次没有放松服务校验来掩盖问题。** 下一位应设计客户端/服务端一致的 v2 验证：能力声明、严格路径/角色/MIME、嘴型 JSON 内容、音频/文本/时长绑定、全部引用和文件哈希，以及拒绝额外数据。补 v1 兼容、v2 正向、篡改/错配/跨账号/超限回归；统一限额与音频格式策略。不要仅把 `schema` 判断改成“允许 v2”。

### P1：统一正式课程的 2D 播放

1. 将 `lesson-avatar-preview.tsx` 改用共享绘画舞台，移除与三维不符的文案，继续沿用权威音频时钟与失败降级。
2. 给 `teach-lesson-player-page.tsx` 接入同一舞台/包内嘴型时钟，保持 M6 无 Key、无额外合成、包内播放和暂停交互。不要只在试验室好看就标为产品完成。
3. 对齐 `presenters.ts` 的头像目录 ID、缩略图和对应资源，明确当前只有星狐绑定；保持孩子选择的声音与形象引用，不悄悄替换不可用声音。
4. 若需要把摄像头表情并入录课，先决定非嘴部表情与最终 TTS 时间线的绑定/重映射、课程包格式和隐私边界；当前无此连接，不应伪称已有。

### P2：画面与设备

- 用户尚未验收 v0.2 画风与直立姿态。接手首先查看当前实际输出，避免以“参数是零”代替视觉判断。
- 保留自然姿态；需要临场角度校准时使用既有按钮，不对所有真人输入加任意固定偏角。幅度上限是画面变形范围，不是恢复侧脸能力。
- 当前眼皮/口腔仍是手工拟合的简化表现；大角度/组合表情需逐项评估。手臂继续暂缓。
- iPhone/iPad、安卓触摸大屏、长时间识别/功耗/热量均未验收。30/60 是渲染目标；20Hz 是取帧调度，不能把选项当实测端到端 FPS。

## 7. 证据分级：哪些真的做过

| 证据 | 实际含义 | 不代表什么 |
|---|---|---|
| `painted-v0.2/neutral.png`、`poses.jpg`、`render-report.json` | 本轮新画稿的真实产品绘制器输出与局部像素/网格检查 | 浏览器截图、真人跟随或用户美术认可 |
| `painted-v0.1/preview.*`、synthetic-track/round-trip 报告 | 旧画稿、固定 demo 参数、实际录制/JSON/回放/绘制链路 | 真人输入、当前新画稿的设备表现 |
| `painted-v0.1/browser-smile.jpg` | 前期浏览器可用时保存的真实旧画稿页面截图 | 新画稿截图、相机准确率 |
| `real-input/real-input.*`、before/after/report/recorded-track | 五个已有公开本地视频、同一模型文件的原生 Python 真实检测结果驱动旧画稿 | 网页 WASM Worker 已验证、用户摄像头录制、新版美术通过 |
| `real-input/worker-validation.html/.ts` | 已准备同正常 HTTPS 环境的实际 Worker 测试页 | 已点击运行通过；当前用户已取消继续这项验收 |

旧画稿真实识别：MediaPipe Python **0.10.21**，与网页 **0.10.32/WASM** 运行时不同。5 段各最多 8s/20FPS，加 40 帧构造空白和 20 帧末帧恢复，共 **966 次真实推理 = 666 视频帧 + 200 空白 + 100 恢复**。源视频在忽略的 scratch；未提交真人画面/原始网格到产品。200 空白无脸误报、5 段均恢复，记录定位回放一致。原生识别 p95 约 4.65–5.53ms，不能当浏览器/电视端到端延迟。

曾在旧画稿浏览器演示观察到 30FPS、绘制提交 p95 11ms；短时桌面值，不含相机识别、传感与显示延迟。旧浏览器实际合成动作录到 60s 并进入回放；未把该浏览器文件保存为交付，文档中的 synthetic-track 是另一次原生 demo 记录。

LivePortrait 人像版/动物版曾实际离线试跑，质量/速度门槛失败，未接入，见 [实测](LEARNER_AVATAR_SINGLE_IMAGE_VALIDATION.md)。不要把调研中提到的 See-through、Live2D/VTube Studio 等说成已落地方案。

## 8. 浏览器历史阻塞与最新指令

前期工具反复返回 `Local browser use is disabled in Work settings`，后来当前会话工具列表中也未暴露浏览器控制。用户声明没有修改设置，`@Browser`/给出链接未恢复；重置工具也失败。**无法由报错推断用户关闭了设置，也没有确认根因或已知产品 bug。** 打开 URL 的应用工具只会打开面板，不能证明 agent 可以点击页面。

用户已取消继续验证；本轮未再操作浏览器或打开相机/麦克风。不要反复让用户切换设置、提供授权、重启或发“继续”。也不要未经明确要求改用另一套浏览器控制方式绕开限制。以后若用户重新要求真人/网页验收，应重新检查可用工具与实际授权，清楚区分代码检查、离线渲染和真实网页结果。

## 9. 本机环境、依赖和复现

- 仓库 `/Users/yy/Documents/projects/OctosLearn/octos-learn`；所有新文档放 `docs/` 并索引。
- Node 22：`export PATH=/opt/homebrew/opt/node@22/bin:$PATH`；项目 pnpm 11.5.2。
- **正常环境优先级**：AGENTS 与用户既有要求固定 HTTPS `127.0.0.1:5173`、Octos `127.0.0.1:50080`、本人既有 `~/.octos` 账号与技能。M6 历史脚本里的 5217/临时数据库不是本次授权新建验收环境的指令。
- 后端仍为现有 solo 账号；不要输出/提交 profile、Key、登录数据、录像。用户没要求更新其他仓库，本次仅更新了本仓库 main；未更新/安装 Learning Coach 或重启 Octos。
- 交接时已重启正常 HTTPS 5173 前端（`--force`），加载合并后的 M6 产品中间件与锁定 OLL；后端仍为已有 50080。进程是本机临时状态，新会话先检查监听，不能仅凭本文断言服务仍在运行。
- 本次按合并锁文件重新安装依赖，保留 OLL main 已合并引用；初次 `--ignore-scripts` 导致 Git 包缺少构建导出，后用正常脚本策略重新安装恢复。**接手不要省略依赖 prepare。** 临时的未构建依赖备份在恢复后已清理，不属于交付资产。

常规启动和检查：

```sh
export PATH=/opt/homebrew/opt/node@22/bin:$PATH
pnpm install --frozen-lockfile
pnpm dev:https --host 127.0.0.1 --port 5173 --strictPort --force
pnpm test:unit
pnpm test:history
pnpm check:i18n
pnpm build:public
```

不需要相机的当前画稿输出：

```sh
node_modules/.bin/vite-node scripts/export-painted-fox.ts /private/tmp/octos-2d-preview scratch/avatar-upright-v2
```

`/private/tmp/octos-2d-preview` 是此前本机的可选 authoring 工具目录，含 `@napi-rs/canvas`，**不随分支推送**。脚本第一个参数可换为带该依赖的工具目录；产品运行无需它。`export-painted-fox.ts --animation` 可输出 demo 帧，不能称真人录像。注意旧 `encode-painted-fox.py` 的默认输出仍指向历史 v0.1，修改调用/路径后再生成新版媒体，不要覆盖旧证据。

原生识别复现实验：`scripts/avatar-infer-video.py`、`scripts/avatar-real-input-validate.ts`、`scripts/encode-real-avatar-input.py`。依赖环境/公开视频仍在忽略的 `scratch/avatar-capture-validation/venv`、`scratch/avatar-single-image/`，详细命令见 [真实输入记录](LEARNER_AVATAR_REAL_INPUT_VALIDATION.md)。新机器不应以缺少 scratch 为产品启动失败；已交付角色资源/报告都在 Git。

## 10. 本次整合检查与剩余限制

- 合并后的全量 Vitest：**196 文件 / 1672 项通过**；之后新增的保存流程测试 **1 文件 / 2 项通过**。合计当前 197 个测试文件、1674 项；前述两次检查分开运行，非同一轮总计输出。
- **M6 学习记录/课程保存服务回归 104/104 通过**。首次受环境禁止本机监听而 EPERM，按正常本机测试权限重跑通过；不是更改产品逻辑来绕过失败。
- **`pnpm build:public` 通过**（包含 TypeScript、模型/WASM/Worker 资源准备）。保留既有大分包、动态导入等提示；未做公网部署。i18n **84 UI 文件 / 2831 对**，冲突处理相关 ESLint 与新增测试 ESLint 通过。
- 上轮正面画稿本机输出检查通过：自然/复位与新源图一致、非法参数归位、闭唇覆盖张颌、嘴区之外不变、八种极限头动无折叠/透明缝、下部衣服不动。没有再次进行浏览器/设备验收。
- 本轮原始检查日志仅在忽略的 `scratch/avatar-handoff-{unit,build,history,save-tests}.log`；本节记录实际结果，可供新机器重跑，不依赖这些临时日志。
- 尚未解决第 6 节 v2 服务端/音频格式/限额差异、正式 2D 看课与目录接入；测试绿不能推断这些已解决。

## 11. 文档阅读顺序

1. 本文：最新约束、代码地图、M6 衔接与下一步。
2. [学生当老师 M0–M6 交接](LEARNER_TEACHING_MODE_HANDOFF.md)：Claude 的产品/后端工作、部署与未完成事项；不能用它旧“头像分支需同步 main”说明覆盖本次合并记录。
3. [正面姿态修正](LEARNER_AVATAR_UPRIGHT_POSE.md)：当前立绘、素材提示词位置和本轮技术解释。
4. [绘画互动整合](LEARNER_AVATAR_PAINTED_INTERACTIVE.md)：旧 v0.1 舞台与控制整合、历史截图和验证边界。
5. [真实识别输入](LEARNER_AVATAR_REAL_INPUT_VALIDATION.md)：识别信号、眨眼修正和原生/网页区别。
6. [音频同步](LEARNER_AVATAR_AUDIO_SYNC.md)、[iOS 捕捉](LEARNER_AVATAR_CAPTURE_IOS.md)：最终音频与原生轨道的工程说明。
7. [方案调研](LEARNER_AVATAR_SINGLE_IMAGE_RESEARCH.md)、[LivePortrait 失败实测](LEARNER_AVATAR_SINGLE_IMAGE_VALIDATION.md)：避免重复已否定路线。

建议接手后先从当前分支继续，检查最新用户指令与工作区，再按第 6 节处理真正的产品衔接。不要重新做 3D、身体拼接、浏览器设置排查或无效长循环；不要在没有新授权时发布、部署、开 PR、调用真实付费服务或要求用户测试设备。
