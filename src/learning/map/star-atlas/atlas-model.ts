import type { LearningMapTopic, MapState } from "../../history/history-api";
import atlasJson from "./atlas.json";

/** One star per catalog topic, laid out once by scripts/build-star-atlas.mjs. */
export interface AtlasStar { id: string; domain: number; ring: number; x: number; y: number }
export interface Atlas {
  rings: number[];
  domains: string[];
  stars: AtlasStar[];
  edges: [number, number][];
  prerequisites: number[][];
  leadsTo: number[][];
  byId: Map<string, number>;
  domainCenters: { x: number; y: number; size: number }[];
}

export function buildAtlas(source: { rings: number[]; domains: string[]; topics: (string | number)[][]; edges: number[][] } = atlasJson): Atlas {
  const stars = source.topics.map(([id, domain, ring, x, y]) => ({ id: String(id), domain: Number(domain), ring: Number(ring), x: Number(x), y: Number(y) }));
  const edges = source.edges.map(([a, b]) => [a, b] as [number, number]);
  const prerequisites = stars.map(() => [] as number[]), leadsTo = stars.map(() => [] as number[]);
  for (const [a, b] of edges) { prerequisites[b].push(a); leadsTo[a].push(b); }
  const domainCenters = source.domains.map((_, d) => {
    const members = stars.filter(star => star.domain === d);
    return { x: members.reduce((sum, s) => sum + s.x, 0) / members.length, y: members.reduce((sum, s) => sum + s.y, 0) / members.length, size: members.length };
  });
  return { rings: source.rings, domains: source.domains, stars, edges, prerequisites, leadsTo, byId: new Map(stars.map((s, i) => [s.id, i])), domainCenters };
}

export const STAR_LEVEL: Record<MapState, 1 | 2 | 3> = { explored: 1, practising: 2, "did-it": 3 };

/** The learner's stars on this atlas. Topics outside it (other subjects)
 * are returned separately so the page can still list them. */
export function placeTopics(atlas: Atlas, topics: LearningMapTopic[]) {
  const lit = new Map<number, LearningMapTopic>();
  const elsewhere: LearningMapTopic[] = [];
  for (const topic of topics) {
    const index = atlas.byId.get(topic.topic_id);
    if (index === undefined) elsewhere.push(topic); else lit.set(index, topic);
  }
  // The mist thins only next to a star the learner has been to.
  const near = new Set<number>();
  for (const index of lit.keys()) for (const other of [...atlas.prerequisites[index], ...atlas.leadsTo[index]]) if (!lit.has(other)) near.add(other);
  return { lit, near, elsewhere };
}

/** A star's frame grows with the number of different days it was practised:
 * one ring from two days, a turning ring from three, a full frame from five. */
export function frameLevel(topic: LearningMapTopic | undefined): 0 | 1 | 2 | 3 {
  if (!topic || topic.state !== "did-it") return 0;
  const days = topic.evidence.days.length;
  return days >= 5 ? 3 : days >= 3 ? 2 : days >= 2 ? 1 : 0;
}

export interface View { x: number; y: number; k: number }
/** The view that frames the given stars (all of them when empty) in a w×h box. */
export function fitView(atlas: Atlas, indices: number[], w: number, h: number, pad = 140): View {
  const stars = indices.length ? indices.map(i => atlas.stars[i]) : atlas.stars;
  const xs = stars.map(s => s.x), ys = stars.map(s => s.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const k = Math.max(0.3, Math.min(2.6, Math.min(w / (maxX - minX + pad * 2), h / (maxY - minY + pad * 2))));
  return { x: -(minX + maxX) / 2, y: -(minY + maxY) / 2, k };
}
