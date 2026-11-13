// Inline math in lesson text Learn draws itself must survive the workspace CSS: a host rule that reaches
// every descendant span (font-size, overflow) clipped KaTeX's exponent and fraction (review of #151).
// Usage: start the dev server, then `node scripts/check-lesson-text-browser.mjs` (BOARD_PROBE_URL to override).
import { chromium } from "playwright";
const browser = await chromium.launch({ headless: true,
  ...(process.env.OLL_BROWSER_EXECUTABLE ? { executablePath: process.env.OLL_BROWSER_EXECUTABLE } : {}) });

try {
  const page = await browser.newPage({ viewport: { width: 1000, height: 1400 }, ignoreHTTPSErrors: true });
  page.on("pageerror", (error) => console.log("PAGEERROR", error.message));
  await page.route("**/__lesson_text_probe", (route) => route.fulfill({ contentType: "text/html", body: `<!doctype html><html><head><meta charset="utf-8"></head><body><div id="root"></div><script type="module">import RefreshRuntime from '/@react-refresh';RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;</script><script type="module" src="/scripts/lesson-text-probe.tsx"></script></body></html>` }));
  await page.goto(`${process.env.BOARD_PROBE_URL || "http://localhost:5174"}/__lesson_text_probe`);
  await page.waitForFunction(() => document.querySelectorAll("[data-probe] .katex").length >= 11, {}, { timeout: 30000 });
  await page.evaluate(() => document.fonts.ready);
  const failures = [];
  for (const group of await page.evaluate(() => window.probeNames)) {
    await page.evaluate((name) => window.showProbe(name), group);
    await page.waitForTimeout(150);
    failures.push(...await page.evaluate((group) => {
    const out = [];
    for (const host of document.querySelectorAll(`[data-probe-group="${group}"] [data-probe], [data-probe-group="${group}"][data-probe]`)) {
      const name = host.getAttribute("data-probe");
      const html = host.querySelector(".katex-html");
      if (!html) { out.push(`${name}: no formula`); continue; }
      // The exponent and both parts of the fraction must have a size and must not be cut off: every
      // ancestor that hides overflow (up to the page) has to contain them whole.
      const parts = { exponent: html.querySelector(".msupsub .mord"), numerator: html.querySelector(".mfrac .vlist > span:last-child .mord"), denominator: html.querySelector(".mfrac .vlist > span:first-child .mord") };
      for (const [part, element] of Object.entries(parts)) {
        if (!element) { out.push(`${name}: ${part} missing`); continue; }
        const rect = element.getBoundingClientRect();
        if (rect.width < 2 || rect.height < 2) { out.push(`${name}: ${part} has no size`); continue; }
        for (let ancestor = element.parentElement; ancestor && ancestor !== document.body; ancestor = ancestor.parentElement) {
          const style = getComputedStyle(ancestor);
          const box = ancestor.getBoundingClientRect();
          const cutSideways = style.overflowX !== "visible" && (rect.left < box.left - 1 || rect.right > box.right + 1);
          const cutVertically = style.overflowY !== "visible" && (rect.top < box.top - 1 || rect.bottom > box.bottom + 1);
          if (cutSideways || cutVertically) {
            out.push(`${name}: ${part} is cut off by ${ancestor.className || ancestor.tagName}`);
            break;
          }
        }
      }
      // KaTeX sizes its parts in em; a host font-size on every span shrinks them to one size.
      const base = Number.parseFloat(getComputedStyle(html).fontSize);
      const exponent = parts.exponent && Number.parseFloat(getComputedStyle(parts.exponent).fontSize);
      if (exponent && !(exponent < base * 0.9)) out.push(`${name}: exponent is not smaller than the formula (${exponent}px vs ${base}px)`);
    }
    return out;
    }, group));
  }
  if (failures.length) throw new Error(`lesson text math is damaged by host CSS:\n  ${failures.join("\n  ")}`);
  console.log("lesson text browser checks passed: exponent and fraction visible and sized in title, degraded notice, practice, thinking question and outline");
} finally {
  await browser.close();
}
