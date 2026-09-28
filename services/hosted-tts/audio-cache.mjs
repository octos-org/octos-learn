import { createHash, randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import {
  readdir,
  readFile,
  rename,
  rm,
  stat,
  utimes,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";

const CACHE_FORMAT_VERSION = 1;
const CACHE_KEY_PATTERN = /^[a-f0-9]{64}$/u;
// Startup sweep stats this many files per thread-pool round so a large
// leftover directory rebuilds its ledger without long serial waits.
const SWEEP_STAT_BATCH = 32;

function stableJson(value) {
  if (Array.isArray(value)) return value.map(stableJson);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, stableJson(child)]),
  );
}

function profileConfig(profile) {
  return profile?.profile?.config || profile?.config || {};
}

/**
 * Build a private, deterministic cache key without exposing narration text or
 * profile configuration in the on-disk filename.
 */
export function synthesisCacheKey({ profileId, profile, platform, text }) {
  const config = profileConfig(profile);
  const voiceScope = platform
    ? {
        source: "platform",
        appid: platform.appid,
        cluster: platform.cluster,
        encoding: platform.encoding,
        endpoint: platform.endpoint,
        speed: 1,
        voice: platform.voice,
      }
    : {
        source: "personal",
        provider: config.tts_provider ?? null,
        cloud: config.tts_cloud ?? null,
      };
  return createHash("sha256").update(JSON.stringify(stableJson({
    version: CACHE_FORMAT_VERSION,
    profileId,
    text,
    voiceScope,
  }))).digest("hex");
}

export class PersistentAudioCache {
  constructor(directory, {
    maxBytes = 2 * 1024 * 1024 * 1024,
    maxEntries = 10_000,
    now = () => Date.now(),
  } = {}) {
    this.directory = directory;
    this.maxBytes = maxBytes;
    this.maxEntries = maxEntries;
    this.now = now;
    // key -> { bytes, touchedAt } for every cache file on disk; null until the
    // startup sweep has walked the directory once.
    this.entries = null;
    this.totalBytes = 0;
    this.sweeping = null;
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    // Startup sweep: seeds the ledger so steady-state evictions never need to
    // rescan the directory. A failure stays pending on this.ready — marking
    // it handled here only keeps an idle process from crashing on it; the
    // next put() rebuilds the ledger on demand.
    this.ready = this.trim();
    this.ready.catch(() => {});
  }

  paths(key) {
    if (!CACHE_KEY_PATTERN.test(key)) throw new Error("invalid TTS cache key");
    return {
      audio: join(this.directory, `${key}.audio`),
      metadata: join(this.directory, `${key}.json`),
    };
  }

  async get(key) {
    const paths = this.paths(key);
    try {
      const metadataRaw = await readFile(paths.metadata, "utf8");
      const metadata = JSON.parse(metadataRaw);
      const bytes = await readFile(paths.audio);
      if (
        metadata.version !== CACHE_FORMAT_VERSION
        || typeof metadata.contentType !== "string"
        || !metadata.contentType
        || (metadata.source !== "platform" && metadata.source !== "personal")
        || metadata.size !== bytes.length
        || bytes.length === 0
      ) {
        throw new Error("invalid cached audio");
      }
      const accessedAt = new Date(this.now());
      try {
        await utimes(paths.audio, accessedAt, accessedAt);
        await utimes(paths.metadata, accessedAt, accessedAt);
      } catch {
        // Best-effort touch: the bytes are already read and valid, so a
        // racing eviction removing the files must not turn a hit into a miss.
      }
      // Eviction ranks by this ledger entry, not by on-disk mtimes, so a read
      // must refresh it the same way the utimes above refresh the disk.
      const entry = this.entries?.get(key);
      if (entry) {
        entry.touchedAt = accessedAt;
      } else if (this.entries) {
        // A valid pair the ledger missed (put interrupted before remember(),
        // or an evict that failed after unaccounting) would otherwise stay
        // invisible to the byte limit forever — re-account it on this hit.
        const entryBytes = bytes.length + Buffer.byteLength(metadataRaw);
        this.entries.set(key, { bytes: entryBytes, touchedAt: accessedAt });
        this.totalBytes += entryBytes;
      }
      return {
        bytes,
        contentType: metadata.contentType,
        source: metadata.source,
      };
    } catch {
      await this.remove(paths);
      this.forget(key);
      return null;
    }
  }

  async put(key, value) {
    if (!Buffer.isBuffer(value?.bytes) || value.bytes.length === 0) {
      throw new Error("cannot cache empty TTS audio");
    }
    const paths = this.paths(key);
    const suffix = `${process.pid}-${randomUUID()}.part`;
    const partialAudio = `${paths.audio}.${suffix}`;
    const partialMetadata = `${paths.metadata}.${suffix}`;
    const metadataJson = JSON.stringify({
      version: CACHE_FORMAT_VERSION,
      contentType: value.contentType,
      source: value.source,
      size: value.bytes.length,
    });
    try {
      await writeFile(partialAudio, value.bytes, { mode: 0o600 });
      await writeFile(partialMetadata, metadataJson, { mode: 0o600 });
      await rename(partialAudio, paths.audio);
      await rename(partialMetadata, paths.metadata);
      const writtenAt = new Date(this.now());
      await utimes(paths.audio, writtenAt, writtenAt);
      await utimes(paths.metadata, writtenAt, writtenAt);
      // A failed startup sweep keeps this.entries null, so the next put
      // rebuilds the ledger instead of inheriting the failure forever.
      if (!this.entries) await this.trim();
      this.remember(key, value.bytes.length + Buffer.byteLength(metadataJson), writtenAt);
      if (this.entries.size > this.maxEntries || this.totalBytes > this.maxBytes) {
        await this.trim();
      }
    } finally {
      await rm(partialAudio, { force: true });
      await rm(partialMetadata, { force: true });
    }
  }

  async remove(paths) {
    await rm(paths.audio, { force: true });
    await rm(paths.metadata, { force: true });
  }

  forget(key) {
    const entry = this.entries?.get(key);
    if (entry) {
      this.entries.delete(key);
      this.totalBytes -= entry.bytes;
    }
  }

  remember(key, bytes, touchedAt) {
    this.forget(key);
    this.entries.set(key, { bytes, touchedAt });
    this.totalBytes += bytes;
  }

  trim() {
    // Evictions serialize behind each other; a caller arriving mid-trim just
    // joins the running one instead of starting a second pass.
    if (!this.sweeping) {
      this.sweeping = (this.entries ? this.evict() : this.sweepDirectory()).finally(() => {
        this.sweeping = null;
      });
    }
    return this.sweeping;
  }

  // Rebuilds the in-memory ledger from disk, then trims. Only the startup
  // trim needs this walk; later evictions work from the ledger alone.
  async sweepDirectory() {
    const filenames = await readdir(this.directory);
    const entries = new Map();
    let totalBytes = 0;
    for (let index = 0; index < filenames.length; index += SWEEP_STAT_BATCH) {
      const batch = filenames.slice(index, index + SWEEP_STAT_BATCH);
      const stats = await Promise.all(batch.map(async (filename) => {
        if (!filename.endsWith(".json")) return null;
        const key = filename.slice(0, -5);
        if (!CACHE_KEY_PATTERN.test(key)) return null;
        const paths = this.paths(key);
        try {
          const metadata = await stat(paths.metadata);
          const audio = await stat(paths.audio);
          return { key, bytes: audio.size + metadata.size, touchedAt: audio.mtimeMs };
        } catch {
          // Unlike the synchronous version, this walk runs concurrently with
          // puts, and a half-written pair (audio renamed, metadata not yet)
          // is indistinguishable from crash leftovers — deleting it could
          // destroy a just-written entry. Leave it unaccounted; a get() of
          // that key reconciles (and removes) it later.
          return null;
        }
      }));
      for (const entry of stats) {
        if (!entry) continue;
        entries.set(entry.key, { bytes: entry.bytes, touchedAt: entry.touchedAt });
        totalBytes += entry.bytes;
      }
    }
    this.entries = entries;
    this.totalBytes = totalBytes;
    await this.evict();
  }

  // Evicts least recently touched entries until the limits hold again. Pure
  // ledger bookkeeping plus unlinks — no directory rescan on the request path.
  async evict() {
    const entries = this.entries;
    const oldest = [...entries].sort(([, left], [, right]) => left.touchedAt - right.touchedAt);
    for (const [key, entry] of oldest) {
      if (entries.size <= this.maxEntries && this.totalBytes <= this.maxBytes) break;
      // A racing get() may have dropped this entry from the ledger while the
      // snapshot was being walked; its bytes are already accounted for.
      if (entries.get(key) !== entry) continue;
      entries.delete(key);
      this.totalBytes -= entry.bytes;
      await this.remove(this.paths(key));
    }
    // Puts that remembered themselves while this snapshot was being walked
    // are not in it — take a fresh snapshot rather than stopping over-limit.
    if (entries.size > this.maxEntries || this.totalBytes > this.maxBytes) {
      return this.evict();
    }
  }
}
