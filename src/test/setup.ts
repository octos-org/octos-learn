import "fake-indexeddb/auto";
import { beforeEach } from "vitest";
import { setLocale } from "../i18n";

// Keep the legacy Chinese teaching fixtures deterministic. Tests for another
// language set it explicitly; visible text assertions use the message catalog.
beforeEach(() => setLocale("zh-CN", false));
if (typeof navigator !== "undefined") {
  Object.defineProperty(navigator, "languages", { configurable: true, value: ["zh-CN"] });
  Object.defineProperty(navigator, "language", { configurable: true, value: "zh-CN" });
}

function createMemoryStorage(): Storage {
  const data = new Map<string, string>();

  return {
    get length() {
      return data.size;
    },
    clear() {
      data.clear();
    },
    getItem(key: string) {
      return data.has(key) ? data.get(key)! : null;
    },
    key(index: number) {
      return Array.from(data.keys())[index] ?? null;
    },
    removeItem(key: string) {
      data.delete(key);
    },
    setItem(key: string, value: string) {
      data.set(key, String(value));
    },
  };
}

const storageLike =
  typeof window !== "undefined" ? window.localStorage : globalThis.localStorage;

if (!storageLike || typeof storageLike.clear !== "function") {
  const storage = createMemoryStorage();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: storage,
  });
  if (typeof window !== "undefined") {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: storage,
    });
  }
}

// jsdom has no canvas and logs "Not implemented" on every getContext call.
// Drawing components treat a missing context as nothing to paint; tests that
// need a context still spy on this method.
if (typeof HTMLCanvasElement !== "undefined") {
  Object.defineProperty(HTMLCanvasElement.prototype, "getContext", { configurable: true, writable: true, value: () => null });
}
