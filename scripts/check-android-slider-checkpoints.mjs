// Check real WebView touch input, periodic full checkpoints and durable final value.
// Pause a lesson with its first slider fully visible. Forward CDP to localhost:9240.
// Usage: node scripts/check-android-slider-checkpoints.mjs <output.json> [duration-ms]
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
const output = process.argv[2], duration = Number(process.argv[3] ?? 10000);
if (!output || duration < 8500) throw Error('Output path and duration >= 8500ms required');
const pages = await (await fetch('http://127.0.0.1:9240/json/list')).json();
const page = pages.find(p => p.type === 'page' && new URL(p.url).hostname === 'learn.pitun.cc');
if (!page) throw Error('Learn WebView not found');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); });
let id = 0; const pending = new Map();
ws.addEventListener('message', event => { const m = JSON.parse(event.data), p = pending.get(m.id); if (!p) return; clearTimeout(p.timer); pending.delete(m.id); m.error ? p.reject(Error(JSON.stringify(m.error))) : p.resolve(m.result); });
const call = (method, params = {}) => new Promise((resolve, reject) => { const key = ++id, timer = setTimeout(() => { pending.delete(key); reject(Error(`Timeout ${method}`)); }, 90000); pending.set(key, { resolve, reject, timer }); ws.send(JSON.stringify({ id: key, method, params })); });
const evaluate = async expression => { const r = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw Error(JSON.stringify(r.exceptionDetails)); return r.result.value; };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let pressed = false;
try {
  const scene = await evaluate(`(() => {
    const root = document.querySelector('.learning-oll-board'); let f = root?.[Object.keys(root).find(k => k.startsWith('__reactFiber'))], s;
    for (let d = 0; f && d < 30; d++, f = f.return) for (let h = f.memoizedState, i = 0; h && i < 160; h = h.next, i++) for (const v of [h.memoizedState, h.memoizedState?.current, Array.isArray(h.memoizedState) ? h.memoizedState[0] : null]) if (v?.player?.projection?.board && typeof v.emit === 'function') s = v;
    if (!s || s.playing) throw Error('Paused session required');
    const slider = document.querySelector('input[type=range]'), box = slider.getBoundingClientRect(), alias = slider.id.replace('oll-variable-', '');
    if (box.width < 20 || box.x < 0 || box.right > innerWidth || box.y < 0 || box.bottom > innerHeight) throw Error('Fully visible slider required');
    const original = s.store.save, probe = { s, slider, alias, start: performance.now(), writes: [], events: [] };
    s.store.save = function(key, checkpoint) { if (key === s.storageKey) probe.writes.push({ timeMs: performance.now() - probe.start, value: checkpoint.projection.board.variables[alias]?.value, currentSliderValue: Number(slider.value) }); return original.call(this, key, checkpoint); };
    const listener = event => { if (event.target === slider) probe.events.push({ type: event.type, timeMs: performance.now() - probe.start, value: Number(slider.value), trusted: event.isTrusted }); };
    for (const type of ['input', 'change', 'pointerdown', 'pointerup']) document.addEventListener(type, listener, true);
    probe.cleanup = () => { s.store.save = original; for (const type of ['input', 'change', 'pointerdown', 'pointerup']) document.removeEventListener(type, listener, true); };
    window.__sliderCheckpointProbe = probe;
    return { box: box.toJSON(), alias, storageKey: s.storageKey, buildUrl: '/build-info.json' };
  })()`);
  const point = fraction => ({ x: scene.box.x + scene.box.width * fraction, y: scene.box.y + scene.box.height / 2, id: 0, radiusX: 1, radiusY: 1, force: 1 });
  await call('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point(.2)] }); pressed = true;
  const start = performance.now(); let moves = 0;
  while (performance.now() - start < duration) {
    const phase = (moves % 60) / 59, fraction = .2 + .6 * (phase < .5 ? phase * 2 : (1 - phase) * 2);
    await call('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [point(fraction)] }); moves++;
    await sleep(16);
  }
  const dragMs = performance.now() - start;
  const during = await evaluate(`(() => { const p = window.__sliderCheckpointProbe; return { timeMs: performance.now() - p.start, writes: p.writes, events: p.events, finalValue: Number(p.slider.value) }; })()`);
  await sleep(600);
  const paused = await evaluate(`(() => { const p = window.__sliderCheckpointProbe; return { timeMs: performance.now() - p.start, writes: p.writes, checkpointValue: p.s.store.load(p.s.storageKey).projection.board.variables[p.alias].value }; })()`);
  await call('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); pressed = false;
  const committed = await evaluate(`(async () => {
    const p = window.__sliderCheckpointProbe, immediateValue = p.s.store.load(p.s.storageKey).projection.board.variables[p.alias].value;
    const db = await new Promise((r,j) => { const q = indexedDB.open('octos-learning-documents'); q.onsuccess = () => r(q.result); q.onerror = () => j(q.error); });
    const get = () => new Promise((r,j) => { const q = db.transaction('documents').objectStore('documents').get(p.s.storageKey); q.onsuccess = () => r(q.result); q.onerror = () => j(q.error); });
    let value; for (let i = 0; i < 200; i++) { value = (await get())?.projection?.board?.variables?.[p.alias]?.value; if (value === Number(p.slider.value)) break; await new Promise(r => setTimeout(r,100)); } db.close();
    return { writes: p.writes, events: p.events, immediateValue, durableValue: value, finalValue: Number(p.slider.value) };
  })()`);
  const inputs = during.events.filter(e => e.type === 'input'), gaps = inputs.slice(1).map((e,i) => e.timeMs - inputs[i].timeMs);
  const saves = during.writes.filter(w => w.timeMs >= inputs[0].timeMs && w.timeMs <= inputs.at(-1).timeMs), intervals = saves.slice(1).map((w,i) => w.timeMs - saves[i].timeMs);
  const sorted = a => [...a].sort((a,b) => a-b), pct = (a,p) => sorted(a)[Math.min(a.length-1,Math.floor(a.length*p))];
  const result = { checkedAt: new Date().toISOString(), scope: 'Real trusted CDP touch input, no CPU profiler; full checkpoint store.save only', scene, dragMs, moves, during, paused, committed, inputCount: inputs.length, maxInputGapMs: Math.max(...gaps), saveIntervals: { count: intervals.length, p50: pct(intervals,.5), p90: pct(intervals,.9), max: Math.max(...intervals) }, everySavedValueMatchesCurrentSlider: saves.every(w => w.value === w.currentSliderValue), finalValueSavedOnPause: paused.checkpointValue === during.finalValue, finalValueSavedOnCommit: committed.immediateValue === committed.finalValue, commitPerformedAdditionalSave: committed.writes.length > paused.writes.length, finalValueDurable: committed.durableValue === committed.finalValue };
  await writeFile(output, JSON.stringify(result,null,2) + '\n');
  assert.ok(dragMs >= 8500 && inputs.length > 20 && inputs.every(e => e.trusted));
  assert.ok(saves.length >= Math.floor(dragMs / 700), 'Missing periodic saves during drag');
  assert.ok(result.everySavedValueMatchesCurrentSlider && result.finalValueSavedOnPause && result.finalValueSavedOnCommit && result.commitPerformedAdditionalSave && result.finalValueDurable);
  console.log(JSON.stringify({ dragMs, inputs: inputs.length, periodicSaves: saves.length, maxInputGapMs: result.maxInputGapMs, saveIntervals: result.saveIntervals, finalValue: committed.finalValue, checksPassed: true },null,2));
} finally {
  if (pressed) await call('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }).catch(() => {});
  await evaluate('window.__sliderCheckpointProbe?.cleanup(); delete window.__sliderCheckpointProbe').catch(() => {});
  ws.close();
}
