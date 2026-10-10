// Profile a paused lesson in the installed Android WebView. No navigation,
// CPU throttling or display changes. Injected input is handled by the real UI.
// adb forward tcp:9240 localabstract:webview_devtools_remote_<PID>
// node scripts/profile-android-slider-drag.mjs --out <DIR> --label <NAME>
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { analyse } from './slider-profile-analysis.mjs';

const args = process.argv.slice(2);
const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const port = Number(option('--port', 9240));
const steps = Number(option('--steps', 90));
const label = option('--label', 'android-current');
const out = option('--out', 'delivery/android-slider-profile');
const mode = option('--input', 'touch');
const instrument = args.includes('--instrument');
const noCpu = args.includes('--no-cpu');
if (!Number.isInteger(steps) || steps < 10 || steps > 600) throw Error('--steps must be 10..600');
if (!['touch', 'mouse'].includes(mode) || !/^[a-zA-Z0-9_-]+$/.test(label)) throw Error('Invalid input mode or label');
const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const page = pages.find(p => p.type === 'page' && new URL(p.url).hostname === 'learn.pitun.cc');
if (!page) throw Error('Learn WebView not found');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); });
let id = 0;
const pending = new Map();
ws.addEventListener('message', event => {
  const message = JSON.parse(event.data), request = pending.get(message.id);
  if (!request) return;
  clearTimeout(request.timer); pending.delete(message.id);
  message.error ? request.reject(Error(JSON.stringify(message.error))) : request.resolve(message.result);
});
const call = (method, params = {}) => new Promise((resolve, reject) => {
  const requestId = ++id;
  const timer = setTimeout(() => { pending.delete(requestId); reject(Error(`Timeout: ${method}`)); }, 90000);
  pending.set(requestId, { resolve, reject, timer });
  ws.send(JSON.stringify({ id: requestId, method, params }));
});
const evaluate = async expression => {
  const response = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (response.exceptionDetails) throw Error(JSON.stringify(response.exceptionDetails));
  return response.result.value;
};
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
function installProbe(instrument) {
  const viewport = document.querySelector('.learning-oll-board');
  let fiber = viewport?.[Object.keys(viewport).find(k => k.startsWith('__reactFiber'))];
  let runtime, board, ink;
  for (let depth = 0; fiber && depth < 30; depth++, fiber = fiber.return) {
    for (let hook = fiber.memoizedState, i = 0; hook && i < 160; hook = hook.next, i++) {
      const value = hook.memoizedState?.current;
      if (value?.view && value.elements) board = value.view;
      if (value && typeof value.pause === 'function' && typeof value.handleStudentVariableInput === 'function') runtime = value;
      if (value?.editor?.image && 'savedSvg' in value) ink = value;
    }
  }
  if (!board || !runtime || runtime.playing) throw Error('Open a lesson and pause it first');
  const slider = [...document.querySelectorAll('[data-interaction-controls-id] input[type=range], .board-node input[type=range]')].find(n => n.getBoundingClientRect().width >= 20);
  if (!slider) throw Error('No slider on current board');
  const box = slider.getBoundingClientRect();
  if (box.width < 20 || box.top < 0 || box.bottom > innerHeight || box.left < 0 || box.right > innerWidth) throw Error('Slider must be fully visible');
  const probe = { frames: [], longTasks: [], events: [], calls: {}, restore: [] };
  let last;
  const tick = now => { if (last !== undefined) probe.frames.push(now - last); last = now; probe.frame = requestAnimationFrame(tick); };
  probe.frame = requestAnimationFrame(tick);
  const listener = event => {
    if (event.target === slider) {
      const item = { type: event.type, time: performance.now(), value: slider.value, trusted: event.isTrusted };
      probe.events.push(item);
      if (event.type === 'input') requestAnimationFrame(() => requestAnimationFrame(() => { item.secondRafMs = performance.now() - item.time; }));
    }
  };
  for (const name of ['input', 'change', 'pointerdown', 'pointerup', 'pointercancel']) { document.addEventListener(name, listener, true); probe.restore.push(() => document.removeEventListener(name, listener, true)); }
  try {
    const observer = new PerformanceObserver(list => { for (const e of list.getEntries()) probe.longTasks.push({ start: e.startTime, duration: e.duration }); });
    observer.observe({ entryTypes: ['longtask'] }); probe.restore.push(() => observer.disconnect());
  } catch { /* Not available on some WebViews. */ }
  if (instrument) {
    for (const name of ['render', 'syncNodes', 'positionNodes', 'syncGroups', 'renderConnections', 'getRegionBoundsMap', 'getAttachmentBoundsMap']) {
      const original = board[name]; if (typeof original !== 'function') continue;
      probe.calls[name] = [];
      board[name] = function (...args) { const start = performance.now(); try { return original.apply(this, args); } finally { probe.calls[name].push(performance.now() - start); } };
      probe.restore.push(() => { board[name] = original; });
    }
    for (const name of ['put']) {
      const original = IDBObjectStore.prototype[name]; probe.calls[`IDB.${name}`] = [];
      IDBObjectStore.prototype[name] = function (...args) { const start = performance.now(); try { return original.apply(this, args); } finally { probe.calls[`IDB.${name}`].push(performance.now() - start); } };
      probe.restore.push(() => { IDBObjectStore.prototype[name] = original; });
    }
  }
  window.__androidSliderProbe = probe;
  const cards = {};
  for (const n of viewport.querySelectorAll('.board-node')) cards[n.dataset.kind] = (cards[n.dataset.kind] ?? 0) + 1;
  return { title: runtime.title, beatIndex: runtime.beatIndex, beatCount: runtime.beatCount, cards,
    inkComponents: ink?.editor.image.getAllComponents().length ?? null,
    inkMode: viewport.dataset.androidInkMode, inputOwner: board.getInputOwner(),
    viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio }, camera: board.getCameraState(),
    slider: { id: slider.id, label: slider.getAttribute('aria-label'), value: slider.value, min: slider.min, max: slider.max, step: slider.step, box: box.toJSON() },
    stress: window.__sliderStress ?? null,
    userAgent: navigator.userAgent, scripts: [...document.scripts].map(s => s.src).filter(Boolean) };
}
const counter = async () => Object.fromEntries((await call('Performance.getMetrics')).metrics.map(m => [m.name, m.value]));
let profiling = false, installed = false, pressed = false;
try {
  await mkdir(out, { recursive: true });
  const scene = await evaluate(`(${installProbe})(${instrument})`); installed = true;
  const build = await evaluate(`fetch('/build-info.json').then(r => r.json()).catch(() => null)`);
  await call('Performance.enable');
  if (!noCpu) { await call('Profiler.enable'); await call('Profiler.setSamplingInterval', { interval: 200 }); }
  const before = await counter();
  if (!noCpu) { await call('Profiler.start'); profiling = true; }
  // Exclude setup/font readiness from the profile. The first drag stays cold.
  await evaluate('window.__androidSliderProbe.startedAt = performance.now()');
  const started = Date.now(), box = scene.slider.box, y = box.y + box.height / 2;
  const dispatch = async (type, x) => {
    if (mode === 'touch') await call('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 0, radiusX: 1, radiusY: 1, force: 1 }] });
    else await call('Input.dispatchMouseEvent', { type: { touchStart: 'mousePressed', touchMove: 'mouseMoved', touchEnd: 'mouseReleased' }[type], x, y, button: type === 'touchMove' ? 'none' : 'left', buttons: type === 'touchEnd' ? 0 : 1, clickCount: type === 'touchMove' ? 0 : 1 });
  };
  await dispatch('touchStart', box.x + box.width * .2); pressed = true;
  for (let i = 0; i <= steps; i++) {
    const phase = i / steps * 2, t = phase <= 1 ? phase : 2 - phase;
    await dispatch('touchMove', box.x + box.width * (.2 + .6 * t));
    await sleep(16);
  }
  await dispatch('touchEnd', box.x + box.width * .2); pressed = false;
  const dragMs = Date.now() - started;
  // Include commit, pending rAF work and async IndexedDB writes.
  await sleep(750);
  const profile = noCpu ? null : (await call('Profiler.stop')).profile; profiling = false;
  const after = await counter();
  const probe = await evaluate(`(() => { const p = window.__androidSliderProbe; cancelAnimationFrame(p.frame); p.restore.forEach(f => f()); const {restore, frame, ...data} = p; delete window.__androidSliderProbe; return data; })()`); installed = false;
  const frames = probe.frames.slice(1).sort((a, b) => a - b);
  const pct = p => frames.length ? frames[Math.min(frames.length - 1, Math.floor(frames.length * p))] : null;
  const delta = name => after[name] - before[name];
  const summary = { measuredAt: new Date().toISOString(), label, input: mode, instrument, steps, cpuRate: 1, samplingIntervalUs: noCpu ? null : 200, dragMs, drainMs: 750, build, scene,
    sliderInputEvents: probe.events.filter(e => e.type === 'input').length,
    frameIntervalMs: { count: frames.length, p50: pct(.5), p90: pct(.9), p95: pct(.95), max: frames.at(-1), over34ms: frames.filter(f => f > 34).length },
    longTasks: { count: probe.longTasks.length, totalMs: probe.longTasks.reduce((s, t) => s + t.duration, 0), maxMs: Math.max(0, ...probe.longTasks.map(t => t.duration)) },
    chrome: { layoutCount: delta('LayoutCount'), layoutSeconds: delta('LayoutDuration'), recalcStyleCount: delta('RecalcStyleCount'), recalcStyleSeconds: delta('RecalcStyleDuration'), scriptSeconds: delta('ScriptDuration'), taskSeconds: delta('TaskDuration') },
    cpu: profile ? analyse(profile) : null, probe };
  if (profile) await writeFile(join(out, `${label}.cpuprofile`), JSON.stringify(profile));
  await writeFile(join(out, `${label}.json`), JSON.stringify(summary, null, 2) + '\n');
  if (summary.sliderInputEvents < 10) throw Error(`Only ${summary.sliderInputEvents} inputs: this drag is invalid; saved diagnostics`);
  console.log(JSON.stringify({ label, inputs: summary.sliderInputEvents, frame: summary.frameIntervalMs, chrome: summary.chrome, cpu: summary.cpu?.activeMs, top: summary.cpu?.topSelf.slice(0, 8) }, null, 2));
} finally {
  if (pressed) await call('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }).catch(() => {});
  if (profiling) await call('Profiler.stop').catch(() => {});
  if (installed) await evaluate('(() => { const p = window.__androidSliderProbe; if (p) { cancelAnimationFrame(p.frame); p.restore.forEach(f => f()); delete window.__androidSliderProbe; } })()').catch(() => {});
  await call('Profiler.disable').catch(() => {}); await call('Performance.disable').catch(() => {});
  ws.close();
}
