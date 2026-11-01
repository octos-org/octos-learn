import { setLocale } from "@/i18n";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const check = vi.hoisted(() => ({ results: [] as unknown[] }));
vi.mock("./readability-check", async (original) => ({ ...(await original<object>()), checkReadability: vi.fn(async () => check.results) }));

import type { CompiledLesson } from "./compile-recording";
import { ReadabilityPanel } from "./readability-panel";

const compiled = { lesson: {}, resourceContext: {} } as unknown as CompiledLesson;
const cards = [
  { key: "card-1", title: "The arm", kind: "teach" as const, takes: [] },
  { key: "card-2", title: "Height is sine", kind: "teach" as const, takes: [] },
];

beforeEach(() => setLocale("en-US"));
afterEach(() => { cleanup(); setLocale("zh-CN"); });

it("says when every card is easy to read", async () => {
  check.results = [];
  render(<ReadabilityPanel compiled={compiled} cards={cards} resolveAsset={() => undefined} onOpenCard={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Check my lesson" }));
  expect((await screen.findByRole("status")).textContent).toBe("Every card is easy to read on small laptops and big screens.");
});

it("lists problems per card and screen, and opens the card to fix", async () => {
  check.results = [
    { card: "card-2", board: "chromebook", problems: ["small_text", "out_of_view"] },
    { card: "card-2", board: "large", problems: ["small_text"] },
  ];
  const onOpenCard = vi.fn();
  render(<ReadabilityPanel compiled={compiled} cards={cards} resolveAsset={() => undefined} onOpenCard={onOpenCard} />);
  fireEvent.click(screen.getByRole("button", { name: "Check my lesson" }));
  expect(await screen.findByText("Small laptops: the words are too small to read; part of it is off the screen")).toBeTruthy();
  expect(screen.getByText("Big screens: the words are too small to read")).toBeTruthy();
  expect(screen.queryByText("The arm")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Fix this card" }));
  expect(onOpenCard).toHaveBeenCalledWith("card-2");
});
