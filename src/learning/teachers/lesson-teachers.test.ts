import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ lessonTeachers: vi.fn(), owner: "alice" }));
const identity = vi.hoisted(() => ({ profile: "alice", token: "token-a" }));
vi.mock("../history/history-api", async (original) => ({ ...(await original<object>()), openHistoryApi: vi.fn(async () => api) }));
vi.mock("@/api/client", async (original) => ({ ...(await original<object>()), getToken: () => identity.token, getSelectedProfileId: () => identity.profile }));

import { forgetLessonTeachers, useLessonTeachers } from "./lesson-teachers";

const KEY = (owner: string, session: string) => `octos-learn-lesson-teachers:v1:${owner}:${session}`;
const switchTo = (profile: string, token: string) => {
  identity.profile = profile; identity.token = token; api.owner = profile;
  window.dispatchEvent(new Event("octos:identity-changed"));
};

beforeEach(() => {
  localStorage.clear(); api.lessonTeachers.mockReset();
  identity.profile = "alice"; identity.token = "token-a"; api.owner = "alice";
});

it("keeps the teacher a lesson was asked of on this device, before any request answers", async () => {
  api.lessonTeachers.mockResolvedValue({ teachers: {} });
  const { result, unmount } = renderHook(() => useLessonTeachers("learn-a"));
  await waitFor(() => expect(result.current.settled).toBe(true));
  act(() => result.current.remember("q1", "sufei"));
  expect(result.current.teacherOf("q1")?.id).toBe("sufei");
  localStorage.setItem("octos-learn-teacher", "doudou");
  unmount();
  api.lessonTeachers.mockReturnValue(new Promise(() => undefined));
  const reopened = renderHook(() => useLessonTeachers("learn-a"));
  expect(reopened.result.current.teacherOf("q1")?.id).toBe("sufei");
  expect(reopened.result.current.settled).toBe(false);
  expect(reopened.result.current.teacherOf("q2")).toBeNull();
});

it("uses the history service for lessons asked elsewhere without storing them, and settles on failure too", async () => {
  localStorage.setItem(KEY("alice", "learn-b"), JSON.stringify({ q1: "alan" }));
  api.lessonTeachers.mockResolvedValue({ teachers: { q1: "doudou", q2: "sufei", q3: "siheng" } });
  const { result } = renderHook(() => useLessonTeachers("learn-b"));
  expect(result.current.settled).toBe(false);
  await waitFor(() => expect(result.current.teacherOf("q2")?.id).toBe("sufei"));
  expect(result.current.settled).toBe(true);
  // What this device recorded when asking stands; unknown teachers are ignored.
  expect(result.current.teacherOf("q1")?.id).toBe("alan");
  expect(result.current.teacherOf("q3")).toBeNull();
  // Records deleted elsewhere disappear on the next open, since they were never stored.
  expect(JSON.parse(localStorage.getItem(KEY("alice", "learn-b"))!)).toEqual({ q1: "alan" });
  forgetLessonTeachers("learn-b");
  expect(localStorage.getItem(KEY("alice", "learn-b"))).toBeNull();

  api.lessonTeachers.mockRejectedValue(new Error("offline"));
  const offline = renderHook(() => useLessonTeachers("learn-c"));
  await waitFor(() => expect(offline.result.current.settled).toBe(true));
});

it("never carries one account's lessons into another after a switch", async () => {
  localStorage.setItem(KEY("alice", "learn-a"), JSON.stringify({ q1: "alan" }));
  api.lessonTeachers.mockResolvedValue({ teachers: { q9: "doudou" } });
  const { result } = renderHook(() => useLessonTeachers("learn-a"));
  await waitFor(() => expect(result.current.teacherOf("q9")?.id).toBe("doudou"));
  const stale = result.current.remember;
  api.lessonTeachers.mockResolvedValue({ teachers: {} });
  act(() => switchTo("bob", "token-b"));
  expect(result.current.teacherOf("q1")).toBeNull();
  expect(result.current.teacherOf("q9")).toBeNull();
  await waitFor(() => expect(result.current.settled).toBe(true));
  // A write captured under Alice is refused once Bob is signed in.
  act(() => stale("q2", "alan"));
  expect(localStorage.getItem(KEY("bob", "learn-a"))).toBeNull();
  act(() => result.current.remember("q3", "sufei"));
  expect(JSON.parse(localStorage.getItem(KEY("bob", "learn-a"))!)).toEqual({ q3: "sufei" });
  expect(JSON.parse(localStorage.getItem(KEY("alice", "learn-a"))!)).toEqual({ q1: "alan" });
});

it("ignores an answer that belongs to another account", async () => {
  api.owner = "mallory";
  api.lessonTeachers.mockResolvedValue({ teachers: { q1: "alan" } });
  const { result } = renderHook(() => useLessonTeachers("learn-a"));
  await waitFor(() => expect(result.current.settled).toBe(true));
  expect(result.current.teacherOf("q1")).toBeNull();
});
