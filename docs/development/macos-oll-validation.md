# macOS OLL 验证开发日志

## 2026-09-21

- 按用户最新方向，将 Android APK 暂放，优先交付 macOS 实际可看的课程验证应用。
- 从当日核对的远端最新 main `b670417d54ac517cb9113db7d331e013b45d84cf` 建立 `codex/macos-oll-validation`，隔离于用户当前工作区。
- 依赖遵循 Octoscript-Makepad 的 runtime.json；未升级或修改底层 Makepad。
- 新建 `native/oll-preview`，调用 OLL 仓库 Rust 核心，使用 makepad-plot 绘制真实课程中的点、线、圆、弧、函数曲线。
- 加入暂停恢复、重新开始、动作序号与角度显示；限定课程布局，不冒充通用布局引擎。
- 打包 `.app`：资源随包交付，本机 ad-hoc 签名，无网络请求、语音或 Android 安装。
- 自动化检查使用本次启动的应用自己的 localhost 控制接口与 Metal 抓图；测试后退出，不控制用户其他应用。
- 本次为提前交付的 macOS 可视验证切片，不宣告阶段 0 或阶段 1 全部完成。阶段 0 的兼容清单和产品验收阈值、阶段 1 的 WASM/正式调度/原生服务接入仍待推进。

详见 `native/oll-preview/README.md` 的范围、固定版本和构建方式。
