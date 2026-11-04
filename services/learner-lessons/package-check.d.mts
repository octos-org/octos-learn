// Types for the app's tests, which check that the service accepts what the app builds.
export const LEARNER_PACKAGE_SCHEMA: "octos.learner-lesson-package.v1";
export const LEARNER_MOUTH_PACKAGE_SCHEMA: "octos.learner-lesson-package.v2";
export const PACKAGE_MAX_BYTES: number;
export const MOUTH_CHANNELS: readonly string[];
export const PERFORMANCE_CHANNELS: readonly string[];
export class LearnerPackageError extends Error {}
export function checkLearnerPackage(archive: Buffer, lessonId: string): {
  content_sha256: string; title: string; language: string;
  author: { learner_ref: string; avatar_ref: string; voice_ref: string };
  cards: number; practice_tasks: number; bytes: number;
};
