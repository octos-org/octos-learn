import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

export const TOPIC_RULES_VERSION = "separate-question-beat-and-task-units-v3";
export const TOPIC_TAXONOMY = Object.freeze(JSON.parse(readFileSync(new URL("./taxonomy/metadata.json", import.meta.url), "utf8")));
let catalog, structure;
const words = text => String(text).toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];

export function topicCatalog() {
  if (catalog) return catalog;
  const bytes = readFileSync(new URL("./taxonomy/catalog.json", import.meta.url));
  if (createHash("sha256").update(bytes).digest("hex") !== TOPIC_TAXONOMY.catalog_sha256) throw new Error("Taxonomy catalog fingerprint mismatch");
  const { topics } = JSON.parse(bytes);
  if (!Array.isArray(topics) || topics.length !== TOPIC_TAXONOMY.topic_count || new Set(topics.map(t => t.id)).size !== topics.length) throw new Error("Invalid taxonomy catalog");
  const byId = new Map(topics.map(topic => [topic.id, Object.freeze({ ...topic, evidence: Object.freeze(topic.evidence) })]));
  catalog = {
    metadata: TOPIC_TAXONOMY,
    has: id => byId.has(id),
    read: ids => ids.map(id => byId.get(id)).filter(Boolean),
    // This is lexical retrieval, not semantic classification. The Octos
    // agent chooses English search terms; absence of a hit stays unknown.
    search(query, limit = 8) {
      if (typeof query !== "string" || query.length > 256 || !Number.isInteger(limit) || limit < 1 || limit > 12) throw new Error("Invalid topic search");
      const terms = [...new Set(words(query))];
      if (!terms.length) return [];
      return topics.map(topic => {
        const title = words(`${topic.name} ${topic.domain} ${topic.subject}`).join(" ");
        const body = words(`${topic.description} ${topic.evidence.join(" ")}`).join(" ");
        return { topic, score: terms.reduce((sum, term) => sum + (title.includes(term) ? 6 : 0) + (body.includes(term) ? 1 : 0), 0) };
      }).filter(row => row.score > 0).sort((a, b) => b.score - a.score || a.topic.id.localeCompare(b.topic.id)).slice(0, limit).map(row => row.topic);
    },
  };
  return catalog;
}

/** Prerequisite edges and domain clusters of the same pinned version. They
 * describe the curriculum, never a learner: a missing prerequisite record does
 * not mean the learner lacks it. */
export function topicStructure() {
  if (structure) return structure;
  const load = (file, fingerprint) => {
    const bytes = readFileSync(new URL(`./taxonomy/${file}`, import.meta.url));
    if (createHash("sha256").update(bytes).digest("hex") !== fingerprint) throw new Error(`Taxonomy ${file} fingerprint mismatch`);
    return JSON.parse(bytes);
  };
  const { dependencies } = load("dependencies.json", TOPIC_TAXONOMY.dependency_catalog_sha256);
  const { clusters } = load("clusters.json", TOPIC_TAXONOMY.cluster_catalog_sha256);
  const catalog = topicCatalog();
  if (dependencies.length !== TOPIC_TAXONOMY.dependency_count || clusters.length !== TOPIC_TAXONOMY.cluster_count
    || dependencies.some(edge => !catalog.has(edge.topicId) || !catalog.has(edge.prerequisiteId))) throw new Error("Invalid taxonomy structure");
  structure = Object.freeze({
    prerequisitesOf: id => dependencies.filter(edge => edge.topicId === id),
    clustersOf: (subject, domain) => clusters.filter(cluster => cluster.subject === subject && cluster.domain === domain),
  });
  return structure;
}

