// The APK uses Android's native AudioRecord/VAD pipeline. Browser VAD assets
// are large and cannot execute on that path, so remove any files left by a
// previous dev/public build before Vite copies public/ into Android assets.

import { rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const vadAssets = join(root, "public", "vad");

rmSync(vadAssets, { recursive: true, force: true });
console.log("[prepare-android-assets] excluded browser VAD/ONNX assets from APK build");
