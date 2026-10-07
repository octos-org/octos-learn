# macOS 原生版本地测试环境（2026-10-07）

## 入口

本机项目：`/Users/alan0x/Documents/projects/octos-learn`，当前分支已切换到 `codex/macos-product-ui`，并快进到远端最新 `bc9d240`。原生应用已经打开，本地 Octos 后端在 `http://127.0.0.1:50080` 运行。

重新启动（也可在 Finder 双击该 `.command` 文件）：

```sh
/Users/alan0x/Documents/projects/octos-learn/.local-dev/start-macos.command
```

只停止本次启动的后端：

```sh
/Users/alan0x/Documents/projects/octos-learn/.local-dev/stop-backend.command
```

应用路径：`.local-dev/oll-product/octos-learn/native/octos-learn/dist/Octos Learn.app`。启动脚本设置应用的服务器地址和独立进度目录 `.local-dev/app-data`，直接启动包内可执行文件，并记录 PID、复用本脚本已启动的实例；日常测试请用脚本启动。本机重签名后通过 LaunchServices 启动曾阻塞在构建目录资源访问，直接启动已验证可操作。

后端沿用本机已有 `~/.octos` 账户与设置，启用 `--solo` 且仅绑定回环。自动 solo 登录选择已有 `yy` 账户，模型为 `google / gemini-3.6-flash`，其 Learning Coach 已安装。模型密钥仍由已有 profile 管理；未复制到项目或启动脚本。服务端提问记录会保存在已有账户内；原生应用进度单独保存在 `.local-dev/app-data`。

## 版本与构建

独立测试 checkout 位于 `.local-dev/oll-product/`，未切换其他持久仓库分支：

| 目录 | 版本 |
| --- | --- |
| `octos-learn` | `bc9d240` + 本次本地旁白修复（未提交） |
| `oll` | `d59b607`（远端 `codex/rust-runtime-product`） |
| `makepad` | `825dbb422c6d7926e111e2ee7831d697870d8671` |
| `octoscript` | `68f6a9df55692b5d8ef8873a12721e279a3f40d6` |
| `octoscript-makepad` | `b0628d05a89369b0c3bae2750db6da06996a05c2` + 仓库 evidence 中的 zbias 补丁 |
| `octos` | `d6905a96`（本机后端源码快照，`2.0.3-rc.13`） |

工具链：Apple Silicon，macOS 26.6.2，Rust 1.96.0，Xcode Command Line Tools。依赖使用现有锁文件，未升级固定版本；Makepad 固定提交从本机 Cargo 缓存恢复。

完整重打包当前测试快照：

```sh
cd /Users/alan0x/Documents/projects/octos-learn/.local-dev/oll-product/octos-learn/native/octos-learn
OCTOS_PACK_ARCHIVES=/Users/alan0x/Documents/projects/octos-learn/.local-dev/oll-product/course-packs bash scripts/package-macos.sh
```

产品源码 checkout 是快照，根项目后续代码修改不会自动同步到它；开发时先同步 checkout，再重新打包。所有依赖、二进制、课程包、日志和测试进度在 gitignored `.local-dev/` 下。

## 已验证

- 原生 release 构建、完整 `.app` 打包及 ad-hoc 签名校验通过。
- 九门课程档案逐包按锁文件校验大小和 SHA-256，通过后嵌入应用。
- OLL runtime 测试 59 项、产品测试 9 项、共享预览组件测试 17 项通过。
- 显式设置 `OLL_PACK_ROOT` 的九课集成测试通过：全部加载、播放到底、布局，并渲染所有 scene3d。
- 隐藏实例实际打开首页、一次函数课程集及 slope-and-intercept 预览，播放呈现函数图、公式、滑块和旁白文字。
- 可见应用实际进入新手准备页，读取已有模型与已保存凭据状态，再进入空白白板；未重新填写或保存模型凭据。
- `/health` 为 healthy，solo 登录与 `/api/my/profile` 均成功；后端在启动命令结束后持续运行。

用户复测发现旁白约一秒后截断，现已在产品层改用 macOS `AVAudioPlayer`，并重新打包。新增两项真实音频回归后产品测试共 11 项通过（含显式启用的课程 MP3 测试）；可见应用连续播放多个旁白片段，未再出现无视频帧回退。详细原因、命令与验证边界见 [旁白截断修复](NARRATION_AUDIO_FIX_2026-10-07.md)。

运行日志：`.local-dev/native-app.log`、`.local-dev/octos-server.log`。测试输出：`.local-dev/{runtime,native,preview,course}-tests.log`。后端日志可能含本机登录信息，请勿公开上传原始日志。

## 测试范围

可以测试预制课、三维场景、旁白音频控件、手写与选区操作，以及连接已有模型的文字提问。本次没有调用模型生成课程；实际生成请在输入栏发送问题。

本机未运行 8080 的 OminiX 或 8094 的 SenseVoice 服务，语音识别链路尚未准备；摄像头/麦克风权限由用户主动启用功能时授予。未验证真实摄像头和麦克风。本分支已有的设置页、摄像头调整等待办与图片提问已知问题见 `NATIVE_MACOS_PROGRESS.md` §6。
