import postcss from "postcss";
import presetEnv from "postcss-preset-env";
import selectorParser from "postcss-selector-parser";
import {
  addLegacySupportsForSrgbColorMixes,
  downlevelOklchColors,
} from "./android-legacy-css";

// ESM support does not imply support for newer built-ins. WebView 74 loads
// the modern bundle, so both delivery paths need the same API coverage.
export const androidLegacyOptions = {
  targets: ["Chrome >= 55"],
  modernTargets: ["Chrome >= 64"],
  modernPolyfills: true,
};

export async function downlevelAndroidCss(source: string): Promise<string> {
  const root = postcss.parse(downlevelOklchColors(addLegacySupportsForSrgbColorMixes(source)));
  // width:min(fixed, fluid) is exactly expressible using width + max-width.
  // Keep this in a feature query so newer engines retain the authored cascade.
  // This also covers controls and dialogs supplied by the shared OLL runtime.
  root.walkRules((rule) => {
    const fallback = rule.clone({ nodes: [] });
    rule.each((node) => {
      if (node.type !== "decl" || !/^(width|height)$/.test(node.prop)) return;
      const match = node.value.match(/^min\((.*)\)$/);
      if (!match) return;
      const parts = postcss.list.comma(match[1]!);
      if (parts.length !== 2 || rule.nodes.some(n => n.type === "decl" && n.prop === `max-${node.prop}`)) return;
      const fixed = parts.find(part => /^\d*\.?\d+(?:px|rem|em)$/.test(part));
      const fluid = parts.find(part => part !== fixed);
      if (!fixed || !fluid || /\b(?:min|max|clamp)\(/.test(fluid)) return;
      fallback.append(node.clone({ value: fixed }), node.clone({ prop: `max-${node.prop}`, value: fluid }));
    });
    if (!fallback.nodes.length) return;
    const guard = postcss.atRule({ name: "supports", params: "not (width: min(1px, 2px))" });
    guard.append(fallback);
    rule.before(guard);
  });
  // :where() has zero specificity and cannot be replaced globally without
  // changing modern styling. Only the engines missing it see these rules.
  root.walkRules((rule) => {
    if (!rule.selector.includes(":where(")) return;
    const selector = selectorParser((selectors) => {
      selectors.walkPseudos((pseudo) => {
        if (pseudo.value === ":where") pseudo.value = ":is";
      });
    }).processSync(rule.selector);
    const fallback = postcss.atRule({ name: "supports", params: "not selector(:where(*))" });
    fallback.append(rule.clone({ selector }));
    rule.before(fallback);
  });
  const result = await postcss([
    presetEnv({
      stage: false,
      browsers: ["Chrome 64"],
      features: {
        "cascade-layers": true,
        "logical-properties-and-values": true,
        "is-pseudo-class": true,
        "media-query-ranges": true,
        "nesting-rules": true,
      },
    }),
  ]).process(root, {
    from: undefined,
    map: false,
  });
  return result.css;
}
