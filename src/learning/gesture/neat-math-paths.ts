import svgpath from "svgpath";
import type { InkSelectionBounds } from "../oll/oll-ink-runtime";
import { tr } from "@/i18n";

async function createTypesetter() {
  const [{ mathjax }, { TeX }, { SVG }, { liteAdaptor }, { RegisterHTMLHandler }] = await Promise.all([
    import("mathjax-full/js/mathjax.js"), import("mathjax-full/js/input/tex.js"),
    import("mathjax-full/js/output/svg.js"), import("mathjax-full/js/adaptors/liteAdaptor.js"),
    import("mathjax-full/js/handlers/html.js"),
  ]);
  await import("mathjax-full/js/input/tex/ams/AmsConfiguration.js");
  const adaptor = liteAdaptor();
  RegisterHTMLHandler(adaptor);
  const document = mathjax.document("", {
    InputJax: new TeX({ packages: ["base", "ams"], maxBuffer: 4096, maxMacros: 1000 }),
    OutputJax: new SVG({ fontCache: "none" }),
  });
  return (latex: string) => adaptor.outerHTML(document.convert(latex, { display: true }));
}
let typesetter: ReturnType<typeof createTypesetter> | undefined;

/** Convert trusted local typesetting into durable, editable vector ink. */
export async function neatMathPaths(latex: string, bounds: InkSelectionBounds): Promise<string[]> {
  if (!latex.trim() || latex.length > 2000 || !Object.values(bounds).every(Number.isFinite)
    || bounds.width <= 0 || bounds.height <= 0) throw new Error(tr("这段公式暂时无法排版，原手写已保留。"));
  typesetter ??= createTypesetter().catch(error => { typesetter = undefined; throw error; });
  const markup = (await typesetter)(latex);
  const tree = new DOMParser().parseFromString(markup, "text/html");
  const svg = tree.querySelector("svg");
  if (!svg || svg.querySelector('[data-mml-node="merror"], [data-mjx-error], text')) {
    throw new Error(tr("公式没有完整排版，原手写已保留。"));
  }
  const viewBox = svg.getAttribute("viewBox")?.trim().split(/[\s,]+/).map(Number);
  if (!viewBox || viewBox.length !== 4 || !viewBox.every(Number.isFinite) || viewBox[2] <= 0 || viewBox[3] <= 0) {
    throw new Error(tr("公式排版范围无效，原手写已保留。"));
  }
  const [x, y, width, height] = viewBox;
  const scale = Math.min(bounds.width / width, bounds.height / height);
  const left = bounds.x + (bounds.width - width * scale) / 2;
  const top = bounds.y + (bounds.height - height * scale) / 2;
  const paths: string[] = [];
  const walk = (element: Element, inherited: string) => {
    const transform = `${inherited} ${element.getAttribute("transform") ?? ""}`;
    const tag = element.localName;
    let d = "";
    if (tag === "path") d = element.getAttribute("d") ?? "";
    else if (tag === "rect") {
      const read = (name: string) => Number(element.getAttribute(name) ?? 0);
      const rx = read("x"), ry = read("y"), rw = read("width"), rh = read("height");
      if (![rx, ry, rw, rh].every(Number.isFinite)) throw new Error(tr("公式排版范围无效，原手写已保留。"));
      d = `M${rx} ${ry}h${rw}v${rh}h${-rw}Z`;
    } else if (tag === "defs" || tag === "title" || tag === "desc") return;
    else if (tag !== "g" && element !== svg) throw new Error(tr("这段公式暂时无法排版，原手写已保留。"));
    // js-draw accepts explicit quadratic/cubic curves, not SVG's S/T or A
    // shorthands. Expand them before handing the typeset glyphs to the editor.
    if (d) paths.push(svgpath(d).unshort().unarc().transform(transform).abs().round(3).toString());
    for (const child of element.children) walk(child, transform);
  };
  walk(svg, `translate(${left},${top}) scale(${scale}) translate(${-x},${-y})`);
  if (!paths.length || paths.length > 2048 || paths.join("").length > 4_000_000) {
    throw new Error(tr("公式过于复杂，原手写已保留。"));
  }
  return paths;
}
