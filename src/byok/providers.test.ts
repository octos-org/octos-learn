import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const api = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("@/api/client", () => ({ getToken: () => "alice", getSelectedProfileId: () => "alice", request: api.request }));
import { resetClientServices, prepareClientServices, getServiceStatus, type ClientService } from "./services";
import { directJson, synthesizeDirect, transcribeDirect, validateService } from "./providers";
const config = (provider = "volcano"): ClientService => ({ provider, enabled: true, key: "own-canary-key", params: { voice: "test-voice", auth_mode: "api-key", resource_id: "seed-tts-2.0" }, revision: "r1", execution_target: "client" });
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
  it("relays browser ASR and preserves the upstream status header for speech and silence", async () => {
    api.request.mockResolvedValueOnce({ status: 200, body: '{"result":{"text":"学习数学"}}', code: "20000000" });
    expect(await transcribeDirect(new Blob(["wav"]), new AbortController().signal, config())).toEqual({ status: "speech", transcript: "学习数学" });
    expect(api.request.mock.calls[0][0]).toBe("/api/learn/byok/asr/relay");
    api.request.mockResolvedValueOnce({ status: 200, body: "{}", code: "20000003" });
    expect((await transcribeDirect(new Blob(["wav"]), new AbortController().signal, config())).status).toBe("no_speech");
  });
  it("relays optional browser Jev using the caller's key", async () => {
    api.request.mockResolvedValue({ status: 200, body: '{"answers":{}}', code: null });
    expect((await directJson("admission", config("typesafe"), { state: "数学" })).body).toContain("answers");
    expect(api.request.mock.calls[0][0]).toBe("/api/learn/byok/admission/relay");
  });
  it("refuses missing credentials, Azure and old auth before any paid request", async () => {
    await expect(synthesizeDirect("hello")).rejects.toMatchObject({ state: "unconfigured" });
    expect(() => validateService("tts", config("azure"))).toThrow("供应商");
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
