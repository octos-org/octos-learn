import { expect, it, vi } from "vitest";
import { createOriginalFoxPainter, ORIGINAL_FOX_ASSETS, ORIGINAL_FOX_SIZE } from "./original-fox";
import { neutralFrame } from "./face-frame";

function context() {
  const calls = { drawImage: vi.fn(), transform: vi.fn(), lineTo: vi.fn(), scale: vi.fn() };
  const ctx = new Proxy({ ...calls, createRadialGradient: () => ({ addColorStop: vi.fn() }) }, { get: (o, key) => o[key as keyof typeof o] ?? vi.fn(), set: () => true });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}
function setup() {
  const buffers: ReturnType<typeof context>[] = [];
  const base = { id: "exact-original" } as unknown as CanvasImageSource;
  const painter = createOriginalFoxPainter(base, {} as CanvasImageSource, {} as CanvasImageSource, () => {
    const item = context(); buffers.push(item); return { canvas: {} as CanvasImageSource, context: item.ctx };
  });
  const target = context(); return { ...target, painter, base, buffers };
}

it("renders the unmodified source image directly at neutral, with no replacement features", () => {
  const { painter, ctx, calls, base } = setup();
  painter.draw(ctx, 550, 550, neutralFrame());
  expect(ORIGINAL_FOX_ASSETS.base).toBe("teach-avatars/star-fox/concept-thinking.png");
  expect(calls.drawImage).toHaveBeenCalledOnce();
  expect(calls.drawImage).toHaveBeenCalledWith(base, 0, 0, ORIGINAL_FOX_SIZE, ORIGINAL_FOX_SIZE);
  expect(calls.lineTo).not.toHaveBeenCalled(); expect(calls.transform).not.toHaveBeenCalled();
});

it("composites source-art eye and mouth patches only when their input changes", () => {
  const { painter, ctx, base, calls, buffers } = setup();
  const writes = buffers[0]!.calls.drawImage.mock.calls.length;
  painter.draw(ctx, 550, 550, { ...neutralFrame(), channels: { eyeBlinkLeft: 1, jawOpen: .8 } });
  expect(buffers[0]!.calls.drawImage.mock.calls.length).toBeGreaterThan(writes);
  expect(calls.drawImage.mock.calls[0]![0]).not.toBe(base);
  painter.draw(ctx, 550, 550, neutralFrame());
  expect(calls.drawImage.mock.calls.at(-1)![0]).toBe(base);
});

it("bounds the head deformation and keeps affine transforms finite at input extremes", () => {
  const { painter, ctx, calls } = setup();
  painter.draw(ctx, 300, 500, { ...neutralFrame(), rotation: [1.25, -1.25, 1.25], channels: { mouthSmileLeft: 1, eyeBlinkRight: .5 } });
  expect(calls.transform).toHaveBeenCalledTimes(14 * 14 * 2);
  expect(calls.transform.mock.calls.every((args) => args.every(Number.isFinite))).toBe(true);
});
