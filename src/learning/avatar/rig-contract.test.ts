import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { FACE_CHANNELS, normalizeFaceFrame } from "./face-frame";
import { AVATAR_RIG_SCHEMA, checkRigInventory, parseAvatarRigManifest } from "./rig-contract";
import { bindAvatarRig } from "./rig-binding";

const hash = "a".repeat(64);
const input = () => ({ schema: AVATAR_RIG_SCHEMA, id: "star-fox", version: "0.1.0", modelSha256: hash,
  headRotation: { node: "Head", signs: [-1, -1, -1] },
  channels: Object.fromEntries(FACE_CHANNELS.map((key) => [key, [{ node: "Face", morph: key, gain: 1 }]])), unsupportedChannels: [] as string[] });
const nodes = () => [{ name: "Head" }, { name: "Face", morphTargets: [...FACE_CHANNELS] }];

describe("formal avatar rig contract", () => {
  it("checks a named channel inventory and keeps unsupported capabilities explicit", () => {
    const raw = input(); delete raw.channels.tongueOut; raw.unsupportedChannels.push("tongueOut");
    const rig = parseAvatarRigManifest(raw);
    expect(() => checkRigInventory(rig, nodes(), hash)).not.toThrow();
    expect(rig.unsupportedChannels).toEqual(["tongueOut"]);
    delete raw.channels.jawOpen;
    expect(() => parseAvatarRigManifest(raw)).toThrow("rig_channel_coverage:jawOpen");
    raw.unsupportedChannels.push("jawOpen");
    expect(() => parseAvatarRigManifest(raw)).toThrow("missing_core_rig_channel:jawOpen");
  });
  it("rejects missing/ambiguous nodes, targets and a different asset version", () => {
    const rig = parseAvatarRigManifest(input());
    expect(() => checkRigInventory(rig, nodes(), "b".repeat(64))).toThrow("rig_model_hash_mismatch");
    expect(() => checkRigInventory(rig, [...nodes(), { name: "Head" }], hash)).toThrow("missing_or_ambiguous_rig_node");
    expect(() => checkRigInventory(rig, [{ name: "Head" }, { name: "Face", morphTargets: ["jawOpen"] }], hash)).toThrow("missing_or_ambiguous_rig_morph");
  });
  it("rejects duplicate targets and conflicting capability declarations", () => {
    const raw = input(); raw.channels.mouthClose = raw.channels.jawOpen!;
    expect(() => parseAvatarRigManifest(raw)).toThrow("duplicate_rig_target");
    const conflicting = input(); conflicting.unsupportedChannels.push("jawOpen");
    expect(() => parseAvatarRigManifest(conflicting)).toThrow("rig_channel_coverage");
  });
  it("applies named morphs and head rotation relative to the rest pose, then resets", () => {
    const root = new THREE.Group(), head = new THREE.Group(), face = new THREE.Mesh();
    head.name = "Head"; face.name = "Face"; head.rotation.y = .25; root.add(head); head.add(face);
    face.morphTargetDictionary = Object.fromEntries(FACE_CHANNELS.map((key, index) => [key, index]));
    face.morphTargetInfluences = FACE_CHANNELS.map(() => 0);
    const base = head.quaternion.clone(), raw = input(); raw.channels.jawOpen![0]!.gain = 2;
    const rig = bindAvatarRig(root, parseAvatarRigManifest(raw), hash);
    rig.update(normalizeFaceFrame({ timeMs: 0, source: "arkit", tracked: true, channels: { jawOpen: .8, eyeBlinkLeft: .5 }, rotation: [0, .2, 0] }));
    expect(face.morphTargetInfluences[face.morphTargetDictionary.jawOpen!]).toBe(1);
    expect(face.morphTargetInfluences[face.morphTargetDictionary.eyeBlinkLeft!]).toBe(.5);
    expect(head.rotation.y).toBeCloseTo(.05);
    rig.reset(); expect(head.quaternion.equals(base)).toBe(true);
    expect(face.morphTargetInfluences.every((value) => value === 0)).toBe(true);
  });
});
