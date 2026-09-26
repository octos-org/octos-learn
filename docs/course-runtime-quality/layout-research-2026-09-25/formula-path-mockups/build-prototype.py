from pathlib import Path
p=(Path(__file__).parent/'previous-prototype.html').read_text()
p=p.replace('步骤行 / 对照块 / 连续讲解 / 关联练习','步骤行 / 连续公式 / 按出场区间旁置笔记 / 操作区')
p=p.replace('设计示意 · 非应用实测','第二版示意 · 非应用实测')
start=p.index('    function render()')
end=p.index('    function fitMath()',start)
p=p[:start]+'''    function readingFlow(nodes){let rows=[],active=null;for(const n of nodes){if(n.kind==='math'){active={math:n,notes:[]};rows.push(active);}else if(active){active.notes.push(n);}else{rows.push({math:null,notes:[n]});}}return rows.map(r=>`<div class="fp-row">${r.math?card(r.math):''}${r.notes.length?`<div class="fp-notes">${r.notes.map(card).join('')}</div>`:''}</div>`).join('');}
    function render(){const c=courses[current];picker.value=current;root.querySelector('[data-title]').textContent=c.title;const count=c.steps.reduce((a,s)=>a+s.nodes.length,0);root.querySelector('[data-meta]').textContent=`${c.steps.filter(s=>s.nodes.length).length} 个建卡步骤 · ${count} 张内容卡 · ${c.controls.length} 个控件 · ${c.tasks.length} 道练习 · ${design.practice}`;
      board.innerHTML=c.steps.filter(s=>s.nodes.length).map(s=>{const vis=s.nodes.filter(n=>['geometry','plot','scene3d','image','diagram'].includes(n.kind)),reading=s.nodes.filter(n=>!vis.includes(n));return `<section class="om-step" data-step="${s.index}"><div class="om-step-heading"><span class="om-step-number">${String(s.index).padStart(2,'0')}</span><h2>${esc(s.purpose||'课程步骤 '+s.index)}</h2></div><div class="om-stage">${vis.length?`<div class="om-pictures">${vis.map(card).join('')}</div>`:''}${reading.length?`<div class="fp-reading">${readingFlow(reading)}</div>`:''}</div>${rail(c,s.controlAliases)}</section>`;}).join('');layout();
    }
''' + p[end:]
start=p.index('    function layout()')
end=p.index('    function persist()',start)
p=p[:start]+'''    function layout(){const G=design.spacing;
      root.querySelectorAll('.om-step').forEach(step=>{const stage=step.querySelector('.om-stage'),W=stage.clientWidth,pics=stage.querySelector('.om-pictures'),reading=stage.querySelector('.fp-reading');let pw=0,rw=0;
      if(pics){const ns=[...pics.children];pw=Math.min(W,ns.reduce((s,e)=>s+Number(e.dataset.natural),0)+16*(ns.length-1));pics.style.width=pw+'px';pics.style.flexWrap='wrap';ns.forEach(e=>e.style.width=Math.min(Number(e.dataset.natural),pw)+'px');}
      if(reading){const rows=[...reading.children];rw=Math.min(W,Math.max(...rows.map(row=>{const m=row.querySelector('.om-math'),notes=[...row.querySelectorAll('.om-note')];const mw=m?Number(m.dataset.natural):0,nw=notes.length?Math.max(...notes.map(n=>Number(n.dataset.natural))):0;return mw+nw+(mw&&nw?G:0);})));}
      const side=!!pics&&!!reading&&pw+G+rw<=W;stage.style.flexDirection=side?'row':'column';stage.style.gap=G+'px';
      if(reading){const available=side?W-pw-G:W;reading.style.width=Math.min(available,Math.max(rw,Math.min(680,available)))+'px';const A=reading.clientWidth;
      [...reading.children].forEach(row=>{const m=row.querySelector('.om-math'),notes=row.querySelector('.fp-notes');const mw=m?Number(m.dataset.natural):0,nw=notes?Math.max(...[...notes.children].map(n=>Number(n.dataset.natural))):0;const adjacent=!!m&&!!notes&&Math.max(320,mw)+G+Math.max(320,nw)<=A;row.style.flexDirection=adjacent?'row':'column';row.dataset.mode=adjacent?'interval-side':'ordered-stack';row.style.gap='14px';if(m)m.style.width=Math.min(mw,A)+'px';if(notes){notes.style.width=Math.min(nw,adjacent?A-mw-14:A)+'px';[...notes.children].forEach(n=>n.style.width=Math.min(Number(n.dataset.natural),notes.clientWidth)+'px');}});}
      const rail=step.querySelector('.om-rail');if(rail){rail.style.marginTop='16px';rail.style.width=Math.min(W,736)+'px';rail.style.flexDirection=W>=736?'row':'column';rail.style.gap='16px';[...rail.children].forEach(n=>n.style.width=Math.min(W,rail.style.flexDirection==='row'?(rail.clientWidth-16)/2:360)+'px');}
      stage.dataset.template=side?'visual-beside-reading':'visual-above-reading';
      });fitMath();root.dataset.ready='true';
    }
''' + p[end:]
p=p.replace('  </style>','''    #octos-layout-proposals .fp-reading{display:flex;flex-direction:column;gap:18px;min-width:0;flex:none;max-width:100%}
    #octos-layout-proposals .fp-row{display:flex;align-items:flex-start;max-width:100%;min-width:0}
    #octos-layout-proposals .fp-notes{display:flex;flex-direction:column;gap:12px;max-width:100%;min-width:0;flex:none}
  </style>''',1)
p=p.replace("if(globalThis.Tweak){const tweak=new Tweak({container:root,onChange:render});tweak.addSlider(design,'spacing',{label:'关联区间距',min:12,max:32,step:2,unit:'px'});tweak.addSelect(design,'practice',{label:'练习展示',options:['全部练习展开','仅首题预览']});}",'')
(Path(__file__).parent/'preview.html').write_text(p)
