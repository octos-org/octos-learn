import { faceChannel, type FaceFrame } from "./face-frame";
import type { FoxSurfaceFactory } from "./original-fox";
import { paintEyes, preparePaintedEyes } from "./painted-eyes";

const root = "teach-avatars/star-fox/painted-v0.1/";
export const PAINTED_FOX_ASSETS = { base: `${root}source.png`, clean: `${root}clean.png`, mouth: `${root}mouth.png`, brows: `${root}brows-clean.png` } as const;
export type PaintedFoxImages = Record<keyof typeof PAINTED_FOX_ASSETS, CanvasImageSource>;
type Point = [number, number];
const bounded = (v: number, min = 0, max = 1) => Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : 0;
const smooth = (v: number) => { v = bounded(v); return v * v * (3 - 2 * v); };
/** Retarget model coefficients to the painted lid travel, without inventing blinks.
 * ARKit/manual/demo keep their direct [0,1] control; only MediaPipe needs gain.
 */
export const paintedBlinkAmount = (score: number, source: FaceFrame["source"]) => source === "mediapipe"
  ? smooth((bounded(score) - .06) / .74) : bounded(score);
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const mouthCurve: Point[] = [[220,280],[230,282],[240,286],[253,286],[266,283],[276,281],[286,284],[295,286],[305,281],[315,280]];
function curve(points: Point[], x: number) {
  for (let i = 1; i < points.length; i++) if (x <= points[i][0]) {
    const a = points[i - 1], b = points[i], t = bounded((x - a[0]) / (b[0] - a[0]));
    return mix(a[1], b[1], smooth(t));
  }
  return points[points.length - 1][1];
}
function sample(array: Float32Array, w: number, h: number, x: number, y: number, ch: number, stride = 4) {
  if (x < 0 || x > w - 1 || y < 0 || y > h - 1) return 0;
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const nx=Math.min(ix+1,w-1),ny=Math.min(iy+1,h-1);
  return mix(mix(array[(iy*w+ix)*stride+ch],array[(iy*w+nx)*stride+ch],fx),mix(array[(ny*w+ix)*stride+ch],array[(ny*w+nx)*stride+ch],fx),fy);
}

/** One painted portrait with internal facial layers; no independent body pieces. */
export function createPaintedFoxPainter(images: PaintedFoxImages, surface: FoxSurfaceFactory) {
  const texture = surface(512, 512), ctx = texture.context;
  const pixels = (image: CanvasImageSource) => { ctx.clearRect(0, 0, 512, 512); ctx.drawImage(image, 0, 0, 512, 512); return ctx.getImageData(0, 0, 512, 512); };
  const source = pixels(images.base), oral = pixels(images.mouth), browClean = pixels(images.brows);
  const eyes = preparePaintedEyes(surface, images.base, images.clean);
  const mouthRect = { x: 210, y: 263, w: 120, h: 65 };
  const { x: mx, y: my, w: mw, h: mh } = mouthRect;
  const mouthBase = new Float32Array(mw * mh * 3), upper = new Float32Array(mw * mh * 4), lower = new Float32Array(mw * mh * 4), interior = new Float32Array(512 * 512 * 4);
  const mouthOutput = ctx.createImageData(mw, mh);
  for (let x = 0; x < mw; x++) for (let y = 0; y < mh; y++) {
    const px = mx + x, py = my + y, k = y * mw + x, i = (py * 512 + px) * 4;
    const matte = smooth((px - 218) / 6) * smooth((315 - px) / 6) * smooth((10 - Math.abs(py - curve(mouthCurve, px))) / 3);
    const u = bounded(.5 + (curve(mouthCurve, px) - py) / 2);
    upper[k * 4 + 3] = matte * u; lower[k * 4 + 3] = matte * (1 - u);
    for (let c = 0; c < 3; c++) {
      const d = source.data[i + c] - browClean.data[i + c];
      mouthBase[k * 3 + c] = source.data[i + c] - d * matte;
      upper[k * 4 + c] = d * matte * u; lower[k * 4 + c] = d * matte * (1 - u);
    }
  }
  const roof = new Float32Array(512).fill(281), floor = new Float32Array(512).fill(281);
  for (let x = 240; x <= 305; x++) {
    let top = 512, bottom = 0;
    for (let y = 274; y <= 308; y++) if (oral.data[(y * 512 + x) * 4 + 3] > 80) { top = Math.min(top, y); bottom = Math.max(bottom, y); }
    if (bottom > top) { roof[x] = top; floor[x] = bottom; }
  }
  for (let i = 0; i < 512 * 512; i++) {
    const a = oral.data[i * 4 + 3] / 255;
    for (let c = 0; c < 3; c++) interior[i * 4 + c] = oral.data[i * 4 + c] * a;
    interior[i * 4 + 3] = a;
  }
  const brows = [
    { rect: [145,137,90,45], points: [[151,165],[170,154],[190,155],[211,161],[226,170]] },
    { rect: [300,138,80,45], points: [[307,166],[325,155],[346,156],[370,167]] },
  ].map(({ rect, points }) => {
    const [x,y,w,h] = rect, base = new Float32Array(w*h*3), residual = new Float32Array(w*h*4), output = ctx.createImageData(w,h);
    for(let xx=0;xx<w;xx++)for(let yy=0;yy<h;yy++) {
      const i=((y+yy)*512+x+xx)*4,k=yy*w+xx;
      const matte=smooth((xx-3)/6)*smooth((w-3-xx)/6)*smooth((6-Math.abs(y+yy-curve(points as Point[],x+xx)))/3);
      residual[k*4+3]=matte;
      for(let c=0;c<3;c++){const d=source.data[i+c]-browClean.data[i+c];base[k*3+c]=source.data[i+c]-d*matte;residual[k*4+c]=d*matte;}
    }
    return { x,y,w,h,base,residual,output };
  });
  function paintMouth(open: number, round: number, smile: number) {
    if (open === 0 && round === 0 && smile === 0) return;
    const scaleX = (1 - .32 * open) * (1 - .45 * round) * (1 + .18 * smile);
    const center = mix(266,272,open);
    for (let x = 0; x < mw; x++) {
      const px = mx + x, sx = 266 + (px - center) / scaleX, cy = curve(mouthCurve, sx), ox = 272 + (px - center) / (1.5 * scaleX);
      const ix = Math.max(0, Math.min(510, Math.floor(ox))), fraction = bounded(ox-ix), top = mix(roof[ix],roof[ix+1],fraction), bottom = mix(floor[ix],floor[ix+1],fraction);
      const lift = -smile * 3 * Math.min(1, ((sx - 266) / 38) ** 2);
      const uy = mix(cy, top, open) + lift, ly = mix(cy, bottom, open) + lift;
      for (let y = 0; y < mh; y++) {
        const py = my + y, k = y * mw + x, syU = py - uy + cy - my, syL = py - ly + cy - my;
        const uw = sample(upper,mw,mh,sx-mx,syU,3), lw = sample(lower,mw,mh,sx-mx,syL,3), norm = Math.max(1, uw + lw);
        const oy = open > 0 ? cy + (py - cy - lift) / open : -100;
        const alpha = sample(interior,512,512,ox,oy,3);
        const coverage = Math.min(1,open*Math.max(0,bottom-top));
        // Interior coverage tends to zero with opening area, rather than popping on.
        const inside = smooth((py-uy)/1.6)*smooth((ly-py)/1.6)*coverage;
        for (let c = 0; c < 3; c++) {
          const skin = mouthBase[k*3+c], pigment = sample(interior,512,512,ox,oy,c);
          mouthOutput.data[k*4+c] = Math.round(skin*(1-alpha*inside)+pigment*inside+(sample(upper,mw,mh,sx-mx,syU,c)+sample(lower,mw,mh,sx-mx,syL,c))/norm);
        }
        mouthOutput.data[k*4+3]=255;
      }
    }
    ctx.putImageData(mouthOutput,mx,my);
  }
  function paintBrows(lifts: number[]) {
    brows.forEach((b,index)=>{
      const lift=lifts[index]*5;if(lift===0)return;
      for(let x=0;x<b.w;x++)for(let y=0;y<b.h;y++) {
        const k=y*b.w+x;
        for(let c=0;c<3;c++)b.output.data[k*4+c]=Math.round(b.base[k*3+c]+sample(b.residual,b.w,b.h,x,y+lift,c));
        b.output.data[k*4+3]=255;
      }
      ctx.putImageData(b.output,b.x,b.y);
    });
  }
  const cols=14,rows=14,vertices:Point[]=[],triangles:Array<[number,number,number]>=[];
  for(let y=0;y<=rows;y++)for(let x=0;x<=cols;x++)vertices.push([x*512/cols,y*512/rows]);
  for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){const a=y*(cols+1)+x,b=a+1,c=a+cols+1;triangles.push([a,b,c],[b,c+1,c]);}
  function headPoint([x,y]:Point,pitch:number,yaw:number,roll:number):Point {
    const weight=(1-smooth((y-300)/75))*smooth(x/30)*smooth((512-x)/30)*smooth(y/28),dx=x-277,dy=y-305;
    // Shallow portrait parallax; it does not invent a hidden side of the face.
    const depth=Math.exp(-((dx/150)**2+((y-215)/175)**2));
    return [x+((Math.cos(roll)-1)*dx-Math.sin(roll)*dy+yaw*(10+18*depth))*weight,
      y+(Math.sin(roll)*dx+(Math.cos(roll)-1)*dy+pitch*(8+14*depth))*weight];
  }
  const deformed=surface(512,512),headOutput=ctx.createImageData(512,512);
  function deformHead(pitch:number,yaw:number,roll:number) {
    const input=ctx.getImageData(0,0,512,512).data,out=headOutput.data;out.set(input);
    const points=vertices.map(p=>headPoint(p,pitch,yaw,roll));
    for(const [ia,ib,ic]of triangles) {
      const a=vertices[ia],b=vertices[ib],c=vertices[ic],p=points[ia],q=points[ib],r=points[ic];
      if(a[0]===p[0]&&a[1]===p[1]&&b[0]===q[0]&&b[1]===q[1]&&c[0]===r[0]&&c[1]===r[1])continue;
      const det=(q[0]-p[0])*(r[1]-p[1])-(r[0]-p[0])*(q[1]-p[1]);
      if(det<=0)throw new Error('painted_head_fold');
      const minX=Math.max(0,Math.floor(Math.min(p[0],q[0],r[0]))),maxX=Math.min(511,Math.ceil(Math.max(p[0],q[0],r[0])));
      const minY=Math.max(0,Math.floor(Math.min(p[1],q[1],r[1]))),maxY=Math.min(511,Math.ceil(Math.max(p[1],q[1],r[1])));
      for(let y=minY;y<=maxY;y++)for(let x=minX;x<=maxX;x++) {
        const dx=x+.5-p[0],dy=y+.5-p[1];
        const wb=(dx*(r[1]-p[1])-dy*(r[0]-p[0]))/det,wc=((q[0]-p[0])*dy-(q[1]-p[1])*dx)/det;
        if(wb < -1e-7 || wc < -1e-7 || wb+wc > 1.0000001)continue;
        const sx=bounded(a[0]+wb*(b[0]-a[0])+wc*(c[0]-a[0])-.5,0,511),sy=bounded(a[1]+wb*(b[1]-a[1])+wc*(c[1]-a[1])-.5,0,511);
        const ix=Math.floor(sx),iy=Math.floor(sy),fx=sx-ix,fy=sy-iy,nx=Math.min(ix+1,511),ny=Math.min(iy+1,511),dest=(y*512+x)*4;
        for(let ch=0;ch<4;ch++)out[dest+ch]=Math.round(mix(mix(input[(iy*512+ix)*4+ch],input[(iy*512+nx)*4+ch],fx),mix(input[(ny*512+ix)*4+ch],input[(ny*512+nx)*4+ch],fx),fy));
      }
    }
    deformed.context.putImageData(headOutput,0,0);return deformed.canvas;
  }
  return {
    draw(target: CanvasRenderingContext2D,width:number,height:number,frame:FaceFrame,options:{timeMs?:number;idleMotion?:boolean;backdrop?:boolean}={}) {
      const c=(key:Parameters<typeof faceChannel>[1])=>bounded(faceChannel(frame,key));
      const t=(options.timeMs??0)/1000,phase=(t+.8)%4.7;
      const auto=options.idleMotion&&phase>3.9&&phase<4.17?Math.sin((phase-3.9)/.27*Math.PI)**2:0;
      const left=Math.max(paintedBlinkAmount(c('eyeBlinkLeft'),frame.source),auto),right=Math.max(paintedBlinkAmount(c('eyeBlinkRight'),frame.source),auto),round=Math.max(c('mouthPucker'),c('mouthFunnel'));
      const open=Math.max(c('jawOpen'),round*.85)*(1-c('mouthClose')),smile=(c('mouthSmileLeft')+c('mouthSmileRight'))/2;
      ctx.clearRect(0,0,512,512);ctx.drawImage(images.base,0,0,512,512);paintEyes(ctx,eyes,{left,right});paintMouth(open,round,smile);
      paintBrows([bounded(c('browInnerUp')+c('browOuterUpLeft')-c('browDownLeft'),-1,1),bounded(c('browInnerUp')+c('browOuterUpRight')-c('browDownRight'),-1,1)]);
      const pitch=bounded(frame.rotation[0],-.35,.35),yaw=bounded(-frame.rotation[1],-.45,.45),roll=bounded(-frame.rotation[2],-.10,.10);
      target.clearRect(0,0,width,height);const scale=Math.min(width/536,height/536),ox=(width-512*scale)/2,oy=(height-512*scale)/2;
      target.save();target.translate(ox,oy);target.scale(scale,scale);
      if(options.backdrop){target.fillStyle='#f4f1e6';target.fillRect(0,0,512,512);}
      target.drawImage(pitch===0&&yaw===0&&roll===0?texture.canvas:deformHead(pitch,yaw,roll),0,0);
      target.restore();
    },
  };
}
