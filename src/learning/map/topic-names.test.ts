import { expect, it } from "vitest";

import atlas from "./star-atlas/atlas.json";
import names from "./topic-names-zh.json";

it("names every topic on the atlas, each name its own", () => {
  const map = names.names as Record<string, string>;
  for (const [id] of atlas.topics as unknown as [string][]) expect(map[id]?.trim()).toBeTruthy();
  expect(new Set(Object.values(map)).size).toBe(Object.keys(map).length);
});
