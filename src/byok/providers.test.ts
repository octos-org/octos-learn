import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const api = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("@/api/client", () => ({ getToken: () => "alice", getSelectedProfileId: () => "alice", request: api.request }));
import { resetClientServices, prepareClientServices, getServiceStatus, type ClientService } from "./services";
import { directJson, synthesizeDirect, transcribeDirect, validateService } from "./providers";
const config = (provider = "azure"): ClientService => ({ provider, enabled: true, key: "own-canary-key", params: { region: "eastasia", voice: "zh-CN-XiaoxiaoNeural", auth_mode: "api-key", resource_id: "seed-tts-2.0" }, revision: "r1", execution_target: "client" });
beforeEach(() => { resetClientServices(); delete window.OctosNativeByok; });
afterEach(() => { vi.unstubAllGlobals(); delete window.OctosNativeByok; });
describe("direct BYOK providers", () => {
  it("synthesizes Azure speech directly with caller credentials and XML-escaped text", async () => {
    const fetch = vi.fn(async () => new Response("mp3", { headers: { "Content-Type": "audio/mpeg" } })); vi.stubGlobal("fetch", fetch);
    const blob = await synthesizeDirect("a < b & c", undefined, config());
    expect(blob.size).toBe(3);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://eastasia.tts.speech.microsoft.com/cognitiveservices/v1");
    expect(init).toMatchObject({ credentials: "omit", redirect: "error", headers: { "Ocp-Apim-Subscription-Key": "own-canary-key" } });
    expect(init.body).toContain("a &lt; b &amp; c");
    expect(JSON.stringify(init.headers)).not.toContain("Bearer alice");
  });
  it("transcribes Azure WAV directly and handles silence without any backend upload", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ RecognitionStatus: "Success", DisplayText: "学习数学" }))); vi.stubGlobal("fetch", fetch);
    expect(await transcribeDirect(new Blob(["wav"]), new AbortController().signal, config())).toEqual({ status: "speech", transcript: "学习数学" });
    expect(String(fetch.mock.calls[0][0])).toContain("eastasia.stt.speech.microsoft.com");
    fetch.mockResolvedValueOnce(new Response(JSON.stringify({ RecognitionStatus: "NoMatch" })));
    expect((await transcribeDirect(new Blob(["wav"]), new AbortController().signal, config())).status).toBe("no_speech");
  });
  it("does not make a paid request when credentials are missing or the browser is unsupported", async () => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    await expect(synthesizeDirect("hello")).rejects.toMatchObject({ state: "unconfigured" });
    expect(() => validateService("admission", config("typesafe"))).toThrow("跨域");
    expect(() => validateService("tts", config("volcano"))).toThrow("浏览器");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("rejects unsafe Azure region/voice and never interpolates an arbitrary endpoint", () => {
    expect(() => validateService("tts", { ...config(), params: { region: "attacker.example/", voice: "valid" } })).toThrow();
    expect(() => validateService("tts", { ...config(), params: { region: "eastasia", voice: 'x" onload="' } })).toThrow();
  });
  it("does not retry invalid credentials through platform speech", async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 401 })); vi.stubGlobal("fetch", fetch);
    await expect(synthesizeDirect("hi", undefined, config())).rejects.toMatchObject({ state: "invalid_credentials" });
    expect(fetch).toHaveBeenCalledOnce();
  });
  it("uses only the native direct Jev endpoint contract on television", async () => {
    window.OctosNativeByok = { request: vi.fn((id, capability, headers) => {
      expect(capability).toBe("admission"); expect(JSON.parse(headers).Authorization).toBe("Bearer own-canary-key");
      queueMicrotask(() => window.__octosNativeByokEvent?.(JSON.stringify({ id, status: 200, body: '{"answers":{}}' })));
      return '{"ok":true}';
    }), cancel: vi.fn() };
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    expect((await directJson("admission", config("typesafe"), {})).body).toContain("answers");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("cancels native requests and ignores late responses after identity reset", async () => {
    window.OctosNativeByok = { request: vi.fn(() => '{"ok":true}'), cancel: vi.fn() };
    const result = directJson("admission", config("typesafe"), {});
    resetClientServices();
    await expect(result).rejects.toMatchObject({ name: "AbortError" });
    expect(window.OctosNativeByok.cancel).toHaveBeenCalledOnce();
  });
  it("does not label a saved draft ready without an actual successful request", async () => {
    api.request.mockResolvedValue({ profile_id: "alice", services: { tts: config() } });
    await prepareClientServices();
    expect(getServiceStatus("tts").state).toBe("configured_unverified");
  });
  it("does not send an old account's key after sign-out during WAV preparation", async () => {
    window.OctosNativeByok = { request: vi.fn(() => '{"ok":true}'), cancel: vi.fn() };
    const result = transcribeDirect(new Blob(["wav"]), new AbortController().signal, config("volcano"));
    resetClientServices();
    await expect(result).rejects.toMatchObject({ name: "AbortError" });
    expect(window.OctosNativeByok.request).not.toHaveBeenCalled();
  });

});
