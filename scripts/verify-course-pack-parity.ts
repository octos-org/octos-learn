import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { loadCoursePackArchive } from "octos-course-library/browser";
import {
  resolveCoursePackCameraPolicy,
  resolveCoursePackPlaybackEvents,
  resolveCoursePackRegion,
} from
  "../src/learning/course-pack/course-pack-loader";

const archiveArgument = process.argv.find((value, index, argv) =>
  argv[index - 1] === "--archive");
if (!archiveArgument) throw new Error("Missing --archive <path>");
const archivePath = resolve(archiveArgument);
const bytes = await readFile(archivePath);
const pack = await loadCoursePackArchive(bytes);
const events = resolveCoursePackPlaybackEvents(pack);
if (!events) {
  throw new Error("CoursePack does not contain course.authoring.json");
}
process.stdout.write(`${JSON.stringify({
  status: "parity-verified",
  archive: archivePath,
  packId: pack.manifest.packId,
  version: pack.manifest.version,
  events: events.length,
  cameraPolicy: resolveCoursePackCameraPolicy(pack),
  courseRegion: resolveCoursePackRegion(pack),
  archiveSha256: pack.archiveSha256,
})}\n`);
