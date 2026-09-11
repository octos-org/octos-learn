
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
  const clearance = 16;
  const edgeOffset = 32;
  const allOccupied = [source, ...occupied].filter((rect) =>
    Number.isFinite(rect.x)
    && Number.isFinite(rect.y)
    && Number.isFinite(rect.width)
    && Number.isFinite(rect.height)
    && rect.width > 0
    && rect.height > 0);
  const isOpen = (position: { x: number; y: number }) => {
    const candidate = { ...position, width, height };
    return allOccupied.every((rect) => !(
      candidate.x < rect.x + rect.width + clearance
      && candidate.x + candidate.width + clearance > rect.x
      && candidate.y < rect.y + rect.height + clearance
      && candidate.y + candidate.height + clearance > rect.y
    ));
  };
  // Keep feedback attached to the learner's work. If the ideal right-hand
  // position is blocked, prefer the immediately adjacent space below before
  // a global search drifts along the original row and lands much farther away.
  const adjacentPositions = [
    { x: source.x + source.width + edgeOffset, y: source.y },
    { x: source.x, y: source.y + source.height + edgeOffset },
  ];
  const adjacent = adjacentPositions.find(isOpen);
  if (adjacent) return adjacent;

  return findOpenWhiteboardPosition({
    preferred: adjacentPositions[0],
    width,
    height,
    occupied: allOccupied,
    gap: clearance,
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
