import {
  findEmbeddedCoursePackEntry,
  isKnownEmbeddedCourse,
} from "@/learning/course-pack/course-pack-catalog";

export type RouteLocation = Pick<Location, "pathname" | "search">;

export function parseCoursePackRouteParams(search: string): {
  packId: string;
  version?: string;
} | null {
  const params = new URLSearchParams(search);
  const packId = params.get("course-pack");
  if (!packId) return null;
  const version = params.get("course-version") ?? undefined;
  return { packId, version };
}

/**
 * Checks synchronously if this route is known to be an embedded course (based on
 * a previously cached or resolved embedded catalog).
 */
export function isKnownEmbeddedCourseLocation(location: RouteLocation): boolean {
  if (location.pathname !== "/board") return false;
  const parsed = parseCoursePackRouteParams(location.search);
  if (!parsed) return false;
  return isKnownEmbeddedCourse(parsed.packId, parsed.version);
}

/**
 * Checks asynchronously if this route points to a trusted embedded course pack.
 */
export async function isEmbeddedCourseLocation(
  location: RouteLocation,
  signal?: AbortSignal,
): Promise<boolean> {
  if (location.pathname !== "/board") return false;
  const parsed = parseCoursePackRouteParams(location.search);
  if (!parsed) return false;
  const entry = await findEmbeddedCoursePackEntry(parsed.packId, parsed.version, signal);
  return Boolean(entry);
}
