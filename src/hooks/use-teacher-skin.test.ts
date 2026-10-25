import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import {
  applyTeacherSkin,
  resolveInitialTeacherSkin,
  useTeacherSkin,
} from "./use-teacher-skin";

const STORAGE_KEY = "octos-teacher-skin";

beforeEach(() => {
  localStorage.clear();
});

describe("teacher skin preference", () => {
  it("shows the teacher portrait over a look saved before portraits, and keeps later choices", () => {
    localStorage.setItem(STORAGE_KEY, "scholar");
    expect(resolveInitialTeacherSkin()).toBe("portrait");
    expect(localStorage.length).toBe(1);
    applyTeacherSkin("scholar");
    expect(resolveInitialTeacherSkin()).toBe("scholar");
  });

  it("defaults to the teacher portrait and ignores unknown stored values", () => {
    expect(resolveInitialTeacherSkin()).toBe("portrait");
    localStorage.setItem(STORAGE_KEY, "invisible");
    expect(resolveInitialTeacherSkin()).toBe("portrait");
  });

  it("persists a skin and notifies other hook instances", () => {
    const first = renderHook(() => useTeacherSkin());
    const second = renderHook(() => useTeacherSkin());

    act(() => first.result.current.setSkin("scholar"));

    expect(localStorage.getItem(STORAGE_KEY)).toBe("scholar");
    expect(first.result.current.skin).toBe("scholar");
    expect(second.result.current.skin).toBe("scholar");
  });

  it("restores a selected 3D model skin", () => {
    applyTeacherSkin("panda-3d");

    expect(resolveInitialTeacherSkin()).toBe("panda-3d");
  });
});
