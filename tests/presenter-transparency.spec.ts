import { expect, test } from "@playwright/test";

for (const characterId of ["star-fox", "red-panda", "white-rabbit", "moon-cat"] as const) {
test(`${characterId}: lesson playback shows the presenter over the board without a paper rectangle`, async ({ page }, testInfo) => {
  await page.route("**/presenter-alpha-check", (route) => route.fulfill({ contentType: "text/html", body: `<!doctype html><html><body style="margin:0">
    <main style="position:relative;width:960px;height:560px;background:#f8f5ed;background-image:radial-gradient(#ccc2ad 1px,transparent 1px);background-size:24px 24px">
      <div style="position:absolute;left:290px;top:220px;padding:28px 80px;border:1px solid #ddd5c5;border-radius:18px;background:#fffef9;color:#164f47;font:32px Georgia">3x + 5 = 20</div>
      <div id="presenter"></div>
    </main>
    <script type="module">
      import React from '/node_modules/.vite/deps/react.js';
      import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
      import { injectIntoGlobalHook } from '/@react-refresh';
      injectIntoGlobalHook(window);
      window.$RefreshReg$ = () => {};
      window.$RefreshSig$ = () => (type) => type;
      window.__vite_plugin_react_preamble_installed__ = true;
      await import('/src/learning/teach/teach.css');
      const { default: LessonAvatarPreview } = await import('/src/learning/avatar/lesson-avatar-preview.tsx');
      ReactDOM.createRoot(document.getElementById('presenter')).render(React.createElement(LessonAvatarPreview, {
        characterId: '${characterId}', placement: 'board', track: null, clock: null, playing: false, preparing: false
      }));
    </script>
    </body></html>` }));
  await page.setViewportSize({ width: 960, height: 560 });
  await page.goto("/presenter-alpha-check");
  const canvas = page.locator(".teach-board-presenter canvas");
  await expect(canvas).toBeVisible();
  await expect(page.locator(".illustrated-avatar > span")).toHaveCount(0);
  await expect.poll(() => canvas.evaluate((element: HTMLCanvasElement) => {
    const context = element.getContext("2d")!;
    const pixels = context.getImageData(0, 0, element.width, element.height).data;
    return {
      background: pixels[(Math.floor(element.height * .5) * element.width + 10) * 4 + 3],
      face: pixels[(Math.floor(element.height * .6) * element.width + Math.floor(element.width * .5)) * 4 + 3],
    };
  })).toEqual({ background: 0, face: 255 });
  await page.screenshot({ path: testInfo.outputPath("transparent-presenter.png") });
});

test(`${characterId}: board presenter preserves the painted face and transparent background through head motion`, async ({ page }) => {
  // A canvas-only page exercises the actual Vite modules and shipped artwork,
  // without microphone capture, account data, or paid speech/model requests.
  await page.route("**/presenter-alpha-check", (route) => route.fulfill({ contentType: "text/html", body: "<!doctype html><html><body></body></html>" }));
  await page.goto("/presenter-alpha-check");
  const result = await page.evaluate(async (characterId) => {
    const { paintedCharacter } = await import("/src/learning/avatar/painted-characters.ts");
    const { createPaintedFoxPainter } = await import("/src/learning/avatar/painted-fox.ts");
    const { neutralFrame } = await import("/src/learning/avatar/face-frame.ts");
    const character = paintedCharacter(characterId);
    const load = async (path: string) => {
      const image = new Image(); image.src = `/${path}`; await image.decode(); return image;
    };
    const artwork = Object.fromEntries(await Promise.all(Object.entries(character.assets).map(async ([key, path]) => [key, await load(path)])));
    const surface = (width: number, height: number) => {
      const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
      return { canvas, context: canvas.getContext("2d", { willReadFrequently: true })! };
    };
    const opaque = createPaintedFoxPainter(artwork, surface, character.rig);
    const transparent = createPaintedFoxPainter({ ...artwork, silhouette: await load(character.silhouette!) }, surface, character.rig);
    const { context } = surface(736, 736);
    const render = (painter: typeof transparent, rotation: [number, number, number] = [0, 0, 0], jawOpen = 0) => {
      painter.draw(context, 736, 736, { ...neutralFrame(), rotation, channels: { jawOpen } });
      return context.getImageData(0, 0, 736, 736).data;
    };
    const original = render(opaque), cutout = render(transparent);
    let facialChanges = 0, transparentFacePixels = 0;
    // Interior face only: the feathered outer hair edge is intentionally translucent.
    for (let y = 380; y < 490; y++) for (let x = 280; x < 430; x++) {
      const i = ((y + 16) * 736 + x + 16) * 4;
      if (cutout[i + 3] !== 255) transparentFacePixels++;
      for (let c = 0; c < 3; c++) if (cutout[i + c] !== original[i + c]) facialChanges++;
    }
    const paleFeatures = characterId === "white-rabbit" ? [[180, 130], [500, 120], [350, 300], [350, 625]]
      : characterId === "moon-cat" ? [[350, 250], [190, 215], [520, 215], [350, 625]]
        : characterId === "red-panda" ? [[180, 230], [520, 230], [350, 300], [350, 625]]
          : [[170, 200], [530, 200], [350, 250], [350, 625]];
    const protectedFeatures = paleFeatures.map(([x, y]) => {
      const i = ((y + 16) * 736 + x + 16) * 4;
      return { alpha: cutout[i + 3], unchanged: [0, 1, 2].every((c) => cutout[i + c] === original[i + c]) };
    });
    const outside = [[20, 20], [350, 25], [30, 450], [680, 450], [20, 680]];
    const poses: Array<[number, number, number]> = [[0, 0, 0], [.35, .45, .1], [-.35, -.45, -.1], [.35, -.45, .1], [-.35, .45, -.1]];
    const backgrounds = poses.map((pose) => {
      const pixels = render(transparent, pose, .8);
      return outside.map(([x, y]) => pixels[((y + 16) * 736 + x + 16) * 4 + 3]);
    });
    return { facialChanges, transparentFacePixels, protectedFeatures, backgrounds, originalBackgroundAlpha: original[(36 * 736 + 36) * 4 + 3] };
  }, characterId);
  expect(result.originalBackgroundAlpha).toBe(255);
  expect(result.facialChanges).toBe(0);
  expect(result.transparentFacePixels).toBe(0);
  expect(result.protectedFeatures).toEqual(Array(4).fill({ alpha: 255, unchanged: true }));
  expect(result.backgrounds.flat()).toEqual(Array(25).fill(0));
});
}
