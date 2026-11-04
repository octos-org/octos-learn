/** Run the actual web WASM backend in Node; never claim this is a browser or webcam test. */
import {createRequire} from 'node:module';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import * as ort from 'onnxruntime-web/wasm';

const [toolsDir,modelPath,output='docs/avatar-animation-phase-a/cartoon-style/dct-probe']=process.argv.slice(2);
if(!toolsDir||!modelPath)throw Error('Expected authoring tools directory and converted ONNX model');
const {createCanvas,loadImage}=createRequire(`${resolve(toolsDir)}/package.json`)('@napi-rs/canvas');
ort.env.wasm.numThreads=1;
ort.env.wasm.proxy=false;
const bytes=await readFile(modelPath),session=await ort.InferenceSession.create(bytes,{executionProviders:['wasm']});
const name='head-288',image=await loadImage(`${output}/${name}-input.png`),reference=await loadImage(`${output}/${name}-output.png`);
const canvas=createCanvas(image.width,image.height),ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);
const pixels=ctx.getImageData(0,0,image.width,image.height).data,input=new Float32Array(image.width*image.height*3);
for(let i=0;i<input.length/3;i++){input[i*3]=pixels[i*4+2];input[i*3+1]=pixels[i*4+1];input[i*3+2]=pixels[i*4];}
const tensor=new ort.Tensor('float32',input,[image.height,image.width,3]);
const evaluate=()=>session.run({'input_image:0':tensor});
const started=performance.now();let result=await evaluate();const warmupMs=performance.now()-started,timings=[];
for(let i=0;i<5;i++){const start=performance.now();result=await evaluate();timings.push(performance.now()-start);}
const actual=result['output_image:0'];if(actual.type!=='uint8'||actual.data.length!==input.length)throw Error('Unexpected output');
ctx.clearRect(0,0,image.width,image.height);ctx.drawImage(reference,0,0);
const expected=ctx.getImageData(0,0,image.width,image.height).data;
let max=0,total=0;
for(let i=0;i<input.length/3;i++)for(let c=0;c<3;c++){
  const value=Math.floor(Math.max(0,Math.min(255,actual.data[i*3+2-c]))),d=Math.abs(value-expected[i*4+c]);max=Math.max(max,d);total+=d;
}
if(max>2)throw Error(`WASM output differs from TensorFlow by ${max}`);
const sorted=[...timings].sort((a,b)=>a-b);
await session.release();
const report={date:'2026-11-03',scope:'onnxruntime-web WASM executed locally under Node, one thread',
  runtime:ort.env.versions,node:process.version,machine:process.arch,modelSha256:createHash('sha256').update(bytes).digest('hex'),
  shape:[image.height,image.width,3],warmupMs,inferenceMs:timings,medianMs:sorted[Math.floor(sorted.length/2)],
  maxChannelDifferenceVsTensorFlow:max,meanChannelDifferenceVsTensorFlow:total/input.length,
  browserTested:false,webGpuTested:false,cameraUsed:false,
  limits:'Core graph only. No capture/alignment/background/display timing. Node WASM success does not establish real-time browser or Android compatibility.'};
await writeFile(`${output}/wasm-report.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
