import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const api = vi.hoisted(() => ({ token: "alice", profile: "alice", request: vi.fn() }));
vi.mock("@/api/client", () => ({ getToken: () => api.token, getSelectedProfileId: () => api.profile, request: api.request }));
import { getService, getServiceStatus, hasServiceCredential, prepareClientServices, resetClientServices, serviceRequest, saveClientService, deleteClientService, getServiceForTest } from "./services";
const configured = (hasCredential = true) => ({ profile_id: "alice", services: { tts: { provider: "volcano", enabled: true, has_credential: hasCredential, params: { auth_mode: "api-key", resource_id: "seed-tts-2.0", voice: "voice-one" }, credential_revision: "key-hash", revision: "r1", execution_target: "client" } } });
beforeEach(() => { delete window.OctosNativeByok; api.token = "alice"; api.profile = "alice"; api.request.mockReset(); resetClientServices(); });
afterEach(() => { delete window.OctosNativeByok; });
function native(local = true) {
  const bridge = { request: vi.fn(), cancel: vi.fn(), bindScope: vi.fn(() => '{"ok":true}'),
    reconcile: vi.fn((raw: string) => { const envelope = JSON.parse(raw); envelope.services.tts.local_credential = local; envelope.services.tts.account_synced = true; return JSON.stringify(envelope); }),
    saveCredential: vi.fn(() => '{"ok":true}'), removeCredential: vi.fn(() => '{"ok":true}'), clearCredentials: vi.fn(() => '{"ok":true}') };
  window.OctosNativeByok = bridge; return bridge;
}
describe("owner-scoped metadata and local native keys", () => {
  it("coalesces preparation, retains only metadata, and never fetches on provider reads", async () => {
    api.request.mockResolvedValue(configured());
    await Promise.all([prepareClientServices(), prepareClientServices()]);
    expect(api.request).toHaveBeenCalledOnce(); expect(api.request.mock.calls[0][0]).toBe("/api/learn/byok/prepare");
    expect(getService("tts")).toMatchObject({ key: "", has_credential: true });
    expect(hasServiceCredential(getService("tts"))).toBe(true);
    await prepareClientServices(); getService("tts"); expect(api.request).toHaveBeenCalledOnce();
    expect(getServiceStatus("tts").state).toBe("configured_unverified");
  });
  it("discards metadata and cancels provider work on account change", async () => {
    api.request.mockResolvedValue(configured()); await prepareClientServices(); const owned = serviceRequest();
    api.token = "bob"; api.profile = "bob";
    expect(getService("tts")).toBeUndefined(); expect(owned.signal.aborted).toBe(true);
    expect(getServiceStatus("tts").state).toBe("unconfigured");
  });
  it("discards delayed configuration from the previous identity before native binding", async () => {
    const bridge = native(); let resolve!: (value: unknown) => void;
    api.request.mockImplementation(() => new Promise(done => { resolve = done; }));
    const pending = prepareClientServices(); api.token = "bob"; resolve(configured()); await pending;
    expect(getService("tts")).toBeUndefined(); expect(bridge.bindScope).not.toHaveBeenCalled();
  });
  it("never falls back to the withdrawn Octos API", async () => {
    api.request.mockRejectedValue(new Error("unavailable")); await expect(prepareClientServices()).rejects.toThrow();
    expect(api.request.mock.calls.every(call => call[0] === "/api/learn/byok/prepare")).toBe(true);
  });
  it("sends explicit revisions and no arbitrary profile id", async () => {
    api.request.mockResolvedValue(configured());
    await saveClientService("tts", { provider: "volcano", params: {}, enabled: true }, "r1");
    expect(JSON.parse(api.request.mock.calls[0][1].body)).toEqual({ provider: "volcano", params: {}, enabled: true, expected_revision: "r1" });
    await deleteClientService("tts", "r1");
    expect(api.request.mock.calls.some(call => call[0] === "/api/learn/byok/tts" && call[1].method === "DELETE")).toBe(true);
  });
  it("invalidates only the edited capability", async () => {
    api.request.mockResolvedValue(configured()); await prepareClientServices();
    const tts = serviceRequest(undefined, "tts"), asr = serviceRequest(undefined, "asr");
    await deleteClientService("asr", "r1"); expect(asr.signal.aborted).toBe(true); expect(tts.signal.aborted).toBe(false);
    expect(getService("tts")?.has_credential).toBe(true);
  });
  it("key presence connects automatically and an empty key disconnects", async () => {
    const value = configured(); value.services.tts.enabled = false; api.request.mockResolvedValue(value); await prepareClientServices();
    expect(getService("tts")?.enabled).toBe(true);
    expect((await getServiceForTest("tts", new AbortController().signal))?.key).toBe("");
    api.request.mockResolvedValue(configured(false)); await prepareClientServices(true);
    expect(hasServiceCredential(getService("tts"))).toBe(false);
    expect(getServiceStatus("tts").state).toBe("unconfigured");
  });
  it("native preparation binds the authenticated owner without exporting a key", async () => {
    const bridge = native(); api.request.mockResolvedValue(configured()); await prepareClientServices();
    expect(bridge.bindScope).toHaveBeenCalledWith(location.origin, "alice"); expect(bridge.reconcile).toHaveBeenCalledOnce();
    expect(getService("tts")?.key).toBe(""); expect(hasServiceCredential(getService("tts"))).toBe(true);
    expect(bridge.saveCredential).not.toHaveBeenCalled();
  });
  it("requires entry on this TV when an account key exists only on the server", async () => {
    native(false); api.request.mockResolvedValue(configured()); await prepareClientServices();
    expect(hasServiceCredential(getService("tts"))).toBe(false); expect(getServiceStatus("tts").detail).toContain("录入一次");
  });
  it("saves locally before account persistence and never persists a draft in browser storage", async () => {
    const bridge = native(); api.request.mockResolvedValue(configured()); await prepareClientServices();
    api.request.mockImplementation(async (url: string) => { if (url.endsWith("/tts")) expect(bridge.saveCredential).toHaveBeenCalledOnce(); return configured(); });
    await saveClientService("tts", { provider: "volcano", params: {}, enabled: true, key: "synthetic-own-key" }, "r1");
    expect(bridge.saveCredential).toHaveBeenCalledWith("tts", expect.stringContaining("synthetic-own-key"));
    expect(JSON.stringify(localStorage)).not.toContain("synthetic-own-key");
  });
  it("refuses account save if local secure storage fails", async () => {
    const bridge = native(); api.request.mockResolvedValue(configured()); await prepareClientServices();
    bridge.saveCredential.mockReturnValue('{"ok":false}'); api.request.mockClear();
    await expect(saveClientService("tts", { provider: "volcano", params: {}, enabled: true, key: "synthetic-own-key" }, "r1")).rejects.toThrow("安全保存");
    expect(api.request).not.toHaveBeenCalled();
  });
  it("reports partial native saves and does not delete the local copy on server failure", async () => {
    const bridge = native(); api.request.mockResolvedValue(configured()); await prepareClientServices();
    api.request.mockImplementation(async (url: string) => { if (url.endsWith("/tts")) throw new Error("offline"); return configured(); });
    await expect(saveClientService("tts", { provider: "volcano", params: {}, enabled: true, key: "synthetic-own-key" }, "r1")).rejects.toThrow("已保存在本机");
    expect(bridge.removeCredential).not.toHaveBeenCalled(); expect(bridge.clearCredentials).not.toHaveBeenCalled();
  });
  it("logout clears native encrypted credentials and cancels all in-flight work", async () => {
    const bridge = native(); api.request.mockResolvedValue(configured()); await prepareClientServices(); const owned = serviceRequest();
    window.dispatchEvent(new Event("crew:token_cleared"));
    expect(owned.signal.aborted).toBe(true); expect(bridge.clearCredentials).toHaveBeenCalledOnce(); expect(getService("tts")).toBeUndefined();
  });
});
