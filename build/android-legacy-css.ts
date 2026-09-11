function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}

function linearToSrgb(value: number): number {
  const clamped = clamp(value);
  return clamped <= 0.0031308
    ? clamped * 12.92
    : 1.055 * Math.pow(clamped, 1 / 2.4) - 0.055;
}

export function downlevelOklchColors(source: string): string {
  return source.replace(
    /oklch\(\s*([+-]?(?:\d*\.)?\d+)(%)?\s+([+-]?(?:\d*\.)?\d+)\s+([+-]?(?:\d*\.)?\d+)(?:deg)?(?:\s*\/\s*([+-]?(?:\d*\.)?\d+)(%)?)?\s*\)/gi,
    (_match, lightnessText: string, lightnessPercent: string | undefined,
      chromaText: string, hueText: string, alphaText: string | undefined,
      alphaPercent: string | undefined) => {
      const lightness = Number(lightnessText) / (lightnessPercent ? 100 : 1);
      const chroma = Number(chromaText);
      const hue = Number(hueText) * Math.PI / 180;
      const alpha = alphaText === undefined
        ? 1
        : Number(alphaText) / (alphaPercent ? 100 : 1);
      const a = chroma * Math.cos(hue);
      const b = chroma * Math.sin(hue);

      const lRoot = lightness + 0.3963377774 * a + 0.2158037573 * b;
      const mRoot = lightness - 0.1055613458 * a - 0.0638541728 * b;
      const sRoot = lightness - 0.0894841775 * a - 1.291485548 * b;
      const l = lRoot ** 3;
      const m = mRoot ** 3;
      const s = sRoot ** 3;
      const red = linearToSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s);
      const green = linearToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s);
      const blue = linearToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s);
      const channels = [red, green, blue].map((channel) => Math.round(channel * 255));

      return alpha < 1
        ? `rgba(${channels.join(", ")}, ${clamp(alpha)})`
        : `rgb(${channels.join(", ")})`;
    },
  );
}

function splitTopLevelCommas(value: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character === "(") depth += 1;
    else if (character === ")") depth -= 1;
    else if (character === "," && depth === 0) {
      parts.push(value.slice(start, index).trim());
      start = index + 1;
    }
  }
  parts.push(value.slice(start).trim());
  return parts;
}

function parseColorStop(stop: string): { color: string; weight: number } {
  const weighted = stop.match(/^(.*\S)\s+([+-]?(?:\d*\.)?\d+)%\s*$/);
  return weighted
    ? { color: weighted[1]!, weight: Number(weighted[2]) }
    : { color: stop.trim(), weight: 50 };
}

function colorMixFallback(body: string): string {
  const parts = splitTopLevelCommas(body);
  const stops = parts.slice(1).map(parseColorStop);
  const visibleStops = stops.filter((stop) => stop.color.toLowerCase() !== "transparent");
  const candidates = visibleStops.length > 0 ? visibleStops : stops;
  return candidates.reduce(
    (best, candidate) => candidate.weight > best.weight ? candidate : best,
    candidates[0] ?? { color: "currentColor", weight: 0 },
  ).color;
}

function replaceSrgbColorMixFunctions(value: string): string {
  const lower = value.toLowerCase();
  let output = "";
  let cursor = 0;
  while (cursor < value.length) {
    const start = lower.indexOf("color-mix(in srgb", cursor);
    if (start < 0) return output + value.slice(cursor);
    let depth = 1;
    let end = start + "color-mix(".length;
    for (; end < value.length && depth > 0; end += 1) {
      if (value[end] === "(") depth += 1;
      else if (value[end] === ")") depth -= 1;
    }
    if (depth !== 0) return output + value.slice(cursor);
    const bodyStart = start + "color-mix(".length;
    output += value.slice(cursor, start) + colorMixFallback(value.slice(bodyStart, end - 1));
    cursor = end;
  }
  return output;
}

export function downlevelSrgbColorMixes(source: string): string {
  return replaceSrgbColorMixFunctions(source);
}

const COLOR_MIX_SUPPORTS = "@supports (color:color-mix(in lab,red,red)){";

export function addLegacySupportsForSrgbColorMixes(source: string): string {
  let output = "";
  let cursor = 0;
  while (cursor < source.length) {
    const start = source.indexOf(COLOR_MIX_SUPPORTS, cursor);
    if (start < 0) return output + source.slice(cursor);
    const openingBrace = start + COLOR_MIX_SUPPORTS.length - 1;
    let depth = 1;
    let end = openingBrace + 1;
    for (; end < source.length && depth > 0; end += 1) {
      if (source[end] === "{") depth += 1;
      else if (source[end] === "}") depth -= 1;
    }
    if (depth !== 0) return output + source.slice(cursor);

    const body = source.slice(openingBrace + 1, end - 1);
    output += source.slice(cursor, end);
    if (body.includes("color-mix(in srgb")) {
      output += `${COLOR_MIX_SUPPORTS.replace("@supports (", "@supports not (")}`
        + `${downlevelSrgbColorMixes(body)}}`;
    }
    cursor = end;
  }
  return output;
}
