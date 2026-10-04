// Use an ADB-forwarded, debuggable WebView. The course must already be paused.
// --compare alternates cached/live/cached rendering on the same mounted scene.
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const args = process.argv.slice(2);
const option = name => args[args.indexOf(name) + 1];
const port = args.includes("--port") ? Number(option("--port")) : 9240;
const frames = args.includes("--frames") ? Number(option("--frames")) : 60;
if (!Number.isInteger(frames) || frames < 10 || frames > 600) throw Error("--frames must be 10..600");
const camera = args.includes("--camera") ? option("--camera").split(",").map(Number) : null;
if (camera && (camera.length !== 3 || camera.some(v => !Number.isFinite(v)) || camera[2] <= 0)) throw Error("--camera requires panX,panY,scale");
const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const target = pages.find(page => page.type === "page" && new URL(page.url).hostname === "learn.pitun.cc");
if (!target) throw Error("Octos Learn WebView not found; connect ADB and forward its devtools socket first");
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  ws.addEventListener("open", resolve, { once: true });
  ws.addEventListener("error", reject, { once: true });
});
let id = 0;
const pending = new Map();
ws.addEventListener("message", event => {
  const message = JSON.parse(event.data);
  const request = pending.get(message.id);
  if (!request) return;
  pending.delete(message.id);
  message.error ? request.reject(message.error) : request.resolve(message.result);
});
const call = (method, params) => new Promise((resolve, reject) => {
  const requestId = ++id;
  pending.set(requestId, { resolve, reject });
  ws.send(JSON.stringify({ id: requestId, method, params }));
});

async function measure({ frames, compare, camera }) {
  const viewport = document.querySelector(".learning-oll-board");
  let fiber = viewport?.[Object.keys(viewport).find(key => key.startsWith("__reactFiber"))];
  let board, runtime;
  for (let depth = 0; fiber && depth < 30; depth++, fiber = fiber.return) {
    for (let hook = fiber.memoizedState, i = 0; hook && i < 160; hook = hook.next, i++) {
      const value = hook.memoizedState?.current;
      if (value?.view && value.elements) board = value.view;
      if (value && typeof value.pause === "function" && typeof value.handleStudentVariableInput === "function") runtime = value;
    }
  }
  if (!board || !runtime || runtime.playing) throw Error("Open a complete course and pause playback before measuring");
  const listeners = board.cameraListeners;
  const previewListener = [...listeners].find(listener => listener.toString().includes("androidCoursePreview"));
  if (compare && !previewListener) throw Error("Preview camera listener not found in this build");
  const original = { panX: board.panX, panY: board.panY, scale: board.scale };
  const benchmark = camera ? { panX: camera[0], panY: camera[1], scale: camera[2] } : original;
  const manual = viewport.classList.contains("manual-navigation");
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const snapshot = () => JSON.stringify([...viewport.querySelectorAll(".board-node")].map(node => node.getAttribute("style")));
  const initialLayout = snapshot();
  const results = [];
  const restoreListener = () => {
    if (previewListener && !listeners.has(previewListener)) listeners.add(previewListener);
  };
  const sample = async (name, action) => {
    await wait(500);
    const intervals = [];
    let previous, activeFrames = 0, previewCount = 0, minimumPreviewCount = Infinity;
    for (let i = 0; i < frames; i++) {
      const time = await new Promise(requestAnimationFrame);
      if (previous !== undefined) intervals.push(time - previous);
      previous = time;
      if (viewport.hasAttribute("data-android-course-preview")) {
        activeFrames++;
        const count = viewport.querySelectorAll("[data-android-graph-preview]").length;
        previewCount = Math.max(previewCount, count);
        minimumPreviewCount = Math.min(minimumPreviewCount, count);
      }
      action?.(i);
    }
    intervals.sort((a, b) => a - b);
    return { name, intervals: intervals.length, p50: intervals[Math.floor(intervals.length * .5)], p95: intervals[Math.floor(intervals.length * .95)], over34ms: intervals.filter(v => v > 34).length, activeFrames, previewCount, minimumPreviewCount: Number.isFinite(minimumPreviewCount) ? minimumPreviewCount : 0 };
  };
  try {
    board.beginManualNavigation();
    Object.assign(board, benchmark); board.transform();
    await wait(3500);
    for (const phase of compare ? ["cached", "live", "cached-repeat"] : ["cached"]) {
      board.beginManualNavigation();
      Object.assign(board, benchmark); board.transform();
      await wait(600); // Restore live SVGs before disabling only the preview subscriber.
      if (phase === "live") listeners.delete(previewListener);
      else restoreListener();
      await wait(2500);
      const samples = [];
      samples.push(await sample("idle"));
      samples.push(await sample("pan", i => {
        board.beginManualNavigation();
        board.panX = benchmark.panX + Math.sin(i * .08) * 130;
        board.panY = benchmark.panY + Math.cos(i * .08) * 60;
        board.transform();
      }));
      samples.push(await sample("zoom", i => {
        board.beginManualNavigation();
        board.scale = benchmark.scale * (1 + .2 * Math.sin(i * .08));
        board.transform();
      }));
      results.push({ phase, layoutUnchanged: snapshot() === initialLayout, samples });
    }
  } finally {
    restoreListener();
    Object.assign(board, original); board.transform();
    await wait(600);
    if (!manual) board.resumeAutomaticCamera();
  }
  return { measuredAt: new Date().toISOString(), viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio }, camera: benchmark, nodes: viewport.querySelectorAll(".board-node").length, graphs: viewport.querySelectorAll(".board-node svg").length, restored: !viewport.hasAttribute("data-android-course-preview") && viewport.querySelectorAll("[data-android-graph-preview]").length === 0, layoutUnchanged: snapshot() === initialLayout, results };
}

const timer = setTimeout(() => { ws.close(); process.exit(1); }, 120_000);
try {
  const expression = `(${measure.toString()})(${JSON.stringify({ frames, compare: args.includes("--compare"), camera })})`;
  const response = await call("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (response.exceptionDetails) throw Error(JSON.stringify(response.exceptionDetails));
  const output = JSON.stringify(response.result.value, null, 2) + "\n";
  if (args.includes("--output")) {
    const path = option("--output");
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, output);
  }
  process.stdout.write(output);
} finally {
  clearTimeout(timer);
  ws.close();
}
