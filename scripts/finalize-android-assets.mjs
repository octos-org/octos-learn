// Android renders 3D teacher choices from static thumbnails so the meeting
// display never creates a WebGL context. Remove the unreachable model payloads
// from the packaged assets without touching public/ or desktop web builds.

import { rmSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const companions = join(
  root,
  "android",
  "app",
  "src",
  "main",
  "assets",
  "models",
  "companions",
);

for (const model of ["panda.glb", "penguin.glb", "bee.glb"]) {
  rmSync(join(companions, model), { force: true });
}

console.log("[finalize-android-assets] removed unused 3D teacher models");

const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
const lockBytes = readFileSync(process.env.OCTOS_EMBEDDED_PACKS_JSON?.trim()
  || join(root, "android", "embedded-course-packs.json"));
writeFileSync(join(root, "android", "app", "src", "main", "assets", "build-info.json"), JSON.stringify({
  revision: git("rev-parse", "HEAD"),
  dirty: git("status", "--porcelain").length > 0,
  builtAt: new Date().toISOString(),
  embeddedSnapshot: JSON.parse(lockBytes).snapshotId,
  embeddedLockSha256: createHash("sha256").update(lockBytes).digest("hex"),
}, null, 2) + "\n");
