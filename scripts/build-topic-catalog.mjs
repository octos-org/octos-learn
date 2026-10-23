// Rebuild the pinned os-taxonomy projection used by learning history:
// topics (all subjects), prerequisite dependencies and domain clusters.
//
//   node scripts/build-topic-catalog.mjs <data-dir> <commit-sha>
//
// <data-dir> holds topics.json, dependencies.json, clusters.json and
// manifest.json downloaded from data/ at exactly <commit-sha>. Each upstream
// file must match the manifest's sha256. Text is copied unchanged; curriculum
// standards, teaching research and assessment prompts are not included.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const [dataDir, commit] = process.argv.slice(2);
assert.ok(dataDir && /^[0-9a-f]{40}$/.test(commit ?? ''), 'Usage: build-topic-catalog.mjs <data-dir> <40-hex commit>');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const out = new URL('../services/learning-history/taxonomy/', import.meta.url);
const repository = 'https://github.com/withmarbleapp/os-taxonomy';

const manifest = JSON.parse(await readFile(join(dataDir, 'manifest.json'), 'utf8'));
const upstream = {};
for (const name of ['topics', 'dependencies', 'clusters']) {
  const bytes = await readFile(join(dataDir, `${name}.json`));
  assert.equal(sha256(bytes), manifest.files[`${name}.json`]?.sha256, `${name}.json does not match the manifest`);
  upstream[name] = { sha256: sha256(bytes), data: JSON.parse(bytes) };
}

const topics = upstream.topics.data.topics.map(topic => ({
  id: topic.id, subject: topic.subject, domain: topic.domain, type: topic.type,
  name: topic.name, description: topic.description, evidence: topic.evidence,
  ageRangeStart: topic.ageRangeStart, ageRangeEnd: topic.ageRangeEnd,
}));
assert.equal(topics.length, upstream.topics.data.topicCount);
const ids = new Set(topics.map(topic => topic.id));
assert.equal(ids.size, topics.length, 'Duplicate topic ids');
for (const topic of topics) {
  assert.ok(/^mt_[A-Za-z0-9_-]+$/.test(topic.id) && topic.subject && topic.domain && topic.name && Array.isArray(topic.evidence), `Invalid topic ${topic.id}`);
}

const dependencies = upstream.dependencies.data.dependencies.map(edge => ({
  topicId: edge.topicId, prerequisiteId: edge.prerequisiteId, strength: edge.strength, reason: edge.reason,
}));
assert.equal(dependencies.length, upstream.dependencies.data.edgeCount);
for (const edge of dependencies) {
  assert.ok(ids.has(edge.topicId) && ids.has(edge.prerequisiteId) && ['hard', 'soft'].includes(edge.strength), `Invalid dependency ${edge.topicId} <- ${edge.prerequisiteId}`);
}

const clusters = upstream.clusters.data.clusters.map(cluster => ({
  subject: cluster.subject, domain: cluster.domain, ageRangeStart: cluster.ageRangeStart, summary: cluster.summary,
}));
assert.equal(clusters.length, upstream.clusters.data.clusterCount);

const write = async (name, value) => {
  const bytes = `${JSON.stringify(value, null, 2)}\n`;
  await writeFile(new URL(name, out), bytes);
  return sha256(bytes);
};
const subjects = Object.fromEntries([...new Set(topics.map(topic => topic.subject))].sort()
  .map(subject => [subject, topics.filter(topic => topic.subject === subject).length]));
const metadata = {
  repository, commit,
  taxonomy_version: manifest.taxonomyVersion,
  topics_sha256: upstream.topics.sha256,
  dependencies_sha256: upstream.dependencies.sha256,
  clusters_sha256: upstream.clusters.sha256,
  catalog_sha256: await write('catalog.json', { topics }),
  dependency_catalog_sha256: await write('dependencies.json', { dependencies }),
  cluster_catalog_sha256: await write('clusters.json', { clusters }),
  topic_count: topics.length,
  dependency_count: dependencies.length,
  cluster_count: clusters.length,
  subjects,
  projection: 'topics: id, subject, domain, type, name, description, evidence, ageRangeStart, ageRangeEnd; dependencies: topicId, prerequisiteId, strength, reason; clusters: subject, domain, ageRangeStart, summary; original text unchanged; curriculum standards, teaching research and assessment prompts excluded',
  database_license: 'ODbL-1.0',
  content_license: 'CC-BY-SA-4.0',
  attribution: 'Marble Skill Taxonomy (v1) · © Generative Spark, Inc. (Marble) · https://withmarble.com',
};
await writeFile(new URL('metadata.json', out), `${JSON.stringify(metadata, null, 2)}\n`);
await writeFile(new URL('NOTICE.txt', out), `${metadata.attribution}
Source: ${repository}/tree/${commit}

This projection keeps every topic (all subjects), the prerequisite dependencies and the domain
clusters, with the upstream names, descriptions, evidence, reasons and summaries unchanged.
The database (including this projection) is licensed under ODbL 1.0:
${repository}/blob/${commit}/LICENSE
The authored textual content is licensed under CC BY-SA 4.0:
${repository}/blob/${commit}/LICENSE-CONTENT
Curriculum-standard records, teaching-research text and assessment prompts are not included.
This notice applies to this catalog, not to the application code.
`);
console.log(JSON.stringify({ commit, topic_count: topics.length, dependency_count: dependencies.length, cluster_count: clusters.length, subjects }));
