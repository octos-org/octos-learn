import {
  coursePackFileBlob,
  loadCoursePackArchive,
  type LoadedCoursePack,
} from "octos-course-library/browser";
import {
  fetchCoursePackCatalog,
  isCoursePackIdentity,
  supportsCoursePackPlayer,
} from "./course-pack-catalog";
import {
  deleteStoredCoursePack,
  readStoredCoursePack,
  writeStoredCoursePack,
} from "./course-pack-store";

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
  id: string;
  pack: LoadedCoursePack;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException("The operation was aborted", "AbortError");
}

function validatePackIdentity(
  pack: LoadedCoursePack,
  id: string,
  version: string,
  expectedDigest?: string,
): void {
  if (!supportsCoursePackPlayer(pack.manifest.minimumPlayerVersion)) {
    throw new Error("此课程需要更新版本的 Octos Learn");
  }
  if (pack.manifest.packId !== id || pack.manifest.version !== version
    || (expectedDigest && pack.archiveSha256 !== expectedDigest)) {
    throw new Error("课程包与锁定的版本或摘要不一致");
  }
}

async function loadInstalledCoursePack(
  id: string,
  version: string,
  signal?: AbortSignal,
): Promise<CoursePackPlaybackSource | null> {
  const stored = await readStoredCoursePack(id, version);
  throwIfAborted(signal);
  if (!stored) return null;
  try {
    const pack = await loadCoursePackArchive(stored.archive);
    throwIfAborted(signal);
    validatePackIdentity(pack, id, version, stored.archiveSha256);
    return { id, pack };
  } catch (error) {
    await deleteStoredCoursePack(id, version);
    throwIfAborted(signal);
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    return null;
  }
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

export async function loadPublishedCoursePack(
  id: string,
  version: string,
  signal?: AbortSignal,
): Promise<CoursePackPlaybackSource> {
  if (!isCoursePackIdentity(id, version)) throw new Error("课程包身份无效");
  const installed = await loadInstalledCoursePack(id, version, signal);
  if (installed) return installed;
  throwIfAborted(signal);
  const catalog = await fetchCoursePackCatalog(signal);
  const release = catalog.packs.find((entry) => entry.packId === id
    && entry.version === version);
  if (!release) throw new Error("此课程版本不在当前公开目录中");
  if (!supportsCoursePackPlayer(release.minimumPlayerVersion)) {
    throw new Error("此课程需要更新版本的 Octos Learn");
  }
  const response = await fetch(release.archiveUrl, { signal, cache: "no-store" });
  if (!response.ok) throw new Error(`课程包下载失败（HTTP ${response.status}）`);
  const archive = await response.arrayBuffer();
  if (archive.byteLength !== release.archiveBytes) {
    throw new Error("课程包大小与公开目录不一致");
  }
  const pack = await loadCoursePackArchive(archive);
  throwIfAborted(signal);
  validatePackIdentity(pack, id, version, release.archiveSha256);
  const now = Date.now();
  await writeStoredCoursePack({
    identity: `${id}@${version}`,
    packId: id,
    version,
    archiveSha256: release.archiveSha256,
    archiveBytes: archive.byteLength,
    minimumPlayerVersion: pack.manifest.minimumPlayerVersion,
    installedAt: now,
    lastOpenedAt: now,
    archive,
    thumbnail: coursePackFileBlob(pack, pack.manifest.thumbnail),
    catalogEntry: release,
  });
  return { id, pack };
}

export function loadCoursePack(
  id: string,
  version: string | undefined,
  signal?: AbortSignal,
): Promise<CoursePackPlaybackSource> {
  if (id === "contract-smoke" && !version) {
    return loadBuiltinCoursePack(id, signal);
  }
  if (!version) return Promise.reject(new Error("课程包链接缺少版本"));
  return loadPublishedCoursePack(id, version, signal);
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

export function parseCoursePackId(value: string | null): string | undefined {
  return value && /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u.test(value)
    ? value
    : undefined;
}
