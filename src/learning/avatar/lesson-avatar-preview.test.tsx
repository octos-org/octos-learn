import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { FaceFrame } from "./face-frame";
import { envelopeLipSync } from "./lip-sync";
const view = vi.hoisted(() => ({ frame: null as (() => FaceFrame) | null, active: false }));
const view2 = vi.hoisted(() => ({ characterId: "" }));
vi.mock("./illustrated-avatar-stage", () => ({ IllustratedAvatarStage: ({ frame, active, characterId }: { frame: () => FaceFrame; active: boolean; characterId: string }) => { view.frame = frame; view.active = active; view2.characterId = characterId; return <div />; } }));
import LessonAvatarPreview from "./lesson-avatar-preview";
afterEach(cleanup);

it("uses the actual media position and returns neutral on pause or a missing source clock", () => {
  const track = envelopeLipSync([new Float32Array(16000).fill(.2)], 16000, "a".repeat(64));
  let time = 500;
  const clock = { read: () => ({ positionMs: time, durationMs: 1000 }) };
  const page = render(<LessonAvatarPreview characterId="moon-cat" track={track} clock={clock} playing preparing={false} />);
  expect(view.frame!().channels.jawOpen).toBeGreaterThan(.5); expect(view.active).toBe(true);
  time = 1000; expect(view.frame!().channels).toEqual({});
  page.rerender(<LessonAvatarPreview characterId="moon-cat" track={track} clock={clock} playing={false} preparing={false} />);
  expect(view.frame!().channels).toEqual({}); expect(view.active).toBe(false);
  page.rerender(<LessonAvatarPreview characterId="moon-cat" track={track} clock={null} playing preparing={false} />);
  expect(view.frame!().channels).toEqual({});
  expect(screen.getByRole("status").textContent).toContain("当前播放方式暂不支持头像同步");
  // The lesson's own presenter is drawn, not a fixed sample character.
  expect(view2.characterId).toBe("moon-cat");
  expect(screen.getByText("月猫")).toBeTruthy();
});

it("adds the learner's re-timed expression and head to the final-audio mouth", async () => {
  const { retimePerformance } = await import("./lesson-performance");
  const track = envelopeLipSync([new Float32Array(16000).fill(.2)], 16000, "a".repeat(64));
  const performance = retimePerformance({ schema: "octos.avatar-performance.v1", durationMs: 1000, frames: [
    { timeMs: 0, source: "mediapipe", tracked: true, channels: { eyeBlinkLeft: 1, jawOpen: 0 }, rotation: [0, .3, 0] },
    { timeMs: 1000, source: "mediapipe", tracked: true, channels: { eyeBlinkLeft: 1, jawOpen: 0 }, rotation: [0, .3, 0] }] }, [0, 1000], { sha256: "a".repeat(64), durationMs: 1000 });
  const clock = { read: () => ({ positionMs: 500, durationMs: 1000 }) };
  const page = render(<LessonAvatarPreview characterId="star-fox" track={track} performance={performance} clock={clock} playing preparing={false} />);
  const frame = view.frame!();
  expect(frame.channels.jawOpen).toBeGreaterThan(.5); expect(frame.channels.eyeBlinkLeft).toBeCloseTo(1, 3); expect(frame.rotation[1]).toBeCloseTo(.3, 3);
  page.rerender(<LessonAvatarPreview characterId="star-fox" track={track} performance={performance} clock={clock} playing={false} preparing={false} />);
  expect(view.frame!()).toMatchObject({ channels: {}, rotation: [0, 0, 0] });
});
