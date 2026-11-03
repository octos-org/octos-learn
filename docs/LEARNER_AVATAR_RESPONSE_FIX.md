# 二维星狐：嘴型行程与头发/耳朵边缘拉伸修正

日期：2026-11-03；基线 `f78b4218`。用户反馈张大嘴时头像仍只小幅开口，并明确澄清拉伸指的是**转头时头发、耳朵等图像边缘**，不能只修五官比例。

## 修改

1. **嘴型输入**：以前将 MediaPipe `jawOpen` 系数直接当绘画行程。现在只对 MediaPipe 做 1.6 倍、有界的行程映射，0 保持闭口；手动/演示与 ARKit 的 0–1 语义保留。`mouthClose=1` 仍完全闭唇。不声称该固定增益已针对用户个人校准。
2. **嘴型实际幅度**：以前口腔素材中央高度只有约 18–19px，满输入仍很小。现在独立设定可见行程上限 48px，大部分向下打开，上唇仅小幅抬起；口腔纹理按上下轮廓重新映射。扩大输出区域，减小张颌时额外缩窄嘴巴的程度。不是单纯加快动画。
3. **头发/耳朵边缘**：以前网格四周的移动权重强制降到零，头内部移动、边界不动，于是靠边的头发/耳朵被拉长；头部内部还有不同深度的位移。本次撤掉水平两侧和顶部的固定约束，让整个头部（包括贴着裁剪边缘的头发、耳朵）采用同一平移/平面侧倾变换，仅在颈部向固定身体过渡。
4. **移动后露出的区域**：用现有画稿的背景颜色初始化顶部露出区域，避免保留另一份静止的头发/耳朵轮廓。不是复制或拉长边缘像素补空白，也没有生成新素材。

画稿四张 PNG 内容不变，仍为正面 `painted-v0.2`；素材元信息已更新运行时说明。当前程序保留轻微左右/上下跟随和侧倾，**不是绕三维轴转出侧脸**。源图已裁掉耳尖，移动后也可能裁切，不能把缺失的边缘内容伪装成已恢复。颈部过渡仍是变形区，修正的是头发/耳朵/面部区域的弹性拉扯，不声称整幅画不存在任何形变。

## 实际对照

- [前后静态对比](avatar-animation-phase-a/mouth-head-response/comparison.jpg)：相同画稿、相同输入参数，左为基线，右为修改后；上排同为 MediaPipe 张颌 0.5，下排同为组合头动。
- [已有真实识别动作的回放对比](avatar-animation-phase-a/mouth-head-response/recorded-input.gif)：同一份此前原生模型实际识别生成的 `real-input/recorded-track.json`，分别驱动旧/新产品绘制器。未重新推理、未开用户摄像头，不是新浏览器验收。110 帧、每帧 100ms，共 11s；GIF 播放速度不代表实时性能。
- [测量报告](avatar-animation-phase-a/mouth-head-response/report.json)、[绘制边界检查](avatar-animation-phase-a/mouth-head-response/render-report.json)、[动画说明](avatar-animation-phase-a/mouth-head-response/animation.json)。

同一合成 MediaPipe 输入，在中央窄条内测量深色/粉色口腔像素覆盖的行数：

| 张颌输入 | 以前 | 修改后 |
|---|---:|---:|
| 0 | 2 | 2 |
| 0.1 | 4 | 10 |
| 0.25 | 6 | 21 |
| 0.5 | 11 | 39 |
| 0.75 | 15 | 48 |
| 1.0 | 21 | 48 |

这是图像测量，闭口的 2 行是唇线；不是用户嘴部的毫米比例，也不是识别准确率。

头部几何检查显式包含 x=0/512、y=0 的裁剪边缘和靠边的头发/耳朵采样点，以及脸部点。八组头动极限中，旧控制场采样点两两距离的最大相对变化约 18.8%；新头部统一变换下为浮点误差范围（约 6.7e-16）。这是对网格控制变换的距离保持检查，**不是“真人效果提升 18.8%”或设备评测**。

## 代码与检查

- `src/learning/avatar/painted-fox.ts`：`paintedJawAmount`、48px 口腔行程、`paintedHeadPoint` 及露出背景处理。
- `src/learning/avatar/painted-fox.test.ts`：相机嘴型单调/有界/中性、手动/ARKit 保持语义、边缘头发/耳朵跟随与两两距离保持、身体不动。
- `scripts/export-painted-fox.ts`：更新嘴型输出区域；自然/复位/非法输入、闭唇覆盖张颌、嘴区外不变、衣服下部不动、无折叠/透明缝与中性连续性检查通过。
- `scripts/avatar-mouth-head-validate.ts`：从指定 Git 基线导出旧产品绘制器、对照实际绘制与几何，支持 `--animation` 回放已有识别片段。旧代码与中间文件只写入 scratch，不作为产品依赖。
- 定向 Vitest **3 文件 / 16 项通过**；TypeScript、修改模块 ESLint 与 `pnpm build:public` 通过，既有分包提示保留。未做浏览器、用户相机或目标设备验收。

复现（已有本机 native Canvas/gifenc 工具目录，不增加产品依赖）：

```sh
export PATH=/opt/homebrew/opt/node@22/bin:$PATH
node_modules/.bin/vite-node scripts/export-painted-fox.ts /private/tmp/octos-2d-preview scratch/avatar-mouth-head/after
node_modules/.bin/vite-node scripts/avatar-mouth-head-validate.ts /private/tmp/octos-2d-preview scratch/avatar-mouth-head/comparison f78b4218 --animation
```

正常本地入口仍为 `https://127.0.0.1:5173/teach/avatar-2d`。修改作用于共享绘画舞台，不改变 M6 服务兼容性或正式播放页接入状态。未创建 PR、未部署、未调用付费服务。
