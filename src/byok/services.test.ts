import { beforeEach, describe, expect, it, vi } from "vitest";
const api = vi.hoisted(() => ({ token: "alice", profile: "alice", request: vi.fn() }));
vi.mock("@/api/client", () => ({ getToken: () => api.token, getSelectedProfileId: () => api.profile, request: api.request }));
import { getService, getServiceStatus, prepareClientServices, resetClientServices, serviceRequest, saveClientService, deleteClientService } from "./services";
const configured = (key = "alice-own-key") => ({ profile_id: "alice", services: { tts: { provider: "azure", enabled: true, params: { region: "eastasia", voice: "zh-CN-XiaoxiaoNeural" }, key, revision: "r1", execution_target: "client" } } });
beforeEach(() => { api.token = "alice"; api.profile = "alice"; api.request.mockReset(); resetClientServices(); });
describe("owner-scoped client snapshots", () => {
  it("coalesces login synchronization and does not fetch on capability reads", async () => {
    api.request.mockResolvedValue(configured());
    await Promise.all([prepareClientServices(), prepareClientServices()]);
    expect(api.request).toHaveBeenCalledOnce();
    expect(api.request.mock.calls[0][0]).toBe("/api/my/client-services/sync");
    expect(getService("tts")?.key).toBe("alice-own-key");
    expect(getServiceStatus("tts").state).toBe("configured_unverified");
    await prepareClientServices(); getService("tts");
    expect(api.request).toHaveBeenCalledOnce();
    expect(localStorage.getItem("alice-own-key")).toBeNull();
  });
  it("discards credentials and pending provider work on account change", async () => {
    api.request.mockResolvedValue(configured()); await prepareClientServices();
    const owned = serviceRequest();
    api.token = "bob"; api.profile = "bob";
    expect(getService("tts")).toBeUndefined();
    expect(owned.signal.aborted).toBe(true);
    expect(getServiceStatus("tts").state).toBe("unconfigured");
  });
  it("does not accept a delayed synchronization from the previous identity", async () => {
    let resolve!: (value: unknown) => void;
    api.request.mockImplementation(() => new Promise(done => { resolve = done; }));
    const pending = prepareClientServices();
    api.token = "bob"; resolve(configured()); await pending;
    expect(getService("tts")).toBeUndefined();
  });
  it("does not silently acquire legacy credentials when sync is unavailable", async () => {
    api.request.mockRejectedValue(new Error("404"));
    await expect(prepareClientServices()).rejects.toThrow();
    expect(getService("tts")).toBeUndefined();
    expect(api.request.mock.calls.every(call => call[0] === "/api/my/client-services/sync")).toBe(true);
  });
  it("sends explicit revision on save and delete and never an arbitrary profile id", async () => {
    api.request.mockResolvedValue(configured());
    await saveClientService("tts", { provider: "azure", params: { region: "eastasia" }, enabled: true }, "r1");
    expect(JSON.parse(api.request.mock.calls[0][1].body)).toEqual({ provider: "azure", params: { region: "eastasia" }, enabled: true, expected_revision: "r1" });
    await deleteClientService("tts", "r1");
    expect(api.request.mock.calls.some(call => call[0] === "/api/my/client-services/tts" && call[1].method === "DELETE")).toBe(true);
  });
  it("invalidates only the changed capability while preserving other in-flight work", async () => {
    api.request.mockResolvedValue(configured()); await prepareClientServices();
    const tts = serviceRequest(undefined, "tts");
    const asr = serviceRequest(undefined, "asr");
    await deleteClientService("asr", "r1");
    expect(asr.signal.aborted).toBe(true);
    expect(tts.signal.aborted).toBe(false);
    expect(getService("tts")?.key).toBe("alice-own-key");
  });

});
