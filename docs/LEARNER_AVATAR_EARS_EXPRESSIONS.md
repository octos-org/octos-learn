# 星狐：完整耳朵、头发随动与眉眼表情

日期：2026-11-03。用户最新选择是以现有星狐继续优化，本轮不扩展卡通化研究线。入口仍为 `https://127.0.0.1:5173/teach/avatar-2d`，现有 HTTPS 5173 开发服务读取当前工作区；刷新即可加载。没有新建实例、账户或数据库。

## 实际改变

1. **补全耳朵**：原 `painted-v0.2/source.png` 的耳尖直接被 512px 裁切。使用内置 imagegen 补绘外围，制作 `painted-v0.3/portrait-extended.png`（704×704），留出完整双耳与摆头余量。原 512×512 画稿放在新画面 `(96,192)`，恢复原脸部像素，避免换脸、重新绑定或重新生成全部表情素材。仅旧裁切边缘的 22px 顶部和 12px 两侧做过渡，脸部不混合。素材来源、完整提示词与处理方法见 [asset-info.json](../public/teach-avatars/star-fox/painted-v0.3/asset-info.json)。
2. **耳朵/头发随动**：扩展后的整幅画面参与统一头部变换，不保留静止的耳尖；在耳根以上和外侧发梢加入小幅局部弯动。脸部保持刚性，颈部平滑接回固定衣服。局部附加位移在测试极值下小于 8px；不是物理弹簧，也不生成侧脸。随动只依赖当前姿态，录制回放、跳转与复位均可确定重现。
3. **皱眉与微表情**：眉毛下降联动内侧上眼皮，呈现可见的紧张眼形；加强眉毛内外侧的独立移动。修复眉毛区域覆盖上眼皮变化的问题：两者区域重叠，原先直接写入眉毛整块图像会恢复旧眼皮，现在只叠加眉毛变化的像素差。扩大原眉/上眼皮的清除范围，减少旧轮廓残留。MediaPipe 皱眉系数增益 1.6，手动/ARKit 保留直接控制；左右独立。页面新增“疑惑”“担心”组合，和摄像头、滑杆、回放共用绘制器。
4. **口腔轻量清晰化**：将原口腔的小纹理从双线性改为双三次采样，使用预乘透明度，约束颜色避免透明边缘产生光晕。张嘴幅度与口腔形状保持现有语义。改善有限，没有新增口腔原画细节、牙齿或音素嘴型。

## 素材与绘制坐标

- `painted-v0.2` 的四张 512px 眼口眉素材保留；只新增扩展完整画面。
- `PAINTED_FOX_ASSETS.extended` 加载新画面；舞台等五张素材全部加载后才绘制。
- `PAINTED_FOX_VIEW = {size:704,x:96,y:192,frame:736}`。本轮验证以 736px 输出，在 `(16,16)` 显示 704px 画面；旧脸部坐标到输出坐标加 `(112,208)`。
- `painted-fox.ts` 仍在旧 512px 坐标处理眼口眉，每帧仅把 `(128,128,272,210)` 面部区域放回扩展完整立绘；该区域与原画像素一致，没有可见块边。
- 头动网格现在覆盖整个 704px 画面，22×22；`paintedMotionPoint` 先加入耳尖/外发梢随动，再调用刚性 `paintedHeadPoint`。颈部的 340–400 衰减仍使用旧脸部坐标。
- 嘴部放大采样不改变张嘴最大行程、闭唇优先级和 MediaPipe 张颌增益。

## 可直接查看的实际程序输出

- 8 秒随动与表情动画（媒体已移出仓库，原文件见提交 `30a3e3d5` 的 `docs/avatar-animation-phase-a/ears-expressions-v2/preview.gif`）
- [完整耳朵与八种姿态](avatar-animation-phase-a/ears-expressions-v2/poses.jpg)
- [自然 / 皱眉脸部对照](avatar-animation-phase-a/ears-expressions-v2/frown-detail.jpg)
- [嘴部采样前后放大](avatar-animation-phase-a/ears-expressions-v2/mouth-detail.jpg)
- [像素验证报告](avatar-animation-phase-a/ears-expressions-v2/report.json)

上述媒体由**当前实际产品 Canvas 绘制器**输出，动画使用确定的模拟参数，不是真人摄像头视频或浏览器截图。嘴部前后对照使用 `51acb03f` 的旧绘制器与当前绘制器，保留相同 512px 面部素材和张嘴参数。

## 验证与复现

本轮 4 个现有测试文件共 **42 项**通过；构建、修改文件 ESLint 与中英键检查通过（2842 对）。构建仍有既有的 CSS 属性和大包警告，本轮没有处理这些无关问题。

实际像素检查包括：自然状态等于扩展素材、原脸部不变、张嘴不影响嘴外像素、闭唇优先、左右眉眼独立、闭眼不受紧张系数影响、眉毛叠加不覆盖下方眼皮、极值头动无折叠/透明洞、衣服下部不变、非法值回退与复位。皱眉在可见眼皮区有 1910 个像素的差异超过 8 色阶；不是只断言通道数值存在。五类表情趋于零时无像素跳变；录制/序列化/采样回放与直接输入一致。

生成素材准备和完整验证分别执行：

```sh
node scripts/prepare-painted-fox-extension.mjs /private/tmp/octos-2d-preview /绝对路径/exec-fbb2c9b1-ec68-457e-b7b1-f9ce3c0d4345.png
PATH=/opt/homebrew/opt/node@22/bin:$PATH node_modules/.bin/vite-node scripts/avatar-ears-validate.ts /private/tmp/octos-2d-preview
```

工具目录仅为本机素材导出依赖（`@napi-rs/canvas`、`gifenc`），没有增加产品依赖。本机原生绘制时间记录在报告中，不能当作浏览器或安卓大屏 FPS。本轮未进行浏览器、摄像头或电视复验，也不要求用户开启这些工具。

此前 `export-painted-fox.ts`、`avatar-expression-validate.ts`、`avatar-mouth-head-validate.ts` 等导出脚本的像素断言仍针对旧 512px 画面，属于历史基准。本轮以 `avatar-ears-validate.ts` 为验证入口，不要把旧固定坐标直接用于当前 704px 布局。

当前结果是工作区修改；没有创建 PR、合入 main 或部署。M6 正式录课/看课接入状态没有因此变化，仍见[总交接文档](LEARNER_AVATAR_HANDOFF.md)。
