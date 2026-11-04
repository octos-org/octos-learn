import {tr} from '@/i18n';
import {PAINTED_FOX_ASSETS,type PaintedFaceRig} from './painted-fox';
import {DEFAULT_PAINTED_EYES,type EyeProfile} from './painted-eyes';

export type PaintedCharacterId='star-fox'|'red-panda'|'white-rabbit'|'moon-cat';
export interface PaintedCharacter {
  id:PaintedCharacterId;
  name:()=>string;
  assets:Record<keyof typeof PAINTED_FOX_ASSETS,string>;
  rig?:PaintedFaceRig;
}

/** Each portrait has its own fitted geometry. These are not recolored foxes. */
function fittedEye(index:0|1,sx:number,sy:number,dx:number,dy:number,irisRadius:[number,number],whiteOffset:number):EyeProfile {
  const original=DEFAULT_PAINTED_EYES[index],[cx,cy]=original.pupil;
  const point=([x,y]:[number,number]):[number,number]=>[Math.round(cx+(x-cx)*sx+dx),Math.round(cy+(y-cy)*sy+dy)];
  const [rx,ry,w,h]=original.rect,[x,y]=point([rx,ry]),[endX,endY]=point([rx+w,ry+h]);
  // Scale the eye contour, then restore padding for the unscaled lid feather.
  // Narrow eyes otherwise cut a residual at the texture edge and pop on blink.
  return {rect:[x,y-12,endX-x,endY-y+24],range:[point([original.range[0],cy])[0],point([original.range[1],cy])[0]],pupil:point(original.pupil),
    upper:original.upper.map(point),lower:original.lower.map(point),closed:original.closed.map(point),irisRadius,whiteOffset};
}
function assets(id:PaintedCharacterId) {
  const root=`teach-avatars/${id}/painted-v0.1/`;
  return {base:`${root}source.png`,clean:`${root}clean.png`,brows:`${root}clean.png`,mouth:PAINTED_FOX_ASSETS.mouth,extended:`${root}portrait.png`};
}

export const PAINTED_CHARACTERS:readonly PaintedCharacter[]=[
  {id:'star-fox',name:()=>tr('星狐'),assets:PAINTED_FOX_ASSETS},
  {id:'red-panda',name:()=>tr('小熊猫'),assets:assets('red-panda'),rig:{
    motion:{ears:[{root:[134,98],tip:[66,-12],width:105},{root:[397,98],tip:[452,-12],width:105}],
      restYaw:.2,looks:[{start:2,turn:.3,hold:.75,return:.5,angle:.3},{start:9,turn:.25,hold:.65,return:.55,angle:.25}],
      period:18,earGain:1,hairGain:.8,phase:0},
    eyes:[fittedEye(0,.85,.65,5,2,[18,21],27),fittedEye(1,.9,.65,1,1,[18,21],27)],
    mouth:{rect:{x:215,y:258,w:104,h:80},center:264,curve:[[233,275],[244,280],[255,280],[264,277],[275,281],[287,280],[298,275]]},
    brows:[{rect:[150,137,100,52],points:[[164,162],[182,156],[199,156],[218,161],[234,170]]},
      {rect:[277,137,103,52],points:[[289,169],[309,159],[329,155],[349,155],[366,158]]}],
  }},
  {id:'white-rabbit',name:()=>tr('白兔'),assets:assets('white-rabbit'),rig:{
    motion:{ears:[{root:[190,58],tip:[32,-147],width:105},{root:[350,58],tip:[494,-147],width:105}],
      restYaw:.2,looks:[{start:3.2,turn:.5,hold:1.6,return:.85,angle:.38},{start:10,turn:.4,hold:1.2,return:.8,angle:.3}],
      period:20,earGain:.85,hairGain:.7,phase:0},
    eyes:[fittedEye(0,1,1,-3,0,[23,28],32),fittedEye(1,1,1,-4,0,[23,28],32)],
    mouth:{rect:{x:208,y:248,w:104,h:80},center:261,curve:[[230,268],[241,273],[252,272],[261,268],[272,272],[283,273],[293,269]]},
    brows:[{rect:[143,120,101,54],points:[[151,150],[169,140],[189,137],[207,139],[225,145]]},
      {rect:[277,120,104,54],points:[[285,145],[305,137],[326,137],[348,143],[369,153]]}],
  }},
  {id:'moon-cat',name:()=>tr('月猫'),assets:assets('moon-cat'),rig:{
    motion:{ears:[{root:[118,90],tip:[52,-35],width:110},{root:[404,90],tip:[458,-35],width:110}],
      restYaw:.28,looks:[{start:1.8,turn:.14,hold:.9,return:.35,angle:.5},{start:6.5,turn:.16,hold:1.1,return:.45,angle:.42}],
      period:17,earGain:1,hairGain:1,phase:0},
    eyes:[fittedEye(0,1,1,0,1,[23,27],32),fittedEye(1,1,1,-4,1,[23,27],32)],
    mouth:{rect:{x:208,y:256,w:104,h:80},center:260,curve:[[229,275],[241,280],[252,279],[260,276],[272,280],[284,280],[292,276]]},
    brows:[{rect:[145,135,100,51],points:[[156,160],[178,155],[199,154],[218,159],[233,166]]},
      {rect:[277,135,103,51],points:[[283,166],[303,157],[325,154],[347,155],[368,162]]}],
  }},
];

export function paintedCharacter(id:string|undefined):PaintedCharacter {
  return PAINTED_CHARACTERS.find(character=>character.id===id)??PAINTED_CHARACTERS[0];
}
