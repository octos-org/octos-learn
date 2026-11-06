import { renderHook } from "@testing-library/react";
import { expect, it, vi } from "vitest";

import { neutralFrame } from "./face-frame";
import { REACTION_MS, reactionWeight, usePresenterReaction, withReaction } from "./presenter-reaction";

it("eases a reaction in and out over its moment", () => {
  expect(reactionWeight(-1)).toBe(0);
  expect(reactionWeight(150)).toBeCloseTo(0.5);
  expect(reactionWeight(1_000)).toBe(1);
  expect(reactionWeight(REACTION_MS - 300)).toBeCloseTo(0.5);
  expect(reactionWeight(REACTION_MS)).toBe(0);
});

it("puts the reaction on the face without closing a speaking mouth", () => {
  const speaking = { ...neutralFrame(0), channels: { jawOpen: 0.7, mouthSmileLeft: 0.1 } };
  const smiling = withReaction(speaking, { expression: "celebrating", at: 0 }, 1_000);
  expect(smiling.channels).toMatchObject({ jawOpen: 0.7, mouthSmileLeft: 0.9, browInnerUp: 0.6 });
  const careful = withReaction(neutralFrame(0), { expression: "careful", at: 0 }, 1_000);
  expect(careful.channels.browDownLeft).toBeGreaterThan(0.5);
  expect(withReaction(speaking, { expression: "careful", at: 0 }, REACTION_MS + 1)).toBe(speaking);
  expect(withReaction(speaking, null, 0)).toBe(speaking);
});

it("starts a reaction when the lesson plays a teacher.expression operation, once", () => {
  vi.spyOn(performance, "now").mockReturnValue(5_000);
  const { result, rerender } = renderHook(({ operation }) => usePresenterReaction(operation), {
    initialProps: { operation: { operation_id: "op-1", action: { op: "board.create" } } as { operation_id: string; action?: { op: string; expression?: string } } },
  });
  expect(result.current.current).toBeNull();
  rerender({ operation: { operation_id: "op-2", action: { op: "teacher.expression", expression: "encouraging" } } });
  expect(result.current.current).toEqual({ expression: "encouraging", at: 5_000 });
  vi.restoreAllMocks();
});
