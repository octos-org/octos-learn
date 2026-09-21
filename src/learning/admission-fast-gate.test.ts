import { describe, it, expect, vi } from "vitest";
import {
  evaluateAdmissionFastGate,
  type AdmissionFastGateInput,
} from "./admission-fast-gate";

describe("admission-fast-gate", () => {
  const dummyKey = "ts-test-key-54321";

  it("immediately returns ignore for empty text without calling remote API", async () => {
    const fetchFn = vi.fn();
    const result = await evaluateAdmissionFastGate(
      { text: "   ", modality: "voice" },
      { fetchFn, apiKey: dummyKey },
    );

    expect(result.disposition).toBe("ignore");
    expect(result.source).toBe("fallback_local");
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("passes through safely when no API key is available", async () => {
    const fetchFn = vi.fn();
    const result = await evaluateAdmissionFastGate(
      { text: "我想学习微积分", modality: "text" },
      { fetchFn, apiKey: "" },
    );

    expect(result.disposition).toBe("generate_lesson");
    expect(result.confidence).toBe(0);
    expect(result.reason).toContain("未配置 Jev 凭据");
    expect(result.source).toBe("passthrough");
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("admits substantive lesson topic with math subject domain", async () => {
    const mockResponse = {
      answers: {
        disposition: {
          choice: "generate_lesson",
          probabilities: { generate_lesson: 0.96, clarify: 0.02, ignore: 0.02 },
          confidence: 0.94,
        },
        subject: {
          choice: "math",
          probabilities: { math: 0.98, physics: 0.01 },
          confidence: 0.96,
        },
        is_self_contained: {
          noul: 0.92,
        },
      },
      model: "jev-latest",
    };

    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(mockResponse),
    });

    const result = await evaluateAdmissionFastGate(
      { text: "勾股定理的证明方法", modality: "voice" },
      { fetchFn: fetchFn as unknown as typeof fetch, apiKey: dummyKey },
    );

    expect(result.disposition).toBe("generate_lesson");
    expect(result.subject).toBe("math");
    expect(result.isSelfContained).toBe(true);
    expect(result.source).toBe("jev_direct");
  });

  it("intercepts filler / noise speech and classifies as ignore", async () => {
    const mockResponse = {
      answers: {
        disposition: {
          choice: "ignore",
          probabilities: { ignore: 0.98, clarify: 0.01, generate_lesson: 0.01 },
          confidence: 0.97,
        },
        subject: {
          choice: "other",
          probabilities: { other: 0.9 },
          confidence: 0.8,
        },
        is_self_contained: {
          noul: 0.05,
        },
      },
      model: "jev-latest",
    };

    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(mockResponse),
    });

    const result = await evaluateAdmissionFastGate(
      { text: "呃……那个……啊对", modality: "voice" },
      { fetchFn: fetchFn as unknown as typeof fetch, apiKey: dummyKey },
    );

    expect(result.disposition).toBe("ignore");
    expect(result.source).toBe("jev_direct");
  });

  it("classifies fragmented input as clarify and generates question prompt", async () => {
    const mockResponse = {
      answers: {
        disposition: {
          choice: "clarify",
          probabilities: { clarify: 0.91, ignore: 0.05, generate_lesson: 0.04 },
          confidence: 0.88,
        },
        subject: {
          choice: "other",
          probabilities: { other: 0.8 },
          confidence: 0.7,
        },
        is_self_contained: {
          noul: 0.15,
        },
      },
      model: "jev-latest",
    };

    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(mockResponse),
    });

    const result = await evaluateAdmissionFastGate(
      { text: "这本书", modality: "voice" },
      { fetchFn: fetchFn as unknown as typeof fetch, apiKey: dummyKey },
    );

    expect(result.disposition).toBe("clarify");
    expect(result.clarificationPrompt).toContain("这本书");
    expect(result.source).toBe("jev_direct");
  });

  it("falls back to passthrough if confidence is below threshold and lesson probability is significant", async () => {
    const mockResponse = {
      answers: {
        disposition: {
          choice: "ignore",
          probabilities: { ignore: 0.45, generate_lesson: 0.4, clarify: 0.15 },
          confidence: 0.42, // below 0.6 threshold and generate_lesson >= 0.35
        },
        subject: {
          choice: "math",
          probabilities: { math: 0.6 },
          confidence: 0.5,
        },
        is_self_contained: {
          noul: 0.5,
        },
      },
      model: "jev-latest",
    };

    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(mockResponse),
    });

    const result = await evaluateAdmissionFastGate(
      { text: "不太确定的边缘输入", modality: "voice" },
      { fetchFn: fetchFn as unknown as typeof fetch, apiKey: dummyKey },
    );

    expect(result.disposition).toBe("generate_lesson");
    expect(result.source).toBe("passthrough");
  });

  it("retains ignore choice when lesson probability is zero even if margin confidence is moderate", async () => {
    const mockResponse = {
      answers: {
        disposition: {
          choice: "ignore",
          probabilities: { ignore: 0.69, clarify: 0.31, generate_lesson: 0.0 },
          confidence: 0.54, // below 0.6, but generate_lesson is 0.0
        },
        subject: {
          choice: "other",
          probabilities: { other: 0.9 },
          confidence: 0.8,
        },
        is_self_contained: {
          noul: 0.03,
        },
      },
      model: "jev-latest",
    };

    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(mockResponse),
    });

    const result = await evaluateAdmissionFastGate(
      { text: "呃...那个", modality: "voice" },
      { fetchFn: fetchFn as unknown as typeof fetch, apiKey: dummyKey },
    );

    expect(result.disposition).toBe("ignore");
    expect(result.source).toBe("jev_direct");
  });

  it("gracefully falls back to passthrough upon network failure or timeout", async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error("Network connection lost"));

    const result = await evaluateAdmissionFastGate(
      { text: "二次函数", modality: "voice" },
      { fetchFn: fetchFn as unknown as typeof fetch, apiKey: dummyKey },
    );

    expect(result.disposition).toBe("generate_lesson");
    expect(result.source).toBe("passthrough");
  });
});
