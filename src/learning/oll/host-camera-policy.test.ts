import { describe, expect, it } from "vitest";
import {
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

  it("keeps ordinary Beat composition focus outside variable animation", () => {
    expect(planHostTeachingFocus(base)).toEqual({
      source: "composition",
      targets: ["primary-geometry"],
    });
  });
});
