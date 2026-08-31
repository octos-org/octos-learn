import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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

  it("shows and copies the complete trace and turn IDs independently", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    const recorder = new LearnTraceRecorder("learn-session", { now: () => 1_000 });
    const turnId = "learn-turn-12345678-1234-1234-1234-123456789012";
    const traceId = "learn-trace-87654321-4321-4321-4321-210987654321";
    const event = recorder.record({
      turnId,
      source: "octos-web",
      stage: "request-submitted",
      data: { input_modality: "text" },
    });
    // Keep distinct IDs in the fixture so the UI cannot accidentally alias them.
    event.trace_id = traceId;

    render(<LearningTraceInspector recorder={recorder} />);
    fireEvent.click(screen.getByRole("button", { name: "Trace 1" }));

    const turn = screen.getByRole("region", { name: `Turn ${turnId}` });
    expect(within(turn).getByText("trace_id")).toBeTruthy();
    expect(within(turn).getByText("turn_id")).toBeTruthy();
    expect(within(turn).getByText(traceId)).toBeTruthy();
    expect(within(turn).getByText(turnId)).toBeTruthy();

    fireEvent.click(within(turn).getByRole("button", { name: `复制 trace_id ${traceId}` }));
    await waitFor(() => expect(writeText).toHaveBeenLastCalledWith(traceId));
    fireEvent.click(within(turn).getByRole("button", { name: `复制 turn_id ${turnId}` }));
    await waitFor(() => expect(writeText).toHaveBeenLastCalledWith(turnId));
    expect(within(turn).getAllByText("已复制")).toHaveLength(2);

    const details = within(turn).getByText("完整事件 JSON").closest("details");
    expect(details?.querySelector("pre")?.textContent).toBe(JSON.stringify(event, null, 2));
  });

  it("groups interleaved sources by turn and updates the newest group live", () => {
    const recorder = new LearnTraceRecorder("learn-session");
    recorder.record({
      turnId: "turn-a", source: "octos-web", stage: "request-submitted", recordedAtEpochMs: 1_000,
    });
    recorder.record({
      turnId: "turn-b", source: "octos-web", stage: "request-submitted", recordedAtEpochMs: 2_000,
    });
    recorder.record({
      turnId: "turn-a", source: "learning-coach", stage: "model-stream", recordedAtEpochMs: 3_000,
    });

    render(<LearningTraceInspector recorder={recorder} />);
    fireEvent.click(screen.getByRole("button", { name: "Trace 3" }));

    const panel = screen.getByRole("region", { name: "Learn Trace Inspector" });
    expect(within(panel).getAllByRole("region").map((turn) => turn.getAttribute("aria-label")))
      .toEqual(["Turn turn-a", "Turn turn-b"]);
    const firstTurn = screen.getByRole("region", { name: "Turn turn-a" });
    expect(within(firstTurn).getByText("2 条事件")).toBeTruthy();
    expect(within(firstTurn).getAllByText("turn-a")).toHaveLength(2);
    expect([...firstTurn.querySelectorAll(".learning-trace-event strong")].map((node) => node.textContent))
      .toEqual(["model-stream", "request-submitted"]);
    expect(within(firstTurn).getByText("+2000ms")).toBeTruthy();

    act(() => {
      recorder.record({
        turnId: "turn-b", source: "learning-coach", stage: "model-stream", recordedAtEpochMs: 4_000,
      });
    });
    expect(within(panel).getAllByRole("region").map((turn) => turn.getAttribute("aria-label")))
      .toEqual(["Turn turn-b", "Turn turn-a"]);
  });

  it("reports clipboard failure without hiding the selectable ID", async () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error("Clipboard denied")) },
    });
    const recorder = new LearnTraceRecorder("learn-session");
    recorder.record({ turnId: "turn-1", source: "octos-web", stage: "request-submitted" });
    render(<LearningTraceInspector recorder={recorder} />);
    fireEvent.click(screen.getByRole("button", { name: "Trace 1" }));
    fireEvent.click(screen.getByRole("button", { name: "复制 trace_id turn-1" }));

    await waitFor(() => expect(screen.getByText("复制失败")).toBeTruthy());
    expect(screen.getAllByText("turn-1")).toHaveLength(2);
  });
});
