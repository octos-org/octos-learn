import {expect, test} from '@playwright/test';
import {writeFile, mkdir} from 'node:fs/promises';
import {installTestAccount} from './helpers/course-test-account';

test.setTimeout(120_000);

const courses = [
  ["linear-intro-and-slope", "正比例函数 y = kx 与斜率的几何意义"],
  ["linear-simultaneous-intersections", "二元一次方程组与一次函数的几何意义"],
  ["rectangle-area-from-tiles", "长方形的面积与周长"],
  ["slope-and-intercept", "一次函数 y = mx + b 的图像与性质"],
  ["surface-paraboloid-level-sets", "水平截线与等高线：以 z=x²+y² 为例"],
  ["surface-partial-derivative-slice", "偏导数：固定输入，求截线斜率"],
  ["surface-saddle-point-analysis", "马鞍面与鞍点：梯度为零不一定是极值点"],
  ["trig-cosine-and-phase-shift", "余弦函数与单位圆投影"],
  ["trig-quadrants-and-monotonicity", "单位圆与正弦函数的单调性及象限循环"],
  ["trig-unit-circle-to-sine", "从单位圆旋转到正弦曲线"],
] as const;

const OUT = '/tmp/banded-mock/browser';

for (const [packId, title] of courses) {
  test(`${packId}: overview scale across widths`, async ({page}) => {
    await installTestAccount(page);
    await page.goto('/');
    const card = page.locator('.course-launcher-card').filter({has: page.getByRole('heading', {name: title, exact: true})});
    await card.getByRole('button', {name: '开始互动', exact: true}).click();
    await expect(page.getByTestId('oll-controls')).toBeVisible();
    const pause = page.getByRole('button', {name: '暂停 OLL 课程'});
    if (await pause.isVisible()) await pause.click();
    const next = page.getByRole('button', {name: '下一 OLL Beat', exact: true});
    for (let i = 0; i < 80; i++) {
      if (!(await next.isVisible().catch(() => false))) break;
      try { await next.click({timeout: 5000}); } catch { break; }
      await page.waitForTimeout(120);
    }
    await page.evaluate(() => document.fonts.ready);
    const metrics = () => page.evaluate(() => {
      const cards = [...document.querySelectorAll<HTMLElement>('.board-node,[data-course-controls-id],[data-course-tasks-id]')]
        .filter(e => e.offsetWidth && e.offsetHeight);
      const rects = cards.map(e => e.getBoundingClientRect());
      const occlusions = [...document.querySelectorAll<HTMLElement>('[data-learning-board-occlusion]')]
        .filter(e => e.offsetWidth && e.offsetHeight).map(e => e.getBoundingClientRect());
      return {
        clipped: rects.filter(r => r.left < 0 || r.top < 70 || r.right > innerWidth || r.bottom > innerHeight - 100
          || occlusions.some(o => r.left < o.right && r.right > o.left && r.top < o.bottom && r.bottom > o.top)).length,
        scale: Math.min(...cards.filter(e => e.classList.contains('board-node')).map(e => e.getBoundingClientRect().width / e.offsetWidth)),
        count: cards.length,
      };
    });
    const settle = async () => {
      let previous = '', stable = 0;
      await expect.poll(async () => {
        const m = await metrics();
        const sig = JSON.stringify({...m, scale: Math.round(m.scale * 10000)});
        stable = m.clipped === 0 && sig === previous ? stable + 1 : 0;
        previous = sig;
        return stable;
      }, {timeout: 9000, intervals: [120, 120, 120]}).toBeGreaterThanOrEqual(2);
    };
    await mkdir(OUT, {recursive: true});
    const row: Record<string, unknown> = {packId, title};
    for (const [w, h] of [[1920, 1080], [1440, 900], [700, 1000]] as const) {
      await page.setViewportSize({width: w, height: h});
      await settle();
      const m = await metrics();
      row[`scale${w}`] = Math.round(m.scale * 1000) / 1000;
      row[`clipped${w}`] = m.clipped;
      row[`count${w}`] = m.count;
      if (packId.startsWith('surface-')) await page.screenshot({path: `${OUT}/${packId}-${w}.png`});
    }
    await writeFile(`${OUT}/${packId}.json`, JSON.stringify(row, null, 2));
    console.log('MEASURE', JSON.stringify(row));
  });
}
