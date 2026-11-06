import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AIR_WRITING_STORAGE_KEY, useExperimentalFeatures } from "./use-experimental-features";

beforeEach(() => { localStorage.clear(); vi.stubEnv("VITE_ENABLE_HANDWRITING", "false"); });
afterEach(() => { cleanup(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

it("keeps mounted consumers in sync and persists the choice across remounts", () => {
  const settings = renderHook(useExperimentalFeatures);
  const board = renderHook(useExperimentalFeatures);
  expect(board.result.current.airWritingEnabled).toBe(false);
  act(() => { expect(settings.result.current.setAirWritingEnabled(true)).toBe(true); });
  expect(board.result.current.airWritingEnabled).toBe(true);
  board.unmount();
  const reopened = renderHook(useExperimentalFeatures);
  expect(reopened.result.current.airWritingEnabled).toBe(true);
});

it("allows a saved off choice to override the launch default", () => {
  vi.stubEnv("VITE_ENABLE_HANDWRITING", "true");
  const hook = renderHook(useExperimentalFeatures);
  expect(hook.result.current.airWritingEnabled).toBe(true);
  act(() => { hook.result.current.setAirWritingEnabled(false); });
  expect(hook.result.current.airWritingEnabled).toBe(false);
  hook.unmount();
  expect(renderHook(useExperimentalFeatures).result.current.airWritingEnabled).toBe(false);
});

it("updates when another tab changes or clears browser settings", () => {
  const hook = renderHook(useExperimentalFeatures);
  act(() => {
    localStorage.setItem(AIR_WRITING_STORAGE_KEY, "true");
    window.dispatchEvent(new StorageEvent("storage", { key: AIR_WRITING_STORAGE_KEY }));
  });
  expect(hook.result.current.airWritingEnabled).toBe(true);
  act(() => {
    localStorage.clear();
    window.dispatchEvent(new StorageEvent("storage", { key: null }));
  });
  expect(hook.result.current.airWritingEnabled).toBe(false);
});

it("reports failed persistence without claiming the feature changed", () => {
  const hook = renderHook(useExperimentalFeatures);
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
  act(() => { expect(hook.result.current.setAirWritingEnabled(true)).toBe(false); });
  expect(hook.result.current.airWritingEnabled).toBe(false);
});
