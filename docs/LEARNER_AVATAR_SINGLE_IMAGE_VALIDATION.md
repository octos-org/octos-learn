# 单张星狐插画驱动：LivePortrait 实测

日期：2026-11-02。对应用户授权“按照建议先做验证”。手臂暂缓，仅验证自然表情、闭眼、开口、小幅转头和复位。**结论：推理流程跑通，但当前两张星狐输入在已测模型与参数下未通过画面质量检查，不接入录课界面。**

## 可以直接查看的实际输出

- 原图 / 中性输出 / 闭眼目标 / 开口目标对照（媒体已移出仓库，原文件见提交 `30a3e3d5` 的 `docs/avatar-animation-phase-a/single-image/human-comparison.jpg`）
- 人像版与动物版对照（媒体已移出仓库，原文件见提交 `30a3e3d5` 的 `docs/avatar-animation-phase-a/single-image/human-animal-comparison.jpg`）
- 约 5.3 秒离线短片（媒体已移出仓库，原文件见提交 `30a3e3d5` 的 `docs/avatar-animation-phase-a/single-image/validation.mp4`）：左侧为固定单张源图，右侧为真实模型逐帧输出；闭眼→开口→左右轻转头→复位。以 6 FPS 回放，**不能用播放速度代表实时生成速度**。
- [完整短片报告](avatar-animation-phase-a/single-image/clip-report.json)：每帧控制参数与耗时、模型校验和、源图哈希与复位比较。

这些结果没有使用此前的身体拼件、局部五官 PNG 或手工合成嘴眼。没有用 image_gen 代替 LivePortrait 的输出，也没有添加插帧来伪装实时速度。对照图与短片中的并排排版仅用于检查，不参与模型生成。

## 输入与环境

1. 主要输入是现有 `concept-idle.png` 的同一张完整插画。用两眼位置将眼线转正，随后裁出面部与肩颈，背景铺统一浅色、缩放至 512×512。这是固定的模型预处理，未重新绘制角色。保存了[实际输入 PNG](avatar-animation-phase-a/single-image/source.png)与[预处理记录](avatar-animation-phase-a/single-image/input-manifest.json)。
2. 补充输入为此前独立正面头图的单张面部裁剪。两张输入均运行了人像版与动物版，以减少只因一个裁剪不合适而下结论的风险。完整大耳朵、身体运动不在本轮验证范围。
3. 使用[官方 LivePortrait 仓库](https://github.com/KlingAIResearch/LivePortrait)，实际 checkout `9b294b3d0536135442ea73cb01e6cb3ca7029dd3`。官方人像模型与 animal v1.1，共九份必要权重，逐一与官方 Hugging Face 文件清单的 SHA-256 校验一致。完整来源和校验和见[模型清单](avatar-animation-phase-a/single-image/model-manifest.json)。
4. 本机为 Apple Silicon / arm64，Python 3.9.6、PyTorch 2.3.0。PyTorch 2.3 的 3D 模块留在 CPU，2D 动作提取和图像生成模块使用 Metal，CPU 固定六线程。运行时访问本机图形加速，**不是在 NVIDIA / TensorRT 环境执行 FasterLivePortrait**，也不是优化后的最终实时性能测试。
5. 不使用 InsightFace 或 X-Pose 检测器，采用人工预裁剪输入，仅验证核心生成模型；没有向模型服务上传插画、视频、照片或录音。没有打开摄像头，没有采集用户或儿童数据，没有租用 GPU、调用收费接口或生成新配音。

依赖、第三方代码和约 1 GB 权重均保存在忽略的 `scratch/avatar-single-image/`，未加入产品依赖、静态资源或课程生成路径。[依赖版本](avatar-animation-phase-a/single-image/requirements.txt)供复现使用。

## 实际检查及观察

| 项目 | 观察 | 判断 |
|---|---|---|
| 中性外观 | 人像版保留大体角色和配色，但眼形、毛发及衣服纹理已有重建变化；动物版更明显地模糊星徽。 | 不是原画像素级保留，动物版细节损失明显。 |
| 闭眼 | 人像版出现模糊、变暗的半闭眼；动物版可压低眼皮，但有左右不一致与残余虹膜。 | 未通过自然闭眼检查。 |
| 开口 | 人像版生成了不符合该角色设计的牙齿；动物版反应较弱，官方开口模板还带来服装变化。 | 未通过嘴型质量检查。 |
| 左右转头 | ±10° 相对转头能连续改变脸部轮廓，但伴随整幅图的细节改变。 | 可观察到运动，整体质量尚不足以集成。 |
| 参数归零 | 短片最后重新推理的中性帧与首个中性推理帧最大像素差为 0。 | 可回到模型自己的中性输出；这不等于还原原始插画。 |

短片中性输出与输入 PNG 的平均逐通道绝对像素差约 12.71/255。这只是证明模型会重建图像的描述数据，**不是画面质量分数或身份相似度分数**。

为检查是否是控制代码错误，另外运行官方 `wink.pkl` / `open_lip.pkl` 动作模板及官方编辑器的眨眼位移，并用上游自带人物油画裁剪作对照：人物能响应闭眼和开口，星狐响应明显较差。对照人物仅在本机诊断使用，没有加入产品或本文媒体。动物版依照上游默认仍共享人像 retargeting 模块，其在星狐上的适配未解决；不能把当前失败推广成所有单图模型都不可用。

诊断包括两输入×两模型×六姿态共 24 次输出、官方动作模板与人物对照共 15 次输出，以及短片 32 次输出，合计 **71 次真实推理**。其中一次负眼睛目标比值是超出官方滑杆范围的诊断探测，未用于合格判定或最终短片；官方范围内的闭眼目标同样没有达到要求。数据见同目录 `probe-*.json` / `driver-probe-*.json`。

## 运行速度与媒体校验

- 最终 32 帧短片，本机当前配置单帧推理平均 **3.945 秒**、中位数 **3.926 秒**、p95 **4.233 秒**，约 0.25 FPS。该计时排除采集、网络、编码和显示，不能直接用于其他 Mac、安卓电视或优化后实现的速度预测。
- 在当前配置下不满足实时摄像头跟随。因为画面质量已经未通过，本轮没有继续为此模型做部署或速度优化。
- MP4 编码后实际解码检查 32 帧、800×480、6 FPS，抽样确认不同动作输出不同画面。GIF 镜像预览保留相同内容和总时长，编码器合并了连续相同帧；没有将重复帧当作额外模型输出。
- 中文标注在第一次编码时发生字体回退，检查后改用本机中文字体并重新导出。最终媒体已再次检查。

## 复现

仓库脚本 `scripts/avatar-single-image-validate.py` 不依赖产品服务，不启动另一个网页或测试账号。先在隔离环境按上面的版本清单准备依赖，checkout 指定上游提交，将清单中的模型放到其 `pretrained_weights/` 并校验，再执行：

```sh
PYTORCH_ENABLE_MPS_FALLBACK=1 scratch/avatar-single-image/venv/bin/python \
  scripts/avatar-single-image-validate.py \
  --checkout scratch/avatar-single-image/LivePortrait \
  --source docs/avatar-animation-phase-a/single-image/source.png \
  --output scratch/avatar-single-image/reproduction \
  --manifest docs/avatar-animation-phase-a/single-image/model-manifest.json \
  --model human --device hybrid --mode clip
```

脚本会先校验五份实际使用的权重，再生成逐帧 PNG、参数及真实耗时。`--mode stills` 提供六姿态检查；`--model animal` 使用动物核心模型；`--device cpu` 明确选择纯 CPU。当前运行的是离线合成参数序列，没有声明完成摄像头或浏览器整页验收。

## 选型结论

暂不把 LivePortrait 当前通用模型作为星狐正式面部动画方案。下一步优先验证调研中的“同一张完整画稿→五官图层/补全→正式二维变形绑定”，以 VTube Studio / Live2D 式质量为参照，先限定在面部。它仍满足只需准备一张统一原画的制作入口，但运行内部存在图层；如果内部零分层是硬要求，需要继续评估其他生成模型或针对星狐的训练，当前不能承诺质量与本机性能。

本轮只有验证脚本、媒体和交接记录；应用舞台未替换，未推送、合并或部署。手臂继续暂缓。
