# Octos Learn 本地开发交接

历史正文更新日期：2026-09-06

2026-09-27 白板布局与镜头集成收尾见[布局收尾记录](course-runtime-quality/whiteboard-closeout-2026-09-27/REPORT.md)。Claude 的九门预制课程审查已整合，八段旁白已重录，[内容与公网发布收尾记录](course-runtime-quality/nine-course-content-closeout-2026-09-27/REPORT.md)提供最终版本、包哈希、测试与异机 CLI 接手说明。下文 09-06 部署版本仅为历史快照，不能用作当前公网版本判断依据。

这份文档用于公网版本完成后继续本地迭代。部署、迁移和服务器运维仍以
[公网部署手册](PUBLIC_DEPLOYMENT_RUNBOOK.md) 为准；这里重点说明当前代码基线、
各仓库边界、本地启动方式，以及修改新功能时需要保留的行为。

## 历史状态（2026-09-06）

- 公网地址：<https://learn.pitun.cc>
- 公网前端仍运行 `octos-learn` 提交 `4f361c3`；数学质量改进已合并到 `main`，
  收尾提交为 `0634a85`，尚未部署。
- 公网 Octos 后端：提交 `99f43d6a`，对应
  [octos-org/octos#2227](https://github.com/octos-org/octos/pull/2227)
- 公网后端、Hosted TTS 和 Nginx 均已通过健康检查。
- 自由注册、用户数据隔离、新用户设置白板、内置 Learning Coach、课程生成、
  课程回放、个人/平台 TTS、摄像头图片恢复和私有 ASR 已完成这一阶段的联调。

Octos PR #2227 已开启自动合并，但截至本文更新时仍在等待上游审核。它没有阻塞
当前公网版本，因为服务器已经运行并验证了该提交；在它合并前，本地联调不要把
Octos 随意切回不包含该提交的 `main`。

Learning Coach 的 profile 模型继承已通过
[PR #13](https://github.com/alan0x/learning-coach/pull/13) 合并；数学质量改进已通过
[PR #14](https://github.com/alan0x/learning-coach/pull/14) 合并，当前对应 merge commit
`b26e49d`。OLL 数学 Runtime 改进已通过
[PR #7](https://github.com/alan0x/octos-lesson-language/pull/7) 合并，对应 merge commit
`b0209f8`。未来修改课程生成或 OLL 时，应从各仓库最新 `main` 建立新分支。

本地恢复的实际运行状态、macOS 构建修复和测试限制见
[本地开发状态](LOCAL_DEVELOPMENT_STATUS.md)；数学质量方案与最终结果分别见
[数学质量优化方案](MATH_QUALITY_IMPROVEMENT_PLAN.md)和
[数学质量实施状态](MATH_QUALITY_IMPLEMENTATION_STATUS.md)。

## 课程重复内容修复约束（用户明确要求，2026-10-03）

- 本轮课程画面重复及布局修复不修改模型提示词，不加入针对某节示例课程、某个公式或某个组件的特殊提示规则。
- 面向各类课程修复通用问题：同一教学对象被重复创建，包括不同组件展开后包含同一画面的情况。优先扩展已有确定性编译、复用、引用重定向和验证机制；具体组件产出哪些画面由程序管理。
- 不能仅凭标题、旁白或表达式相似判定等价；需验证数学内容、变量绑定、单位和实际互动契约，并保留明确且有不同教学内容的对照。
- 回归必须包括不同组件之间的重复、不同章节的复用、非重复对象和合法对照；不能只用当前余弦示例证明通用修复有效。
- 布局附件的联动范围与显示归属分开；同一附件只在实际所属位置占位一次。实时笔迹不参与课程重排及固定；从选区发起课程时，仅在首次放置课程区域时避开该次引用选区，并与其顶部对齐，位置确定后不再跟随笔迹变化。开始/继续播放切回浏览模式，播放浏览时隐藏笔迹。

## 各仓库负责什么

| 仓库 | 职责 | 普通界面功能应优先改这里吗 |
|---|---|---|
| `octos-learn` | 独立学习产品前端、无限白板、课程播放、语音/摄像头交互、新用户设置、hosted-tts 托管语音服务 和公网部署文件 | 是 |
| `octos` | 通用服务端、登录与 profile、会话和文件、模型配置、技能运行及协议 | 只有通用能力确实缺失时 |
| `learning-coach` | 理解学习请求、生成课程计划、容忍模型格式错误、编译并交付 OLL 课程 | 修改课程生成或局部辅助时 |
| `octos-lesson-language` | OLL 数据结构、校验器、确定性画面和交互 Runtime | 修改 DSL 或底层执行能力时 |
| `agora-sensevoice-demo` | 公网私有 ASR 的 Agora 控制面和本机 SenseVoice worker | 修改公网语音链路时 |

不要把 Octos Learn 公网专属业务放回通用 Octos。平台代付 TTS、额度和新用户学习产品
引导都属于 `octos-learn`；通用 Octos 只保留个人 TTS 和通用运行能力。

## 本地启动

### 1. 准备 Learning Coach

本机单用户开发现使用 Octos 的账户级正式安装：Learning Coach 安装到 `alan0x` 的 `~/.octos/profiles/alan0x/data/skills/learning-coach/`，不再需要临时 `OCTOS_SKILLS_PATH`。这不改变公网产品技能的部署方式，也不自动安装到其他账户。

2026-09-27 检查发现这里已存在旧安装（同为 0.15.0，但 OLL ref 为 `9599d46e8fe3327d2fed0dd9432c8178b9f03273`）；已备份到 `~/.octos/backups/learning-coach-before-closeout-20260927T162859Z`，通过正式安装器更新为主线版本，OLL ref 为 `f2a1c654041735f566385f9e208c868b270b8095`。

以后修改技能源码后，重新构建并安装，再重启本地 Octos：

```bash
cd /Users/alan0x/Documents/projects/learning-coach
npm ci
npm run build
cd /Users/alan0x/Documents/projects/octos
./target/release/octos skills --profile alan0x install /Users/alan0x/Documents/projects/learning-coach --force
cd "$HOME/.octos/profiles/alan0x/data/skills/learning-coach"
npm ci
```

安装器复制源码和构建产物，不是链接；仓库修改不会自动更新安装目录。用 `env -u OCTOS_SKILLS_PATH ./target/release/octos skills --profile alan0x info learning-coach` 可在 Octos 仓库下检查账户级发现结果。

### 2. 启动 Octos

本地单用户开发使用 `--solo`。它只接受本机回环请求，不使用公网邮箱账户，也不会访问
公网用户数据。默认沿用本机 `~/.octos` 中的 profile 和 Settings 配置：

```bash
cd /Users/alan0x/Documents/projects/octos
cargo build --release -p octos-cli --features api

env -u OCTOS_SKILLS_PATH \
ASR_API_URL=http://127.0.0.1:8094 \
./target/release/octos serve \
  --host 127.0.0.1 \
  --port 50080 \
  --solo
```

说明：

- `ASR_API_URL` 只有在本机 SenseVoice 服务运行于 `8094` 时才设置；只开发文字白板时
  可以删除这一行。
- Gemini API Key 等个人凭据从本机 profile 的 Settings 读取，不应写入仓库、命令或
  `.env`。课程使用 Settings 中保存的主模型；`OLL_PROVIDER` / `OLL_MODEL` 仅用于独立 eval 脚本，不放入产品服务启动环境。
- 只有直接测试 Vertex Service Account 时才需要临时提供 `VERTEX_SA_JSON`；使用 Settings
  中的 Gemini API Key 时不需要它。
- 如果需要一套完全独立的本地测试数据，可额外加
  `--data-dir /absolute/path/to/a/local-test-data-dir`。不要把该目录放入 Git。
- 不要在公网服务器使用 `--solo`。

若只修改 `octos-learn` 前端，通常不需要重新编译 Octos；只有修改 Octos Rust 代码、
切换 Octos 提交或现有二进制不包含所需接口时才重新编译。

### 3. 启动 Octos Learn

本机开发及人工 E2E 复测入口固定使用 **HTTPS 5173**（`https://127.0.0.1:5173/`，用 `pnpm dev:https` 启动）（用户约定，2026-09-29）。启动时使用 `--port 5173 --strictPort`；若端口已有旧前端服务，先确认并关闭旧服务，再启动本次服务，不自动换用其他端口。

```bash
cd /Users/alan0x/Documents/projects/octos-learn
corepack enable
pnpm install --frozen-lockfile
pnpm dev:https
```

第一次使用 HTTPS 时先执行：

```bash
pnpm setup:https
```

本地开发默认从公网读取已发布预制课程：Vite 将 `/api/learn/course-packs` 及其资源子路径代理到 `https://learn.pitun.cc`，不转发本地登录凭据。日常查看课程无需本地打包，也无需设置 `OCTOS_LOCAL_COURSE_PACK_ROOT`。仅测试未发布课程时设置该变量，指向包含 `catalog.json` 的本地发布目录；这时本地课程服务替代公网代理。

2026-09-27 按用户要求完成课程发布：公网目录精确保留一次函数、三角函数、多元微积分三个课程集各 3 门，共 9 条版本记录；微积分三课均为 0.2.3，课程包与课程库主线 8ea5f21 构建哈希一致。长方形及其他旧版本已从目录撤下，历史不可变包保留。详见[公网发布核验](course-runtime-quality/whiteboard-closeout-2026-09-27/PUBLICATION-2026-09-27.json)。这是课程内容发布，没有重新部署公网前端或后端。

同日发现微积分三课误用了长方形封面，已发布仅封面修正版本 **0.2.5**，并撤下目录中的 0.2.3；课程正文、旁白和播放事件字节不变。公网仍为三集九课。核验与备份见[封面发布记录](course-runtime-quality/whiteboard-closeout-2026-09-27/COVER-PUBLICATION-2026-09-27.json)，[封面预览](course-runtime-quality/whiteboard-closeout-2026-09-27/calculus-covers-0.2.5.png)。

如果本机以前构建过 APK/Spotlight，启动 Web 前执行 `node scripts/copy-course-pack-assets.mjs`，清除 public/course-packs 中的旧内置课程生成目录，避免其与公网九门课程混合显示。

Vite 默认把其余 `/api` 和 WebSocket 代理到 `http://127.0.0.1:50080`。若后端端口不同，复制
`.env.example` 为 `.env.local` 并修改 `OCTOS_API_TARGET`。

## 本地与公网的差异

| 项目 | 本地开发 | 公网部署 |
|---|---|---|
| 登录 | `--solo` 本机单用户 | 邮箱验证码自由注册、多用户隔离 |
| 前端 | `pnpm dev:https`，Vite 热更新 | `pnpm build:public` 后由 Nginx 提供静态文件 |
| 模型密钥 | 本机 profile 自己配置 | 每个公网用户 BYOK，各自保存 |
| ASR | 可直接通过 `ASR_API_URL` 调本机 SenseVoice | 浏览器经 Agora 和私有 ASR 控制面访问 worker |
| TTS | 用户个人云端/本机 TTS | 个人 TTS 优先，否则可使用限额内的平台 Hosted TTS |
| Hosted TTS | 默认关闭，也不需要 hosted-tts 服务 | `VITE_HOSTED_TTS_ENABLED=true`，并运行 `services/hosted-tts` |
| SMTP | 不需要 | 邮箱验证码注册必需 |

本地开发不要使用 `.env.public`，也不要设置 `VITE_HOSTED_TTS_ENABLED=true`。否则前端会
请求本地并未运行的 `/api/learn/tts/*` 接口。

## 开始新功能前

1. 在目标仓库执行 `git status --short`，不要覆盖其他任务留下的修改。
2. 拉取远端状态并确认相关 PR。尤其先确认 Octos #2227 是否已经合并。
3. 普通产品功能从 `octos-learn/main` 新建 `codex/<feature-name>` 分支；不要使用 worktree。
4. 不涉及底层协议时，不要同时修改四个仓库。
5. 若必须跨仓库修改，分别建分支和 PR，并在 E2E 记录中写清楚每个仓库的提交。
6. 新功能先在本地完成单元测试和构建，再合入本地集成分支做真实 E2E；不要直接在
   公网服务器上开发。

## 必须保留的行为

- Android 新白板初始化、平移和缩放后，笔迹编辑器及 SVG 镜像必须收到相机实际到位后的最终坐标；不能仅用固定时间窗口判断同步结束。回归需验证实时笔迹与抬笔后的 SVG 位于同一屏幕位置，且相机到位后停止同步，不产生持续重绘。

- Learning Coach 对用户是内置能力，不能重新出现“请安装 skill”的提示或 Skills 设置入口。
- 用户之间的白板、图片、课程、模型凭据必须隔离。
- 没有 LLM 时仍可使用普通白板；没有 TTS 时仍显示文字旁白；ASR 忙碌或不可用时仍可打字。
- 摄像头图片在问题卡片中立即可见，刷新后仍可加载和放大。
- 课程结束、刷新和回放只聚焦当前课程区域，不缩放到全部课程。
- 同一节课的数值控件必须实际影响对应画面；模型输出错误由程序做可解释的容忍或拒绝，
  不能用看似成功但内容错误的画面代替。
- 公网平台 TTS 的密钥、额度和数据库只属于 hosted-tts 托管语音服务，不进入 Octos profile、
  Learning Coach 环境或前端。
- `/learn` 的课程生成和框选辅助使用专用 action 快速路径，不重新经过携带全部工具的
  外层通用 Agent。

## 修改后的最低验证

前端修改至少执行：

```bash
pnpm test:unit
pnpm lint
pnpm build
```

Learning Coach 修改至少执行：

```bash
npm test
```

Octos 修改至少执行与改动模块对应的 Rust 测试，并确认：

```bash
cargo check -p octos-cli --features api
```

发布或跨仓库修改还应执行
[发布前 E2E 清单](RELEASE_E2E_CHECKLIST.md)，记录 Octos Learn、Octos、Learning Coach、
OLL 的确切提交，以及 provider、model 和可接受的已知例外。

## 公网维护入口

本地开发不会自动影响公网。准备上线时再按照
[公网部署手册](PUBLIC_DEPLOYMENT_RUNBOOK.md) 构建、备份、替换和验证。当前公网服务器保留
上一版 Octos 二进制、前端目录及 Nginx 配置备份；不要在日常本地迭代中操作这些文件。

公网专属注册、功能降级和 TTS 额度说明见
[公开注册、新手设置与平台旁白语音](PUBLIC_ONBOARDING_AND_TTS.md)。

2026-09-27 补齐微积分课程元数据：当前公网版本 **0.2.6**，恢复 `authoring/<packId>/course-pack.json` 已有的 `college-calculus` 学段和中文简介。前端将学段、学科代码显示为中文，并隐藏 `unspecified`。相对 0.2.5 仅 manifest 变化，封面与教学内容不变。[元数据发布核验](course-runtime-quality/whiteboard-closeout-2026-09-27/METADATA-PUBLICATION-2026-09-27.json)。
