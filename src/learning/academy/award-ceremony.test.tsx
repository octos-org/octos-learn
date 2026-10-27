import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { EarnedAchievement } from "../history/history-api";
import { announceNewAwards } from "./award-events";
import { AwardHost } from "./award-host";

let seq = 0;
function award(achievement_id: string, extra: Partial<EarnedAchievement> = {}): EarnedAchievement {
  seq += 1;
  return {
    achievement_id, scope: "", topic_name: null, teacher_id: "alan", earned_at: "2026-10-25T12:00:00Z",
    awarded_at: "2026-10-25T12:00:00Z", evidence_event_id: `event-${seq}`, new: true, ...extra,
  };
}

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("award ceremony", () => {
  it("plays the rarest new award, lists the others and closes on ✕", async () => {
    render(<AwardHost />);
    act(() => announceNewAwards([award("first-question"), award("leap-day", { scope: "2028" }), award("alan-1"), award("ten-stars", { new: false })]));
    const dialog = await screen.findByRole("dialog", { name: "闰日旅人" });
    expect(dialog.dataset.rarity).toBe("x");
    expect(dialog.textContent).toContain("限时成就 · 2028 · 星耀");
    expect(dialog.textContent).toContain("解锁称号 · 闰日旅人");
    expect(dialog.textContent).toContain("同时获得");
    expect(dialog.textContent).toContain("第一个问题");
    expect(dialog.textContent).toContain("初次夜课");
    expect(dialog.textContent).not.toContain("十星成列");
    expect(dialog.textContent).toContain("阿澜「闰日旅人」。这一枚，我放进收藏匣了。");
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "关闭" }));
    fireEvent.click(screen.getByRole("button", { name: "关闭" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("celebrates an award once, names a hidden one as a discovery and stays until closed", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<AwardHost />);
    const owl = award("night-owl");
    act(() => { announceNewAwards([owl]); announceNewAwards([owl]); });
    const dialog = await screen.findByRole("dialog", { name: "星夜学者" });
    expect(dialog.textContent).toContain("发现隐藏成就 · 银");
    act(() => { vi.advanceTimersByTime(60_000); });
    expect(screen.getByRole("dialog", { name: "星夜学者" })).toBe(dialog);
    fireEvent.click(screen.getByRole("button", { name: "关闭" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("uses plain wording without a teacher when playful lines are off, and Escape closes", async () => {
    localStorage.setItem("octos-learn-award-tone", "plain");
    render(<AwardHost />);
    act(() => announceNewAwards([award("hundred-stars")]));
    const dialog = await screen.findByRole("dialog", { name: "百星观测者" });
    expect(dialog.textContent).toContain("获得成就「百星观测者」。");
    expect(dialog.querySelector(".award-arch")).toBeNull();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("plays batches in turn and skips ids the app does not know", async () => {
    render(<AwardHost />);
    act(() => { announceNewAwards([award("from-the-future")]); announceNewAwards([award("first-star")]); });
    const dialog = await screen.findByRole("dialog", { name: "初见星光" });
    expect(dialog.textContent).toContain("获得成就 · 铜");
  });
});
