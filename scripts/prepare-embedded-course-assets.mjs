// Prepares locked CoursePack archives for offline local-first playback in APK builds.

import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadCoursePackArchive } from "octos-course-library/browser";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const lockPath = process.env.OCTOS_EMBEDDED_PACKS_JSON?.trim()
  || join(root, "android", "embedded-course-packs.json");
const outputRoot = join(root, "public", "course-packs", "embedded");

if (!existsSync(lockPath)) {
  console.log(`[prepare-embedded] no lock file at ${lockPath}, skipping embedded course assets`);
  rmSync(outputRoot, { recursive: true, force: true });
  process.exit(0);
}

const lock = JSON.parse(readFileSync(lockPath, "utf8"));
const identity = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u;
const version = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/u;
const digest = /^[a-f0-9]{64}$/u;

if (lock.schemaVersion !== 1 || typeof lock.snapshotId !== "string"
  || typeof lock.generatedAt !== "string" || !Array.isArray(lock.packs)) {
  throw new Error("Invalid embedded CoursePack lock file");
}
const sourceOrigin = new URL(lock.sourceOrigin);
if (sourceOrigin.protocol !== "https:" || sourceOrigin.pathname !== "/") {
  throw new Error("Embedded CoursePack source must be an HTTPS origin");
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function encodedPath(path) {
  return path.split("/").map(encodeURIComponent).join("/");
}

// Clean target directory before writing
rmSync(outputRoot, { recursive: true, force: true });

const entries = [];
for (const pinned of lock.packs) {
  if (!identity.test(pinned.packId) || !version.test(pinned.version)
    || !digest.test(pinned.archiveSha256)
    || !Number.isSafeInteger(pinned.archiveBytes) || pinned.archiveBytes <= 0) {
    throw new Error(`Invalid pinned CoursePack identity: ${JSON.stringify(pinned)}`);
  }
  const base = `/api/learn/course-packs/${pinned.packId}/${pinned.version}`;
  const cacheDir = join(root, "node_modules", ".cache", "course-packs");
  mkdirSync(cacheDir, { recursive: true });
  const cacheFile = join(cacheDir, `${pinned.packId}-${pinned.version}-${pinned.archiveSha256}.ocpack`);
  let archive;
  if (existsSync(cacheFile)) {
    const cachedBytes = readFileSync(cacheFile);
    if (cachedBytes.byteLength === pinned.archiveBytes && sha256(cachedBytes) === pinned.archiveSha256) {
      archive = new Uint8Array(cachedBytes);
    }
  }
  if (!archive) {
    const response = await fetch(new URL(`${base}/archive.ocpack`, sourceOrigin), {
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error(`Unable to download ${pinned.packId}@${pinned.version}: HTTP ${response.status}`);
    }
    archive = new Uint8Array(await response.arrayBuffer());
    if (archive.byteLength !== pinned.archiveBytes
      || sha256(archive) !== pinned.archiveSha256) {
      throw new Error(`Pinned archive changed: ${pinned.packId}@${pinned.version}`);
    }
    writeFileSync(cacheFile, archive);
  }
  const pack = await loadCoursePackArchive(archive);
  if (pack.manifest.packId !== pinned.packId
    || pack.manifest.version !== pinned.version
    || pack.archiveSha256 !== pinned.archiveSha256) {
    throw new Error(`Archive identity mismatch: ${pinned.packId}@${pinned.version}`);
  }
  if (!pack.manifest.capabilities.offlinePlayback
    || !pack.manifest.capabilities.offlineNarration
    || pack.manifest.narration.segments.length === 0) {
    throw new Error(`Embedded pack is not fully offline: ${pinned.packId}@${pinned.version}`);
  }
  for (const segment of pack.manifest.narration.segments) {
    if (!pack.files.get(segment.file)?.byteLength) {
      throw new Error(`Missing embedded narration: ${segment.beatId}`);
    }
  }

  const releaseDirectory = join(outputRoot, pinned.packId, pinned.version);
  mkdirSync(join(releaseDirectory, "files", dirname(pack.manifest.thumbnail)), {
    recursive: true,
  });
  writeFileSync(join(releaseDirectory, "archive.ocpack"), archive);
  writeFileSync(
    join(releaseDirectory, "files", pack.manifest.thumbnail),
    pack.files.get(pack.manifest.thumbnail),
  );
  entries.push({
    packId: pack.manifest.packId,
    version: pack.manifest.version,
    title: pack.manifest.title,
    description: pack.manifest.description,
    locale: pack.manifest.locale,
    subject: pack.manifest.subject,
    grade: pack.manifest.grade,
    durationSeconds: pack.manifest.durationSeconds,
    minimumPlayerVersion: pack.manifest.minimumPlayerVersion,
    capabilities: pack.manifest.capabilities,
    archiveSha256: pinned.archiveSha256,
    archiveBytes: pinned.archiveBytes,
    recommended: true,
    archiveUrl: `${base}/archive.ocpack`,
    manifestUrl: `${base}/manifest.json`,
    thumbnailUrl: `${base}/files/${encodedPath(pack.manifest.thumbnail)}`,
  });
  console.log(`[prepare-embedded] embedded ${pinned.packId}@${pinned.version}`);
}

mkdirSync(outputRoot, { recursive: true });
writeFileSync(join(outputRoot, "catalog.json"), `${JSON.stringify({
  schemaVersion: 1,
  generatedAt: lock.generatedAt,
  packs: entries,
}, null, 2)}\n`);
writeFileSync(join(outputRoot, "snapshot.json"), `${JSON.stringify(lock, null, 2)}\n`);
