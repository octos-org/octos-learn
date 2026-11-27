import { IDBFactory } from "fake-indexeddb";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import source from "./fixtures/unit-circle-sine.canonical.jsonl?raw";
import { useOllLessonRuntime } from "./use-oll-lesson-runtime";

beforeEach(() => { vi.stubGlobal("indexedDB", new IDBFactory()); localStorage.clear(); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

// Input to a task that is not available now is refused; the lesson goes on (it used to fail the session).
it("refuses input to a known task that is not available now and keeps the session", async () => {
  const { result } = renderHook(() => useOllLessonRuntime({ source, storageKey: "task-not-available" }));
  await waitFor(() => expect(result.current).not.toBeNull());
  expect(result.current!.studentTasks.find((task) => task.task_id === "reach-sine-maximum")?.available).toBe(false);

  act(() => {
    result.current!.requestStudentTaskHint("reach-sine-maximum");
    result.current!.retryStudentTask("reach-sine-maximum");
    result.current!.submitStudentCard("reach-sine-maximum");
  });
  expect(result.current!.failure).toBeUndefined();
});

it("still fails the session on input to an unknown task", async () => {
  const { result } = renderHook(() => useOllLessonRuntime({ source, storageKey: "task-unknown" }));
  await waitFor(() => expect(result.current).not.toBeNull());

  act(() => { result.current!.requestStudentTaskHint("no-such-task"); });
  expect(result.current!.failure).toBeDefined();
});
