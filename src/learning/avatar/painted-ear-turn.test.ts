import {expect,it} from 'vitest';
import {EAR_TURN,drawEarTurn,earTurnDemoValue,earTurnFrame} from './painted-ear-turn';

it('selects one bounded pose, never extrapolates or blends overlapping silhouettes',()=>{
  expect(earTurnFrame(-.4)).toBe(0);expect(earTurnFrame(NaN)).toBe(0);expect(earTurnFrame(12)).toBe(11);
  const calls:unknown[][]=[];
  const ctx={drawImage:(...args:unknown[])=>calls.push(args)} as unknown as CanvasRenderingContext2D;
  const atlas={} as CanvasImageSource;
  for(let i=0;i<12;i++){
    drawEarTurn(ctx,atlas,i/11);
    expect(calls.at(-1)).toEqual([atlas,i%4*256,Math.floor(i/4)*320,256,320,64,48,256,320]);
  }
  expect(calls).toHaveLength(EAR_TURN.frames);
});

it('holds each endpoint and returns to rest on the same deterministic comparison clock',()=>{
  expect(earTurnDemoValue(0)).toBe(0);expect(earTurnDemoValue(300)).toBe(0);
  expect(earTurnDemoValue(2000)).toBe(1);expect(earTurnDemoValue(2300)).toBe(1);
  expect(earTurnDemoValue(4000)).toBe(0);expect(earTurnDemoValue(NaN)).toBe(0);
  const seen=new Set<number>();
  for(let t=0;t<4400;t+=10){const value=earTurnDemoValue(t);expect(value).toBeGreaterThanOrEqual(0);expect(value).toBeLessThanOrEqual(1);expect(earTurnDemoValue(t+4400)).toBeCloseTo(value,12);seen.add(earTurnFrame(value));}
  expect(seen.size).toBe(12);
});
