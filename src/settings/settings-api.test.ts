import { describe, expect, it } from "vitest";
import {
  cronToggleRefusalReason,
  mergeProfileConfig,
  mergeLatestEnvironment,
  normalizeProfileConfig,
} from "./settings-api";
import { BridgeRpcError } from "@/runtime/ui-protocol-bridge";

describe("mergeProfileConfig — voice TTS fields", () => {
  it("should carry tts_provider and tts_cloud through a patch", () => {
    const current = normalizeProfileConfig({});
    const next = mergeProfileConfig(current, {
      tts_provider: "cloud",
      tts_cloud: { appid: "999", voice: "BV700" },
    });
    expect(next.tts_provider).toBe("cloud");
    expect(next.tts_cloud).toEqual({ appid: "999", voice: "BV700" });
  });

  it("should carry the ASR language override through a patch", () => {
    const cfg = normalizeProfileConfig({});
    const next = mergeProfileConfig(cfg, { asr_language: "English" });
    expect(next.asr_language).toBe("English");
    expect(mergeProfileConfig(next, { asr_language: null }).asr_language).toBeNull();
  });

  it("should default tts fields to undefined when absent", () => {
    const cfg = normalizeProfileConfig({});
    expect(cfg.tts_provider).toBeUndefined();
    expect(cfg.tts_cloud ?? undefined).toBeUndefined();
  });
});

describe("cronToggleRefusalReason — WS bridge refusal contract", () => {
  it("reads the reason from BridgeRpcError data.detail", () => {
    const err = new BridgeRpcError(
      -32602,
      "cron/toggle: REST returned 409 conflict",
      { detail: "gateway_running", rest_status: 409 },
    );
    expect(cronToggleRefusalReason(err)).toBe("gateway_running");
  });

  it("returns null for a BridgeRpcError without string detail", () => {
    const err = new BridgeRpcError(-32001, "auth required", {
      kind: "auth_unavailable",
    });
    expect(cronToggleRefusalReason(err)).toBeNull();
  });

  it("returns null for plain errors (legacy REST body parsing is gone)", () => {
    const err = new Error(
      JSON.stringify({ ok: false, reason: "gateway_running" }),
    );
    expect(cronToggleRefusalReason(err)).toBeNull();
  });
});

describe("fresh profile environment merge", () => {
  it("preserves newly saved speech configuration and masked LLM keys", () => {
    expect(mergeLatestEnvironment({ GEMINI_API_KEY: "********" }, { GEMINI_API_KEY: "********", SERPER_API_KEY: "own-new" }, {
      GEMINI_API_KEY: "********", OCTOS_LEARN_TTS_API_KEY: "********", OCTOS_LEARN_TTS_PARAMS: "********",
    })).toEqual({ GEMINI_API_KEY: "********", SERPER_API_KEY: "own-new", OCTOS_LEARN_TTS_API_KEY: "********", OCTOS_LEARN_TTS_PARAMS: "********" });
  });
  it("does not resurrect a deleted speech key from stale settings", () => {
    expect(mergeLatestEnvironment({ OCTOS_LEARN_TTS_API_KEY: "********", GEMINI_API_KEY: "********" }, undefined, { GEMINI_API_KEY: "********" }))
      .toEqual({ GEMINI_API_KEY: "********" });
  });
  it("keeps explicit ordinary key deletion and rotation while ignoring stale unchanged fields", () => {
    expect(mergeLatestEnvironment({ KEEP: "old", DROP: "********", ROTATE: "********" }, { KEEP: "old", ROTATE: "new" }, { KEEP: "fresh", DROP: "********", ROTATE: "********", ADDED: "********" }))
      .toEqual({ KEEP: "fresh", ROTATE: "new", ADDED: "********" });
  });
});
