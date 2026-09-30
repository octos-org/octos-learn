// Board chrome, reading scale and camera ceiling shared by the teaching
// layout and the automatic camera on each host platform.

export function isAndroidRuntime(): boolean {
  return document.documentElement.dataset.runtimePlatform === "android";
}

/**
 * Camera scale the teaching layout is planned for. Rows and columns are sized
 * to stay readable at this scale, and the automatic camera stays close to it.
 * Meeting displays use a smaller scale so a stage row fits side by side
 * instead of wrapping into a tall stack.
 */
export function teachingReadingScale(android = isAndroidRuntime()): number {
  return android ? .68 : .9;
}

/** Zoom ceiling for automatic teaching focus: a modest close-up above the reading scale. */
export function teachingCameraCeiling(android = isAndroidRuntime()): number {
  return android ? .8 : 1.1;
}

export interface ViewportBand {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Splits floating host chrome into full-width bands and true occlusions.
 * Chrome anchored to the top edge (top bar, ink toolbar) becomes the top
 * inset; chrome anchored to the bottom edge across the middle of the screen
 * (the input dock, warnings above it) becomes the bottom inset. What remains
 * (e.g. the teacher avatar in a corner) stays an occlusion. Treating a corner
 * toolbar as an occlusion let the camera pick the free rectangle beside it
 * and push the whole composition sideways; ignoring the dock let cards slide
 * underneath it.
 */
export function boardChromeInsets(
  width: number,
  height: number,
  chrome: ViewportBand[],
): { top: number; bottom: number; occlusions: ViewportBand[] } {
  let top = 0;
  let bottom = 0;
  const occlusions: ViewportBand[] = [];
  const middleLeft = width * .3;
  const middleRight = width * .7;
  for (const rect of chrome) {
    const rectBottom = rect.y + rect.height;
    if (rect.y <= height * .2 && rectBottom <= height * .35) {
      top = Math.max(top, rectBottom);
      continue;
    }
    const spansMiddle = rect.x < middleRight && rect.x + rect.width > middleLeft;
    if (spansMiddle && rect.y >= height * .65) {
      bottom = Math.max(bottom, height - rect.y);
      continue;
    }
    occlusions.push(rect);
  }
  return { top, bottom, occlusions };
}
