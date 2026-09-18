#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadCoursePackArchive } from "octos-course-library/browser";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const lockPath = process.env.OCTOS_EMBEDDED_PACKS_JSON?.trim()
  || join(root, "android", "embedded-course-packs.json");

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function printUsage() {
  console.log(`用法:
  node scripts/pin-embedded-course.mjs --archive <path/to/course.ocpack>
  node scripts/pin-embedded-course.mjs <packId> [version] [--source <origin>]

示例:
  node scripts/pin-embedded-course.mjs --archive /tmp/my-course-0.1.0.ocpack
  node scripts/pin-embedded-course.mjs rectangle-area-from-tiles 0.1.5
`);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    printUsage();
    process.exit(0);
  }

  let archiveBytes;
  const archiveIndex = args.indexOf("--archive");
  let targetPackId = "";
  let targetVersion = "";

  const lock = JSON.parse(readFileSync(lockPath, "utf8"));
  let sourceOrigin = new URL(lock.sourceOrigin || "https://learn.pitun.cc");
  const sourceIndex = args.indexOf("--source");
  if (sourceIndex >= 0 && args[sourceIndex + 1]) {
    sourceOrigin = new URL(args[sourceIndex + 1]);
  }

  if (archiveIndex >= 0) {
    const archivePath = resolve(args[archiveIndex + 1]);
    console.log(`[pin-embedded] 读取本地归档: ${archivePath}`);
    archiveBytes = new Uint8Array(readFileSync(archivePath));
  } else {
    targetPackId = args[0];
    targetVersion = args[1] && !args[1].startsWith("--") ? args[1] : "";

    if (!targetVersion) {
      // Fetch public catalog to discover recommended version
      console.log(`[pin-embedded] 从 ${sourceOrigin.origin} 查找 ${targetPackId} 最新版本...`);
      const catRes = await fetch(new URL("/api/learn/course-packs", sourceOrigin));
      if (!catRes.ok) throw new Error(`无法获取公开目录: HTTP ${catRes.status}`);
      const cat = await catRes.json();
      const match = cat.packs?.find((p) => p.packId === targetPackId && p.recommended)
        || cat.packs?.find((p) => p.packId === targetPackId);
      if (!match) throw new Error(`公开目录中未找到课程: ${targetPackId}`);
      targetVersion = match.version;
    }

    const archiveUrl = new URL(
      `/api/learn/course-packs/${targetPackId}/${targetVersion}/archive.ocpack`,
      sourceOrigin,
    );
    console.log(`[pin-embedded] 从 ${archiveUrl} 下载归档...`);
    const res = await fetch(archiveUrl);
    if (!res.ok) throw new Error(`下载失败: HTTP ${res.status}`);
    archiveBytes = new Uint8Array(await res.arrayBuffer());
  }

  const digest = sha256(archiveBytes);
  const length = archiveBytes.byteLength;
  const pack = await loadCoursePackArchive(archiveBytes);

  console.log(`[pin-embedded] 校验通过: ${pack.manifest.packId}@${pack.manifest.version}`);
  console.log(`  标题: ${pack.manifest.title}`);
  console.log(`  大小: ${length} 字节`);
  console.log(`  SHA-256: ${digest}`);

  if (!pack.manifest.capabilities?.offlinePlayback || !pack.manifest.capabilities?.offlineNarration) {
    console.warn(`[警告] 课程 ${pack.manifest.packId} 缺少离线播放或离线旁白能力，可能无法全离线运行！`);
  }

  // Update lockfile
  const existingIndex = lock.packs.findIndex((p) => p.packId === pack.manifest.packId);
  const newEntry = {
    packId: pack.manifest.packId,
    version: pack.manifest.version,
    archiveBytes: length,
    archiveSha256: digest,
  };

  if (existingIndex >= 0) {
    lock.packs[existingIndex] = newEntry;
    console.log(`[pin-embedded] 已更新现有课程: ${pack.manifest.packId}@${pack.manifest.version}`);
  } else {
    lock.packs.push(newEntry);
    console.log(`[pin-embedded] 已追加新课程: ${pack.manifest.packId}@${pack.manifest.version}`);
  }

  lock.generatedAt = new Date().toISOString();
  writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`);
  console.log(`[pin-embedded] 已保存到 ${lockPath}`);
}

main().catch((err) => {
  console.error(`[pin-embedded 错误]`, err.message);
  process.exit(1);
});
