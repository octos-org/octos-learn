/** Facial-material study only. No head rotation, camera, inference or body rig. */
export const MATERIALS = ['source', 'face', 'eyeL-open', 'eyeR-open', 'eyeL-expression', 'eyeR-expression', 'mouth-open', 'mouth-expression'];
const clamp = value => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
export function drawFace(ctx, images, { left = 0, right = 0, mouth = 0 } = {}) {
  left = clamp(left); right = clamp(right); mouth = clamp(mouth);
  ctx.clearRect(0, 0, 512, 512);
  // Neutral and reset use the actual source, avoiding accumulated resampling.
  if (left === 0 && right === 0 && mouth === 0) { ctx.drawImage(images.source, 0, 0); return; }
  ctx.drawImage(images.face, 0, 0);
  for (const [key, x, blink] of [['eyeL', 186, left], ['eyeR', 335, right]]) {
    if (blink < 1) {
      ctx.save(); ctx.translate(x, 222); ctx.scale(1, Math.max(.01, 1 - blink)); ctx.translate(-x, -222);
      ctx.globalAlpha = blink < .8 ? 1 : (1 - blink) / .2;
      ctx.drawImage(images[`${key}-open`], 0, 0); ctx.restore();
    }
    if (blink > .8) {
      ctx.save(); ctx.globalAlpha = (blink - .8) / .2;
      ctx.drawImage(images[`${key}-expression`], 0, 0); ctx.restore();
    }
  }
  if (mouth < .08) ctx.drawImage(images['mouth-open'], 0, 0);
  else {
    ctx.save(); ctx.translate(272, 279); ctx.scale(1, .1 + .9 * mouth); ctx.translate(-272, -279);
    ctx.drawImage(images['mouth-expression'], 0, 0); ctx.restore();
  }
}
