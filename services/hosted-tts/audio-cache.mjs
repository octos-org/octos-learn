import { createHash, randomUUID } from "node:crypto";
import {
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

const CACHE_FORMAT_VERSION = 1;
const CACHE_KEY_PATTERN = /^[a-f0-9]{64}$/u;

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
    mkdirSync(directory, { recursive: true, mode: 0o700 });
  }

  paths(key) {
    if (!CACHE_KEY_PATTERN.test(key)) throw new Error("invalid TTS cache key");
    return {
      audio: join(this.directory, `${key}.audio`),
      metadata: join(this.directory, `${key}.json`),
    };
  }

  get(key) {
    const paths = this.paths(key);
    try {
      const metadata = JSON.parse(readFileSync(paths.metadata, "utf8"));
      const bytes = readFileSync(paths.audio);
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
      utimesSync(paths.audio, accessedAt, accessedAt);
      utimesSync(paths.metadata, accessedAt, accessedAt);
      return {
        bytes,
        contentType: metadata.contentType,
        source: metadata.source,
      };
    } catch {
      this.remove(paths);
      return null;
    }
  }

  put(key, value) {
    if (!Buffer.isBuffer(value?.bytes) || value.bytes.length === 0) {
      throw new Error("cannot cache empty TTS audio");
    }
    const paths = this.paths(key);
    const suffix = `${process.pid}-${randomUUID()}.part`;
    const partialAudio = `${paths.audio}.${suffix}`;
    const partialMetadata = `${paths.metadata}.${suffix}`;
    try {
      writeFileSync(partialAudio, value.bytes, { mode: 0o600 });
      writeFileSync(partialMetadata, JSON.stringify({
        version: CACHE_FORMAT_VERSION,
        contentType: value.contentType,
        source: value.source,
        size: value.bytes.length,
      }), { mode: 0o600 });
      renameSync(partialAudio, paths.audio);
      renameSync(partialMetadata, paths.metadata);
      const writtenAt = new Date(this.now());
      utimesSync(paths.audio, writtenAt, writtenAt);
      utimesSync(paths.metadata, writtenAt, writtenAt);
      this.trim();
    } finally {
      rmSync(partialAudio, { force: true });
      rmSync(partialMetadata, { force: true });
    }
  }

  remove(paths) {
    rmSync(paths.audio, { force: true });
    rmSync(paths.metadata, { force: true });
  }

  trim() {
    const entries = [];
    for (const filename of readdirSync(this.directory)) {
      if (!filename.endsWith(".json")) continue;
      const key = filename.slice(0, -5);
      if (!CACHE_KEY_PATTERN.test(key)) continue;
      const paths = this.paths(key);
      try {
        const audio = statSync(paths.audio);
        const metadata = statSync(paths.metadata);
        entries.push({ paths, bytes: audio.size + metadata.size, touchedAt: audio.mtimeMs });
      } catch {
        this.remove(paths);
      }
    }
    entries.sort((left, right) => left.touchedAt - right.touchedAt);
    let totalBytes = entries.reduce((total, entry) => total + entry.bytes, 0);
    let totalEntries = entries.length;
    for (const entry of entries) {
      if (totalEntries <= this.maxEntries && totalBytes <= this.maxBytes) break;
      this.remove(entry.paths);
      totalEntries -= 1;
      totalBytes -= entry.bytes;
    }
  }
}
