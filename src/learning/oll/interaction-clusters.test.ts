import { describe, expect, it } from "vitest";
import type { SemanticBoardState } from "octos-lesson-language";
import { buildInteractionClusters } from "./interaction-clusters";

function board(nodes: SemanticBoardState["nodes"]): SemanticBoardState {
  return {
    board_id: "board",
    revision: 1,
    nodes,
    groups: {},
    connections: {},
    focus: [],
    applied_lessons: [],
    applied_steps: [],
    applied_actions: [],
  };
}

describe("interaction clusters", () => {
  it("keeps controls visible while their visual has not arrived yet", () => {
    expect(buildInteractionClusters(board({}), {
      id: "course",
      nodeIds: ["future-plot"],
      variableAliases: ["n"],
    }, ["n"], [])).toEqual([{
      id: "course:interaction:pending",
      anchorNodeId: "",
      nodeIds: [],
      variableAliases: ["n"],
      taskIds: [],
    }]);
  });

  it("joins controls and tasks through visual variable bindings", () => {
    const result = buildInteractionClusters(board({
      formula: {
        id: "formula",
        kind: "math",
        region_id: "course",
        content: { latex: "y=sin(x)" },
      },
      circle: {
        id: "circle",
        kind: "geometry",
        region_id: "course",
        content: { bindings: [{ target: "p.y", expression: "sin(theta)" }] },
      },
      plot: {
        id: "plot",
        kind: "plot",
        region_id: "course",
        content: {
          curves: [{ expression: "a*x+b" }],
          points: [{ interaction: { kind: "angle_control", variable: "theta" } }],
        },
      },
    }), {
      id: "course",
      nodeIds: ["formula", "circle", "plot"],
      variableAliases: ["theta", "a", "b"],
      taskTargets: {
        rotate: { variableAliases: ["theta"], nodeIds: [] },
        tune: { variableAliases: ["a", "b"], nodeIds: [] },
      },
    }, ["theta", "a", "b"], ["rotate", "tune"]);

    expect(result).toEqual([{
      id: "course:interaction:1",
      anchorNodeId: "plot",
      nodeIds: ["circle", "plot"],
      variableAliases: ["theta", "a", "b"],
      taskIds: ["rotate", "tune"],
    }]);
  });

  it("keeps separate visuals in separate interaction groups", () => {
    const result = buildInteractionClusters(board({
      plot: {
        id: "plot",
        kind: "plot",
        region_id: "course",
        content: { curves: [{ expression: "a*x" }] },
      },
      scene: {
        id: "scene",
        kind: "scene3d",
        region_id: "course",
        content: { bindings: [{ target: "section.value", expression: "height" }] },
      },
    }), {
      id: "course",
      nodeIds: ["plot", "scene"],
      variableAliases: ["a", "height"],
      taskTargets: {},
    }, ["a", "height"], []);

    expect(result.map((cluster) => ({
      anchor: cluster.anchorNodeId,
      variables: cluster.variableAliases,
    }))).toEqual([
      { anchor: "plot", variables: ["a"] },
      { anchor: "scene", variables: ["height"] },
    ]);
  });

  it("anchors scene-only tasks without inventing prose relationships", () => {
    const result = buildInteractionClusters(board({
      note: {
        id: "note",
        kind: "note",
        region_id: "course",
        content: { text: "观察立方体" },
      },
      scene: {
        id: "scene",
        kind: "scene3d",
        region_id: "course",
        content: {},
      },
    }), {
      id: "course",
      nodeIds: ["note", "scene"],
      taskTargets: {
        inspect: { variableAliases: [], nodeIds: ["scene"] },
        resetView: { variableAliases: [], nodeIds: ["scene"] },
      },
    }, [], ["inspect", "resetView"]);

    expect(result).toEqual([{
      id: "course:interaction:1",
      anchorNodeId: "scene",
      nodeIds: ["scene"],
      variableAliases: [],
      taskIds: ["inspect", "resetView"],
    }]);
  });
});
