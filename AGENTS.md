# AGENTS.md — Octos Learn 项目速览

> 给 agent 的快速导览。细节以 `docs/README.md` 索引的文档为准。

## 项目是什么

AI 驱动的无限白板学习产品：学生用手写、语音或拍照提问，AI 老师实时生成带互动画面（函数图、几何动画、滑块）、手写体板书和语音旁白的数学课程，直接在白板上播放交互。

- 公网：`https://learn.pitun.cc`（BYOK + 邮箱注册）
- 技术栈：React 19 + TypeScript + Vite 7 + Tailwind 4；后端是 Rust `octos serve`；课程由私有 DSL（OLL）表达
- 当前内容焦点：中小学数学；并行建设精品课程包（CoursePack）

## 多仓库边界

本仓库（`octos-learn`）只是产品前端。改动前先确认该改哪个仓库：

| 仓库 | 职责 |
|---|---|
| `octos-learn`（本仓库） | 产品前端、白板渲染、Android 打包、公网部署脚本、hosted-tts 托管语音服务 |
| `octos` | 通用 Rust 服务端：认证、profile 隔离、会话、文件、模型配置、技能运行 |
| `learning-coach` | 课程生成技能：理解学习请求、生成课程计划、编译 OLL |
| `octos-lesson-language`（OLL） | 课程 DSL、校验器、确定性播放 Runtime |
| `octos-course-library` | 精品课程内容与 CoursePack 发布 |
| `agora-sensevoice-demo` | 私有 ASR：Agora RTC → 本地 SenseVoice worker |

原则：产品专属逻辑留在本仓库；通用能力缺失时才改 `octos`。

## 目录速览

```
src/            前端源码
android/        Android APK 工程（WebView 壳）
services/       hosted-tts 托管语音服务（Node 零依赖）
build/          Android 运行时 stub、本地课程包服务器（TS 源码）
deploy/         服务器部署配置模板（nginx/systemd/env 示例）
scripts/        构建、部署、课程包工具脚本
tests/          Playwright 测试
docs/           全部文档（唯一文档目录，索引见 docs/README.md）
public/         静态资源源（构建时拷入 dist）
dist/           Vite 构建输出（gitignored）
delivery/       生成的对外交付包（gitignored）
scratch/        本地工具脚本依赖（gitignored）
```

## 常用命令

```bash
pnpm install                # 安装依赖
pnpm dev                    # 本地开发（http://localhost:5174）
pnpm build:public           # 公网构建 → dist/
pnpm test:unit              # Vitest 单元测试
pnpm test                   # Playwright 全部测试
pnpm test:e2e:smoke         # 冒烟测试
pnpm lint                   # ESLint
scripts/deploy-public-web.sh        # 部署 dist/ 到公网并校验（--verify 只校验）
```

## 核心约定（违反等于返工）

1. **速度是硬门槛**：任何合入不得回退首个可播放片段的生成速度（p50 对照交错基线，零新增模型往返）。
2. **OLL 承载正确性**：AI 负责理解学生意图，数学正确性由程序保证；课程改动优先落在 OLL 语义而非前端补丁。
3. **BYOK**：模型成本由用户自带 Key 承担；平台只为旁白 TTS 提供限额代付。密钥永不进 git、不进前端。
4. **文档**：所有 markdown 放 `docs/`（`.gitignore` 全局忽略 `*.md`，仅放行 `docs/**/*.md`、根 `README.md` 和本文件）。改文档结构时同步更新 `docs/README.md` 索引。
5. **部署**：前端只走 `scripts/deploy-public-web.sh`（rsync 镜像 + 公网资源校验），不要手动 scp 单个文件——曾因半部署导致入口 JS 404。
6. 服务器敏感配置（SMTP、TTS 凭证、服务 token）只放服务器 `/etc/octos-learn/*.env`（0600），仓库里只有 `deploy/` 下的示例。

## 深入阅读

- `docs/README.md` — 全部文档索引（部署手册、开发交接、专题计划、路线图）
- `docs/DEVELOPMENT_HANDOFF.md` — 本地开发与仓库协作的权威约定
- `docs/PUBLIC_DEPLOYMENT_RUNBOOK.md` — 公网部署/升级/回滚
- `docs/ROADMAP_DEV.md` — 当前里程碑与 backlog
