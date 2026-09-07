import type { WritingBounds } from "./board-writing-layout";
export { findWritingPosition } from "./board-writing-layout";
export type { WritingBounds } from "./board-writing-layout";

type Layout = { paths: string[]; bounds: WritingBounds };
let worker: Worker | undefined;
let ready: Promise<void> | undefined;
let sequence = 0;
const pending = new Map<number, { resolve: (value: Layout | undefined) => void; reject: (cause: Error) => void }>();

function request(message: { kind: "prepare" } | { kind: "layout"; lines: string[]; source: WritingBounds; occupied: WritingBounds[] }): Promise<Layout | undefined> {
  if (!worker) {
    worker = new Worker(new URL("./board-writing.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (event: MessageEvent<{ id: number; result?: Layout; error?: string }>) => {
      const task = pending.get(event.data.id);
      if (!task) return;
      pending.delete(event.data.id);
      if (event.data.error) task.reject(new Error(event.data.error));
      else task.resolve(event.data.result);
    };
    worker.onerror = () => {
      const failedWorker = worker;
      worker = undefined;
      ready = undefined;
      failedWorker?.terminate();
      for (const task of pending.values()) task.reject(new Error("手写排版暂时不可用，请重试。"));
      pending.clear();
    };
  }
  const id = ++sequence;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    try { worker!.postMessage({ ...message, id }); }
    catch (cause) { pending.delete(id); reject(cause instanceof Error ? cause : new Error(String(cause))); }
  });
}

/** Decode and cache the font away from the voice/canvas main thread. */
export function prepareBoardWritingFont(): Promise<void> {
  ready ??= request({ kind: "prepare" }).then(() => undefined).catch((cause: unknown) => {
    ready = undefined;
    throw cause;
  });
  return ready;
}

export async function layoutBoardWriting(lines: string[], source: WritingBounds, occupied: WritingBounds[]): Promise<Layout> {
  await prepareBoardWritingFont();
  const result = await request({ kind: "layout", lines, source, occupied });
  if (!result) throw new Error("手写排版未返回内容。");
  return result;
}
