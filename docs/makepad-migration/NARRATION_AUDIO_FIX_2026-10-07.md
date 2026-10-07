# macOS 旁白截断修复（2026-10-07）

## 问题与原因

用户复测发现每段旁白仅读前几个字。课程 MP3 文件完整，例如 slope-and-intercept 第一段实际时长 7704ms，与课程清单一致。

固定 Makepad `825dbb4` 的 `PrepareAudioPlayback` 复用了 `AppleUnifiedVideoPlayer`。其帧轮询连续 60 次取不到视频帧时进入软件视频解码回退并释放原播放器，音频因此约一秒后被切断。原应用日志重复出现 `native player produced no frames after 60 polls`。此前课程集成测试覆盖加载、运行时播放和绘图，没有覆盖实际音频输出。

## 改动

- 新增 `native/octos-learn/src/audio_playback.rs`，macOS 使用持有对象的 `AVAudioPlayer` 播放本地音频，支持暂停、继续、定位及停止。
- `lib.rs` 的录制旁白和服务端语音结果通过该模块播放；更换语音结果时释放前一个播放器。非 macOS 保留原有 Makepad 路径。
- 固定依赖版本、Makepad 源码、课程资源和运行时均未改动。`OCTOS_AUDIO_DEBUG=1` 可记录音频时长和释放时的位置。

本机源码基线 `bc9d240`，修复目前为根项目的未提交改动，同步到 `.local-dev/oll-product/octos-learn` 后打包；未推送。应用在 `.local-dev/oll-product/octos-learn/native/octos-learn/dist/Octos Learn.app`，启动入口为 `.local-dev/start-macos.command`。

## 验证

- 产品 release 测试 11 项通过：包含 4 秒 PCM 音频超过旧截断时间后仍在播放、暂停保持位置、继续与定位；真实 7.704 秒课程 MP3 在约 7.509 秒仍在播放，并正常结束。
- 可见应用播放 slope-and-intercept，前三段释放时位置分别约 7566/7704ms、10440/10488ms、6800/6864ms，后续片段继续播放；没有再出现无视频帧回退。课程运行时按自身时钟切换片段，音频准备与定时更新仍有小幅时间偏差。
- 完整应用重打包与 ad-hoc 签名校验通过。无需调用模型、重新生成旁白或修改已有凭据。

复现音频回归命令（项目根目录，需本机音频输出可用）：

```sh
OCTOS_AUDIO_TEST_FILE="$PWD/.local-dev/oll-product/octos-learn/native/octos-learn/dist/Octos Learn.app/Contents/Resources/course-packs/slope-and-intercept/0.1.8/audio/001.mp3" \
MAKEPAD_PACKAGE_DIR=../Resources \
cargo test --offline --locked --release \
  --manifest-path .local-dev/oll-product/octos-learn/native/octos-learn/Cargo.toml \
  -- --include-ignored --nocapture
```

日志：`.local-dev/audio-fix-tests.log`、`.local-dev/audio-fix-build.log`、`.local-dev/native-app.log`。实际音频完整性检查覆盖一个真实 MP3 和可见应用内连续多段，未逐一听完九门课。服务端实时 TTS 输出未在本次调用验证。
