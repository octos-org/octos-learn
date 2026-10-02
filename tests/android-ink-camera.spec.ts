import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 4 });

for (const navigation of [false, true]) {
  test(`native ink starts and ends at the same screen point after ${navigation ? "pan and zoom" : "initial camera transition"}`, async ({ page }) => {
    await page.goto("/tests/fixtures/android-ink-camera.html");
    await page.waitForFunction(() => Boolean((window as unknown as { inkCameraTest?: { ready: boolean } }).inkCameraTest?.ready));
    await page.waitForTimeout(850);
    if (navigation) {
      // Actual board camera operations exercise both the live SVG and editor
      // channels. No learner document or backend is involved in this fixture.
      await page.evaluate(() => {
        const view = (window as unknown as { inkCameraTest: { view: { zoomBy(factor: number): void } } }).inkCameraTest.view;
        view.zoomBy(1.3);
      });
      await page.mouse.move(500, 300);
      await page.mouse.down({ button: "right" });
      await page.mouse.move(570, 330, { steps: 3 });
      await page.mouse.up({ button: "right" });
      await page.waitForTimeout(850);
    }
    const result = await page.evaluate(() => (window as unknown as {
      inkCameraTest: { commit(x: number, y: number): Promise<{ expected: { x: number; y: number }; displayed: { x: number; y: number }; camera: { board: { panX: number; panY: number; scale: number }; editor: { panX: number; panY: number; scale: number } } }> };
    }).inkCameraTest.commit(200, 180));
    expect(result.camera.editor.panX).toBeCloseTo(result.camera.board.panX, 3);
    expect(result.camera.editor.panY).toBeCloseTo(result.camera.board.panY, 3);
    expect(result.camera.editor.scale).toBeCloseTo(result.camera.board.scale, 3);
    expect(Math.abs(result.displayed.x - result.expected.x)).toBeLessThan(.01);
    expect(Math.abs(result.displayed.y - result.expected.y)).toBeLessThan(.01);
  });
}
