import { createRequire } from "node:module";
import { writeFile, mkdir } from "node:fs/promises";
import { drawIllustratedFox, illustratedDemoFrame } from "../src/learning/avatar/illustrated-fox";
import { neutralFrame } from "../src/learning/avatar/face-frame";

// Preview-only authoring dependencies live outside the product dependency tree.
// Usage: vite-node scripts/export-illustrated-fox-preview.ts <tools-dir> <out-dir>
const [toolsDir, output] = process.argv.slice(2);
if (!toolsDir || !output) throw new Error("Expected authoring tools directory and output directory");
const require = createRequire(`${toolsDir}/package.json`);
const { createCanvas, loadImage } = require("@napi-rs/canvas");
const { GIFEncoder, quantize, applyPalette } = require("gifenc");
const image = await loadImage("public/teach-avatars/star-fox/illustrated-v0.1/base.png");
const canvas = createCanvas(500, 560), ctx = canvas.getContext("2d");
const gif = GIFEncoder(); let palette: number[][] | undefined;
await mkdir(output, { recursive: true });
for (let i = 0; i < 105; i++) {
  const timeMs = i * 1000 / 15;
  drawIllustratedFox(ctx as CanvasRenderingContext2D, image, canvas.width, canvas.height, illustratedDemoFrame(timeMs), { timeMs, idleMotion: true, backdrop: true });
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  palette ??= quantize(pixels, 256);
  gif.writeFrame(applyPalette(pixels, palette), canvas.width, canvas.height, { palette: i === 0 ? palette : undefined, delay: 1000 / 15, repeat: 0 });
  if (i === 18) await writeFile(`${output}/star-fox-2d-preview.png`, canvas.toBuffer("image/png"));
}
gif.finish(); await writeFile(`${output}/star-fox-2d-preview.gif`, gif.bytes());
const review = createCanvas(1000, 1120), reviewCtx = review.getContext("2d");
const poses = [
  { channels: {}, rotation: [0, 0, 0] },
  { channels: { jawOpen: .85, mouthSmileLeft: .2, mouthSmileRight: .2 }, rotation: [0, 0, 0] },
  { channels: { eyeBlinkLeft: 1, eyeBlinkRight: 1 }, rotation: [0, 0, 0] },
  { channels: { mouthPucker: .8, browInnerUp: .4 }, rotation: [0, 0, -.06] },
];
for (let i = 0; i < poses.length; i++) {
  const pose = poses[i]!;
  drawIllustratedFox(ctx as CanvasRenderingContext2D, image, canvas.width, canvas.height,
    { ...neutralFrame(), channels: pose.channels, rotation: pose.rotation as [number, number, number] }, { backdrop: true });
  reviewCtx.drawImage(canvas, i % 2 * 500, Math.floor(i / 2) * 560);
}
await writeFile(`${output}/star-fox-2d-poses.png`, review.toBuffer("image/png"));
console.log(JSON.stringify({ output, frames: 105, durationSeconds: 7, bytes: gif.bytes().length, source: "Same Canvas renderer as the app, synthetic demo parameters; no capture or audio in GIF." }));
