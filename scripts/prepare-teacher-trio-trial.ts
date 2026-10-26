// Writes the reviewable plan for the three-teacher model trial (阿澜, 窦鸢,
// 苏绯). Teacher settings come from the app's own catalog, so the trial sends
// exactly what a learner's lesson request would send. No learner background:
// the question is whether each teacher is recognisable on their own.
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { TEACHER_CATALOG_VERSION, TEACHERS, teacherProfile } from '../src/learning/teachers/teachers';

const [output] = process.argv.slice(2);
assert.ok(output, 'Supply the plan JSON path');

const questions = {
  slope: '直线 y=2x+1 的斜率 2 是什么意思？内容简短，给出完整的小课程。',
  triangle: '为什么三角形的内角和是 180 度？内容简短，给出完整的小课程。',
  wrong: '我算 y=3x-2 的斜率得到 -2，对吗？内容简短，给出完整的小课程。',
};
// A Latin square, so no teacher always runs first or last.
const order: [keyof typeof questions, (typeof TEACHERS)[number]['id']][] = [
  ['slope', 'alan'], ['slope', 'doudou'], ['slope', 'sufei'],
  ['triangle', 'doudou'], ['triangle', 'sufei'], ['triangle', 'alan'],
  ['wrong', 'sufei'], ['wrong', 'alan'], ['wrong', 'doudou'],
];
const samples = order.map(([topic, teacherId], index) => {
  const teacher = TEACHERS.find(item => item.id === teacherId)!;
  return { id: `${String(index + 1).padStart(2, '0')}-${topic}-${teacherId}`, version: 'candidate', topic, teacher: teacherId,
    prompt: questions[topic], teacher_profile: teacherProfile(teacher) };
});

const plan = {
  schema: 'octos.learn.performance-trial.v1',
  id: 'teacher-trio-trial-20261025',
  status: 'prepared',
  cost_basis_verified: false,
  route_verified: false,
  authorization_reference: '',
  model: 'gemini-3.8-flash',
  voice: 'none',
  resource: 'none',
  teacher_catalog_version: TEACHER_CATALOG_VERSION,
  limits: {
    courses: samples.length,
    speech_requests: 1,
    usd_micros: 3_000_000,
    cny_micros: 1,
    model_request_usd_micros: 150_000,
    speech_byte_cny_micros: 1,
    speech_utf8_bytes: 1,
    output_tokens: 32768,
    request_bytes: 32768,
  },
  output_directory: '',
  samples,
  questions_answered: [
    'Can a reader tell the three teachers apart from the generated lesson alone?',
    'Does 苏绯 come across as strict and fair (every number traced to its source) without being cold or belittling?',
    'Does 窦鸢 (renamed from 豆豆) keep her light, one-metaphor style, and does any lesson call her 豆豆?',
    'Is the mathematics correct, and is the wrong answer in the third question corrected without blame?',
  ],
};
writeFileSync(resolve(output), `${JSON.stringify(plan, null, 2)}\n`);
console.log(JSON.stringify({ written: resolve(output), samples: samples.map(sample => sample.id) }));
