// Keep only ImageGen's registered alpha, at the animation texture's native size.
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const [toolsDir, generated, output] = process.argv.slice(2);
if (!toolsDir || !generated || !output) throw new Error("Expected authoring tools directory, generated cutout, and output PNG");
const require = createRequire(`${resolve(toolsDir)}/package.json`);
const { createCanvas, loadImage } = require("@napi-rs/canvas");
const size = 704, canvas = createCanvas(size, size), context = canvas.getContext("2d");
context.drawImage(await loadImage(generated), 0, 0, size, size);
const pixels = context.getImageData(0, 0, size, size), data = pixels.data;
for (let i = 0; i < data.length; i += 4) {
  data[i] = data[i + 1] = data[i + 2] = 255;
  // Generated foreground is near-opaque. Restore opaque fur, face and clothing
  // so compositing cannot tint the original colors with the board underneath.
  if (data[i + 3] >= 240) data[i + 3] = 255;
}
// Remove tiny enclosed extraction pinholes, preserving the soft outer edge
// and larger transparent spaces between strands of hair.
const seen = new Uint8Array(size * size);
for (let start = 0; start < seen.length; start++) {
  if (seen[start] || data[start * 4 + 3] === 255) continue;
  const region = [start]; seen[start] = 1;
  let touchesEdge = false;
  for (let head = 0; head < region.length; head++) {
    const index = region[head], x = index % size, y = Math.floor(index / size);
    if (x === 0 || y === 0 || x === size - 1 || y === size - 1) touchesEdge = true;
    for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
      if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
      const next = ny * size + nx;
      if (seen[next] || data[next * 4 + 3] === 255) continue;
      seen[next] = 1; region.push(next);
    }
  }
  if (!touchesEdge && region.length <= 64) for (const index of region) data[index * 4 + 3] = 255;
}
context.putImageData(pixels, 0, 0);
await mkdir(dirname(output), { recursive: true });
await writeFile(output, canvas.toBuffer("image/png"));
