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
 if(await page.locator('.learning-selection-enhancement-card').count()) throw new Error('unexpected card');
 await page.screenshot({path:process.env.BOARD_PROBE_SCREENSHOT || '/private/tmp/product-board-preview.png'});
 await page.getByRole('button',{name:'选择全部笔迹'}).click();
 await page.getByRole('button',{name:'移动笔迹',exact:true}).click();
 if(!await page.evaluate(()=>window.ink.state.selection_transform_enabled)) throw new Error('move toolbar not wired');
 await page.getByRole('button',{name:'完成移动',exact:true}).click();
 await page.getByRole('button',{name:'撤销笔迹',exact:true}).click();
 await page.waitForFunction((count)=>window.ink.state.component_count===count,originalCount);
 await page.evaluate(()=>window.ink.saveNow());
 await page.reload();
 await page.waitForFunction(()=>window.ink?.state.saved && window.renderWriting);
 await page.evaluate(()=>window.ink.ready);await page.waitForTimeout(500);
 if(await page.evaluate(()=>window.ink.state.component_count)!==originalCount) throw new Error('undo resurrected on React reload');
 console.log(JSON.stringify({passed:['React writes AI strokes','no card','toolbar movement','undo','reload without resurrection'],components:before.count}));
}finally{await browser.close();}
