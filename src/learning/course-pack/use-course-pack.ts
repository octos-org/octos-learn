import { useEffect, useState } from "react";
import {
  loadCoursePack,
  type CoursePackPlaybackSource,
} from "./course-pack-loader";

export interface CoursePackLoadState {
  source: CoursePackPlaybackSource | null;
  loading: boolean;
  error: string | null;
}

export function useCoursePack(
  id: string | undefined,
  version?: string,
): CoursePackLoadState {
  const [result, setResult] = useState<{
    key: string;
    state: CoursePackLoadState;
  } | null>(null);
  const key = id ? `${id}@${version ?? ""}` : null;

  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    void loadCoursePack(id, version, controller.signal)
      .then((source) => {
        if (!controller.signal.aborted) {
          setResult({ key: `${id}@${version ?? ""}`, state: { source, loading: false, error: null } });
        }
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setResult({
          key: `${id}@${version ?? ""}`,
          state: {
            source: null,
            loading: false,
            error: cause instanceof Error ? cause.message : "课程包无法打开",
          },
        });
      });
    return () => controller.abort();
  }, [id, version]);

  if (!id) return { source: null, loading: false, error: null };
  return result?.key === key
    ? result.state
    : { source: null, loading: true, error: null };
}
