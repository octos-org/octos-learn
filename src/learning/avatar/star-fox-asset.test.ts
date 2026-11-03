import { readFileSync } from "node:fs";
import { createHash, webcrypto } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { checkStarFoxContainer, disposeAvatarModel, loadStarFoxAsset } from "./star-fox-asset";
import { parseAvatarRigManifest } from "./rig-contract";
import { bindAvatarRig } from "./rig-binding";
import { neutralFrame } from "./face-frame";

const folder = "public/teach-avatars/star-fox/sculpt-v0.1/";
const bytes = () => Uint8Array.from(readFileSync(`${folder}model.glb`)).buffer;
const manifest = () => JSON.parse(readFileSync(`${folder}rig.json`, "utf8"));
afterEach(() => vi.unstubAllGlobals());

it("loads the delivered GLB and drives real non-empty morphs through the existing rig", async () => {
  const data = bytes(), rig = parseAvatarRigManifest(manifest()); checkStarFoxContainer(data);
  const hash = createHash("sha256").update(new Uint8Array(data)).digest("hex");
  const { scene } = await new GLTFLoader().parseAsync(data, "");
  const bound = bindAvatarRig(scene, rig, hash);
  expect(Object.keys(rig.channels)).toHaveLength(21);
  for (const [channel, bindings] of Object.entries(rig.channels)) {
    for (const binding of bindings) {
      const mesh = scene.getObjectByName(binding.node) as THREE.Mesh;
      const index = mesh.morphTargetDictionary![binding.morph]!;
      expect([...mesh.geometry.morphAttributes.position![index]!.array].some((v) => Math.abs(v) > .0001), `${channel}/${binding.node} must deform`).toBe(true);
    }
  }
  const frame = { ...neutralFrame(), tracked: true, channels: { jawOpen: .8, eyeBlinkLeft: 1 }, rotation: [0, .4, 0] as [number, number, number] };
  bound.update(frame);
  const mouth = scene.getObjectByName("OralCavity") as THREE.Mesh;
  expect(mouth.morphTargetInfluences![mouth.morphTargetDictionary!.jawOpen!]).toBe(.8);
  expect(scene.getObjectByName("Head")!.quaternion.y).not.toBe(0);
  bound.reset(); expect(mouth.morphTargetInfluences!.every((v) => v === 0)).toBe(true);
  disposeAvatarModel(scene);
});

it("rejects external resources before the loader can request them", () => {
  const json = JSON.stringify({ asset: { version: "2.0" }, buffers: [{ uri: "https://example.com/mesh.bin" }] });
  const size = Math.ceil(json.length / 4) * 4, data = new ArrayBuffer(20 + size), h = new DataView(data);
  h.setUint32(0, 0x46546c67, true); h.setUint32(4, 2, true); h.setUint32(8, data.byteLength, true); h.setUint32(12, size, true); h.setUint32(16, 0x4e4f534a, true);
  new Uint8Array(data, 20).fill(32); new Uint8Array(data, 20).set(new TextEncoder().encode(json));
  expect(() => checkStarFoxContainer(data)).toThrow("unsupported_avatar_resources");
});

it("checks the downloaded hash and applies closed-lip precedence to the actual model", async () => {
  vi.stubGlobal("crypto", webcrypto);
  let rawRig = manifest();
  vi.stubGlobal("fetch", vi.fn(async (url: string) => ({ ok: true, json: async () => rawRig, arrayBuffer: async () => bytes(), url })));
  rawRig.modelSha256 = "0".repeat(64);
  await expect(loadStarFoxAsset(new AbortController().signal)).rejects.toThrow("rig_model_hash_mismatch");
  rawRig = manifest();
  const fox = await loadStarFoxAsset(new AbortController().signal);
  fox.update({ ...neutralFrame(), tracked: true, channels: { jawOpen: 1, mouthClose: 1 } });
  const mouth = fox.root.getObjectByName("OralCavity") as THREE.Mesh;
  expect(mouth.morphTargetInfluences![mouth.morphTargetDictionary!.jawOpen!]).toBe(0);
  const controller = new AbortController(); controller.abort();
  await expect(loadStarFoxAsset(controller.signal)).rejects.toThrow("Aborted");
  disposeAvatarModel(fox.root);
});
