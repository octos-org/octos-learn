import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { parseAvatarRigManifest, checkRigInventory } from "../src/learning/avatar/rig-contract";

const [manifestPath, modelPath] = process.argv.slice(2);
if (!manifestPath || !modelPath) throw new Error("Usage: vite-node scripts/check-avatar-rig.ts <rig.json> <model.glb>");
const manifest = parseAvatarRigManifest(JSON.parse(await readFile(manifestPath, "utf8")));
const model = await readFile(modelPath);
if (model.byteLength > 10_000_000 || model.byteLength < 20 || model.readUInt32LE(0) !== 0x46546c67 || model.readUInt32LE(4) !== 2 || model.readUInt32LE(8) !== model.byteLength) throw new Error("Expected a GLB 2 file no larger than 10 MB");
const jsonLength = model.readUInt32LE(12);
if (model.readUInt32LE(16) !== 0x4e4f534a || jsonLength % 4 || 20 + jsonLength > model.byteLength) throw new Error("Invalid GLB JSON chunk");
const gltf = JSON.parse(model.subarray(20, 20 + jsonLength).toString("utf8"));
// This delivery profile requires one self-contained file: no external resource fetching.
if (gltf.asset?.version !== "2.0" || (gltf.buffers ?? []).some((buffer: { uri?: string }) => buffer.uri !== undefined)
  || (gltf.images ?? []).some((image: { uri?: string; bufferView?: number }) => image.uri !== undefined || !Number.isInteger(image.bufferView))) throw new Error("Model must embed all buffers and images");
if ((gltf.extensionsRequired ?? []).some((extension: string) => extension !== "KHR_materials_unlit")) throw new Error("Required model extension is not supported by this delivery profile");
const nodes = (gltf.nodes ?? []).map((node: { name?: string; mesh?: number }) => {
  const mesh = node.mesh === undefined ? undefined : gltf.meshes?.[node.mesh];
  const targetNames = mesh?.extras?.targetNames;
  const count = mesh?.primitives?.length === 1 ? mesh.primitives[0]?.targets?.length : undefined;
  return { name: node.name ?? "", morphTargets: Array.isArray(targetNames) && targetNames.length === count && targetNames.every((name: unknown) => typeof name === "string") ? targetNames : undefined };
});
checkRigInventory(manifest, nodes, createHash("sha256").update(model).digest("hex"));
console.log(JSON.stringify({ result: "rig-contract-passed", id: manifest.id, version: manifest.version, modelBytes: model.byteLength,
  mappedChannels: Object.keys(manifest.channels).length, unsupportedChannels: manifest.unsupportedChannels,
  next: "Run Khronos glTF validation, load the actual model, and review every expression combination and target-device performance." }, null, 2));
