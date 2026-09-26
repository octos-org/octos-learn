import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import type { AuthoringLesson } from 'octos-lesson-language';
import { materializeOllLesson } from '../src/learning/oll/oll-materialization';

const paths = process.argv.slice(2);
if (!paths.length) throw new Error('Pass one or more course.authoring.json paths.');
const iterations = 30;
const reports = paths.map(path => {
  const source = readFileSync(path, 'utf8');
  const authoring = JSON.parse(source) as AuthoringLesson;
  const options = {lessonId:'materialization-benchmark', boardId:'benchmark-board',
    baseRevision:0, regionIntent:'new_topic' as const, regionId:'benchmark-region'};
  for (let i=0; i<3; i++) materializeOllLesson(authoring, options);
  const samples: number[] = [];
  let events = 0;
  for(let i=0;i<iterations;i++) {
    const start = performance.now();
    events = materializeOllLesson(authoring, options).length;
    samples.push(performance.now()-start);
  }
  samples.sort((a,b)=>a-b);
  return {path:resolve(path), sourceSha256:createHash('sha256').update(source).digest('hex'),
    events, samples:iterations, p50Ms:samples[Math.ceil(iterations*.5)-1],
    p95Ms:samples[Math.ceil(iterations*.95)-1], maxMs:samples.at(-1)};
});
console.log(JSON.stringify({scope:'local synchronous materialization only; excludes model, network, TTS and playback',
  node:process.version, measuredAt:new Date().toISOString(), reports}, null, 2));
