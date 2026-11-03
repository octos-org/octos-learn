import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { createOriginalFoxPainter, ORIGINAL_FOX_ASSETS } from "../src/learning/avatar/original-fox";
import { illustratedDemoFrame } from "../src/learning/avatar/illustrated-fox";
import { neutralFrame } from "../src/learning/avatar/face-frame";
const [toolsDir, output] = process.argv.slice(2);
if (!toolsDir || !output) throw new Error("Expected authoring tools and output directories");
const require = createRequire(`${toolsDir}/package.json`);
const { createCanvas, loadImage } = require("@napi-rs/canvas");
const { GIFEncoder, quantize, applyPalette } = require("gifenc");
const images = await Promise.all(Object.values(ORIGINAL_FOX_ASSETS).map((path) => loadImage(`public/${path}`)));
const factory = (w: number, h: number) => { const canvas = createCanvas(w, h); return { canvas, context: canvas.getContext("2d") as CanvasRenderingContext2D }; };
const painter = createOriginalFoxPainter(images[0], images[1], images[2], factory);
const canvas = createCanvas(550, 550), ctx = canvas.getContext("2d");
await mkdir(output, { recursive: true });
const poses = [neutralFrame(), { ...neutralFrame(), channels: { jawOpen: .8 } }, { ...neutralFrame(), channels: { eyeBlinkLeft: 1, eyeBlinkRight: 1 } },
  { ...neutralFrame(), channels: { jawOpen: .65, mouthSmileLeft: .6, mouthSmileRight: .6 }, rotation: [.1, -.15, -.06] as [number, number, number] }];
const review = createCanvas(1100, 1100), reviewCtx = review.getContext("2d");
for (let i = 0; i < poses.length; i++) {
  painter.draw(ctx, 550, 550, poses[i]!, { backdrop: true });
  reviewCtx.drawImage(canvas, i % 2 * 550, Math.floor(i / 2) * 550);
  if (i === 0) await writeFile(`${output}/original-fox-neutral.png`, canvas.toBuffer("image/png"));
}
await writeFile(`${output}/original-fox-poses.png`, review.toBuffer("image/png"));
const gif = GIFEncoder(); let palette: number[][] | undefined;
const timings: number[] = [];
for (let i = 0; i < 90; i++) {
  const timeMs = i * 1000 / 15, start = performance.now();
  painter.draw(ctx, 550, 550, illustratedDemoFrame(timeMs), { timeMs, idleMotion: true, backdrop: true });
  timings.push(performance.now() - start);
  const pixels = ctx.getImageData(0, 0, 550, 550).data;
  palette ??= quantize(pixels, 256);
  gif.writeFrame(applyPalette(pixels, palette), 550, 550, { palette: i === 0 ? palette : undefined, delay: 1000 / 15, repeat: 0 });
}
gif.finish(); await writeFile(`${output}/original-fox-preview.gif`, gif.bytes());
console.log(JSON.stringify({ output, frames: 90, averageOfflineRenderMs: timings.reduce((a, b) => a + b) / timings.length, note: "Native authoring runtime only; not browser/device timing." }));
