import { tr } from "@/i18n";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const api = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("@/api/client", () => ({ getToken: () => "alice", getSelectedProfileId: () => "alice", request: api.request }));
import { resetClientServices, prepareClientServices, getServiceStatus, type ClientService } from "./services";
import { speechLanguageParameters, directJson, synthesizeDirect, transcribeDirect, validateService, azureRecognitionLanguage, speechResource, AZURE_MAX_WAV_BYTES } from "./providers";
const config = (provider = "volcano"): ClientService => ({ provider, enabled: true, key: "own-canary-key", params: { voice: "test-voice", auth_mode: "api-key", resource_id: "seed-tts-2.0" }, revision: "r1", execution_target: "client" });
const azure = (params: Record<string, string> = { region: "eastus", voice: "en-US-AnaNeural" }): ClientService => ({ provider: "azure", enabled: true, key: "own-azure-key", params, revision: "a1", execution_target: "client" });
beforeEach(() => { resetClientServices(); api.request.mockReset(); delete window.OctosNativeByok; });
afterEach(() => { vi.unstubAllGlobals(); delete window.OctosNativeByok; });
describe("BYOK provider transports", () => {
  it("relays browser TTS with only the caller's new Key, without trying a paid direct request first", async () => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    api.request.mockResolvedValue({ status: 200, body: '{"code":0,"data":"bXAz"}\n{"code":20000000}', code: null });
    expect((await synthesizeDirect("学习数学", undefined, config())).size).toBe(3);
    const [url, init] = api.request.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/learn/byok/tts/relay");
    expect(JSON.parse(init.body as string)).toMatchObject({ provider: "volcano", key: "own-canary-key", params: { auth_mode: "api-key" }, payload: { req_params: { text: "学习数学" } } });
    expect(fetch).not.toHaveBeenCalled();
  });
  it("never sends formula markup to the voice: inline math is spoken as words", async () => {
    vi.stubGlobal("fetch", vi.fn());
    api.request.mockResolvedValue({ status: 200, body: '{"code":0,"data":"bXAz"}\n{"code":20000000}', code: null });
    await synthesizeDirect("解出 $x = \\frac{2}{3}$，直线 $y = k_1 x$", undefined, config(), null, "zh-CN");
    const volcano = JSON.parse((api.request.mock.calls[0] as [string, RequestInit])[1].body as string);
    expect(volcano.payload.req_params.text).toBe("解出 x 等于 3 分之 2，直线 y 等于 k1 x");
    api.request.mockReset();
    api.request.mockResolvedValue({ status: 200, body: JSON.stringify({ body: "bXAz" }), code: null });
    await synthesizeDirect("So $x^2 = 4$.", undefined, azure(), null, "en-US").catch(() => undefined);
    const sent = JSON.stringify(api.request.mock.calls.map((call) => (call as [string, RequestInit])[1]?.body));
    expect(sent).toContain("So x squared equals 4.");
    expect(sent).not.toMatch(/\$x|\^/);
  });

  it("sends wrapped, grouped and malformed formulas to the voice without any markup (review of #152)", async () => {
    vi.stubGlobal("fetch", vi.fn());
    api.request.mockResolvedValue({ status: 200, body: '{"code":0,"data":"bXAz"}\n{"code":20000000}', code: null });
    const narration = "看 $\\mathbf{x_1^2}$、$\\text{50\\%}$、$\\mathrm{\\frac{2}{3}}$、$(xy)^2$ 和 $\\sqrt[3{x}$";
    await synthesizeDirect(narration, undefined, config(), null, "zh-CN");
    const text = JSON.parse((api.request.mock.calls[0] as [string, RequestInit])[1].body as string).payload.req_params.text as string;
    expect(text).toBe("看 x1 的平方、50%、3 分之 2、x y 整体的平方 和 根号 [3 x");
    expect(text).not.toMatch(/[$\\^_{}]/u);
  });

  it("relays browser ASR and preserves the upstream status header for speech and silence", async () => {
    api.request.mockResolvedValueOnce({ status: 200, body: '{"result":{"text":"学习数学"}}', code: "20000000" });
    expect(await transcribeDirect(new Blob(["wav"]), new AbortController().signal, config())).toEqual({ status: "speech", transcript: "学习数学" });
    expect(api.request.mock.calls[0][0]).toBe("/api/learn/byok/asr/relay");
    api.request.mockResolvedValueOnce({ status: 200, body: "{}", code: "20000003" });
    expect((await transcribeDirect(new Blob(["wav"]), new AbortController().signal, config())).status).toBe("no_speech");
  });
  it("pins English recognition for English speech and leaves other languages to Volcano's default", async () => {
    api.request.mockResolvedValue({ status: 200, body: '{"result":{"text":"Point A."}}', code: "20000000" });
    await transcribeDirect(new Blob(["wav"]), new AbortController().signal, config(), { language: "en-US" });
    expect(JSON.parse((api.request.mock.calls[0] as [string, RequestInit])[1].body as string).payload.audio.language).toBe("en-US");
    await transcribeDirect(new Blob(["wav"]), new AbortController().signal, config(), { language: "zh-CN" });
    expect(JSON.parse((api.request.mock.calls[1] as [string, RequestInit])[1].body as string).payload.audio).not.toHaveProperty("language");
  });
  it("relays optional browser Jev using the caller's key", async () => {
    api.request.mockResolvedValue({ status: 200, body: '{"answers":{}}', code: null });
    expect((await directJson("admission", config("typesafe"), { state: "数学" })).body).toContain("answers");
    expect(api.request.mock.calls[0][0]).toBe("/api/learn/byok/admission/relay");
  });
  it("refuses missing credentials, unknown providers and old auth before any paid request", async () => {
    await expect(synthesizeDirect("hello")).rejects.toMatchObject({ state: "unconfigured" });
    expect(() => validateService("tts", config("google"))).toThrow("供应商");
    expect(() => validateService("admission", azure())).toThrow("供应商");
    expect(() => validateService("tts", { ...config(), params: { ...config().params, auth_mode: "legacy", app_id: "old" } })).toThrow("新版 API Key");
    expect(api.request).not.toHaveBeenCalled();
  });
  it("browser saved-key calls send only a revision and no raw key", async () => {
    api.request.mockResolvedValue({ status: 200, body: '{"code":0,"data":"bXAz"}', code: null });
    await synthesizeDirect("hello", undefined, { ...config(), key: "", has_credential: true, credential_revision: "key-digest" });
    const body = JSON.parse(api.request.mock.calls[0][1].body);
    expect(body).not.toHaveProperty("key"); expect(body.expected_revision).toBe("r1");
  });
  it("native saved-key calls work without WebView randomUUID, with no credential export or VPS call", async () => {
    vi.stubGlobal("crypto", { getRandomValues: (bytes: Uint8Array) => bytes.fill(17) });
    window.OctosNativeByok = { request: vi.fn((id, _capability, raw) => {
      const value = JSON.parse(raw); expect(value).not.toHaveProperty("key"); expect(value.credential_revision).toBe("key-digest");
      queueMicrotask(() => window.__octosNativeByokEvent?.(JSON.stringify({ id, status: 200, body: "{}" }))); return '{"ok":true}';
    }), cancel: vi.fn() };
    await directJson("tts", { ...config(), key: "", has_credential: true, local_credential: true, credential_revision: "key-digest" }, {});
    expect(api.request).not.toHaveBeenCalled();
  });
  it("a missing TV copy asks for local entry without falling back to VPS", async () => {
    window.OctosNativeByok = { request: vi.fn(), cancel: vi.fn() };
    await expect(directJson("tts", { ...config(), key: "", has_credential: true, local_credential: false }, {})).rejects.toThrow("这台电视");
    expect(api.request).not.toHaveBeenCalled(); expect(window.OctosNativeByok.request).not.toHaveBeenCalled();
  });
  it("does not retry invalid supplier credentials or borrow platform speech", async () => {
    api.request.mockResolvedValue({ status: 401, body: "", code: null });
    await expect(synthesizeDirect("hi", undefined, config())).rejects.toMatchObject({ state: "invalid_credentials" });
    expect(api.request).toHaveBeenCalledOnce();
  });
  it("explains speech and Ark key scopes without echoing the rejected key", async () => {
    api.request.mockResolvedValue({ status: 401, body: "own-canary-key", code: null });
    await expect(synthesizeDirect("hi", undefined, config())).rejects.toThrow("豆包语音控制台");
    await expect(synthesizeDirect("hi", undefined, config())).rejects.not.toThrow("own-canary-key");
    await expect(directJson("admission", config("typesafe"), {})).rejects.toThrow("凭据无效");
  });
  it("keeps native television Jev direct and never relays", async () => {
    window.OctosNativeByok = { request: vi.fn((id, capability, headers) => {
      expect(capability).toBe("admission"); expect(JSON.parse(headers)).toMatchObject({ provider: "typesafe", key: "own-canary-key" });
      queueMicrotask(() => window.__octosNativeByokEvent?.(JSON.stringify({ id, status: 200, body: '{"answers":{}}' })));
      return '{"ok":true}';
    }), cancel: vi.fn() };
    expect((await directJson("admission", config("typesafe"), {})).body).toContain("answers");
    expect(api.request).not.toHaveBeenCalled();
  });
  it("sends only new API Key headers for native Volcano speech", async () => {
    window.OctosNativeByok = { request: vi.fn((id, _capability, headers) => {
      expect(JSON.parse(headers)).toMatchObject({ key: "own-canary-key", provider: "volcano" });
      expect(headers).not.toMatch(/X-Api-App|X-Api-Access/);
      queueMicrotask(() => window.__octosNativeByokEvent?.(JSON.stringify({ id, status: 200, body: "{}" })));
      return '{"ok":true}';
    }), cancel: vi.fn() };
    await directJson("asr", config(), {});
    expect(api.request).not.toHaveBeenCalled();
  });
  it("cancels native requests after identity reset", async () => {
    window.OctosNativeByok = { request: vi.fn(() => '{"ok":true}'), cancel: vi.fn() };
    const result = directJson("admission", config("typesafe"), {});
    resetClientServices();
    await expect(result).rejects.toMatchObject({ name: "AbortError" });
    expect(window.OctosNativeByok.cancel).toHaveBeenCalledOnce();
  });
  it("aborts relay work when the identity resets", async () => {
    api.request.mockImplementation((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener("abort", () => reject(new DOMException("Canceled", "AbortError")));
    }));
    const result = directJson("admission", config("typesafe"), {});
    resetClientServices();
    await expect(result).rejects.toMatchObject({ name: "AbortError" });
  });
  it("does not label a saved draft ready without a successful call", async () => {
    api.request.mockResolvedValue({ profile_id: "alice", services: { tts: { ...config(), key: undefined, has_credential: true } } });
    await prepareClientServices();
    expect(getServiceStatus("tts").state).toBe("configured_unverified");
  });
  it("narrates lessons with the teacher's voice for the saved resource and falls back once it is refused", async () => {
    const audio = { status: 200, body: '{"code":0,"data":"bXAz"}', code: null };
    const speakers = () => api.request.mock.calls.filter(([url]) => url === "/api/learn/byok/tts/relay").map(([, init]) => JSON.parse(init.body).payload.req_params.speaker);
    api.request.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url !== "/api/learn/byok/tts/relay") return { profile_id: "alice", services: { tts: { ...config(), key: undefined, has_credential: true } } };
      return JSON.parse(init?.body as string).payload.req_params.speaker === "teacher-voice" ? { status: 200, body: '{"code":45000000}', code: null } : audio;
    });
    await prepareClientServices();
    const teacher = { "seed-tts-2.0": { id: "teacher-voice" } };
    await synthesizeDirect("一", undefined, undefined, { "seed-tts-1.0": { id: "other-resource-voice" } });
    await synthesizeDirect("二", undefined, undefined, teacher);
    await synthesizeDirect("三", undefined, undefined, teacher);
    await synthesizeDirect("试听", undefined, config(), teacher);
    // Other resource: saved voice. Refused teacher voice: one retry, then saved voice only.
    expect(speakers()).toEqual(["test-voice", "teacher-voice", "test-voice", "test-voice", "test-voice"]);
  });
  it("uses an accepted teacher voice and never for voice tests", async () => {
    api.request.mockImplementation(async (url: string) => url === "/api/learn/byok/tts/relay"
      ? { status: 200, body: '{"code":0,"data":"bXAz"}', code: null }
      : { profile_id: "alice", services: { tts: { ...config(), key: undefined, has_credential: true } } });
    await prepareClientServices();
    const teacher = { "seed-tts-2.0": { id: "calm-voice" } };
    await synthesizeDirect("一", undefined, undefined, teacher); await synthesizeDirect("试听", undefined, config(), teacher);
    api.request.mockResolvedValueOnce({ status: 429, body: "", code: null });
    await expect(synthesizeDirect("二", undefined, undefined, teacher)).rejects.toMatchObject({ state: "rate_limited" });
    const speakers = api.request.mock.calls.filter(([url]) => url === "/api/learn/byok/tts/relay").map(([, init]) => JSON.parse(init.body).payload.req_params.speaker);
    // Rate limiting is not a refusal: no fallback request and no extra charge.
    expect(speakers).toEqual(["calm-voice", "test-voice", "calm-voice"]);
  });
  it("does not send an old account's key after sign-out during WAV preparation", async () => {
    const result = transcribeDirect(new Blob(["wav"]), new AbortController().signal, config());
    resetClientServices();
    await expect(result).rejects.toMatchObject({ name: "AbortError" });
    expect(api.request).not.toHaveBeenCalled();
  });
});

// Language affects provider pronunciation, without adding a synthesis call.
it("uses the course language and lets bilingual quotations auto-detect", () => {
  expect(speechLanguageParameters("en-US", "Plot y = 2x.")).toEqual({ additions: JSON.stringify({ explicit_language: "en" }) });
  expect(speechLanguageParameters("zh-CN", "画 y = 2x。")).toEqual({ additions: JSON.stringify({ explicit_language: "zh-cn" }) });
  expect(speechLanguageParameters("en-US", 'Read the word “圆”.')).toEqual({});
  expect(speechLanguageParameters(undefined, "Legacy course")).toEqual({});
});

describe("Azure AI Speech (US English)", () => {
  it("narrates through the relay with the chosen voice and plays the returned MP3", async () => {
    api.request.mockResolvedValue({ status: 200, body: btoa("mp3!"), code: null });
    const audio = await synthesizeDirect("The slope is rise over run.", undefined, azure());
    expect(audio.type).toBe("audio/mpeg"); expect(audio.size).toBe(4);
    const [url, init] = api.request.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/learn/byok/tts/relay");
    expect(JSON.parse(init.body as string)).toEqual({ provider: "azure", params: { region: "eastus", voice: "en-US-AnaNeural" }, key: "own-azure-key", payload: { text: "The slope is rise over run.", voice: "en-US-AnaNeural" } });
  });
  it("narrates a lesson with the presenter's Azure voice, listed under the provider", async () => {
    api.request.mockImplementation(async (url: string) => url === "/api/learn/byok/tts/relay"
      ? { status: 200, body: btoa("mp3"), code: null }
      : { profile_id: "alice", services: { tts: { ...azure(), key: undefined, has_credential: true } } });
    await prepareClientServices();
    await synthesizeDirect("Hi", undefined, undefined, { azure: { id: "en-US-AndrewNeural" }, "seed-tts-2.0": { id: "zh-voice" } });
    const relayed = api.request.mock.calls.filter(([url]) => url === "/api/learn/byok/tts/relay").map(([, init]) => JSON.parse(init.body));
    expect(relayed).toEqual([{ provider: "azure", params: { region: "eastus", voice: "en-US-AnaNeural" }, expected_revision: "a1", payload: { text: "Hi", voice: "en-US-AndrewNeural" } }]);
    expect(speechResource(azure())).toBe("azure");
    expect(speechResource(config())).toBe("seed-tts-2.0");
  });
  it("recognizes US English and reports silence as no speech", async () => {
    api.request.mockResolvedValueOnce({ status: 200, body: JSON.stringify({ RecognitionStatus: "Success", DisplayText: " Point A is at two. " }), code: null });
    expect(await transcribeDirect(new Blob(["wav"]), new AbortController().signal, azure({ region: "westus2" }), { language: "en-US" })).toEqual({ status: "speech", transcript: "Point A is at two." });
    const body = JSON.parse((api.request.mock.calls[0] as [string, RequestInit])[1].body as string);
    expect(body.payload).toEqual({ audio: btoa("wav"), language: "en-US" });
    api.request.mockResolvedValueOnce({ status: 200, body: JSON.stringify({ RecognitionStatus: "InitialSilenceTimeout" }), code: null });
    expect((await transcribeDirect(new Blob(["wav"]), new AbortController().signal, azure({ region: "westus2" }))).status).toBe("no_speech");
  });
  it("chooses one recognition language: Chinese stays Chinese, everything else is US English", () => {
    expect(azureRecognitionLanguage("en-GB")).toBe("en-US");
    expect(azureRecognitionLanguage("zh-CN")).toBe("zh-CN");
  });
  it("validates region, voice, clip length and the TV bridge before any paid request", async () => {
    expect(() => validateService("tts", azure({ region: "east us", voice: "en-US-AnaNeural" }))).toThrow(tr("Enter your Azure Speech region, for example eastus."));
    expect(() => validateService("tts", azure({ region: "eastus", voice: "" }))).toThrow();
    expect(() => validateService("asr", azure({ region: "eastus" }))).not.toThrow();
    await expect(transcribeDirect(new Blob([new Uint8Array(AZURE_MAX_WAV_BYTES + 1)]), new AbortController().signal, azure({ region: "eastus" }))).rejects.toMatchObject({ state: "network_error" });
    window.OctosNativeByok = { request: vi.fn(), cancel: vi.fn() };
    expect(() => validateService("tts", azure())).toThrow(tr("Azure speech is available on the web for now. On this TV, use Volcano Engine."));
    expect(api.request).not.toHaveBeenCalled();
  });
  it("explains a rejected Azure key without echoing it", async () => {
    api.request.mockResolvedValue({ status: 401, body: "", code: null });
    const error = await synthesizeDirect("Hi", undefined, azure()).catch(value => value as Error);
    expect(error.message).toContain("Azure"); expect(error.message).not.toContain("own-azure-key");
  });
});
