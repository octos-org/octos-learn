import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { chromium } from "playwright";

const roots = {
  baseline: process.env.BASELINE_DIST,
  candidate: process.env.CANDIDATE_DIST,
};
if (!roots.baseline || !roots.candidate) {
  throw new Error("Set BASELINE_DIST and CANDIDATE_DIST");
}

const contentTypes = new Map([
  [".css", "text/css"], [".html", "text/html"], [".js", "text/javascript"],
  [".json", "application/json"], [".svg", "image/svg+xml"], [".woff", "font/woff"],
  [".woff2", "font/woff2"],
]);

function serve(root) {
  const server = createServer(async (request, response) => {
    const pathname = decodeURIComponent(new URL(request.url ?? "/", "http://local").pathname);
    const relative = normalize(pathname).replace(/^\/+/, "");
    let target = join(root, relative || "index.html");
    try {
      if ((await stat(target)).isDirectory()) target = join(target, "index.html");
    } catch {
      target = join(root, "index.html");
    }
    try {
      const body = await readFile(target);
      response.setHeader("Cache-Control", "no-store");
      response.setHeader("Content-Type", contentTypes.get(extname(target)) ?? "application/octet-stream");
      response.end(body);
    } catch {
      response.statusCode = 404;
      response.end();
    }
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

const servers = Object.fromEntries(await Promise.all(Object.entries(roots).map(async ([name, root]) =>
  [name, await serve(root)])));
const browser = await chromium.launch({
  headless: true,
  ...(process.env.OLL_BROWSER_EXECUTABLE ? { executablePath: process.env.OLL_BROWSER_EXECUTABLE } : {}),
});

const rows = [];
const repeats = Number(process.env.STARTUP_REPEATS || 30);
try {
  for (let repeat = -2; repeat < repeats; repeat++) {
    for (const version of (repeat % 2 ? ["candidate", "baseline"] : ["baseline", "candidate"])) {
      const context = await browser.newContext();
      const page = await context.newPage();
      await page.route("**/api/**", (route) => route.fulfill({ status: 503, contentType: "application/json", body: "{}" }));
      const address = servers[version].address();
      const started = performance.now();
      await page.goto(`http://127.0.0.1:${address.port}`, { waitUntil: "load" });
      await page.waitForFunction(() => Boolean(document.querySelector("#root")?.childElementCount));
      const wall = performance.now() - started;
      const navigation = await page.evaluate(() => {
        const entry = performance.getEntriesByType("navigation")[0];
        return { domContentLoaded: entry.domContentLoadedEventEnd, load: entry.loadEventEnd };
      });
      if (repeat >= 0) rows.push({ repeat, version, wall, ...navigation });
      await context.close();
    }
  }
} finally {
  await browser.close();
  for (const server of Object.values(servers)) server.close();
}

function percentile(values, fraction) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(sorted.length * fraction) - 1];
}
const summary = Object.fromEntries(Object.keys(roots).map((version) => {
  const selected = rows.filter((row) => row.version === version);
  return [version, Object.fromEntries(["wall", "domContentLoaded", "load"].map((field) => {
    const values = selected.map((row) => row[field]);
    return [field, { p50: percentile(values, 0.5), p95: percentile(values, 0.95) }];
  }))];
}));
const paired = Object.fromEntries(["wall", "domContentLoaded", "load"].map((field) => {
  const deltas = Array.from({ length: repeats }, (_, repeat) => {
    const baseline = rows.find((row) => row.repeat === repeat && row.version === "baseline");
    const candidate = rows.find((row) => row.repeat === repeat && row.version === "candidate");
    return candidate[field] - baseline[field];
  });
  return [field, {
    delta_p50: percentile(deltas, 0.5),
    delta_p95: percentile(deltas, 0.95),
    candidate_faster: deltas.filter((value) => value < 0).length,
  }];
}));
console.log(JSON.stringify({ repeats, summary, paired,
  ...(process.env.STARTUP_INCLUDE_ROWS === "true" ? { rows } : {}),
}, null, 2));
