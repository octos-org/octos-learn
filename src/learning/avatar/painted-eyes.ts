import type { FoxSurfaceFactory } from "./original-fox";

type Point = [number, number];
interface EyeProfile { rect: [number, number, number, number]; range: [number, number]; upper: Point[]; lower: Point[]; closed: Point[]; }
/** Painted-eye residual layers. Identity at neutral; only the lid layers deform.
 * Fitted to the current portrait, without independent iris/gaze movement.
 */
const bound=(v: number)=>Math.max(0,Math.min(1,v));
const mix=(a: number,b: number,t: number)=>a+(b-a)*t;
const smooth=(v: number)=>{v=bound(v);return v*v*(3-2*v);};
const left: EyeProfile={
  rect:[116,158,140,114],range:[125,235],
  upper:[[125,205],[140,203],[150,197],[160,191],[175,188],[190,188],[205,193],[218,201],[235,214]],
  lower:[[125,205],[140,212],[150,225],[160,236],[175,240],[190,240],[205,237],[218,228],[235,214]],
  closed:[[125,211],[140,216],[150,220],[160,223],[175,225],[190,225],[205,223],[218,220],[235,218]],
};
const right: EyeProfile={
  rect:[281,158,116,114],range:[291,387],
  upper:[[291,222],[300,213],[310,202],[325,193],[340,189],[355,192],[370,201],[387,207]],
  lower:[[291,222],[300,234],[310,242],[325,243],[340,241],[355,233],[370,216],[387,207]],
  closed:[[291,219],[300,222],[310,225],[325,226],[340,226],[355,223],[370,218],[387,212]],
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
  const upperCurve=new Float32Array(w),lowerCurve=new Float32Array(w),closedCurve=new Float32Array(w);
  for(let x=0;x<w;x++){
    const px=x+rx,u=curve(profile.upper,px),l=curve(profile.lower,px),c=curve(profile.closed,px);
    upperCurve[x]=u;lowerCurve[x]=l;closedCurve[x]=c;
    for(let y=0;y<h;y++){
      const py=y+ry,k=y*w+x,i=(py*512+px)*4;
      const matte=smooth((px-profile.range[0])/4)*smooth((profile.range[1]-px)/4)*smooth((py-u+13)/4)*smooth((l+9-py)/4);
      const uWeight=bound((u+5-py)/4),lWeight=(1-uWeight)*bound((py-l+4)/4),iWeight=1-uWeight-lWeight;
      upper[k*4+3]=matte*uWeight;lower[k*4+3]=matte*lWeight;iris[k*4+3]=matte*iWeight;
      for(let ch=0;ch<3;ch++){
        const diff=original.data[i+ch]-clean.data[i+ch];
        base[k*3+ch]=original.data[i+ch]-diff*matte;
        upper[k*4+ch]=diff*upper[k*4+3];lower[k*4+ch]=diff*lower[k*4+3];iris[k*4+ch]=diff*iris[k*4+3];
      }
    }
  }
  return {profile,w,h,base,upper,lower,iris,upperCurve,lowerCurve,closedCurve,output:ctx.createImageData(w,h)};
}
export function preparePaintedEyes(surface: FoxSurfaceFactory,source: CanvasImageSource,clean: CanvasImageSource){
  const {context:ctx}=surface(512,512);ctx.drawImage(source,0,0);const original=ctx.getImageData(0,0,512,512);
  ctx.clearRect(0,0,512,512);ctx.drawImage(clean,0,0);const cleanPixels=ctx.getImageData(0,0,512,512);
  return {left:prepareEye(ctx,original,cleanPixels,left),right:prepareEye(ctx,original,cleanPixels,right)};
}
function sample(layer: Float32Array,w: number,h: number,x: number,y: number,ch: number){
  if(y<0||y>h-1)return 0;
  const iy=Math.floor(y),fy=y-iy,a=(iy*w+x)*4+ch,b=(Math.min(iy+1,h-1)*w+x)*4+ch;
  return layer[a]*(1-fy)+layer[b]*fy;
}
function renderEye(ctx: CanvasRenderingContext2D,eye: ReturnType<typeof prepareEye>,blink: number){
  if(blink===0)return;
  const {profile,w,h,base,upper,lower,iris,upperCurve,lowerCurve,closedCurve,output}=eye;
  const thickness=mix(1,.32,blink),lowerOpacity=1-blink;
  for(let x=0;x<w;x++){
    const u=upperCurve[x],l=lowerCurve[x],c=closedCurve[x],movedU=mix(u,c,blink),movedL=mix(l,c,blink);
    for(let y=0;y<h;y++){
      const py=y+profile.rect[1],k=y*w+x;
      const sourceU=(py-movedU)/thickness+u-profile.rect[1],sourceL=py-movedL+l-profile.rect[1];
      // Broad at neutral so the complete partition reconstructs the source exactly.
      const visibility=blink===1?0:smooth((py-mix(u-2,c,blink))/2)*smooth((mix(l+3,c,blink)-py)/2);
      const uw=sample(upper,w,h,x,sourceU,3),lw=sample(lower,w,h,x,sourceL,3)*lowerOpacity,iw=iris[k*4+3]*visibility;
      const norm=Math.max(1,uw+lw+iw);
      for(let ch=0;ch<3;ch++)output.data[k*4+ch]=Math.round(base[k*3+ch]+(
        sample(upper,w,h,x,sourceU,ch)+sample(lower,w,h,x,sourceL,ch)*lowerOpacity+iris[k*4+ch]*visibility
      )/norm);
      output.data[k*4+3]=255;
    }
  }
  ctx.putImageData(output,profile.rect[0],profile.rect[1]);
}
export function paintEyes(ctx: CanvasRenderingContext2D,rig: ReturnType<typeof preparePaintedEyes>,{left=0,right=0}: {left?: number;right?: number}={}){
  renderEye(ctx,rig.left,bound(Number.isFinite(left)?left:0));
  renderEye(ctx,rig.right,bound(Number.isFinite(right)?right:0));
}
