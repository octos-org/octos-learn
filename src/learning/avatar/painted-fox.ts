import { faceChannel, type FaceFrame } from "./face-frame";
import type { FoxSurfaceFactory } from "./original-fox";
import { paintEyes, preparePaintedEyes, type EyeProfile } from "./painted-eyes";
import {createPaintedSecondaryMotion,paintedIdlePose,paintedSecondaryPoint,FOX_MOTION,HEAD_SHIFT,type PaintedMotionProfile,type PaintedSecondaryPose} from './painted-secondary-motion';
import { createLocalRigPainter, starFoxFollowingPose,starFoxNaturalPose,type LocalRigImages, type LocalRigPose } from './painted-local-rig';
import {createEarInertia,type EarInertiaProfile} from './ear-inertia';
import {paintedLipControls,paintedBrowControls,type PaintedLipPose} from './painted-expressions';

const root = "teach-avatars/star-fox/painted-v0.2/";
export const PAINTED_FOX_ASSETS = { base: `${root}source.png`, clean: `${root}clean.png`, mouth: `${root}mouth.png`, brows: `${root}brows-clean.png`, extended: 'teach-avatars/star-fox/painted-v0.3/portrait-extended.png' } as const;
/** The fitted face keeps its original coordinates inside the completed portrait. */
export const PAINTED_FOX_VIEW = { size:704, x:96, y:192, frame:736 } as const;
export type PaintedFoxImages = Record<keyof typeof PAINTED_FOX_ASSETS, CanvasImageSource>;
type Point = [number, number];
export interface PaintedFaceRig {
  earInertia?:EarInertiaProfile;
  browStyle?:{color:[number,number,number];width:number};
  motion?:PaintedMotionProfile;
  eyes?:readonly[EyeProfile,EyeProfile];
  mouth?:{curve:Point[];rect:{x:number;y:number;w:number;h:number};center:number};
  brows?:Array<{rect:[number,number,number,number];points:Point[]}>;
}
const bounded = (v: number, min = 0, max = 1) => Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : 0;
const smooth = (v: number) => { v = bounded(v); return v * v * (3 - 2 * v); };
/** Retarget model coefficients to the painted lid travel, without inventing blinks.
 * ARKit/manual/demo keep their direct [0,1] control; only MediaPipe needs gain.
 */
export const paintedBlinkAmount = (score: number, source: FaceFrame["source"]) => source === "mediapipe"
  ? smooth((bounded(score) - .06) / .74) : bounded(score);
/** A detector coefficient is not a fraction of the character's mouth travel. */
export const paintedJawAmount = (score: number, source: FaceFrame["source"]) =>
  bounded(score * (source === "mediapipe" ? 1.6 : 1));
/** Legacy three-control projection retained for old authoring callers.
 * The live painter uses paintedLipControls for detailed lip channels. */
export function paintedMouthControls(frame:FaceFrame,enhanced=false){
  const c=(key:Parameters<typeof faceChannel>[1])=>bounded(faceChannel(frame,key));
  const round=Math.max(c('mouthPucker'),c('mouthFunnel')),jaw=paintedJawAmount(c('jawOpen'),frame.source);
  return{round,open:(enhanced?jaw:Math.max(jaw,round*.85))*(1-c('mouthClose')),wide:enhanced?Math.max(c('mouthStretchLeft'),c('mouthStretchRight')):0};
}
/** Gaze is in portrait/screen coordinates; positive X is right, positive Y down.
 * Squint/cheek channels raise the lids without turning every smile into a blink.
 */
export function paintedEyeControls(frame: FaceFrame) {
  const c=(key:Parameters<typeof faceChannel>[1])=>bounded(faceChannel(frame,key));
  const gain=frame.source==='mediapipe'?1.5:1;
  return {
    left:paintedBlinkAmount(c('eyeBlinkLeft'),frame.source),
    right:paintedBlinkAmount(c('eyeBlinkRight'),frame.source),
    leftSquint:Math.max(c('eyeSquintLeft'),c('cheekSquintLeft')),
    rightSquint:Math.max(c('eyeSquintRight'),c('cheekSquintRight')),
    leftTension:bounded(c('browDownLeft')*(frame.source==='mediapipe'?1.6:1)),
    rightTension:bounded(c('browDownRight')*(frame.source==='mediapipe'?1.6:1)),
    leftGaze:[bounded(gain*(c('eyeLookInLeft')-c('eyeLookOutLeft')),-1,1),bounded(gain*(c('eyeLookDownLeft')-c('eyeLookUpLeft')),-1,1)]as const,
    rightGaze:[bounded(gain*(c('eyeLookOutRight')-c('eyeLookInRight')),-1,1),bounded(gain*(c('eyeLookDownRight')-c('eyeLookUpRight')),-1,1)]as const,
  };
}
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
/** Rigid head, including hair/ears at the crop edges. Only the neck attaches.
 * Yaw/pitch give restrained head following, not a fabricated side view.
 */
export function paintedHeadPoint([x,y]: Point, pitch:number, yaw:number, roll:number):Point {
  const weight=1-smooth((y-340)/60);
  const dx=x-256,dy=y-337;
  const angle=bounded(roll,-.1,.1);
  // The middle of the face (nearest the viewer) travels a little further than
  // the outline, which reads as the head turning rather than sliding.
  const centre=1-smooth(Math.hypot(x-256,(y-235)*1.15)/230);
  return [x+((Math.cos(angle)-1)*dx-Math.sin(angle)*dy+bounded(yaw,-.45,.45)*(HEAD_SHIFT.yaw+9*centre))*weight,
    y+(Math.sin(angle)*dx+(Math.cos(angle)-1)*dy+bounded(pitch,-.35,.35)*(HEAD_SHIFT.pitch+6*centre))*weight];
}
export function paintedMotionPoint(point:Point,pitch:number,yaw:number,roll:number,pose?:PaintedSecondaryPose,profile:PaintedMotionProfile=FOX_MOTION):Point {
  const secondary=pose??createPaintedSecondaryMotion().sample(pitch,yaw,roll);
  return paintedHeadPoint(paintedSecondaryPoint(point,secondary,profile),pitch,yaw,roll);
}
const mouthCurve: Point[] = [[224,272],[235,276],[247,277],[260,274],[272,277],[284,276],[296,272]];
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
/** Bicubic sampling preserves the small mouth texture's painted contours when
 * enlarged. Interpolate premultiplied channels, then constrain the alpha below.
 */
function sampleOral(array:Float32Array,x:number,y:number,ch:number) {
  if(x<1||x>510||y<1||y>510)return 0;
  const ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy;
  const cubic=(a:number,b:number,c:number,d:number,t:number)=>b+.5*t*(c-a+t*(2*a-5*b+4*c-d+t*(3*(b-c)+d-a)));
  const rows=[-1,0,1,2].map(dy=>{
    const i=((iy+dy)*512+ix)*4+ch;
    return cubic(array[i-4],array[i],array[i+4],array[i+8],fx);
  });
  return bounded(cubic(rows[0],rows[1],rows[2],rows[3],fy),0,ch===3?1:255);
}

/** One painted portrait with internal facial layers; no independent body pieces. */
export function createPaintedFoxPainter(images: PaintedFoxImages, surface: FoxSurfaceFactory,rig:PaintedFaceRig={},localImages?:LocalRigImages) {
  const localPainter=localImages?createLocalRigPainter(localImages,surface):null;
  const texture = surface(512, 512), ctx = texture.context;
  const pixels = (image: CanvasImageSource) => { ctx.clearRect(0, 0, 512, 512); ctx.drawImage(image, 0, 0, 512, 512); return ctx.getImageData(0, 0, 512, 512); };
  const source = pixels(images.base), oral = pixels(images.mouth), browClean = pixels(images.brows);
  const highOral=localImages?pixels(localImages.oral):null;
  const eyes = preparePaintedEyes(surface, images.base, images.clean,rig.eyes);
  const lipCurve=rig.mouth?.curve??mouthCurve,center=rig.mouth?.center??260;
  const mouthRect = rig.mouth?.rect??{ x: 210, y: 254, w: 104, h: 80 };
  const {x:rawX,y:rawY,w:rawW,h:rawH}=mouthRect;
  const mx=rawX-14,my=rawY-16,mw=rawW+28,mh=rawH+32;
  const mouthBase = new Float32Array(mw * mh * 3), upper = new Float32Array(mw * mh * 4), lower = new Float32Array(mw * mh * 4), interior = new Float32Array(512 * 512 * 4);
  const mouthOutput = ctx.createImageData(mw, mh);
  for (let x = 0; x < mw; x++) for (let y = 0; y < mh; y++) {
    const px = mx + x, py = my + y, k = y * mw + x, i = (py * 512 + px) * 4;
    const matte = smooth((px - (rig.mouth?lipCurve[0][0]-2:222)) / 5) * smooth(((rig.mouth?lipCurve[lipCurve.length-1][0]+2:298) - px) / 5) * smooth((10 - Math.abs(py - curve(lipCurve, px))) / 3);
    const u = bounded(.5 + (curve(lipCurve, px) - py) / 2);
    upper[k * 4 + 3] = matte * u; lower[k * 4 + 3] = matte * (1 - u);
    for (let c = 0; c < 3; c++) {
      const d = source.data[i + c] - browClean.data[i + c];
      mouthBase[k * 3 + c] = source.data[i + c] - d * matte;
      upper[k * 4 + c] = d * matte * u; lower[k * 4 + c] = d * matte * (1 - u);
    }
  }
  // Rows of the oral texture per column, smoothed: they only choose which
  // texels fill the opening, never the shape of the lips.
  const roofRaw = new Float32Array(512).fill(281), floorRaw = new Float32Array(512).fill(281);
  for (let x = 240; x <= 305; x++) {
    let top = 512, bottom = 0;
    for (let y = 274; y <= 308; y++) if (oral.data[(y * 512 + x) * 4 + 3] > 80) { top = Math.min(top, y); bottom = Math.max(bottom, y); }
    if (bottom > top) { roofRaw[x] = top; floorRaw[x] = bottom; }
  }
  const roof = new Float32Array(512), floor = new Float32Array(512);
  for (let x = 0; x < 512; x++) {
    let a = 0, b = 0, n = 0;
    for (let k = -6; k <= 6; k++) { const i = Math.max(244, Math.min(301, x + k)); a += roofRaw[i]!; b += floorRaw[i]!; n++; }
    // Stay a little inside the painted interior so its soft rim never shows as a ragged edge.
    roof[x] = a / n + 1.5; floor[x] = b / n - 1.5;
  }
  for (let i = 0; i < 512 * 512; i++) {
    const a = oral.data[i * 4 + 3] / 255;
    for (let c = 0; c < 3; c++) interior[i * 4 + c] = oral.data[i * 4 + c] * a;
    interior[i * 4 + 3] = a;
  }
  // The painted lip line's own colour, for the drawn lower lip edge.
  const lineColor = [0, 0, 0];
  {
    let darkest = Infinity;
    for (let x = lipCurve[1]![0]; x <= lipCurve[lipCurve.length - 2]![0]; x++) for (let dy = -3; dy <= 3; dy++) {
      const y = Math.round(curve(lipCurve, x)) + dy, i = (y * 512 + x) * 4;
      const value = source.data[i]! + source.data[i + 1]! + source.data[i + 2]!;
      if (value < darkest) { darkest = value; lineColor[0] = source.data[i]!; lineColor[1] = source.data[i + 1]!; lineColor[2] = source.data[i + 2]!; }
    }
  }
  const lipLeft = lipCurve[0]![0], lipRight = lipCurve[lipCurve.length - 1]![0];
  // A smooth lower boundary under the whole painted line: the painted "ω" upper
  // lip stays, the dropped jaw shows a single clean arc rather than a copy of it.
  let hullDepth = 0;
  for (let x = lipLeft + 1; x < lipRight; x++) {
    const u = (2 * x - lipLeft - lipRight) / (lipRight - lipLeft), chord = mix(curve(lipCurve, lipLeft), curve(lipCurve, lipRight), (u + 1) / 2);
    hullDepth = Math.max(hullDepth, (curve(lipCurve, x) - chord) / (1 - u * u));
  }
  const brows = (rig.brows??[
    { rect: [145,136,100,48], points: [[154,160],[173,153],[192,151],[212,154],[234,162]] },
    { rect: [277,136,103,48], points: [[285,161],[306,154],[326,151],[348,153],[370,160]] },
  ]).map(({ rect, points }) => {
    const [rx,ry,rw,rh] = rect,x=rx-10,y=ry-20,w=rw+20,h=rh+50;
    const base = new Float32Array(w*h*3),output = ctx.createImageData(w,h);
    for(let xx=0;xx<w;xx++)for(let yy=0;yy<h;yy++) {
      const i=((y+yy)*512+x+xx)*4,k=yy*w+xx;
      const matte=smooth((xx-3)/6)*smooth((w-3-xx)/6)*smooth((11-Math.abs(y+yy-curve(points as Point[],x+xx)))/2);
      for(let c=0;c<3;c++){const d=source.data[i+c]-browClean.data[i+c];base[k*3+c]=source.data[i+c]-d*matte;}
    }
    return { x,y,w,h,base,output,points:points as Point[] };
  });
  function paintMouth(p:PaintedLipPose) {
    if(Object.values(p).every(n=>n===0))return;
    const {open,pucker:round,leftSmile,rightSmile}=p,wide=(p.stretchLeft+p.stretchRight)/2;
    const smile=(leftSmile+rightSmile)/2;
    const scaleX = (1 - .08 * open) * (1 - .45 * round)*(1-.25*p.funnel) * (1 + .18 * smile+.22*wide);
    const depth = 46 * open*(1-.28*wide), settle = smooth(Math.max(open,p.funnel*.1*(1-p.close),p.upperLeft*.12,p.upperRight*.12,p.lowerLeft*.12,p.lowerRight*.12) / .18), halfWidth = (lipRight - lipLeft) / 2 * scaleX;
    for (let x = 0; x < mw; x++) {
      const px = mx + x,side=bounded(.5+(px-center)/70),stretch=mix(p.stretchLeft,p.stretchRight,side),sideScale=scaleX*(1+.16*(stretch-wide));
      const shifted=center+p.shift*7+p.jawShift*2,sx = center + (px - shifted) / sideScale, cy = curve(lipCurve, sx);
      const u = (px + .5 - shifted) / (halfWidth*sideScale/scaleX), inside = Math.abs(u) < 1;
      // Rounded at the corners, fullest in the middle; zero outside the lips.
      const profile = inside ? Math.pow(1 - u * u, .7) : 0;
      const corner = mix(leftSmile, rightSmile, bounded(.5 + (sx - center) / 64));
      const lift = -corner * 12 * Math.min(1, ((sx - center) / 32) ** 2);
      const chord = mix(curve(lipCurve, lipLeft), curve(lipCurve, lipRight), bounded((sx - lipLeft) / (lipRight - lipLeft)));
      const arc = chord + hullDepth * (inside ? 1 - u * u : 0);
      // Upper lip: the painted line, raised a little. Lower lip: blends from the
      // painted line (closed) into one smooth arc as soon as the mouth opens.
      const press=mix(p.pressLeft,p.pressRight,side),upperRaise=mix(p.upperLeft,p.upperRight,side),lowerDrop=mix(p.lowerLeft,p.lowerRight,side);
      const flatten=bounded(press*.85+p.rollUpper*.45+p.rollLower*.45);
      const closedY=mix(cy,chord,flatten)+lift+(p.shrugUpper*2-p.shrugLower*3+round*2+p.rollUpper*.8-p.rollLower*1.8)*profile;
      const funnelGap=5*p.funnel*(1-p.close)*profile;
      const upperY = closedY - .14 * depth * profile-upperRaise*9*profile-funnelGap*.35;
      const lowerY = Math.min(332,mix(closedY, Math.max(closedY, arc+lift), settle) + .86 * depth * (inside ? Math.pow(1 - u * u, 1.05) : 0)+lowerDrop*12*profile+funnelGap*.65);
      const ox = Math.max(244, Math.min(300, 272 + (px - center) / (1.5 * scaleX))), ix = Math.floor(ox), fraction = ox - ix;
      const top = mix(roof[ix]!, roof[ix + 1]!, fraction), bottom = mix(floor[ix]!, floor[ix + 1]!, fraction);
      const edge = inside ? settle * Math.sqrt(profile) * .8 : 0;
      for (let y = 0; y < mh; y++) {
        const py = my + y, k = y * mw + x, centreY = py + .5;
        // The painted line moves with the upper lip (both its halves together).
        const syU = py - (upperY - cy) - my;
        const uw = sample(upper,mw,mh,sx-mx,syU,3) + sample(lower,mw,mh,sx-mx,syU,3), norm = Math.max(1, uw);
        // Analytic per-pixel coverage of the opening: smooth, anti-aliased edges.
        const opening = lowerY > upperY ? bounded(Math.min(lowerY, py + 1) - Math.max(upperY, py)) : 0;
        const v = lowerY > upperY ? bounded((centreY - upperY) / (lowerY - upperY)) : 0;
        const oy = top + v * (bottom - top);
        const alpha = opening > 0 ? sampleOral(interior, ox, oy, 3) : 0;
        const rim = edge * Math.exp(-(((centreY - lowerY) / .9) ** 2));
        for (let c = 0; c < 3; c++) {
          const skin = mouthBase[k*3+c]!;
          // Unpremultiplied interior colour, darkened where the texture is thin.
          let mouth = alpha > .02 ? sampleOral(interior, ox, oy, c) / alpha * Math.min(1, alpha + .35) + (1 - Math.min(1, alpha + .35)) * 70 : 70;
          if(highOral&&opening>0){
            // Use the whole 512px cavity texture, not the old 56x34px patch.
            const hx=bounded((u+1)/2,.02,.98)*511,hy=bounded(v,.03,.97)*511,ix=Math.floor(hx),iy=Math.floor(hy),fx=hx-ix,fy=hy-iy;
            const hd=highOral.data;mouth=mix(mix(hd[(iy*512+ix)*4+c],hd[(iy*512+ix+1)*4+c],fx),mix(hd[((iy+1)*512+ix)*4+c],hd[((iy+1)*512+ix+1)*4+c],fx),fy);
          }
          let value = skin * (1 - opening) + mouth * opening;
          value = value * (1 - rim) + lineColor[c]! * rim;
          mouthOutput.data[k*4+c] = Math.round(bounded(value + (sample(upper,mw,mh,sx-mx,syU,c)*(1-.55*p.rollUpper) + sample(lower,mw,mh,sx-mx,syU,c)*(1-.55*p.rollLower)) / norm * (1 - opening), 0, 255));
        }
        mouthOutput.data[k*4+3]=255;
      }
    }
    ctx.putImageData(mouthOutput,mx,my);
  }
  function paintBrows(states: Array<{inner:number;outer:number;down:number}>) {
    brows.forEach((b,index)=>{
      const state=states[index],style=rig.browStyle??{color:[117,62,34],width:2.5};
      const current=ctx.getImageData(b.x,b.y,b.w,b.h).data;
      for(let x=0;x<b.w;x++) {
        const px=b.x+x,start=b.points[0][0],end=b.points.at(-1)![0];
        const approximate=bounded((px-start)/(end-start)),inner0=index===0?approximate:1-approximate;
        const sx=px-(index===0?1:-1)*state.down*4*inner0,t=bounded((sx-start)/(end-start)),inner=index===0?t:1-t;
        const cy=curve(b.points,sx)+10-state.inner*15*inner-state.outer*17*(1-inner)+state.down*(2+17*inner-3*Math.sin(t*Math.PI));
        const taper=smooth((sx-start)/9)*smooth((end-sx)/9);
        const half=style.width*(.55+.45*Math.sin(t*Math.PI))*(1+.25*state.down);
        for(let y=0;y<b.h;y++) {
        const py=b.y+y;
        const coverage=bounded(half+.6-Math.abs(py+.5-cy))*taper;
        const k=y*b.w+x,original=((b.y+y)*512+b.x+x)*4;
        // Anime-style partial visibility through bangs keeps brow motion
        // readable. Full opacity on exposed light fur; softer over dark hair.
        const fur=smooth((browClean.data[original+2]-105)/70)*smooth((browClean.data[original+1]-140)/65);
        const alpha=coverage*(.4+.48*fur),grain=coverage>0?1+.035*Math.sin(px*2.13+py*1.17):1;
        // The brow and upper-lid rectangles overlap. Apply only the brow delta,
        // otherwise the old eye pixels silently overwrite the frowning eyelid.
        for(let c=0;c<3;c++){
          const skin=current[k*4+c]+b.base[k*3+c]-source.data[original+c];
          b.output.data[k*4+c]=Math.round(bounded(skin*(1-alpha)+style.color[c]*grain*alpha,0,255));
        }
        b.output.data[k*4+3]=255;
        }
      }
      ctx.putImageData(b.output,b.x,b.y);
    });
  }
  const {size,x:padX,y:padY}=PAINTED_FOX_VIEW;
  const secondaryMotion=createPaintedSecondaryMotion(),earInertia=createEarInertia(rig.earInertia),motionProfile=rig.motion??FOX_MOTION;
  const portrait=surface(size,size),portraitCtx=portrait.context;
  portraitCtx.drawImage(images.extended,0,0,size,size);
  const portraitSource=portraitCtx.getImageData(0,0,size,size);
  const cols=22,rows=22,vertices:Point[]=[],triangles:Array<[number,number,number]>=[];
  for(let y=0;y<=rows;y++)for(let x=0;x<=cols;x++)vertices.push([x*size/cols,y*size/rows]);
  for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){const a=y*(cols+1)+x,b=a+1,c=a+cols+1;triangles.push([a,b,c],[b,c+1,c]);}
  const deformed=surface(size,size),headOutput=ctx.createImageData(size,size);
  // A moving crop may uncover background at the top/sides. Clear it instead of
  // stretching the boundary vertices or retaining a second, stationary ear.
  const headBackground=new Uint8ClampedArray(portraitSource.data);
  const paper=source.data.slice((350*512+10)*4,(350*512+10)*4+4);
  for(let i=0;i<(340+padY)*size*4;i+=4)headBackground.set(paper,i);
  function deformHead(pitch:number,yaw:number,roll:number,pose:PaintedSecondaryPose) {
    const input=portraitCtx.getImageData(0,0,size,size).data,out=headOutput.data;out.set(headBackground);
    const points=vertices.map(([x,y])=>{const p=localPainter?paintedHeadPoint([x-padX,y-padY],pitch,yaw,roll):paintedMotionPoint([x-padX,y-padY],pitch,yaw,roll,pose,motionProfile);return[p[0]+padX,p[1]+padY]as Point;});
    for(const [ia,ib,ic]of triangles) {
      const a=vertices[ia],b=vertices[ib],c=vertices[ic],p=points[ia],q=points[ib],r=points[ic];
      // Idle twitches leave most of the head stationary. Those triangles still
      // restore the face onto the cleared backdrop; skipping them erases it.
      const det=(q[0]-p[0])*(r[1]-p[1])-(r[0]-p[0])*(q[1]-p[1]);
      if(det<=0)throw new Error('painted_head_fold');
      const minX=Math.max(0,Math.floor(Math.min(p[0],q[0],r[0]))),maxX=Math.min(size-1,Math.ceil(Math.max(p[0],q[0],r[0])));
      const minY=Math.max(0,Math.floor(Math.min(p[1],q[1],r[1]))),maxY=Math.min(size-1,Math.ceil(Math.max(p[1],q[1],r[1])));
      for(let y=minY;y<=maxY;y++)for(let x=minX;x<=maxX;x++) {
        const dx=x+.5-p[0],dy=y+.5-p[1];
        const wb=(dx*(r[1]-p[1])-dy*(r[0]-p[0]))/det,wc=((q[0]-p[0])*dy-(q[1]-p[1])*dx)/det;
        if(wb < -1e-7 || wc < -1e-7 || wb+wc > 1.0000001)continue;
        const sx=bounded(a[0]+wb*(b[0]-a[0])+wc*(c[0]-a[0])-.5,0,size-1),sy=bounded(a[1]+wb*(b[1]-a[1])+wc*(c[1]-a[1])-.5,0,size-1);
        const ix=Math.floor(sx),iy=Math.floor(sy),fx=sx-ix,fy=sy-iy,nx=Math.min(ix+1,size-1),ny=Math.min(iy+1,size-1),dest=(y*size+x)*4;
        for(let ch=0;ch<4;ch++)out[dest+ch]=Math.round(mix(mix(input[(iy*size+ix)*4+ch],input[(iy*size+nx)*4+ch],fx),mix(input[(ny*size+ix)*4+ch],input[(ny*size+nx)*4+ch],fx),fy));
      }
    }
    deformed.context.putImageData(headOutput,0,0);return deformed.canvas;
  }
  return {
    draw(target: CanvasRenderingContext2D,width:number,height:number,frame:FaceFrame,options:{timeMs?:number;idleMotion?:boolean;backdrop?:boolean;localPose?:LocalRigPose}={}):{settling:boolean} {
      const t=(options.timeMs??0)/1000,phase=(t+.8)%4.7;
      const auto=options.idleMotion&&!frame.tracked&&phase>3.9&&phase<4.17?Math.sin((phase-3.9)/.27*Math.PI)**2:0;
      const eyeState=paintedEyeControls(frame),mouth=paintedLipControls(frame);
      ctx.clearRect(0,0,512,512);ctx.drawImage(images.base,0,0,512,512);
      paintEyes(ctx,eyes,{...eyeState,left:Math.max(eyeState.left,auto),right:Math.max(eyeState.right,auto)});
      paintMouth(mouth);
      paintBrows(paintedBrowControls(frame));
      portraitCtx.clearRect(0,0,size,size);portraitCtx.drawImage(localImages?.base??images.extended,0,0,size,size);
      // Only facial pixels change. The original fitted face is preserved exactly
      // inside the outpainted portrait, so this patch has no visible boundary.
      portraitCtx.drawImage(localPainter?images.base:texture.canvas,128,128,272,210,padX+128,padY+128,272,210);
      const pitch=bounded(frame.rotation[0],-.35,.35),yaw=bounded(-frame.rotation[1],-.45,.45),roll=bounded(-frame.rotation[2],-.10,.10);
      // Ears and hair follow on the render clock: camera frames arrive at about
      // 20 Hz with repeated timestamps, which would step the follow-through.
      const secondary=secondaryMotion.sample(pitch,yaw,roll,options.timeMs);
      if(options.idleMotion&&!localPainter){
        const idle=paintedIdlePose(options.timeMs??0,motionProfile);
        for(const key of Object.keys(secondary)as Array<keyof PaintedSecondaryPose>)secondary[key]+=idle[key];
      }
      // All four characters keep their resting ear orientation. Only head
      // movement drives a small, transient in-plane lag and return.
      secondary.leftEar=0;secondary.rightEar=0;
      Object.assign(secondary,earInertia.sample(pitch,yaw,roll,options.timeMs));
      if(localPainter){
        const pose=starFoxFollowingPose(secondary);
        if(options.idleMotion){const idle=starFoxNaturalPose(options.timeMs??0);for(const key of Object.keys(idle)as Array<keyof LocalRigPose>)pose[key]=(pose[key]??0)+(idle[key]??0);}
        localPainter.draw(portraitCtx,options.localPose??pose);
        // Treat expression residuals as the top facial layer. A moving bang
        // must not restore the original brow pixels over a raised/lowered brow.
        const facial=portraitCtx.getImageData(padX+128,padY+128,272,210),posed=ctx.getImageData(128,128,272,210);
        for(let y=0;y<210;y++)for(let x=0;x<272;x++){
          const i=(y*272+x)*4,original=((y+128)*512+x+128)*4;
          for(let ch=0;ch<3;ch++)facial.data[i+ch]=bounded(facial.data[i+ch]+posed.data[i+ch]-source.data[original+ch],0,255);
        }
        portraitCtx.putImageData(facial,padX+128,padY+128);
      }
      const moving=pitch!==0||yaw!==0||roll!==0||(!localPainter&&Object.values(secondary).some(n=>Math.abs(n)>.00001));
      target.clearRect(0,0,width,height);const scale=Math.min(width/PAINTED_FOX_VIEW.frame,height/PAINTED_FOX_VIEW.frame),ox=(width-size*scale)/2,oy=(height-size*scale)/2;
      target.save();target.translate(ox,oy);target.scale(scale,scale);
      if(options.backdrop){target.fillStyle='#f4f1e6';target.fillRect(0,0,size,size);}
      target.drawImage(moving?deformHead(pitch,yaw,roll,secondary):portrait.canvas,0,0);
      target.restore();
      return { settling: secondaryMotion.settling()||earInertia.settling() };
    },
  };
}
