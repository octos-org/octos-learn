# 本地开发恢复记录

更新日期：2026-09-06。

数学质量专题已经完成收尾。当前精确依赖为 OLL `c87fe9f`；OLL #7、Learning Coach #14 和
Octos Learn #9 已按依赖顺序合并且 CI 全部通过，尚未部署。详细结果见
[数学质量实施状态](MATH_QUALITY_IMPLEMENTATION_STATUS.md)。

## 已恢复

- 前端：<https://localhost:5173>，Vite `local-https` 模式和现有 HTTPS 证书已验证；
  收尾时已按用户要求停止由 Codex 启动的 5173 进程，后续由用户自己的终端启动。
- 实际服务模块中的 `VITE_HOSTED_TTS_ENABLED` 未设置，平台 TTS 关闭；未加载 `.env.public`。
- 后端：`http://127.0.0.1:50080`，已替换旧进程，启用 `--solo`，仅绑定回环。
- `/health` 返回 healthy，版本 `2.0.3-rc.10+99f43d6a`。
- 经 Vite 代理的 `/api/auth/status` 返回 `local_solo_enabled=true`、`solo_profile_exists=true`。
- 已验证已有 solo 账户免密码登录，并在浏览器进入文字白板。未启用摄像头或麦克风。
- 已建立 `/private/tmp/octos-learn-skills/learning-coach` 到 `/Users/alan0x/Documents/projects/learning-coach` 的软链接。
- 前端 `pnpm install --frozen-lockfile` 完成；Learning Coach `npm ci`、构建、OLL contract 检查完成。

后端启动命令（工作目录 `/Users/alan0x/Documents/projects/octos`）：

```bash
OCTOS_SKILLS_PATH=/private/tmp/octos-learn-skills \
OLL_PROVIDER=gemini \
OLL_MODEL=gemini-3.6-flash \
./target/release/octos serve --host 127.0.0.1 --port 50080 --solo
```

后端日志 `/tmp/octos-local-server.log`。当前未设置 ASR_API_URL，本机 8094 未运行服务。
本机临时技能根目录在系统清理后需要按交接文档重建。

## 基线与文件变化

| 仓库 | 当前基线与状态 |
| --- | --- |
| octos-learn | `4f361c3` 基线，当前 `codex/math-quality`；本地实现数学交互、精确 OLL 依赖与评测记录 |
| octos | `99f43d6a`，新建 `codex/local-macos-build`；仅补 macOS 所需 trait 导入 |
| learning-coach | `c329f72` 基线，当前 `codex/math-quality`；生成器、编译器与 67 案例评测已更新 |
| OLL | `codex/math-quality` 的 `c87fe9f`；前端与 Coach authoring/runtime 均精确锁定该提交 |

已 fetch Octos Learn、Octos、Learning Coach。Octos #2227 仍 OPEN，未切回上游 main。
Learning Coach #13 已 MERGED，远端 main `c329f72` 与本地 HEAD 文件树一致。

Learning Coach 的 `main`、`lesson-plan.js` 是跟踪文件，按文档从 npm 锁文件重建后产生 bundle 差异，
包括依赖路径与所打包依赖内容变化；保留了新构建用于本地运行，不混入数学源码改动，也未提交。
原有 `docs/PUBLIC_ONBOARDING_AND_TTS.md`、`docs/README.md` 的用户修改均保留。

## macOS 构建问题

交接基线直接执行 release build 时，`crates/octos-cli/src/auth/keychain.rs` 的两处 `.wrap_err()`
报 E0599。已在单独本地分支添加：

```rust
#[cfg(target_os = "macos")]
use eyre::WrapErr;
```

这是本地运行与公网提交的额外差异；未提交、未建立远端 PR、未部署。

## 验证结果与限制

| 验证 | 结果 |
| --- | --- |
| 前端单元测试 | 85 个文件，787 项通过 |
| 前端 lint | 0 errors，25 个已有 warnings |
| 前端 build | 通过，保留大 chunk 提示 |
| Learning Coach npm test | 136 项通过 |
| Octos release build | 添加缺失导入后通过 |
| cargo check -p octos-cli --features api | 通过 |
| cargo test -p octos-cli --features api --lib auth::keychain::tests | 测试二进制编译被现有 macOS 平台条件问题阻塞，未运行 |
| 本地健康、代理、登录、文字白板 | 通过 |
| 真实模型课程生成 | 67 个自然输入任务完成；15 对冻结基线/候选交错测速完成 |

Rust 测试阻塞：`api/admin.rs:5597`、`api/auth_handlers.rs:6134` 引用了只在 Linux test cfg 下导出的
`test_override_secrets_root`，产生 E0425。没有为恢复本地运行扩大修改范围。

本轮真实生成评测已使用本地设置页连接的 `gemini-3.6-flash` 完成。后续重新创建本地账户或
更换 profile 时，需要在设置页重新确认模型连接；不把密钥放进仓库或命令。
此账户的个人技能清单仍列有旧 `learning-coach 0.4.0`，该 API 只枚举 profile 安装目录，
不是实际 Runtime action 清单。本轮 67 个真实生成任务使用环境级 `0.14.0` 技能完成；
不能把个人技能列表当作运行时版本验收。

本次不访问公网用户数据，也没有发布或修改公网服务。
