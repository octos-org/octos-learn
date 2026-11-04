// Self-host all capture assets; the user's camera never contacts a model CDN.
import { copyFile, mkdir, readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { build } from "vite";

const root = fileURLToPath(new URL("../", import.meta.url));
const out = path.join(root, "public/avatar-runtime");
const model = path.join(root, "public/models/avatar-face/face_landmarker.task");
const manifest = JSON.parse(await readFile(path.join(root, "public/models/avatar-face/manifest.json"), "utf8"));
const bytes = await readFile(model);
if (createHash("sha256").update(bytes).digest("hex") !== manifest.sha256) throw new Error("Face model checksum does not match the reviewed model");
const packageFile = fileURLToPath(import.meta.resolve("@mediapipe/tasks-vision"));
const wasm = path.join(path.dirname(packageFile), "wasm");
await mkdir(path.join(out, "wasm"), { recursive: true });
await copyFile(model, path.join(out, "face_landmarker.task"));
const bodyManifest = JSON.parse(await readFile(path.join(root, "public/models/avatar-body/manifest.json"), "utf8"));
for (const entry of bodyManifest.models) {
  const file = path.join(root, "public/models/avatar-body", entry.file);
  const bytes = await readFile(file);
  if (createHash("sha256").update(bytes).digest("hex") !== entry.sha256) throw new Error(`Body model checksum does not match: ${entry.file}`);
  await copyFile(file, path.join(out, entry.file));
}
for (const name of await readdir(wasm)) {
  if (/^vision_wasm.*\.(js|wasm)$/.test(name)) await copyFile(path.join(wasm, name), path.join(out, "wasm", name));
}
await build({
  root, configFile: false, publicDir: false, logLevel: "warn",
  build: {
    emptyOutDir: false, outDir: out, target: "es2020",
    lib: { entry: path.join(root, "src/learning/avatar/face-capture.worker.ts"), name: "OctosFaceCapture", formats: ["iife"], fileName: () => "face-capture.worker.js" },
    minify: true,
  },
});
console.log("Avatar capture worker, verified model and WASM assets prepared.");
