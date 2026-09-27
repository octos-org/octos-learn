import {chromium} from "playwright";
import {writeFile} from "node:fs/promises";
async function installTestAccount(page) {
  await page.addInitScript(() => {
    localStorage.setItem("octos_session_token", "curated-course-e2e");
    localStorage.setItem("selected_profile", "curated-learner");
    localStorage.setItem("octos-learn:setup-skipped:curated-learner", "yes");
  });
  await page.routeWebSocket((url) => url.pathname.startsWith("/api/"), (socket) => socket.close());
  await page.route((url) => url.pathname.startsWith("/api/"), async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname.startsWith("/api/learn/course-packs")) return route.continue();
    const responses = {
      "/api/auth/status": { bootstrap_mode: false, email_login_enabled: true },
      "/api/auth/me": {
        user: { id: "curated-learner", email: "learner@example.test", name: "Learner" },
        portal: { accessible_profiles: [{ id: "curated-learner", name: "Learner" }], home_profile_id: "curated-learner", can_access_admin_portal: false },
      },
      "/api/my/profile": { id: "curated-learner", name: "Learner", config: { llm: { primary: { family_id: "", model_id: "" } } } },
    };
    await route.fulfill({ status: pathname in responses ? 200 : 503, contentType: "application/json", body: JSON.stringify(responses[pathname] ?? {}) });
  });
}

const browser = await chromium.launch({headless:true});
try {
const page = await browser.newPage({ignoreHTTPSErrors:true,viewport:{width:1920,height:1080}});
await installTestAccount(page);
const errors=[]; page.on('pageerror',e=>errors.push(e.message));
await page.goto('https://127.0.0.1:5185/');
const card=page.locator('.course-launcher-card').filter({has:page.getByRole('heading',{name:'旋转抛物面的截面与降维分析法',exact:true})});
await card.getByRole('link',{name:'预览',exact:true}).click();
await page.getByTestId('oll-controls').waitFor();
const pause=page.getByRole('button',{name:'暂停 OLL 课程'}); if(await pause.isVisible()) await pause.click();
const frames=[];
for(let i=0;i<5;i++) {
 await page.getByRole('button',{name:'下一 OLL Beat',exact:true}).click();
 await page.waitForTimeout(400);
 frames.push(await page.evaluate(()=>({
  nodes:[...document.querySelectorAll('.board-node')].map(e=>({id:e.dataset.id,kind:e.dataset.kind,text:e.textContent,style:e.getAttribute('style'),client:[e.clientWidth,e.clientHeight],scroll:[e.scrollWidth,e.scrollHeight],math:[...e.querySelectorAll('.math-render,.katex-display,.katex,.katex-html,.base,.katex-base')].map(m=>({class:m.className,rect:{x:m.getBoundingClientRect().x,y:m.getBoundingClientRect().y,w:m.getBoundingClientRect().width,h:m.getBoundingClientRect().height},client:[m.clientWidth,m.clientHeight],scroll:[m.scrollWidth,m.scrollHeight],css:{lineHeight:getComputedStyle(m).lineHeight,overflow:getComputedStyle(m).overflow}}))})),
  controls:[...document.querySelectorAll('[data-interaction-controls-id]')].map(e=>({style:e.parentElement.getAttribute('style'),rect:e.getBoundingClientRect().toJSON()}))
 })));
}
console.log(JSON.stringify(frames.at(-1),null,2));
await writeFile('test-results/course-quality/baseline-layout.json',JSON.stringify(frames,null,2));
await page.screenshot({path:'test-results/course-quality/baseline.png'});
await writeFile('test-results/course-quality/baseline-errors.json',JSON.stringify(errors));
} finally {await browser.close();}
