import { constants } from "node:fs";
import { open, mkdir, realpath, readdir, unlink, chmod, link } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join, resolve, relative, isAbsolute } from "node:path";
import { HistoryValidationError, canonicalHistoryJson } from "./event-contract.mjs";

export function validAnalysisControl(c) {
  return c && typeof c === "object" && !Array.isArray(c) && Object.keys(c).length === 6
    && /^learn-topic-[a-f0-9]{32}$/.test(c.host) && /^[a-z0-9-]{1,64}$/.test(c.peer)
    && c.session === `${c.host}#peer-${c.peer}` && typeof c.token === "string" && c.token.length > 0 && c.token.length <= 2048
    && typeof c.namespace === "string" && /^app\/learning-topics\/[a-z0-9-]{1,64}$/.test(c.namespace)
    && typeof c.turn === "string" && /^[a-f0-9-]{36}$/.test(c.turn);
}

/** The same capability shape for a single-use weekly-report comment peer. */
export function validReportControl(c) {
  return c && typeof c === "object" && !Array.isArray(c) && Object.keys(c).length === 6
    && /^learn-report-[a-f0-9]{32}$/.test(c.host) && /^[a-z0-9-]{1,64}$/.test(c.peer)
    && c.session === `${c.host}#peer-${c.peer}` && typeof c.token === "string" && c.token.length > 0 && c.token.length <= 2048
    && typeof c.namespace === "string" && /^app\/learning-reports\/[a-z0-9-]{1,64}$/.test(c.namespace)
    && typeof c.turn === "string" && /^[a-f0-9-]{36}$/.test(c.turn);
}

// This is the app host's Octos control capability, not a supplier API key or
// learning memory. Keep it in host-private files scoped to the authenticated
// Octos profile, outside agent workspaces and the facts database, so another owned device can
// reconcile or purge a job after the first device disappears. No environment
// values or LLM/speech keys are read or returned by this adapter.
export class AnalysisControlStore {
  constructor(directory, valid = validAnalysisControl) { this.root = resolve(directory); this.valid = valid; }
  async directory(owner, create = false) {
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(owner)) throw new HistoryValidationError("Invalid control owner");
    const directory = join(this.root, owner);
    if (create) {
      await mkdir(this.root, { recursive: true, mode: 0o700 });
      await chmod(this.root, 0o700);
      await mkdir(directory, { recursive: true, mode: 0o700 }); await chmod(directory, 0o700);
    }
    let actual;
    try { actual = await realpath(directory); } catch (error) { if (!create && error.code === "ENOENT") return null; throw error; }
    const base = await realpath(this.root), child = relative(base, actual);
    if (child !== owner || isAbsolute(child)) throw new Error("Analysis control directory escapes account scope");
    return actual;
  }
  async read(owner, id) {
    if (!/^[a-f0-9]{64}$/.test(id)) throw new HistoryValidationError("Invalid analysis control identifier");
    const directory = await this.directory(owner); if (!directory) return null;
    const file = await open(join(directory, `${id}.json`), constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    try {
      const stat = await file.stat();
      if (!stat.isFile() || stat.size > 8192 || (stat.mode & 0o077)) throw new Error("Unsafe analysis control file");
      const control = JSON.parse(await file.readFile("utf8"));
      if (!this.valid(control)) throw new Error("Invalid stored analysis control");
      return control;
    } finally { await file.close(); }
  }
  async list(owner) {
    const directory = await this.directory(owner); if (!directory) return [];
    const names = (await readdir(directory)).filter(name => /^[a-f0-9]{64}\.json$/.test(name));
    if (names.length > 1000) throw new Error("Too many unresolved analysis controls");
    const result = [];
    for (const name of names) {
      const id = name.slice(0, -5);
      try { result.push({ id, control: await this.read(owner, id) }); }
      catch (error) { if (error.code !== "ENOENT") throw error; }
    }
    return result;
  }
  async put(owner, id, control) {
    if (!/^[a-f0-9]{64}$/.test(id) || !this.valid(control)) throw new HistoryValidationError("Invalid analysis control");
    const directory = await this.directory(owner, true), content = canonicalHistoryJson(control);
    const temporary = join(directory, `.${id}-${randomUUID()}.tmp`);
    const file = await open(temporary, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
    try {
      try { await file.writeFile(content); await file.sync(); } finally { await file.close(); }
      try { await link(temporary, join(directory, `${id}.json`)); }
      catch (error) {
        if (error.code !== "EEXIST") throw error;
        if (canonicalHistoryJson(await this.read(owner, id)) !== content) throw new HistoryValidationError("Original analysis control retained; conflicting replacement refused");
      }
      const folder = await open(directory, constants.O_RDONLY);
      try { await folder.sync(); } finally { await folder.close(); }
    } finally { await unlink(temporary).catch(() => undefined); }
  }
  async remove(owner, id) {
    if (!/^[a-f0-9]{64}$/.test(id)) throw new HistoryValidationError("Invalid analysis control identifier");
    const directory = await this.directory(owner); if (!directory) return;
    try { await unlink(join(directory, `${id}.json`)); } catch (error) { if (error.code !== "ENOENT") throw error; }
  }
}
