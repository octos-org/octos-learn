// How Studio compiled the unit circle, polygon, graph and diagram panels
// before they came from the OLL plugins (decision 0012). Used only to check a
// hand-edited OLL saved before that change: its fingerprint was taken from
// this output, and a renderer upgrade must not invalidate the edit.

type Content = Record<string, unknown>;

export function prePluginUnitCircle(alias: string, variable: string, title: { title?: string }, place: unknown): Content {
  return {
    do: "write", as: alias, kind: "geometry", role: "diagram", place,
    content: {
      ...title,
      axes: { x: { min: -1.25, max: 1.25, label: "x" }, y: { min: -1.25, max: 1.25, label: "y" }, equal_scale: true },
      points: [
        { as: "origin", x: 0, y: 0, label: "O" },
        { as: "point-p", x: 1, y: 0, label: "P", interaction: { kind: "angle_control", variable, center: "origin" } },
        { as: "foot", x: 1, y: 0, label: "" },
      ],
      circles: [{ as: "circle", center: "origin", radius: 1, label: "r = 1" }],
      segments: [
        { as: "radius", from: "origin", to: "point-p", label: "1", style: "solid" },
        { as: "height", from: "point-p", to: "foot", label: "sin θ", style: "projection" },
      ],
      arcs: [{ as: "angle", center: "origin", radius: 0.28, start_angle: 0, end_angle: 0, label: "θ" }],
      bindings: [
        { target: "point-p.x", expression: `cos(${variable})` },
        { target: "point-p.y", expression: `sin(${variable})` },
        { target: "foot.x", expression: `cos(${variable})` },
        { target: "angle.end_angle", expression: variable },
      ],
    },
  };
}

export function prePluginPolygon(alias: string, sides: number, slider: string | undefined, label: string, title: { title?: string }, place: unknown): Content {
  const content: Content = {
    ...title,
    axes: { x: { min: -1.3, max: 1.3, label: "x" }, y: { min: -1.3, max: 1.3, label: "y" }, equal_scale: true },
    points: [{ as: "origin", x: 0, y: 0, label: "O" }],
    circles: [{ as: "circle", center: "origin", radius: 1, label: "r = 1" }],
    regular_polygons: [{ as: "polygon", center: "origin", radius: 1, sides, relation: "inscribed", show_measurements: true, label }],
  };
  if (slider) content.bindings = [{ target: "polygon.sides", expression: slider }];
  return { do: "write", as: alias, kind: "geometry", role: "diagram", content, place };
}

/** The graph's content; the action wraps a copy of it. */
export function prePluginGraphContent(
  expression: string, written: string, x: [number, number], y: [number, number], linked: string | undefined, title: { title?: string },
): Content {
  const content: Content = {
    ...title,
    axes: { x: { min: x[0], max: x[1] }, y: { min: y[0], max: y[1] } },
    curves: [{ as: "curve", expression, label: `y = ${written}` }],
  };
  if (linked) {
    content.points = [{ as: "current", x: x[0], y: 0, label: "now" }];
    content.bindings = [
      { target: "current.x", expression: linked },
      { target: "current.y", expression: written.replace(/\bx\b/g, linked) },
    ];
  }
  return content;
}

export const prePluginCurveId = (count: number) => `curve-${count + 1}`;

export function prePluginDiagramContent(diagram: { shape: "steps" | "cycle"; title: string; boxes: Array<{ label: string; link?: string }> }): Content {
  const elements = diagram.boxes.map((box, index) => ({ as: `box-${index + 1}`, label: box.label }));
  const edges: Content[] = diagram.boxes.slice(1).map((box, index) => ({
    as: `link-${index + 2}`, from: `box-${index + 1}`, to: `box-${index + 2}`, ...(box.link ? { label: box.link } : {}),
  }));
  if (diagram.shape === "cycle" && diagram.boxes.length > 2) edges.push({ as: "link-close", from: `box-${diagram.boxes.length}`, to: "box-1" });
  return { title: diagram.title, elements, edges };
}
