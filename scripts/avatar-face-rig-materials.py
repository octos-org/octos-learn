from pathlib import Path
from PIL import Image,ImageDraw,ImageFilter
import numpy as np,json
import argparse
parser=argparse.ArgumentParser(description='Author local facial materials; not an automatic image decomposition model.')
parser.add_argument('--output',type=Path,required=True)
parser.add_argument('--clean',type=Path,required=True)
parser.add_argument('--expression',type=Path,required=True)
args=parser.parse_args();m=args.output;m.mkdir(parents=True,exist_ok=True)
src=Image.open('docs/avatar-animation-phase-a/single-image/source.png').convert('RGBA')
clean=Image.open(args.clean).convert('RGBA').resize(src.size,Image.Resampling.LANCZOS)
expr=Image.open(args.expression).convert('RGBA').resize(src.size,Image.Resampling.LANCZOS)
# Manually authored facial masks from the SAME illustration. No body parts.
polys={
'eyeL':[(141,191),(158,180),(181,178),(206,184),(226,194),(232,217),(222,239),(194,246),(164,241),(146,225)],
'eyeR':[(296,194),(313,183),(338,181),(363,188),(375,200),(373,222),(363,240),(332,245),(307,238),(296,218)],
'browL':[(154,155),(175,145),(192,146),(213,151),(224,160),(220,170),(198,163),(178,160),(158,166)],
'browR':[(309,155),(332,148),(353,151),(369,158),(368,169),(346,163),(327,163),(310,166)],
'mouth':[(224,273),(251,270),(282,274),(311,273),(317,291),(303,308),(269,312),(239,301)]}
masks={}
for k,poly in polys.items():
 mask=Image.new('L',src.size);ImageDraw.Draw(mask).polygon(poly,fill=255);mask=mask.filter(ImageFilter.MaxFilter(7)).filter(ImageFilter.GaussianBlur(3.0));masks[k]=mask
# Only local underpainting is used, not the regenerated full face.
base=src.copy()
for k in ['eyeL','eyeR','mouth']:base=Image.composite(clean,base,masks[k])
base.save(m/'face.png');src.save(m/'source.png');clean.save(m/'clean-aligned.png');expr.save(m/'expression-aligned.png')
for k in ['eyeL','eyeR','mouth']:
 im=src.copy();im.putalpha(masks[k]);im.save(m/(k+'-open.png'))
for k in ['eyeL','eyeR','mouth']:
 im=expr.copy()
 arr=np.array(expr);rgb=arr[:,:,:3].astype(float);lum=rgb.mean(axis=2)
 # Extract only the painted eyelids / mouth, not their newly generated fur.
 if k.startswith('eye'):
  yy=np.indices(lum.shape)[0];band=np.clip(np.minimum(yy-206,236-yy)/3,0,1)
  alpha=np.clip((195-lum)/45,0,1)*np.array(masks[k])/255*band
 else:
  alpha=np.clip((210-lum)/45,0,1)*np.array(masks[k])/255
 im.putalpha(Image.fromarray(np.rint(alpha*255).astype('uint8')))
 if k=='mouth':
  shifted=Image.new('RGBA',im.size);shifted.alpha_composite(im,(10,0));im=shifted
 im.save(m/(k+'-expression.png'))
json.dump({'size':[512,512],'mask_polygons':polys,'mask_feather_sigma':3.0,'note':'Manually authored material prep; automatic See-through decomposition not run.'},open(m/'masks.json','w'),indent=2)
