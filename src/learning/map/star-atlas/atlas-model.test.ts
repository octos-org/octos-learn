import { expect, it } from 'vitest';
import type { LearningMapTopic } from '../../history/history-api';
import { buildAtlas, fitView, frameLevel, placeTopics } from './atlas-model';
import atlasJson from './atlas.json';
import metadata from '../../../../services/learning-history/taxonomy/metadata.json';

const atlas = buildAtlas();
const topic = (topic_id: string, state: LearningMapTopic['state'], days = 1): LearningMapTopic => ({ topic_id, subject: 'Mathematics', domain: 'Algebra', name: topic_id, state,
  evidence: { played_beats: 3, runs: 1, task_attempts: 1, unassisted_successes: state === 'did-it' ? 1 : 0, assisted_successes: 0, days: Array.from({ length: days }, (_, d) => `2026-10-${10 + d}`), first_at: null, last_at: null } });

it('is laid out from the pinned catalog: every mathematics topic once, prerequisites inside the atlas', () => {
  expect(atlasJson.catalog_sha256).toBe(metadata.catalog_sha256);
  expect(atlas.stars).toHaveLength(metadata.subjects.Mathematics);
  expect(new Set(atlas.stars.map(star => star.id)).size).toBe(atlas.stars.length);
  expect(atlas.edges.every(([a, b]) => atlas.stars[a] && atlas.stars[b] && a !== b)).toBe(true);
  expect(atlas.stars.every(star => [0, 1, 2].includes(star.ring) && Number.isFinite(star.x) && Number.isFinite(star.y))).toBe(true);
});

it('places lit topics, thins the mist only next to them, and keeps other subjects for the list', () => {
  const slope = atlas.stars.findIndex(star => star.id === 'mt_WBdHkc2HTf');
  const placed = placeTopics(atlas, [topic('mt_WBdHkc2HTf', 'did-it'), topic('sc_not_mathematics', 'explored')]);
  expect([...placed.lit.keys()]).toEqual([slope]);
  expect(placed.elsewhere.map(t => t.topic_id)).toEqual(['sc_not_mathematics']);
  expect([...placed.near].sort()).toEqual([...new Set([...atlas.prerequisites[slope], ...atlas.leadsTo[slope]])].sort());
  expect(placed.near.has(slope)).toBe(false);
});

it('grows a star frame only for a did-it star practised on different days', () => {
  expect(frameLevel(undefined)).toBe(0);
  expect(frameLevel(topic('a', 'practising', 6))).toBe(0);
  expect([1, 2, 3, 4, 5].map(days => frameLevel(topic('a', 'did-it', days)))).toEqual([0, 1, 2, 2, 3]);
});

it('frames the learner stars, or the whole sky when there are none', () => {
  const all = fitView(atlas, [], 1200, 800);
  const one = fitView(atlas, [0], 1200, 800);
  expect(one.k).toBeGreaterThan(all.k);
  expect(one.x).toBe(-atlas.stars[0].x); expect(one.y).toBe(-atlas.stars[0].y);
});
