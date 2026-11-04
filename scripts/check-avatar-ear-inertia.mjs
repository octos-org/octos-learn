import {readFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
const root='docs/avatar-animation-phase-a/ear-inertia/',errors=[];
if(!existsSync(root+'report.json')||!existsSync(root+'validation.json')){
 console.error('Passive ear inertia is incomplete: missing render or verification record.');process.exit(1);
}
const report=JSON.parse(readFileSync(root+'report.json','utf8')),validation=JSON.parse(readFileSync(root+'validation.json','utf8'));
if(report.schema!=='passive-ear-inertia/1'||report.characters.length!==4||report.characters.some(c=>c.idleEarMax>1||c.heldEarMax>1)||report.maxAngleRadians>.025||report.peakAngle<=0||report.peakAngle>report.maxAngleRadians||report.tipMax>=6||report.rootMax>1e-9||report.idleEarEvents!==0||!report.rebound||!report.settled||report.finalEarPose.leftTilt!==0||report.finalEarPose.rightTilt!==0)errors.push('Passive follow-through constraints failed');
if(Object.keys(report.inputSha256??{}).length<30)errors.push('Missing source/material freshness records');
for(const[path,hash]of Object.entries(report.inputSha256??{}))if(!existsSync(path)||createHash('sha256').update(readFileSync(path)).digest('hex')!==hash)errors.push('Stale evidence: '+path);
if(!validation.implementationComplete||!validation.fullUnit?.passed||validation.fullUnit.tests<1700||!validation.buildPassed||!validation.lintPassed||!validation.i18nPassed||validation.preview?.pageHttp!==200||JSON.stringify(validation.inputSha256)!==JSON.stringify(report.inputSha256))errors.push('Required verification is incomplete');
const stage=readFileSync('src/learning/avatar/illustrated-avatar-stage.tsx','utf8'),page=readFileSync('src/learning/avatar/avatar-lab-page.tsx','utf8');
if(stage.includes('earTurn')||stage.includes('earDemo')||page.includes('左耳转向')||page.includes('播放左耳转向对照'))errors.push('Removed turn animation is still reachable in preview');
if(errors.length){console.error(errors.join('\n'));process.exit(1);}
console.log('Passive ear inertia complete: four stationary/held-pose checks, small follow-through, settling, current evidence. Visual/device acceptance remains separate.');
if(existsSync('docs/avatar-animation-phase-a/expressions/report.json'))await import('./check-avatar-expressions.mjs');
