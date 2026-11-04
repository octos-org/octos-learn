import { FACE_CHANNELS, type FaceChannel } from "./face-frame";

export const AVATAR_RIG_SCHEMA = "octos.avatar-rig.v1";
export interface MorphBinding { node: string; morph: string; gain: number }
export interface AvatarRigManifest {
  schema: typeof AVATAR_RIG_SCHEMA;
  id: string;
  version: string;
  modelSha256: string;
  headRotation: { node: string; signs: [number, number, number] };
  channels: Partial<Record<FaceChannel, MorphBinding[]>>;
  unsupportedChannels: FaceChannel[];
}
export interface RigNodeInventory { name: string; morphTargets?: string[] }
const CORE_CHANNELS: FaceChannel[] = ["jawOpen", "mouthClose", "mouthPucker", "mouthFunnel", "mouthSmileLeft", "mouthSmileRight", "eyeBlinkLeft", "eyeBlinkRight"];
const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid_rig_manifest");
  return value as Record<string, unknown>;
};
const nodeName = (value: unknown): string => {
  if (typeof value !== "string" || !/^[A-Za-z][A-Za-z0-9_]{0,79}$/.test(value)) throw new Error("invalid_rig_name");
  return value;
};

export function parseAvatarRigManifest(raw: unknown): AvatarRigManifest {
  const input = object(raw), head = object(input.headRotation), mappings = object(input.channels);
  if (input.schema !== AVATAR_RIG_SCHEMA || typeof input.id !== "string" || !/^[a-z][a-z0-9-]{0,79}$/.test(input.id)
    || typeof input.version !== "string" || !/^\d+\.\d+\.\d+$/.test(input.version)
    || typeof input.modelSha256 !== "string" || !/^[a-f0-9]{64}$/.test(input.modelSha256)
    || !Array.isArray(head.signs) || head.signs.length !== 3 || !head.signs.every((sign) => sign === -1 || sign === 1)
    || !Array.isArray(input.unsupportedChannels)) throw new Error("invalid_rig_manifest");
  const unsupported = input.unsupportedChannels;
  if (unsupported.some((key) => !FACE_CHANNELS.includes(key as FaceChannel)) || new Set(unsupported).size !== unsupported.length
    || Object.keys(mappings).some((key) => !FACE_CHANNELS.includes(key as FaceChannel))) throw new Error("invalid_rig_channels");
  const channels: AvatarRigManifest["channels"] = {};
  const assigned = new Set<string>();
  for (const key of FACE_CHANNELS) {
    const mapping = mappings[key], missing = unsupported.includes(key);
    if ((mapping === undefined && !missing) || (mapping !== undefined && missing)) throw new Error(`rig_channel_coverage:${key}`);
    if (mapping === undefined) continue;
    if (!Array.isArray(mapping) || !mapping.length || mapping.length > 8) throw new Error("invalid_rig_binding");
    channels[key] = mapping.map((rawBinding) => {
      const binding = object(rawBinding), node = nodeName(binding.node), morph = nodeName(binding.morph);
      if (typeof binding.gain !== "number" || !Number.isFinite(binding.gain) || binding.gain <= 0 || binding.gain > 2) throw new Error("invalid_rig_gain");
      const target = `${node}\u0000${morph}`;
      if (assigned.has(target)) throw new Error("duplicate_rig_target");
      assigned.add(target); return { node, morph, gain: binding.gain };
    });
  }
  for (const key of CORE_CHANNELS) if (!channels[key]) throw new Error(`missing_core_rig_channel:${key}`);
  return { schema: AVATAR_RIG_SCHEMA, id: input.id, version: input.version, modelSha256: input.modelSha256,
    headRotation: { node: nodeName(head.node), signs: [...head.signs] as [number, number, number] }, channels, unsupportedChannels: [...unsupported] as FaceChannel[] };
}

/** Contract-level inventory check; not a replacement for full glTF or visual validation. */
export function checkRigInventory(manifest: AvatarRigManifest, nodes: RigNodeInventory[], modelSha256: string): void {
  if (manifest.modelSha256 !== modelSha256) throw new Error("rig_model_hash_mismatch");
  const named = (name: string) => {
    const matches = nodes.filter((node) => node.name === name);
    if (matches.length !== 1) throw new Error(`missing_or_ambiguous_rig_node:${name}`);
    return matches[0]!;
  };
  named(manifest.headRotation.node);
  for (const mappings of Object.values(manifest.channels)) for (const mapping of mappings) {
    const targets = named(mapping.node).morphTargets;
    if (targets?.filter((target) => target === mapping.morph).length !== 1) throw new Error(`missing_or_ambiguous_rig_morph:${mapping.node}/${mapping.morph}`);
  }
}
