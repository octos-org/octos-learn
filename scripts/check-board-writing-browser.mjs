import { createRequire } from "node:module";
import { resolve } from "node:path";
const ollRoot = resolve(process.env.OCTOS_LOCAL_OLL_PATH || "../octos-lesson-language");
const { chromium } = createRequire(resolve(ollRoot, "package.json"))("playwright-core");
const browser = await chromium.launch({ headless: true,
  ...(process.env.OLL_BROWSER_EXECUTABLE ? { executablePath: process.env.OLL_BROWSER_EXECUTABLE } : {}) });

try {
 const page=await browser.newPage({viewport:{width:1300,height:850}});
 page.on('pageerror',e=>console.log('PAGEERROR',e.message));
 await page.route('**/__product_board_probe',r=>r.fulfill({contentType:'text/html',body:`<html><body><div id="root"></div><script type="module">import RefreshRuntime from '/@react-refresh';RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;</script><script type="module" src="/scripts/whiteboard-assistance-probe.tsx"></script></body></html>`}));
 await page.goto(`${process.env.BOARD_PROBE_URL || 'http://localhost:5174'}/__product_board_probe`);
 await page.waitForFunction(()=>window.ink?.serialize().includes("data-octos-ai-writing"),{},{timeout:30000});
 const before=await page.evaluate(()=>({count:window.ink.state.component_count,svg:window.ink.serialize()}));
 const originalCount = await page.evaluate(() => { const doc=new DOMParser().parseFromString(window.ink.serialize(),"image/svg+xml");return doc.querySelectorAll("path:not([data-octos-ink-origin])").length; });
 if(!before.svg.includes('data-octos-ink-origin="ai"')) throw new Error('missing AI origin');
 const cards=await page.locator('.learning-selection-enhancement').count();
 if(cards!==2) throw new Error(`expected two existing assistance cards, found ${cards}`);
 const links=page.locator('.learning-selection-source-link');
 if(await links.count()!==2) throw new Error('expected each assistance card to keep a source connector');
 const connectorStyle=await links.first().locator('.learning-selection-source-path').evaluate(path=>({
   width:path.getAttribute('stroke-width'),marker:path.getAttribute('marker-end'),route:path.getAttribute('d'),
   arrow:path.closest('svg')?.querySelector('marker polyline')?.getAttribute('points'),
 }));
 if(connectorStyle.width!=='3'||!connectorStyle.marker?.startsWith('url(#selection-source-arrow-')||connectorStyle.arrow!=='2,1 10,5 2,9'||!/^M .* H .* Q .* V .* Q .* H /.test(connectorStyle.route??'')) {
   throw new Error('source connector is missing its orthogonal route or open arrow styling');
 }
 const overlap=await page.evaluate(()=>{
   const boxes=[...document.querySelectorAll('[data-enhancement-id^="probe-card"]')].map(card=>({x:Number.parseFloat(card.style.left),y:Number.parseFloat(card.style.top),width:card.offsetWidth,height:card.offsetHeight}));
   const writing=window.ink.editor.image.getAllComponents().filter(component=>(component.getLoadSaveData().svgAttrs??[]).some(([name,value])=>name==='data-octos-ink-origin'&&value==='ai'));
   const ink=writing.map(component=>component.getExactBBox()).reduce((union,next)=>union?{
     x:Math.min(union.x,next.x),y:Math.min(union.y,next.y),
     width:Math.max(union.x+union.width,next.x+next.width)-Math.min(union.x,next.x),
     height:Math.max(union.y+union.height,next.y+next.height)-Math.min(union.y,next.y),
   }:{x:next.x,y:next.y,width:next.width,height:next.height},null);
   return boxes.some(box=>box.x<ink.x+ink.width&&box.x+box.width>ink.x&&box.y<ink.y+ink.height&&box.y+box.height>ink.y);
 });
 if(overlap) throw new Error('board writing overlaps an existing assistance card');
 const firstCard=page.locator('[data-enhancement-id="probe-card"]');
 const cardBox=await firstCard.boundingBox();
 if(!cardBox) throw new Error('cannot measure assistance card');
 const cardBefore=await firstCard.evaluate(card=>({x:Number(card.dataset.cardX),y:Number(card.dataset.cardY)}));
 await page.mouse.move(cardBox.x+40,cardBox.y+90);
 await page.mouse.down();
 await page.mouse.move(cardBox.x+110,cardBox.y+135,{steps:5});
 await page.waitForFunction(({x,y})=>{
   const card=document.querySelector('[data-enhancement-id="probe-card"]');
   return Number(card?.dataset.cardX)!==x||Number(card?.dataset.cardY)!==y;
 },cardBefore);
 await page.mouse.up();
 const movedCard=await firstCard.evaluate(card=>({x:Number(card.dataset.cardX),y:Number(card.dataset.cardY)}));
 if(movedCard.x-cardBefore.x<60||movedCard.y-cardBefore.y<35) throw new Error('card did not follow direct drag');

 await page.screenshot({path:process.env.BOARD_PROBE_SCREENSHOT || '/private/tmp/product-board-preview.png'});
 await page.getByRole('button',{name:'框选多个笔迹'}).click();
 const sourceScreen=await page.evaluate(()=>{
   const source=window.source.bounds,camera=window.ink.renderedCamera;
   return {
     left:(source.x-10)*camera.scale+camera.panX,
     top:(source.y-10)*camera.scale+camera.panY,
     right:(source.x+source.width+10)*camera.scale+camera.panX,
     bottom:(source.y+source.height+10)*camera.scale+camera.panY,
   };
 });
 await page.mouse.move(sourceScreen.left,sourceScreen.top);
 await page.mouse.down();
 await page.mouse.move(sourceScreen.right,sourceScreen.bottom,{steps:8});
 await page.mouse.up();
 await page.waitForFunction(()=>window.ink.state.selected_count>0);
 if(await page.getByRole('button',{name:'移动笔迹',exact:true}).count()) throw new Error('redundant move mode is still visible');
 if(!await page.evaluate(()=>window.ink.state.selection_transform_enabled)) throw new Error('selected ink is not directly draggable');
 const selection=page.locator('.selection-tool-selection-background').last();
 let selectionBox=await selection.boundingBox();
 if(!selectionBox) throw new Error('cannot measure selected ink');
 const sourceBefore=await links.first().evaluate(link=>({x:Number(link.dataset.sourceX),y:Number(link.dataset.sourceY)}));
 // Empty whiteboard space is still a selection surface. Dragging there must
 // begin a fresh selection gesture instead of moving the existing selection.
 await page.mouse.move(1120,720);await page.mouse.down();
 await page.mouse.move(1180,770,{steps:5});await page.mouse.up();
 await page.waitForTimeout(80);
 const sourceAfterOutsideDrag=await links.first().evaluate(link=>({x:Number(link.dataset.sourceX),y:Number(link.dataset.sourceY)}));
 if(Math.abs(sourceAfterOutsideDrag.x-sourceBefore.x)>1||Math.abs(sourceAfterOutsideDrag.y-sourceBefore.y)>1) {
   throw new Error('dragging outside the selection moved its ink');
 }
 // Restore the original selection, then exercise the intended direct drag.
 await page.mouse.move(sourceScreen.left,sourceScreen.top);await page.mouse.down();
 await page.mouse.move(sourceScreen.right,sourceScreen.bottom,{steps:8});await page.mouse.up();
 await page.waitForFunction(()=>window.ink.state.selected_count>0);
 selectionBox=await selection.boundingBox();
 if(!selectionBox) throw new Error('cannot measure recreated selection');
 // Drag from the center of the original selected source. The full selection
 // also contains AI writing and can span across card-sized gaps; js-draw's
 // transform hit target is most reliable over an actual selected component.
 const selectionX=selectionBox.x+selectionBox.width/2;
 const selectionY=selectionBox.y+selectionBox.height/2;
 await page.mouse.move(selectionX,selectionY);
 await page.mouse.down();
 await page.mouse.move(selectionX+70,selectionY+40,{steps:6});
 await page.waitForTimeout(80);
 const sourceDuringDrag=await links.first().evaluate(link=>({x:Number(link.dataset.sourceX),y:Number(link.dataset.sourceY)}));
 if(sourceDuringDrag.x-sourceBefore.x<55||sourceDuringDrag.y-sourceBefore.y<25) {
   const dragDebug=await page.evaluate(({x,y})=>({
     hit:document.elementFromPoint(x,y)?.className,
     state:window.ink.state,
     source:window.ink.getSelectionSourceBounds(window.source),
     camera:window.ink.renderedCamera,
     viewport:window.ink.options.viewport.getBoundingClientRect().toJSON(),
   }),{x:selectionX,y:selectionY});
   dragDebug.selectionBox=selectionBox;
   throw new Error('source connector did not update before pointer release: '+JSON.stringify(dragDebug));
 }
 await page.mouse.up();
 await page.getByRole('button',{name:'撤销笔迹',exact:true}).click();
 await page.waitForFunction(({x,y})=>{
   const link=document.querySelector('.learning-selection-source-link');
   return Math.abs(Number(link?.dataset.sourceX)-x)<1&&Math.abs(Number(link?.dataset.sourceY)-y)<1;
 },sourceBefore);

 const resize=firstCard.getByRole('button',{name:/调整辅助卡片大小/});
 const resizeBox=await resize.boundingBox();
 if(!resizeBox) throw new Error('cannot measure card resize handle');
 await page.mouse.move(resizeBox.x+resizeBox.width/2,resizeBox.y+resizeBox.height/2);
 await page.mouse.down();
 await page.mouse.move(resizeBox.x+65,resizeBox.y+65,{steps:4});
 await page.mouse.up();
 const resizedScale=Number(await firstCard.getAttribute('data-card-scale'));
 if(resizedScale<=1.2) throw new Error('card size was not changed');
 await firstCard.getByRole('button',{name:'最小化这条辅助内容'}).click();
 const minimizedPin=page.getByRole('button',{name:'展开小章鱼辅助：已有辅助卡片'});
 if(!await minimizedPin.count()) throw new Error('card did not minimize');
 await minimizedPin.hover();
 if(await minimizedPin.evaluate(pin=>getComputedStyle(pin).transform)!=='none') throw new Error('minimized card grows on hover');

 await page.getByRole('button',{name:'撤销笔迹',exact:true}).click();
 await page.waitForFunction((count)=>window.ink.state.component_count===count,originalCount);
 await page.evaluate(()=>window.ink.saveNow());
 await page.reload();
 await page.waitForFunction(()=>window.ink?.state.saved && window.renderWriting);
 await page.evaluate(()=>window.ink.ready);await page.waitForTimeout(500);
 if(await page.evaluate(()=>window.ink.state.component_count)!==originalCount) throw new Error('undo resurrected on React reload');
 const restoredLayout=await page.evaluate(()=>window.layouts?.['probe-card']);
 if(!restoredLayout?.minimized||!restoredLayout.manually_positioned||Math.abs(restoredLayout.x-movedCard.x)>1||Math.abs(restoredLayout.y-movedCard.y)>1||Math.abs(restoredLayout.scale-resizedScale)>.02) {
   throw new Error('card position, size, or minimized state did not survive reload');
 }
 if(!await page.getByRole('button',{name:'展开小章鱼辅助：已有辅助卡片'}).count()) throw new Error('minimized card was not restored');
 console.log(JSON.stringify({passed:['React writes AI strokes','shared collision avoidance','direct card movement','persistent card state','orthogonal open-arrow connector','no hover enlargement','selection-only drag boundary','live connector during ink drag','direct selection movement','independent undo','reload without resurrection'],components:before.count}));
}finally{await browser.close();}
