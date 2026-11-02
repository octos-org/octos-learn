// The learner lesson package: everything needed to play a learner's lesson
// with no model and no speech service. One zip archive holding the canonical
// OLL lesson, the frozen handwriting, a pre-made narration clip per card,
// and a manifest that names the presenter by catalog reference and hashes
// every file. It never contains the learner's voice, face or real name.

import { unzipSync, zipSync } from "fflate";
import type { CanonicalEvent } from "octos-lesson-language";
import type { ImageAssetResolver } from "octos-lesson-language/web-runtime";

import { inkSnapshotResolver, type StoredInkSnapshot } from "./ink-snapshot-store";
import { parseLipSyncTrack, type LipSyncTrack } from "../avatar/lip-sync";

export const LEARNER_PACKAGE_SCHEMA = "octos.learner-lesson-package.v1";
export const LEARNER_MOUTH_PACKAGE_SCHEMA = "octos.learner-lesson-package.v2";
export const LEARNER_PACKAGE_EXTENSION = ".olesson";

export interface LearnerPackageFile {
  path: string;
  sha256: string;
  bytes: number;
  mediaType: string;
  role: "lesson" | "ink" | "narration" | "lip-sync";
}

export interface LearnerPackageManifest {
  schema: typeof LEARNER_PACKAGE_SCHEMA | typeof LEARNER_MOUTH_PACKAGE_SCHEMA;
  requiredCapabilities?: ["avatar-lip-sync-v1"];
  lessonId: string;
  title: string;
  language: string;
  createdAt: string;
  /** The opaque learner reference and the presenter's catalog references, from the lesson's author. */
  author: { learner_ref: string; avatar_ref: string; voice_ref: string };
  lesson: string;
  ink: Array<{ snapshotId: string; file: string; width: number; height: number; regions: Record<string, { x: number; y: number; width: number; height: number }> }>;
  narration: Array<{ beatId: string; file: string; textSha256: string; durationMs: number }>;
  lipSync?: Array<{ beatId: string; file: string; audioSha256: string; textSha256: string }>;
  files: LearnerPackageFile[];
  /** SHA-256 over the sorted file list, so one value names the whole package content. */
  contentSha256: string;
}

export interface NarrationClip {
  beatId: string;
  text: string;
  audio: Uint8Array;
  durationMs: number;
  mediaType?: "audio/mpeg" | "audio/wav" | "audio/ogg" | "audio/mp4";
  lipSync?: LipSyncTrack;
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
    if (!data.byteLength || data.byteLength > 25_000_000) throw new LearnerPackageError("A lesson package file is empty or too large");
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
  const lipSync: NonNullable<LearnerPackageManifest["lipSync"]> = [];
  const withMouth = input.narration.some((clip) => clip.lipSync !== undefined);
  const audioExtensions = { "audio/mpeg": "mp3", "audio/wav": "wav", "audio/ogg": "ogg", "audio/mp4": "m4a" };
  if (new Set(input.narration.map((clip) => clip.beatId)).size !== input.narration.length) throw new LearnerPackageError("Duplicate narration clips");
  for (const { beatId, text } of lessonNarration(input.events)) {
    const clip = input.narration.find((candidate) => candidate.beatId === beatId);
    if (!clip || clip.text.trim() !== text) throw new LearnerPackageError(`The narration for ${beatId} is missing or out of date`);
    if (!clip.audio.byteLength || !Number.isFinite(clip.durationMs) || clip.durationMs <= 0) throw new LearnerPackageError(`Invalid narration for ${beatId}`);
    const mediaType = clip.mediaType ?? "audio/mpeg";
    if (!audioExtensions[mediaType]) throw new LearnerPackageError("Unsupported narration media type");
    const file = `narration/${narration.length + 1}.${audioExtensions[mediaType]}`;
    await add(file, clip.audio, mediaType, "narration");
    const textSha256 = await sha256(text), durationMs = Math.max(1, Math.round(clip.durationMs));
    narration.push({ beatId, file, textSha256, durationMs });
    if (withMouth) {
      if (!clip.lipSync) throw new LearnerPackageError(`The mouth track for ${beatId} is missing`);
      const audioSha256 = await sha256(clip.audio);
      const track = parseLipSyncTrack(clip.lipSync, { audioSha256, durationMs });
      const mouthFile = `mouth/${lipSync.length + 1}.json`;
      await add(mouthFile, encoder.encode(JSON.stringify(track)), "application/json", "lip-sync");
      lipSync.push({ beatId, file: mouthFile, audioSha256, textSha256 });
    }
  }

  const manifest: LearnerPackageManifest = {
    schema: withMouth ? LEARNER_MOUTH_PACKAGE_SCHEMA : LEARNER_PACKAGE_SCHEMA,
    ...(withMouth ? { requiredCapabilities: ["avatar-lip-sync-v1"] as ["avatar-lip-sync-v1"], lipSync } : {}),
    lessonId: input.lessonId, title: input.title, language: input.language, createdAt: input.createdAt,
    author: author(input.events), lesson, ink, narration, files, contentSha256: await listDigest(files),
  };
  if (withMouth && !lipSync.length) throw new LearnerPackageError("The lesson has no narration for mouth motion");
  if (files.length > 512 || files.reduce((total, file) => total + file.bytes, 0) + encoder.encode(JSON.stringify(manifest, null, 2)).byteLength > 100_000_000) throw new LearnerPackageError("The lesson package is too large");
  const archive = zipSync({
    "manifest.json": [encoder.encode(JSON.stringify(manifest, null, 2)), { level: 6 }],
    ...Object.fromEntries(Object.entries(entries).map(([path, data]) => [path, [data, { level: path.endsWith(".mp3") ? 0 : 6 }]])),
  }, { mtime: ZIP_TIME });
  if (archive.byteLength > 100_000_000) throw new LearnerPackageError("The lesson package is too large");
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
  /** Verified final-audio mouth motion; absent for legacy packages or changed words. */
  mouthTrack(beatId: string, text: string): LipSyncTrack | null;
}

const AUDIO_TYPES = new Set(["audio/mpeg", "audio/wav", "audio/ogg", "audio/mp4"]);
const HASH = /^[a-f0-9]{64}$/;
function decodeManifest(raw: unknown): LearnerPackageManifest {
  const fail = (): never => { throw new LearnerPackageError("Invalid lesson package manifest"); };
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return fail();
  const value = raw as LearnerPackageManifest;
  if (![LEARNER_PACKAGE_SCHEMA, LEARNER_MOUTH_PACKAGE_SCHEMA].includes(value.schema)) throw new LearnerPackageError("This lesson package needs a newer app");
  if (![value.lessonId, value.title, value.language, value.createdAt, value.lesson].every((text) => typeof text === "string" && text.length > 0)
    || !value.author || ![value.author.learner_ref, value.author.avatar_ref, value.author.voice_ref].every((text) => typeof text === "string" && text.length > 0)
    || !Array.isArray(value.files) || !value.files.length || value.files.length > 512 || !Array.isArray(value.ink) || !Array.isArray(value.narration)
    || !HASH.test(value.contentSha256)) return fail();
  const animated = value.schema === LEARNER_MOUTH_PACKAGE_SCHEMA;
  if (animated) {
    if (!Array.isArray(value.requiredCapabilities) || value.requiredCapabilities.length !== 1 || value.requiredCapabilities[0] !== "avatar-lip-sync-v1"
      || !Array.isArray(value.lipSync) || value.lipSync.length !== value.narration.length || !value.lipSync.length) return fail();
  } else if (value.lipSync !== undefined || value.requiredCapabilities !== undefined) return fail();
  const paths = new Set<string>();
  for (const file of value.files) {
    if (!file || typeof file.path !== "string" || !/^[a-zA-Z0-9_./-]+$/.test(file.path) || file.path.split("/").some((part) => !part || part === "." || part === "..")
      || paths.has(file.path) || !HASH.test(file.sha256) || !Number.isSafeInteger(file.bytes) || file.bytes <= 0 || file.bytes > 25_000_000
      || !["lesson", "ink", "narration", ...(animated ? ["lip-sync"] : [])].includes(file.role) || typeof file.mediaType !== "string") return fail();
    paths.add(file.path);
  }
  const referenced = new Set<string>();
  const reference = (path: string, role: LearnerPackageFile["role"], mediaType?: string) => {
    const file = value.files.find((entry) => entry.path === path);
    if (!file || file.role !== role || (mediaType && file.mediaType !== mediaType) || referenced.has(path)) return fail();
    referenced.add(path); return file;
  };
  reference(value.lesson, "lesson", "application/x-ndjson");
  const snapshots = new Set<string>(), beats = new Set<string>();
  for (const entry of value.ink) {
    if (!entry || typeof entry.snapshotId !== "string" || snapshots.has(entry.snapshotId) || !Number.isFinite(entry.width) || entry.width <= 0 || !Number.isFinite(entry.height) || entry.height <= 0
      || !entry.regions || typeof entry.regions !== "object" || Array.isArray(entry.regions)) return fail();
    snapshots.add(entry.snapshotId); reference(entry.file, "ink", "image/svg+xml");
  }
  for (const entry of value.narration) {
    if (!entry || typeof entry.beatId !== "string" || beats.has(entry.beatId) || !HASH.test(entry.textSha256) || !Number.isFinite(entry.durationMs) || entry.durationMs <= 0) return fail();
    beats.add(entry.beatId);
    if (!AUDIO_TYPES.has(reference(entry.file, "narration").mediaType)) return fail();
  }
  const mouths = new Set<string>();
  for (const entry of value.lipSync ?? []) {
    if (!entry || !beats.has(entry.beatId) || mouths.has(entry.beatId) || !HASH.test(entry.audioSha256) || !HASH.test(entry.textSha256)) return fail();
    mouths.add(entry.beatId); reference(entry.file, "lip-sync", "application/json");
  }
  if (referenced.size !== paths.size) return fail();
  return value;
}

/** Opens a package, refusing it unless every file matches the manifest's hashes. */
export async function readLearnerPackage(archive: ArrayBuffer | Uint8Array): Promise<LoadedLearnerPackage> {
  let files: Record<string, Uint8Array>;
  try {
    let count = 0, total = 0;
    const names = new Set<string>();
    const bytes = archive instanceof Uint8Array ? archive : new Uint8Array(archive);
    if (bytes.byteLength > 100_000_000) throw new LearnerPackageError("The lesson package is too large");
    files = unzipSync(bytes, { filter(file) {
      count++; total += file.originalSize;
      if (names.has(file.name)) throw new LearnerPackageError("The lesson package has duplicate file names");
      names.add(file.name);
      if (count > 513 || file.originalSize > 25_000_000 || total > 100_000_000) throw new LearnerPackageError("The lesson package is too large");
      return true;
    } });
  } catch (error) {
    if (error instanceof LearnerPackageError) throw error;
    throw new LearnerPackageError("This is not a lesson package");
  }
  const manifestBytes = files["manifest.json"];
  if (!manifestBytes) throw new LearnerPackageError("The package has no manifest");
  let manifest: LearnerPackageManifest;
  try { manifest = decodeManifest(JSON.parse(new TextDecoder().decode(manifestBytes))); }
  catch (error) { if (error instanceof LearnerPackageError) throw error; throw new LearnerPackageError("Invalid lesson package manifest"); }
  const listed = new Set(manifest.files.map((file) => file.path));
  if (Object.keys(files).some((path) => path !== "manifest.json" && !listed.has(path))) throw new LearnerPackageError("The package holds files its manifest does not list");
  for (const file of manifest.files) {
    const data = files[file.path];
    if (!data || data.byteLength !== file.bytes || await sha256(data) !== file.sha256) throw new LearnerPackageError(`${file.path} does not match the package manifest`);
  }
  if (await listDigest(manifest.files) !== manifest.contentSha256) throw new LearnerPackageError("The package content hash does not match");
  const source = new TextDecoder().decode(files[manifest.lesson]!);
  const events = source.split("\n").filter(Boolean).map((line) => JSON.parse(line) as CanonicalEvent);
  const lines = lessonNarration(events);
  const expectedAuthor = author(events);
  if (lines.length !== manifest.narration.length || new Set(lines.map((line) => line.beatId)).size !== lines.length
    || (Object.keys(expectedAuthor) as Array<keyof typeof expectedAuthor>).some((key) => expectedAuthor[key] !== manifest.author[key])) throw new LearnerPackageError("The package metadata does not match its lesson");
  for (const line of lines) {
    const entry = manifest.narration.find((entry) => entry.beatId === line.beatId);
    if (!entry || entry.textSha256 !== await sha256(line.text)) throw new LearnerPackageError("The package narration does not match its lesson");
  }
  const mouths = new Map<string, { text: string; track: LipSyncTrack }>();
  for (const entry of manifest.lipSync ?? []) {
    const narration = manifest.narration.find((clip) => clip.beatId === entry.beatId)!;
    if (entry.textSha256 !== narration.textSha256 || entry.audioSha256 !== await sha256(files[narration.file]!)) throw new LearnerPackageError("The mouth track does not match its narration");
    try {
      const track = parseLipSyncTrack(JSON.parse(new TextDecoder().decode(files[entry.file]!)), { audioSha256: entry.audioSha256, durationMs: narration.durationMs });
      mouths.set(entry.beatId, { text: lines.find((line) => line.beatId === entry.beatId)!.text, track });
    } catch { throw new LearnerPackageError("The package has an invalid mouth track"); }
  }
  const snapshots = Object.fromEntries(manifest.ink.map((entry) => [entry.snapshotId, {
    svg: new TextDecoder().decode(files[entry.file]!), width: entry.width, height: entry.height, regions: entry.regions,
  } satisfies StoredInkSnapshot]));
  const clips = new Map(manifest.narration.map((entry) => [entry.beatId, entry]));
  return {
    manifest, events, source, resolveAsset: inkSnapshotResolver(snapshots),
    async narration(beatId, text) {
      const entry = clips.get(beatId);
      if (!entry || entry.textSha256 !== await sha256(text.trim())) return null;
      return new Blob([files[entry.file]! as BlobPart], { type: manifest.files.find((file) => file.path === entry.file)!.mediaType });
    },
    mouthTrack(beatId, text) {
      const value = mouths.get(beatId);
      return value?.text === text.trim() ? structuredClone(value.track) : null;
    },
  };
}
