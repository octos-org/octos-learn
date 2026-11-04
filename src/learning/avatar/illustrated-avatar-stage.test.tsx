import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { IllustratedAvatarStage } from "./illustrated-avatar-stage";
import { neutralFrame } from "./face-frame";
const painterMock = vi.hoisted(() => ({ fail: false }));

// This suite covers image loading and render-loop ownership. Actual painted
// pixels are verified by the native Canvas export/validation script.
vi.mock("./painted-fox", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./painted-fox")>();
  return { ...actual, createPaintedFoxPainter: () => ({ draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => { if (painterMock.fail) throw new Error("paint_failed"); ctx.clearRect(0, 0, w, h); } }) };
});

const images: Array<{ onload: (() => void) | null; onerror: (() => void) | null; src: string }> = [];
let raf: Map<number, FrameRequestCallback>, serial: number;
const clear = vi.fn();
beforeEach(() => {
  images.length = 0; serial = 0; raf = new Map(); clear.mockReset(); painterMock.fail = false;
  const noop = () => undefined;
  const ctx = new Proxy({ clearRect: clear, createLinearGradient: () => ({ addColorStop: noop }), createRadialGradient: () => ({ addColorStop: noop }) }, { get: (obj, key) => obj[key as keyof typeof obj] ?? noop, set: () => true });
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
  expect(clear).not.toHaveBeenCalled(); expect(images).toHaveLength(5); expect(images[0]!.src).toContain("painted-v0.2/source.png");
  expect(images.some(image=>image.src.includes('painted-v0.3/portrait-extended.png'))).toBe(true);
  act(() => images.forEach((image) => image.onload!())); advance(100); expect(clear).toHaveBeenCalled();
  page.unmount(); expect(raf.size).toBe(0); expect(images[0]!.onload).toBeNull();
});

it("stops scheduling when inactive and redraws a changed paused pose", () => {
  const page = render(<IllustratedAvatarStage frame={neutralFrame} active={false} />);
  act(() => images.forEach((image) => image.onload!())); advance(100); advance(200); expect(raf.size).toBe(0);
  const previous = clear.mock.calls.length;
  page.rerender(<IllustratedAvatarStage frame={() => ({ ...neutralFrame(), channels: { jawOpen: 1 } })} active={false} />);
  advance(300); expect(clear.mock.calls.length).toBeGreaterThan(previous);
});

it('continues natural ear and hair motion without active capture and stops it when disabled',()=>{
  const page=render(<IllustratedAvatarStage frame={neutralFrame} active={false} idleMotion />);
  act(()=>images.forEach(image=>image.onload!()));advance(100);advance(200);advance(300);
  expect(raf.size).toBe(1);const calls=clear.mock.calls.length;advance(400);expect(clear.mock.calls.length).toBeGreaterThan(calls);
  page.rerender(<IllustratedAvatarStage frame={neutralFrame} active={false} idleMotion={false} />);
  advance(500);advance(600);expect(raf.size).toBe(0);
});

it('releases the old painter and ignores its late loading callbacks when switching characters',()=>{
  const page=render(<IllustratedAvatarStage frame={neutralFrame} active />);
  const oldImages=[...images],lateLoad=images[0].onload!;
  act(()=>oldImages.forEach(image=>image.onload!()));advance(100);
  clear.mockClear();page.rerender(<IllustratedAvatarStage characterId='moon-cat' frame={neutralFrame} active />);
  expect(oldImages.every(image=>image.onload===null)).toBe(true);
  expect(images.slice(5).every(image=>image.src.includes('moon-cat')||image.src.includes('mouth.png'))).toBe(true);
  act(()=>lateLoad());advance(200);expect(clear).not.toHaveBeenCalled();
  act(()=>images.slice(5).forEach(image=>image.onload!()));advance(300);expect(clear).toHaveBeenCalled();
});

it("shows a load timeout and ignores a late image", () => {
  vi.useFakeTimers(); const error = vi.fn();
  render(<IllustratedAvatarStage frame={neutralFrame} active onError={error} />);
  act(() => vi.advanceTimersByTime(15000)); expect(error).toHaveBeenCalledOnce();
  expect(screen.getByRole("status").textContent).toContain("未能载入");
  act(() => images.forEach((image) => image.onload!())); advance(100); expect(clear).not.toHaveBeenCalled();
});

it("reports a drawing failure once and stops scheduling instead of leaving a stale ready stage", () => {
  const error=vi.fn();render(<IllustratedAvatarStage frame={neutralFrame} active onError={error} />);
  act(()=>images.forEach(image=>image.onload!()));painterMock.fail=true;advance(100);
  expect(error).toHaveBeenCalledOnce();expect(screen.getByRole("status").textContent).toContain("未能载入");expect(raf.size).toBe(0);
  advance(200);expect(error).toHaveBeenCalledOnce();
});
