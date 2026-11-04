# 美国英语语音：Azure AI Speech（P6 提案）

> 2026-11-03。对应[学生当老师模式实施计划](LEARNER_TEACHING_MODE_IMPLEMENTATION_PLAN.md) P6。这是一个提案实现：供应商最终由产品方决定；火山引擎仍是默认供应商，现有配置不受影响。

## 为什么需要

目标市场是美国 K–12，但火山语音目录没有美式英语原生音色，也没有儿童音色；儿童英语识别质量也没评估过。孩子录课时用合成声音代替本人声音，声音听起来像不像同龄的美国孩子，直接影响产品是否可用。

## 为什么先选 Azure

- **一把 Key 同时管 ASR 和 TTS**：和现在火山的用法一样，用户只需开通一个资源。
- **有美式英语儿童音色**：`en-US-AnaNeural`；另有多款自然的美式成人音色（Ava、Emma、Jenny、Andrew、Brian）。
- **短音频 REST 接口**：识别一次最多 60 秒 16 kHz WAV，正好是录课“每句话录完就转写”的用法；合成直接返回 MP3，和现有旁白播放、课程包预生成旁白完全兼容。
- **按区域部署、企业合规条款**：后续 M7（COPPA / FERPA）法律审核时更容易说明数据流向。
- 2026-10-19 曾做过无凭据预检：Azure TTS / ASR 允许浏览器跨域（见 `byok-migration-2026-10-19/direct-provider-preflight.json`）。当时是范围决定把它移出首期，不是技术原因。

儿童英语识别质量仍需用真实儿童录音评估；如果不理想，同样的接入方式可以换成别家（例如 Deepgram），改动只在 relay 的请求构造和客户端结果解析两处。

## 做了什么

| 位置 | 内容 |
|---|---|
| `services/byok/server.mjs` | ASR / TTS 接受 `provider: "azure"`，参数为 `region`（TTS 另有 `voice`）。relay 在服务端构造 Azure 请求：TTS 由服务端生成并转义 SSML，MP3 以 base64 放在原有 JSON 信封里返回；ASR 只接受 16 kHz 单声道 16 位 WAV、≤ 60 秒、语言为 `en-US` 或 `zh-CN`。切换供应商必须同时提供新供应商的 Key，旧 Key 不会被带到新供应商。 |
| `src/byok/providers.ts` | Azure 的合成与识别分支；识别语言：说中文时 `zh-CN`，其他一律 `en-US`；`speechResource()` 让音色目录和老师音色按“火山资源 ID 或 `azure`”查找。 |
| `src/byok/service-config.ts` | 供应商目录与各供应商默认参数（Azure 默认 `eastus` + `en-US-AnaNeural`）。 |
| 设置 | Voice 页可以为 TTS / ASR 分别选择供应商；切换时就地填写新供应商的 Key。API Keys 页按已选供应商显示 Key 名称和控制台链接。首次配置弹窗（`ServiceSettings`）同样可选。 |
| 学生当老师 | `presenters.ts` 为 Azure 提供美式英语音色目录，“看我的课”可以选 Ana（儿童）等音色。 |

## 限制

- **电视 APK 暂不支持 Azure**：原生桥接只认火山和 Jev，并按 UTF-8 文本处理响应体，二进制 MP3 需要另做。电视上选 Azure 会得到明确提示，不会发出请求。目标设备是 Chromebook / iPad（网页），所以先做网页。
- **网页录音经服务器转发**：和火山一样；Azure 虽然允许浏览器直连，但已保存的 Key 不下发到浏览器，所以仍走 relay。
- **未做真实调用验证**：本 PR 只有单元测试和 relay 测试，没有用真实 Azure Key 跑过。合并前需要产品方提供 Key 做一次真实测试（设置页“测试草稿并试听”和“录一小句测试草稿”，以及 `scripts/teach-e2e/watch.cjs`）。

## 上线

前端和产品服务一起部署即可；nginx 无需改动（`/api/learn/byok` 已有 8 MiB 请求体上限，60 秒 WAV 的 base64 约 2.6 MB）。
