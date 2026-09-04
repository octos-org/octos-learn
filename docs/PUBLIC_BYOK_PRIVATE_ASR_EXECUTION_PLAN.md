# Octos Learn 公网 BYOK 与本地 ASR 执行计划

更新时间：2026-09-02

后续范围调整：按用户最新要求，公开注册与平台代付 TTS 改为可启用。
本文件中最初的邀请制约束保留作为历史方案；现行行为、额度和修改方式以
[公开注册、新手设置与平台旁白语音](PUBLIC_ONBOARDING_AND_TTS.md) 为准。

## 1. 目标

建立一个可通过公网 HTTPS 地址访问的 Octos Learn：

- `octos-learn` 提供学习白板、课程播放、摄像头和语音界面；
- 独立的 Octos Learn 公网 VPS 运行 Octos 和 learning-coach；
- 已有 Agora 公网服务继续运行 ASR 控制面，不与 Octos Learn VPS 合并；
- 用户在自己的 Octos profile 中配置 Gemini API、Ark 等模型密钥（BYOK）；
- 大模型仍由外部模型平台运行；
- OMiniX/Qwen3-ASR 和 Agora Bridge 仍运行在指定的本地电脑；
- 音频经 Agora RTC 传输，不经过 VPS，也不由 VPS 推理；
- ASR 文本通过控制面返回 Octos Learn，再进入现有语音请求处理路径。

第一版面向受控评审、GOSIM 展示和小规模邀请测试，不按开放注册、大规模多租户产品设计。目标是先获得一条安全、稳定、可监控、可回滚的真实公网链路。

## 2. 已确认的现状

### 2.1 Octos Learn

- `octos-learn` 已从 `octos-web` 独立，`main` 当前干净。
- 生产构建输出为 `dist/`。
- 前端以同源方式访问 `/api` 和 Octos WebSocket；GitHub Pages 只能预览静态界面，不能承载真实课程。
- 登录、profile、模型设置、图片上传、摄像头、语音、课程生成和白板运行时已经保留。

### 2.2 Octos 与 BYOK

- Octos 已有用户和 profile 隔离，也有每个 profile 独立的模型与 `env_vars` 设置。
- 普通 API Key 当前保存在对应 profile 的 `0600` 配置文件中，接口返回时会隐藏真实值。
- learning-coach 已能从 Octos 传入的运行环境读取模型提供商、模型名和对应 API Key。
- Vertex Service Account JSON 当前依赖 macOS Keychain；Linux VPS 不适合直接沿用这条保存路径。

### 2.3 Agora 私有 ASR 服务

`/Users/alan0x/Documents/projects/agora-sensevoice-demo` 已经不是简单 Demo。第一阶段生产化基础已经通过 CI 并合并到 `main`；已验收标签 `demo-approved-2026-09-01` 继续作为改造前回滚点：

- Rust + Salvo 公网控制面；
- 动态签发短期 Agora AccessToken2；
- 每次会话使用随机频道；
- App Certificate 只保存在 VPS；
- Bridge 主动通过 WSS 连接 VPS，本地网络不开放入站端口；
- 浏览器事件使用路径限定的 HttpOnly Cookie；
- liveness、readiness、会话过期回收、断线释放和 Nginx 限流；
- OMiniX 与 Bridge 的 macOS LaunchAgent；
- ASR 各阶段延时、P50/P95 和原始数据导出；
- Docker Compose、Nginx 示例、运行手册和回滚基线。

这部分能力应直接复用，不重新实现。

当前仍有两个与 Octos Learn 公网接入有关的边界：

1. OMiniX 当前只有一个推理 worker，所以 ASR 明确只支持一个活动会话；
2. 网页入口目前使用共享 `CLIENT_ACCESS_TOKEN`，适合受控操作员页面，但不能把这个长期 token 内置进公开的 Octos Learn 前端。

## 3. 最终架构

```text
公网浏览器
  ├─ HTTPS / WSS ──> Octos Learn VPS（Nginx/Caddy）
  │                   ├─ /                 -> octos-learn/dist
  │                   ├─ /api + Octos WS   -> octos serve
  │                   └─ /private-asr      -> 已有 Agora ASR control plane
  │
  ├─ BYOK 模型请求 ──> Octos -> learning-coach -> Gemini/Ark
  │
  └─ 麦克风音频 ─────> Agora RTC ─────> 本地 Agora Bridge
                                            └─> 本地 OMiniX/Qwen3-ASR
                                                  └─ ASR 文本/WSS -> 控制面 -> 浏览器
```

VPS 不运行大模型、不运行 ASR，也不承载 RTC 音频。它主要处理静态文件、认证、白板与课程状态、模型请求编排、图片上传、Agora Token 和 ASR 文本转发。

## 4. 已确定的设计选择

### 4.1 不使用 Google Secret Manager

第一版不引入外部 Secret Manager，也不在每次课程请求前增加一次外部密钥读取。

普通 BYOK API Key 复用 Octos 已有模式：

- 按用户 profile 分开保存；
- 配置文件权限固定为 `0600`，数据目录只允许 Octos 服务用户访问；
- API 永远只返回隐藏值，不把保存的密钥重新发给浏览器；
- learning-coach 启动时只取得当前 profile 和当前模型需要的密钥；
- 日志、错误、课程文件、白板数据和遥测不得包含密钥；
- VPS 备份必须加密，并且不得把 profile 数据目录提交到 Git 或打进镜像。

该方案没有额外网络调用，读取本地 profile 的时间相对模型请求可以忽略。它的明确边界是：拥有 VPS root 权限的人可以读取这些密钥。因此第一版使用受控账号和邀请名单，不开放匿名注册。

第一版 BYOK 范围：

- 优先支持 Gemini API Key；
- 支持已经由 Octos 正常工作的 Ark/OpenAI-compatible API Key；
- 暂不允许公网 Linux 版 Settings 保存 Vertex Service Account JSON；
- Vertex 若继续作为平台自有模型，可由服务器运维环境统一配置，不作为第一版用户 BYOK 项。

### 4.2 复用现有 Agora 服务

不把现有控制面、Bridge、断句、OminiX 适配器或延时观测复制进 Octos。

Octos Learn 只增加客户端适配，Octos 只负责用户身份和短期接入授权，现有 ASR 控制面继续负责 Agora 会话和文本转发。

### 4.3 同源部署

Octos Learn、Octos API、Octos WebSocket 和 ASR 浏览器入口通过同一个 HTTPS 域名提供。这样可以避免跨域 Cookie、CORS 和浏览器媒体权限产生额外分支。

建议地址：

```text
https://learn.pitun.cc/
https://learn.pitun.cc/api/...
https://learn.pitun.cc/private-asr/...
```

控制面容器仍只监听 VPS 的回环地址或 Docker 内部网络，不能绕过公网入口直接访问。

### 4.4 第一版保持 ASR 单并发

当前容量为 1 是 OMiniX 单 worker 的真实能力，不在界面上伪装成多并发：

- Bridge 离线时显示“本地语音服务暂不可用”；
- ASR 正忙时显示“语音服务正在被使用，请稍后重试”；
- 文字、图片和白板辅助不受 ASR 忙碌影响；
- 多 worker 调度放在真实使用量证明有需要之后。

### 4.5 注册采用“邀请邮箱 + 验证码”，不新增密码系统

第一版不开放任何邮箱自由注册，也不使用 Octos 的 solo 模式。复用 Octos 已有用户、profile、允许邮箱名单和 OTP 能力：

1. 管理员先把获准使用的邮箱加入允许名单；
2. 用户在登录页输入邮箱，Octos 向该邮箱发送一次性验证码；
3. 用户提交验证码；
4. 如果该邮箱尚未注册，但在允许名单中，Octos 原子地创建一个普通 User 和同 ID 的独立 profile，并把允许名单记录标记为已领取；
5. 如果该邮箱已经注册，则只创建新的登录会话，不重复创建 profile；
6. 用户首次进入后补充显示名称，并在 Settings 中选择模型、填写自己的 BYOK；BYOK 不属于注册请求；
7. 后续登录仍然只使用邮箱验证码，不存在密码设置、找回密码或密码数据库。

公网配置固定为：

- `allow_self_registration=false`；
- 不使用 `octos serve --solo`；
- 新用户默认角色为普通用户，不能访问管理接口；
- 只有管理员可以添加、撤销邀请和删除用户；
- 删除用户时一并停止运行环境、删除 profile 及用户数据，并移除或封禁对应允许名单，避免同一邮箱立即重新注册。

需要在现有实现上补强：

- 未注册、未邀请、发送成功和触发限流时，公共接口返回相同的提示，避免查询某个邮箱是否存在；
- Nginx 增加按 IP 的发送验证码限流，Octos 保留按邮箱限流，并增加验证码失败次数限制；
- 验证码短期有效、验证成功后立即失效；
- 用户创建、profile 创建和允许名单领取必须作为一次不可重复的操作，两个并发验证不能创建两个账号；
- 登录会话有明确有效期，退出登录和管理员删除用户后立即失效；
- 第一版继续使用 Octos 现有 Bearer session token，但只能在 HTTPS 同源页面工作，并配置严格 CSP；开放自由注册前再单独评估迁移到 Secure、HttpOnly Cookie，避免把认证系统重构混入本阶段。

用户看到的界面只需要一个邮箱输入框、验证码输入框和“继续”按钮。首次注册和日常登录共用同一套页面，不要求用户理解两种流程。

管理员入口固定放在 `Settings → Access → Authentication`。在现有 Registration Access 与 SMTP 设置之外增加一个 `Allowed Emails` 区域，直接复用已经存在的 `/api/admin/allowed-emails` 接口，支持：

- 添加一个允许邮箱及可选备注；
- 查看尚未领取、已经注册和最后登录状态；
- 撤销尚未领取的邀请；
- 已注册用户不在这里直接删除，而是明确跳转到用户删除操作，避免把“撤销邀请”和“删除用户数据”混为一件事。

该区域只对 `can_access_admin_portal` 为真的管理员显示。独立版不恢复原来通用 Octos Web 的完整 Users 页面。

## 5. 分阶段执行

## 阶段 0：冻结基线并整理分支

涉及仓库：`octos-learn`、`octos`、`learning-coach`、`agora-sensevoice-demo`。

工作：

1. 记录四个仓库当前 `main`、远端和工作区状态。
2. 保留 `demo-approved-2026-09-01` 作为 ASR 已验收回滚点。
3. 复核 `agora-sensevoice-demo/codex/production-foundation` 的测试和生产手册，将生产基础合并到该仓库 `main` 后再做 Octos 接入。
4. 每个仓库从最新 `main` 创建普通特性分支；不使用 worktree。
5. 本阶段不修改 OLL，不修改课程 DSL，不引入新的数学或教学能力。

完成标准：所有仓库基线可定位，工作区无不明改动，ASR 生产基础有固定提交和回滚方式。

## 阶段 1：准备独立的 Octos Learn VPS

不评估或复用现有 Agora VPS。直接准备一台独立的 4 vCPU、8 GB RAM、至少 50 GB SSD 的 Octos Learn VPS；已有 Agora 公网控制面继续独立运行。

1. 配置 `learn.pitun.cc` DNS、TLS、22/80/443 防火墙；SSH 仅允许公钥登录。
2. 创建无登录权限的 Octos 服务用户和独立目录：程序、配置、持久化数据、日志和备份分别管理。
3. Octos 和 learning-coach 只监听回环地址，由 Nginx/Caddy 对外提供 HTTPS。
4. `/private-asr` 反向代理到现有 Agora 公网控制面；这条路径只传授权、会话控制和 ASR 文本，不传 RTC 音频。
5. 配置 VPS 资源监控和磁盘告警，但不把现有 Agora VPS 的性能审计列入本项目。

完成标准：Octos Learn VPS 独立可用，Agora 服务保持独立，双方故障和升级互不覆盖。

## 阶段 2：打包 Octos Learn 公网版本

涉及仓库：`octos-learn`，必要时 `octos`。

工作：

1. 增加 production 构建与部署说明，服务器只部署 `dist/`，不运行 Vite 开发服务器。
2. 增加 Nginx/Caddy 配置：
   - `/` 提供前端；
   - `/api` 和 Octos WebSocket 转发到回环地址上的 `octos serve`；
   - `/private-asr` 转发到现有 ASR control plane；
   - WebSocket 关闭代理缓冲并设置合理长连接超时；
   - 图片上传大小限制与 Octos 实际需求一致。
3. 增加 Octos `systemd` 或容器启动配置：自动重启、健康检查、资源上限、日志轮转。
4. 持久化 Octos profile、用户、会话和白板数据；程序升级不得覆盖数据卷。
5. 增加部署、升级、回滚和健康检查脚本。

完成标准：输入域名可以打开 Octos Learn；刷新、WebSocket 重连和 Octos 重启后仍能恢复已保存数据。

## 阶段 3：收口公网认证与 BYOK

涉及仓库：`octos`、`octos-learn`、`learning-coach`。

工作：

1. 公网环境启用 Octos 邮箱 OTP 认证，固定 `allow_self_registration=false`，禁用 solo/匿名模式。
2. 管理员把测试用户邮箱加入允许名单；首次 OTP 验证自动创建普通 User 和独立 profile，并领取对应邀请。
3. 在 `Settings → Access → Authentication` 增加 Allowed Emails 管理区域，复用现有管理员接口，不恢复完整 Users 页面。
4. 增加邀请注册的并发、重复验证、撤销邀请、删除用户和会话失效测试。
5. 统一发送验证码的公共响应，增加 IP、邮箱和验证码尝试次数限制。
6. 管理接口继续使用角色权限，普通用户不能读取其他 profile。
7. 验证每个 profile 的普通 API Key 只写入自己的 `0600` 配置。
8. 对所有 profile 与模型设置响应执行统一隐藏处理；保存后的真实值不返回前端。
9. 检查日志和错误链路，保证模型请求失败时不打印 Authorization、API Key 或完整凭据。
10. 让 learning-coach 自动继承当前 profile 在 Settings 中选择的 provider、model、base URL 和对应 key；不再要求服务器另外维护一份与界面可能不一致的 `OLL_MODEL` 配置。
11. 增加 Gemini 与 Ark 的“保存—测试连接—生成课程—删除密钥”回归测试。
12. Linux 公网版隐藏或禁用 Vertex Service Account JSON 的用户保存入口，并给出明确说明；不能让用户填完后才收到 macOS Keychain 错误。

完成标准：未邀请邮箱不能注册；受邀邮箱首次验证只创建一个账号和一个 profile；两个测试账号分别配置不同 Gemini/Ark 密钥并同时生成课程，互不读取、覆盖或使用对方密钥；服务日志中搜索不到验证码、session token 或模型密钥。

## 阶段 4：把现有 ASR 服务接入 Octos Learn

涉及仓库：`agora-sensevoice-demo`、`octos`、`octos-learn`。

### 4.1 替换共享浏览器 token

保留 `BRIDGE_SHARED_SECRET` 作为 Bridge 与控制面的服务间凭据，但不把 `CLIENT_ACCESS_TOKEN` 写入 Octos Learn 前端。

增加一层短期授权：

1. 已登录浏览器向 Octos 请求创建私有 ASR 会话；
2. Octos 使用仅服务器持有的服务凭据向 ASR 控制面申请一次性、短时的浏览器授权；
3. 授权绑定 Octos 用户、profile、会话 ID 和过期时间，只允许创建一次 ASR 会话；
4. 浏览器使用该短期授权创建 Agora 会话；
5. 控制面继续签发随机频道和短期 AccessToken2，并继续使用已有 HttpOnly 会话 Cookie；
6. 共享服务凭据、Agora App Certificate 和 Bridge secret 永远不下发浏览器。

ASR 控制面的现有 operator 页面可以保留用于运维，但与 Octos Learn 用户入口分开。

### 4.2 接入前端语音状态机

1. 从现有控制面静态页面提取 Agora Web SDK 的必要客户端逻辑，封装为 Octos Learn 的私有 ASR adapter。
2. adapter 只负责开始、停止、立即断句、接收 partial/final 文本和连接状态，不复制课程业务逻辑。
3. `asr.final` 写入现有语音 transcript 边界，再进入 `/learn` 已有的语音准入和 learning-coach 快速路径。
4. 保持已确认的产品规则：课程讲解期间不保持 VAD；框选状态下语音等价于“问小章鱼”；框选语音不携带摄像头图片。
5. 页面明确显示 Bridge 离线、ASR 忙碌、会话过期、RTC 断线和重连结果。
6. 保留 `utteranceId` 和现有延时指标，以便把“RTC/断句/ASR/文本交付”与“Octos/模型/课程首节”分开统计。

完成标准：公网浏览器不接触内网地址；本地 Bridge 只进行出站连接；真实语音能生成课程或辅助卡片；停止语音、课程开始和框选切换都不会额外产生一条旧 transcript。

## 阶段 5：部署验证与性能验收

### 功能验证

1. 文字问题生成完整课程。
2. 摄像头图片加文字生成课程。
3. 手写内容框选后生成辅助卡片。
4. 语音生成完整课程。
5. 框选后直接用语音提问，且不发送摄像头图片。
6. 多节课程、刷新、重播和白板持久化。
7. Gemini 与 Ark 两种 BYOK。
8. ASR 离线、忙碌、断线和会话过期的用户提示。

### 隔离与安全验证

1. 两个账号的数据、文件、白板、课程、profile 和密钥完全隔离。
2. 未登录用户不能调用课程、文件、Settings 或 ASR 会话接口。
3. 普通用户不能调用管理员接口。
4. 前端包、浏览器网络记录、Nginx 日志、Octos 日志和 ASR 日志中不存在长期服务密钥。
5. Agora App Certificate 只存在于控制面的 VPS 配置中。

### 性能验证

分别记录：

- 静态页面首屏时间；
- WebSocket 建立时间；
- 图片上传时间；
- Octos 接收请求到 learning-coach 开始的时间；
- 模型平台首 token、第一节可播放和完整课程时间；
- ASR 的 RTC、断句、OminiX、文本交付 P50/P95；
- VPS CPU、内存、磁盘 I/O、网络和进程数。

验收目标：

- 排除模型与 ASR 推理后，VPS 为普通课程请求增加的 P95 时间不超过 500 ms；
- 3 个并发文字/图片课程请求无串号、无 5xx；
- 5 个并发文字请求时 VPS CPU 持续低于 70%、内存低于 75%；
- ASR 单并发按真实容量工作，第二个请求明确返回忙碌而不是超时；
- 长时间 WebSocket 无代理超时，断开后能正确清理会话。

## 阶段 6：受控发布

1. 先只开放给自己和团队账号。
2. 完成一轮完整 E2E 与 30 条真实 ASR 延时样本。
3. 再开放给指定评审账号，不开放自助注册。
4. 每次部署保留上一版前端包、Octos 二进制/镜像、ASR 控制面镜像和配置备份。
5. 回滚时只回滚程序，不能覆盖最新用户数据；数据库或配置格式变更必须先备份并提供向后恢复方式。

## 6. 仓库职责

### `octos-learn`

- 公网产品界面；
- 同源 API/WS 使用；
- BYOK Settings；
- Agora Web SDK adapter；
- ASR 在线、忙碌、断线状态；
- 语音 final 文本进入现有 `/learn` 语音逻辑。

### `octos`

- 公网认证、profile 和数据隔离；
- 普通 BYOK 密钥本地保存与隐藏；
- 当前用户模型设置传给 learning-coach；
- 为已登录用户申请一次性 ASR 接入授权；
- 部署服务、健康检查和数据持久化。

### `learning-coach`

- 使用 Octos 传入的当前 profile 模型与凭据；
- 不保存用户密钥；
- 不改变课程计划、OLL 编译和教学能力。

### `agora-sensevoice-demo`

- 继续作为真实私有 ASR 服务仓库；
- 保留控制面、Bridge、OminiX 适配、Agora Token、会话生命周期和延时观测；
- 增加 Octos 一次性接入授权；
- 第一版保持单 worker 容量。

### OLL

本项目不修改 OLL。公网托管、BYOK 和 ASR 接入不应改变课程 DSL 或 Runtime 行为。

## 7. 本阶段明确不做

- Google Secret Manager 或其他外部密钥服务；
- 匿名注册和完全公开使用；
- 用户上传 Vertex Service Account JSON；
- OMiniX 多 worker 和多 Bridge 调度；
- 重写现有 Agora 控制面或 ASR Bridge；
- 数学能力包抽取、教学能力扩展或 OLL 改造；
- 电子白板厂商 SDK 接入；
- 为了部署而改变已通过 E2E 的课程生成逻辑。

## 8. 需要准备的信息

开始实施前只需要确认：

1. 新 Octos Learn VPS 的公网 IP、SSH 公钥登录权限和系统信息；
2. `learn.pitun.cc` 或最终子域名的 DNS 修改权限；
3. Octos 公网登录使用的邮件发送配置和第一批允许账号；
4. Gemini 与 Ark 各一个测试用 BYOK 账号；
5. 现有 Agora 控制面的公网接入地址，以及用于 Octos 服务间授权的配置方式；不需要检查或迁移 Agora VPS 的性能和部署。

## 9. 推荐的实际执行顺序

1. 合并并冻结 Agora production foundation。
2. 准备独立的 Octos Learn VPS 和 `learn.pitun.cc`。
3. 上线只有文字、图片和白板能力的受控公网版本。
4. 验证公网认证、profile 隔离和 Gemini/Ark BYOK。
5. 增加 Octos 到 ASR 控制面的短期授权。
6. 在 Octos Learn 接入 Agora adapter 和现有语音路径。
7. 完成功能、安全、性能和故障 E2E。
8. 开放给指定评审账号。

这条顺序保证任何阶段失败都不会破坏本地已稳定版本：公网文字/图片版本可以独立验收，ASR 接入作为后续增量；现有 ASR 服务也始终保留独立运行和回滚能力。
