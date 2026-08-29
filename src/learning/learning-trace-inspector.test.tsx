import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LearnTraceRecorder } from "./learn-trace";
import { LearningTraceInspector } from "./learning-trace-inspector";

const originalClipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");

afterEach(() => {
  cleanup();
  if (originalClipboard) {
    Object.defineProperty(navigator, "clipboard", originalClipboard);
  } else {
    delete (navigator as unknown as { clipboard?: unknown }).clipboard;
  }
});

describe("LearningTraceInspector", () => {
  it("opens a live timeline, copies JSONL, and clears it", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    const recorder = new LearnTraceRecorder("learn-session", {
      now: () => 1_000,
    });
    recorder.record({
      turnId: "turn-1",
      source: "octos-web",
      stage: "request-submitted",
    });

    render(<LearningTraceInspector recorder={recorder} />);

    const trigger = screen.getByRole("button", { name: "Trace 1" });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(trigger);

    expect(screen.getByRole("region", {
      name: "Learn Trace Inspector",
    })).toBeTruthy();
    expect(screen.getByText("request-submitted")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "复制 JSONL" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(recorder.toJsonl()));
    expect(screen.getByRole("button", { name: "已复制" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "清空" }));
    expect(screen.getByRole("button", { name: "Trace 0" })).toBeTruthy();
    expect(screen.queryByText("request-submitted")).toBeNull();
  });
});
