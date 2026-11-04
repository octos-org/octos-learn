# 二维星狐：真实模型输入验证与眨眼响应修正

> 2026-11-03 后续用户已取消继续浏览器验证，要求先修正歪头。当前已改用 `painted-v0.2` 正面画稿，见[姿态修正与实际技术说明](LEARNER_AVATAR_UPRIGHT_POSE.md)。以下保留前一画稿的真实输入记录，不再作为当前必须等待浏览器的行动要求。

日期：2026-11-03。当前分支 `codex/avatar-capture-prototype`，基线 `2231226d`。用户要求在没有用户前置事项时持续推进，不能把局部演示或一次提交当成整体完成。**本轮完成真实视频识别驱动的本机验证并修复快速眨眼，浏览器原 Worker 复核仍未运行，目标尚未整体完成。**

## 本轮实际结果

- 十一秒角色动画（媒体已移出仓库，原文件见提交 `30a3e3d5` 的 `docs/avatar-animation-phase-a/real-input/real-input.mp4`） / GIF（媒体已移出仓库，原文件见提交 `30a3e3d5` 的 `docs/avatar-animation-phase-a/real-input/real-input.gif`）：前八秒用实际视频帧的识别结果驱动角色，之后两秒输入均匀空白图、最后一秒重复视频末帧用于检查重新识别。不包含用户、源视频的人脸画面或音频。
- 修正前六状态（媒体已移出仓库，原文件见提交 `30a3e3d5` 的 `docs/avatar-animation-phase-a/real-input/before-poses.jpg`） / 修正后相同识别事件（媒体已移出仓库，原文件见提交 `30a3e3d5` 的 `docs/avatar-animation-phase-a/real-input/after-poses.jpg`）。不是另生成一组理想表情。
- [可导入的识别动作片段](avatar-animation-phase-a/real-input/recorded-track.json)：实际 `mediapipe` 来源，已经过本项目的映射、平滑、录制、JSON 校验与回放。只含动作参数，原视频和原始人脸关键点没有加入产品资源或本文。
- [完整指标与媒体检查](avatar-animation-phase-a/real-input/report.json)、[修正前](avatar-animation-phase-a/real-input/before.json)、[修正后](avatar-animation-phase-a/real-input/after.json)、[校验和](avatar-animation-phase-a/real-input/manifest.json)。

## 输入与真实运行边界

使用此前已下载的 [LivePortrait 官方示例](https://github.com/KlingAIResearch/LivePortrait/tree/9b294b3d0536135442ea73cb01e6cb3ca7029dd3/assets/examples/driving) `d0`、`d10`、`d11`、`d18`、`d20`。每段读取前最多八秒，按 20 FPS 采样；每段再实际识别 40 帧构造空白图和 20 帧末帧重复图。合计 **966 次真实推理 = 666 个视频帧 + 200 个空白输入 + 100 个恢复输入**，不是 966 帧真人摄像头采集。

识别使用 **MediaPipe Python 0.10.21、CPU delegate**，Python 3.9.6；独立依赖环境仅在忽略的 `scratch/avatar-capture-validation/venv/`，完整版本见[依赖清单](avatar-animation-phase-a/real-input/requirements.txt)。加载的模型是产品现有的同一份 `face_landmarker.task`，实际核对 SHA-256 `64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff`。Python `VIDEO` 模式输出真实表情分数和姿态矩阵，[官方 Python 说明](https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker/python)提供对应接口。

**Python runtime 与网页 `@mediapipe/tasks-vision@0.10.32` / WASM Worker 不相同，不能据此声称网页链路、摄像头、浏览器兼容性或安卓性能已经通过。** 它证明的是同一模型文件的实际检测结果经过产品映射与绘制可以工作。Python ndarray 按列优先显式打包后传给 `mediaPipeFrame`，保留了原矩阵供本机审计；没有将行优先数组误当网页的矩阵布局。原始结果只在 scratch，本文报告没有加入人脸网格。

首次隔离执行在初始化系统图形上下文时失败，尚未进入推理；本机图形访问获自动审批后运行成功。尽管选择 CPU delegate，原生图像预处理初始化仍需要系统图形上下文，不能把它描述为纯无图形服务执行。没有使用用户摄像头、麦克风、付费服务或上传视频，也没有改变浏览器设置。

## 找到并修复的问题

旧 `FaceSmoother` 对眼睛使用与头部相同的 65ms 平滑。20 FPS 下，一次短促的闭眼信号会在平滑后被大幅削弱；d10 左眼模型原始峰值约 0.885，旧平滑峰值仅约 0.738，绘画眼皮也只闭到约 74%。这就是静态滑杆能全闭、实际快速眨眼却半闭的差别。

修正分两部分：

1. `face-frame.ts` 闭眼上升改为 12ms、重新睁开保留 50ms 平滑，真实失跟仍用 180ms 渐归位。没有插入合成眨眼事件、计时补眨眼或锁住闭眼。
2. `painted-fox.ts` 只对 `source=mediapipe` 做绘画眼皮行程映射：0.06 以下保留睁眼，0.80 对应闭合，区间内使用连续曲线。手动/演示和 ARKit 的 0…1 控制语义保持不变。它是针对当前角色和所测信号范围的映射，**不是所有用户或设备的通用最优阈值**；仍需真人检查眯眼和自然眨眼的区分。

| 相同视频 | 原先眼皮最大闭合（左 / 右） | 修正后（左 / 右） |
|---|---|---|
| d0 | 0.651 / 0.609 | 0.985 / 0.932 |
| d10 | 0.738 / 0.645 | 1.000 / 0.991 |
| d11 | 0.679 / 0.466 | 0.999 / 0.719 |
| d18 | 0.476 / 0.580 | 0.781 / 0.896 |
| d20 | 0.466 / 0.381 | 0.603 / 0.434 |

这些数值是同一组真实模型输出在修正前后的角色控制量，**不是眨眼准确率或美术评分**。弱信号仍表现为半闭，未强制把所有峰值变成完全闭眼；特别是 d11 右眼，不能只报告表现最好的 d10。

嘴型、圆唇和轻微头动同样走真实模型输出，已生成对应实际角色画面。没有由这五个短视频推断音素正确率、大角度转头质量、侧身写字稳定性或儿童适配效果。

## 失跟、恢复与录制

- 五段的 200 帧空白输入均无检测到人脸的误报。
- 两秒空白后最大残留通道/旋转幅度都低于 0.001，实际可回自然状态；这只是程序控制与渲染状态，不是隐私识别准确率。
- 恢复输入的第一帧均重新检测到人脸。时间步长是 50ms，该结果只表示所采样第一帧成功，不能声称物理恢复延迟为零。
- 五段记录均实际经 JSON 序列化、导入校验和随机定位回放。四个已记录时间点的实际绘画 RGBA 哈希一致。
- 所选 d10 的 MP4 实际解码 220 帧 / 20 FPS，GIF 实际 11000ms；这是离线回放速度，不是实时捕捉 FPS。
- 原生模型推理 p95 约 4.65–5.53ms（各段分别记录）。不含视频解码、网页线程/相机、角色绘制或显示，不能与先前浏览器 11ms 绘制提交耗时直接相加来预测电视延迟。

## 网页 Worker 验收入口与真实阻塞

准备了[正常 HTTPS 5173 的本地视频验证入口](https://127.0.0.1:5173/docs/avatar-animation-phase-a/real-input/worker-validation.html)。它通过可见按钮启动，直接使用产品经典 Worker、现有模型/WASM、相同平滑器、录制和产品绘制器，按顺序输入 d10 的视频帧、空白和恢复帧；支持取消、回放、下载报告与片段。不调用 `getUserMedia`，不打开摄像头。

该页面依赖 scratch 中已有的官方示例，不能当作产品资源分发。代码已通过 Vite/esbuild 语法转换，**尚未在真实网页点击运行，不能标成通过**。这一项是下一步的实际验收工作，不能用上述 Python 原生结果替代。

工具在用户回复前后两次返回 `Browsers: Error: Local browser use is disabled in Work settings`，浏览器列表为空。用户表示已经开启，随后澄清自己没有修改过设置。**这只是工具报错，不证明用户关闭过设置，也不能据此确定具体原因。** 可能的连接或权限同步原因尚未确认；未要求用户反复切换、重启、重新授权，也未用原生 Chrome 控制或其他浏览器库绕过限制。只读核对应用设置的尝试被工具自身安全规则拒绝，未实际打开或修改设置。

因此当前网页复核是一个工具访问阻塞，不是等用户说“继续”，也不是当前动画完全开发完成。不将目标标为完成；恢复可用的浏览器工具后先执行此页，再复核原互动入口和实际回放。

## 验证与复现

本轮全量：**194 文件 / 1665 项通过**；TypeScript、修改模块 ESLint、中英检查（82 UI / 2763 对）及正常 `pnpm build:public` 通过，既有构建提示保留。新增测试验证一次 20 FPS 闭眼脉冲不会被吞掉、单眼独立与失跟衰减、MediaPipe 行程映射单调有界且不影响手动/ARKit。

```sh
scratch/avatar-capture-validation/venv/bin/python scripts/avatar-infer-video.py \
  --videos scratch/avatar-single-image/LivePortrait/assets/examples/driving/d10.mp4 \
  --output scratch/avatar-capture-validation/raw-one
node_modules/.bin/vite-node scripts/avatar-real-input-validate.ts \
  scratch/avatar-capture-validation/raw scratch/avatar-capture-validation/after \
  /private/tmp/octos-2d-preview --media
scratch/avatar-single-image/venv/bin/python scripts/encode-real-avatar-input.py
```

完整五段参数见报告的源文件名/哈希；基线使用提交 `2231226d` 的平滑和绘制逻辑。修改后媒体复现不需要重新推理。没有推送、合并或部署；正常互动入口仍读取当前工作区更新。用户无需提供私人人像、录音或现在连接设备。
