// @vitest-environment node
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { localCoursePackFile } from "./local-course-pack-server";

const directories: string[] = [];
afterEach(() => { directories.forEach((directory) => rmSync(directory, { recursive: true, force: true })); directories.length = 0; });
function fixture() {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), "octos-catalog-test-")));
  directories.push(root);
  const release = path.join(root, "releases", "sample", "0.1.0");
  mkdirSync(path.join(release, "files"), { recursive: true });
  for (const file of ["catalog.json", "audit.ndjson", "catalog.source.json"]) writeFileSync(path.join(root, file), "{}");
  for (const file of ["archive.ocpack", "manifest.json", "files/thumbnail.svg"]) writeFileSync(path.join(release, file), "{}");
  return { root, release };
}
describe("local published catalog boundary", () => {
  it("maps the production catalog and immutable release routes", () => {
    const { root, release } = fixture();
    expect(localCoursePackFile(root, "/api/learn/course-packs?refresh=1")).toBe(path.join(root, "catalog.json"));
    for (const file of ["archive.ocpack", "manifest.json", "files/thumbnail.svg"]) {
      expect(localCoursePackFile(root, `/api/learn/course-packs/sample/0.1.0/${file}`)).toBe(path.join(release, file));
    }
  });
  it("rejects private state, traversal, malformed and missing resources", () => {
    const { root } = fixture();
    for (const suffix of ["audit.ndjson", "catalog.source.json", "sample/0.1.0/files/%2e%2e/manifest.json", "sample/0.1.0/files/%ZZ", "sample/0.1.0/files/a%5cb", "sample/0.1.0/files/missing.svg"]) {
      expect(localCoursePackFile(root, `/api/learn/course-packs/${suffix}`)).toBeNull();
    }
  });
  it("rejects symlinks outside the publication root", () => {
    const { root, release } = fixture();
    const outside = mkdtempSync(path.join(tmpdir(), "octos-catalog-outside-"));
    directories.push(outside);
    writeFileSync(path.join(outside, "secret"), "private");
    symlinkSync(path.join(outside, "secret"), path.join(release, "files", "secret"));
    expect(localCoursePackFile(root, "/api/learn/course-packs/sample/0.1.0/files/secret")).toBeNull();
  });
});
