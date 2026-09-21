# OLL 原生技术验证宿主

2026-09-21 当前状态：这是独立验证工具，**不是正式 Octos Learn 产品界面**。用户打开 v6 后指出与 main 差异过大，未认可它作为最终产品交付。main 界面和完整业务流程尚未迁移。后续先审阅最新 main，形成页面/交互迁移清单，再接入已经验证的 runtime 和显示能力；不自行重新设计产品。

完整交接入口：[AGENT_HANDOFF_CURRENT.md](/Users/alan0x/Documents/projects/YY/working/octos-learn/2026-0919-makepad数学渲染与去webview化调研/AGENT_HANDOFF_CURRENT.md)。历史开发记录见 [开发日志](../../docs/development/macos-oll-validation.md)。本次文档更新不代表新构建或新增功能验收。

## 当前功能与限制

- 四门未经改写的 canonical 课程：unit-circle-sine、quadratic、quadratic-v2、english-relative-clause，点击“切换课程”循环加载。
- Rust Session 负责调度、变量动画、暂停恢复、进度与增量事件；Makepad 负责显示和平台适配，不运行 TypeScript 业务逻辑。
- 原生公式/文本强调、函数图像、sequence 流程图、连线/箭头/标签、组框、教师指向和自动/手动取景。完整协议和任意公式/课程不保证覆盖；不支持结构明确报错或展示原文提示。顶层中文公式混排已修复，任意嵌套中文尚不支持。
- 保存/恢复课程进度及旧 checkpoint 导入，恢复默认暂停。**不保存笔迹**；重置、切课和恢复会清空验证笔迹。
- 鼠标书写、撤销重做；Android 复用原生采样及临时笔迹层。旧笔迹导入、持久化、橡皮擦和真实设备体验未完成。
- Android 录音/Agora 服务复用与事件通道、独立 APK 构建完成；没有安装。完整语音会话、后端接入、真实音频时间同步、课后任务和应用外围尚未迁移。
- WebAssembly ABI/适配器已写，缺编译目标待安装授权，实际 WASM/浏览器验证未完成。

## 构建和版本

并排准备 `octos-learn/`、`oll/`、`makepad/`、`octoscript/`、`octoscript-makepad/`。Rust 核心在 `oll/crates/oll-runtime`。不要把原仓库当前工作区覆盖为验证分支。

| 仓库 | v6 构建/代码来源 |
|---|---|
| 应用功能分支 | codex/macos-oll-validation；v6 对应 d15ce7a（最后一项仅日志） |
| OLL 功能分支 | codex/rust-runtime-macos-validation；v6 对应 95ab25f |
| Octoscript-Makepad | b0628d05a89369b0c3bae2750db6da06996a05c2 |
| Makepad | 825dbb422c6d7926e111e2ee7831d697870d8671 |
| Octoscript | 68f6a9df55692b5d8ef8873a12721e279a3f40d6 |

应用/OLL 历史 main 基点分别为 b670417、2b93d67。开展新的产品迁移代码前重新核对最新 main，并从其建立 codex 特性分支，选择性接入已有验证实现。底层依赖继续使用指定版本，不跟随 Makepad 最新 main 升级。

macOS：`native/oll-preview/scripts/package-macos.sh`，离线锁定依赖 release 构建，收集资源并作本机 ad-hoc 签名，没有发布公证。产物在 `native/oll-preview/dist/`。

Android：`python3 native/oll-preview/scripts/package-android.py --sdk <existing-sdk> --cargo-makepad <pinned-tool> --target-dir <output>`。复用现有 SDK 和缓存 Agora 4.5.2/aosl 1.2.13.1；共享 Java 文件只改包名复制，哈希在 `target/android-service-build.json`。只打包不安装；设备 192.168.1.63:5555 的安装仍需用户单独确认。

## 验证与后续

v6 核心 23 项、应用 7 项测试通过；macOS Metal 自有实例验证两门原课程完整播放、暂停、导航、重置，新增两门课程 checkpoint 导入及画面，保存重启恢复和鼠标书写/撤销重做。脚本在 `scripts/verify-{spatial,progress,expanded,ink}.py`，参数和自有进程管理见脚本。自动化需使用隔离存储，不操作用户已打开实例。

历史测试/截图位于调研目录 `macos-validation-v6/evidence/`。多区域/障碍/阅读布局目前有共享几何对照，尚无任意宿主尺寸的完整验收。Android 双层笔迹物理呈现、帧率/内存/延迟及完整产品验收仍未完成。

下一任务优先是最新 main 产品页面/交互盘点，而不是继续把验证按钮页扩展为正式产品。具体不确定项询问用户。WASM 安装许可与性能标准仍待答复。
