/** One-eye occlusion study: stationary painted iris, moving painted eyelash strips.
 * Not a full Live2D rig. Coordinates are manually fitted to this 512px artwork.
 */
const clamp = (v, min = 0, max = 1) => Math.max(min, Math.min(max, v));
const upper = [[130,205],[140,203],[150,197],[160,191],[175,188],[190,188],[205,193],[218,201],[230,211]];
const lower = [[130,205],[140,212],[150,225],[160,236],[175,240],[190,240],[205,237],[218,228],[230,211]];
const closed = [[130,212],[140,216],[150,220],[160,223],[175,225],[190,225],[205,223],[218,220],[230,218]];
function at(points,x) {
  for(let i=1;i<points.length;i++)if(x<=points[i][0]) {
    const [a,b]=[points[i-1],points[i]],t=(x-a[0])/(b[0]-a[0]);
    const prev=points[Math.max(0,i-2)],next=points[Math.min(points.length-1,i+1)];
    const m0=(b[1]-prev[1])/(b[0]-prev[0]),m1=(next[1]-a[1])/(next[0]-a[0]);
    return (2*t**3-3*t*t+1)*a[1]+(t**3-2*t*t+t)*(b[0]-a[0])*m0+(-2*t**3+3*t*t)*b[1]+(t**3-t*t)*(b[0]-a[0])*m1;
  }
  return points.at(-1)[1];
}
const mix = (a,b,t) => a+(b-a)*t;
export function prepareBlinkStudy(createCanvas, source) {
  const canvas=createCanvas(512,512),ctx=canvas.getContext('2d');ctx.drawImage(source,0,0);
  const original=ctx.getImageData(0,0,512,512),result={};
  for(const [name,curve,radius] of [['upper',upper,8],['lower',lower,3]]) {
    const layer=createCanvas(512,512),c=layer.getContext('2d'),pixels=c.createImageData(512,512);
    for(let x=130;x<=230;x++)for(let y=Math.floor(at(curve,x)-radius);y<=Math.ceil(at(curve,x)+radius);y++) {
      const i=(y*512+x)*4,lum=(original.data[i]+original.data[i+1]+original.data[i+2])/3;
      const distance=Math.abs(y-at(curve,x)),edge=clamp(radius-distance);
      pixels.data.set(original.data.subarray(i,i+3),i);
      pixels.data[i+3]=Math.round(255*clamp((150-lum)/40)*edge);
    }
    c.putImageData(pixels,0,0);result[name]=layer;
  }
  return result;
}
export function drawBlinkStudy(ctx,images,rig,blink) {
  blink=clamp(Number.isFinite(blink)?blink:0);
  ctx.clearRect(0,0,512,512);ctx.drawImage(images.source,0,0);
  if(blink===0)return;
  ctx.save();ctx.beginPath();ctx.rect(120,160,135,110);ctx.clip();ctx.drawImage(images.face,0,0);ctx.restore();
  // The whole painted eyeball stays at its original coordinates. Only visibility changes.
  if(blink<1) {
    ctx.save();ctx.beginPath();
    for(let x=130;x<=230;x++) {
      const y=mix(at(upper,x)+3,at(closed,x),blink);
      if(x===130)ctx.moveTo(x,y);else ctx.lineTo(x,y);
    }
    for(let x=230;x>=130;x--)ctx.lineTo(x,mix(at(lower,x)+1,at(closed,x),blink));
    ctx.closePath();ctx.clip();ctx.drawImage(images.source,0,0);ctx.restore();
  }
  // Deform only the extracted painted lash, never squeeze the iris or eye-white.
  const thickness=mix(1,.32,blink);
  for(let x=130;x<230;x++) {
    const sy=at(upper,x),dy=mix(sy,at(closed,x),blink);
    ctx.drawImage(rig.upper,x,sy-9,1,18,x,dy-9*thickness,1,18*thickness);
    if(blink<1) {
      const ly=at(lower,x),ty=mix(ly,at(closed,x),blink);
      ctx.save();ctx.globalAlpha=1-blink;ctx.drawImage(rig.lower,x,ly-4,1,8,x,ty-4,1,8);ctx.restore();
    }
  }
}
