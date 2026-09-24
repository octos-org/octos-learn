import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearAdmissionEventHistory,
  recordAdmissionEvent,
} from "./admission-fast-gate";
import * as admissionFastGate from "./admission-fast-gate";
import { JevAdmissionDebugger } from "./jev-admission-debugger";

afterEach(() => {
  cleanup();
  clearAdmissionEventHistory();
  vi.restoreAllMocks();
});

describe("JevAdmissionDebugger", () => {
  it("renders collapsed trigger initially and expands on click", async () => {
    vi.spyOn(admissionFastGate, "getSystemOneStatus").mockResolvedValueOnce({
      available: true,
      hasKey: true,
      keyPreview: "apikey_123...",
      source: "grant",
    });

    render(<JevAdmissionDebugger />);

    const trigger = screen.getByRole("button", { name: /Jev 准入/i });
    expect(trigger).toBeTruthy();
    expect(screen.queryByText("TypeSafe Jev 准入监视")).toBeNull();

    fireEvent.click(trigger);

    expect(await screen.findByText("TypeSafe Jev 准入监视")).toBeTruthy();
    expect(screen.getByText(/Key 就绪/)).toBeTruthy();
    expect(screen.getByText("等待语音或键盘输入...")).toBeTruthy();
  });

  it("displays real-time admission events and updates counts", async () => {
    vi.spyOn(admissionFastGate, "getSystemOneStatus").mockResolvedValueOnce({
      available: true,
      hasKey: true,
      keyPreview: "apikey_123...",
      source: "grant",
    });

    recordAdmissionEvent(
      { text: "呃...那个", modality: "voice" },
      {
        disposition: "ignore",
        confidence: 0.85,
        isSelfContained: false,
        source: "jev_direct",
        elapsedMs: 82,
        latencyMs: 82,
      },
    );

    recordAdmissionEvent(
      { text: "勾股定理怎么证明", modality: "text" },
      {
        disposition: "generate_lesson",
        confidence: 0.98,
        subject: "math",
        isSelfContained: true,
        source: "jev_direct",
        elapsedMs: 110,
        latencyMs: 110,
      },
    );

    render(<JevAdmissionDebugger />);

    // Expand
    fireEvent.click(screen.getByRole("button", { name: /Jev 准入/i }));

    expect(await screen.findByText("“呃...那个”")).toBeTruthy();
    expect(screen.getByText("“勾股定理怎么证明”")).toBeTruthy();
    expect(screen.getByText("🚫 静默拦截")).toBeTruthy();
    expect(screen.getByText("✅ 准入排课")).toBeTruthy();
    expect(screen.getByText("学科: math")).toBeTruthy();

    // Clear history
    fireEvent.click(screen.getByTitle("清空记录"));
    expect(screen.getByText("等待语音或键盘输入...")).toBeTruthy();
  });

  it("collapses back when clicking collapse button", async () => {
    render(<JevAdmissionDebugger />);

    // Expand
    fireEvent.click(screen.getByRole("button", { name: /Jev 准入/i }));
    expect(await screen.findByText("TypeSafe Jev 准入监视")).toBeTruthy();

    // Collapse
    fireEvent.click(screen.getByTitle("收起"));
    await waitFor(() => {
      expect(screen.queryByText("TypeSafe Jev 准入监视")).toBeNull();
    });
    expect(screen.getByRole("button", { name: /Jev 准入/i })).toBeTruthy();
  });

  it("triggers quick test when quick test button is clicked", async () => {
    const evalSpy = vi.spyOn(admissionFastGate, "evaluateAdmissionFastGate").mockImplementation(async (input) => {
      const res: admissionFastGate.AdmissionFastGateResult = {
        disposition: "ignore",
        confidence: 0.9,
        isSelfContained: false,
        source: "jev_direct",
        elapsedMs: 70,
        latencyMs: 70,
      };
      admissionFastGate.recordAdmissionEvent(input, res);
      return res;
    });

    render(<JevAdmissionDebugger />);
    fireEvent.click(screen.getByRole("button", { name: /Jev 准入/i }));

    const testBtn = await screen.findByRole("button", { name: "测试语气词" });
    fireEvent.click(testBtn);

    await waitFor(() => {
      expect(evalSpy).toHaveBeenCalledWith({
        text: "呃...那个",
        modality: "voice",
      });
    });

    expect(await screen.findByText("“呃...那个”")).toBeTruthy();
  });

  it("renders passthrough fallback events with neutral badge and distinguishes from admissions", async () => {
    recordAdmissionEvent(
      { text: "测试降级放行", modality: "text" },
      {
        disposition: "generate_lesson",
        confidence: 0,
        isSelfContained: true,
        source: "passthrough",
        reason: "未配置 Jev 凭据，已降级直通排课流程",
        elapsedMs: 5,
        latencyMs: 5,
      },
    );

    render(<JevAdmissionDebugger />);
    fireEvent.click(screen.getByRole("button", { name: /Jev 准入/i }));

    expect(await screen.findByText("“测试降级放行”")).toBeTruthy();
    expect(screen.getByText("🔄 降级放行")).toBeTruthy();
    expect(screen.getByText(/未配置 Jev 凭据/)).toBeTruthy();
    expect(screen.getByText("降级:")).toBeTruthy();
  });
});
