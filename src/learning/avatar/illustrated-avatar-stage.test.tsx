import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { IllustratedAvatarStage } from "./illustrated-avatar-stage";
import { neutralFrame } from "./face-frame";

const images: Array<{ onload: (() => void) | null; onerror: (() => void) | null; src: string }> = [];
let raf: Map<number, FrameRequestCallback>, serial: number;
const clear = vi.fn();
beforeEach(() => {
  images.length = 0; serial = 0; raf = new Map(); clear.mockReset();
  const noop = () => undefined;
  const ctx = new Proxy({ clearRect: clear, createLinearGradient: () => ({ addColorStop: noop }) }, { get: (obj, key) => obj[key as keyof typeof obj] ?? noop, set: () => true });
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
  vi.stubGlobal("Image", class { onload = null; onerror = null; src = ""; constructor() { images.push(this); } removeAttribute() { this.src = ""; } });
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => { const id = ++serial; raf.set(id, cb); return id; });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => raf.delete(id));
  vi.stubGlobal("devicePixelRatio", 1);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });
const advance = (time: number) => { const items = [...raf.values()]; raf.clear(); act(() => items.forEach((cb) => cb(time))); };

it("draws only after loading and releases pending frames when unmounted", () => {
  const page = render(<IllustratedAvatarStage frame={neutralFrame} active />);
  expect(clear).not.toHaveBeenCalled(); expect(images[0]!.src).toContain("illustrated-v0.1/base.png");
  act(() => images[0]!.onload!()); advance(100); expect(clear).toHaveBeenCalled();
  page.unmount(); expect(raf.size).toBe(0); expect(images[0]!.onload).toBeNull();
});

it("stops scheduling when inactive and redraws a changed paused pose", () => {
  const page = render(<IllustratedAvatarStage frame={neutralFrame} active={false} />);
  act(() => images[0]!.onload!()); advance(100); advance(200); expect(raf.size).toBe(0);
  const previous = clear.mock.calls.length;
  page.rerender(<IllustratedAvatarStage frame={() => ({ ...neutralFrame(), channels: { jawOpen: 1 } })} active={false} />);
  advance(300); expect(clear.mock.calls.length).toBeGreaterThan(previous);
});

it("shows a load timeout and ignores a late image", () => {
  vi.useFakeTimers(); const error = vi.fn();
  render(<IllustratedAvatarStage frame={neutralFrame} active onError={error} />);
  act(() => vi.advanceTimersByTime(15000)); expect(error).toHaveBeenCalledOnce();
  expect(screen.getByRole("status").textContent).toContain("未能载入");
  act(() => images[0]!.onload!()); advance(100); expect(clear).not.toHaveBeenCalled();
});
