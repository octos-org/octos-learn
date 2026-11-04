# 星狐完整样板：双耳、主要发束与高清嘴部

更新：2026-11-04。用户授权完成全部五项优化，并要求通过机制持续执行。本轮在 `codex/avatar-local-rig` 完成星狐样板的程序/素材工作；**不等于用户最终美术认可或真人/设备验收**。

## 当前交付与工作区

- 独立工作区 `/Users/yy/Documents/projects/OctosLearn/octos-learn-avatar-local-rig`，基于主线 PR 分支的 `e20c489e`。
- 回退基线 **`dc3ac1b6`**：用户表示“这一次比之前好多了”的左耳真实接缝与干净右侧发束。最终交付提交用 `git log -1` 查询，避免自引用提交号。
- 正常预览仍是 `https://127.0.0.1:5173/teach/avatar-2d`，使用这个工作区、当前本机账号与 `127.0.0.1:50080` 后端。
- 星狐默认“使用新版双耳与发束”；可分别调左/右耳、左右侧发束和刘海，或“回到自动跟随”。原版保留开关对照，其他三角色继续原实现。
- 未合并、未部署、未改 PR #119 或另一个 agent 的工作区。当前目标是完整星狐样板，另外三角色和最终音素对齐是后续范围。

## 六项工作结果

1. **保存基线**：Git 检查点 `dc3ac1b6`，历史失败与裂口前后证据保留。
2. **双耳**：各自提取原画纹理，各自描绘耳/前发的实际斜向接缝与根部区域；右耳没有直接镜像左耳像素。前/后侧毛面只做有限二维运动，接缝连接带保持。左右可单独控制；每侧 87 个局部姿态/头姿状态检查无原裂口。
3. **主要发束**：接受过的画面右侧卷发，加上画面左侧主要卷发和中央刘海，共三组。每组有自己的取图边界、固定根部、有限长度骨链和运动幅度。保留源画可见像素，用补画底板提供移动后的背景。没有恢复整头统一扭曲。
4. **自然动作**：沿用头姿物理控制器，重新映射局部运动方向；头部向右时发梢相对落后，停止后收敛。左右耳待机事件分开，有保持和归位；22 秒周期内时刻随周期确定性变化，间隔留静止时间。偶发低幅发梢整理，不连续吹风。
5. **嘴部**：保留已改善的上唇/光滑下唇，口腔由旧约 56×34px 的采样区域改为完整 **512px 纹理**。新增横向口型；圆唇与张颌独立，闭嘴噘唇不强行大开口，主动闭合优先。配音排练可随页面开关使用新舞台，仍采样原音频时钟，无新播放器或合成请求。
6. **验证/预览/交接**：全量单元测试、最终页面回归、构建、lint、i18n 与实际绘制器检查通过；页面与 11 张运行素材均 HTTP 200。主交接、此文、清单与机器状态同步。

## 关键实现

| 文件 | 用途 |
|---|---|
| `painted-local-rig.ts` | 双耳连接带、独立局部网格、发束运动、偶发时序及头姿映射 |
| `star-fox-parts.ts` | 右耳实际边界和三组发束的专用路径、骨链、范围 |
| `painted-fox.ts` | 新素材可选接入、高清口腔、独立圆/宽口型、表情层顺序 |
| `illustrated-avatar-stage.tsx` | 选择星狐且显式开启时加载新图层，释放/隐藏/调度沿用原舞台 |
| `avatar-lab-page.tsx` / `avatar-audio-preview.tsx` | 五个局部控制和新嘴型排练；回退开关不重开摄像头 |
| `prepare-star-fox-sample.ts` | 原画/旧接受素材/补画 → 双耳、发束、复原遮罩和口腔 |
| `avatar-star-fox-sample-validate.ts` | 实际产品绘制器、形状/根部/表情/静止动作/源码哈希检查及媒体 |
| `avatar-ear-seam-validate.ts` | 左右可见接缝扫描；右侧传 `--right` |

`FaceFrame`、MediaPipe 捕捉、平滑、动作文件与课包格式未更换。摄像头提供的 `mouthStretch*` 已在通道集合中，新绘制器直接使用；无需修改数据格式。

刘海覆盖到脸部绘制区：先恢复移动前的平面发片区域，再合成独立图层，最后叠加原面部表情差值。这样移动刘海不会把中性眉毛贴回皱眉/抬眉上。副作用与边界明确：这是当前插画的表情层次设计，不是通用头发/眼部自动遮挡重建。

## 素材与生成记录

目录 `public/teach-avatars/star-fox/local-rig-v0.3/`。运行加载 11 张：base、左右耳正/后侧、左右侧发束、刘海、前发遮挡、移动区域恢复遮罩、高清口腔。**生成源、完整提示词、来源与全部 PNG 哈希在 `asset-info.json`**。使用内置 imagegen，没有 CLI/API 后备。可见耳/发保留原画纹理，生成图用于遮挡后底画和新口腔。

本轮调试记录：

- 口腔首次生成被工具输出审核误判拒绝，未得到图片；重新描述为简洁友好卡通纹理后成功。
- 新刘海初次合成覆盖部分抬眉像素，最大差 15；调整表情层顺序后保护区最大差为 1 档量化误差。
- 左侧卷发选区曾夹带下方相邻毛尖，经过两次边界收紧后再生成独立 alpha 对照检查。大图不能只看整脸缩略图。
- 最初嘴部范围检查把静止衣领/颊毛误算进嘴型边界，改为在指定嘴区对“发生变化的口腔色像素”统计；没有放宽真实形状条件。
- 历史 `avatar-local-rig-validate.ts` 是一耳/一束阶段检查，不适合当前有意改变的高清口腔/刘海合成；当前入口是本节新脚本，不把旧报告误称最新结果。

## 验证与实际画面

全量 Vitest：**206 文件 / 1725 项通过**；最后 UI 过滤调整另跑页面/舞台/配音回归，见[验证记录](avatar-animation-phase-a/star-fox-sample/validation.json)。构建、修改文件 ESLint、i18n（84 UI 文件 / 2873 对）通过；既有 CSS `file:path` 和大包/混合导入提示仍存在。

- [整体姿态](avatar-animation-phase-a/star-fox-sample/poses.jpg)、[跟随过程定格](avatar-animation-phase-a/star-fox-sample/following-poses.jpg)。
- [独立发束 alpha 对照](avatar-animation-phase-a/star-fox-sample/hair-layers.jpg)、[八种嘴型近景](avatar-animation-phase-a/star-fox-sample/mouth-shapes.jpg)。
- [实际绘制报告](avatar-animation-phase-a/star-fox-sample/report.json)、[左耳接缝](avatar-animation-phase-a/star-fox-sample/left-seam.json)、[右耳接缝](avatar-animation-phase-a/star-fox-sample/right-seam.json)。

报告结果：中性重组、表情保护区最大差均 1/255，衣服差异 0；两侧可见接缝各 87 状态纸面露出为 0；发束局部三角形最小面积比约 0.615；主动闭合回到中性嘴部差异 0。模拟自然调度 880 个状态中，双耳同时事件 0、737 个耳部静止状态；停止后物理残量约 `1.2e-6`。这些检查定义程序约束，不能替代动物自然度判断。

GIF 在忽略的 `scratch/star-fox-sample/sample.gif`（18 秒），由当前产品绘制器和合成头姿/口型输入生成；不是真人摄像头或网页录像，不提交大媒体。生成报告记录 19 个源码/运行素材的 SHA-256，完成门槛会拒绝源码或素材变更后的旧证据。

复现（Node 22；工具依赖目录可替换）：

```sh
export PATH=/opt/homebrew/opt/node@22/bin:$PATH
node_modules/.bin/vite-node scripts/prepare-star-fox-sample.ts /private/tmp/octos-2d-preview
node_modules/.bin/vite-node scripts/avatar-star-fox-sample-validate.ts /private/tmp/octos-2d-preview scratch/star-fox-sample
node_modules/.bin/vite-node scripts/avatar-ear-seam-validate.ts /private/tmp/octos-2d-preview scratch/star-fox-sample/left-seam
node_modules/.bin/vite-node scripts/avatar-ear-seam-validate.ts /private/tmp/octos-2d-preview scratch/star-fox-sample/right-seam --right
node scripts/check-star-fox-completion.mjs
pnpm --config.verify-deps-before-run=false dev:https --host 127.0.0.1 --port 5173 --strictPort
```

## 持续执行机制与剩余边界

[六项清单](LEARNER_AVATAR_STAR_FOX_TODO.md)与 `task-status.json` 记录完成证据；`check-star-fox-completion.mjs` 检查所有必做项、Git 基线、文件存在、接缝/自然动作指标和源码/素材哈希。持续任务在门槛通过前保持 active，没有在中间图片或检查失败处结束。

程序/素材阶段完成后，以下仍不能冒称通过：用户对完整样板的美术确认；真实浏览器和摄像头；iPhone/iPad/Android 大屏的帧率、发热、语音/白板并行性能。本轮没有要求用户现在操作设备，也没有调用付费 TTS。

耳朵仍是有限二维动作，未制作大幅翻耳/完整侧面；发束代表主要三组，不逐根毛发模拟。自然耳发状态未加入正式课包，暂停/跳转会按原舞台的二级动作重置/收敛，不能逐像素复现录制时耳发。最终配音仍是音量驱动张颌，新增口型能被摄像头/手动通道驱动，不代表已有音素对齐生产者。正式课程舞台和其他三角色保持主线行为，后续整合由整体推进 agent 协作。
