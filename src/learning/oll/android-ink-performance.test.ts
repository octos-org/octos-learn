import { afterEach, describe, expect, it, vi } from "vitest";
import {
  androidInkPixelRatio,
  androidInteractiveInkPixelRatio,
  configureAndroidInkDynamicDensity,
} from "./android-ink-performance";

describe("Android dynamic ink pixel budget", () => {
  afterEach(() => {
    vi.useRealTimers();
    delete (window as Window & { OctosNativeInk?: unknown }).OctosNativeInk;
  });

  it("renders a 4K CSS viewport at native density while stationary", () => {
    expect(androidInkPixelRatio({
      cssWidth: 3840,
      cssHeight: 2160,
      devicePixelRatio: 1,
    })).toBe(1);
  });

  it("renders a 1080p CSS viewport reported at DPR 2 as physical 4K", () => {
    expect(androidInkPixelRatio({
      cssWidth: 1920,
      cssHeight: 1080,
      devicePixelRatio: 2,
    })).toBe(2);
  });

  it("caps an 8K physical request to the 4K idle budget", () => {
    expect(androidInkPixelRatio({
      cssWidth: 3840,
      cssHeight: 2160,
      devicePixelRatio: 2,
    })).toBe(1);
  });

  it("uses a 1080p backing store only while a 4K camera is moving", async () => {
    vi.useFakeTimers();
    const setDevicePixelRatio = vi.fn(() => undefined);
    const runtime = { editor: { display: { setDevicePixelRatio } } };
    const viewport = document.createElement("div");
    Object.defineProperties(viewport, {
      clientWidth: { value: 1920 },
      clientHeight: { value: 1080 },
    });
    let cameraListener:
      | ((camera: { panX: number; panY: number; scale: number }) => void)
      | undefined;
    const unsubscribe = vi.fn();
    const cameraSource = {
      subscribeCamera: vi.fn((listener: NonNullable<typeof cameraListener>) => {
        cameraListener = listener;
        listener({ panX: 0, panY: 0, scale: 1 });
        return unsubscribe;
      }),
    };

    const destroy = configureAndroidInkDynamicDensity(
      runtime,
      viewport,
      cameraSource,
      2,
    );
    await Promise.resolve();
    await Promise.resolve();
    expect(setDevicePixelRatio).toHaveBeenLastCalledWith(2);

    cameraListener?.({ panX: 40, panY: 0, scale: 1 });
    await Promise.resolve();
    await Promise.resolve();
    expect(setDevicePixelRatio).toHaveBeenLastCalledWith(1);

    await vi.advanceTimersByTimeAsync(180);
    expect(setDevicePixelRatio).toHaveBeenLastCalledWith(2);

    destroy();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it("caps interaction density independently from idle density", () => {
    expect(androidInteractiveInkPixelRatio({
      cssWidth: 3840,
      cssHeight: 2160,
      devicePixelRatio: 1,
    })).toBeCloseTo(0.5);
  });

  it("preserves native density when the backing store is under both budgets", () => {
    const input = {
      cssWidth: 1280,
      cssHeight: 720,
      devicePixelRatio: 1,
    };
    expect(androidInkPixelRatio(input)).toBe(1);
    expect(androidInteractiveInkPixelRatio(input)).toBe(1);
  });

  it("incrementally adds and removes committed APK ink components", async () => {
    (window as Window & { OctosNativeInk?: unknown }).OctosNativeInk = {};
    const setDevicePixelRatio = vi.fn(() => undefined);
    const makeRoot = () => document.createElementNS("http://www.w3.org/2000/svg", "svg");
    const makeComponent = (id: string, zIndex: number) => {
      const element = document.createElementNS("http://www.w3.org/2000/svg", "g");
      element.dataset.octosVectorComponentId = id;
      element.dataset.octosVectorZ = String(zIndex);
      return { id, z_index: zIndex, element };
    };
    const first = makeComponent("first", 1);
    const second = makeComponent("second", 2);
    const getVectorInkUpdate = vi.fn()
      .mockReturnValueOnce({
        kind: "full",
        revision: 1,
        upsert: [first],
        remove_ids: [],
        root: makeRoot(),
      })
      .mockReturnValueOnce({
        kind: "delta",
        revision: 2,
        upsert: [second],
        remove_ids: [],
      })
      .mockReturnValueOnce({
        kind: "delta",
        revision: 3,
        upsert: [],
        remove_ids: ["first"],
      });
    let inkListener: ((state: { content_revision?: number }) => void) | undefined;
    const host = document.createElement("div");
    const runtime = {
      host,
      editor: { display: { setDevicePixelRatio } },
      getVectorInkUpdate,
      subscribe: vi.fn((listener: NonNullable<typeof inkListener>) => {
        inkListener = listener;
        listener({ content_revision: 1 });
        return vi.fn();
      }),
    };
    const viewport = document.createElement("div");
    Object.defineProperties(viewport, {
      clientWidth: { value: 1920 },
      clientHeight: { value: 1080 },
    });
    const destroy = configureAndroidInkDynamicDensity(
      runtime,
      viewport,
      { subscribeCamera: () => vi.fn() },
      2,
    );

    expect(host.querySelectorAll("[data-octos-vector-component-id]")).toHaveLength(1);
    inkListener?.({ content_revision: 2 });
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    expect(host.querySelectorAll("[data-octos-vector-component-id]")).toHaveLength(2);
    expect(host.contains(first.element)).toBe(true);

    inkListener?.({ content_revision: 3 });
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    expect(host.querySelectorAll("[data-octos-vector-component-id]")).toHaveLength(1);
    expect(host.contains(first.element)).toBe(false);
    expect(host.contains(second.element)).toBe(true);

    destroy();
  });

  it("falls back to persistent full SVG exports for an older ink runtime", async () => {
    (window as Window & { OctosNativeInk?: unknown }).OctosNativeInk = {};
    const setDevicePixelRatio = vi.fn(() => undefined);
    const toSVG = vi.fn(() => {
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.append(document.createElementNS("http://www.w3.org/2000/svg", "path"));
      return svg;
    });
    let inkListener: ((state: { content_revision?: number }) => void) | undefined;
    const unsubscribeInk = vi.fn();
    const host = document.createElement("div");
    const runtime = {
      host,
      editor: { display: { setDevicePixelRatio }, toSVG },
      subscribe: vi.fn((listener: NonNullable<typeof inkListener>) => {
        inkListener = listener;
        listener({ content_revision: 7 });
        return unsubscribeInk;
      }),
    };
    const viewport = document.createElement("div");
    Object.defineProperties(viewport, {
      clientWidth: { value: 1920 },
      clientHeight: { value: 1080 },
    });
    const unsubscribeCamera = vi.fn();
    const cameraSource = {
      subscribeCamera: vi.fn((listener: (camera: {
        panX: number;
        panY: number;
        scale: number;
      }) => void) => {
        listener({ panX: 100, panY: 40, scale: 2 });
        return unsubscribeCamera;
      }),
    };

    const destroy = configureAndroidInkDynamicDensity(
      runtime,
      viewport,
      cameraSource,
      2,
    );
    await Promise.resolve();
    await Promise.resolve();

    expect(setDevicePixelRatio).toHaveBeenLastCalledWith(1);
    expect(host.dataset.androidVectorInk).toBe("");
    expect(host.querySelector(".oll-android-vector-ink")?.getAttribute("viewBox"))
      .toBe("-50 -20 960 540");
    inkListener?.({ content_revision: 7 });
    expect(toSVG).toHaveBeenCalledTimes(1);

    inkListener?.({ content_revision: 8 });
    inkListener?.({ content_revision: 9 });
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    expect(toSVG).toHaveBeenCalledTimes(2);
    expect(host.querySelectorAll(".oll-android-vector-ink")).toHaveLength(1);

    destroy();
    expect(unsubscribeInk).toHaveBeenCalledOnce();
    expect(unsubscribeCamera).toHaveBeenCalledOnce();
    expect(host.querySelector(".oll-android-vector-ink")).toBeNull();
    expect(host.dataset.androidVectorInk).toBeUndefined();
  });
});
