const fs=require('fs');
const base='/Users/alan0x/Documents/projects/octos-learn';
const katex=require(base+'/node_modules/katex');
const {evaluateMathExpression:E}=require(base+'/node_modules/octos-lesson-language/dist/packages/core/src/index.js');
const source=base+'/docs/course-runtime-quality/layout-research-2026-09-25';
const rows=JSON.parse(fs.readFileSync(source+'/course-structure.json'));
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=x=>Math.round(x*100)/100;
function svg(node,vars){const c=structuredClone(node.content),W=360,H=246;
 const p=(x,y)=>`${num(x)},${num(y)}`;let marks='';
 if(node.kind==='scene3d'){
  const obj=(c.objects||[]).find(o=>o.kind==='surface');if(!obj)return '';
  const xr=obj.x_range||{min:-2,max:2},yr=obj.y_range||{min:-2,max:2};const samples=[];
  for(let i=0;i<=16;i++)for(let j=0;j<=16;j++){let x=xr.min+(xr.max-xr.min)*i/16,y=yr.min+(yr.max-yr.min)*j/16;try{samples.push({x,y,z:E(obj.expression,{...vars,x,y})});}catch{}}
  const zs=samples.map(p=>p.z),zlo=Math.min(...zs),zhi=Math.max(...zs);const project=(x,y,z)=>{let nx=(x-xr.min)/(xr.max-xr.min)*2-1,ny=(y-yr.min)/(yr.max-yr.min)*2-1,nz=(z-zlo)/(zhi-zlo||1);return [180+72*(nx-ny),175+27*(nx+ny)-120*nz];};
  for(const sec of c.sections||[]){const a=sec.axis,v=sec.value;let pts=a==='z'?[[xr.min,yr.min,v],[xr.max,yr.min,v],[xr.max,yr.max,v],[xr.min,yr.max,v]]:a==='y'?[[xr.min,v,zlo],[xr.max,v,zlo],[xr.max,v,zhi],[xr.min,v,zhi]]:[[v,yr.min,zlo],[v,yr.max,zlo],[v,yr.max,zhi],[v,yr.min,zhi]];marks+=`<polygon points="${pts.map(t=>p(...project(...t))).join(' ')}" fill="var(--om-plane)" stroke="var(--om-orange)" stroke-dasharray="4 3"/>`;}
  for(let direction=0;direction<2;direction++)for(let i=0;i<=12;i++){let pts=[];for(let j=0;j<=32;j++){let x=xr.min+(xr.max-xr.min)*(direction?j/32:i/12),y=yr.min+(yr.max-yr.min)*(direction?i/12:j/32);try{pts.push(p(...project(x,y,E(obj.expression,{...vars,x,y}))));}catch{}}marks+=`<polyline points="${pts.join(' ')}" fill="none" stroke="var(--om-teal)" stroke-width="1.2" opacity=".7"/>`;}
  marks+=`<text x="14" y="235" fill="var(--om-ink)" font-size="13">${esc(obj.label||obj.expression)}</text>`;
 }else{
 const ax=c.axes||{x:{min:-4,max:4},y:{min:-4,max:4}};const xmin=ax.x.min,xmax=ax.x.max,ymin=ax.y.min,ymax=ax.y.max;
 let sx=300/(xmax-xmin),sy=190/(ymax-ymin);if(ax.equal_scale)sx=sy=Math.min(sx,sy);const ox=180-(xmin+xmax)*sx/2,oy=119+(ymin+ymax)*sy/2;const X=x=>ox+x*sx,Y=y=>oy-y*sy;
 for(let i=0;i<=4;i++){const x=xmin+(xmax-xmin)*i/4,y=ymin+(ymax-ymin)*i/4;marks+=`<path d="M${p(X(x),Y(ymin))}L${p(X(x),Y(ymax))}M${p(X(xmin),Y(y))}L${p(X(xmax),Y(y))}" stroke="var(--om-grid)" fill="none"/>`;}
 if(ymin<=0&&ymax>=0)marks+=`<path d="M${p(X(xmin),Y(0))}L${p(X(xmax),Y(0))}" stroke="var(--om-muted)"/>`;
 if(xmin<=0&&xmax>=0)marks+=`<path d="M${p(X(0),Y(ymin))}L${p(X(0),Y(ymax))}" stroke="var(--om-muted)"/>`;
 marks+=`<text x="328" y="235" fill="var(--om-muted)" font-size="12">${esc(ax.x.label?.length<6?ax.x.label:'x')}</text><text x="13" y="20" fill="var(--om-muted)" font-size="12">${esc(ax.y.label?.length<6?ax.y.label:'y')}</text>`;
 for(const [i,curve] of (c.curves||[]).entries()){let pts=[];for(let j=0;j<=150;j++){let x=xmin+(xmax-xmin)*j/150;try{let y=E(curve.expression,{...vars,x,t:x});if(y>=ymin&&y<=ymax)pts.push(p(X(x),Y(y)));}catch{}}marks+=`<polyline points="${pts.join(' ')}" fill="none" stroke="var(--om-${i?'rose':'teal'})" stroke-width="2.4"/>`;}
 const points=Object.fromEntries((c.points||[]).map(pt=>[pt.id,pt]));
 for(const poly of c.polygons||[])marks+=`<polygon points="${poly.points.map(id=>points[id]).filter(Boolean).map(pt=>p(X(pt.x),Y(pt.y))).join(' ')}" fill="var(--om-${poly.tone==='accent'?'plane':'wash'})" stroke="var(--om-teal)" stroke-width="1.5"/>`;
 for(const cir of c.circles||[]){let pt=points[cir.center];if(pt)marks+=`<ellipse cx="${num(X(pt.x))}" cy="${num(Y(pt.y))}" rx="${num(cir.radius*sx)}" ry="${num(cir.radius*sy)}" fill="none" stroke="var(--om-teal)" stroke-width="2.2"/>`;}
 for(const seg of c.segments||[]){let a=points[seg.from],b=points[seg.to];if(a&&b)marks+=`<path d="M${p(X(a.x),Y(a.y))}L${p(X(b.x),Y(b.y))}" stroke="var(--om-teal)" stroke-width="1.2" ${seg.style==='dashed'||seg.style==='projection'?'stroke-dasharray="4 4"':''}/>`;}
 for(const pt of c.points||[]){if(pt.visible===false)continue;marks+=`<circle cx="${num(X(pt.x))}" cy="${num(Y(pt.y))}" r="3.4" fill="var(--om-rose)"/>`;}
 }
 return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(c.title)}静态示意"><title>${esc(c.title)}静态示意</title>${marks}</svg>`;
}
const data=rows.map(course=>{
 const measured=JSON.parse(fs.readFileSync(source+'/'+course.id+'.json'));const dimensions=Object.fromEntries(measured.states['ended-1920'].cards.filter(c=>c.type==='node').map(c=>[c.id,c]));const vars=Object.fromEntries(course.variables.map(v=>[v.as,v.initial]));
 const controls=course.variables.filter(v=>v.control);let controlPlaced=false;const allVisuals=course.steps.flatMap(s=>s.nodes).filter(n=>['plot','scene3d','geometry','diagram','image'].includes(n.kind));
 const controlTargets=Object.fromEntries(controls.map(v=>[v.as,allVisuals.filter(n=>JSON.stringify(n.content).includes('"'+v.as+'"')||JSON.stringify(n.content).includes(v.as)).map(n=>n.id)]));
 return {id:course.id,title:measured.title,version:course.version,controls:controls.map(v=>({as:v.as,label:v.label,min:v.min,max:v.max,value:v.initial})),tasks:course.tasks.map(t=>({prompt:t.prompt,variables:t.allowed_operations.filter(o=>o.kind==='variable_change').map(o=>o.variable)})),steps:course.steps.map((step,idx)=>{
 const visuals=step.nodes.filter(n=>['plot','scene3d','geometry','diagram','image'].includes(n.kind));const owned=controls.filter(v=>controlTargets[v.as].some(id=>visuals.some(n=>n.id===id))&&!controlPlaced);if(owned.length)controlPlaced=true;
 return {index:idx+1,purpose:step.purpose,nodes:step.nodes.map(n=>{const visual=visuals.includes(n);let body='';if(n.kind==='math'){try{const latex=n.content.latex||n.content.text||'';const lines=latex.split(/(?=\\implies)/);body=lines.map(line=>katex.renderToString(line,{output:'mathml',throwOnError:true,strict:false})).join('');}catch{body=`<div class="om-formula-error">原公式渲染异常 · 保留原文</div><code>${esc(n.content.latex||n.content.text)}</code>`;}}else if(visual)body=svg(n,vars);return {id:n.id,kind:n.kind,title:n.content.title||'',items:n.content.items||[],text:n.content.text||'',caption:n.content.caption||'',width:dimensions[n.id]?.nw||320,body};}),controlAliases:owned.map(v=>v.as)};
 })};
});
fs.writeFileSync('/tmp/octos-layout-research/mock-data.json',JSON.stringify(data));console.log(data.length,fs.statSync('/tmp/octos-layout-research/mock-data.json').size);
