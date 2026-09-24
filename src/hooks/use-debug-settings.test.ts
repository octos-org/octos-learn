import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  DEFAULT_DEBUG_SETTINGS,
  loadDebugSettings,
  saveDebugSettings,
  useDebugSettings,
} from "./use-debug-settings";

describe("useDebugSettings", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it("loads default settings when storage is empty", () => {
    const settings = loadDebugSettings();
    expect(settings.showJevAdmissionDebugger).toBe(true);
    expect(settings.showLearningTraceInspector).toBe(true);
  });

  it("updates debug mode and persists to localStorage", () => {
    const { result } = renderHook(() => useDebugSettings());

    act(() => {
      result.current.updateDebugSettings({ debugMode: true });
    });

    expect(result.current.settings.debugMode).toBe(true);
    expect(result.current.isJevDebuggerVisible).toBe(true);

    const stored = JSON.parse(localStorage.getItem("octos_debug_settings") || "{}");
    expect(stored.debugMode).toBe(true);
  });

  it("hides Jev debugger when debugMode is false or sub-switch is false", () => {
    const { result } = renderHook(() => useDebugSettings());

    act(() => {
      result.current.updateDebugSettings({ debugMode: false, showJevAdmissionDebugger: true });
    });
    expect(result.current.isJevDebuggerVisible).toBe(false);

    act(() => {
      result.current.updateDebugSettings({ debugMode: true, showJevAdmissionDebugger: false });
    });
    expect(result.current.isJevDebuggerVisible).toBe(false);

    act(() => {
      result.current.updateDebugSettings({ debugMode: true, showJevAdmissionDebugger: true });
    });
    expect(result.current.isJevDebuggerVisible).toBe(true);
  });

  it("responds to CustomEvent dispatched by saveDebugSettings", () => {
    const { result } = renderHook(() => useDebugSettings());

    act(() => {
      saveDebugSettings({
        debugMode: true,
        showJevAdmissionDebugger: false,
        showLearningTraceInspector: true,
      });
    });

    expect(result.current.settings.debugMode).toBe(true);
    expect(result.current.settings.showJevAdmissionDebugger).toBe(false);
    expect(result.current.isJevDebuggerVisible).toBe(false);
  });

  it("resets to defaults cleanly", () => {
    const { result } = renderHook(() => useDebugSettings());

    act(() => {
      result.current.updateDebugSettings({
        debugMode: true,
        showJevAdmissionDebugger: false,
      });
    });
    expect(result.current.settings.debugMode).toBe(true);

    act(() => {
      result.current.resetDebugSettings();
    });

    expect(result.current.settings.debugMode).toBe(false);
    expect(result.current.settings.showJevAdmissionDebugger).toBe(true);
    expect(result.current.isJevDebuggerVisible).toBe(false);
  });
});
