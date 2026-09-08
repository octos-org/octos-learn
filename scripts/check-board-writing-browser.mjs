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
 await page.screenshot({path:process.env.BOARD_PROBE_SCREENSHOT || '/private/tmp/product-board-preview.png'});
 await page.getByRole('button',{name:'选择全部笔迹'}).click();
 if(await page.getByRole('button',{name:'移动笔迹',exact:true}).count()) throw new Error('redundant move mode is still visible');
 if(!await page.evaluate(()=>window.ink.state.selection_transform_enabled)) throw new Error('selected ink is not directly draggable');
 await page.getByRole('button',{name:'撤销笔迹',exact:true}).click();
 await page.waitForFunction((count)=>window.ink.state.component_count===count,originalCount);
 await page.evaluate(()=>window.ink.saveNow());
 await page.reload();
 await page.waitForFunction(()=>window.ink?.state.saved && window.renderWriting);
 await page.evaluate(()=>window.ink.ready);await page.waitForTimeout(500);
 if(await page.evaluate(()=>window.ink.state.component_count)!==originalCount) throw new Error('undo resurrected on React reload');
 console.log(JSON.stringify({passed:['React writes AI strokes','avoids existing assistance card','direct selection movement','undo','reload without resurrection'],components:before.count}));
}finally{await browser.close();}
