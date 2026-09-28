# Octos Learn main → Makepad macOS 产品迁移清单

> 日期：2026-09-21。基准：应用 main `b670417d54ac517cb9113db7d331e013b45d84cf`，OLL main `2b93d67ffc30075edb3d3f34b848f799a46717f2`。
> 本清单是 AGENT_HANDOFF_CURRENT 第 3 项的交付物：以 main 网页版的界面与操作流程为迁移基准，逐项记录源文件、行为、复用方式与验收方法。
> 标注：**[UI]** 纯展示（原生重绘）/ **[逻辑]** 业务逻辑（移植）/ **[平台]** 平台能力（桥接）。

## 0. 基准事实

- 路由：`/login`、`/`（CourseLauncher 启动器）、`/course/:packId`（重定向）、`/board`（播放页，核心）、`/setup`、`/settings`（src/App.tsx:56-81）。
- 内置课程包（免登录可离线）：`rectangle-area-from-tiles@0.1.5`、`slope-and-intercept@0.1.6`（android/embedded-course-packs.json；archive 来源 https://learn.pitun.cc）。**注意：v6 Rust runtime 已验证的四门课不含这两门，runtime 覆盖扩展是产品化的前置工作。**
- 视觉基调（src/index.css @theme）：深色暖色默认主题，surface `#1a1714`、容器 `#252019`、主 accent `#d4a574`、点缀绿 `#94a36f`、文字 `#e4ddd4`/`#f8f3ed`/muted `#a09689`；白板页画布为浅色纸感、浮层 `rgba(255,253,248,.93)` 毛玻璃、圆角 16-20px；笔色 `#176b62`；字体 Hanken Grotesk / Inter / JetBrains Mono，中文 PingFang SC 回落。

## 1. 页面迁移清单

| # | 页面/分区 | 源文件 | 现有画面/行为 | 复用方式 | 状态 | 验收方法 |
|---|---|---|---|---|---|---|
| 1.1 | 启动器顶栏 | course-launcher.tsx:362-387 | 左 logo+"Octos Learn"；右：已登录=设置+退出，未登录=登录链接 | [UI] 重绘 | 待实现 | 截图对照 |
| 1.2 | Hero 区 | :389-397 | eyebrow+主标题+副标题+「新建空白白板」CTA | [UI] 重绘 | 待实现 | 截图对照 |
| 1.3 | 最近白板 | :399-417 + learning-session-store | 会话卡片网格；继续/重命名/删除 | [逻辑] 本地会话索引移植（Rust 侧文件存储） | 待实现 | 建会话→回首页→继续 |
| 1.4 | 预制课程卡 | :419-463 + CourseCard:134-248 | 封面+年级学科角标+版本 meta+标题描述+状态行+预览/开始互动/继续学习按钮 | [UI+逻辑] 目录合并去重逻辑移植；内置目录随包 | 待实现 | 两内置课卡片与 web 一致 |
| 1.5 | 课程包加载 | use-course-pack.ts + course-pack-loader.ts:200-253 | 内置资产→已安装→网络三级回退；校验 packId/version/SHA-256 | [逻辑] 移植（macOS 先做内置+网络两级） | 待实现 | 断网内置可播；SHA 校验 |
| 1.6 | 播放页骨架 | learning-page.tsx:245 → learning-workspace.tsx:433 | 全屏黑底 main，白板铺满，控件全悬浮 | [UI] | 待实现 | 截图对照 |
| 1.7 | 页面顶角按钮 | learning-page.tsx:719-740 | 左上圆形毛玻璃：返回首页（先刷盘笔迹）、设置 | [UI+逻辑] 刷盘改进度存储 | 待实现 | 返回→进度保留 |
| 1.8 | Workspace 顶栏 | learning-workspace.tsx:3036-3153 | 左：标题；中：播放控制组；右：语音/摄像头按钮（预览模式=「开始互动学习」） | [UI]；语音/摄像头首版占位禁用 | 待实现 | 截图+控制可用 |
| 1.9 | 播放控制 | :3044-3106 + use-oll-lesson-runtime.ts | 播放/暂停/下一 Beat/重播当前 Topic/旁白开关/生成中转圈 | [逻辑] Rust Session 已有 play/pause/tick；nextBeat/restart(topic) 需在 runtime 补 | 部分可复用 | 与 web 逐操作对照 |
| 1.10 | 手写工具栏 | oll-lesson-runtime.tsx:3083-3231 | 浏览/书写/擦除/框选/调色/全选/撤销/重做+状态行；粗细菜单 top:140 | [UI+逻辑] Ink 已有 batch/undo/redo；**橡皮擦、框选、持久化是缺口** | 部分可复用 | 书写-撤销-重做-重进恢复 |
| 1.11 | 本课目录 | oll-course-outline.tsx:68-209 | Topic→Step→Beat 树；查看/从此播放；完成/当前/未学状态 | [UI+逻辑] 需 runtime 暴露 outline 结构（缺口） | 待实现 | 跳转后状态一致 |
| 1.12 | 小章鱼老师 | octos-teacher.tsx:21-130 | 右下 94px 有机圆形头像+状态文字+旁白气泡（markdown） | [UI] 首版简化：圆形头像+气泡；皮肤动画后置 | 待实现(简化) | 气泡随 beat 更新 |
| 1.13 | 学生输入坞 | student-input-dock.tsx:80-165 | 底部居中：建议问题 chips+图片/摄像头/麦克风按钮+文本框+发送 | [UI] 首版占位禁用（依赖后端） | 占位 | 截图对照+禁用说明 |
| 1.14 | 变量控制面板 | oll-lesson-runtime.tsx:3433-3610 | 世界坐标定位；滑块+数值+−/+/复位；start/update/commit 协议；老师演示锁定 | [逻辑] Rust 已有 set_variable；面板 UI 待建 | 待实现 | 拖滑块白板联动 |
| 1.15 | 课程大纲外其他面板 | 问题卡片/loading 卡/动手任务面板 | 世界坐标卡片 | 后置（依赖后端/任务系统） | 暂缓 | — |
| 1.16 | 错误/告警条 | learning-workspace.tsx:3298-3322 | 底部错误轮播+告警条 | [UI] 简化实现 | 待实现 | 触发加载错误显示 |
| 1.17 | 登录页 | login-page.tsx + auth-context.tsx | 邮箱验证码/admin token/solo 三方式 | 暂缓（首版本地 solo 模式直入） | 暂缓 | 列为差异项 |
| 1.18 | 设置页 | settings-page.tsx:95 | 左侧导航+Profile/Voice/Companion/LLM/API Keys/Auth tabs | 暂缓 | 暂缓 | 列为差异项 |
| 1.19 | 语音交互 | use-voice-conversation.ts 状态机+VAD+ASR+TTS | idle→starting→listening→thinking→speaking | 暂缓（macOS 无录音链路；Android 侧已有 Java 复用） | 暂缓 | 列为差异项 |

## 2. 服务/数据迁移清单

| # | 服务 | main 实现 | macOS 方案 | 状态 |
|---|---|---|---|---|
| 2.1 | 课程播放引擎 | BrowserLessonSession(TS) | **Rust oll-runtime Session**（已验证，需扩课程覆盖） | 可复用 |
| 2.2 | 课程包格式 | .ocpack ZIP+manifest+SHA-256 | 随包内置归档，Rust 侧解 ZIP（或打包期预解） | 待实现 |
| 2.3 | 播放进度 | LocalPlaybackStore localStorage | progress_store.rs 文件存储（已有）+ 旧格式读取（已有） | 可复用 |
| 2.4 | 会话索引 | learning-session-store localStorage | Rust 侧会话索引文件 | 待实现 |
| 2.5 | 笔迹 | js-draw SVG 文档+SHA-256 | oll-runtime Ink（内存）；**持久化/橡皮/回放合并缺** | 部分 |
| 2.6 | 旁白 TTS | 包内音频>原生桥>API | 首版：包内音频（macOS 播放）或静音+文字 | 待实现 |
| 2.7 | 目录/账号/后端 | REST+WS UI Protocol | 暂缓；内置课离线优先 | 暂缓 |

## 3. 与 main 的已确认差异（首版产品流程）

1. 无登录/设置/语音/摄像头/输入坞功能——入口以禁用占位呈现，不隐藏缺失。
2. 小章鱼皮肤动画简化为静态圆形头像。
3. 笔迹持久化与橡皮擦在首版之后补齐（当前 Ink 无 erase/持久化）。
4. 课程范围限于两门内置课（以 runtime 实际覆盖为准）；不支持的课程结构显式报错而非静默跳过。

## 4. 验收方法总则

- 同一课程在 web（main）与 macOS 应用并排运行，逐操作对照白板状态（参考 playback:conformance 思路）。
- 截图对照每个页面/分区；允许字体渲染与毛玻璃质感的平台差异，不允许布局结构与功能入口缺失。
- 进度：播放→退出→重进→恢复到同一游标。
- 性能阈值沿用方案 §8.3：先取基线再定阈值，不倒推。

---

## 5. v1 实施状态更新（2026-09-21，macOS 产品应用 v1 已交付）

详见 [OLL_MACOS_PRODUCT_V1.md](./OLL_MACOS_PRODUCT_V1.md)（分支、证据、差异、复现）。

- 已实现：1.1-1.4（启动器全部，含最近白板简化版）、1.6-1.10（播放页骨架/顶角按钮/顶栏/播放控制主体/手写工具栏主体）、1.12-1.14（小章鱼简化、输入坞占位、变量面板）、1.16（错误条）。
- 部分实现：1.5（仅内置包离线，无网络目录）、1.9（播放/暂停/旁白开关可用；下一 Beat/重播 Topic 禁用待 runtime）。
- 未实现（禁用占位）：1.11 本课目录、1.15 任务/问题面板、1.17 登录、1.18 设置、1.19 语音。
- 2.x：2.1 可复用（已接入）、2.2 已实现（内置包校验解压）、2.3 已实现、2.4 简化（一课程一档）、2.5 部分（内存笔迹+撤销重做，无持久化/橡皮/框选）、2.6 未实现（无音频）、2.7 暂缓。
