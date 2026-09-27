import { OLL_PLAYER_EXECUTION_VERSION } from "octos-lesson-language";

export interface CoursePackCatalogEntry {
  packId: string;
  version: string;
  title: string;
  description: string;
  locale: string;
  subject: string;
  grade: string;
  durationSeconds: number;
  minimumPlayerVersion: string;
  archiveSha256: string;
  archiveBytes: number;
  recommended: boolean;
  archiveUrl: string;
  manifestUrl: string;
  thumbnailUrl: string;
  capabilities: {
    offlinePlayback: boolean;
    offlineNarration: boolean;
    interactiveWhiteboard: boolean;
    liveAi: "none" | "optional" | "required";
    asr?: "none" | "optional" | "required";
    camera?: "none" | "optional" | "required";
  };
}

export interface CoursePackCatalog {
  schemaVersion: 1;
  generatedAt: string;
  packs: CoursePackCatalogEntry[];
}

const PACK_ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u;
const VERSION = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-[0-9A-Za-z.-]+)?$/u;
const DIGEST = /^[a-f0-9]{64}$/u;
const CATALOG_CACHE_KEY = "octos:course-pack-catalog:v1";
// This is the executable protocol level, independent of the app's release label.
const PLAYER_VERSION = OLL_PLAYER_EXECUTION_VERSION;
export const EMBEDDED_COURSE_PACK_ROOT = `${import.meta.env.BASE_URL}course-packs/embedded`;

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function safeThumbnailUrl(url: unknown, base: string): url is string {
  if (typeof url !== "string" || !url.startsWith(`${base}/files/`)
    || url.includes("?") || url.includes("#")) return false;
  try {
    const suffix = decodeURIComponent(url.slice(`${base}/files/`.length));
    return suffix.length > 0 && suffix.length <= 512
      && !suffix.includes("\\")
      && Array.from(suffix).every((character) => character.charCodeAt(0) >= 32)
      && suffix.split("/").every((part) => part !== "" && part !== "." && part !== "..");
  } catch {
    return false;
  }
}

function parseEntry(value: unknown): CoursePackCatalogEntry {
  const entry = record(value);
  const capability = record(entry?.capabilities);
  if (!entry || !capability || typeof entry.packId !== "string"
    || !PACK_ID.test(entry.packId) || typeof entry.version !== "string"
    || !VERSION.test(entry.version) || typeof entry.archiveSha256 !== "string"
    || !DIGEST.test(entry.archiveSha256)) {
    throw new Error("课程目录中存在无效的课程身份");
  }
  const base = `/api/learn/course-packs/${entry.packId}/${entry.version}`;
  if (entry.archiveUrl !== `${base}/archive.ocpack`
    || entry.manifestUrl !== `${base}/manifest.json`
    || !safeThumbnailUrl(entry.thumbnailUrl, base)
    || ["title", "description", "locale", "subject", "grade", "minimumPlayerVersion"]
      .some((field) => typeof entry[field] !== "string" || !entry[field])
    || typeof entry.durationSeconds !== "number" || entry.durationSeconds < 0
    || typeof entry.archiveBytes !== "number" || entry.archiveBytes < 0
    || typeof entry.recommended !== "boolean"
    || typeof capability.offlinePlayback !== "boolean"
    || typeof capability.offlineNarration !== "boolean"
    || typeof capability.interactiveWhiteboard !== "boolean"
    || !["none", "optional", "required"].includes(String(capability.liveAi))) {
    throw new Error("课程目录中存在无效的课程元数据");
  }
  return entry as unknown as CoursePackCatalogEntry;
}

export function parseCoursePackCatalog(value: unknown): CoursePackCatalog {
  const data = record(value);
  if (!data || data.schemaVersion !== 1 || typeof data.generatedAt !== "string"
    || !Array.isArray(data.packs)) {
    throw new Error("课程目录格式无效");
  }
  const packs = data.packs.map(parseEntry);
  const identities = new Set<string>();
  for (const pack of packs) {
    const identity = `${pack.packId}@${pack.version}`;
    if (identities.has(identity)) throw new Error("课程目录包含重复版本");
    identities.add(identity);
  }
  return { schemaVersion: 1, generatedAt: data.generatedAt, packs };
}

export async function fetchCoursePackCatalog(signal?: AbortSignal): Promise<CoursePackCatalog> {
  const response = await fetch("/api/learn/course-packs", {
    signal,
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`课程目录暂不可用（HTTP ${response.status}）`);
  return parseCoursePackCatalog(await response.json());
}

export function embeddedCoursePackArchiveUrl(
  packId: string,
  version: string,
): string {
  if (!isCoursePackIdentity(packId, version)) {
    throw new Error("课程包身份无效");
  }
  return `${EMBEDDED_COURSE_PACK_ROOT}/${encodeURIComponent(packId)}`
    + `/${encodeURIComponent(version)}/archive.ocpack`;
}

export async function fetchEmbeddedCoursePackCatalog(
  signal?: AbortSignal,
): Promise<CoursePackCatalog> {
  const response = await fetch(`${EMBEDDED_COURSE_PACK_ROOT}/catalog.json`, {
    signal,
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`内置课程目录不可用（HTTP ${response.status}）`);
  const catalog = parseCoursePackCatalog(await response.json());
  return {
    ...catalog,
    packs: catalog.packs.map((entry) => {
      const thumbnailPath = entry.thumbnailUrl.slice(
        entry.thumbnailUrl.indexOf("/files/") + "/files/".length,
      );
      return {
        ...entry,
        thumbnailUrl: `${EMBEDDED_COURSE_PACK_ROOT}/${encodeURIComponent(entry.packId)}`
          + `/${encodeURIComponent(entry.version)}/files/${thumbnailPath}`,
      };
    }),
  };
}

let cachedEmbeddedCatalog: CoursePackCatalog | null = null;
let cachedEmbeddedCatalogPromise: Promise<CoursePackCatalog | null> | null = null;

export function resetEmbeddedCoursePackCatalogCache(): void {
  cachedEmbeddedCatalog = null;
  cachedEmbeddedCatalogPromise = null;
}

export function getCachedEmbeddedCatalog(): CoursePackCatalog | null {
  return cachedEmbeddedCatalog;
}

export async function getEmbeddedCoursePackCatalog(
  signal?: AbortSignal,
): Promise<CoursePackCatalog | null> {
  if (cachedEmbeddedCatalog) return cachedEmbeddedCatalog;
  if (cachedEmbeddedCatalogPromise) return cachedEmbeddedCatalogPromise;
  cachedEmbeddedCatalogPromise = fetchEmbeddedCoursePackCatalog(signal)
    .then((catalog) => {
      cachedEmbeddedCatalog = catalog;
      return catalog;
    })
    .catch(() => {
      cachedEmbeddedCatalog = null;
      return null;
    });
  return cachedEmbeddedCatalogPromise;
}

export function isKnownEmbeddedCourse(packId: string, version?: string): boolean {
  if (!cachedEmbeddedCatalog) return false;
  return cachedEmbeddedCatalog.packs.some(
    (entry) => entry.packId === packId && (!version || entry.version === version),
  );
}

export async function findEmbeddedCoursePackEntry(
  packId: string,
  version?: string,
  signal?: AbortSignal,
): Promise<CoursePackCatalogEntry | null> {
  const catalog = await getEmbeddedCoursePackCatalog(signal);
  if (!catalog) return null;
  const matches = catalog.packs.filter(
    (entry) => entry.packId === packId && (!version || entry.version === version),
  );
  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0]!;
  matches.sort((a, b) => compareCoursePackVersions(b.version, a.version));
  return matches[0] ?? null;
}


export function saveCoursePackCatalog(catalog: CoursePackCatalog): void {
  try {
    localStorage.setItem(CATALOG_CACHE_KEY, JSON.stringify(catalog));
  } catch {
    // Storage is an optional degraded-state aid, never a playback authority.
  }
}

export function loadSavedCoursePackCatalog(): CoursePackCatalog | null {
  try {
    const raw = localStorage.getItem(CATALOG_CACHE_KEY);
    return raw ? parseCoursePackCatalog(JSON.parse(raw) as unknown) : null;
  } catch {
    return null;
  }
}

export function isCoursePackIdentity(packId: string, version: string): boolean {
  return PACK_ID.test(packId) && VERSION.test(version);
}

export function supportsCoursePackPlayer(minimumVersion: string): boolean {
  if (!VERSION.test(minimumVersion)) return false;
  const player = PLAYER_VERSION.split(".").map(Number);
  const required = minimumVersion.split(/[.-]/u).slice(0, 3).map(Number);
  for (let index = 0; index < 3; index += 1) {
    if (player[index]! > required[index]!) return true;
    if (player[index]! < required[index]!) return false;
  }
  return true;
}

export function compareCoursePackVersions(a: string, b: string): number {
  const parse = (v: string) => {
    const match = v.match(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?$/u);
    if (!match) return { major: 0, minor: 0, patch: 0, prerelease: null };
    return {
      major: parseInt(match[1]!, 10),
      minor: parseInt(match[2]!, 10),
      patch: parseInt(match[3]!, 10),
      prerelease: match[4] ?? null,
    };
  };
  const pa = parse(a);
  const pb = parse(b);
  if (pa.major !== pb.major) return pa.major - pb.major;
  if (pa.minor !== pb.minor) return pa.minor - pb.minor;
  if (pa.patch !== pb.patch) return pa.patch - pb.patch;
  if (pa.prerelease !== null && pb.prerelease === null) return -1;
  if (pa.prerelease === null && pb.prerelease !== null) return 1;
  if (pa.prerelease !== null && pb.prerelease !== null) {
    return pa.prerelease.localeCompare(pb.prerelease);
  }
  return 0;
}

export function selectLatestCoursePacks(
  packs: readonly CoursePackCatalogEntry[],
  options?: {
    isEmbedded?: (entry: CoursePackCatalogEntry) => boolean;
  },
): CoursePackCatalogEntry[] {
  const latestByPackId = new Map<string, CoursePackCatalogEntry>();
  for (const pack of packs) {
    const existing = latestByPackId.get(pack.packId);
    if (!existing) {
      latestByPackId.set(pack.packId, pack);
      continue;
    }
    const cmp = compareCoursePackVersions(pack.version, existing.version);
    if (cmp > 0) {
      latestByPackId.set(pack.packId, pack);
    } else if (cmp === 0) {
      const packEmbedded = options?.isEmbedded?.(pack);
      const existingEmbedded = options?.isEmbedded?.(existing);
      if (packEmbedded && !existingEmbedded) {
        latestByPackId.set(pack.packId, pack);
      }
    }
  }
  return Array.from(latestByPackId.values());
}
