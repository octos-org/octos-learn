# 飞利浦大屏 WebView 74 兼容修复与实机验证

日期：2026-10-15。代码基线为正式 v0.1.5 / `a72572d7547a495cdfa0eedd847202509e2f97ec`，修复位于 `codex/philips-webview74`，尚未发布新的正式 Release。

## 设备与复现

设备为 `192.168.1.187:5555`，PHILIPS `65BDL2051T/93`，Android 8.0 / API 26，ARM64，WebView `74.0.3729.157`。Android 报告的显示分辨率 1920×1080，密度 240；实际 CSS 视口 1280×720、DPR 1.5。

原正式 APK 安装成功，但课程加载报 `Object.hasOwn is not a function`。补齐 ECMAScript 接口后，实际白板创建又暴露 `replaceChildren` 缺失。

首页内容贴边由不支持的 `width:min(...)` 引起。全局间距同时受到 Tailwind 输出的 `@layer`、逻辑属性（如 `padding-inline`）及旧选择器支持的影响；字号、设置页内边距和课程封面高度也使用了旧内核不支持的 `clamp()`。这台设备支持 grid gap，但不支持 flex gap，不能只用 `CSS.supports('gap', ...)` 判断。

## 修复

- Android 的 ESM 分支开启自动 built-in polyfills。能加载 ESM 的 WebView 74 同样补齐 `Object.hasOwn`、`Array.at`、`structuredClone` 等接口。
- 在应用及 OLL 初始化之前安装受能力检测保护的 `replaceChildren` 兼容方法；支持该方法的内核保留原方法。
- Android 最终 CSS 通过 PostCSS 转换 cascade layers、逻辑属性、`:is()`、媒体查询范围及嵌套规则。`:where()` 的降级选择器放在能力查询中，保留新内核的原选择器行为。
- 首页、设置页增加基础宽度、字号、内边距和封面高度的兼容声明。共享 Runtime 中 `width:min(固定值, 流动值)` 的控件和对话框在旧内核中使用等价的 width + max-width。
- 首次挂载前只测量一次 flex gap，为缺失该能力的设备补充课程入口、元数据、图标及滑块按钮间距。grid gap 保持原实现。

## 验证

- 全量单元测试：120 文件、1144 项通过。新增测试包含真正构建 ESM polyfill chunk 并在缺失接口的 VM 环境执行，以及 DOM 移动、清空、监听器保留和 CSS 降级回归。
- 类型检查、Android 资源构建、原生 APK 构建和公网生产构建通过。
- ESLint：排除本次本地 `.pnpm-store/**` 生成缓存后，0 错误、36 项已有警告。直接扫描缓存会误报第三方临时源码，不是产品源码错误。
- 使用项目匹配的 Playwright Chromium：2 项产品冒烟 + 10 项 Android 笔迹、预览、镜头和恢复回归全部通过，合计 12 项。系统 Chrome 的同组断言曾通过，但 worker 清理超时；最终结论采用匹配 Chromium 干净退出的一轮。
- 最终 APK 冷启动后，缺失的四类接口均可调用；首页内容宽 960 CSS px，左侧留白 157 CSS px；实际 `.px-4.py-2` 的左右/上下内边距恢复为 16/8 CSS px。
- 二维正比例函数课能播放，斜率按钮能改变数值并更新 SVG 函数图。
- 三维抛物面课能显示真实 SVG 场景；截面高度从 1.00 改为 1.02 后 SVG 更新，俯视按钮也改变画面。截图为最终安装包运行结果。
- 九门内嵌课包的归档哈希均与正式 v0.1.5 完全一致。

批量快速切换九课的额外检查曾因加载等待和匿名登录重定向中断，因此本次不宣称九课完整逐拍或旁白验收。最初 CSS 兼容阶段通过的实机范围为独立加载的二维、三维样板、控制更新和上述布局量测；该阶段未覆盖真人手写、摄像头、麦克风/ASR、账号登录或 AI 生成全流程。后续音视频和云端 ASR 验证见下文。

## 本地交付与安装

大屏已安装并保留 `cc.pitun.learn.compat`，名称“Octos Learn 兼容版”，versionName `0.1.5-compat-webview74`，versionCode 36。最终 APK 经过重新安装、冷启动验收，不依赖诊断期间的临时 JavaScript 注入。原 `cc.pitun.learn` 正式应用仍在，未卸载或清空数据。

本机没有原正式签名，因此验证版采用独立包名和本机调试签名，并开启 WebView 调试。正式同包名升级仍需使用原发布签名构建。

- [APK](../../../delivery/philips-webview74-20261015/Octos-Learn-v0.1.5-compat-webview74.apk)
- [校验与设备量测](verification.json)
- [首页修复截图](home-fixed.png)
- [三维课程实机截图](scene3d-fixed.png)

当前 APK：107440001 字节；SHA-256：`f8aee88f56e7d1b177cfae9834acd1e9dd0c1b75c7aa749065c974abf9dd41e6`。确切源码基线、dirty 标记、签名摘要、课程归档及设备量测保存在验证 JSON。

复现本次独立包名验证构建（Java 17、Android SDK 35）：

```sh
pnpm install --frozen-lockfile
pnpm build:android
./android/gradlew -p android -I "$PWD/docs/course-runtime-quality/philips-webview74-2026-10-15/compat.gradle" assembleDebug
```

`compat.gradle` 仅用于并排安装的验证包；普通正式构建继续使用既有应用标识与发布签名。

## 后续反馈修复：笔迹、控件、厂商悬浮栏与清晰度

用户反馈抬笔后笔迹消失。实机日志定位到 OLL 的 `component-identity` / selection 使用 `crypto.randomUUID()`，WebView 74 缺少该接口。提交阶段报错后，原生临时笔迹消退而 SVG 镜像为空，保存也停留在“保存中”。初始化时用 `crypto.getRandomValues()` 补齐标准 v4 UUID（保留原生实现），未使用弱随机数。安装最终 APK 后通过 ADB touchscreen 输入新增笔迹，抬笔后从 4 项增为 6 项，显示“已保存”，重新加载恢复 6 条 SVG path，无页面异常。ADB 的一次轨迹在本机被记录为两项组件；此次验证确认留存和恢复，不作为真实笔尖去重或手感验收。

旧 WebView 虽报告支持 grid / place-items，但原生 button 内部仍按块布局，导致图标左对齐。Android 的图标按钮改用 flex 居中；工具条、小章鱼、发送、课程目录按钮实测图标水平中心误差均为 0。`accent-color` 不受支持，改为显式 WebKit 轨道和滑块样式。三维课中实测 appearance=none、高 24px，h 从 1.00 到 1.02 后 SVG 更新，俯视切换仍可用。

下方遮挡不是 Android 导航栏，而是系统 `com.tpv.xm.wb` 的悬浮工具栏。只读检查该系统 APK，确认其导出服务 `com.tpv.xm.wb.services.toolbar.ToolBarService` 在 onStartCommand 处理 HideBottomToolBar / ShowBottomToolBar 动作。应用仅在 PHILIPS 品牌且对应系统服务已导出时调用该入口；onResume 隐藏、onPause 恢复，异常容错。实机验证返回桌面时窗口可见，回到应用窗口消失。没有禁用或停止厂商服务，也没有改写其持久设置。

清晰度：固件 `ro.build.TPV.RESOLUTION=4K*2K`，但 `persist.sys.resolution=1080`、`persist.sys.display.4k2k=false`，Android 仅报告 1920×1080 显示模式。`/system/etc/4k2k_app.xml` 中仅列出厂商应用，未包含 Octos Learn。此处无法单凭属性断定启用 4K 所需的完整厂商流程，因此本次未改系统输出或白名单。以当前 CSS 1280×720 / DPR 1.5 计算，笔迹静止与交互预算都允许完整 1.5 倍采样；已存在的 1080p 交互预算没有再对该机降采样。静止笔迹由 SVG 矢量层显示。更高系统输出需要另行核实厂商显示配置，不能通过调大网页 DPR 保证原生 4K。

本轮验证：16 项针对性单元测试、10 项 Android 浏览器回归通过；类型检查、Android 资源/原生构建、改动 TS 文件 lint 通过。最终包已覆盖更新兼容版，不依赖临时注入，正式应用及原有数据未清除。上一轮全量 1144 项与公网构建记录保留为上一轮结果，本轮未重复全量执行。

- [白板和居中按钮实机截图](whiteboard-fixed.png)
- [滑块、课程目录与悬浮栏收起实机截图](controls-fixed.png)

## 第三轮：按钮间距、完成提示对齐和点击焦点

在用户当前正弦函数课程中确认右上角语音/摄像头、课程播放控制、几何和函数图工具栏缺少间距。原因仍为 WebView 74 的 flex gap 不受支持，已在既有能力检测降级层补充 margin。图内工具条用可见 button 的 general sibling 选择器，确保隐藏“恢复”按钮时，“探索”和“大图”之间仍保留且仅保留一个间隔；三维视图控制和练习动作也补齐同类间距。

成功提示原先 align-items:flex-start，SVG 另有 1px 顶边距。改为 align-items:center 并移除图标顶边距；缺失 flex gap 的设备为图标补 7px 右边距，不强制长文本不换行。

黄色框来自旧 WebView 的原生焦点环（默认 outline:auto），该内核不支持 :focus-visible。Android 按钮聚焦时移除原生 outline；通过 pointerdown 与导航类 keydown 区分输入方式，触摸点击不显示框，键盘/遥控器使用明确的青色 2px 焦点环。输入框焦点样式不变。

最终 APK 覆盖安装、重新启动并恢复原会话后测量：右上角和播放控制按钮间隙均为 4 CSS px；图内按钮 margin 为 5 CSS px，经当前白板缩放后间隔约 3.45 CSS px；成功图标与文字的垂直中心误差约 0.00002 CSS px。实际触摸点击不出现黄色框；键盘状态 outline 为 solid 2px、rgb(22,131,152)，回到 pointer 状态为 none 0px。大图可打开/关闭，三个图内按钮可见时也分别保留间隔。当前课程的成功状态和 9 项已保存笔迹恢复，无最终进程样式注入。

本轮 7 项针对性单元测试、改动 TS lint、类型检查、Android 资源和原生 APK 构建通过。本轮以当前实机课程为 UI 验收范围，未重复上一轮 10 项浏览器回归或全量单元测试。

- [按钮间距、完成提示和无黄色焦点框的实机截图](spacing-alignment-fixed.png)

## 第四轮：USB 摄像头与麦克风首次授权

实机 USB Manager 同时识别 UGREEN Camera 2K 的 UVC 视频接口和 USB Audio 输入（VID 3141 / PID 25455）。Android 相机服务报告 legacy camera 0；音频服务枚举 USB-Audio - UGREEN Camera 2K。首次检查应用 CAMERA 和 RECORD_AUDIO 均未授权。

单独调用摄像头触发了 WebView / Android 相机权限流程，获准后产品摄像头按钮可得到 1920×1080、readyState=4、paused=false、live 视频轨；硬件和现有摄像头路径可用。本轮没有保存或上传相机图像。

麦克风路径使用 NativeAudioBridge / AudioRecord，已有代码未像 WebView 的 getUserMedia 一样触发系统权限，因此未授权时直接失败。新增原生权限查询/请求接口及系统回调事件；前端在原生采集、原生 Agora 加入与学习入口处等待授权结果，并合并并发请求。拒绝会显示明确提示并允许重试；学习者等待授权期间关闭语音时不再启动录音。Android 侧对相机和原生麦克风权限请求排队，避免两个系统弹窗互相丢失。

最终 APK 安装后，实际弹出“要允许 Octos Learn 兼容版录制音频吗？”系统对话框，经“允许”完成授权（未使用 pm grant）。短暂本地采集返回 ok=true、16000Hz、USB-Audio - UGREEN Camera 2K；约 1.8 秒取得 21 个 PCM chunk、26880 samples，RMS 约 459.84、peak 11510，确认存在有效输入。只计算汇总数值，未保存录音、未向识别服务上传本地测试音频；测试结束已停止原生采集。

当前最终版本相机预览和两项 Android 权限均验证正常。端到端语音识别测试触发自动审批拒绝，原因是需要明确授权将现场音频发送给识别服务；已向用户请求约 10 秒测试授权。获授权前不宣称识别服务、转写或模型对话验收通过。

本轮 7 文件、146 项音视频/对话相关单元测试通过；改动 TS lint、类型检查、Android 资源与原生 APK 构建通过。新增测试覆盖并发合并权限请求、等待实际授权、拒绝后重试已有权限时跳过弹窗，以及授权期间关闭语音后不启动录音。

## 语音启动仍被拦截：旧私有 ASR 就绪检查

用户再次点击语音后，页面显示“语音暂不可用”。只读检查证实 RECORD_AUDIO=true、USB 输入仍枚举正常，而 capturing=false / privateAsrJoined=false；录音尚未启动。

携带应用现有登录态查询 `/api/voice/readiness`，返回 ASR ready=false / mode=private / detail="Private ASR readiness check returned HTTP 503 Service Unavailable"，LLM ready=true。`/api/learn/tts/status` 返回 available=true、uses_platform=true。公开诊断端点 `/private-asr/healthz` 返回 200 / ok，`/private-asr/readyz` 返回 503 / bridge_offline / The LAN bridge is not connected。`/private-asr/api/v1/status` 返回 bridgeOnline=false、activeSessions=0、rtcProvider=livekit、capacity=100。因此不是设备采音失败或服务被占满，而是服务端私有 RTC 桥接离线导致前置检查阻止语音启动。

用户确认之前提供推理的另一台 Mac 已下线，并说明此前另有 Ark ASR 直连改动。当前 APK 基线 v0.1.5 / a72572d、已同步 octos-learn 主线及本地多仓库提交中，已找到的火山直连为 NativeTtsBridge（语音合成）。未找到对应 Ark ASR 实现，不以此否定用户之前的测试；可能位于其他分支、未提交改动或部署适配层，需定位原改动。

当前两处路由依赖需要同时核实：`.env.android` 的 VITE_PRIVATE_ASR_ENABLED=true 使前端采用私有会话；octos `api/auth_handlers.rs` 的 voice_readiness 在存在 PRIVATE_ASR 配置时优先采用 private_asr::readiness，早于 ASR_API_URL 外部批量识别。仅跳过界面检查或仅关闭前端私有通道不能证明已接通 Ark。

本机未安装项目部署密钥 `~/.ssh/octos_learn_vps_ed25519`，无法据此读取生产服务配置。继续读取 octos-audio 实际远端分支的请求被自动审批额度限制阻止，命令未执行；这是审批无法完成，不是风险判定。已向用户询问原 Ark ASR 改动的仓库/分支/对话位置。未修改生产路由或密钥，未重新采音、未上传现场音频。

## U 盘 APK 静态检查与正式包逐文件对照

用户提供 `/Volumes/MSI DISK/Octos-Learn-v0.1.5.apk` 作为此前语音可用的参考。本轮只做静态分析，没有安装或执行其中代码，也未采集/发送音视频。

该文件为 cc.pitun.learn / versionCode 36 / v0.1.5；build-info 为 a72572d、dirty=false、builtAt=2026-10-11T14:48:19.868Z。与此前从 Releases 下载并保留于 `/private/tmp/Octos-Learn-v0.1.5.apk` 的完整正式包逐文件对照：两包均 288 个条目，U 盘可成功读取的 281 个条目逐字节完全一致；包括 classes.dex、现代/legacy 入口脚本和全部可读取的前端资源，没有不同的可读文件。

U 盘文件有 7 个条目不可正常读取（res/yn.png CRC 错误、另 6 个资源/签名条目的本地文件头偏移无效）。apksigner 报 v3 CHUNKED_SHA256 摘要不匹配；aapt 直接读取也失败。本机正式参考包 CRC 全部通过、apksigner 校验通过，原签名摘要为 7aa6d10fe65e2cd576cbb7e7eb0b6a8f7ea94723ec1a9826c0127dfe2b3a9aa3。因此不能将 U 盘这个已损坏文件直接作为待安装交付物；损坏发生时间和原因未知。

静态路由确认：前端查询 `/api/voice/readiness` 并在 ASR ready=false 时设 inputReady=false，进入私有识别时创建 `/private-asr/api/v1/sessions`，随后选择 LiveKit 或 native Agora。原生唯一火山语音端点为 `/api/v1/tts`，属于合成；未找到 Ark ASR 直连。该结论有完整正式参考包代码一致性对照，不仅依据字符串缺失。若此前相同 APK 语音可用，仍需核对当时服务端配置或另一台电脑上未提交的其他构建；此 APK 本身不能提供用户记忆中的额外 Ark ASR 改动。

- [U 盘 APK 静态检查与逐文件对照证据](usb-apk-inspection.json)


## 重建火山 ASR 直连（无需 Mac 推理桥接）

用户确认原电脑上的实现未提交且无法找回后，授权重新实现。用户提供的 VPS `111.229.88.114` 已通过用户添加的本机公钥连接；其现有 `asr.pitun.cc` 容器为原 Agora/LiveKit 控制平面，仍依赖离线 bridge。本轮未更改 VPS 容器、反向代理或生产凭据。

新增 `NativeAsrBridge`，复用 `NativeTtsBridge` 已由公网认证接口下发、并在 Android Keystore 加密保存的 APP ID / Access Token。凭据通过未标注 JavascriptInterface 的原生方法传递，不编入 APK、不新增前端凭据接口。每段原生录音/VAD 的 PCM WAV 直接请求火山语音极速识别，资源 `volc.bigasr.auc_turbo`，无需 Mac、RTC 会话或新增服务端部署。

`.env.android` 开启 `VITE_CLOUD_ASR_ENABLED=true`；公网 Web 构建保持原路由。Android 白板语音会跳过旧私有 ASR 预加载、连接与 commit，并让原生配置状态覆盖通用后端的旧 ASR readiness；LLM 和 TTS 仍按各自状态判断。收到识别结果后复用既有提问准入和白板生成流程，不重复上传录音到旧 ASR。静音/无意义语气词不创建提问；关闭页面、停止语音和超时会取消原生请求并丢弃迟到结果。解析 WAV 有格式、大小和时长限制，网络不允许重定向。

使用 macOS Tingting 离线合成 4.916 秒中文音频，经 16kHz 单声道 PCM WAV 输入大屏原生接口，真实返回 `status=speech`、`请解释一下为什么三角形的内角和是180度？`。首次请求约 1000ms；最终已安装 APK 的再次验证结果另见 verification.json 的 cloudAsr.syntheticAudio.finalInstalledApkResult。由此确认现有 TTS 凭据已具备本次 ASR 资源权限，不是仅凭配置存在推断可用。测试没有调用麦克风，也没有将该句提交成课程问题。

完整单元测试 121 文件 / 1163 项通过；最后增加一项“等待 profile 时关闭语音不发送音频”的回归后，4 文件 / 89 项针对性测试通过。类型检查、Android 资源与原生构建、API 26 APK 签名验证通过；本次变更文件 lint 为 0 错误（既有 React ref 警告保留）。最终包已重新安装到同一台飞利浦大屏的“Octos Learn 兼容版”，交付 APK 和上方哈希已更新。

验证边界：本轮真实云端调用使用合成语音，不等于已完成现场真人说话、准入模型和课程生成的全流程验收；已请用户在白板页面点击语音按钮试用。

官方协议参考：[录音文件极速版识别 HTTP](https://docs.volcengine.com/docs/DoubaoVoice/LargemodelrecordingfileLiterecognitionAPI?lang=zh)。


## 最近白板截断与设置开关修复

用户报告首页最近白板标题不截断，以及设置开关关闭/开启状态显示异常。WebView 74 实测：卡片打开按钮只有 141.5 CSS px，内部标题却按 347.75 px 固有宽度布局，clientWidth 与 scrollWidth 相等，因而无法出现省略号。将本来就用于导航的卡片入口改为 React Router Link，保留恢复白板时的 active 更新及右侧管理按钮；同一设备最终安装包中标题宽度为 115.5 px（clientWidth=115、scrollWidth=347），text-overflow=ellipsis，且标题右边界没有覆盖操作区。

设置页原开关使用 Tailwind 4 的 individual translate，实机 CSS.supports(translate,20px)=false；边框依赖 @property 初始化的 --tw-border-style，而该 WebView 不支持注册自定义属性，实际 border-style=none。以统一 SettingsToggle 替换 Profile、Adaptive Routing、Developer 页面全部滑动开关，改用显式边框、阴影和传统 transform:translateX，颜色和滑块位置由 aria-checked 驱动，disabled 使用减淡样式及原生 disabled 语义。

在最终安装包的设置页，用无事件的临时副本量测四种组合（开启/关闭 × 可用/禁用），随后移除副本，不点击或保存真实设置：轨道均 44×24，滑块 20×20，关闭/开启时左偏移分别为 2/22 px、上偏移 2 px，均有 2 px solid 边框及阴影；可用/禁用透明度分别为 1/0.4，轨道颜色随开启状态改变。

3 文件 / 31 项既有相关测试通过，包含白板继续学习、开发者开关状态与禁用行为、模型设置保存逻辑；类型检查、Android 资源与原生 APK 构建、API 26 签名校验通过，改动文件 lint 0 错误。已更新大屏“Octos Learn 兼容版”和本地交付 APK，设置页保留在屏幕上便于用户检查。此次仅改入口布局与开关外观，火山 ASR 直连代码保持上一节已验证版本。

实机数值证据：[卡片和开关验证](cards-toggles-verification.json)。
