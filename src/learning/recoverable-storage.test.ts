import { beforeEach, describe, expect, it } from "vitest";
import {
  discardRecoverableValue,
  isRecoverableStorageLocked,
  loadRecoverableJson,
  recoverableStorageLockKey,
  writeRecoverableJson,
} from "./recoverable-storage";

describe("recoverable learning storage", () => {
  beforeEach(() => localStorage.clear());

  it("preserves malformed JSON and blocks automatic overwrite", () => {
    const key = "learn:test:corrupt";
    localStorage.setItem(key, "{not-json");

    const loaded = loadRecoverableJson({
      storage: localStorage,
      key,
      fallback: () => [] as string[],
      decode: (value) => {
        if (!Array.isArray(value)) throw new Error("expected array");
        return value as string[];
      },
    });

    expect(loaded).toEqual([]);
    expect(localStorage.getItem(key)).toBe("{not-json");
    expect(isRecoverableStorageLocked(localStorage, key)).toBe(true);
    expect(localStorage.getItem(recoverableStorageLockKey(key))).toContain(
      "invalid-json",
    );
    expect(writeRecoverableJson(localStorage, key, ["replacement"])).toBe(false);
    expect(localStorage.getItem(key)).toBe("{not-json");
  });

  it("unlocks a source that has been repaired with a valid value", () => {
    const key = "learn:test:repair";
    localStorage.setItem(key, "wrong");
    loadRecoverableJson({
      storage: localStorage,
      key,
      fallback: () => [] as string[],
      decode: (value) => value as string[],
    });
    expect(isRecoverableStorageLocked(localStorage, key)).toBe(true);

    localStorage.setItem(key, JSON.stringify(["repaired"]));
    expect(loadRecoverableJson({
      storage: localStorage,
      key,
      fallback: () => [] as string[],
      decode: (value) => {
        if (!Array.isArray(value)) throw new Error("expected array");
        return value as string[];
      },
    })).toEqual(["repaired"]);
    expect(isRecoverableStorageLocked(localStorage, key)).toBe(false);
  });

  it("requires an explicit discard before replacing an unrepaired value", () => {
    const key = "learn:test:discard";
    localStorage.setItem(key, JSON.stringify({ unexpected: true }));
    loadRecoverableJson({
      storage: localStorage,
      key,
      fallback: () => [] as string[],
      decode: () => { throw new Error("invalid shape"); },
    });

    discardRecoverableValue(localStorage, key);
    expect(isRecoverableStorageLocked(localStorage, key)).toBe(false);
    expect(writeRecoverableJson(localStorage, key, ["fresh"])).toBe(true);
    expect(localStorage.getItem(key)).toBe('["fresh"]');
  });
});
