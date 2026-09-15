import {
  coursePackFileBlob,
  loadCoursePackArchive,
  type LoadedCoursePack,
} from "octos-course-library/browser";

export type BuiltinCoursePackId = "contract-smoke";

const BUILTIN_COURSE_PACKS: Record<BuiltinCoursePackId, {
  filename: string;
  version: string;
}> = {
  "contract-smoke": {
    filename: "contract-smoke-0.0.1.ocpack",
    version: "0.0.1",
  },
};

export interface CoursePackPlaybackSource {
  id: BuiltinCoursePackId;
  pack: LoadedCoursePack;
}

export async function loadBuiltinCoursePack(
  id: BuiltinCoursePackId,
  signal?: AbortSignal,
): Promise<CoursePackPlaybackSource> {
  const descriptor = BUILTIN_COURSE_PACKS[id];
  const response = await fetch(
    `${import.meta.env.BASE_URL}course-packs/${descriptor.filename}`,
    { signal, cache: "no-store" },
  );
  if (!response.ok) {
    throw new Error(`课程包读取失败（HTTP ${response.status}）`);
  }
  const pack = await loadCoursePackArchive(await response.arrayBuffer());
  if (pack.manifest.packId !== id || pack.manifest.version !== descriptor.version) {
    throw new Error("课程包身份与应用内锁定版本不一致");
  }
  return { id, pack };
}

export function coursePackNarrationBlob(
  source: CoursePackPlaybackSource,
  beatId: string,
): Blob | null {
  const segment = source.pack.manifest.narration.segments.find(
    (candidate) => candidate.beatId === beatId,
  );
  return segment ? coursePackFileBlob(source.pack, segment.file) : null;
}

export function parseBuiltinCoursePackId(
  value: string | null,
): BuiltinCoursePackId | undefined {
  return value === "contract-smoke" ? value : undefined;
}
