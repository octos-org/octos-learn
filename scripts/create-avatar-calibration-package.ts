// Reproducible offline fixture: synthetic tones only, no speech or personal data.
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { normalizeAuthoringLesson } from 'octos-lesson-language';
import { compileRecording } from '../src/learning/teach/compile-recording';
import { createRecording, planCards, startTake, appendEvent, finishTake } from '../src/learning/teach/recording';
import { buildLearnerPackage, lessonNarration, readLearnerPackage } from '../src/learning/teach/learner-package';
import { audioDigest, calibrationWav, envelopeLipSync } from '../src/learning/avatar/lip-sync';
const now = '2026-11-02T12:00:00.000Z';
let recording = planCards(createRecording({id:'synthetic-mouth-calibration',now,topic:{text:'嘴型课包校准（无真人数据）',type:'math_off_map'},goals:[]}),now,[{title:'正向提示音'},{title:'反向提示音'}]);
for (const key of ['card-1','card-2']) recording = finishTake(appendEvent(startTake(recording,key,now),key,{t:0,type:'component.insert',panel:'coordinate_grid',alias:`grid-${key}`,x:[-1,6],y:[-1,9]},now),key,now,{durationMs:4000,asrText:'合成提示音校准样例，不含人声。'});
const compiled=compileRecording(recording,{author:{kind:'learner',learner_ref:`learner:${'0'.repeat(32)}`,presented_by:{avatar_ref:'avatar:octo',voice_ref:'voice:calibration-no-speech'}},language:'zh-CN'});
const events=normalizeAuthoringLesson(compiled.lesson,{lessonId:recording.id,boardId:'synthetic-board',baseRevision:0,resourceContext:compiled.resourceContext});
const narration=[];
for (const [index,line] of lessonNarration(events).entries()) {
 const wav=calibrationWav(), view=new DataView(wav), samples=new Float32Array(64000);
 if (index) { const copy=wav.slice(0), original=new DataView(copy); for(let i=0;i<64000;i++) view.setInt16(44+i*2,original.getInt16(44+(63999-i)*2,true),true); }
 for(let i=0;i<64000;i++) samples[i]=view.getInt16(44+i*2,true)/32768;
 narration.push({...line,audio:new Uint8Array(wav),mediaType:'audio/wav' as const,durationMs:4000,lipSync:envelopeLipSync([samples],16000,await audioDigest(wav))});
}
const result=await buildLearnerPackage({lessonId:recording.id,title:recording.topic.text,language:'zh-CN',createdAt:now,events,snapshots:{},narration});
const opened=await readLearnerPackage(result.archive);
if(opened.manifest.lipSync?.length!==2) throw new Error('Fixture failed round-trip');
const output = process.argv[2] ?? 'delivery/avatar/calibration-mouth-course.olesson';
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output,result.archive);
console.log(JSON.stringify({schema:result.manifest.schema,cards:2,bytes:result.archive.byteLength,contentSha256:result.manifest.contentSha256,allAudio:'synthetic calibration tones; no human voice'}));
