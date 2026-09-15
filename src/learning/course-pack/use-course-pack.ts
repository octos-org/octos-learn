import { useEffect, useState } from "react";
import {
  loadBuiltinCoursePack,
  type BuiltinCoursePackId,
  type CoursePackPlaybackSource,
} from "./course-pack-loader";

export interface CoursePackLoadState {
  source: CoursePackPlaybackSource | null;
  loading: boolean;
  error: string | null;
}

export function useCoursePack(
  id: BuiltinCoursePackId | undefined,
): CoursePackLoadState {
  const [result, setResult] = useState<{
    id: BuiltinCoursePackId;
    state: CoursePackLoadState;
  } | null>(null);

  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    void loadBuiltinCoursePack(id, controller.signal)
      .then((source) => {
        if (!controller.signal.aborted) {
          setResult({ id, state: { source, loading: false, error: null } });
        }
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setResult({
          id,
          state: {
            source: null,
            loading: false,
            error: cause instanceof Error ? cause.message : "课程包无法打开",
          },
        });
      });
    return () => controller.abort();
  }, [id]);

  if (!id) return { source: null, loading: false, error: null };
  return result?.id === id
    ? result.state
    : { source: null, loading: true, error: null };
}
