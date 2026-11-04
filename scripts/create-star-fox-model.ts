import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { makeStarFoxSculpt } from "../src/learning/avatar/star-fox-model";

// The exporter uses browser FileReader for its final binary Blob. This minimal
// adapter only reads locally generated blobs; no DOM, canvas or remote IO.
class BlobReader {
  result: ArrayBuffer | string | null = null;
  onloadend: (() => void) | null = null;
  async readAsArrayBuffer(blob: Blob) { this.result = await blob.arrayBuffer(); this.onloadend?.(); }
  async readAsDataURL(blob: Blob) { this.result = `data:${blob.type};base64,${Buffer.from(await blob.arrayBuffer()).toString("base64")}`; this.onloadend?.(); }
}
Object.defineProperty(globalThis, "FileReader", { value: BlobReader, configurable: true });
const output = process.argv[2] ?? "public/teach-avatars/star-fox/sculpt-v0.1";
const { root, manifest } = makeStarFoxSculpt();
const binary = await new GLTFExporter().parseAsync(root, { binary: true, onlyVisible: true });
if (!(binary instanceof ArrayBuffer)) throw new Error("Expected binary GLB");
manifest.modelSha256 = createHash("sha256").update(new Uint8Array(binary)).digest("hex");
let triangles = 0, vertices = 0, meshes = 0, morphs = 0;
root.traverse((node) => {
  if (!("geometry" in node)) return;
  const geometry = (node as import("three").Mesh).geometry;
  vertices += geometry.getAttribute("position").count; triangles += (geometry.index?.count ?? geometry.getAttribute("position").count) / 3; meshes++; morphs += geometry.morphAttributes.position?.length ?? 0;
});
await mkdir(output, { recursive: true });
await writeFile(`${output}/model.glb`, new Uint8Array(binary));
await writeFile(`${output}/rig.json`, JSON.stringify(manifest, null, 2) + "\n");
await writeFile(`${output}/asset-info.json`, JSON.stringify({ id: manifest.id, version: manifest.version, bytes: binary.byteLength, vertices, triangles, meshes, morphTargets: morphs, mappedChannels: Object.keys(manifest.channels),
  source: "src/learning/avatar/star-fox-model.ts", authoring: "Original code-authored stylized sculpt; no third-party meshes, textures or human likeness. Concept references are project-owned images.",
  status: "First visual sample, not a production or Memoji quality acceptance. No device performance claim." }, null, 2) + "\n");
console.log(JSON.stringify({ output, bytes: binary.byteLength, sha256: manifest.modelSha256, vertices, triangles, meshes, morphs }));
