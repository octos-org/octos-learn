import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { IllustratedAvatarStage } from "./illustrated-avatar-stage";
import { neutralFrame } from "./face-frame";
const painterMock = vi.hoisted(() => ({ fail: false, settling: false }));

// This suite covers image loading and render-loop ownership. Actual painted
// pixels are verified by the native Canvas export/validation script.
vi.mock("./painted-fox", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./painted-fox")>();
  return { ...actual, createPaintedFoxPainter: () => ({ draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => { if (painterMock.fail) throw new Error("paint_failed"); ctx.clearRect(0, 0, w, h); return { settling: painterMock.settling }; } }) };
});

const images: Array<{ onload: (() => void) | null; onerror: (() => void) | null; src: string }> = [];
let raf: Map<number, FrameRequestCallback>, serial: number;
const clear = vi.fn();
beforeEach(() => {
  images.length = 0; serial = 0; raf = new Map(); clear.mockReset(); painterMock.fail = false; painterMock.settling = false;
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

it('loads local layers only for the explicitly enabled fox and releases them on rollback',()=>{
  const page=render(<IllustratedAvatarStage frame={neutralFrame} active localRig />);
  expect(images).toHaveLength(16);
  expect(images.filter(i=>i.src.includes('local-rig-v0.3'))).toHaveLength(11);
  const local=[...images];act(()=>local.forEach(i=>i.onload!()));advance(100);
  page.rerender(<IllustratedAvatarStage frame={neutralFrame} active localRig={false} />);
  expect(local.every(i=>i.onload===null&&i.src==='')).toBe(true);
  expect(images.slice(16)).toHaveLength(5);
  page.rerender(<IllustratedAvatarStage frame={neutralFrame} active characterId="white-rabbit" localRig />);
  expect(images.slice(21)).toHaveLength(5);
  expect(images.slice(21).some(i=>i.src.includes('local-rig-v0.3'))).toBe(false);
});

it('loads the drawn-ear atlas only in the enabled fox trial and releases it on comparison',()=>{
  const page=render(<IllustratedAvatarStage frame={neutralFrame} active={false} localRig earTurn earDemo />);
  expect(images).toHaveLength(18);expect(images.some(i=>i.src.includes('ear-turn-v0.2/poses.png'))).toBe(true);expect(images.some(i=>i.src.includes('ear-turn-v0.2/foreground.png'))).toBe(true);
  const original=[...images];act(()=>original.forEach(i=>i.onload!()));advance(100);advance(300);
  expect(raf.size).toBe(1);
  page.rerender(<IllustratedAvatarStage frame={neutralFrame} active={false} localRig earTurn={false} earDemo={false} />);
  expect(original.every(i=>i.onload===null&&i.src==='')).toBe(true);
  expect(images.slice(18)).toHaveLength(16);expect(images.slice(18).some(i=>i.src.includes('ear-turn-v0.2'))).toBe(false);
  act(()=>images.slice(18).forEach(i=>i.onload!()));advance(400);advance(600);expect(raf.size).toBe(0);
  page.rerender(<IllustratedAvatarStage characterId="moon-cat" frame={neutralFrame} active={false} localRig earTurn />);
  expect(images.slice(34)).toHaveLength(5);expect(images.slice(34).some(i=>i.src.includes('ear-turn-v0.2'))).toBe(false);
});

it("stops scheduling when inactive and redraws a changed paused pose", () => {
  const page = render(<IllustratedAvatarStage frame={neutralFrame} active={false} />);
  act(() => images.forEach((image) => image.onload!())); advance(100); advance(200); expect(raf.size).toBe(0);
  const previous = clear.mock.calls.length;
  page.rerender(<IllustratedAvatarStage frame={() => ({ ...neutralFrame(), channels: { jawOpen: 1 } })} active={false} />);
  advance(300); expect(clear.mock.calls.length).toBeGreaterThan(previous);
});

it("keeps drawing while ears and hair catch up after the head stops, then rests", () => {
  render(<IllustratedAvatarStage frame={neutralFrame} active={false} />);
  painterMock.settling = true;
  act(() => images.forEach((image) => image.onload!())); advance(100); advance(200); advance(300);
  expect(raf.size).toBe(1);
  painterMock.settling = false; advance(400); advance(500); expect(raf.size).toBe(0);
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

it('rejects a failed hair-only foreground rather than drawing the ear with the stale white root patch',()=>{
  const error=vi.fn();render(<IllustratedAvatarStage frame={neutralFrame} active localRig earTurn onError={error} />);
  const hair=images.find(i=>i.src.includes('ear-turn-v0.2/foreground.png'))!;
  act(()=>{for(const image of images)if(image!==hair)image.onload!();hair.onerror!();});
  advance(100);expect(error).toHaveBeenCalledOnce();expect(clear).not.toHaveBeenCalled();
  expect(screen.getByRole('status').textContent).toContain('未能载入');
});
