import { expect, test } from '@playwright/test';
import { installTestAccount } from './helpers/course-test-account';

test.skip(!process.env.OCTOS_LOCAL_COURSE_PACK_ROOT, 'Requires a local reviewed publication');

test('unopened practice does not separate the two calculus visuals', async ({page}, testInfo) => {
  await installTestAccount(page);
  const errors: string[] = [];
  page.on('pageerror', e=>errors.push(e.message));
  await page.goto('/');
  const card=page.locator('.course-launcher-card').filter({has:page.getByRole('heading',{name:'水平截线与等高线：以 z=x²+y² 为例',exact:true})});
  const start=Date.now();
  await card.getByRole('link',{name:'预览',exact:true}).click();
  await expect(page.getByTestId('oll-controls')).toBeVisible();
  const readyMs=Date.now()-start;
  const pause=page.getByRole('button',{name:'暂停 OLL 课程'});
  if(await pause.isVisible()) await pause.click();
  for(let i=0;i<5;i++) await page.getByRole('button',{name:'下一 OLL Beat',exact:true}).click();
  await expect(page.locator('.board-node.kind-geometry')).toBeVisible();
  await expect.poll(async()=>page.locator('.oll-board-runtime').evaluate(root=>{
    const scene=root.querySelector<HTMLElement>('.board-node.kind-scene3d')!;
    const circle=root.querySelector<HTMLElement>('.board-node.kind-geometry')!;
    return Math.abs(parseFloat(circle.style.top)-parseFloat(scene.style.top));
  })).toBeLessThan(1);
  await expect.poll(async()=>page.locator('.oll-board-runtime').evaluate(root=>{
    const diagrams=[...root.querySelectorAll<HTMLElement>('.board-node.kind-scene3d,.board-node.kind-geometry')];
    const control=root.querySelector<HTMLElement>('[data-interaction-controls-id]')!;
    return parseFloat(control.style.top)-Math.max(...diagrams.map(n=>parseFloat(n.style.top)+parseFloat(n.style.height)));
  })).toBe(24);
  const spacing = await page.locator('.oll-board-runtime').evaluate(root => {
    const scene = root.querySelector<HTMLElement>('.board-node.kind-scene3d')!;
    const circle = root.querySelector<HTMLElement>('.board-node.kind-geometry')!;
    return parseFloat(circle.style.left) - parseFloat(scene.style.left) - parseFloat(scene.style.width);
  });
  expect(spacing).toBeGreaterThanOrEqual(0);
  expect(spacing).toBeLessThan(200);
  expect(errors).toEqual([]);
  await testInfo.attach('local-playback-load', {body:JSON.stringify({readyMs, note:'Local archive preview load; not a live model generation metric.'}),contentType:'application/json'});
  await page.screenshot({path:testInfo.outputPath('calculus-layout.png')});
  await page.setViewportSize({width:700,height:1000});
  await expect.poll(async()=>page.locator('.oll-board-runtime').evaluate(root=>{
    const scene=root.querySelector<HTMLElement>('.board-node.kind-scene3d')!;
    const circle=root.querySelector<HTMLElement>('.board-node.kind-geometry')!;
    return parseFloat(circle.style.top) >= parseFloat(scene.style.top)+parseFloat(scene.style.height)
      && Math.abs(parseFloat(circle.style.left)-parseFloat(scene.style.left))<1;
  })).toBe(true);
  await page.screenshot({path:testInfo.outputPath('calculus-narrow-layout.png')});
  await page.setViewportSize({width:1920,height:1080});
  await expect.poll(async()=>page.locator('.oll-board-runtime').evaluate(root=>{
    const scene=root.querySelector<HTMLElement>('.board-node.kind-scene3d')!;
    const circle=root.querySelector<HTMLElement>('.board-node.kind-geometry')!;
    return Math.abs(parseFloat(circle.style.top)-parseFloat(scene.style.top));
  })).toBeLessThan(1);
});

test('regenerated calculus demonstrates once and initializes practice before grading', async ({page}, testInfo) => {
  await installTestAccount(page);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  const card = page.locator('.course-launcher-card').filter({has:page.getByRole('heading',{name:'水平截线与等高线：以 z=x²+y² 为例',exact:true})});
  await card.getByRole('link',{name:'预览',exact:true}).click();
  await expect(page.getByTestId('oll-controls')).toBeVisible();
  const pause = page.getByRole('button',{name:'暂停 OLL 课程'});
  if (await pause.isVisible()) await pause.click();
  const next = page.getByRole('button',{name:'下一 OLL Beat',exact:true});
  const slider = page.getByRole('slider',{name:'截面高度 h',exact:true});
  for (let i=0;i<8;i++) await next.click();
  await expect(slider).toHaveValue('4');
  await next.click();
  await expect(slider).toHaveValue('0');
  for (let i=0;i<3;i++) await next.click();
  await expect(slider).toHaveValue('1');
  await expect(page.getByText('想让投影圆的半径为 √3，请先算出需要的高度，再调节高度验证。',{exact:true})).toBeVisible();
  const geometry = page.locator('.board-node.kind-geometry');
  for (const [value,label] of [[0,'r = 0'],[1,'r = 1'],[4,'r = 2'],[3,'r = 1.73']] as const) {
    await slider.evaluate((input, value) => {
      const range = input as HTMLInputElement;
      range.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(range, String(value));
      range.dispatchEvent(new Event('input',{bubbles:true}));
      range.dispatchEvent(new Event('change',{bubbles:true}));
      range.dispatchEvent(new KeyboardEvent('keyup',{key:'ArrowRight',bubbles:true}));
    },value);
    await expect(geometry.locator('.geometry-label').filter({hasText:label})).toBeVisible();
    await expect(geometry.locator('.geometry-circle')).toHaveCount(value === 0 ? 0 : 1);
    const clipping = await page.locator('.scene3d-runtime svg').evaluate(svg => {
      const frame = svg.getBoundingClientRect();
      return [...svg.querySelectorAll('.scene3d-surface-cell, .scene3d-section-intersection')].some(node => {
        const bounds = node.getBoundingClientRect();
        return bounds.left < frame.left - 1 || bounds.right > frame.right + 1
          || bounds.top < frame.top - 1 || bounds.bottom > frame.bottom + 1;
      });
    });
    expect(clipping).toBe(false);
  }
  await expect(page.getByText('回答正确！因为 (√3)² = 3，所以当高度调节到 3 时，投影圆半径刚好为 √3。',{exact:true})).toBeVisible();
  expect(errors).toEqual([]);
  await page.screenshot({path:testInfo.outputPath('calculus-linked-practice.png')});
});
