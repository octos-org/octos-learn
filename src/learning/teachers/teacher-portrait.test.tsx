import { tr } from "@/i18n";
import { act, cleanup, render, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { OctosSkinArt } from "@/components/octos-skin-art";

import { TeacherCard } from "./teacher-card";
import { TeacherPortrait } from "./teacher-portrait";
import { announceTeacherApproval, poseForActivity, useTeacherApproval } from "./teacher-portrait-state";

afterEach(() => { cleanup(); vi.useRealTimers(); });

it("maps classroom activity to a pose, with speaking shown as explaining", () => {
  expect(poseForActivity("idle")).toBe("idle");
  expect(poseForActivity("listening")).toBe("listening");
  expect(poseForActivity("thinking")).toBe("thinking");
  expect(poseForActivity("speaking")).toBe("explaining");
  expect(poseForActivity("error")).toBe("idle");
});

it("keeps every pose of only the current teacher mounted and shows one", () => {
  const { container } = render(<TeacherPortrait teacherId="sufei" pose="thinking" />);
  const poses = [...container.querySelectorAll<HTMLImageElement>(".teacher-portrait-pose")];
  expect(poses).toHaveLength(5);
  expect(poses.every((image) => image.src.includes("/teachers/2026-10-30/sufei/"))).toBe(true);
  expect(poses.filter((image) => image.dataset.active !== undefined).map((image) => image.src.split("/").pop())).toEqual(["bust-thinking.webp"]);
});

it("loads a single idle image for a still preview", () => {
  const { container } = render(<TeacherPortrait teacherId="alan" pose="explaining" still />);
  const poses = [...container.querySelectorAll<HTMLImageElement>(".teacher-portrait-pose")];
  expect(poses.map((image) => image.src.split("/").pop())).toEqual(["bust-idle.webp"]);
  expect(container.querySelector(".teacher-portrait")?.getAttribute("data-pose")).toBe("idle");
});

it("shows approval for a moment after a practice goal is met", () => {
  vi.useFakeTimers();
  const { result } = renderHook(() => useTeacherApproval());
  expect(result.current).toBe(false);
  act(() => announceTeacherApproval());
  expect(result.current).toBe(true);
  act(() => { vi.advanceTimersByTime(2500); });
  expect(result.current).toBe(false);
});

it("draws the named teacher's portrait from the shared skin art, approving over the activity", () => {
  const { container } = render(<OctosSkinArt skin="portrait" teacherId="doudou" activity="speaking" approving />);
  expect(container.querySelector(".teacher-portrait")?.getAttribute("data-pose")).toBe("approving");
  expect(container.querySelector<HTMLImageElement>(".teacher-portrait-pose[data-active]")?.src).toContain("/teachers/2026-10-30/doudou/bust-approving.webp");
});

it("frames the bust as a soft glow by default and as a named card on request", () => {
  const { container, rerender } = render(<TeacherPortrait teacherId="alan" pose="idle" />);
  const portrait = () => container.querySelector(".teacher-portrait")!;
  expect(portrait().getAttribute("data-frame")).toBe("glow");
  expect(container.querySelector(".teacher-portrait-glow")).not.toBeNull();
  expect(container.querySelector(".teacher-portrait-scene")).toBeNull();
  rerender(<TeacherPortrait teacherId="alan" pose="idle" frame="card" name="阿澜" />);
  expect(portrait().getAttribute("data-frame")).toBe("card");
  expect(container.querySelector(".teacher-portrait-glow")).toBeNull();
  expect(container.querySelector<HTMLImageElement>(".teacher-portrait-scene")?.src).toContain("/teachers/2026-10-30/alan/arch-bg.webp");
  expect(container.querySelector(".teacher-portrait-plate")?.textContent).toBe(tr("阿澜"));
});

it("builds the teacher card from a background layer and a cut-out figure", () => {
  const { container } = render(<TeacherCard teacherId="sufei" />);
  expect([...container.querySelectorAll<HTMLImageElement>(".teacher-card img")].map((image) => image.src.split("/teachers/")[1])).toEqual(["2026-10-30/sufei/card-bg.webp", "2026-10-30/sufei/card-figure.webp"]);
  expect(container.querySelector<HTMLElement>(".teacher-card")?.style.getPropertyValue("--figure")).toContain("sufei/card-figure.webp");
});
