import { DatabaseSync, backup } from "node:sqlite";
import { mkdir, open, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

/** SQLite's backup API includes committed WAL data. Never overwrite an
 * existing destination: restore is a separate, explicit maintenance action.
 */
export async function backupHistoryDatabase(source, destination) {
  if (resolve(source) === resolve(destination)) throw new Error("Backup must use a different destination");
  const db = new DatabaseSync(source, { readOnly: true });
  let created = false;
  try {
    await mkdir(dirname(destination), { recursive: true, mode: 0o700 });
    const file = await open(destination, "wx", 0o600);
    created = true;
    await file.close();
    await backup(db, destination);
  } catch (error) {
    if (created) await rm(destination, { force: true });
    throw error;
  } finally { db.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [source, destination, ...extra] = process.argv.slice(2);
  if (!source || !destination || extra.length) {
    console.error("Usage: node backup.mjs <source.sqlite> <new-backup.sqlite>");
    process.exitCode = 1;
  } else {
    try { await backupHistoryDatabase(source, destination); console.log("Learning history snapshot created."); }
    catch { console.error("History backup failed; verify paths and permissions."); process.exitCode = 1; }
  }
}
