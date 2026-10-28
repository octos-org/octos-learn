import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const speech = vi.hoisted(() => ({ synthesize: vi.fn(), played: [] as string[] }));
vi.mock("@/byok/services", async (original) => ({ ...(await original<object>()), prepareClientServices: vi.fn(async () => undefined) }));
vi.mock("@/byok/providers", async (original) => ({ ...(await original<object>()), synthesizeTeacherSample: speech.synthesize }));

import { ServiceError } from "@/byok/providers";
import type { EarnedAchievement } from "../history/history-api";
import { announceNewAwards, holdAwards } from "./award-events";
import { getTeacher } from "../teachers/teachers";
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
  // Without a speech service the ceremony stays silent.
  speech.synthesize.mockRejectedValue(new ServiceError("unconfigured", "语音服务尚未配置"));
  speech.played.length = 0;
});
afterEach(() => {
  cleanup();
  speech.synthesize.mockReset();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("award ceremony", () => {
  it("brings another award earned at the same time to the front and keeps focus in the list", async () => {
    render(<AwardHost />);
    act(() => announceNewAwards([award("first-question"), award("leap-day", { scope: "2028" }), award("alan-1")]));
    expect(await screen.findByRole("dialog", { name: "闰日旅人" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "查看「第一个问题」" }));
    const dialog = screen.getByRole("dialog", { name: "第一个问题" });
    // The former lead joins the list; the teacher's line follows the award in front.
    expect(screen.getByRole("button", { name: "查看「闰日旅人」" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "查看「第一个问题」" })).toBeNull();
    expect(dialog.textContent).toContain("阿澜「第一个问题」");
    expect(document.activeElement?.closest(".award-more")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "关闭" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("waits while a lesson is in progress and plays once it has finished", async () => {
    // A hold set before the host mounts still counts.
    holdAwards("classroom:test", true);
    render(<AwardHost />);
    act(() => announceNewAwards([award("first-question")]));
    await act(async () => {});
    expect(screen.queryByRole("dialog")).toBeNull();
    act(() => holdAwards("classroom:test", false));
    expect(await screen.findByRole("dialog", { name: "第一个问题" })).toBeTruthy();
  });

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
    expect(dialog.textContent).toContain("阿澜二月二十九日，四年才有一次。这节课，值得记住。");
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

  it("the presenting teacher reads the line aloud, again for an award brought to the front", async () => {
    speech.synthesize.mockImplementation(async (text: string) => new Blob([text], { type: "audio/mpeg" }));
    URL.createObjectURL = vi.fn((blob: Blob) => `blob:${(blob as Blob & { size: number }).size}`) as typeof URL.createObjectURL;
    URL.revokeObjectURL = vi.fn();
    vi.stubGlobal("Audio", class { constructor(public src: string) {} pause() {} async play() { speech.played.push(this.src); } });
    render(<AwardHost />);
    // An award without a recorded teacher is presented by the learner's current teacher.
    act(() => announceNewAwards([award("hundred-stars", { teacher_id: "sufei" }), award("first-star", { teacher_id: null })]));
    await screen.findByRole("dialog", { name: "百星观测者" });
    await waitFor(() => expect(speech.synthesize).toHaveBeenCalledWith("一百颗星，每一颗都有来处。记录在案。", getTeacher("sufei").voices));
    await waitFor(() => expect(speech.played).toHaveLength(1));
    fireEvent.click(screen.getByRole("button", { name: "查看「初见星光」" }));
    await waitFor(() => expect(speech.synthesize).toHaveBeenLastCalledWith("「初见星光」。从这里开始，一步一步来。", getTeacher("alan").voices));
    expect(screen.getByRole("dialog", { name: "初见星光" }).textContent).toContain("阿澜");
    await waitFor(() => expect(speech.played).toHaveLength(2));
  });

  it("stays silent when playful lines are off", async () => {
    localStorage.setItem("octos-learn-award-tone", "plain");
    render(<AwardHost />);
    act(() => announceNewAwards([award("first-star")]));
    await screen.findByRole("dialog", { name: "初见星光" });
    await act(async () => {});
    expect(speech.synthesize).not.toHaveBeenCalled();
  });

  it("plays batches in turn and skips ids the app does not know", async () => {
    render(<AwardHost />);
    act(() => { announceNewAwards([award("from-the-future")]); announceNewAwards([award("first-star")]); });
    const dialog = await screen.findByRole("dialog", { name: "初见星光" });
    expect(dialog.textContent).toContain("获得成就 · 铜");
  });
});
