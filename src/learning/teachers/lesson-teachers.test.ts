import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ lessonTeachers: vi.fn() }));
vi.mock("../history/history-api", async (original) => ({ ...(await original<object>()), openHistoryApi: vi.fn(async () => api) }));
vi.mock("@/api/client", async (original) => ({ ...(await original<object>()), getToken: () => "token", getSelectedProfileId: () => "alice" }));

import { forgetLessonTeachers, useLessonTeachers } from "./lesson-teachers";

beforeEach(() => { localStorage.clear(); api.lessonTeachers.mockReset(); });
afterEach(() => vi.clearAllMocks());

it("keeps the teacher a lesson was asked of, whoever is chosen later", async () => {
  api.lessonTeachers.mockResolvedValue({ teachers: {} });
  const { result, unmount } = renderHook(() => useLessonTeachers("learn-a"));
  act(() => result.current.remember("q1", "sufei"));
  expect(result.current.teacherOf("q1")?.id).toBe("sufei");
  localStorage.setItem("octos-learn-teacher", "doudou");
  unmount();
  // Reopening the board on this device knows it at once, before any request.
  api.lessonTeachers.mockReturnValue(new Promise(() => undefined));
  const reopened = renderHook(() => useLessonTeachers("learn-a"));
  expect(reopened.result.current.teacherOf("q1")?.id).toBe("sufei");
  expect(reopened.result.current.teacherOf("q2")).toBeNull();
});

it("learns lessons taught on another device from the history service, ignoring unknown teachers", async () => {
  localStorage.setItem("octos-learn-lesson-teachers:v1:alice:learn-b", JSON.stringify({ q1: "alan" }));
  api.lessonTeachers.mockResolvedValue({ teachers: { q1: "doudou", q2: "sufei", q3: "siheng" } });
  const { result } = renderHook(() => useLessonTeachers("learn-b"));
  await waitFor(() => expect(result.current.teacherOf("q2")?.id).toBe("sufei"));
  expect(api.lessonTeachers).toHaveBeenCalledWith("learn-b");
  // This device recorded q1 when it was asked; that record stands.
  expect(result.current.teacherOf("q1")?.id).toBe("alan");
  expect(result.current.teacherOf("q3")).toBeNull();
  forgetLessonTeachers("learn-b");
  expect(localStorage.getItem("octos-learn-lesson-teachers:v1:alice:learn-b")).toBeNull();
});
