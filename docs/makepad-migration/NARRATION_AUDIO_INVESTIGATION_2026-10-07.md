# 原生旁白截断与跨平台音频能力：探索结果

日期：2026-10-07。交接给 Claude。用户要求停止继续修改实现，本轮仅整理探索结果；此前本地修复保留，未回退、未提交、未推送。

## 结论

发现两个独立问题：

1. **macOS 旁白截断**：固定 Makepad 的纯音频入口复用了视频播放器。音频没有视频帧，连续 60 次帧轮询后触发软件视频解码回退，原播放器被释放，导致每段只读前几个字。
2. **Android / Windows 原生旁白尚缺实现**：同一固定版本的 `PrepareAudioPlayback` 在这两个平台都是 TODO 空分支。继续调用原接口不会产生有效的纯音频播放。这是原有能力缺口，并非本次 macOS 修复引入。

本地已做的 `AVAudioPlayer` 修复证明 macOS 截断可以通过独立纯音频路径消除，但它不是已经验收的跨平台方案。以下结论只针对本分支 Makepad 原生产品的音频调用链，不代表仓库其他 Android/Web 播放实现的状态，也不代表整个原生产品已在其他平台构建成功。

## 基线与本地状态

项目根目录：`/Users/alan0x/Documents/projects/octos-learn`。

| 项目 | 当前状态 |
| --- | --- |
| 产品分支 | `codex/macos-product-ui` |
| 产品 HEAD | `bc9d2401ec60446effeeb48a545ae73f68c00481` |
| 配套 OLL | `d59b607`，`codex/rust-runtime-product` |
| 固定 Makepad | `825dbb422c6d7926e111e2ee7831d697870d8671` |
| 测试 checkout | 项目下 `.local-dev/oll-product/`，与根项目独立 |
| 本地实现改动 | 修改 `native/octos-learn/src/lib.rs`；新增未跟踪文件 `native/octos-learn/src/audio_playback.rs` |
| 提交状态 | 上述修复仅在本机 working tree，并已复制到测试 checkout；GitHub 分支尚无此修复 |

另外存在测试环境、修复记录、文档索引与交接进度的本地文档改动。接手不要覆盖未提交文件；只看 `git diff` 会漏掉未跟踪的 `audio_playback.rs`，需同时看 `git status --short`。用户当前授权是探索报告，后续实现由 Claude 处理。

## macOS 根因与源码证据

固定依赖源码根目录：`/Users/alan0x/Documents/projects/octos-learn/.local-dev/oll-product/makepad`。下表路径相对于该目录，行号对应固定提交。

| 文件与行号 | 证据 |
| --- | --- |
| `platform/src/os/apple/macos/macos.rs:2304` | `PrepareAudioPlayback` 创建 `AppleUnifiedVideoPlayer`，传入默认纹理 ID，没有独立纯音频路径 |
| `platform/src/os/apple/apple_video_player.rs:137` | `poll_frame` 轮询视频帧；等待首帧且没有帧时累计计数 |
| 同文件 `:172` | 计数达到 60 后执行 `switch_to_software("native player produced no frames after 60 polls")` |
| 同文件 `:106` | `switch_to_software` 替换 `self.mode`，释放旧的原生播放器 |

原应用运行时重复观察到：

```text
VIDEO: Apple native playback failed, falling back to software video decoder: native player produced no frames after 60 polls
```

约一秒是本机观测结果；阈值实际是 **60 次轮询**，不是固定一秒超时。原日志随后续重启被覆盖，这里记录当时观测文本；源码仍可直接检查。

排查的真实素材是 slope-and-intercept 第一段：

```text
<app>/Contents/Resources/course-packs/slope-and-intercept/0.1.8/audio/001.mp3
```

文件解码时长 7704ms，与课程清单一致。直接纯音频播放可到文件末尾，结合源码与回退日志，支持根因在播放路径而非该样本录音生成。尚未逐一检验所有课程的每个音频文件。

## 各平台源码现状

下表均针对固定 Makepad `825dbb4`，源码路径相对于上面的 Makepad 根目录。

| 平台 | 纯音频入口 | 本次验证范围 |
| --- | --- | --- |
| macOS | `platform/src/os/apple/macos/macos.rs:2304`，复用 Apple 视频播放器 | 已复现截断；本地产品层绕过后真实音频测试通过 |
| Android | `platform/src/os/linux/android/android.rs:3325`，仅丢弃参数，注释 `TODO: implement via MediaPlayer when needed` | 源码确认空实现；未构建或上设备测试 |
| Windows | `platform/src/os/windows/windows.rs:1296`，注释 `TODO: implement Windows audio-only playback`，分支为空 | 源码确认空实现；未构建或实机测试 |
| iOS | `platform/src/os/apple/ios/ios.rs:1566`，同样复用 `AppleUnifiedVideoPlayer` | 存在同类结构风险；未实机复现，不能宣称已确认截断 |
| Linux X11 / Wayland | `platform/src/os/linux/x11/linux_x11.rs:920`、`platform/src/os/linux/wayland/linux_wayland.rs:1133`，使用 GStreamer `new_audio_only` | 有实现，依赖 GStreamer；未运行验证 |
| Makepad Web | `platform/src/os/web/web.rs:1378`，该操作为空分支 | 只确认此入口；不代表独立 React Web 产品的音频状态 |

## 已做的本地修复与局限

产品根目录下：

- `native/octos-learn/src/audio_playback.rs`：统一 `prepare / pause / resume / stop` 调用；macOS 条件编译使用 `AVAudioPlayer`，持有播放器对象、开始时定位、停止时释放。未修改 Makepad 源码或固定依赖。
- `native/octos-learn/src/lib.rs:3998`：课程旁白同步走该模块，仍以 OLL 课程运行时确定 Beat 和旁白位置。
- `native/octos-learn/src/lib.rs:1852` 附近：服务端返回的语音字节也走该模块，更换时停止前一段语音。
- `native/octos-learn/src/lib.rs:4230`：非 macOS 路径仍在 `VideoPlaybackPrepared` 事件后定位。

**需 Claude 特别注意**：

1. 非 macOS 分支仍调用 Makepad 原入口。`prepare` 返回 `Ok(())` 只表示已排队，并不证明播放器准备成功；Android/Windows 的 TODO 会造成静默无声，不能将它们标记为已支持。
2. 当前模块没有统一的 Prepared / Ended / Error 事件和播放位置反馈；macOS 的继续播放错误被忽略。长期方案需明确状态和错误如何传回课程播放器。
3. 课程运行时按自身时钟结束片段。本机前三段在 7566/7704ms、10440/10488ms、6800/6864ms 释放，存在约 48–138ms 的末尾时间偏差。它与原先约一秒就断声的问题不同，仍需评估音频准备延迟、实际结束信号与课程时钟的同步。
4. iOS 未应用 macOS 条件分支修复。服务端实时 TTS 的实际有声输出未调用验证；只是相关代码已接入同一个模块。

## 验证证据与复现

已完成的验证，不需重跑模型请求：

- 产品 release 测试 **11 项通过**，其中新增 4 秒 PCM 测试覆盖超过旧截断时间后继续播放、暂停保持位置、继续和定位。
- 显式启用的真实 MP3 测试：7.704 秒录音在约 7.509 秒仍在播放，之后正常停止。压缩音频的 `currentTime` 在播放结束后会归零，测试不能只用结束后的时间位置断言完整播放。
- 可见应用内连续多段旁白已播放，未再观察到无视频帧回退。
- 应用完整重新打包、ad-hoc 签名校验通过。前一轮九课运行时集成测试通过，但这些测试不覆盖音频输出；不能拿它们作为九课旁白完整性的验收。

测试命令（在项目根目录，需本机音频输出可用）：

```sh
OCTOS_AUDIO_TEST_FILE="$PWD/.local-dev/oll-product/octos-learn/native/octos-learn/dist/Octos Learn.app/Contents/Resources/course-packs/slope-and-intercept/0.1.8/audio/001.mp3" \
MAKEPAD_PACKAGE_DIR=../Resources \
cargo test --offline --locked --release \
  --manifest-path .local-dev/oll-product/octos-learn/native/octos-learn/Cargo.toml \
  -- --include-ignored --nocapture
```

测试日志在项目下 `.local-dev/audio-fix-tests.log`，构建日志为 `.local-dev/audio-fix-build.log`。应用路径 `.local-dev/oll-product/octos-learn/native/octos-learn/dist/Octos Learn.app`，启动脚本 `.local-dev/start-macos.command`。根项目与测试 checkout 不自动同步，修改后需先同步源文件再打包。更多环境信息见 [本机测试环境](LOCAL_TEST_ENVIRONMENT_2026-10-07.md)。

## 建议 Claude 接手时处理的决策

先决定统一音频能力放在产品层还是 Makepad 平台层。仓库当前约定固定 Makepad 版本且不改其源码，沿此约定可在产品音频模块下分别接入平台后端；若要改 Makepad 或升级固定依赖，需要明确调整该约定。

可评估的平台后端候选：Apple 的纯音频 API、Android 的 MediaPlayer 或其他音频接口、Windows 的音频播放接口，或者共用解码器加平台音频输出。这些是待比较方案，本报告未实现或验收任何 Android/Windows 后端。

无论选哪条路径，验收至少覆盖：长于旧截断阈值的 MP3/WAV、实际正常结束、连续片段、暂停/继续/定位、静音与退出课程释放资源、快速跳 Beat、准备失败时显式错误、课程时钟与音频末尾同步。Android/Windows 必须在对应平台测试，macOS 测试不能替代。
