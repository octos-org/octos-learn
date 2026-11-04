"""Publish avatar-only proof of real model input; no source face footage exported."""
import hashlib
import json
import shutil
from pathlib import Path

import imageio.v2 as iio
import numpy as np
from PIL import Image

source = Path('scratch/avatar-capture-validation')
out = Path('docs/avatar-animation-phase-a/real-input')
out.mkdir(parents=True, exist_ok=True)
for src, dest in [('baseline/summary.json', 'before.json'), ('after/summary.json', 'after.json'),
                  ('baseline/d10-poses.jpg', 'before-poses.jpg'), ('after/d10-poses.jpg', 'after-poses.jpg'),
                  ('after/d10.json', 'recorded-track.json'), ('requirements.txt', 'requirements.txt')]:
    shutil.copy2(source / src, out / dest)
frames = sorted((source / 'after/d10-frames').glob('*.png'))
assert len(frames) == 220
with iio.get_writer(out / 'real-input.mp4', fps=20, codec='libx264', quality=8,
                    pixelformat='yuv420p', macro_block_size=2) as writer:
    for frame in frames:
        writer.append_data(np.array(Image.open(frame).convert('RGB')))
images = [Image.open(p).convert('RGB').resize((384, 384), Image.Resampling.LANCZOS)
          for p in frames[::2]]
images[0].save(out / 'real-input.gif', save_all=True, append_images=images[1:],
               duration=100, loop=0, optimize=False)
reader = iio.get_reader(out / 'real-input.mp4')
count = sum(1 for _ in reader)
reader.close()
gif = Image.open(out / 'real-input.gif')
duration = 0
for i in range(gif.n_frames):
    gif.seek(i)
    duration += gif.info.get('duration', 0)
assert count == 220 and duration == 11000
before = json.loads((out / 'before.json').read_text())
after = json.loads((out / 'after.json').read_text())
report = {'totalRealInferences': sum(v['frames'] for v in after),
          'videoInferences': sum(v['videoFrameCount'] for v in after),
          'constructedBlankInferences': sum(v['blankFrames'] for v in after),
          'repeatedRecoveryInferences': sum(v['frames']-v['videoFrameCount']-v['blankFrames'] for v in after),
          'mp4DecodedFrames': count, 'mp4Size': [536, 536], 'mp4Fps': 20, 'gifDurationMs': duration,
          'note': 'Real MediaPipe CPU model output from public local clips, through production mapping/smoother/record/replay/painter. Python is not browser/WASM; no user camera or audio was used.',
          'selectedClipPhases': [{'startMs': 0, 'endMs': 8000, 'phase': 'public video frames'},
                                 {'startMs': 8000, 'endMs': 10000, 'phase': 'constructed blank input'},
                                 {'startMs': 10000, 'endMs': 11000, 'phase': 'repeat last real frame for reacquisition'}],
          'blinkComparison': [{'video': a['video'], 'eyes': {key: {
              'oldPaintedPeak': b['channels'][key]['displayMax'],
              'newSmoothedPeak': a['channels'][key]['displayMax'],
              'newPaintedPeak': a['channels'][key]['paintedLidMax']}
              for key in ['eyeBlinkLeft', 'eyeBlinkRight']}} for b, a in zip(before, after)]}
(out / 'report.json').write_text(json.dumps(report, indent=2)+'\n')
files = sorted(p for p in out.glob('*') if p.is_file() and p.name != 'manifest.json')
(out / 'manifest.json').write_text(json.dumps({'files': [
    {'name': p.name, 'bytes': p.stat().st_size, 'sha256': hashlib.sha256(p.read_bytes()).hexdigest()}
    for p in files]}, indent=2)+'\n')
print(json.dumps({k: report[k] for k in ['totalRealInferences','videoInferences','mp4DecodedFrames','gifDurationMs']}))
