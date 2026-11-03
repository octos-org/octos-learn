# 同一原画面部素材 / 绑定验证

2026-11-02。用户授权继续验证。**结果：局部绘画素材能保留画风，闭眼、开口端点比上一轮 LivePortrait 输出可控；完整动画质量仍未通过。** 本轮没有替换录课舞台，手臂暂缓。

## 最新进展：连续眼皮与双眼浏览器验证

用户再次询问停止原因。没有需要用户处理的外部阻塞或等待确认项；此前在小检查点就结束回复，不是授权不足。本轮直接完成眼角中性跳变修正并扩到双眼。上一轮单眼提交 `35fa2b7f` 保留。

可操作入口：正常开发环境 [HTTPS 5173 双眼表情页](https://127.0.0.1:5173/docs/avatar-animation-phase-a/facial-rig/eyes.html)。前后端仍沿用现有 5173 / 50080 进程、账号与工作区，没有新开服务或测试账号。另有[素材内嵌独立页](avatar-animation-phase-a/facial-rig/eyes-preview.html)，本地文件打开时只启用手动/演示，摄像头和模型检查按钮禁用。

- [双眼六状态实际渲染](avatar-animation-phase-a/facial-rig/blink-v3/comparison.jpg)：0 / 25 / 50 / 75 / 100% 与复位。
- [实际 5 秒双眼 / 左右单眼动画](avatar-animation-phase-a/facial-rig/blink-v3/validation.gif)、[MP4](avatar-animation-phase-a/facial-rig/blink-v3/validation.mp4)。参数驱动，不是摄像头实拍或实时性能成绩。
- [实际浏览器半闭眼截图](avatar-animation-phase-a/facial-rig/blink-v3/browser-half.jpg)和[全闭眼截图](avatar-animation-phase-a/facial-rig/blink-v3/browser-closed.jpg)。本轮完成了真实页面按钮、键盘滑杆、播放/暂停和复位操作，不能与前两轮未完成的网页验收混为一谈。

修正方法：把“原图与局部底画的绘画残差”按眼皮、眼球和周围皮肤分配，眼球采样坐标固定，只移动上/下眼皮残差；从同一套连续权重重建所有闭合状态。中性时这些层重建同一张原图，不再先换成另一个近似眼睛再开始移动，也没有新增整脸生成或用快速淡入遮住跳变。`eye-occlusion.mjs` 是这次的独立实验绘制器，旧版脚本和媒体保留作对照。

[图像验证报告](avatar-animation-phase-a/facial-rig/blink-v3/report.json)：

| 项目 | 实测 |
|---|---|
| 极小闭合量 0.0001 与原画 | 两眼分别最大差 1/255；上一版左眼同样探测为 190。 |
| 逐步趋近睁眼 / 闭眼端点 | 检查 0.001、0.0001、0.00001、0.000001，差值趋近 8-bit 舍入范围；没有旧版中性重建跳变。 |
| 中性复位、眼部之外、单眼控制不牵动另一眼 | 最大像素差均为 0。 |
| 可见虹膜内部小探针 | 0 / 25 / 50 / 75% 闭合最大差 1，允许残差混合到 8-bit 的一档误差；固定纹理坐标、没有纵向压缩。不是完整虹膜/视线绑定或质量评分。 |
| 非有限输入 | 返回中性，无越界画面。 |
| 媒体 | 实际解码 120 帧、512×512、24 FPS 的 MP4，GIF 实际 5000ms。 |

初次验证把闭眼端点 0.0001 步长的阈值固定为 2，得到 3 而失败；随后增加多个缩小步长检查实际收敛（而非只提高阈值），末级最大差 1。虹膜探针也实际记录 1，未将其描述为完全零差。这些检查验证几何与复位，仍不能代替主观自然度或设备性能验收。

真实浏览器还点击了“检查本机识别能力”：沿用现有 `selfTestFaceModel`，本机 Worker 在空白画面上实际初始化、推理并正确返回无人脸，页面显示通过。**没有打开摄像头或麦克风。** 页面已接入既有 `FaceCapture` / `FaceSmoother` 的双眼通道，用户主动开启后可试跟随，页面隐藏/离开/停止会释放资源；这条真人跟随路径、权限拒绝与真机性能尚未验收，不能从空白画面检查推断真人表现。

本轮没有接入产品舞台、嘴型、眉毛、视线或头颈运动；没有声称完成正式 Live2D 模型或安卓适配。没有付费调用、上传真人数据、推送、合并或部署。眼部连续性和双眼操作验证已完成，嘴型与头部属于接下来实施工作，不是等待用户批准的事项。

复现：

```sh
node scripts/avatar-eyes-validate.mjs /absolute/path/to/@napi-rs/canvas
scratch/avatar-single-image/venv/bin/python scripts/avatar-eyes-media.py
node scripts/avatar-face-rig-export.mjs
```

## 此前进展：单眼固定虹膜遮挡（同日，问题已继续修正）

用户询问是否需要配合。当前没有必须由用户处理的设备、素材或授权阻塞；直接继续单眼变形验证。上一轮保存在提交 `57a274d5`。

- [五档闭合对照](avatar-animation-phase-a/facial-rig/blink-v2/comparison.png)：上排 V1 将整块眼睛压缩，下排 V2 保持眼球原始绘画位置，由上下眼皮遮挡；0 / 25 / 50 / 75 / 100% 均实际渲染。
- [单眼慢速对照动画](avatar-animation-phase-a/facial-rig/blink-v2/validation.gif)与[视频](avatar-animation-phase-a/facial-rig/blink-v2/validation.mp4)：左侧旧版、右侧新版，故意慢速展示闭合与睁开。只验证画面左眼，没有扩到另一眼或接摄像头。
- [可独立打开的单眼交互页](avatar-animation-phase-a/facial-rig/blink-preview.html)：同一滑杆同步控制新旧版，提供五档定格和慢速演示，不需要服务器。完成内嵌资源与脚本语法检查；**未完成真实浏览器点击或截图验收**。

V2 使用原画本身的眼白与虹膜纹理，保持坐标不变；从原画提取深色眼睫毛窄条，沿手工拟合的平滑曲线移动并单独改变厚度。没有新生成整张脸，也没有压缩眼球。它是遮挡变形试验，**不是已经得到可独立转动的虹膜/眼白完整模型**。

[检查报告](avatar-animation-phase-a/facial-rig/blink-v2/report.json)确认：五档中眼部区域以外的像素不变，复位与原画逐像素一致；在 0 / 25 / 50 / 75% 闭合时，可见虹膜内部一个 15×3px 探针区域与原图保持一致。这只证明没有压缩这个可见区域，不是自然眨眼质量分数。已解码检查 120 帧 / 24 FPS 视频与实际 5000ms GIF；播放速度不等于实时采集帧率。

**仍未判为成品：** 眼睫毛边缘有栅格锯齿，手工遮挡曲线还不够贴合眼角。从恰好 0 闭合切到极小正值时，原图切换为重建睫毛，局部仍有跳变；已测眼部矩形平均 RGB 差约 2.02、最大单通道差 190，不能只用均值隐藏局部大差异。该问题和原先虹膜被压扁的问题分开记录。下一步先修复中性状态与眼角的连续性，再扩到另一眼；嘴型、头颈和设备验收仍待办。当前不要求用户测试或批准。

复现单眼渲染、编码和交互导出：

```sh
node scripts/avatar-blink-validate.mjs /absolute/path/to/@napi-rs/canvas
scratch/avatar-single-image/venv/bin/python scripts/avatar-blink-media.py
node scripts/avatar-face-rig-export.mjs
```

编码脚本使用已有 Pillow、NumPy、imageio/ffmpeg 可选制作环境，不加入产品依赖。此前六状态、PSD 和整体面部试验保留如下，未被这次单眼实验冒称为全部修复。

## 本轮可检查的输出

- [六状态实际渲染对照](avatar-animation-phase-a/facial-rig/comparison.jpg)：原画/复位、半闭眼、全闭眼、小开口、大开口、组合。
- [5 秒固定参数动画](avatar-animation-phase-a/facial-rig/validation.mp4)与[GIF](avatar-animation-phase-a/facial-rig/validation.gif)。120 帧以 24 FPS 回放，只证明这些控制值可以合成，**不是实测摄像头帧率**。
- [独立交互样本](avatar-animation-phase-a/facial-rig/preview.html)：本地打开即可，素材内嵌，不依赖服务器。可以分别调两眼闭合、开口，播放固定演示。仅作面部素材检查，没有摄像头、录制、声音、头部转动或手臂。尚未完成该最终页面的真实浏览器点击验收。
- [七图层 PSD](avatar-animation-phase-a/facial-rig/star-fox-face.psd)和[绑定诊断](avatar-animation-phase-a/facial-rig/upstream-anchors.json)。这是实验材料，不是正式 Live2D 模型。

## 实际做了什么

1. 使用上一轮[同一张原画的 512px 裁剪](avatar-animation-phase-a/single-image/source.png)，保留已有眼线转正和肩颈裁剪。没有重新拼接头、躯干或手臂；完整耳尖与新正面姿态不在本轮验证范围。
2. 用 imagegen 基于此图补画局部被眼睛/嘴遮住的毛发、闭眼线和口腔，再手工制作小范围遮罩。整张生成图没有作为运行画面；运行底图的毛发、服饰、星纹仍来自源图。提示词、原始输出路径、绑定到项目的补画图见[生成记录](avatar-animation-phase-a/facial-rig/generation.json)。此轮没有运行 See-through 自动分层模型。
3. 实际检查官方 [Anime2.5DRig](https://github.com/852wa/Anime2.5DRig)（MIT，提交 `7ddbd9943ea3152561b3dc8348fd752c850f3e95`），导入本地星狐 PSD 并运行其 WebGL 样本。第一次素材出现浅色毛发块与闭眼过渡双眼重影，自动闭眼线和颈部支点也不合适；后续在本机修正局部素材。**通用绑定没有直接通过星狐质量验收。**
4. 最终提供的动图、视频和交互样本是独立 Canvas 面部过渡试验，使用相同原画与补画素材，推迟闭眼线淡入以减少双眼叠影。它们**不是上游 WebGL 的导出**，也不代表已经完成正式二维网格绑定。上游的分层/识别验证和本项目的有限过渡验证分开保留。

## 质量判断

| 检查项 | 结果 |
|---|---|
| 原画细节 | 六种状态在标出的三处局部编辑矩形之外，逐通道最大像素差为 0；毛发与衣服不被逐帧重建。这个数字仅验证编辑范围，不是美术质量分数。 |
| 中性与复位 | 与实际源 PNG 最大逐通道差为 0。 |
| 完全闭眼 | 提供清晰的绘画眼皮，不再依赖生成模型抹掉虹膜；端点比上一轮清楚。 |
| 半闭眼与眨眼 | 仍会压缩整块绘画眼部纹理，眼睛有压扁感，后段存在淡入感。需要真正分离虹膜/眼白/上下眼皮与毛发遮挡，然后做曲线或网格变形。**未通过自然眨眼验收。** |
| 开口 | 无人类牙齿，嘴型与本图风格较接近；只有一种口腔图的高度变化，微开口仍有切换感。**未通过连续说话和多嘴型验收。** |
| 视线 / 眉毛 | 未独立分层，当前不提供控制。 |
| 转头 / 点头 | 自动颈部支点落在图底外，通用转头会牵动肩颈与整图。当前样本没有做假转头；**未通过，尚未实现本图头部深度绑定。** |
| 摄像头 / 设备 | 最终样本未接入或采集摄像头，未测真人、iPhone 或安卓触摸大屏性能。 |

## 验证与复现

- 上游四组 Node 检查通过：rigger 20 场景、runtime、face-features、两份官方 PSD 的导入/导出回读。第一次 PSD 检查失败是因为实验时临时用星狐替换了官方样本；恢复官方文件后重新通过，不是上游问题。
- 本项目渲染脚本实际生成六状态与 120 帧；中性、复位、局部外像素检查通过。MP4 编码后实际解码确认 120 帧、512×512、24 FPS。
- 浏览器前半段确实运行了上游样本和初版星狐，发现上述问题；修正后的最终样本因浏览器自动化连接长时间卡顿，**未完成最终页面截图、点击及 WebGL 复核**。没有保存可交付的最终浏览器截图；本文六状态与动图是离线 Canvas 实际渲染。没有用测试通过替代视觉验收。
- 没有修改产品依赖或课程生成流程，没有调用付费推理、租 GPU、录音或采集真人画面。没有合并、推送或发布。

使用已有可选 authoring 依赖 `@napi-rs/canvas`（不加入产品依赖）：

```sh
node scripts/avatar-face-rig-validate.mjs /absolute/path/to/@napi-rs/canvas
node scripts/avatar-face-rig-export.mjs
```

前者生成对照 PNG 和忽略目录中的逐帧文件及检查报告；本文 JPG、GIF/MP4 是这些帧的排版/编码，不能视为另一次模型推理。素材制作脚本 `scripts/avatar-face-rig-materials.py` 需要 Pillow / NumPy，在仓库根目录传入已保存的 `clean-aligned.png` / `expression-aligned.png` 和输出目录即可重新生成素材。生成工具输出本身不是可确定重跑的模型结果；已保存实际采用的图，避免依赖再次生成。

## 下一步

暂不把通用自动绑定或当前眼部压缩方式接入录课成品。继续沿同原画内部拆层的方向，优先完成一个眼睛的眼白、虹膜、上下眼皮、遮挡毛发和闭眼曲线，逐级检查 0 / 25 / 50 / 75 / 100% 闭合，再扩到另一眼。自然眨眼通过后补四到六种嘴型，再处理头颈网格和轻转头。保留原画的入口可以是一张图；运行内部仍需要层与补画。下一阶段不以全身动作或摄像头接线数量作为进展指标。
