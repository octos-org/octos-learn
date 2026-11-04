# 录课摄像头动作接入课程

日期：2026-11-03。分支 `codex/avatar-capture-prototype`（提交 `c7684e45`、`4d79ebeb`、`1c01a451`、`c812d9ed`），未合并、未部署。用户要求先推进接入；耳朵/头发自然度另由其他 agent 迭代，本轮未改 `painted-secondary-motion.ts`。

## 用户能做什么

1. **录课页**（`/teach/:id`）：卡片面板有“用摄像头带动我的形象”开关（默认关）。打开后，每次录一张卡片时摄像头才启动，停止/放弃即关闭；面板显示“正在跟着你 / 看不到你的脸 / 摄像头不能用”。打开它会同时打开“保存基础嘴型”。
2. **看我的课**（`/teach/:id/watch`）：有摄像头动作的卡片会显示“带上我录课时的表情和转头”（默认随录课开关），关掉基础嘴型时不能带。准备分享 / 保存到我的课时，动作按最终配音重新对齐后放进课包。
3. **播放**：看我的课、下载课包播放（`/teach/package`）、我的课播放页（`/teach/lessons/:id/play`）的二维形象＝课包里的表情/转头＋最终配音嘴型，跟随旁白媒体时钟；暂停或没有时钟时回到中性。没有摄像头动作的卡片只动嘴。

## 数据与隐私

- **只在本机**：每个 take 的动作（平滑后的面部系数和头部角度，不含画面）存在 IndexedDB `octos-take-performances`，按 profile/录课/卡片/take 区分；不随账号草稿同步、不上传。take 上只有 `camera: true` 标记。换设备打开草稿时没有动作，课程按“只动嘴”处理。删除课程会一起删掉这些动作；放弃一次录制不保存。
- **课包里**：只有按配音重新对齐后的表情与头部参数（`performance/<n>.json`，`octos.avatar-lesson-performance.v1`，20 Hz，≤60 s）。**下巴、嘴唇、舌头等发音通道一律不进课包**（嘴型只来自最终 TTS 音频）；嘴角笑/撇（`mouthSmile*`/`mouthFrown*`）属于表情，保留。原始 take 时间线不进课包。
- 这仍然是孩子的面部动作数据。是否需要家长同意、留存期限等属于 M7 法律审核（P4）范围，本轮没有作出合规结论。

## 时间对齐

TTS 的节奏和孩子原话不同。目前做法：把 take 的说话区间（`speechSpanMs`，首句开始到末句结束）线性映射到整段最终配音 `[0, 时长]`，再以 50 ms 重采样。说话前/后的动作被丢弃，片段之外保持首/末帧。限制：句内节奏不对应；孩子改了字幕后也只能整体对齐。后续可用逐句时间（`TakeSpeech` 内部已有每句起止）配合 TTS 的句/词时间戳做分段对齐。

摄像头按开始录制时的姿态校准中性（假定孩子开始时看着屏幕）。推送节奏约 20 Hz；`PerformanceRecorder` 最长 60 s，超过后停止记录（卡片配音本身也限 60 s 才有嘴型）。

## 课包格式与校验

- v2 课包 `requiredCapabilities` 为 `["avatar-lip-sync-v1"]` 或 `["avatar-lip-sync-v1","avatar-performance-v1"]`；后者必须有非空 `performance`，每项绑定一张有旁白的卡片（`beatId`/`audioSha256`/`textSha256` 与旁白一致），文件角色 `performance`，`application/json`。动作需要嘴型；不能单独存在。
- 客户端 `parseLessonPerformance`（`src/learning/avatar/lesson-performance.ts`）与服务端 `checkPerformanceTrack`（`services/learner-lessons/package-check.mjs`）规则一致：键集合固定、时间严格递增且首 0 尾等于时长、时长与旁白差 ≤50 ms、通道白名单（测试保证两边相同）、权重 [0,1]、角度 |x|≤1.25、最多 1202 个关键帧。旧版应用读到新能力会按“需要更新应用”拒绝。

## 代码

| 文件 | 作用 |
|---|---|
| `avatar/lesson-performance.ts` | 重新对齐、严格解析、按媒体时间采样、与嘴型合成 |
| `teach/use-take-camera.ts` | 录课时的摄像头：本机模型、平滑、校准、按 take 时钟记录 |
| `teach/take-performance-store.ts` | 本机 take 动作存储与删除 |
| `teach/teach-studio-page.tsx` | 开关、状态、开始/停止/放弃时的摄像头与保存 |
| `teach/teach-watch-page.tsx`、`make-learner-package.ts` | 选择是否带上、按卡片取动作、重新对齐进课包 |
| `teach/learner-package.ts`、`services/learner-lessons/package-check.mjs` | 新能力的写入与校验 |
| `avatar/lesson-avatar-preview.tsx` 与三个播放页 | 合成表情/转头与嘴型 |

## 验证

自动化：全量 vitest 204 文件 / 1711 项通过；`pnpm test:history` 107 项；`tsc -b`、改动文件 ESLint、i18n（2859 对）、`pnpm build` 通过。新增测试覆盖：重新对齐的映射、发音通道被剔除、篡改/错配被客户端与服务端拒绝、录课页只在开关打开时启动摄像头并保存、放弃不保存、钩子校准与迟到帧、看我的课按卡片取动作进课包、播放合成。

**未做**：真实浏览器、真人摄像头、iPhone/iPad/安卓大屏实测；摄像头在录课页同时运行语音识别与白板时的性能/发热；不同光线和孩子面部的跟踪质量。录课时没有形象小窗反馈（只有文字状态）。
