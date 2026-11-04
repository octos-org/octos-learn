import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import {createHash} from 'node:crypto';
const path='docs/avatar-animation-phase-a/star-fox-sample/task-status.json';
const state=JSON.parse(readFileSync(path,'utf8'));
const required=['baseline','both_ears','main_hair_locks','natural_motion','mouth_material_and_shapes','validation_and_preview'];
const errors=[];
for(const id of required){
  const task=state.tasks.find(t=>t.id===id);
  if(task?.status!=='complete')errors.push(`${id}: ${task?.status??'missing'}`);
  if(!task?.evidence?.length)errors.push(`${id}: missing evidence`);
  for(const evidence of task?.evidence??[]){
    if(evidence.startsWith('git:')){try{execFileSync('git',['cat-file','-e',evidence.slice(4)+'^{commit}'],{stdio:'pipe'});}catch{errors.push(`${id}: unknown checkpoint ${evidence}`);}}
    else if(!existsSync(evidence))errors.push(`${id}: evidence does not exist: ${evidence}`);
  }
}
const reportPath='docs/avatar-animation-phase-a/star-fox-sample/report.json';
if(existsSync(reportPath)){
 const report=JSON.parse(readFileSync(reportPath,'utf8'));
 if(report.neutralDiff.max>1||report.expressionMax>1||report.bodyMax!==0||report.minAlpha!==255||report.rightRootMax>1||report.minimumPartTriangle<.35||report.mouthCloseMax>1)errors.push('Current material/geometry report failed');
 if(!report.natural||report.natural.overlap!==0||report.natural.quiet<report.natural.states*.7||report.natural.settled>.001)errors.push('Natural motion/settling evidence failed');
 for(const[path,hash]of Object.entries(report.inputSha256??{}))if(!existsSync(path)||createHash('sha256').update(readFileSync(path)).digest('hex')!==hash)errors.push(`Validation is stale: ${path}`);
 if(Object.keys(report.inputSha256??{}).length<10)errors.push('Missing source/material freshness hashes');
 for(const side of['left','right']){const path=`docs/avatar-animation-phase-a/star-fox-sample/${side}-seam.json`;if(!existsSync(path)){errors.push(`Missing ${side} seam evidence`);continue;}const seam=JSON.parse(readFileSync(path,'utf8'));if(seam.sweepStates<87||seam.maximumExposedPaper!==0||seam.maximumSeamDifference>1)errors.push(`${side} visible seam failed`);}
 const validationPath='docs/avatar-animation-phase-a/star-fox-sample/validation.json';
 if(!existsSync(validationPath))errors.push('Missing final test/build/preview evidence');
 else{const v=JSON.parse(readFileSync(validationPath,'utf8'));if(!v.fullUnit?.passed||v.fullUnit.tests<1700||!v.finalUi?.passed||!v.buildPassed||!v.lintPassed||!v.i18n?.passed||v.preview?.pageHttp!==200||v.preview?.allImageHttp!==200)errors.push('Final required checks are incomplete');if(JSON.stringify(v.inputSha256)!==JSON.stringify(report.inputSha256))errors.push('Final checks refer to a different source/material set');}
}else errors.push('Missing current product-rendering report');
const trialPath='docs/avatar-animation-phase-a/ear-turn-trial/report.json';
if(existsSync(trialPath)){
 const trial=JSON.parse(readFileSync(trialPath,'utf8'));
 // Frozen ear RGB was a false guarantee: it preserved the user's white patch.
 // Require the actual regression and negative controls instead of that metric.
 if(trial.schemaVersion!==2||trial.frames<12||trial.checkedStates<135||trial.exposedPaper!==0||trial.bodyMax!==0||trial.hairMaxDifference>1||trial.attachmentOverlapMin<240||trial.occluderOldEarAlphaMax!==0||trial.fixedWhitePatchCount!==0||trial.reportedWhitePatchCount<3||!trial.failedControls||Object.values(trial.failedControls).some(n=>n===0)||trial.innerWhite.at(-1)>trial.innerWhite[0]*.65)errors.push('Drawn ear trial failed the reported fixed-fur regression');
 for(const[path,hash]of Object.entries(trial.inputSha256??{}))if(!existsSync(path)||createHash('sha256').update(readFileSync(path)).digest('hex')!==hash)errors.push(`Ear trial validation is stale: ${path}`);
 const recordPath='docs/avatar-animation-phase-a/ear-turn-trial/validation.json';
 if(!existsSync(recordPath))errors.push('Missing ear trial completion evidence');
 else{const v=JSON.parse(readFileSync(recordPath,'utf8'));if(!v.implementationComplete||!v.fullUnit?.passed||!v.buildPassed||!v.lintPassed||!v.i18nPassed||v.preview?.pageHttp!==200||v.preview?.atlasHttp!==200||JSON.stringify(v.inputSha256)!==JSON.stringify(trial.inputSha256))errors.push('Ear trial completion evidence is incomplete');}
}
if(errors.length){console.error('Star Fox work is incomplete:\n'+errors.map(x=>' - '+x).join('\n'));process.exit(1);}
console.log('All six Star Fox work items have completion records and available evidence. This gate does not replace visual or device acceptance.');
