import { copyFile, mkdir, readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { build } from 'vite';

const root = fileURLToPath(new URL('../', import.meta.url));
const source = path.join(root, 'public/models/handwriting');
const output = path.join(root, 'public/handwriting-runtime');
const model = JSON.parse(await readFile(path.join(source, 'manifest.json'), 'utf8'));
const bytes = await readFile(path.join(source, model.file));
if (createHash('sha256').update(bytes).digest('hex') !== model.sha256) throw new Error('Handwriting model checksum mismatch');
await mkdir(path.join(output, 'wasm'), { recursive: true });
await copyFile(path.join(source, model.file), path.join(output, model.file));
const wasm = path.join(path.dirname(fileURLToPath(import.meta.resolve('@mediapipe/tasks-vision'))), 'wasm');
for (const name of await readdir(wasm)) if (/^vision_wasm.*\.(js|wasm)$/.test(name)) {
  await copyFile(path.join(wasm, name), path.join(output, 'wasm', name));
}
await build({
  root, configFile: false, publicDir: false, logLevel: 'warn',
  build: {
    emptyOutDir: false, outDir: output, target: 'es2020',
    lib: { entry: path.join(root, 'src/learning/handwriting/handwriting-capture.worker.ts'), name: 'OctosHandwritingCapture', formats: ['iife'], fileName: () => 'handwriting-capture.worker.js' },
    minify: true,
  },
});
console.log('Handwriting worker, verified model and WASM prepared.');
