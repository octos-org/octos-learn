
import { findOpenWhiteboardPosition } from "./whiteboard-placement";

export interface WritingBounds { x: number; y: number; width: number; height: number }
interface OutlinePath { toPathData(decimalPlaces?: number): string }
interface OutlineGlyph {
  index: number;
  advanceWidth: number;
  getPath(x: number, y: number, size: number): OutlinePath;
}
interface OutlineFont {
  unitsPerEm: number;
  charToGlyph(character: string): OutlineGlyph;
}

let fontPromise: Promise<OutlineFont> | undefined;
export function prepareBoardWritingFont(): Promise<OutlineFont> {
  fontPromise ??= fetch("/fonts/handwriting/board-writing.woff", { priority: "low" })
    .then(async (response) => {
      if (!response.ok) throw new Error("手写字体加载失败，请重试。");
      const { default: opentype } = await import("opentype.js");
      return opentype.parse(await response.arrayBuffer()) as OutlineFont;
    }).catch((cause: unknown) => { fontPromise = undefined; throw cause; });
  return fontPromise;
}

/** Place complete writing beside its source, without changing existing strokes. */
export function findWritingPosition(source: WritingBounds, width: number, height: number,
  occupied: WritingBounds[]): { x: number; y: number } {
  return findOpenWhiteboardPosition({
    preferred: {
      x: source.x + source.width + 32,
      y: source.y,
    },
    width,
    height,
    occupied: [source, ...occupied],
    gap: 16,
    preferBelow: true,
  });
}

export async function layoutBoardWriting(lines: string[], source: WritingBounds,
  occupied: WritingBounds[]): Promise<{ paths: string[]; bounds: WritingBounds }> {
  if (!lines.length || lines.length > 8 || lines.join("\n").length > 500) {
    throw new Error("板书内容过长，请缩小问题范围。");
  }
  const font = await prepareBoardWritingFont();
  const size = 25, lineHeight = 38, maxWidth = 480;
  const glyphs: Array<{ glyph: OutlineGlyph; x: number; y: number; size: number }> = [];
  let y = size, width = 0;
  for (const line of lines) {
    let x = 0;
    // Linear notation is authoritative. Only unambiguous ^n sequences
    // are styled; grouping and operators remain visible, never guessed away.
    let script = false;
    const characters = [...line];
    for (let index = 0; index < characters.length; index++) {
      const character = characters[index];
      if (character === "^" && /^\d+(?:$|[ +\-*/=,)])/u.test(characters.slice(index + 1).join(""))) {
        script = true; continue;
      }
      if (!/^[0-9]$/.test(character)) script = false;
      const glyph = font.charToGlyph(character);
      if (!glyph.index && !/\s/u.test(character)) throw new Error(`手写字体暂不支持“${character}”，未写入不完整板书。`);
      const glyphSize = script ? size * .65 : size;
      const advance = glyph.advanceWidth / font.unitsPerEm * glyphSize;
      if (x + advance > maxWidth && x > 0) { x = 0; y += lineHeight; }
      glyphs.push({ glyph, x, y: y - (script ? size * .4 : 0), size: glyphSize });
      x += advance; width = Math.max(width, x);
    }
    y += lineHeight;
  }
  const height = y - lineHeight + 10;
  const position = findWritingPosition(source, width, height, occupied);
  const paths = glyphs.map(({ glyph, x, y: top, size: glyphSize }) =>
    glyph.getPath(position.x + x, position.y + top, glyphSize).toPathData(2)).filter(Boolean);
  return { paths, bounds: { ...position, width, height } };
}
