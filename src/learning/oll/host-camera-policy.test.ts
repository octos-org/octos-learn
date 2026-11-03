import { describe, expect, it } from "vitest";
import {
  compositionTargetsRendered,
  planHostTeachingFocus,
  type HostTeachingFocusInput,
} from "./host-camera-policy";

const base: HostTeachingFocusInput = {
  teachingFocusAllowed: true,
  attentionTargets: [],
  attentionChanged: false,
  compositionTargets: ["primary-geometry"],
  compositionChanged: true,
  compositionOperationChanged: false,
  atPlaybackBoundary: false,
  boardFocus: [],
  focusChanged: false,
  variableAnimationActive: false,
};

describe("host teaching camera policy", () => {
  it("does not narrow OLL's multi-visual camera during variable animation", () => {
    expect(planHostTeachingFocus({
      ...base,
      variableAnimationActive: true,
    })).toBeNull();
  });

  it("still honors an explicit attention request during variable animation", () => {
    expect(planHostTeachingFocus({
      ...base,
      attentionTargets: ["explicit-target"],
      attentionChanged: true,
      variableAnimationActive: true,
    })).toEqual({ source: "attention", targets: ["explicit-target"] });
  });

  it("returns to the Beat's own targets when a variable animation ends", () => {
    expect(planHostTeachingFocus({
      ...base,
      compositionChanged: false,
      variableAnimationEnded: true,
    })).toEqual({ source: "composition", targets: ["primary-geometry"] });
  });

  it("does not recompose after an animation when the Beat names no target", () => {
    expect(planHostTeachingFocus({
      ...base,
      compositionTargets: [],
      compositionChanged: false,
      variableAnimationEnded: true,
    })).toBeNull();
  });

  it("keeps ordinary Beat composition focus outside variable animation", () => {
    expect(planHostTeachingFocus(base)).toEqual({
      source: "composition",
      targets: ["primary-geometry"],
    });
  });

  it("does not refocus an unchanged composition just because a new Beat began", () => {
    expect(planHostTeachingFocus({
      ...base,
      compositionChanged: false,
      compositionOperationChanged: false,
      atPlaybackBoundary: true,
    })).toBeNull();
  });

  it("applies the same composition focus to packaged lessons as to live ones", () => {
    expect(planHostTeachingFocus({
      ...base,
      compositionTargets: ["model-derived-target"],
      compositionChanged: true,
      atPlaybackBoundary: true,
      boardFocus: ["persistent-old-target"],
      focusChanged: true,
    })).toEqual({ source: "composition", targets: ["model-derived-target"] });
  });

  it("applies the same attention focus to packaged lessons as to live ones", () => {
    expect(planHostTeachingFocus({
      ...base,
      attentionTargets: ["chosen-outline-target"],
      attentionChanged: true,
    })).toEqual({ source: "attention", targets: ["chosen-outline-target"] });
  });
});

describe("compositionTargetsRendered", () => {
  it("is false while a Beat's targets have not been created yet", () => {
    expect(compositionTargetsRendered({ nodes: {}, groups: {}, connections: {} }, ["first-card"])).toBe(false);
    expect(compositionTargetsRendered(undefined, ["first-card"])).toBe(false);
  });

  it("is true once any target exists as a node, group or connection", () => {
    expect(compositionTargetsRendered({ nodes: { "first-card": {} } }, ["first-card", "later-card"])).toBe(true);
    expect(compositionTargetsRendered({ groups: { pair: {} } }, ["pair"])).toBe(true);
    expect(compositionTargetsRendered({ connections: { link: {} } }, ["link"])).toBe(true);
  });
});
