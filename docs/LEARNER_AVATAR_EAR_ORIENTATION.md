# 耳廓主动转向：四角色修正

日期：2026-11-03。用户指出上一轮耳朵像弹簧弯摆、要求了解动物行为后，继续完成本轮修改。当前分支 `codex/avatar-capture-prototype`；本轮源码、测试、媒体与主交接一并提交，未合并或部署。

## 已接入的结果

原入口 `https://127.0.0.1:5173/teach/avatar-2d`，刷新即可加载。沿用默认开启的“耳朵与毛发自然小动作”，无需摄像头也能观察。

1. 耳朵改为**转向 → 保持 → 回正**。左右耳各自发生，间隔留出静止时间，取消原来的正弦甩动与耳部弹簧反弹。
2. 可见耳廓内部使用统一的局部平面投影：改变朝向时，耳廓和内耳纹理发生有限透视缩短；耳根固定，仅在接合处与周围背景过渡。降低逐行不同旋转造成的软橡胶弯折感。
3. 头动输入给耳廓有限主动朝向调整；头发保留减弱后的被动滞后与回落。取消静止时一直有风般的摆发，只保留偶发、低幅的发梢整理。
4. 四角色各自的时间/幅度不同。狐狸较明确地定向并停留；猫转向较快；兔子较缓、停留更久；小熊猫使用较小转向。小熊猫参数是保守动画选择，**没有声称已取得该物种的耳动测量**。
5. 自然动作时钟从角色加载/开启自然动作时开始，避免打开页面后因浏览器已运行很久而落入不可预期的周期相位。

头脸原画、口型、眉眼绑定、选角与摄像头管线保留；没有重新生成素材，也没有新增产品依赖。定格/动作轨回放仍冻结额外自然动作，便于检查。

## 依据与边界

动物行为依据见[动物耳动调研](LEARNER_AVATAR_ANIMAL_EAR_RESEARCH.md)。本轮把“主动耳廓定向”与“被动发梢随动”分开，没有把猫的反向补偿实验解释成所有动物都必须等量反向转耳。

当前实现仍是**小角度二维近似**：使用同一张正面耳部纹理，投影出耳形与内耳可见面积的变化。没有侧/背耳原画，不能表现真正转到背面的毛色、厚度和遮挡；没有新增真实三维耳模型或任意大角度转耳。大幅后转、压耳等需要额外素材/局部结构，不在本轮伪造。

动画的时长、停留与幅度是面向角色的人工设计，非真实动物频率统计。程序测试证明实现约束，不代表用户已经认可自然度。

## 当前代码与复现

- `src/learning/avatar/painted-secondary-motion.ts`：`paintedEarLook` 为有停留的平台曲线；`paintedEarProjection` 为统一局部投影；耳部以单调响应趋近目标，头发单独积分阻尼弹簧。
- `painted-characters.ts`：每款的耳形与 `looks`（开始、转向、停留、归位、幅度）独立配置。
- `illustrated-avatar-stage.tsx`：角色自然时钟从零开始；隐藏/暂停/释放行为沿用现有控制。
- `scripts/avatar-secondary-validate.ts`：默认输出改到本轮 `ear-orientation-v2/`，保留上一轮已否定的 `secondary-motion/` 历史媒体。检查增加保持期逐像素静止；不再用“耳尖位移越大”作为通过条件。

```sh
PATH=/opt/homebrew/opt/node@22/bin:$PATH node_modules/.bin/vite-node scripts/avatar-secondary-validate.ts /private/tmp/octos-2d-preview
PATH=/opt/homebrew/opt/node@22/bin:$PATH node_modules/.bin/vite-node scripts/avatar-characters-validate.ts /private/tmp/octos-2d-preview scratch/avatar-ear-orientation-regression
```

## 可查看的实际输出

- 星狐耳部近景动画：4.8 秒（媒体已移出仓库，原文件见提交 `30a3e3d5` 的 `docs/avatar-animation-phase-a/ear-orientation-v2/fox-ear-closeup.gif`）
- 星狐自然、单耳转向、回正近景（媒体已移出仓库，原文件见提交 `30a3e3d5` 的 `docs/avatar-animation-phase-a/ear-orientation-v2/fox-ear-detail.jpg`）
- 四款自然动作：12 秒（媒体已移出仓库，原文件见提交 `30a3e3d5` 的 `docs/avatar-animation-phase-a/ear-orientation-v2/idle.gif`）
- 四款头动：7 秒（媒体已移出仓库，原文件见提交 `30a3e3d5` 的 `docs/avatar-animation-phase-a/ear-orientation-v2/following.gif`）
- 四款定格（媒体已移出仓库，原文件见提交 `30a3e3d5` 的 `docs/avatar-animation-phase-a/ear-orientation-v2/idle-poses.jpg`）
- [像素/网格报告](avatar-animation-phase-a/ear-orientation-v2/report.json)

所有媒体均为当前产品绘制器输出，使用模拟时间与头部参数，不是真人摄像头或浏览器截图。

## 完成的检查

7 个相关测试文件 **60 项通过**。覆盖耳根固定、耳平面投影的共线性、开口缩短、保持期无运动、归位单调不反弹、左右独立、脸/衣服不动、发梢回落、重复时间冻结/跳转复位、页面自动动画调度和原录制/配音控制。

四款保持期的最大像素变化为 0；静止转耳时眼鼻嘴检查区与下部衣服最大变化为 0；重复时刻一致。12 秒自然动作与八种极值头动组合的网格面积均为正、实际输出无透明洞。既有四角色表情回归通过，星狐静止表情与已认可提交 `af2b1f08` 差异为 0。

TypeScript、构建、修改模块 ESLint、中英消息对与 diff 检查通过。构建仍有既有 CSS 属性/大包提示；本轮未复测浏览器、真人摄像头或安卓大屏。自然动作/发梢积分历史尚未写入课程包或动作轨，跳转后的物理细节仍可能不同，见上一轮[时间与回放边界](LEARNER_AVATAR_SECONDARY_MOTION.md)。
