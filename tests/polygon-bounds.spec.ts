import {expect,test} from '@playwright/test';

test('side-count controls both regular polygons while the circle stays fixed, including restore and replay',async({page})=>{
  const errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.setViewportSize({width:1280,height:1050});
  await page.goto('/tests/fixtures/polygon-bounds.html');
  const shapes=page.locator('.geometry-regular-polygon');
  await expect(shapes).toHaveCount(2);
  const circle=page.locator('.geometry-circle');
  const original=await circle.evaluate(e=>['cx','cy','r'].map(key=>e.getAttribute(key)));
  for(const n of [6,12,24,48,96]){
    await page.locator('#sides').fill(String(n));
    await expect(shapes.first()).toHaveAttribute('data-sides',String(n));
    await expect(shapes.last()).toHaveAttribute('data-sides',String(n));
    for(const points of await shapes.evaluateAll(es=>es.map(e=>e.getAttribute('points')!))) expect(points.trim().split(/\s+/)).toHaveLength(n);
    expect(await circle.evaluate(e=>['cx','cy','r'].map(key=>e.getAttribute(key)))).toEqual(original);
  }
  await expect(page.locator('#nodes')).toContainText('3.141031951');
  await expect(page.locator('#nodes')).toContainText('3.142714600');
  await page.screenshot({path:'delivery/archimedes-20261018/polygon-96.png'});
  await page.reload();
  await expect(shapes.first()).toHaveAttribute('data-sides','96');
  await expect(page.locator('#sides')).toHaveValue('96');
  await page.locator('#replay').click();
  await expect(shapes).toHaveCount(2);
  await page.locator('#sides').fill('6');
  await expect(shapes.first()).toHaveAttribute('data-sides','6');
  await page.screenshot({path:'delivery/archimedes-20261018/polygon-6.png'});
  const caption = page.locator('.geometry-caption');
  const captionBox = await caption.boundingBox();
  const cardBox = await page.locator('.board-node.kind-geometry').boundingBox();
  expect(captionBox!.y + captionBox!.height).toBeLessThanOrEqual(cardBox!.y + cardBox!.height);
  await page.evaluate(() => {
    localStorage.setItem('another-course-progress','preserve');
    (window as any).polygonRegression.seedLegacy();
  });
  await page.reload();
  await expect(shapes).toHaveCount(2);
  await expect(shapes.first()).toHaveAttribute('data-sides','6');
  expect(await page.evaluate(()=>localStorage.getItem('another-course-progress'))).toBe('preserve');
  expect(errors).toEqual([]);
});
