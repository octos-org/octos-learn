// Frozen learner ink stays on the device with the draft until the lesson is
// submitted. The board resolves a snapshot ID to its SVG for display and
// stroke replay.

import type { ImageAssetResolver } from "octos-lesson-language/web-runtime";

import { loadRecoverableJson, writeRecoverableJson } from "../recoverable-storage";

export interface StoredInkSnapshot {
  svg: string;
  width: number;
  height: number;
  /** Strokes the learner pointed at, by selection, in fractions of the snapshot. */
  regions?: Record<string, { x: number; y: number; width: number; height: number }>;
}

export function inkSnapshotsKey(profileId: string): string {
  return `octos-learn:learner-ink:v1:${profileId}`;
}

function decode(value: unknown): Record<string, StoredInkSnapshot> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("ink snapshots must be an object");
  for (const snapshot of Object.values(value as Record<string, unknown>)) {
    const fields = snapshot as Partial<StoredInkSnapshot>;
    if (typeof fields?.svg !== "string" || !(Number(fields.width) > 0) || !(Number(fields.height) > 0)) throw new Error("invalid ink snapshot");
  }
  return value as Record<string, StoredInkSnapshot>;
}

export function loadInkSnapshots(storage: Storage, profileId: string): Record<string, StoredInkSnapshot> {
  return loadRecoverableJson({ storage, key: inkSnapshotsKey(profileId), fallback: () => ({}), decode });
}

export function saveInkSnapshot(storage: Storage, profileId: string, snapshotId: string, snapshot: StoredInkSnapshot): boolean {
  return writeRecoverableJson(storage, inkSnapshotsKey(profileId), { ...loadInkSnapshots(storage, profileId), [snapshotId]: snapshot });
}

/** Resolves stored snapshots for the board, with the strokes the learner pointed at as addressable regions. */
export function inkSnapshotResolver(snapshots: Record<string, StoredInkSnapshot>): ImageAssetResolver {
  return (snapshotId) => {
    const snapshot = snapshots[snapshotId];
    if (!snapshot) return undefined;
    return {
      src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(snapshot.svg)}`,
      svg: snapshot.svg,
      intrinsic_width: snapshot.width,
      intrinsic_height: snapshot.height,
      regions: snapshot.regions ?? {},
    };
  };
}

/** Hex SHA-256 of snapshot markup, as OLL checks it. */
export async function inkChecksum(svg: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(svg));
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}
