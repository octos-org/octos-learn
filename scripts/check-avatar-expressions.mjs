import {readFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
const root='docs/avatar-animation-phase-a/expressions/',errors=[];
if(!existsSync(root+'report.json')||!existsSync(root+'validation.json')){console.error('Expressions incomplete: missing report or validation');process.exit(1);}
const r=JSON.parse(readFileSync(root+'report.json','utf8')),v=JSON.parse(readFileSync(root+'validation.json','utf8'));
if(r.schema!=='avatar-expressions/1'||r.characters.length!==4)errors.push('Missing four-character expression report');
for(const c of r.characters){
 if(c.protectedMax>1||c.closeMax>1||c.minAlpha!==255||c.oppositeBrowMax>1||c.returnMax>1||Object.entries(c.changes).filter(([key])=>!['neutral','close-override'].includes(key)).some(([,value])=>value.count<8))errors.push('Expression isolation/visibility failed for '+c.character);
 if(Object.keys(c.changes).length<22)errors.push('Missing lip or brow cases for '+c.character);
}
const fox=r.characters.find(c=>c.character==='star-fox'),rabbit=r.characters.find(c=>c.character==='white-rabbit'),panda=r.characters.find(c=>c.character==='red-panda');
if(!fox||!rabbit||!panda||rabbit.ear.peak<fox.ear.peak*1.8||panda.ear.peak>=fox.ear.peak)errors.push('Ear character differences failed');
for(const[path,hash]of Object.entries(r.inputSha256??{}))if(!existsSync(path)||createHash('sha256').update(readFileSync(path)).digest('hex')!==hash)errors.push('Stale expression evidence: '+path);
if(Object.keys(r.inputSha256??{}).length<30||!v.implementationComplete||!v.fullUnit?.passed||!v.buildPassed||!v.lintPassed||!v.i18nPassed||v.preview?.pageHttp!==200||!v.recordReplayTestsPassed||JSON.stringify(v.inputSha256)!==JSON.stringify(r.inputSha256))errors.push('Expression verification incomplete');
if(errors.length){console.error(errors.join('\n'));process.exit(1);}console.log('Expressions complete: 22 poses per character, asymmetric brows, mouth closure/return, distinct ear profiles and current evidence.');
