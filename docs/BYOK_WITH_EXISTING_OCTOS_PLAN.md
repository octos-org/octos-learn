# 复用现有 Octos 的 BYOK 实施方案

更新：2026-10-20（America/Los_Angeles）。取代此前“登录时向电视下发 Key”的草案。代码在 octos-learn 的 `codex/full-byok`；未合并 main。用户明确要求后已部署公网，Octos 升级至官方正式版 `2.0.3+fca32c4`，详见[部署记录](BYOK_PUBLIC_DEPLOYMENT_2026_10_20.md)。

## 已确定的边界

- 不修改 Octos；[Octos PR #2839](https://github.com/octos-org/octos/pull/2839) 已关闭。本机已切回干净的 Octos main `ed92309a` 并重新编译启动。
- 课程模型和 LLM Key 沿用原配置，课程继续由 Octos / Learning Coach 生成。
- 用户在 APK 录入 ASR / TTS / Jev Key 时，先在本机加密保存，再保存到本人 Octos profile。电视调用时从原生存储取 Key，直接访问供应商。
- **服务器没有向网页或 APK 导出已保存 Key 的接口。** 在网页保存过 Key 后，电视仍需在本机录入一次。
- 网页使用本人服务器配置经产品服务转发。当前三个供应商接口不满足网页跨域要求，因此直接选择 relay，不先发一次可能计费的失败请求。
- 首期火山语音仅支持新版 Speech API Key；不使用旧 App ID / Access Token。Ark 大模型 Key 与语音 Key 不能混用。Jev 可选，未配置或失败时其他能力正常。

## 复用 Octos 的既有能力

| 能力 | 复用方法 |
| --- | --- |
| 本人身份与配置 | 现有 `GET / PUT /api/my/profile`，账号 ID 以 Octos 返回为准 |
| Key 存储与掩码 | 本人 `config.env_vars`、`mask_secrets`、`save_with_merge`；不建立新的服务端凭据库 |
| 网页使用已保存 Key | 同机产品服务内部读取经过认证的本人 profile 指定字段，不返回 Key |
| 课程模型与技能 | 沿用现有调用，未增加模型往返或每段配置同步 |

产品字段：`OCTOS_LEARN_ASR_API_KEY` / `OCTOS_LEARN_TTS_API_KEY` / `OCTOS_LEARN_JEV_API_KEY` 及对应 `_PARAMS` JSON。普通 profile API 仍掩码所有 env_vars；通用环境变量编辑器隐藏产品内部项，语音 / Jev 只在 API Keys 与 Voice 管理；产品接口只返回允许的非秘密参数、是否配置及摘要版本。Keychain 引用明确报错，不任意解析为其他账号秘密。个人配置不从平台或服务器进程环境补齐。

产品保存前读取最新掩码配置，合并产品字段后走既有 PUT；进程内按账号串行处理，并检查产品版本。其他 Settings 保存也基于新读到的 env_vars 应用用户改动，避免旧界面快照删除新语音字段。Octos 现有接口没有跨进程 CAS，本实现不将进程内版本检查描述为数据库事务；外部工具同时替换完整 env_vars 仍应先刷新配置。

## 网页产品适配服务

实现在 `services/byok`，运行时只依赖 Node。开发时由 Vite 中间件在正常 HTTPS 5173 提供；公网切换时用它替换原 hosted-tts 进程，复用 50081，不再并行运行平台语音服务。

| 接口 | 用途 |
| --- | --- |
| `POST /api/learn/byok/prepare` | 登录 / 设置阶段读取元数据；仅首次兼容旧候选的凭据迁移 |
| `GET /api/learn/byok` | 配置元数据 |
| `PUT / DELETE /api/learn/byok/{asr,tts,admission}` | 保存 / 删除本人配置，带 expected_revision |
| `POST /api/learn/byok/{capability}/relay` | 网页转发；正常请求只传参数、版本和内容，服务端使用本人 Key |

显式未保存草稿测试可提交当前输入的 Key，不持久化；普通课程和麦克风请求没有 Key 字段。不存在 `/sync` 明文导出。旧 `/api/my/client-services/*` 在公网模板中关闭。

认证交由 Octos 校验，不接受客户端指定任意 owner、文件路径、环境变量名或供应商 URL。不转发客户端 X-Profile-Id 来切换本人账户。服务只访问固定供应商地址，禁止重定向、不重试付费请求，不向供应商转发 Octos Token / Cookie；错误正文不回传。请求 / 响应有大小限制、并发限制、超时和取消。元数据和响应禁止缓存。HTTP/1 Host 与本机 HTTPS HTTP/2 `:authority` 都执行同源校验。

部署条件：服务与 Octos 同机、同服务账号，可只读访问 registry 的 0600 profile 文件。拒绝 profile 文件符号链接和非私有权限；部署环境变量只有地址和路径，不放实际供应商 Key。示例 systemd 将服务 registry 挂为只读；保存由 Octos HTTP API 完成。

## Android 8.0 起的本地直连

- `minSdk 26` 保持不变。请求 ID 对缺少 `crypto.randomUUID` 的旧 WebView 使用 `getRandomValues` 生成 UUID v4，覆盖原生供应商请求与课程 / 语音提交。使用 Android Keystore 中的 AES Key + AES-GCM；随机 IV，AAD 绑定服务来源和账号。加密记录保存在私有 SharedPreferences。
- 不要求 Android 9 的 StrongBox，不要求生物识别。硬件保护能力因设备而异，不宣称所有电视均有硬件级密钥保护；不承诺抵抗已取得 root / App 进程权限的攻击。
- 不降级为明文。新存储与旧平台 TTS 存储分离，不复制旧共享凭据。禁止云备份及设备迁移新凭据文件。
- 本机录入后先加密落盘，再保存到账号。本机失败则不进行账号保存；账号失败则保留本机 Key 并明确显示“本机已保存，账号未同步”，用户可重试。
- 应用重启保留同账号的加密 Key。退出登录、换账号清除之前账号的本机副本，并取消正在进行的请求。另一个设备替换 Key 后，本机摘要不匹配会要求重新录入，不自动下载替代 Key。
- 页面只得到本机是否存在 Key、是否已同步和配置参数。普通请求传 capability / 参数 / 摘要，Java 自行取 Key 并构造鉴权头；没有返回原文的 JS bridge getter。
- ASR、TTS、Jev 都通过原生固定供应商接口，不逐次请求 VPS 取 Key，也不在本机缺 Key 时退回 VPS 代调用。

## 已验收的 UI 与迁移

保留 Learning → Voice、API Keys 语音分组、音色下拉与自定义音色、麦克风电平及手动结束、草稿试听、未保存提示和 Save voice for lessons。保存 Key 即接入，无独立启用开关。无 ASR 可打字，无 TTS 有文字旁白，无 Jev 仍可生成课程；账号有 TTS 但电视缺本机副本、或缺音色时，给出可操作提示。

旧候选只在本人认证会话下迁移：产品服务用原格式解密本人旧文件，将语音 / Jev 字段通过既有 profile PUT 保存。Key 不输出、不生成明文临时文件；保留原资源、音色和旧加密文件。版本标记阻止删除后的 Key 从旧文件复活。迁移失败不覆盖成空值。用户本机现有 ASR / TTS 与小何 2.0 音色已迁移；Jev 原来未配置，仍可选。

本机统一正常启动：`pnpm dev:https` → `https://127.0.0.1:5173/`；Octos main → `127.0.0.1:50080`，沿用默认 `~/.octos` 和已安装 Learning Coach。无需另起开发用语音端口。

## 验证与待完成验收

用户已确认本地网页版测试正常。用户当前不在电视旁，电视端保留待验收，不计为已通过。

已增加服务端账号隔离、掩码合并、旧记录迁移、删除防复活、错误脱敏和取消的 HTTP 测试；前端验证元数据不含 Key、电视先本机后账号保存、部分失败提示和退出取消；浏览器回归覆盖设置、录音组件、生成课程与旁白。

Android APK 与设备测试包必须构建成功，并通过 lint（包含 API 26 检查）。`NativeByokStoreTest` 的 7 项真实 Keystore 设备测试使用专用测试 prefs，不清空用户正式凭据。运行：

```bash
JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home \
  ./android/gradlew -p android connectedDebugAndroidTest
```

本轮自动验证：1,178 项前端单元测试、17 项产品服务 HTTP 测试、9 项浏览器设置 / 录音 / 课程回归；TS、网页与 Android 资源构建、APK / 设备测试包和 Android lint 均需通过。真实本人账号在未修改的 Octos main 上完成火山 TTS 合成与播放，截图见 [主线兼容验收](byok-migration-2026-10-19/upstream-octos-tts.png)。

2026-10-20 已连接 M3G2 电视（Android 13 / API 33），覆盖安装公网 APK 并通过上述 7 项真实 Keystore 测试，验证了加密存储、新 store 实例读取、账号切换、删除、远程替换和损坏处理。**仍未完成 Android 8.0 实机、真实进程重启及真实供应商直连验收**，不能以 Android 13 单元设备测试代替。此限制保留在 PR 中。课程链路未修改模型请求；本轮未重新测量交错 p50 延迟，不以“无新增模型往返”冒充实测延迟结论。

前端 PR #59 保持 Draft。已按用户明确要求协调升级公网 Octos、产品服务、Nginx 和静态前端；未合并 main。用户随后进行电视真实供应商 E2E。
