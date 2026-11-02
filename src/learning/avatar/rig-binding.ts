import * as THREE from "three";
import { faceChannel, type FaceFrame } from "./face-frame";
import { parseAvatarRigManifest, checkRigInventory, type AvatarRigManifest } from "./rig-contract";

/** Bind a loaded, hash-verified model once; no traversal or React state updates per frame. */
export function bindAvatarRig(root: THREE.Object3D, rawManifest: AvatarRigManifest, modelSha256: string): { update: (frame: FaceFrame) => void; reset: () => void } {
  const manifest = parseAvatarRigManifest(rawManifest);
  const nodes: THREE.Object3D[] = []; root.traverse((node) => nodes.push(node));
  checkRigInventory(manifest, nodes.map((node) => ({ name: node.name,
    morphTargets: node instanceof THREE.Mesh && node.morphTargetDictionary ? Object.keys(node.morphTargetDictionary) : undefined })), modelSha256);
  const find = (name: string) => nodes.find((node) => node.name === name)!;
  const head = find(manifest.headRotation.node), base = head.quaternion.clone();
  const targets = Object.entries(manifest.channels).flatMap(([channel, bindings]) => bindings.map((binding) => {
    const mesh = find(binding.node) as THREE.Mesh;
    const index = mesh.morphTargetDictionary![binding.morph]!;
    if (!mesh.morphTargetInfluences || index >= mesh.morphTargetInfluences.length) throw new Error("invalid_runtime_rig_target");
    return { channel: channel as Parameters<typeof faceChannel>[1], mesh, index, gain: binding.gain, rest: mesh.morphTargetInfluences[index]! };
  }));
  const rotation = new THREE.Euler(0, 0, 0, "YXZ"), delta = new THREE.Quaternion();
  return {
    update(frame) {
      for (const target of targets) target.mesh.morphTargetInfluences![target.index] = Math.min(1, Math.max(0, faceChannel(frame, target.channel) * target.gain));
      rotation.set(...frame.rotation.map((value, index) => value * manifest.headRotation.signs[index]!) as [number, number, number]);
      head.quaternion.copy(base).multiply(delta.setFromEuler(rotation));
    },
    reset() { head.quaternion.copy(base); for (const target of targets) target.mesh.morphTargetInfluences![target.index] = target.rest; },
  };
}
