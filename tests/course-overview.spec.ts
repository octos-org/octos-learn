import {expect, test} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
import {installTestAccount} from './helpers/course-test-account';

test.setTimeout(60_000);

const courses = [
  ['水平截线与等高线：以 z=x²+y² 为例', 11],
  ['偏导数：固定输入，求截线斜率', 11],
  ['马鞍面与鞍点：梯度为零不一定是极值点', 15],
] as const;

for (const [title, beats] of courses) {
  test(`${title}: complete course is readable and contained`, async ({page}, info) => {
    await installTestAccount(page);
    await page.goto('/');
    const card = page.locator('.course-launcher-card').filter({has:page.getByRole('heading',{name:title,exact:true})});
    await card.getByRole('button',{name:'开始互动',exact:true}).click();
    await expect(page.getByTestId('oll-controls')).toBeVisible();
    const pause = page.getByRole('button',{name:'暂停 OLL 课程'});
    if (await pause.isVisible()) await pause.click();
    for(let i=0;i<=beats;i++) await page.getByRole('button',{name:'下一 OLL Beat',exact:true}).click();
    if (title.startsWith('水平')) {
      const slider = page.getByRole('slider');
      await expect(slider).toHaveValue('1');
      await expect(slider).toBeEnabled();
      await expect(page.getByTestId('oll-student-tasks')).toBeVisible();
      await slider.evaluate(input=>{
        const range=input as HTMLInputElement;
        range.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(range,'3');
        range.dispatchEvent(new Event('input',{bubbles:true}));
        range.dispatchEvent(new Event('change',{bubbles:true}));
        range.dispatchEvent(new KeyboardEvent('keyup',{key:'ArrowRight',bubbles:true}));
      });
      await expect(page.getByText('回答正确！因为 (√3)² = 3，所以当高度调节到 3 时，投影圆半径刚好为 √3。',{exact:true})).toBeVisible();
    }
    if (title.startsWith('偏导')) {
      await expect(page.getByTestId('oll-student-tasks')).toBeVisible();
      await expect(page.getByRole('slider')).toBeEnabled();
    }
    await page.evaluate(()=>document.fonts.ready);
    // 顶部阈值随宿主 chrome 高度变化：桌面顶栏约 46px（46+24=70），
    // Android 模式顶栏更紧凑（约 42px），阈值相应放宽到 60。
    const topMargin = process.env.OCTOS_COURSE_TEST_ANDROID === '1' ? 60 : 70;
    const metrics = () => page.evaluate((topMargin) => {
      const cards = [...document.querySelectorAll<HTMLElement>('.board-node,[data-course-controls-id],[data-course-tasks-id]')]
        .filter(e=>e.offsetWidth && e.offsetHeight);
      const rects = cards.map(e=>e.getBoundingClientRect());
      const occlusions = [...document.querySelectorAll<HTMLElement>('[data-learning-board-occlusion]')]
        .filter(e=>e.offsetWidth&&e.offsetHeight).map(e=>e.getBoundingClientRect());
      return {
        clipped: rects.filter(r=>r.left<0 || r.top<topMargin || r.right>innerWidth || r.bottom>innerHeight-100
          || occlusions.some(o=>r.left<o.right&&r.right>o.left&&r.top<o.bottom&&r.bottom>o.top)).length,
        scale: Math.min(...cards.filter(e=>e.classList.contains('board-node')).map(e=>e.getBoundingClientRect().width/e.offsetWidth)),
        count: cards.length,
      };
    }, topMargin);
    const settle = async () => {
      let previous = '', stable = 0;
      await expect.poll(async()=>{
        const m=await metrics();
        const signature=JSON.stringify({...m,scale:Math.round(m.scale*10000)});
        stable=m.clipped===0 && signature===previous ? stable+1 : 0;
        previous=signature;
        return stable;
      },{timeout:8000,intervals:[100,100,100]}).toBeGreaterThanOrEqual(2);
    };
    await settle();
    await info.attach('overview-metrics',{body:JSON.stringify(await metrics()),contentType:'application/json'});
    await writeFile(info.outputPath('metrics-1920.json'),JSON.stringify(await metrics(),null,2));
    await page.screenshot({path:info.outputPath('overview.png')});
    // 阶段行 × 步骤列（2026-09-26）：关联优先、窄屏单列可读流，整课全景缩放不再作为
    // 验收门槛（产品决定，见 layout-research-2026-09-26 报告）。这里仍要求全部卡片完整
    // 落在安全区内（settle 中 clipped===0），缩放只写入 metrics 文件供跟踪。
    expect((await metrics()).scale).toBeGreaterThan(0);
    for (const [width,height] of [[1440,900],[700,1000]] as const) {
      await page.setViewportSize({width,height});
      await settle();
      expect((await metrics()).scale).toBeGreaterThan(0);
      await page.screenshot({path:info.outputPath(`overview-${width}.png`)});
      await writeFile(info.outputPath(`metrics-${width}.json`),JSON.stringify(await metrics(),null,2));
    }
    await page.setViewportSize({width:1920,height:1080});
    await settle();
    const board=page.getByTestId('oll-lesson-board');
    await page.mouse.move(10,300);
    await page.mouse.wheel(0,-120);
    await expect(board).toHaveClass(/manual-navigation/);
    const manualScale=(await metrics()).scale;
    if (title.startsWith('水平')) {
      await page.getByTestId('oll-student-tasks').evaluate(element=>{element.style.minHeight='420px';});
      await expect.poll(()=>page.getByTestId('oll-student-tasks').evaluate(element=>element.offsetHeight)).toBeGreaterThanOrEqual(420);
    }
    await expect(board).toHaveClass(/manual-navigation/);
    expect((await metrics()).scale).toBeCloseTo(manualScale,2);
    await page.getByRole('button',{name:'查看整课',exact:true}).click();
    await settle();
  });
}

test('handwritten annotations keep their course cards in place at completion', async ({page}) => {
  await installTestAccount(page);
  await page.goto('/');
  const card=page.locator('.course-launcher-card').filter({has:page.getByRole('heading',{name:courses[0][0],exact:true})});
  await card.getByRole('button',{name:'开始互动',exact:true}).click();
  await expect(page.getByTestId('oll-controls')).toBeVisible();
  const pause=page.getByRole('button',{name:'暂停 OLL 课程'});
  if(await pause.isVisible())await pause.click();
  const next=page.getByRole('button',{name:'下一 OLL Beat',exact:true});
  for(let i=0;i<5;i++)await next.click();
  const scene=page.locator('.board-node.kind-scene3d');
  await expect(scene).toBeVisible();
  await page.getByRole('button',{name:'书写笔迹',exact:true}).click();
  const box=(await scene.boundingBox())!;
  await page.mouse.move(box.x+30,box.y+30);
  await page.mouse.down();
  await page.mouse.move(box.x+100,box.y+40,{steps:8});
  await page.mouse.up();
  await expect(page.getByText(/1 项笔迹/)).toBeVisible();
  const before=await scene.evaluate(element=>({x:element.style.left,y:element.style.top}));
  for(let i=0;i<8 && await next.isEnabled();i++)await next.click();
  await expect(page.getByRole('button',{name:'查看整课',exact:true})).toBeVisible();
  await expect.poll(()=>scene.evaluate(element=>({x:element.style.left,y:element.style.top}))).toEqual(before);
});
