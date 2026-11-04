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
