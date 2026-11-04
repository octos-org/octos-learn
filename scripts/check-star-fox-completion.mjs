import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
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
if(errors.length){console.error('Star Fox work is incomplete:\n'+errors.map(x=>' - '+x).join('\n'));process.exit(1);}
console.log('All six Star Fox work items have completion records and available evidence. This gate does not replace visual or device acceptance.');
