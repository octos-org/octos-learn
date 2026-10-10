// Profile dragging a lesson slider in the real learning page (Chromium).
//
//   OCTOS_LOCAL_COURSE_PACK_ROOT=<course-pack-publication> pnpm dev --host 127.0.0.1 --port 5187 --strictPort
//   node scripts/profile-slider-drag.mjs [--base http://127.0.0.1:5187] [--packs a,b] [--cpu 1,4] [--steps 90] [--out DIR]
//
// For every (pack, cpu throttle) it opens the course in preview mode, pauses it, advances to the end
// of the lesson, drags the first slider with real mouse events, and records
//   - a V8 CPU profile (self/inclusive time by function, grouped into buckets),
//   - Chrome's Performance counters (layout/style recalc counts and durations),
//   - rAF frame intervals and long tasks during the drag,
//   - card counts and how many slider updates reached the runtime.
// Results go to DIR/<pack>-cpu<N>.json plus DIR/SUMMARY.md. Nothing is uploaded.
import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const args = process.argv.slice(2);
const option = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const base = option("--base", "http://127.0.0.1:5187");
const packs = option("--packs", "linear-intro-and-slope,slope-and-intercept,trig-cosine-and-phase-shift,surface-partial-derivative-slice").split(",");
const cpuRates = option("--cpu", "1,4").split(",").map(Number);
const steps = Number(option("--steps", "90"));
const outDir = option("--out", "slider-profile-out");
const viewport = { width: Number(option("--width", "1440")), height: Number(option("--height", "900")) };

// Function-name buckets; a stack is counted once per bucket (inclusive time).
const BUCKETS = {
  "structuredClone (runtime/player snapshots)": ["structuredClone"],
  "JSON.stringify": ["stringify"],
  "IndexedDB write": ["IDBObjectStore", "put", "learning-document-store"],
  "BoardView.render": ["render"],
  "BoardView.syncNodes": ["syncNodes"],
  "computeBoardLayout": ["computeBoardLayout"],
  "positionNodes/syncGroups/renderConnections": ["positionNodes", "syncGroups", "renderConnections"],
  "updatePlotExplorer": ["updatePlotExplorer"],
  "updateScene3d": ["updateScene3d"],
  "measureVisualRegionBounds/measureBoardNodeBounds": ["measureVisualRegionBounds", "measureBoardNodeBounds", "getRegionBoundsMap", "getAttachmentBoundsMap"],
  "getBoundingClientRect/offset*/scrollHeight": ["getBoundingClientRect", "offsetHeight", "offsetWidth", "scrollHeight", "clientWidth", "clientHeight"],
  "persist / checkpoint": ["persist", "checkpoint"],
  "applyManualVariable": ["applyManualVariable"],
  "KaTeX": ["katex", "renderToString"],
  "React commit/render": ["performUnitOfWork", "commitRoot", "renderWithHooks", "flushPassiveEffects"],
  "ink runtime": ["ink", "Ink"],
};

function analyse(profile) {
  const nodes = new Map(profile.nodes.map(node => [node.id, node]));
  const parent = new Map();
  for (const node of profile.nodes) for (const child of node.children ?? []) parent.set(child, node.id);
  const keyOf = id => {
    const { functionName, url, lineNumber } = nodes.get(id).callFrame;
    const file = url ? url.split("/").slice(-1)[0].split("?")[0] : "";
    return `${functionName || "(anonymous)"} ${file}:${lineNumber + 1}`;
  };
  const self = new Map();
  const inclusive = new Map();
  const bucketTotals = Object.fromEntries(Object.keys(BUCKETS).map(name => [name, 0]));
  let total = 0;
  let idle = 0;
  profile.samples.forEach((id, index) => {
    const delta = (profile.timeDeltas[index] ?? 0) / 1000;
    const name = nodes.get(id).callFrame.functionName;
    if (name === "(idle)") { idle += delta; return; }
    total += delta;
    self.set(keyOf(id), (self.get(keyOf(id)) ?? 0) + delta);
    const seen = new Set();
    const bucketsSeen = new Set();
    for (let cursor = id; cursor !== undefined; cursor = parent.get(cursor)) {
      const key = keyOf(cursor);
      if (!seen.has(key)) { seen.add(key); inclusive.set(key, (inclusive.get(key) ?? 0) + delta); }
      const fn = nodes.get(cursor).callFrame.functionName;
      const url = nodes.get(cursor).callFrame.url ?? "";
      for (const [bucket, needles] of Object.entries(BUCKETS)) {
        if (bucketsSeen.has(bucket)) continue;
        if (needles.some(needle => fn === needle || fn.includes(needle) && needle.length > 6 || url.includes(needle) && needle.length > 12)) {
          bucketsSeen.add(bucket);
          bucketTotals[bucket] += delta;
        }
      }
    }
  });
  const top = map => [...map].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([name, ms]) => ({ name, ms: Math.round(ms * 10) / 10 }));
  return { activeMs: Math.round(total), idleMs: Math.round(idle), topSelf: top(self), topInclusive: top(inclusive),
    buckets: Object.fromEntries(Object.entries(bucketTotals).map(([k, v]) => [k, Math.round(v)])) };
}

async function openCourse(browser, packId) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await page.addInitScript(() => {
    localStorage.setItem("octos_session_token", "curated-course-e2e");
    localStorage.setItem("selected_profile", "curated-learner");
    localStorage.setItem("octos-learn:setup-skipped:curated-learner", "yes");
  });
  await page.routeWebSocket(url => url.pathname.startsWith("/api/"), socket => socket.close());
  await page.route(url => url.pathname.startsWith("/api/"), async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.startsWith("/api/learn/course-packs")) return route.continue();
    const replies = {
      "/api/auth/status": { bootstrap_mode: false, email_login_enabled: true },
      "/api/auth/me": { user: { id: "curated-learner", email: "l@e.t", name: "L" }, portal: { accessible_profiles: [{ id: "curated-learner", name: "L" }], home_profile_id: "curated-learner", can_access_admin_portal: false } },
      "/api/my/profile": { id: "curated-learner", name: "L", config: { llm: { primary: { family_id: "deepseek", model_id: "deepseek-chat" } } } },
    };
    await route.fulfill({ status: path in replies ? 200 : 503, contentType: "application/json", body: JSON.stringify(replies[path] ?? {}) });
  });
  const catalog = await (await fetch(`${base}/api/learn/course-packs`)).json();
  const pack = catalog.packs.find(item => item.packId === packId && item.recommended !== false) ?? catalog.packs.find(item => item.packId === packId);
  if (!pack) throw new Error(`Pack ${packId} is not in the local catalog`);
  await page.goto(`${base}/board?course-pack=${packId}&course-version=${pack.version}&course-mode=preview&course-title=${encodeURIComponent(pack.title)}`);
  await page.getByTestId("oll-controls").waitFor({ timeout: 60_000 });
  return { context, page };
}

async function profileOne(browser, packId, cpuRate) {
  const { context, page } = await openCourse(browser, packId);
  try {
    const mute = page.getByRole("button", { name: "关闭课程旁白语音" });
    if (await mute.isVisible().catch(() => false)) await mute.click();
    const pause = page.getByRole("button", { name: "暂停 OLL 课程" });
    if (await pause.isVisible().catch(() => false)) await pause.click();
    for (let i = 0; i < 60; i += 1) {
      const next = page.getByRole("button", { name: "下一 OLL Beat", exact: true });
      if (!(await next.isEnabled().catch(() => false))) break;
      await next.click();
      await page.waitForTimeout(150);
    }
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(2500);
    const slider = page.locator("[data-interaction-controls-id] input[type=range], .board-node input[type=range]").first();
    if (!(await slider.count())) return { packId, cpuRate, skipped: "no slider on the final board" };
    const cards = await page.evaluate(() => {
      const counts = {};
      for (const node of document.querySelectorAll(".board-node")) counts[node.dataset.kind] = (counts[node.dataset.kind] ?? 0) + 1;
      return counts;
    });
    const box = await slider.boundingBox();
    if (!box) return { packId, cpuRate, skipped: "slider has no box" };
    const cdp = await context.newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpuRate });
    await cdp.send("Performance.enable");
    await cdp.send("Profiler.enable");
    await cdp.send("Profiler.setSamplingInterval", { interval: 200 });
    await page.evaluate(() => {
      const frames = [];
      const longTasks = [];
      let last = performance.now();
      const tick = now => { frames.push(now - last); last = now; window.__frameLoop = requestAnimationFrame(tick); };
      window.__frameLoop = requestAnimationFrame(tick);
      try {
        new PerformanceObserver(list => { for (const entry of list.getEntries()) longTasks.push(entry.duration); }).observe({ entryTypes: ["longtask"] });
      } catch { /* long task API unavailable */ }
      window.__sliderProbe = { frames, longTasks, inputs: 0 };
      document.addEventListener("input", event => { if (event.target instanceof HTMLInputElement && event.target.type === "range") window.__sliderProbe.inputs += 1; }, true);
    });
    const counter = async () => Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map(metric => [metric.name, metric.value]));
    const before = await counter();
    await cdp.send("Profiler.start");
    const startedAt = Date.now();
    await page.mouse.move(box.x + box.width * 0.2, box.y + box.height / 2);
    await page.mouse.down();
    for (let i = 0; i <= steps; i += 1) {
      const phase = (i / steps) * 2;
      const t = phase <= 1 ? phase : 2 - phase; // out and back so the value really changes every frame
      await page.mouse.move(box.x + box.width * (0.2 + 0.6 * t), box.y + box.height / 2);
      await page.waitForTimeout(16);
    }
    await page.mouse.up();
    const dragMs = Date.now() - startedAt;
    const { profile } = await cdp.send("Profiler.stop");
    const after = await counter();
    const probe = await page.evaluate(() => { cancelAnimationFrame(window.__frameLoop); return window.__sliderProbe; });
    const frames = probe.frames.slice(1).sort((a, b) => a - b);
    const percentile = p => frames.length ? Math.round(frames[Math.min(frames.length - 1, Math.floor(frames.length * p))] * 10) / 10 : null;
    const delta = name => Math.round(((after[name] ?? 0) - (before[name] ?? 0)) * 1000) / 1000;
    return {
      packId, cpuRate, steps, dragMs, cards,
      sliderInputEvents: probe.inputs,
      frameIntervalMs: { count: frames.length, p50: percentile(0.5), p90: percentile(0.9), max: frames.at(-1) ?? null },
      longTasks: { count: probe.longTasks.length, totalMs: Math.round(probe.longTasks.reduce((a, b) => a + b, 0)), maxMs: Math.round(Math.max(0, ...probe.longTasks)) },
      chrome: {
        layoutCount: delta("LayoutCount"), layoutSeconds: delta("LayoutDuration"),
        recalcStyleCount: delta("RecalcStyleCount"), recalcStyleSeconds: delta("RecalcStyleDuration"),
        scriptSeconds: delta("ScriptDuration"), taskSeconds: delta("TaskDuration"),
      },
      cpu: analyse(profile),
    };
  } finally {
    await context.close();
  }
}

await mkdir(outDir, { recursive: true });
const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required", "--mute-audio"] });
const results = [];
for (const packId of packs) {
  for (const cpuRate of cpuRates) {
    try {
      const result = await profileOne(browser, packId, cpuRate);
      results.push(result);
      await writeFile(join(outDir, `${packId}-cpu${cpuRate}.json`), JSON.stringify(result, null, 2));
      console.log(packId, `cpu x${cpuRate}`, result.skipped ?? `p50 ${result.frameIntervalMs.p50}ms p90 ${result.frameIntervalMs.p90}ms long tasks ${result.longTasks.count}`);
    } catch (error) {
      console.error(packId, `cpu x${cpuRate}`, "FAILED", error.message);
      results.push({ packId, cpuRate, error: String(error.message) });
    }
  }
}
await browser.close();

const lines = ["# Slider drag profile", "", `base ${base}, viewport ${viewport.width}x${viewport.height}, ${steps} steps out and back`, ""];
for (const result of results) {
  lines.push(`## ${result.packId} (CPU x${result.cpuRate})`);
  if (result.skipped || result.error) { lines.push(result.skipped ?? `FAILED: ${result.error}`, ""); continue; }
  lines.push(`cards ${JSON.stringify(result.cards)}; slider input events ${result.sliderInputEvents}; drag ${result.dragMs}ms`);
  lines.push(`frame interval p50 ${result.frameIntervalMs.p50}ms / p90 ${result.frameIntervalMs.p90}ms / max ${result.frameIntervalMs.max}ms; long tasks ${result.longTasks.count} (${result.longTasks.totalMs}ms total, max ${result.longTasks.maxMs}ms)`);
  lines.push(`layout ${result.chrome.layoutCount}x ${result.chrome.layoutSeconds}s, style recalc ${result.chrome.recalcStyleCount}x ${result.chrome.recalcStyleSeconds}s, script ${result.chrome.scriptSeconds}s`);
  lines.push("", `CPU active ${result.cpu.activeMs}ms. Inclusive time by bucket (ms; buckets overlap):`);
  for (const [name, ms] of Object.entries(result.cpu.buckets).sort((a, b) => b[1] - a[1])) if (ms) lines.push(`- ${name}: ${ms}`);
  lines.push("", "Top self time:");
  for (const item of result.cpu.topSelf.slice(0, 12)) lines.push(`- ${item.ms}ms ${item.name}`);
  lines.push("");
}
await writeFile(join(outDir, "SUMMARY.md"), lines.join("\n"));
console.log(`Wrote ${join(outDir, "SUMMARY.md")}`);
