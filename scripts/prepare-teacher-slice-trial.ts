// Writes the reviewable plan for the teacher slice model trial. The teacher
// settings and learner background are produced by the app's own functions so
// the trial sends exactly what a learner's lesson request would send.
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { TEACHERS, teacherProfile } from '../src/learning/teachers/teachers';
import { buildLearnerContext } from '../src/learning/teachers/learner-background';
import type { LearningRunSummary } from '../src/learning/history/history-api';

const [output] = process.argv.slice(2);
assert.ok(output, 'Supply the plan JSON path');

// Synthetic learner. Each line tests one rule: an unattributed mistake, a
// shared preference for every teacher, and an experience with only 豆豆.
const memory = {
  long_term: [
    '- 学生喜欢打篮球，常用投篮命中率举例子。',
    '- 2026-10-15 求直线斜率时，学生把 Δy 和 Δx 的位置写反过。',
    '- 学生说过：希望所有老师讲题时先说结论，再解释为什么。',
    '- 学生和豆豆老师一起用“山路”比喻学过斜率，学生说这个比喻好记。',
  ].join('\n'),
  long_term_updated_at: '2026-10-20T09:00:00Z',
};
const run = (day: string, question: string, counts: [number, number, number]): LearningRunSummary => ({
  run_id: `run-${day}`, session_id: 'synthetic', updated_seq: 1, question_preview: question, first_occurred_at: `${day}T10:00:00Z`,
  course: null, question_count: counts[0], completed_beats: counts[1], task_attempts: counts[2], start_recorded: true,
});
const runs = [
  run('2026-10-15', '直线 y=3x-2 的斜率怎么求？', [2, 9, 1]),
  run('2026-10-18', '一次函数的截距是什么意思？', [1, 6, 0]),
];
const background = buildLearnerContext({ memory, runs }, new Date('2026-10-22T08:00:00Z'));
assert.ok(background);

const questions = {
  slope: '直线 y=2x+1 的斜率 2 是什么意思？内容简短，给出完整的小课程。',
  triangle: '为什么三角形的内角和是 180 度？内容简短，给出完整的小课程。',
  square: '怎样用配方法解 x²+4x+3=0？写清每一步为什么成立，内容简短，给出完整的小课程。',
};
// Fixed interleaved order so neither teacher always runs first.
const order: [keyof typeof questions, (typeof TEACHERS)[number]['id']][] = [
  ['slope', 'alan'], ['slope', 'doudou'], ['triangle', 'doudou'], ['triangle', 'alan'], ['square', 'alan'], ['square', 'doudou'],
];
const samples = order.map(([topic, teacherId], index) => {
  const teacher = TEACHERS.find(item => item.id === teacherId)!;
  return { id: `${String(index + 1).padStart(2, '0')}-${topic}-${teacherId}`, version: 'candidate', topic, teacher: teacherId,
    prompt: questions[topic], teacher_profile: teacherProfile(teacher), learner_background: background };
});

const plan = {
  schema: 'octos.learn.performance-trial.v1',
  id: 'teacher-slice-model-trial-20261022',
  status: 'prepared',
  cost_basis_verified: false,
  route_verified: false,
  authorization_reference: '',
  model: 'gemini-3.8-flash',
  voice: 'none',
  resource: 'none',
  limits: {
    courses: samples.length,
    speech_requests: 1,
    usd_micros: 13_500_000,
    cny_micros: 1,
    model_request_usd_micros: 450_000,
    speech_byte_cny_micros: 1,
    speech_utf8_bytes: 1,
    output_tokens: 32768,
    request_bytes: 262144,
  },
  output_directory: '',
  samples,
  questions_answered: [
    'Can a reader tell the two teachers apart from the generated lesson alone?',
    'Does the lesson cite only facts present in learner_background, without claiming another teacher\'s experience?',
    'Is the shared preference (conclusion first) followed by both teachers?',
  ],
};
writeFileSync(resolve(output), `${JSON.stringify(plan, null, 2)}\n`);
console.log(JSON.stringify({ written: resolve(output), samples: samples.map(sample => sample.id) }));
