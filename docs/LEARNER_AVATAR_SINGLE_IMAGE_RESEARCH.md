# 单张插画与直播式二维面部动画：调研

调研日期：2026-11-02。用户否定当前分件舞台的画面质量，询问单张图驱动及直播头像实现，并明确手臂暂时不考虑。当前范围收敛到眨眼、开口、眉毛、视线和小幅头部运动。本文为网上一手资料核查，未实际运行候选项目、未上传用户素材、未产生服务费用；当前应用代码未因本次调研改动。

## 直播头像的实际流程

可核实的成熟实例是 [VTube Studio](https://denchisoft.com/)：摄像头或手机识别表情，映射到预先制作的 Live2D 模型参数，再实时渲染。其[官方 API](https://github.com/DenchiSoft/VTubeStudio)也公开了跟踪参数和模型参数的读取/注入。捕捉与角色绘制是两个独立环节；本项目已有面部参数通道，后续可保留捕捉、录制、回放基础，替换不合格的角色素材和渲染方案。

一张完整插画作为输入，与运行资产完全不分层，是不同约束。[Live2D 官方素材分离教程](https://docs.live2d.com/en/cubism-editor-manual/divide-the-material/)说明需要将五官等分层，并补画运动后会露出的区域；[面部自动生成](https://docs.live2d.com/en/cubism-editor-manual/face-auto-edit/)同样要求已准备好的部件。网格让插画局部连续变形；闭眼/口腔/遮挡后的皮肤需要素材或生成模型提供。图层不应形成肉眼可见的拼接感，上一轮未做到这个质量要求。

## 候选路线及实际限制

| 路线 | 一手资料确认的能力 | 对本项目的判断 |
|---|---|---|
| Live2D + VTube Studio 作为质量基线 | 成熟面部实时驱动，支持摄像头和手机。Cubism 有 [Web / Android 官方支持](https://docs.live2d.com/en/cubism-sdk-manual/platform/)。 | 最适合作为直播级表现的参照；网页产品需使用渲染 SDK 或另行适配，不能把桌面 VTube Studio 直接当成网页组件。需要正式五官绑定。安卓 WebView 和大屏速度仍需实测。 |
| [LivePortrait](https://github.com/KlingAIResearch/LivePortrait) / [FasterLivePortrait](https://github.com/warmshao/FasterLivePortrait) | 单张肖像可由视频驱动；后者作者报告 RTX 3090 + TensorRT 的完整单帧处理达 30+ FPS。 | 适合验证真正不人工拆图的生成式面部效果。官方 Mac 路径不支持动物模式，拟人星狐是否适用需测试；不能将独显成绩推断成 Mac 或电视速度。 |
| [Talking Head Anime 4](https://pkhungurn.github.io/talking-head-anime-4/) | 单张正面动漫插画，经角色专属训练后可实时运行；有[滑杆](https://pkhungurn.github.io/talking-head-anime-4/supplementary/manual-poser-demo/index.html)和[摄像头](https://pkhungurn.github.io/talking-head-anime-4/supplementary/webcam-demo/index.html)浏览器演示。 | 适合体验与技术参考。作者 README 说明模型是 CC BY-NC 4.0、浏览器转换代码未发布，每个新角色需要训练。因此不能直接认定为本产品可采用的现成方案。 |
| [See-through](https://github.com/shitagaki-lab/see-through) + [Anime2.5DRig](https://github.com/852wa/Anime2.5DRig) | 前者从同一张动漫图生成补全遮挡区域的分层 PSD；后者可在浏览器自动绑定 PSD、驱动眨眼/口型/眉毛等。 | 值得作为小团队的素材和绑定流程候选，但仍是内部图层方案。See-through 作者明确分层不等于完成 Live2D；自动闭眼/嘴型和锚点对星狐可能不合适，必须实际检查，不能把 README 的能力描述当作质量验收。 |

许可核查：[LivePortrait LICENSE](https://github.com/KlingAIResearch/LivePortrait/blob/main/LICENSE)要求产品使用时移除/替换 InsightFace 的受限检测模型；本项目已有 MediaPipe，但替换仍需适配验证。[THA4 README](https://github.com/pkhungurn/talking-head-anime-4-demo)明确区分 MIT 代码与非商业模型。这里只记录项目声明，不据此给出所有依赖可商用的保证。

另查了 [PersonaLive](https://github.com/GVCLab/PersonaLive)、[Wan-Animate-2](https://github.com/Wan-Video/Wan-Animate-2)、[CartoonAlive](https://github.com/Human3DAIGC/CartoonAlive) 和 [Bunraku](https://github.com/SparcAI-Inc/Bunraku)。有研究展示不代表已有可直接集成的轻量客户端：PersonaLive README 有学术研究限定；Wan 的公开默认配置面向多卡服务器；后两者当前代码仓主要为项目说明，未据此获得可运行完整推理代码。当前面部小范围验证不依赖这些项目。

## 建议的验证顺序

1. 先以成熟 Live2D 直播头像建立面部质量参照：闭眼无重影、嘴型连贯、轻转头轮廓稳定。暂不扩展手臂，也不再用测试数量代表画面质量。
2. 固定同一张高质量、正面自然表情的星狐源图，身体保持完整静止。比较单图生成式（LivePortrait）与同图分层/二维绑定两条短样本路径；不再以新生成的身体部件组合替代整体设计。
3. 先检查自然→闭眼→张嘴→轻转头→复位这段短样本，再接入现有摄像头通道。重点检查画风是否保持、五官是否漂移和复位是否还原，而非只检查是否有动画。
4. 生成式路线需要额外 GPU / 推理环境，当前没有安装或租用；本机与大屏性能都未验证。单图内部零分层若是硬要求，应走生成式验证，并接受硬件适配存在不确定性。若目标是整体插画无拼接感且客户端轻量，优先验证同图分层 + 正式二维绑定。

候选选择是工程判断，不是实际星狐效果结论。下一次交付应是候选方案真实输出的短样本及明确的失败项，不是重复制造已经被用户否定的拼件预览。
