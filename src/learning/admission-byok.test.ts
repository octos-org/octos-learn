import { afterEach, beforeEach, expect, it, vi } from "vitest";
const api = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("@/api/client", () => ({ getToken: () => "alice", getSelectedProfileId: () => "alice", request: api.request }));
import { evaluateAdmissionFastGate, getSystemOneStatus } from "./admission-fast-gate";
import { prepareClientServices, resetClientServices } from "@/byok/services";
const metadata = { profile_id: "alice", services: { admission: { provider: "typesafe", params: { model: "jev-latest" }, enabled: true, has_credential: true, credential_revision: "key-digest", revision: "r1", execution_target: "client" } } };
const answer = { model: "jev-latest", answers: { disposition: { choice: "ignore", probabilities: { ignore: 0.98, clarify: 0.01, generate_lesson: 0.01 }, confidence: 0.97 }, subject: { choice: "other", confidence: 0.9, probabilities: { other: 0.9 } }, is_self_contained: { noul: 0.05 } } };
beforeEach(() => { delete window.OctosNativeByok; resetClientServices(); api.request.mockReset(); });
afterEach(() => { delete window.OctosNativeByok; });
it("uses saved Jev metadata for actual browser admission without a raw key or per-question sync", async () => {
  api.request.mockResolvedValueOnce(metadata); await prepareClientServices();
  expect(await getSystemOneStatus()).toMatchObject({ available: true, hasKey: true });
  api.request.mockResolvedValue({ status: 200, body: JSON.stringify(answer), code: null });
  const result = await evaluateAdmissionFastGate({ text: "嗯", modality: "voice" });
  expect(result).toMatchObject({ source: "jev_direct", disposition: "ignore" });
  expect(api.request).toHaveBeenCalledTimes(2);
  expect(api.request.mock.calls[1][0]).toBe("/api/learn/byok/admission/relay");
  const body = JSON.parse(api.request.mock.calls[1][1].body);
  expect(body).not.toHaveProperty("key"); expect(body).toMatchObject({ expected_revision: "r1", payload: { model: "jev-latest", state: { learner_request: "嗯" } } });
});
function native(local: boolean) {
  window.OctosNativeByok = { bindScope: () => '{"ok":true}', reconcile: raw => { const value = JSON.parse(raw); value.services.admission.local_credential = local; return JSON.stringify(value); },
    request: vi.fn((id, _capability, config) => {
      expect(JSON.parse(config)).not.toHaveProperty("key");
      queueMicrotask(() => window.__octosNativeByokEvent?.(JSON.stringify({ id, status: 200, body: JSON.stringify(answer) }))); return '{"ok":true}';
    }), cancel: vi.fn() };
}
it("uses the native local Jev key for actual TV admission with no relay", async () => {
  native(true); api.request.mockResolvedValue(metadata); await prepareClientServices();
  expect(await evaluateAdmissionFastGate({ text: "嗯", modality: "voice" })).toMatchObject({ source: "jev_direct", disposition: "ignore" });
  expect(window.OctosNativeByok?.request).toHaveBeenCalledOnce(); expect(api.request).toHaveBeenCalledOnce();
});
it("skips optional Jev when its account key has not been entered on this TV", async () => {
  native(false); api.request.mockResolvedValue(metadata); await prepareClientServices();
  expect(await getSystemOneStatus()).toMatchObject({ available: false, hasKey: true });
  expect(await evaluateAdmissionFastGate({ text: "学习数学", modality: "text" })).toMatchObject({ source: "passthrough", disposition: "generate_lesson" });
  expect(window.OctosNativeByok?.request).not.toHaveBeenCalled(); expect(api.request).toHaveBeenCalledOnce();
});
