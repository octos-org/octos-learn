import { expect, it } from 'vitest';
import { LOCAL_EAR_ROOT, LOCAL_EAR_ATTACHMENT, LOCAL_HAIR_CHAIN, localEarPoint, localHairPoint } from './painted-local-rig';
const distance = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1]);
it('keeps the ear attachment fixed and preserves the identity pose', () => {
  for (let n = -1; n <= 1; n += .05) expect(distance(localEarPoint(LOCAL_EAR_ROOT, n), LOCAL_EAR_ROOT)).toBeLessThan(1e-10);
  for (const p of [[130, 85], [106, 220], [230, 200]] as [number, number][]) expect(distance(localEarPoint(p, 0), p)).toBeLessThan(1e-10);
  expect(localEarPoint([130, 85], NaN)).toEqual(localEarPoint([130, 85], 0));
});

it('anchors a whole ear root region while the upper pinna moves without folds',()=>{
  let minimum=Infinity,maximum=0;
  for(let value=-.4;value<=1;value+=.05){
    for(const x of[105,130,155,180,205,230,265])for(const y of[255,270,290,307,330])expect(localEarPoint([x,y],value)).toEqual([x,y]);
    for(let y=0;y<27;y++)for(let x=0;x<20;x++){
      const p=([[88+x*9.5,72+y*10],[97.5+x*9.5,72+y*10],[88+x*9.5,82+y*10],[97.5+x*9.5,82+y*10]] as [number,number][]).map(point=>localEarPoint(point,value));
      for(const[a,b,c]of[[0,1,2],[1,3,2]]){const area=(p[b][0]-p[a][0])*(p[c][1]-p[a][1])-(p[c][0]-p[a][0])*(p[b][1]-p[a][1]);minimum=Math.min(minimum,area);maximum=Math.max(maximum,area);}
    }
  }
  expect(minimum).toBeGreaterThan(40);expect(maximum).toBeLessThan(160);
  expect(distance(localEarPoint([130,85],1),[130,85])).toBeGreaterThan(10);
});

it('keeps the upper diagonal ear/hair seam attached, including its top corner',()=>{
  for(const value of[-.4,.2,.5,.8,1])for(const point of LOCAL_EAR_ATTACHMENT){
    for(const dx of[-8,0,8])for(const dy of[-8,0,8]){
      const p:[number,number]=[point[0]+dx,point[1]+dy];expect(localEarPoint(p,value)).toEqual(p);
    }
  }
  // The previous lower-root-only test missed a 36px retreat here.
  expect(localEarPoint([251,177],1)).toEqual([251,177]);
  expect(distance(localEarPoint([130,85],1),[130,85])).toBeGreaterThan(10);
});
it('keeps both hair bones at their authored length and the root attached', () => {
  for (let n = -1; n <= 1; n += .05) {
    const p = LOCAL_HAIR_CHAIN.map(point => localHairPoint(point, n));
    expect(p[0]).toEqual(LOCAL_HAIR_CHAIN[0]);
    for (let i = 0; i < 2; i++) expect(distance(p[i], p[i + 1])).toBeCloseTo(distance(LOCAL_HAIR_CHAIN[i], LOCAL_HAIR_CHAIN[i + 1]), 9);
  }
});
it('keeps local hair triangles positive through the whole supported bend range', () => {
  let minimum = Infinity;
  for (let n = -1; n <= 1; n += .05) for (let y = 0; y < 8; y++) for (let x = 0; x < 12; x++) {
    const source: [number, number][] = [[500 + x * 8, 305 + y * 11], [508 + x * 8, 305 + y * 11], [500 + x * 8, 316 + y * 11], [508 + x * 8, 316 + y * 11]];
    const p = source.map(point => localHairPoint(point, n));
    for (const [a, b, c] of [[0, 1, 2], [1, 3, 2]]) minimum = Math.min(minimum, (p[b][0] - p[a][0]) * (p[c][1] - p[a][1]) - (p[c][0] - p[a][0]) * (p[b][1] - p[a][1]));
  }
  // The original area metric is 88. Bound compression, not only inversion.
  expect(minimum).toBeGreaterThan(40);
});
it('returns to the original hair pose without history or non-finite offsets', () => {
  const p: [number, number] = [575, 365];
  expect(localHairPoint(p, NaN)).toEqual(p);
  expect(localHairPoint(p, 100)).toEqual(localHairPoint(p, 1));
  expect(distance(localHairPoint(p, .000001), p)).toBeLessThan(.0001);
  expect(distance(localHairPoint(p, .7), p)).toBeGreaterThan(5);
});
