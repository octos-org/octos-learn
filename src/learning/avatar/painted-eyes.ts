import type { FoxSurfaceFactory } from "./original-fox";

type Point = [number, number];
interface EyeProfile { rect: [number, number, number, number]; range: [number, number]; pupil: Point; upper: Point[]; lower: Point[]; closed: Point[]; }
/** Painted residuals preserve the original eye at neutral. Gaze moves the iris
 * within the eye opening; the lashes, lids and surrounding fur stay attached.
 */
const bound=(v: number)=>Math.max(0,Math.min(1,v));
const mix=(a: number,b: number,t: number)=>a+(b-a)*t;
const smooth=(v: number)=>{v=bound(v);return v*v*(3-2*v);};
const left: EyeProfile={
  rect:[134,161,118,99],range:[145,239],pupil:[198,209],
  upper:[[145,201],[157,191],[170,184],[185,181],[200,182],[214,187],[228,198],[239,211]],
  lower:[[145,201],[157,213],[170,227],[185,234],[200,235],[214,229],[228,219],[239,211]],
  closed:[[145,207],[157,214],[170,220],[185,223],[200,223],[214,220],[228,217],[239,211]],
};
const right: EyeProfile={
  rect:[274,161,115,99],range:[284,377],pupil:[326,209],
  upper:[[284,210],[293,197],[306,186],[321,181],[337,181],[350,186],[364,196],[377,199]],
  lower:[[284,210],[293,221],[306,231],[321,235],[337,232],[350,225],[364,211],[377,199]],
  closed:[[284,213],[293,218],[306,222],[321,223],[337,222],[350,218],[364,210],[377,203]],
};
function curve(points: Point[],x: number){
  for(let i=1;i<points.length;i++)if(x<=points[i][0]){
    const a=points[i-1],b=points[i],t=bound((x-a[0])/(b[0]-a[0]));
    const p=points[Math.max(0,i-2)],n=points[Math.min(points.length-1,i+1)];
    const m0=(b[1]-p[1])/(b[0]-p[0]),m1=(n[1]-a[1])/(n[0]-a[0]);
    return (2*t**3-3*t*t+1)*a[1]+(t**3-2*t*t+t)*(b[0]-a[0])*m0+(-2*t**3+3*t*t)*b[1]+(t**3-t*t)*(b[0]-a[0])*m1;
  }
  return points[points.length - 1][1];
}
function prepareEye(ctx: CanvasRenderingContext2D,original: ImageData,clean: ImageData,profile: EyeProfile){
  const [rx,ry,w,h]=profile.rect,len=w*h;
  const base=new Float32Array(len*3),upper=new Float32Array(len*4),lower=new Float32Array(len*4),iris=new Float32Array(len*4);
  const sclera=new Float32Array(len*3),pupil=new Float32Array(len*4);
  const [cx,cy]=profile.pupil;
  const white=[0,1,2].map(ch=>(original.data[((cy+1)*512+cx-33)*4+ch]+original.data[((cy+1)*512+cx+33)*4+ch])/2);
  const upperCurve=new Float32Array(w),lowerCurve=new Float32Array(w),closedCurve=new Float32Array(w);
  for(let x=0;x<w;x++){
    const px=x+rx,u=curve(profile.upper,px),l=curve(profile.lower,px),c=curve(profile.closed,px);
    upperCurve[x]=u;lowerCurve[x]=l;closedCurve[x]=c;
    for(let y=0;y<h;y++){
      const py=y+ry,k=y*w+x,i=(py*512+px)*4;
      const matte=smooth((px-profile.range[0])/4)*smooth((profile.range[1]-px)/4)*smooth((py-u+17)/4)*smooth((l+9-py)/4);
      const uWeight=bound((u+5-py)/4),lWeight=(1-uWeight)*bound((py-l+4)/4),iWeight=1-uWeight-lWeight;
      upper[k*4+3]=matte*uWeight;lower[k*4+3]=matte*lWeight;iris[k*4+3]=matte*iWeight;
      const pupilMask=smooth((1-((px-cx)/25)**2-((py-cy)/29)**2)/.18);
      pupil[k*4+3]=iris[k*4+3]*pupilMask;
      for(let ch=0;ch<3;ch++){
        const diff=original.data[i+ch]-clean.data[i+ch];
        base[k*3+ch]=original.data[i+ch]-diff*matte;
        upper[k*4+ch]=diff*upper[k*4+3];lower[k*4+ch]=diff*lower[k*4+3];iris[k*4+ch]=diff*iris[k*4+3];
        pupil[k*4+ch]=(original.data[i+ch]-white[ch])*pupil[k*4+3];
        sclera[k*3+ch]=iris[k*4+ch]-pupil[k*4+ch];
      }
    }
  }
  return {profile,w,h,base,upper,lower,iris,sclera,pupil,upperCurve,lowerCurve,closedCurve,output:ctx.createImageData(w,h)};
}
export function preparePaintedEyes(surface: FoxSurfaceFactory,source: CanvasImageSource,clean: CanvasImageSource){
  const {context:ctx}=surface(512,512);ctx.drawImage(source,0,0);const original=ctx.getImageData(0,0,512,512);
  ctx.clearRect(0,0,512,512);ctx.drawImage(clean,0,0);const cleanPixels=ctx.getImageData(0,0,512,512);
  return {left:prepareEye(ctx,original,cleanPixels,left),right:prepareEye(ctx,original,cleanPixels,right)};
}
function sample(layer: Float32Array,w: number,h: number,x: number,y: number,ch: number){
  if(x<0||x>w-1||y<0||y>h-1)return 0;
  const ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy,nx=Math.min(ix+1,w-1),ny=Math.min(iy+1,h-1);
  return mix(mix(layer[(iy*w+ix)*4+ch],layer[(iy*w+nx)*4+ch],fx),mix(layer[(ny*w+ix)*4+ch],layer[(ny*w+nx)*4+ch],fx),fy);
}
function renderEye(ctx: CanvasRenderingContext2D,eye: ReturnType<typeof prepareEye>,blink: number,squint: number,tension:number,gaze: readonly [number,number]){
  if(blink===0&&squint===0&&tension===0&&gaze[0]===0&&gaze[1]===0)return;
  const {profile,w,h,base,upper,lower,iris,sclera,pupil,upperCurve,lowerCurve,closedCurve,output}=eye;
  const dx=gaze[0]*7,dy=gaze[1]*4.5;
  const thickness=mix(1,.32,blink),lowerOpacity=1-blink;
  for(let x=0;x<w;x++){
    const u=upperCurve[x],l=lowerCurve[x],c=closedCurve[x];
    // A cheek-raised smile narrows from below; reusing blink travel looks sleepy.
    // Frowning lowers the inner upper lid into an angled, tense contour. Moving
    // only the thin eyebrows underneath the bangs was almost imperceptible.
    const inner=bound(profile===left?(x+profile.rect[0]-160)/65:(363-x-profile.rect[0])/65);
    const movedU=Math.min(c,mix(u,c,blink)+(1-blink)*(squint*2+tension*inner*18));
    const movedL=Math.max(movedU,mix(l,c,blink)-(1-blink)*squint*Math.max(0,l-c+14));
    for(let y=0;y<h;y++){
      const py=y+profile.rect[1],k=y*w+x;
      const sourceU=(py-movedU)/thickness+u-profile.rect[1],sourceL=py-movedL+l-profile.rect[1];
      // Broad at neutral so the complete partition reconstructs the source exactly.
      const visibility=blink===1?0:smooth((py-movedU+2*(1-blink))/2)*smooth((movedL+3*(1-blink)-py)/2);
      const uw=sample(upper,w,h,x,sourceU,3),lw=sample(lower,w,h,x,sourceL,3)*lowerOpacity,iw=iris[k*4+3]*visibility;
      const norm=Math.max(1,uw+lw+iw);
      const pupilAlpha=sample(pupil,w,h,x-dx,y-dy,3);
      const contained=pupilAlpha>0?Math.min(1,iris[k*4+3]/pupilAlpha):0;
      for(let ch=0;ch<3;ch++)output.data[k*4+ch]=Math.round(base[k*3+ch]+(
        sample(upper,w,h,x,sourceU,ch)+sample(lower,w,h,x,sourceL,ch)*lowerOpacity+
        (sclera[k*3+ch]+sample(pupil,w,h,x-dx,y-dy,ch)*contained)*visibility
      )/norm);
      output.data[k*4+3]=255;
    }
  }
  ctx.putImageData(output,profile.rect[0],profile.rect[1]);
}
export interface PaintedEyeState { left?: number;right?: number;leftSquint?: number;rightSquint?: number;leftTension?:number;rightTension?:number;leftGaze?: readonly [number,number];rightGaze?: readonly [number,number]; }
export function paintEyes(ctx: CanvasRenderingContext2D,rig: ReturnType<typeof preparePaintedEyes>,{left=0,right=0,leftSquint=0,rightSquint=0,leftTension=0,rightTension=0,leftGaze=[0,0],rightGaze=[0,0]}: PaintedEyeState={}){
  const gaze=(v:readonly [number,number]):[number,number]=>v.map(n=>Number.isFinite(n)?Math.max(-1,Math.min(1,n)):0)as[number,number];
  const amount=(n:number)=>bound(Number.isFinite(n)?n:0);
  renderEye(ctx,rig.left,amount(left),amount(leftSquint),amount(leftTension),gaze(leftGaze));
  renderEye(ctx,rig.right,amount(right),amount(rightSquint),amount(rightTension),gaze(rightGaze));
}
