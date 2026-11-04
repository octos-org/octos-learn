import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { parseAvatarRigManifest } from "./rig-contract";
import { bindAvatarRig } from "./rig-binding";
import type { FaceFrame } from "./face-frame";

export function disposeAvatarModel(root: THREE.Object3D): void {
  const geometry = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
  root.traverse((node) => { if (node instanceof THREE.Mesh) { geometry.add(node.geometry); (Array.isArray(node.material) ? node.material : [node.material]).forEach((m) => materials.add(m)); } });
  geometry.forEach((g) => g.dispose()); materials.forEach((m) => m.dispose());
}

/** Reject external resources/extensions before handing bytes to the GLTF loader. */
export function checkStarFoxContainer(bytes: ArrayBuffer): void {
  if (bytes.byteLength < 20 || bytes.byteLength > 10_000_000) throw new Error("invalid_avatar_size");
  const header = new DataView(bytes);
  if (header.getUint32(0, true) !== 0x46546c67 || header.getUint32(4, true) !== 2 || header.getUint32(8, true) !== bytes.byteLength
    || header.getUint32(16, true) !== 0x4e4f534a) throw new Error("invalid_avatar_container");
  const size = header.getUint32(12, true);
  if (size % 4 || 20 + size > bytes.byteLength) throw new Error("invalid_avatar_json");
  const gltf = JSON.parse(new TextDecoder().decode(new Uint8Array(bytes, 20, size)));
  if (gltf.asset?.version !== "2.0" || (gltf.extensionsUsed?.length ?? 0) || (gltf.extensionsRequired?.length ?? 0)
    || (gltf.images?.length ?? 0) || (gltf.buffers ?? []).some((b: { uri?: unknown }) => b.uri !== undefined)) throw new Error("unsupported_avatar_resources");
}

/** A local versioned original GLB; capture/model services are never contacted. */
export async function loadStarFoxAsset(signal: AbortSignal) {
  const base = `${import.meta.env.BASE_URL}teach-avatars/star-fox/sculpt-v0.1/`;
  const [rigResponse, modelResponse] = await Promise.all([fetch(`${base}rig.json`, { signal }), fetch(`${base}model.glb`, { signal })]);
  if (!rigResponse.ok || !modelResponse.ok) throw new Error("avatar_asset_unavailable");
  const manifest = parseAvatarRigManifest(await rigResponse.json());
  const bytes = await modelResponse.arrayBuffer();
  if (signal.aborted) throw new DOMException("Aborted", "AbortError");
  checkStarFoxContainer(bytes);
  const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map((v) => v.toString(16).padStart(2, "0")).join("");
  if (hash !== manifest.modelSha256) throw new Error("rig_model_hash_mismatch");
  if (signal.aborted) throw new DOMException("Aborted", "AbortError");
  const model = await new GLTFLoader().parseAsync(bytes, "");
  try {
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");
    const binding = bindAvatarRig(model.scene, manifest, hash);
    return { root: model.scene, update(frame: FaceFrame) {
      // A closed lip takes precedence over an open jaw. The underlying rig is
      // additive; applying this rule once also keeps chin/tongue/cavity coherent.
      const channels = { ...frame.channels, jawOpen: (frame.channels.jawOpen ?? 0) * (1 - (frame.channels.mouthClose ?? 0)) };
      binding.update({ ...frame, channels });
    } };
  } catch (error) { disposeAvatarModel(model.scene); throw error; }
}
