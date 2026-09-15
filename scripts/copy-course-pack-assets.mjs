// Copy the contract fixture from the pinned public course-library dependency.
// This keeps the player integration test offline in the APK while ensuring
// octos-learn never carries a second hand-maintained copy of the pack contract.

import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const filename = "contract-smoke-0.0.1.ocpack";
const source = join(
  root,
  "node_modules",
  "octos-course-library",
  "packages",
  "course-pack",
  "fixtures",
  filename,
);
const outputDirectory = join(root, "public", "course-packs");

if (!existsSync(source)) {
  throw new Error(
    `[copy-course-pack-assets] missing pinned fixture: ${source}. Run pnpm install first.`,
  );
}

mkdirSync(outputDirectory, { recursive: true });
copyFileSync(source, join(outputDirectory, filename));
console.log(`[copy-course-pack-assets] copied ${filename} to public/course-packs/`);
