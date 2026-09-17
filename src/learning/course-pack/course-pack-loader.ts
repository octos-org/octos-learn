import {
  coursePackFileBlob,
  loadCoursePackArchive,
  type LoadedCoursePack,
} from "octos-course-library/browser";
import type { AuthoringLesson, CanonicalEvent } from "octos-lesson-language";
import { assertOllMaterializationParity } from "../oll/oll-materialization";
import {
  fetchCoursePackCatalog,
  fetchSpotlightCoursePackCatalog,
  isCoursePackIdentity,
  isSpotlightBuild,
  spotlightCoursePackArchiveUrl,
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
    filename: "contract-smoke-0.0.2.ocpack",
    version: "0.0.2",
  },
};

export interface CoursePackPlaybackSource {
  id: string;
  pack: LoadedCoursePack;
  /** Present for packs that carry their reviewed Authoring source. These
   * events were rebuilt and checked through the same boundary as live lessons. */
  playbackEvents?: CanonicalEvent[];
  cameraPolicy: TeachingCameraPolicy;
  courseRegion?: PortableCourseRegion;
}

export type TeachingCameraPolicy = "automatic" | "explicit";
export interface PortableCourseRegion {
  x: number;
  y: number;
  reservedWidth: number;
}

const AUTHORING_LESSON_PATH = "course.authoring.json";

export function resolveCoursePackPlaybackEvents(
  pack: LoadedCoursePack,
): CanonicalEvent[] | undefined {
  const descriptor = pack.manifest.files?.find(
    (file) => file.path === AUTHORING_LESSON_PATH,
  );
  if (!descriptor) return undefined;
  const bytes = pack.files?.get(AUTHORING_LESSON_PATH);
  if (!bytes) throw new Error("CoursePack is missing its declared Authoring lesson");
  let authoring: AuthoringLesson;
  try {
    authoring = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    ) as AuthoringLesson;
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "invalid JSON";
    throw new Error(`CoursePack Authoring lesson is invalid: ${message}`);
  }
  return assertOllMaterializationParity(authoring, pack.events);
}

export function resolveCoursePackCameraPolicy(
  pack: LoadedCoursePack,
): TeachingCameraPolicy {
  const declarations = pack.board?.items?.filter(
    (item) => item.kind === "playback.camera-policy",
  ) ?? [];
  if (declarations.length > 1) {
    throw new Error("CoursePack declares more than one camera policy");
  }
  const policy = declarations[0]?.policy;
  if (policy === "automatic" || policy === "explicit") return policy;
  if (policy !== undefined) throw new Error("CoursePack camera policy is invalid");
  // Compatibility for already-published curated packs. New packs carry their
  // Authoring source and must declare editorial camera semantics explicitly.
  return pack.manifest.files?.some((file) => file.path === AUTHORING_LESSON_PATH)
    ? "automatic"
    : "explicit";
}

export function resolveCoursePackRegion(
  pack: LoadedCoursePack,
): PortableCourseRegion | undefined {
  const declarations = pack.board?.items?.filter(
    (item) => item.kind === "playback.course-region",
  ) ?? [];
  if (declarations.length > 1) {
    throw new Error("CoursePack declares more than one course region");
  }
  const region = declarations[0];
  if (!region) return undefined;
  if (
    typeof region.x !== "number" || !Number.isFinite(region.x)
    || typeof region.y !== "number" || !Number.isFinite(region.y)
    || typeof region.reservedWidth !== "number"
    || !Number.isFinite(region.reservedWidth)
    || region.reservedWidth <= 0
  ) {
    throw new Error("CoursePack course region is invalid");
  }
  return {
    x: region.x,
    y: region.y,
    reservedWidth: region.reservedWidth,
  };
}

function playbackSource(id: string, pack: LoadedCoursePack): CoursePackPlaybackSource {
  const playbackEvents = resolveCoursePackPlaybackEvents(pack);
  const cameraPolicy = resolveCoursePackCameraPolicy(pack);
  const courseRegion = resolveCoursePackRegion(pack);
  return playbackEvents
    ? { id, pack, playbackEvents, cameraPolicy, courseRegion }
    : { id, pack, cameraPolicy, courseRegion };
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
  expectedDigest?: string,
): Promise<CoursePackPlaybackSource | null> {
  const stored = await readStoredCoursePack(id, version);
  throwIfAborted(signal);
  if (!stored) return null;
  try {
    const pack = await loadCoursePackArchive(stored.archive);
    throwIfAborted(signal);
    validatePackIdentity(pack, id, version, expectedDigest ?? stored.archiveSha256);
    if (expectedDigest && stored.archiveSha256 !== expectedDigest) return null;
    return playbackSource(id, pack);
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
  return playbackSource(id, pack);
}

export async function loadPublishedCoursePack(
  id: string,
  version: string,
  signal?: AbortSignal,
  expectedDigest?: string,
): Promise<CoursePackPlaybackSource> {
  if (!isCoursePackIdentity(id, version)) throw new Error("课程包身份无效");
  const embedded = isSpotlightBuild();
  // A Spotlight build is an immutable, reviewed snapshot. Never let an
  // IndexedDB archive left by another build shadow the APK-owned bytes.
  if (!embedded) {
    const installed = await loadInstalledCoursePack(id, version, signal, expectedDigest);
    if (installed) return installed;
  }
  throwIfAborted(signal);
  const catalog = embedded
    ? await fetchSpotlightCoursePackCatalog(signal)
    : await fetchCoursePackCatalog(signal);
  const release = catalog.packs.find((entry) => entry.packId === id
    && entry.version === version);
  if (!release) throw new Error("此课程版本不在当前公开目录中");
  if (expectedDigest && release.archiveSha256 !== expectedDigest) {
    throw new Error("课程实例锁定的版本与当前公开课程不一致");
  }
  if (!supportsCoursePackPlayer(release.minimumPlayerVersion)) {
    throw new Error("此课程需要更新版本的 Octos Learn");
  }
  const archiveUrl = embedded
    ? spotlightCoursePackArchiveUrl(id, version)
    : release.archiveUrl;
  const response = await fetch(archiveUrl, { signal, cache: "no-store" });
  if (!response.ok) throw new Error(`课程包下载失败（HTTP ${response.status}）`);
  const archive = await response.arrayBuffer();
  if (archive.byteLength !== release.archiveBytes) {
    throw new Error("课程包大小与公开目录不一致");
  }
  const pack = await loadCoursePackArchive(archive);
  throwIfAborted(signal);
  validatePackIdentity(pack, id, version, release.archiveSha256);
  // Embedded packs already live in the APK and should not be duplicated in
  // IndexedDB. Server-delivered packs remain persisted for ordinary offline
  // reopening.
  if (!embedded) {
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
  }
  return playbackSource(id, pack);
}

export function loadCoursePack(
  id: string,
  version: string | undefined,
  signal?: AbortSignal,
  expectedDigest?: string,
): Promise<CoursePackPlaybackSource> {
  if (id === "contract-smoke" && !version) {
    return loadBuiltinCoursePack(id, signal);
  }
  if (!version) return Promise.reject(new Error("课程包链接缺少版本"));
  return loadPublishedCoursePack(id, version, signal, expectedDigest);
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
