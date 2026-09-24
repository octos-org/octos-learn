import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "octos_debug_settings";
const CHANGE_EVENT = "octos-debug-settings-change";

export interface DebugSettings {
  /**
   * Master Debug Mode switch:
   * When false, all developer tools, debug overlays, and test panels are completely hidden.
   * When true, enabled debug features (like Jev floating status) become visible.
   */
  debugMode: boolean;

  /**
   * TypeSafe Jev System One admission fast gate debugger floating window:
   * When true and debugMode is true, displays the status card in the bottom-right of the whiteboard.
   */
  showJevAdmissionDebugger: boolean;

  /**
   * Whiteboard Learning Trace Inspector:
   * When true and debugMode is true, displays the learn-trace inspection drawer.
   */
  showLearningTraceInspector: boolean;

  /**
   * Extensible dictionary for future debug features:
   * (e.g. acsInspector, verboseLogging, mockSlowNetwork, fpsCounter, etc.)
   */
  [key: string]: boolean | undefined;
}

export const DEFAULT_DEBUG_SETTINGS: DebugSettings = {
  debugMode: typeof window !== "undefined" && import.meta.env?.MODE === "test",
  showJevAdmissionDebugger: true,
  showLearningTraceInspector: true,
};

export function loadDebugSettings(): DebugSettings {
  if (typeof window === "undefined") {
    return { ...DEFAULT_DEBUG_SETTINGS };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        ...DEFAULT_DEBUG_SETTINGS,
        ...parsed,
      };
    }
  } catch {
    // ignore parse errors and fallback to defaults
  }
  return { ...DEFAULT_DEBUG_SETTINGS };
}

export function saveDebugSettings(settings: DebugSettings): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: settings }));
  } catch {
    // ignore storage quota or write errors
  }
}

export function useDebugSettings() {
  const [settings, setSettings] = useState<DebugSettings>(loadDebugSettings);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) {
        setSettings(loadDebugSettings());
      }
    };
    const handleCustomChange = (event: Event) => {
      if (event instanceof CustomEvent && event.detail) {
        setSettings(event.detail as DebugSettings);
      } else {
        setSettings(loadDebugSettings());
      }
    };

    window.addEventListener("storage", handleStorage);
    window.addEventListener(CHANGE_EVENT, handleCustomChange);
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(CHANGE_EVENT, handleCustomChange);
    };
  }, []);

  const updateDebugSettings = useCallback((patch: Partial<DebugSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      saveDebugSettings(next);
      return next;
    });
  }, []);

  const resetDebugSettings = useCallback(() => {
    const next: DebugSettings = {
      ...DEFAULT_DEBUG_SETTINGS,
      debugMode: false,
    };
    setSettings(next);
    saveDebugSettings(next);
  }, []);

  const isJevDebuggerVisible = Boolean(
    settings.debugMode && settings.showJevAdmissionDebugger,
  );
  const isTraceInspectorVisible = Boolean(
    settings.debugMode && settings.showLearningTraceInspector,
  );

  return {
    settings,
    updateDebugSettings,
    resetDebugSettings,
    isJevDebuggerVisible,
    isTraceInspectorVisible,
  };
}
