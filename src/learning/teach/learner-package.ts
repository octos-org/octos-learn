// The learner lesson package: everything needed to play a learner's lesson
// with no model and no speech service. One zip archive holding the canonical
// OLL lesson, the frozen handwriting, a pre-made narration clip per card,
// and a manifest that names the presenter by catalog reference and hashes
// every file. It never contains the learner's voice, face or real name.

import { unzipSync, zipSync } from "fflate";
import type { CanonicalEvent } from "octos-lesson-language";
import type { ImageAssetResolver } from "octos-lesson-language/web-runtime";

import { inkSnapshotResolver, type StoredInkSnapshot } from "./ink-snapshot-store";

export const LEARNER_PACKAGE_SCHEMA = "octos.learner-lesson-package.v1";
export const LEARNER_PACKAGE_EXTENSION = ".olesson";

export interface LearnerPackageFile {
  path: string;
  sha256: string;
  bytes: number;
  mediaType: string;
  role: "lesson" | "ink" | "narration";
}

export interface LearnerPackageManifest {
  schema: typeof LEARNER_PACKAGE_SCHEMA;
  lessonId: string;
  title: string;
  language: string;
  createdAt: string;
  /** The opaque learner reference and the presenter's catalog references, from the lesson's author. */
  author: { learner_ref: string; avatar_ref: string; voice_ref: string };
  lesson: string;
  ink: Array<{ snapshotId: string; file: string; width: number; height: number; regions: Record<string, { x: number; y: number; width: number; height: number }> }>;
  narration: Array<{ beatId: string; file: string; textSha256: string; durationMs: number }>;
  files: LearnerPackageFile[];
  /** SHA-256 over the sorted file list, so one value names the whole package content. */
  contentSha256: string;
}

export interface NarrationClip {
  beatId: string;
  text: string;
  audio: Uint8Array;
  durationMs: number;
}

export class LearnerPackageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LearnerPackageError";
  }
}

const encoder = new TextEncoder();
// A fixed date keeps archives of the same content byte-identical.
const ZIP_TIME = new Date("2026-01-01T00:00:00Z");

export async function sha256(bytes: Uint8Array | string): Promise<string> {
  const data = typeof bytes === "string" ? encoder.encode(bytes) : bytes;
  const digest = await crypto.subtle.digest("SHA-256", data as BufferSource);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

function listDigest(files: LearnerPackageFile[]): Promise<string> {
  return sha256([...files].sort((a, b) => a.path.localeCompare(b.path)).map((file) => `${file.path}\u0000${file.sha256}\u0000${file.bytes}`).join("\n"));
}

function author(events: CanonicalEvent[]): LearnerPackageManifest["author"] {
  const found = events.find((event) => event.lesson?.author)?.lesson?.author as { learner_ref?: string; presented_by?: { avatar_ref?: string; voice_ref?: string } } | undefined;
  if (!found?.learner_ref || !found.presented_by?.avatar_ref || !found.presented_by.voice_ref) throw new LearnerPackageError("The lesson has no learner author");
  return { learner_ref: found.learner_ref, avatar_ref: found.presented_by.avatar_ref, voice_ref: found.presented_by.voice_ref };
}

/** The handwriting snapshots the lesson's ink cards show. */
function snapshotIds(value: unknown, found = new Set<string>()): Set<string> {
  if (Array.isArray(value)) value.forEach((item) => snapshotIds(item, found));
  else if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      if (key === "snapshot_id" && typeof item === "string") found.add(item);
      else snapshotIds(item, found);
    }
  }
  return found;
}

/** The narration each card speaks, by beat ID, as the player will ask for it. */
export function lessonNarration(events: CanonicalEvent[]): Array<{ beatId: string; text: string }> {
  return events.flatMap((event) => event.step?.beats ?? []).flatMap((beat) => (beat.narration?.text.trim() ? [{ beatId: beat.id, text: beat.narration.text.trim() }] : []));
}

/** Builds the package archive. Every card that speaks needs its clip. */
export async function buildLearnerPackage(input: {
  lessonId: string;
  title: string;
  language: string;
  createdAt: string;
  events: CanonicalEvent[];
  snapshots: Record<string, StoredInkSnapshot>;
  narration: NarrationClip[];
}): Promise<{ archive: Uint8Array; manifest: LearnerPackageManifest }> {
  const entries: Record<string, Uint8Array> = {};
  const files: LearnerPackageFile[] = [];
  const add = async (path: string, data: Uint8Array, mediaType: string, role: LearnerPackageFile["role"]) => {
    entries[path] = data;
    files.push({ path, sha256: await sha256(data), bytes: data.byteLength, mediaType, role });
  };

  const lesson = "lesson.canonical.jsonl";
  await add(lesson, encoder.encode(input.events.map((event) => JSON.stringify(event)).join("\n")), "application/x-ndjson", "lesson");

  const used = snapshotIds(input.events);
  const ink: LearnerPackageManifest["ink"] = [];
  for (const snapshotId of [...used].sort()) {
    const snapshot = input.snapshots[snapshotId];
    if (!snapshot) throw new LearnerPackageError(`Handwriting ${snapshotId} is missing on this device`);
    const file = `ink/${await sha256(snapshotId)}.svg`;
    await add(file, encoder.encode(snapshot.svg), "image/svg+xml", "ink");
    ink.push({ snapshotId, file, width: snapshot.width, height: snapshot.height, regions: snapshot.regions ?? {} });
  }

  const narration: LearnerPackageManifest["narration"] = [];
  for (const { beatId, text } of lessonNarration(input.events)) {
    const clip = input.narration.find((candidate) => candidate.beatId === beatId);
    if (!clip || clip.text.trim() !== text) throw new LearnerPackageError(`The narration for ${beatId} is missing or out of date`);
    const file = `narration/${narration.length + 1}.mp3`;
    await add(file, clip.audio, "audio/mpeg", "narration");
    narration.push({ beatId, file, textSha256: await sha256(text), durationMs: Math.max(1, Math.round(clip.durationMs)) });
  }

  const manifest: LearnerPackageManifest = {
    schema: LEARNER_PACKAGE_SCHEMA, lessonId: input.lessonId, title: input.title, language: input.language, createdAt: input.createdAt,
    author: author(input.events), lesson, ink, narration, files, contentSha256: await listDigest(files),
  };
  const archive = zipSync({
    "manifest.json": [encoder.encode(JSON.stringify(manifest, null, 2)), { level: 6 }],
    ...Object.fromEntries(Object.entries(entries).map(([path, data]) => [path, [data, { level: path.endsWith(".mp3") ? 0 : 6 }]])),
  }, { mtime: ZIP_TIME });
  return { archive, manifest };
}

export interface LoadedLearnerPackage {
  manifest: LearnerPackageManifest;
  events: CanonicalEvent[];
  /** The lesson as canonical JSONL, for the player. */
  source: string;
  resolveAsset: ImageAssetResolver;
  /** A card's narration clip, only when it was made for exactly this text. */
  narration(beatId: string, text: string): Promise<Blob | null>;
}

/** Opens a package, refusing it unless every file matches the manifest's hashes. */
export async function readLearnerPackage(archive: ArrayBuffer | Uint8Array): Promise<LoadedLearnerPackage> {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(archive instanceof Uint8Array ? archive : new Uint8Array(archive));
  } catch {
    throw new LearnerPackageError("This is not a lesson package");
  }
  const manifestBytes = files["manifest.json"];
  if (!manifestBytes) throw new LearnerPackageError("The package has no manifest");
  const manifest = JSON.parse(new TextDecoder().decode(manifestBytes)) as LearnerPackageManifest;
  if (manifest.schema !== LEARNER_PACKAGE_SCHEMA) throw new LearnerPackageError("This lesson package needs a newer app");
  const listed = new Set(manifest.files.map((file) => file.path));
  if (Object.keys(files).some((path) => path !== "manifest.json" && !listed.has(path))) throw new LearnerPackageError("The package holds files its manifest does not list");
  for (const file of manifest.files) {
    const data = files[file.path];
    if (!data || data.byteLength !== file.bytes || await sha256(data) !== file.sha256) throw new LearnerPackageError(`${file.path} does not match the package manifest`);
  }
  if (await listDigest(manifest.files) !== manifest.contentSha256) throw new LearnerPackageError("The package content hash does not match");
  const source = new TextDecoder().decode(files[manifest.lesson]!);
  const events = source.split("\n").filter(Boolean).map((line) => JSON.parse(line) as CanonicalEvent);
  const snapshots = Object.fromEntries(manifest.ink.map((entry) => [entry.snapshotId, {
    svg: new TextDecoder().decode(files[entry.file]!), width: entry.width, height: entry.height, regions: entry.regions,
  } satisfies StoredInkSnapshot]));
  const clips = new Map(manifest.narration.map((entry) => [entry.beatId, entry]));
  return {
    manifest, events, source, resolveAsset: inkSnapshotResolver(snapshots),
    async narration(beatId, text) {
      const entry = clips.get(beatId);
      if (!entry || entry.textSha256 !== await sha256(text.trim())) return null;
      return new Blob([files[entry.file]! as BlobPart], { type: "audio/mpeg" });
    },
  };
}
