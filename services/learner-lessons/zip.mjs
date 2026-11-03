import { inflateRawSync } from "node:zlib";

// A small, strict zip reader for learner lesson packages: stored or deflated
// entries listed in the central directory, no zip64, no encryption, no
// duplicate or escaping names. Anything else is refused, never guessed at.
export class ZipError extends Error {}
const fail = message => { throw new ZipError(message); };

export function readZip(buffer, { maxEntries = 512, maxBytes = 64 * 1024 * 1024 } = {}) {
  const view = buffer;
  let end = -1;
  for (let at = view.length - 22; at >= Math.max(0, view.length - 22 - 65535); at--) {
    if (view.readUInt32LE(at) === 0x06054b50) { end = at; break; }
  }
  if (end < 0) fail("Not a zip archive");
  const count = view.readUInt16LE(end + 10), directorySize = view.readUInt32LE(end + 12), directoryAt = view.readUInt32LE(end + 16);
  if (count === 0xffff || directoryAt === 0xffffffff || count > maxEntries) fail("Unsupported zip archive");
  if (directoryAt + directorySize > end) fail("Damaged zip directory");
  const files = new Map();
  let total = 0;
  for (let index = 0, at = directoryAt; index < count; index++) {
    if (at + 46 > end || view.readUInt32LE(at) !== 0x02014b50) fail("Damaged zip directory");
    const flags = view.readUInt16LE(at + 8), method = view.readUInt16LE(at + 10);
    const compressed = view.readUInt32LE(at + 20), size = view.readUInt32LE(at + 24);
    const nameLength = view.readUInt16LE(at + 28), extraLength = view.readUInt16LE(at + 30), commentLength = view.readUInt16LE(at + 32);
    const localAt = view.readUInt32LE(at + 42);
    const name = view.subarray(at + 46, at + 46 + nameLength).toString("utf8");
    at += 46 + nameLength + extraLength + commentLength;
    if (flags & 1) fail("Encrypted zip entries are not accepted");
    if (![0, 8].includes(method)) fail("Unsupported zip compression");
    if (!name || name.startsWith("/") || name.includes("\\") || name.split("/").some(part => part === ".." || part === "." || !part)) fail("Unsafe zip entry name");
    if (files.has(name)) fail("Duplicate zip entry");
    total += size;
    if (total > maxBytes) fail("Zip archive too large");
    if (localAt + 30 > directoryAt || view.readUInt32LE(localAt) !== 0x04034b50) fail("Damaged zip entry");
    const dataAt = localAt + 30 + view.readUInt16LE(localAt + 26) + view.readUInt16LE(localAt + 28);
    if (dataAt + compressed > directoryAt) fail("Damaged zip entry");
    const raw = view.subarray(dataAt, dataAt + compressed);
    let data;
    try { data = method === 0 ? Buffer.from(raw) : inflateRawSync(raw, { maxOutputLength: Math.max(1, size) }); }
    catch { fail("Damaged zip entry"); }
    if (data.length !== size) fail("Zip entry size does not match");
    files.set(name, data);
  }
  return files;
}
