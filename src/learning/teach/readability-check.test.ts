import { describe, expect, it } from "vitest";
import { readabilityProblems } from "./readability-check";

describe("readabilityProblems", () => {
  it("names each readability problem once and ignores checks that are not about reading", () => {
    expect(readabilityProblems(["G3_TEXT_TOO_SMALL", "G1_ACTIVE_TARGET_NOT_VISIBLE", "G3_TEXT_TOO_SMALL", "G3_FOCUS_OUT_OF_VIEW", "G3_ASSET_LOAD_FAILED"]))
      .toEqual(["small_text", "out_of_view", "missing_ink"]);
    expect(readabilityProblems(["G1_NODE_REMOUNTED"])).toEqual([]);
  });
});
