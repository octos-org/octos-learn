# 正式星狐：三维模型与面部绑定交付规范

日期：2026-11-02。用途：交给建模/绑定制作人员，或用于后续制作与接入。当前没有正式三维模型，本文件和代码检查通过均不代表美术质量已验收。

## 角色与交付内容

以已确认的 `public/teach-avatars/star-fox/concept-*.png` 为美术参考：原创星狐、蓝银学院服、星形标记，温和且有讲课时的精神感。提供正面、侧面、三分之二角；先确认静态头部比例，再制作完整表情。

交付目录：

```text
star-fox/<version>/
  model.glb                # 自包含运行模型
  rig.json                 # 本规范的通道映射与模型 SHA-256
  preview.png              # 形象封面
  source.blend             # 可编辑源工程，或等效完整源工程
  ownership-and-license   # 来源、使用范围与第三方资产清单
  expression-review       # 单通道/组合表情参考视频与修正记录
```

标准档与低负载档分别交付自己的版本、模型哈希、映射和性能记录，不能只替换同一路径文件。单 GLB ≤10 MB 为首轮交付门槛；贴图尺寸、面数、材质数与形变内存另行报告。文件压缩大小不能代替运行内存或大屏帧率。

## 模型结构

- 使用 GLB 2.0，几何、贴图全部嵌入；这个首轮交付配置不接受外链纹理、数据 URI 或外部缓冲。
- Y 轴向上，角色面向 +Z，采用米制合理尺寸。根节点保持单位变换，避免导出时隐式缩放；头部旋转节点与面部网格命名稳定。
- 节点与形变目标使用 ASCII 字母、数字、下划线，以字母开头，最多 80 字符，所引用节点名唯一。
- 每个被映射的面部网格节点只含一个 primitive。需要多个材质时拆分为独立命名网格，再把同一通道映射到多个网格。
- 形变名通过 `mesh.extras.targetNames` 交付，与 primitive 的 morph target 数量和顺序一致。不要只提供易变化的目标序号。
- 首轮不接受需要外部解码器的必需扩展；契约脚本只放行 `KHR_materials_unlit` 为 required extension。材质外观仍需正式加载器和光照下确认。
- 脸部拓扑、口腔内壁、牙齿、眼皮和眼球完整。狐嘴的鼓包、闭唇、圆唇要专门制作；禁止仅把整张嘴拉伸成一个孔。

GLB 容器、形变目标和自定义 extras 的基础来自 [Khronos glTF 2.0 规范](https://github.com/KhronosGroup/glTF/blob/main/specification/2.0/Specification.adoc)。上述文件预算、命名、通道覆盖与单 primitive 要求是本项目的首轮交付限制。

## 面部通道契约

代码：`src/learning/avatar/rig-contract.ts`。模板：[rig-manifest.template.json](avatar-animation-phase-a/rig-manifest.template.json)。模板的哈希为占位值，**不能直接作为可运行角色清单**。

- 当前 52 个标准通道必须逐一落到 `channels` 或 `unsupportedChannels`，两处不能同时出现，不能遗漏或拼错。
- 基础通道必须实现：`jawOpen`、`mouthClose`、`mouthPucker`、`mouthFunnel`、左右 `mouthSmile`、左右 `eyeBlink`。
- 每个通道可映射 1–8 个 `{ node, morph, gain }`。同一目标只能由一个标准通道驱动；组合修正优先烘焙到绑定资产，若需要额外运行逻辑另立有版本的契约。
- `gain` 范围 `(0, 2]`，运行时输出限制在 `[0, 1]`。缺失的输入通道取 0；没有捕捉能力的通道不可虚构。
- 头部旋转由 `headRotation.node` 指定，以静止姿态为基准，局部 YXZ 欧拉增量；`signs` 对应 pitch/yaw/roll，每项为 ±1。参考工程测试角色用 `[-1,-1,-1]`，正式模型必须通过方向测试确认。
- `modelSha256` 必须匹配实际 GLB 字节，`version` 为显式三段版本。

运行绑定：`src/learning/avatar/rig-binding.ts`，接收已加载且已校验的 Three.js 模型，在绑定时解析节点和目标，每帧仅写权重与姿态；`reset()` 恢复初始姿态。不负责下载或加载 GLB，也未替换现有工程测试角色。

## 自动检查与人工验收

```sh
pnpm exec vite-node scripts/check-avatar-rig.ts path/to/rig.json path/to/model.glb
```

脚本检查 GLB 头/JSON、10 MB 预算、自包含资源声明、首轮扩展限制、哈希、52 通道覆盖、节点与目标名称。**这是接入契约检查，不是完整 glTF 校验器**；交付还必须使用 Khronos glTF Validator 检查几何/访问器/缓冲结构，并实际加载、审查材质、骨架、纹理和动画。

人工审查至少包括：

| 组合 | 通过条件 |
| --- | --- |
| 闭嘴、开口、圆唇、嘴角拉伸 | 嘴唇闭合自然，口腔不漏背景，牙齿不穿唇 |
| 单眼眨眼、双眼眨眼、转头眨眼 | 眼皮遮住眼球，左右正确，无露白跳变 |
| 微笑讲话、张嘴抬眉、皱眉闭唇 | 表情可组合，口鼻不塌陷，不靠全脸拉伸 |
| 左右转头、点头、轻微歪头 | 以颈部合理位置旋转，脸与身体不脱节 |
| 小头像与大屏显示 | 正面/侧面都保留星狐辨识度，眼口仍可读 |
| 失跟/重现、暂停/跳转 | 回到待机平滑，回放可重复，不叠加随机嘴型 |

先使用试验室六组固定合成排练对照；正式角色还要增加单通道扫描与组合修正审查。真人、Apple 对照、目标大屏持续负载仍属于后续设备验收。
