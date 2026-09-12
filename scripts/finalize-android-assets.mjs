// Android renders 3D teacher choices from static thumbnails so the meeting
// display never creates a WebGL context. Remove the unreachable model payloads
// from the packaged assets without touching public/ or desktop web builds.

import { rmSync } from "node:fs";
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
