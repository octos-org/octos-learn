/** A limited Star Fox material/rig experiment. Coordinates are in the 704px
 * portrait, independent of the face-fitting crop. No capture data lives here. */
export type RigPoint = [number, number];
export interface LocalRigPose { ear: number; hair: number }
export const LOCAL_RIG_ASSETS = {
  base: 'teach-avatars/star-fox/local-rig-v0.2/base.png',
  ear: 'teach-avatars/star-fox/local-rig-v0.2/ear-front.png',
  back: 'teach-avatars/star-fox/local-rig-v0.2/ear-back.png',
  hair: 'teach-avatars/star-fox/local-rig-v0.2/hair.png',
  foreground: 'teach-avatars/star-fox/local-rig-v0.2/foreground.png',
} as const;
export type LocalRigImages = Record<keyof typeof LOCAL_RIG_ASSETS, CanvasImageSource>;
export const LOCAL_EAR_ROOT: RigPoint = [180, 307];
/** Visible attachment follows the diagonal front-hair boundary. A horizontal
 * band at the bottom misses its upper corner, where the reported crack was. */
export const LOCAL_EAR_ATTACHMENT: readonly RigPoint[] = [[251,177],[230,190],[211,203],[196,218],[178,240],[163,265],[153,287]];
export const LOCAL_HAIR_CHAIN: readonly RigPoint[] = [[513, 330], [546, 360], [584, 359]];
export const LOCAL_EAR_PATH = 'M126 78 C104 118 90 180 96 239 C96 277 110 310 140 321 L170 302 C174 265 185 231 217 200 L264 172 C221 135 170 99 126 78 Z';
export const LOCAL_FULL_EAR_PATH = 'M130 85 C105 133 95 208 107 265 C115 308 135 331 185 335 C226 337 263 323 268 294 C281 243 270 209 250 177 C205 141 163 105 130 85 Z';
export const LOCAL_HAIR_PATH = 'M510 326 C519 343 534 356 550 362 C568 371 585 365 592 352 C587 371 573 378 556 379 C535 381 517 366 507 350 Z';
export const LOCAL_FOREGROUND_PATH = 'M251 177 C228 188 211 199 196 218 C178 239 163 265 153 287 C142 305 123 315 107 316 L98 335 L290 335 L307 150 C285 150 266 165 251 177 Z';
const clamp = (n: number, lo = -1, hi = 1) => Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : 0;
const smooth = (n: number) => { const t = clamp(n, 0, 1); return t * t * (3 - 2 * t); };
const rotate = ([x, y]: RigPoint, [cx, cy]: RigPoint, angle: number): RigPoint => [cx + Math.cos(angle) * (x - cx) - Math.sin(angle) * (y - cy), cy + Math.sin(angle) * (x - cx) + Math.cos(angle) * (y - cy)];

/** The entire root band stays on the scalp, not just a pivot hidden under the
 * hair. The upper pinna has a limited local turn, blended into its attachment. */
export const localEarWeight = (y: number) => 1 - smooth((y - 195) / 60);
export function localEarMotionWeight([x,y]:RigPoint):number {
  let distance=Infinity;
  for(let i=1;i<LOCAL_EAR_ATTACHMENT.length;i++){
    const a=LOCAL_EAR_ATTACHMENT[i-1],b=LOCAL_EAR_ATTACHMENT[i],dx=b[0]-a[0],dy=b[1]-a[1];
    const t=clamp(((x-a[0])*dx+(y-a[1])*dy)/(dx*dx+dy*dy),0,1);
    distance=Math.min(distance,Math.hypot(x-a[0]-t*dx,y-a[1]-t*dy));
  }
  // Freeze a region around the real seam wide enough to include every adjacent
  // mesh triangle, then ease into the moving outer pinna.
  return localEarWeight(y)*smooth((distance-20)/70);
}
export function localEarPoint(point: RigPoint, value: number): RigPoint {
  const v = clamp(value), [cx] = LOCAL_EAR_ROOT;
  const width = Math.cos(.2 + v * .6) / Math.cos(.2);
  const turned = rotate([cx + (point[0] - cx) * width, point[1]], LOCAL_EAR_ROOT, -.12 * v), weight = localEarMotionWeight(point);
  return [point[0] + (turned[0] - point[0]) * weight, point[1] + (turned[1] - point[1]) * weight];
}

/** Two finite-length bones, with a small skinning region at their joint.
 * Both bones agree at the joint. Bone lengths stay fixed; the skin has a
 * bounded transition around their joint rather than a rigid cut. */
export function localHairPoint(point: RigPoint, value: number): RigPoint {
  const v = clamp(value), [a, b] = LOCAL_HAIR_CHAIN;
  const joint = rotate(b, a, v * .12), first = rotate(point, a, v * .12);
  const secondLocal = rotate(point, b, v * .36);
  const second: RigPoint = [joint[0] + secondLocal[0] - b[0], joint[1] + secondLocal[1] - b[1]];
  // A continuous strip across the joint. Switching nearest-bone projections
  // at x=joint introduced a discontinuity outside the strand center line.
  const weight = smooth((point[0] - b[0] + 26) / 52);
  return [first[0] + (second[0] - first[0]) * weight, first[1] + (second[1] - first[1]) * weight];
}

type Surface = (width: number, height: number) => { canvas: CanvasImageSource; context: CanvasRenderingContext2D };
interface MeshRegion { x: number; y: number; width: number; height: number; columns: number; rows: number; output: [number, number, number, number] }
/** Rasterize independent RGBA parts using premultiplied filtering. Unlike a
 * whole-image warp, transparent pixels cannot carry adjacent paper or strands. */
function createPartMesh(input: ImageData, surface: Surface, region: MeshRegion) {
  const [ox, oy, width, height] = region.output, buffer = surface(width, height), output = buffer.context.createImageData(width, height);
  const { columns, rows } = region, vertices: RigPoint[] = [], triangles: number[][] = [];
  for (let y = 0; y <= rows; y++) for (let x = 0; x <= columns; x++) vertices.push([region.x + x * region.width / columns, region.y + y * region.height / rows]);
  for (let y = 0; y < rows; y++) for (let x = 0; x < columns; x++) { const a = y * (columns + 1) + x; triangles.push([a, a + 1, a + columns + 1], [a + 1, a + columns + 2, a + columns + 1]); }
  return (target: CanvasRenderingContext2D, move: (point: RigPoint) => RigPoint) => {
    output.data.fill(0);
    const points = vertices.map(move);
    for (const [ia, ib, ic] of triangles) {
      const a = vertices[ia], b = vertices[ib], c = vertices[ic], p = points[ia], q = points[ib], r = points[ic];
      const det = (q[0] - p[0]) * (r[1] - p[1]) - (r[0] - p[0]) * (q[1] - p[1]);
      if (det <= 0) throw Error('local_part_fold');
      const minX = Math.max(0, Math.floor(Math.min(p[0], q[0], r[0]) - ox)), maxX = Math.min(width - 1, Math.ceil(Math.max(p[0], q[0], r[0]) - ox));
      const minY = Math.max(0, Math.floor(Math.min(p[1], q[1], r[1]) - oy)), maxY = Math.min(height - 1, Math.ceil(Math.max(p[1], q[1], r[1]) - oy));
      for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
        const dx = x + ox + .5 - p[0], dy = y + oy + .5 - p[1];
        const u = (dx * (r[1] - p[1]) - dy * (r[0] - p[0])) / det, v = ((q[0] - p[0]) * dy - (q[1] - p[1]) * dx) / det;
        if (u < -1e-7 || v < -1e-7 || u + v > 1.0000001) continue;
        const sx = clamp(a[0] + u * (b[0] - a[0]) + v * (c[0] - a[0]) - .5, 0, 702), sy = clamp(a[1] + u * (b[1] - a[1]) + v * (c[1] - a[1]) - .5, 0, 702);
        const ix = Math.floor(sx), iy = Math.floor(sy), fx = sx - ix, fy = sy - iy;
        const samples = [[ix, iy, (1 - fx) * (1 - fy)], [ix + 1, iy, fx * (1 - fy)], [ix, iy + 1, (1 - fx) * fy], [ix + 1, iy + 1, fx * fy]];
        let alpha = 0; const rgb = [0, 0, 0];
        for (const [xx, yy, w] of samples) { const k = (yy * 704 + xx) * 4, coverage = input.data[k + 3] / 255 * w; alpha += coverage; for (let ch = 0; ch < 3; ch++) rgb[ch] += input.data[k + ch] * coverage; }
        const k = (y * width + x) * 4;
        for (let ch = 0; ch < 3; ch++) output.data[k + ch] = alpha > 0 ? rgb[ch] / alpha : 0;
        output.data[k + 3] = alpha * 255;
      }
    }
    buffer.context.putImageData(output, 0, 0); target.drawImage(buffer.canvas, ox, oy);
  };
}

/** Draws matched layers on the prepared base. The root band is a real region
 * of colored ear texels overlapping the scalp, rather than one fixed pivot. */
export function createLocalRigPainter(images: LocalRigImages, surface: Surface) {
  const read = (image: CanvasImageSource) => { const s = surface(704, 704); s.context.drawImage(image, 0, 0); return s.context.getImageData(0, 0, 704, 704); };
  const front = read(images.ear), back = read(images.back), hair = read(images.hair), ear = read(images.ear);
  const rowBounds: Array<[number, number]> = [],earWeights=new Float32Array(704*704);
  for (let y = 0; y < 704; y++) { let left = 704, right = 0; for (let x = 0; x < 704; x++) if (front.data[(y * 704 + x) * 4 + 3] > 0) { earWeights[y*704+x]=localEarMotionWeight([x,y]);if(front.data[(y*704+x)*4+3]>128){left = Math.min(left, x); right = x;} } rowBounds.push([left, right]); }
  const earMesh = createPartMesh(ear, surface, { x: 88, y: 72, width: 190, height: 270, columns: 20, rows: 27, output: [40, 40, 270, 320] });
  const hairMesh = createPartMesh(hair, surface, { x: 500, y: 305, width: 96, height: 88, columns: 12, rows: 8, output: [480, 290, 140, 130] });
  function drawEar(target: CanvasRenderingContext2D, value: number) {
    const amount = clamp(value);
    if (Math.abs(amount) < 1e-8) { target.drawImage(images.ear, 0, 0); return; }
    ear.data.set(front.data);
    // Reveal only a narrow outer surface at this limited turn. Changing the
    // entire ear from white/pink to orange resembled a detached paper cutout.
    for (let y = 72; y < 255; y++) {
      const [left, right] = rowBounds[y];
      if (left >= right || amount<=0) continue;
      for (let x = left; x <= right; x++) {
        const i = (y * 704 + x) * 4, across = (x - left) / (right - left), reveal=amount*.32*earWeights[y*704+x],w = smooth((reveal - across) / .1);
        if (!front.data[i + 3] || !back.data[i + 3] || !w) continue;
        for (let c = 0; c < 3; c++) ear.data[i + c] = front.data[i + c] * (1 - w) + back.data[i + c] * w;
      }
    }
    earMesh(target, point => localEarPoint(point, amount));
  }
  return {
    // Shared by the material continuity check: inspect actual rendered alpha and
    // texels before the foreground hides them, not just the geometry's pivot.
    drawEar,
    draw(target: CanvasRenderingContext2D, pose: LocalRigPose) {
      drawEar(target, pose.ear); target.drawImage(images.foreground, 0, 0);
      const value = clamp(pose.hair);
      if (Math.abs(value) < 1e-8) target.drawImage(images.hair, 0, 0);
      else hairMesh(target, point => localHairPoint(point, value));
    },
  };
}
