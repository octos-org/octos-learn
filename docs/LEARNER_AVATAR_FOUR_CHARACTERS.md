# 四款学生虚拟形象：同页互动预览

日期：2026-11-03。当前分支 `codex/avatar-capture-prototype`。用户已认可完整耳朵/眉眼修正后的星狐，要求提交推送并扩展原有样稿，随后明确再增加一位女性角色，最终为四款。

## 角色与原稿

| 角色 | 来源与外观 | 运行素材目录 |
|---|---|---|
| 星狐 | 已认可的橙发、蓝色星图学院服；本轮保持既有结果 | `public/teach-avatars/star-fox/painted-v0.2` 与 `painted-v0.3` |
| 小熊猫 | 找回早期学生样稿：栗红发、黑/酒红学院服、金色罗盘徽章 | `public/teach-avatars/red-panda/painted-v0.1` |
| 白兔 | 找回早期学生样稿：白发长耳、珊瑚红学院服、红色星饰蝴蝶结 | `public/teach-avatars/white-rabbit/painted-v0.1` |
| 月猫 | 用户新增的女性角色：银紫发、青蓝眼、紫色月纹学院服 | `public/teach-avatars/moon-cat/painted-v0.1` |

原三张细腻样稿实际是星狐、小熊猫和白兔，星狐已在这组三款之中，不是另外三位。原小熊猫与白兔样稿原先只在本地 imagegen 输出目录，现已保存为各自目录下的 `concept-original.png`。新月猫是根据用户要求新增的原创女性形象。

新画稿全部使用**内置 imagegen**，分别生成正面完整画面与内部眼口眉底画。完整提示词、最终生成文件名、裁切/平移、哈希及文件大小，分别保存在三款素材目录下的 `asset-info.json`，没有使用 CLI、项目 BYOK 或实时图像生成接口。

## 页面行为

仍在正常本地入口 `https://127.0.0.1:5173/teach/avatar-2d`，刷新后顶部可选四款带缩略图的角色。

- 摄像头、手动滑杆、定格检查、动作回放沿用所选角色。
- 切换角色保留当前表情/回放状态，不重启摄像头，不自动请求权限。
- 下方配音与嘴型排练同步切换角色，保留已导入音频与进度。
- 录动作期间禁用角色切换，避免一段动作里角色突然改变。
- 新角色加载失败时显示失败状态；旧角色延迟加载回调不会覆盖新角色。

这只是当前互动预览页的角色目录。**没有把 `presenters.ts` 的占位目录、正式“看我的课”、课程包存储和 M6 播放页一并改为四角色系统。** 动作轨保存参数，可以用不同角色重放；当前没有在轨文件中保存所选角色 ID。

## 绑定与代码

- `painted-characters.ts`：四款 ID、名称、资源与各自的眼部几何、虹膜遮罩、眉线和嘴唇曲线。
- `painted-eyes.ts`：支持传入角色自己的双眼拟合；内外眼角依据左右眼而非固定对象身份判断。
- `painted-fox.ts`：保留原默认行为，新增可选 `PaintedFaceRig`；新角色复用已认可的口腔、头动、耳尖/发梢随动与脸部绘制管线。
- `illustrated-avatar-stage.tsx`：按角色加载资源和创建绘制器，切换后释放旧绘制器和回调。
- `avatar-lab-page.tsx` / `avatar-audio-preview.tsx`：共享当前选择，语音媒体本身不因角色更换而重新生成。
- `prepare-painted-character-materials.mjs`：把生成画面规范到 704px，按 `(96,192,512,512)` 裁出脸部纹理；规范底画到 512px，不用于绘画或生成角色。

每款均由完整画面驱动，不是把狐狸重新着色或只替换一张静态图。新角色仍需手工拟合，尚无任意照片自动绑定能力。小熊猫窄眼的纹理区域另外补足眼皮羽化余量，避免开始眨眼/皱眉时出现跳变。小熊猫底画保留永久的白色眉部毛色，避免将其当成可移动眉线抹除。

## 实际输出与检查

- [四款自然状态](avatar-animation-phase-a/four-characters/lineup.jpg)
- [四款同输入动作动画](avatar-animation-phase-a/four-characters/preview.gif)
- [自然、闭眼、皱眉开口、头动对照](avatar-animation-phase-a/four-characters/poses.jpg)
- [完整像素报告](avatar-animation-phase-a/four-characters/report.json)

媒体是当前产品绘制器的真实本机输出，使用确定的模拟参数；不是浏览器截图或摄像头验收。

四款均通过自然图一致、嘴外像素不变、闭唇优先、非法值/复位、身体下部不变、八种头动极值无折叠或透明洞、表情零点连续、录制序列化回放一致检查。皱眉验证包含实际眼眉像素变化。

将星狐与用户认可的提交 **`af2b1f08`** 的旧眼部和绘制器在同输入下逐像素对照，自然、闭眼、皱眉开口、头动/视线、圆唇/抬眉组合的最大差异为 **0**。

6 个相关测试文件共 **52 项**通过，包含切换角色不重启捕捉/不丢当前表情、旧加载回调隔离与原音频排练回归。构建、修改模块 ESLint、中英消息对检查通过。没有浏览器、真人摄像头或安卓大屏的新验收。

复现输出：

```sh
PATH=/opt/homebrew/opt/node@22/bin:$PATH node_modules/.bin/vite-node scripts/avatar-characters-validate.ts /private/tmp/octos-2d-preview
```

依赖目录仅是本机 Canvas/GIF 素材工具，未增加产品依赖。仍是有限二维随动；大角度侧脸、手臂、真实物理头发、音素嘴型不在本轮范围。

## 提交与其他 agent 协作

星狐确认版与此前研究记录已提交 **`af2b1f08`**，已推送到 `origin/codex/avatar-capture-prototype`；新三角色是该提交后的第二批修改。没有创建 PR、合入 main 或部署。

另一个 agent 研究手势白板时，应从该分支建立自己的分支和独立 worktree，避免直接写入当前素材/渲染文件。[可转发的任务 prompt](LEARNER_GESTURE_WHITEBOARD_RESEARCH_PROMPT.md)已单独保存。头像当前技术是 **MediaPipe Face Landmarker + Canvas 2D 局部纹理/网格变形**；手势研究对应 **MediaPipe Hand Landmarker**。
