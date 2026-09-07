import { layoutBoardWriting, prepareBoardWritingFont, type WritingBounds } from "./board-writing-layout";

self.onmessage = async (event: MessageEvent<{ id: number; kind: "prepare" | "layout"; lines: string[]; source: WritingBounds; occupied: WritingBounds[] }>) => {
  const { id, kind, lines, source, occupied } = event.data;
  try {
    const result = kind === "prepare" ? await prepareBoardWritingFont().then(() => undefined)
      : await layoutBoardWriting(lines, source, occupied);
    self.postMessage({ id, result });
  } catch (cause) {
    self.postMessage({ id, error: cause instanceof Error ? cause.message : "无法生成手写板书。" });
  }
};
