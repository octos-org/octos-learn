import { expect, test, type Page } from "@playwright/test";
import type { SavedLesson } from "../src/learning/teach/learner-lessons-api";
import { installTestAccount } from "./helpers/course-test-account";

function lesson(id: string, title: string, recorded: number, saved = false): SavedLesson {
  const now = "2026-11-05T08:00:00.000Z";
  return {
    lesson_id: id, title, state: "draft", star_topic_id: null, revision: 1,
    created_at: now, updated_at: now, saved_at: saved ? now : null, changed_since_saved: false,
    saved: saved ? { content_sha256: "a".repeat(64), bytes: 100, language: "zh-CN", cards: 4, practice_tasks: 0,
      author: { learner_ref: "learner:test", avatar_ref: "avatar:star-fox", voice_ref: "voice:test" } } : null,
    recording: {
      schema: "octos.learner-recording.v1", id, createdAt: now, updatedAt: now,
      topic: { text: title, type: "math_off_map" }, goals: ["把每一步的原因讲清楚。"],
      cards: Array.from({ length: 4 }, (_, index) => ({ key: `card-${index + 1}`, title: `第 ${index + 1} 张`, kind: "teach",
        takes: index < recorded ? [{ take: 1, status: "kept", startedAt: now, durationMs: 1000, text: "讲解", events: [] }] : [] })),
    }, ink: {},
  };
}

/** All course traffic, including deletion, is confined to this browser fixture. */
async function fixture(page: Page, failDelete = false) {
  await installTestAccount(page);
  await page.addInitScript(() => localStorage.setItem("octos-locale", "zh-CN"));
  let lessons = [lesson("rec-area", "长方体的表面积", 4), lesson("rec-water", "水的循环", 1), lesson("rec-saved", "解一元一次方程", 4, true)];
  const deleted: string[] = [];
  await page.route("**/api/learn/lessons**", async (route) => {
    const url = new URL(route.request().url()), method = route.request().method();
    const id = url.pathname.split("/")[4];
    if (method === "DELETE") {
      if (failDelete) return route.fulfill({ status: 503, json: { error: "Synthetic deletion failure" } });
      deleted.push(id); lessons = lessons.filter((entry) => entry.lesson_id !== id);
      return route.fulfill({ json: { ok: true } });
    }
    if (method !== "GET") return route.fulfill({ status: 405 });
    if (!id) return route.fulfill({ json: { lessons } });
    const found = lessons.find((entry) => entry.lesson_id === id);
    return route.fulfill({ status: found ? 200 : 404, json: { lesson: found } });
  });
  await page.goto("/teach");
  await expect(page.locator(".teach-library-card")).toHaveCount(3);
  return deleted;
}

test("direct entry syncs account courses, filters them, and separates new lesson planning", async ({ page }) => {
  await fixture(page);
  const filters = page.getByRole("group", { name: "课程筛选" });
  await filters.getByRole("button", { name: /^已保存/ }).click();
  await expect(page.locator(".teach-library-card")).toHaveCount(1);
  await expect(page.getByRole("link", { name: "播放课", exact: true })).toBeVisible();
  await filters.getByRole("button", { name: /^草稿/ }).click();
  await expect(page.locator(".teach-library-card")).toHaveCount(2);
  await page.getByRole("link", { name: "讲一节新课", exact: true }).click();
  await expect(page).toHaveURL(/\/teach\/new$/);
  await expect(page.getByRole("heading", { name: "讲一节新课", exact: true })).toBeVisible();
  await expect(page.locator(".teach-library-card")).toHaveCount(0);
  await page.goto("/teach/lessons");
  await expect(page).toHaveURL(/\/teach$/);
  await expect(page.locator(".teach-library-card")).toHaveCount(3);
});

test("deletion uses a native modal, focuses Cancel, restores focus, and requires confirmation", async ({ page }) => {
  const deleted = await fixture(page);
  const more = page.getByLabel("“长方体的表面积”的更多操作");
  await more.click();
  await page.getByRole("button", { name: "删除", exact: true }).click();
  const dialog = page.getByRole("alertdialog", { name: "删除“长方体的表面积”？" });
  await expect(dialog).toBeVisible();
  expect(await dialog.evaluate((element) => element.matches(":modal"))).toBe(true);
  await expect(dialog.getByRole("button", { name: "取消", exact: true })).toBeFocused();
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press("Tab");
    expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(more).toBeFocused();
  expect(deleted).toEqual([]);
  await more.click();
  await page.getByRole("button", { name: "删除", exact: true }).click();
  await dialog.getByRole("button", { name: "确定删除", exact: true }).click();
  await expect(page.locator(".teach-library-card")).toHaveCount(2);
  expect(deleted).toEqual(["rec-area"]);
});

test("a failed deletion stays in the modal and leaves the course visible", async ({ page }) => {
  const deleted = await fixture(page, true);
  await page.getByLabel("“长方体的表面积”的更多操作").click();
  await page.getByRole("button", { name: "删除", exact: true }).click();
  const dialog = page.getByRole("alertdialog");
  await dialog.getByRole("button", { name: "确定删除", exact: true }).click();
  await expect(dialog.getByRole("alert")).toBeVisible();
  expect(deleted).toEqual([]);
  await dialog.getByRole("button", { name: "取消", exact: true }).click();
  await expect(page.locator(".teach-library-card")).toHaveCount(3);
});

test("the library and deletion modal fit a phone screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await fixture(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByLabel("“长方体的表面积”的更多操作").click();
  await page.getByRole("button", { name: "删除", exact: true }).click();
  const box = await page.getByRole("alertdialog").boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(16);
  expect(box!.x + box!.width).toBeLessThanOrEqual(374);
  await page.keyboard.press("Escape");
});
