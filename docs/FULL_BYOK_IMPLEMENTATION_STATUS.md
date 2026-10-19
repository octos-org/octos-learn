# 全面 BYOK：实现与候选验收记录

日期：2026-10-19（America/Los_Angeles）。候选分支，未合并、未部署、未撤销线上凭据。

## 分支与范围

- octos-learn：从当次 `origin/main` 的 `aa58422` 创建 `codex/full-byok`。
- Octos：从当次 `origin/main` 的 `ed92309a` 创建 `codex/client-byok-config`。
- Learning Coach、OLL、课程库均未修改；课程模型沿用已有 profile 路由，不新增辅助 LLM 请求。

## 已实现

1. Octos 新增 `/api/my/client-services` 管理面：分别保存 ASR、TTS、可选 Jev 的供应商、参数、版本及本人 Key。有 Key 即接入，enabled 仅为兼容派生字段；旧的已保存 / 未启用记录读取时直接兼容，不修改 Key、参数或版本。普通读取只返回凭据存在状态；显式 POST sync 才返回当前身份用于客户端执行的本人凭据，不导出模型环境变量、不继承平台 / 父账号凭据。变更要求匹配版本，避免旧表单覆盖新配置。
2. 直连凭据存储在 Octos registry 根目录下的独立存储，不进入技能工作目录或 profile env_vars。使用 ChaCha20-Poly1305 加密、账号作为关联数据，目录 0700、主密钥 / 数据文件 0600；Unix 之外缺乏权限保障时明确拒绝。主密钥和密文应一起做受限备份；这不能抵御服务器 owner / root 权限失陷。
3. 浏览器运行快照仅保存在会话内存，按登录身份隔离；登录 / 设置生命周期同步，业务请求不逐句获取 Key。退出或换账号取消任务并清除内存。单能力变更只取消相应任务；其他能力的快照、测试状态与正在执行的工作保留。同源跨标签页只广播非秘密配置变更标记。
4. 首期语音仅支持火山新版 API Key，移除 Azure 适配与旧版鉴权选择。电视通过受限原生桥接直连固定 ASR / TTS / Jev 官方地址；原生语音只允许新版鉴权头。
5. 网页直连受限时允许走现有 VPS。当前火山新版鉴权与 Jev 均未通过浏览器预检，网页直接使用 `/api/my/client-services/{capability}/relay`，不先失败一次付费直连请求。Relay 校验本人身份，仅转发显式传入的本人同步凭据或未保存测试草稿，不读取平台 / 父账号凭据、不接受任意 URL、不跟随重定向、不自动重试；响应禁缓存，错误正文脱敏，限制请求 / 响应体、并发与超时。
6. 网页 ASR 的 WAV 可经认证 relay 转发给火山，不写入服务器课程 / 语音缓存；最终文字和必要图片仍进入现有学习流程。Jev 的网页 relay 与电视直连均使用本人 Key；未配置 / 调用失败时跳过，不领取平台 grant、不另调 Gemini 模拟。旧 Android 共享配置在加载时清除。
7. 设置页 Voice 已移动到 Learning，与 LLM、API Keys 并列；Voice 按统一卡片管理 ASR / TTS / Jev 参数和测试，API Keys 的 Speech & Learning 分组集中管理三项本人凭据。移除 Voice、onboarding 与白板配置弹窗中的额外启用开关，保存 Key 即接入；清空或删除 Key 才停用。Save Changes 仅保存变更，Reset 恢复原值；不更换未修改的 Key。保存不自动测试或打开麦克风，测试草稿不覆盖工作配置，显式测试提示供应商用量；录音测试有停止与超时、离开清理。旁白区分合成与播放，已生成音频可重播。账号已保存不等于本机已验证。旧 Azure / App ID 配置迁移须重新录入火山新版 Key，不复用旧 Token；页面明确说明网页录音与 Jev 输入会经过服务器。
8. 白板内可打开配置对话框，保留当次输入 / 选区；返回后由用户主动继续，不自动提交付费课程或恢复麦克风。首次设置的可选表单折叠，Jev 无强制填写条件。
9. 移除开发代理中的 Jev Key 注入和客户端平台 grant 获取。公网 / Android 构建停用旧托管语音与私有语音开关。Nginx 示例在正式切换时关闭旧语音、Jev、私有 ASR 路由，并为旧 APK 的 native-config 返回无凭据的 disabled 响应。
10. 检查模型测试接口时发现读取保存 Key 的辅助函数缺少目标 profile 授权检查，已补上，并增加跨账号拒绝测试；没有改动模型生成协议或增加模型请求。

## 本轮可复现验证

自动测试全部使用合成凭据和模拟供应商；没有用平台 Key 冒充个人接入。运行日志位于本机 `/private/tmp/octos-byok-*.log` 与 `/private/tmp/octos-voice-settings-*.log`，最终结果以本轮交付说明为准。

- Octos：`cargo test -p octos-cli --no-default-features --features api client_services --lib`，覆盖加密 / 防密文跨账号复制、掩码元数据、本人显式同步、删除、旧版本拒绝、无平台回退及模型 Key 跨账号探测拒绝；共 8 项定向测试通过，包含 Key 即接入、旧未启用记录兼容、清空 Key 停用，以及 relay 固定地址 / 新版鉴权、成功响应、错误脱敏、超时及大小限制覆盖。`cargo check` 通过。
- 前端：Vitest 全量 1,161 项通过、TypeScript 通过、ESLint 0 errors / 37 warnings；其中旧的“私有优先 / 平台兜底”产品断言已替换为 BYOK 直连、取消、静音、图片并发和禁止 WAV 上传断言；保留纯函数、回放与上下文检查。
- 本机真实候选服务器 HTTP 检查：无认证同步被拒绝、普通 profile / 元数据不返回 Key、显式本人同步与删除正常；仅使用合成凭据，无供应商请求。预览使用独立临时 profile，不复用线上账号或数据。
- Chromium：`tests/byok-settings.spec.ts` 与 `tests/voice-settings.spec.ts`，覆盖 Voice / API Keys 跨页面配置、配置 Key 即接入及窄屏无溢出；保存配置不领取平台凭据、不暗中测试、不将 Key 写入 localStorage；旧未启用 ASR 记录可直接进入白板语音，不再弹配置窗口。显式 Jev 草稿测试经认证 relay 发送本人 Key。真实 ONNX / AudioWorklet 初始化测试使用 Chromium 合成麦克风，验证录音开始、停止后轨道释放，不使用本人真实麦克风或调用供应商。
- Vite 常规、公网构建；Android Java 编译、Android 资源构建及 debug APK 打包。候选 APK 未安装至真实电视。

设置页记录：[Voice 桌面](byok-migration-2026-10-19/voice-settings-desktop.png)、[API Keys 语音分组](byok-migration-2026-10-19/voice-api-keys-desktop.png)、[Voice 窄屏](byok-migration-2026-10-19/voice-settings-mobile.png)。保存 Key 自动接入，无额外服务开关；白板开始 / 结束语音仍由用户主动点击，不随配置保存自动录音。

页面记录：[桌面 onboarding](byok-migration-2026-10-19/onboarding-desktop.png)、[960×540 视口](byok-migration-2026-10-19/onboarding-960x540.png)。后者是浏览器视口检查，不是电视实机验收。

## 音色选择与本机录音修复

- Voice 的 Voice ID 在配置本人 TTS API Key 后读取随应用发布的火山标准音色目录，按 Resource ID 筛选下拉选项；现有自定义 / 克隆音色 ID 保留，可手动输入。加载失败或超时保留手动输入和重试，不修改已保存配置、不自动试听。目录目前收录 30 个常用标准音色，不声称是完整或账号已授权列表。
- 官方 [ListSpeakers](https://docs.volcengine.com/docs/DoubaoVoice/ListSpeakers-LargeModelSoundListNewInterface?lang=zh) 示例使用 HMAC-SHA256 / AK-SK 签名，不能将语音推理 API Key 直接套用。当前目录取自[官方音色表](https://docs.volcengine.com/docs/DoubaoVoice/Tonelist-1?lang=zh)，账号对某个音色的实际权限由显式 Test voice 验证；不新增 AK/SK 配置。
- 根因：Android 准备脚本删除了 `public/vad`，而 `pnpm dev:https` 缺少复制该目录的生命周期步骤；运行中的网页因此拿到 SPA HTML 而非录音模型 / worklet。现在 HTTPS 启动补齐资源，Android 只清理最终 APK assets 中的 VAD，不删除网页源资源。
- 已执行 Android 资源构建，确认 APK 输出不含 VAD，随后通过正常 `https://127.0.0.1:5173/vad/` 逐字节校验 ONNX、AudioWorklet、ORT 模块和 WASM，均为正确文件。
- 录音失败会区分权限被拒、无设备、设备占用 / 读取失败与 VAD 初始化失败；设置测试显示当次失败原因，不再统一误报权限。修复首次设置测试因初始化身份通知而取消自身的顺序问题。
- 语音测试明确提示使用豆包语音控制台的 Key，API Keys / onboarding 直接链接到新版语音 Key 页面；方舟 Ark / LLM Key 不用于语音接口。HTTP 401 提示 Key 的来源、停用状态与项目服务开通检查，不回显供应商错误正文或凭据。
- ASR 测试区分麦克风准备、正在录音、正在识别，录音中显示输入电平与检测状态。网页可点击 Finish and recognize 提交当前录音，无须依赖 VAD 自动切句；自动切句仍保留。20 秒结束分别提示没有音频帧、无声 / 音量低或未检测到一句话结束，不再当作供应商超时。原生电视保留其语音分段路径。
- 手动测试 PCM 仅在端内暂存，最长 20 秒，提交后 / 取消 / 离开即清理；不持久化，不改变课堂语音的分段阈值或课程生成请求。六项 Chromium 回归通过，其中使用持续合成音验证真实 ONNX / worklet 输出非零 PCM、输入电平可见、手动编码为 16 kHz WAV 并经模拟 ASR relay 返回文字，以及取消释放麦克风且不发送请求。本人设备为何未自动切句仍需观察新电平 / 状态提示；没有使用错误的 Ark Key 重试付费请求，也未声称真实火山识别已验收。

录音状态记录：[Voice 麦克风测试](byok-migration-2026-10-19/voice-microphone-test-desktop.png)。

## 当前外部接口证据与限制

无凭据 OPTIONS 检查，补充记录见[直连接口预检](byok-migration-2026-10-19/direct-provider-preflight.json)：

| 目标 | 本站浏览器来源结果 | 产品处理 |
|---|---|---|
| 火山 TTS V3 / 极速 ASR | `X-Api-Key` 未被预检允许 | 电视原生直连；网页使用认证 BYOK relay |
| TypeSafe Jev System One | 未允许 `https://learn.pitun.cc` 来源 | 电视原生直连；网页使用认证 BYOK relay |
| Azure | 曾研究预检可行性 | 已移出首期供应商与适配实现，不要求用户另开通 |

OPTIONS 成功不等于实际付费请求、错误响应 CORS、音色资源或音频播放成功。此分支尚不能作为完成线上迁移的证据。

## 发布前仍须完成

- 由用户在设置中录入本人供应商凭据，完成真实浏览器 relay / 电视直连的 ASR、TTS 和 Jev 调用，验证成功及错误响应；不要在聊天、日志或 Git 中传递 Key。
- 验证目标电视输入、播放和原生取消，以及 Chromium / Edge / Safari 支持矩阵；APK 不因编译通过就算实机通过。
- 同模型、同请求、同 Jev 开关状态进行交错首段 p50 对照，分别记录 ASR 最终文字、Jev 预判与 TTS 首声；不能用少掉 Jev 或换供应商冒充性能改进。
- Octos 新版本先准备好，随后验证 Web / APK 候选与兼容窗口，再应用 Nginx 切换配置；不要先停旧服务，也不要只部署前端而遗漏配置 API。
- 上线切换时撤销旧平台供应商 Key，归档旧服务账本 / 缓存，再停止相应进程。关闭 Octos 导出接口或清理客户端不能撤销设备曾持有的供应商长效 Key。
- 秘密存储暂未接入 OS Keychain，Android / 浏览器也没有新增“记住此设备”持久缓存；重新登录从本人账号同步。该边界应如实展示，不宣称已完成跨端持久缓存或供应商瞬时撤销。

本机人工验收已恢复正常启动：`https://127.0.0.1:5173/` 连接 `127.0.0.1:50080` 的当前候选后端，使用默认 `~/.octos` 的现有本机账号和 Settings；已确认当前默认账号 yy 正式安装的 Learning Coach 可被发现。未在本轮自动触发付费课程或供应商请求。此前的临时 50082 / 5176 预览已停止，临时数据保留但不接入正常环境。今后除用户明确要求，均按开发交接的正常环境启动，不另建临时人工预览。

完整目标、验收门槛和退出顺序见[实施方案](FULL_BYOK_IMPLEMENTATION_PLAN.md)。

## 官方协议依据

- [火山 TTS V3 HTTP](https://docs.volcengine.com/docs/DoubaoVoice/HTTPChunkedSSEUnidirectionalStreaming-V3?lang=zh)、[旧版鉴权区别](https://docs.volcengine.com/docs/DoubaoVoice/old-version-console-authentication-reference-example?lang=zh)。
- [TypeSafe 官方文档](https://docs.typesafe.ai/introduction)。
