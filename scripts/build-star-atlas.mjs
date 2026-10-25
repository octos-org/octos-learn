#!/usr/bin/env node
// Lays out the star atlas once, from the pinned taxonomy, so devices (large
// TVs included) never run a force layout. Mathematics only for now: three
// academy rings by the catalog's starting age, one sector per domain, hard
// prerequisites as springs inside a domain. Deterministic: same catalog, same
// sky. Writes src/learning/map/star-atlas/atlas.json.
import { readFileSync, writeFileSync } from "node:fs";

const taxonomy = new URL("../services/learning-history/taxonomy/", import.meta.url);
const metadata = JSON.parse(readFileSync(new URL("metadata.json", taxonomy), "utf8"));
const { topics } = JSON.parse(readFileSync(new URL("catalog.json", taxonomy), "utf8"));
const { dependencies } = JSON.parse(readFileSync(new URL("dependencies.json", taxonomy), "utf8"));

const SUBJECT = "Mathematics";
// 启明 (primary), 星辉 (middle), 星穹 (high): ring radius in atlas units.
const RINGS = [230, 470, 640];
const band = topic => Number(topic.ageRangeStart) <= 9 ? 0 : Number(topic.ageRangeStart) <= 12 ? 1 : 2;

const math = topics.filter(topic => topic.subject === SUBJECT).sort((a, b) => a.id.localeCompare(b.id));
const domains = [...new Set(math.map(topic => topic.domain))].sort();
const index = new Map(math.map((topic, i) => [topic.id, i]));
const edges = dependencies
  .filter(edge => edge.strength === "hard" && index.has(edge.prerequisiteId) && index.has(edge.topicId))
  .map(edge => [index.get(edge.prerequisiteId), index.get(edge.topicId)]);

// A stable pseudo-random value per topic, so the layout never depends on run order.
const unit = (text, salt) => {
  let h = 2166136261 ^ salt;
  for (const char of text) h = Math.imul(h ^ char.charCodeAt(0), 16777619);
  return ((h >>> 0) % 10000) / 10000;
};
const nodes = math.map(topic => {
  const ring = band(topic), d = domains.indexOf(topic.domain);
  const angle = (d + 0.15 + 0.7 * unit(topic.id, 1)) / domains.length * Math.PI * 2 - Math.PI / 2;
  const radius = RINGS[ring] * (ring === 0 ? 0.35 + 0.65 * unit(topic.id, 2) : 0.86 + 0.14 * unit(topic.id, 2));
  const tx = Math.cos(angle) * radius, ty = Math.sin(angle) * radius;
  return { tx, ty, x: tx, y: ty, domain: d };
});

for (let step = 0; step < 320; step++) {
  const cool = 1 - step / 320;
  for (const n of nodes) { n.x += (n.tx - n.x) * 0.06; n.y += (n.ty - n.y) * 0.06; }
  for (const [a, b] of edges) {
    const p = nodes[a], q = nodes[b];
    if (p.domain !== q.domain) continue;
    const dx = q.x - p.x, dy = q.y - p.y, dist = Math.hypot(dx, dy) || 1, pull = (dist - 26) / dist * 0.03 * cool;
    p.x += dx * pull; p.y += dy * pull; q.x -= dx * pull; q.y -= dy * pull;
  }
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const p = nodes[i], q = nodes[j], dx = q.x - p.x, dy = q.y - p.y, dist = Math.hypot(dx, dy) || 0.01;
      if (dist > 40) continue;
      const push = dist < 13 ? (13 - dist) / dist * 0.5 : (40 - dist) / dist * 0.012 * cool;
      p.x -= dx * push; p.y -= dy * push; q.x += dx * push; q.y += dy * push;
    }
  }
}

const atlas = {
  // Recorded so a changed catalog is noticed rather than silently mislaid.
  catalog_sha256: metadata.catalog_sha256,
  subject: SUBJECT,
  rings: RINGS,
  domains,
  topics: math.map((topic, i) => [topic.id, nodes[i].domain, band(topic), Math.round(nodes[i].x), Math.round(nodes[i].y)]),
  edges,
};
writeFileSync(new URL("../src/learning/map/star-atlas/atlas.json", import.meta.url), `${JSON.stringify(atlas)}\n`);
console.log(`star atlas: ${math.length} topics, ${domains.length} domains, ${edges.length} prerequisite links`);
