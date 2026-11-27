// Shared paper noise for the hand-made media (watercolor, chalk).

import * as THREE from "three";

const NOISE_SIZE = 256;

/** A tileable RGBA noise texture: R fine grain, G/B wobble, A large blotches. */
export function createNoiseTexture(): THREE.DataTexture {
  const size = NOISE_SIZE;
  const data = new Uint8Array(size * size * 4);
  const lattice = (period: number, seed: number) => {
    const values = new Float32Array(period * period);
    let state = seed >>> 0;
    for (let i = 0; i < values.length; i++) {
      state = (state * 1664525 + 1013904223) >>> 0;
      values[i] = state / 4294967296;
    }
    return (x: number, y: number) => {
      const fx = (x / size) * period;
      const fy = (y / size) * period;
      const x0 = Math.floor(fx);
      const y0 = Math.floor(fy);
      const tx = fx - x0;
      const ty = fy - y0;
      const sx = tx * tx * (3 - 2 * tx);
      const sy = ty * ty * (3 - 2 * ty);
      const at = (ix: number, iy: number) => values[((iy % period) + period) % period * period + ((ix % period) + period) % period];
      const top = at(x0, y0) * (1 - sx) + at(x0 + 1, y0) * sx;
      const bottom = at(x0, y0 + 1) * (1 - sx) + at(x0 + 1, y0 + 1) * sx;
      return top * (1 - sy) + bottom * sy;
    };
  };
  const fbm = (octaves: [number, number][], seed: number) => {
    const layers = octaves.map(([period], i) => lattice(period, seed + i * 101));
    const total = octaves.reduce((sum, [, weight]) => sum + weight, 0);
    return (x: number, y: number) => layers.reduce((sum, layer, i) => sum + layer(x, y) * octaves[i][1], 0) / total;
  };
  const grain = fbm([[128, 0.6], [64, 0.3], [32, 0.1]], 11);
  const wobbleX = fbm([[8, 0.6], [16, 0.3], [32, 0.1]], 23);
  const wobbleY = fbm([[8, 0.6], [16, 0.3], [32, 0.1]], 37);
  const blotch = fbm([[4, 0.6], [8, 0.3], [16, 0.1]], 53);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      data[i] = Math.round(grain(x, y) * 255);
      data[i + 1] = Math.round(wobbleX(x, y) * 255);
      data[i + 2] = Math.round(wobbleY(x, y) * 255);
      data[i + 3] = Math.round(blotch(x, y) * 255);
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}
