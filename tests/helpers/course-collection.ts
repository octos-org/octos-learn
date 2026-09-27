import { COURSE_COLLECTIONS } from "../../src/learning/course-collections";

export function collectionUrl(packId: string): string {
  const group = COURSE_COLLECTIONS.find(group => group.packIds.includes(packId));
  return `/?collection=${group?.id ?? "other"}`;
}
