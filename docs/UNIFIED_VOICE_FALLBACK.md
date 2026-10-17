# 本地、网页与 APK 统一语音降级

日期：2026-10-17。新分支 `codex/unified-voice-fallback`，从当日实际 fetch 的 `origin/main`（`a72572d7547a495cdfa0eedd847202509e2f97ec`）迁出。只迁入上一兼容分支的原生 ASR 和麦克风权限修复，没有合入飞利浦 CSS、工具栏隐藏、构建依赖或独立包名等设备兼容修改。

## 路由与行为

三端共享 `src/api/voice-routing.ts`，检查 `/api/voice/readiness` 的真实私有 bridge readiness，合并云端 ASR、托管 TTS 和 Android 原生配置状态。检查并行执行、每个 HTTP 检查最长 3 秒、按账号/profile 合并并缓存 10 秒，退出或原生语音配置刷新后失效。不会把健康检查的 200/healthz 当作 worker 在线。原后端 LLM readiness 保留，TTS 故障不阻止可用的 ASR 输入。私有健康接口超时/网络失败时仍检查云端，并把模型健康标为未知；401/403 则保留认证错误，不用降级绕过登录。

ASR 优先级：已就绪的私有 RTC（LiveKit/兼容原 Agora）→ 已就绪的本地/外部 Octos ASR → 火山云端 → 明确提示不可用。网页和本地浏览器通过登录态认证的 `/api/learn/asr/transcribe` 转发 PCM WAV，APK 有原生配置时直接走 `NativeAsrBridge`，否则也可以走同一服务端接口。私有启动在存在云端后备时最多等待 5 秒；commit 失败或 RTC 断开后，保留完整 WAV 并将该句发送给云端；本地 HTTP ASR 执行失败也用同一 WAV 降级。不会重复提交课程或把静音当作问题。进入白板前已录好的唤醒/选区 WAV 无法 补发到刚建立的 RTC 会话：检查私有路由后，该预录句使用云端批量适配器，后续实时语音仍优先私有 RTC。停止语音后取消云端任务并丢弃迟到结果。失败的私有路径退避 10 秒；新一次语音启动会依据新的检查结果恢复私有优先，正在进行的云端识别不强行迁移。

TTS 优先选择已连接的私有 LiveKit bridge 的 `speak`；没有 LiveKit 私有路由时优先使用已就绪的本地/配置 TTS，两者失败都降级到火山云端（APK 原生优先，其余通过托管服务）。新增接收音频专用的 LiveKit 会话，不申请麦克风、不发布录音轨道，接收 `tts.started/finished/error` 事件，正常结束后会话短暂复用；取消或离开播放会关闭会话，空闲 2 分钟释放。启动失败、5 秒启动超时、播放断开或合成失败时走云端；播放中断后的降级会重播本句，可能重复已播出的少量文字。私有文本长于现有控制平面 500 字限制时直接降级。

课程包已经携带的音频保持优先，不发起健康检查或在线合成；这保证离线课程不受影响。在线旁白预取遵循同一路由，避免优先私有播放时产生闲置云端合成请求。没有新增模型往返。

## 云端接口

`services/hosted-tts` 扩展为托管语音 sidecar，保持现有启动方式、端口及 TTS 路径：

- `GET /api/learn/asr/status`：登录校验、配置与额度状态，不返回凭据。这里的 configured 不代表实际云端资源授权已验收。
- `POST /api/learn/asr/transcribe`：登录校验，接收单声道 PCM16 WAV，支持 16/44.1/48kHz、最长 60 秒、最大 5,760,044 字节；固定火山 endpoint，禁止重定向；30 秒上游超时，客户端断开取消请求。返回 speech/no_speech 与 transcript。
- `POST /api/learn/tts/cloud-synthesize`：明确使用平台云端 TTS、复用既有缓存、限额与并发控制。避免个人 profile 显式选择 local 时，再把降级请求转回失效的本地服务。

ASR 云端使用火山语音 `volc.bigasr.auc_turbo`，不是 Ark LLM 接口。支持 `VOLC_ASR_APPID` / `VOLC_ASR_TOKEN`；省略时复用服务器上的 `VOLC_TTS_APPID` / `VOLC_TTS_TOKEN`。新版语音控制台可以使用 `VOLC_ASR_API_KEY`。需要在语音控制台开通对应资源权限。

显式设置 `HOSTED_ASR_ENABLED=1` 后服务端才能转发；默认不因为 TTS 有凭据就自动产生 ASR 费用。ASR 使用独立 SQLite 按日额度，默认平台 3600 秒、每账号 600 秒，最多 2 个并发；向上游发起请求前按录音秒数向上取整预留额度，失败请求也保守计入，防止失败重试无限产生费用。不改变 TTS 字数账本。APK 继续遵循原生配置接口已有的平台凭据分发开关，此路径与此前原生 TTS 一样不经过服务端额度账本。

## 本地启动与公网更新

本地 Vite 会将 `/api/learn/asr` 和 `/api/learn/tts` 代理到 `OCTOS_VOICE_SERVICE_TARGET`（默认 `http://127.0.0.1:50081`），将 `/private-asr` 代理到 `PRIVATE_ASR_PROXY_TARGET`（默认 `https://asr.pitun.cc`）。原 Octos API 继续使用 `OCTOS_API_TARGET`。本地代理修正同源 Origin 与私有会话 Cookie Path，供浏览器 WebSocket/HTTP 使用同一会话。

在本机启动 sidecar 时，使用仅本机保存的环境变量或私密 env 文件配置凭据与上述 ASR 开关、`OCTOS_BASE_URL`（默认 `http://127.0.0.1:50080`），然后运行 `node services/hosted-tts/server.mjs`（Node >=22.5）。不得把真实凭据放入 VITE_* 或仓库示例文件。

公网更新顺序：

1. 将整个 `services/hosted-tts/` 更新到现有 sidecar 目录（包含新增 asr.mjs、http-error.mjs），保留 SQLite 数据和原 TTS 环境配置。
2. 在服务器私密 env 中配置 ASR 并启用；按需设置 `HOSTED_ASR_DAILY_SECONDS` / `HOSTED_ASR_USER_DAILY_SECONDS`，重启现有托管语音服务。
3. 更新 Nginx `/api/learn/asr/` 路由至 sidecar，允许 6m 请求体、40s 读取超时；现有 `/api/learn/tts/` 覆盖新 cloud-synthesize 端点。先 nginx -t 再 reload。
4. 登录后检查 ASR status，以及原有 voice readiness；用合成短语音验证 cloud 返回结果。不能仅以配置字段存在宣称资源已开通。
5. 执行 `pnpm build:public` 后只用 `scripts/deploy-public-web.sh` 发布前端，随后分别验证私有在线、离线、恢复与取消。
6. APK 按正常 Android 构建流程生成，保持原包名和签名；这次没有变更生产签名或版本号。

## 验证与边界

本轮仅开发与本地模拟验证，未修改公网服务、VPS 配置、正式 APK 或大屏安装，没有录制或发送现场音频。私有 LiveKit 实机播放和真实云端资源权限需要在部署环境做集成验收；不要把模拟测试当作生产已恢复。

验证记录见 [verification.json](unified-voice-fallback-2026-10-17.json)。当前机器此前临时 Android SDK/JDK 已清理，本轮只构建 APK 内嵌网页资源，不宣称原生 APK 编译或设备验收通过。

参考：[火山语音录音文件极速版 API](https://www.volcengine.com/docs/6561/1631584?lang=zh)。
