// The standalone Arcade (docs/ARCADE_PLAN.md decision 18, M1): full rounds by
// number pad and by tapped choices, with no learning server behind the page.

import { expect, test, type Page } from "@playwright/test";

/** The learning server's paths, not the app's own src/api modules. */
const serverPath = (url: URL) => url.pathname.startsWith("/api/");

function solve(tokens: string[]): number {
  const [a, op, b, , c] = tokens;
  const apply: Record<string, (x: number, y: number) => number> = { "+": (x, y) => x + y, "−": (x, y) => x - y, "×": (x, y) => x * y, "÷": (x, y) => x / y };
  if (c === "?") return apply[op](Number(a), Number(b));
  const whole = Number(c);
  const known = Number(a === "?" ? b : a);
  if (op === "+") return whole - known;
  throw new Error(`Unexpected prompt ${tokens.join(" ")}`);
}

async function promptTokens(page: Page): Promise<string[]> {
  return page.locator(".arcade-fact-strip > span:not(.arcade-paperclip)").allInnerTexts();
}

async function playRound(page: Page, answer: (value: number) => Promise<void>) {
  const round = page.locator("main.arcade-round");
  await page.getByRole("button", { name: "开始" }).click();
  for (let index = 0; index < 20; index++) {
    await expect(round).toHaveAttribute("data-index", String(index));
    await expect(round).toHaveAttribute("data-phase", "asking");
    await answer(solve(await promptTokens(page)));
  }
  await expect(round).toHaveAttribute("data-phase", "results");
}

test.describe("Arcade", () => {
  test("plays a full number-pad round with no server and keeps progress on the device", async ({ page }) => {
    const calls: string[] = [];
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    // The learning server is down: every API call fails.
    await page.route(serverPath, route => { calls.push(route.request().url()); return route.abort(); });

    await page.goto("/arcade");
    await page.getByRole("link", { name: "开始玩" }).click();
    await page.locator(".arcade-skill-card").filter({ hasText: "10 以内加减" }).click();
    await page.getByRole("button", { name: "数字键盘" }).click();
    await page.locator(".arcade-game-card").filter({ hasText: "页边快跑" }).click();
    await expect(page.locator("canvas.arcade-game-canvas")).toBeVisible();

    await playRound(page, async value => { await page.keyboard.type(String(value)); });
    const results = page.getByRole("region", { name: "本局结果" });
    await expect(results).toContainText("答对 20 / 20 题");
    await expect(results).toContainText("最长连对 20 题");

    await page.goto("/arcade");
    await expect(page.locator(".arcade-home-total")).toContainText(/已收集 \d+ 滴墨水/);
    await expect(page.locator(".arcade-home-total")).not.toContainText("已收集 0 滴");
    // Only the app shell's sign-in check touches the server; the Arcade itself makes no request.
    expect(calls.filter(url => !url.includes("/api/auth/status"))).toEqual([]);
    expect(errors).toEqual([]);
  });

  test("plays a full two-choice round by tapping, and a wrong pick comes back later", async ({ page }) => {
    await page.route(serverPath, route => route.abort());
    await page.goto("/arcade/play/mul-2-5-10/margin-run?input=tap");
    await expect(page.locator("canvas.arcade-game-canvas")).toBeVisible();
    let missed = false;
    await playRound(page, async value => {
      const choices = page.locator(".arcade-choice");
      const texts = await choices.allInnerTexts();
      expect(texts).toHaveLength(2);
      expect(texts.map(Number)).toContain(value);
      const right = texts.findIndex(text => Number(text) === value);
      // Miss the first item once, on purpose.
      const pick = !missed ? 1 - right : right;
      missed = true;
      await choices.nth(pick).click();
    });
    const results = page.getByRole("region", { name: "本局结果" });
    await expect(results).toContainText("答对 19 / 20 题");
  });

  test("Show me reveals the answer and leaving early ends the round", async ({ page }) => {
    await page.route(serverPath, route => route.abort());
    await page.goto("/arcade/play/add-sub-5/margin-run?input=keypad");
    await page.getByRole("button", { name: "开始" }).click();
    const round = page.locator("main.arcade-round");
    await expect(round).toHaveAttribute("data-phase", "asking");
    const expected = solve(await promptTokens(page));
    await page.getByRole("button", { name: "告诉我" }).click();
    await expect(page.locator(".arcade-fact-strip .arcade-blank")).toHaveText(String(expected));
    await expect(page.locator(".arcade-fact-note")).toBeVisible();
    await page.getByRole("button", { name: "← 返回" }).click();
    await expect(page).toHaveURL(/\/arcade\/skills\/add-sub-5\/games$/);
    await expect(page.locator("canvas.arcade-game-canvas")).toHaveCount(0);
  });
});
